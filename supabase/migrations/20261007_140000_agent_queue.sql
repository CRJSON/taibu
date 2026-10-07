ALTER TABLE public.agent_run_commands
  ADD COLUMN revision integer NOT NULL DEFAULT 1,
  ADD COLUMN sort_order bigint,
  ADD COLUMN delivery_state text NOT NULL DEFAULT 'pending' CHECK(delivery_state IN ('pending','claimed','admitted','consumed','cancelled')),
  ADD COLUMN original_message jsonb,
  ADD COLUMN original_mode text;
UPDATE public.agent_run_commands SET sort_order=sequence*1024,original_message=message,original_mode=mode,
  delivery_state=CASE WHEN consumed THEN 'consumed' WHEN durable_admitted THEN 'admitted' ELSE 'pending' END;
ALTER TABLE public.agent_run_commands ALTER COLUMN sort_order SET NOT NULL;

CREATE OR REPLACE FUNCTION public.agent_submit_command(p_run_id uuid,p_request_id text,p_mode text,p_message jsonb)
RETURNS public.agent_run_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; cmd public.agent_run_commands; messages jsonb; previous_write text;
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR (r.user_id IS DISTINCT FROM auth.uid() AND NOT coalesce(public.is_admin_user(),false) AND coalesce(auth.role(),'')<>'service_role') THEN
    RAISE EXCEPTION 'AGENT_RUN_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  SELECT * INTO cmd FROM public.agent_run_commands WHERE run_id=p_run_id AND request_id=p_request_id;
  IF FOUND THEN
    IF cmd.original_message->>'content' IS DISTINCT FROM p_message->>'content' OR cmd.original_mode<>p_mode
      OR cmd.original_message#>'{metadata,agentAnswers}' IS DISTINCT FROM p_message#>'{metadata,agentAnswers}'
      OR cmd.original_message->'attachments' IS DISTINCT FROM p_message->'attachments' THEN
      RAISE EXCEPTION 'AGENT_REQUEST_MISMATCH' USING ERRCODE='22023';
    END IF;
    RETURN cmd;
  END IF;
  IF r.status NOT IN ('queued','running','awaiting_input') OR r.cancel_requested THEN RAISE EXCEPTION 'AGENT_RUN_CLOSED' USING ERRCODE='22023'; END IF;
  IF p_mode NOT IN ('steer','follow_up','reply') OR p_message->>'role'<>'user' OR coalesce(btrim(p_message->>'content'),'')='' OR length(p_message->>'content')>32000 THEN RAISE EXCEPTION 'AGENT_INVALID_MESSAGE' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public.agent_run_commands WHERE run_id=p_run_id AND NOT consumed)>=50 THEN RAISE EXCEPTION 'AGENT_QUEUE_FULL' USING ERRCODE='22023'; END IF;
  IF p_mode='reply' AND r.checkpoint->>'questionId' IS NOT NULL AND r.checkpoint->>'questionId' IS DISTINCT FROM p_message#>>'{metadata,agentQuestionId}' THEN RAISE EXCEPTION 'AGENT_QUESTION_CHANGED' USING ERRCODE='40001'; END IF;
  INSERT INTO public.agent_run_commands(run_id,request_id,mode,message,original_message,original_mode,sort_order)
    VALUES(p_run_id,p_request_id,p_mode,p_message,p_message,p_mode,(SELECT coalesce(max(sort_order),0)+1024 FROM public.agent_run_commands WHERE run_id=p_run_id)) RETURNING * INTO cmd;
  -- Pending inputs stay in the business queue until the worker freezes them.
  UPDATE public.agent_runs SET status=CASE WHEN status='awaiting_input' AND p_mode='reply' THEN 'queued' ELSE status END,updated_at=now() WHERE id=p_run_id;
  PERFORM public.agent_emit(p_run_id,'command');
  RETURN cmd;
END;
$$;

CREATE FUNCTION public.agent_claim_command(p_run_id uuid,p_worker_id text,p_fence bigint,p_sequence bigint)
RETURNS public.agent_run_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; cmd public.agent_run_commands; messages jsonb; previous_write text;
BEGIN
  r:=public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  IF r.cancel_requested THEN RETURN NULL; END IF;
  SELECT * INTO cmd FROM public.agent_run_commands WHERE run_id=p_run_id AND sequence=p_sequence FOR UPDATE;
  IF NOT FOUND OR cmd.delivery_state NOT IN ('pending','claimed') THEN RETURN NULL; END IF;
  IF cmd.delivery_state='pending' THEN UPDATE public.agent_run_commands SET delivery_state='claimed',revision=revision+1 WHERE sequence=p_sequence RETURNING * INTO cmd; END IF;
  SELECT coalesce(c.messages,'[]') INTO messages FROM public.conversations c WHERE c.id=r.conversation_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(messages) m WHERE m->>'id'=cmd.message->>'id') THEN
    previous_write:=current_setting('taibu.agent_write',true); PERFORM set_config('taibu.agent_write','true',true);
    PERFORM public.replace_conversation_messages(r.conversation_id,messages||jsonb_build_array(cmd.message));
    PERFORM set_config('taibu.agent_write',coalesce(previous_write,''),true);
  END IF;
  PERFORM public.agent_emit(p_run_id,'command_claimed');
  RETURN cmd;
END;
$$;

CREATE FUNCTION public.agent_change_command(p_run_id uuid,p_sequence bigint,p_revision integer,p_action text,p_payload jsonb DEFAULT '{}')
RETURNS public.agent_run_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; cmd public.agent_run_commands;
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'AGENT_RUN_NOT_FOUND' USING ERRCODE='42501'; END IF;
  SELECT * INTO cmd FROM public.agent_run_commands WHERE run_id=p_run_id AND sequence=p_sequence FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENT_COMMAND_NOT_FOUND'; END IF;
  IF cmd.delivery_state<>'pending' OR cmd.revision<>p_revision OR r.cancel_requested OR r.status NOT IN ('queued','running','awaiting_input') THEN RAISE EXCEPTION 'AGENT_COMMAND_LOCKED' USING ERRCODE='40001'; END IF;
  IF p_action='edit' THEN
    IF coalesce(btrim(p_payload->>'content'),'')='' OR length(p_payload->>'content')>32000 THEN RAISE EXCEPTION 'AGENT_INVALID_MESSAGE'; END IF;
    cmd.message:=jsonb_set(cmd.message,'{content}',to_jsonb(p_payload->>'content'));
  ELSIF p_action='withdraw' THEN cmd.delivery_state:='cancelled'; cmd.consumed:=true;
  ELSIF p_action='order' THEN
    IF jsonb_typeof(p_payload->'sortOrder')<>'number' OR abs((p_payload->>'sortOrder')::numeric)>9007199254740991 THEN RAISE EXCEPTION 'AGENT_INVALID_ORDER'; END IF;
    cmd.sort_order:=(p_payload->>'sortOrder')::bigint;
  ELSIF p_action='promote' THEN
    IF cmd.mode='reply' THEN RAISE EXCEPTION 'AGENT_QUESTION_REPLY_LOCKED'; END IF;
    cmd.mode:='steer'; SELECT coalesce(min(sort_order),0)-1024 INTO cmd.sort_order FROM public.agent_run_commands WHERE run_id=p_run_id;
  ELSE RAISE EXCEPTION 'AGENT_INVALID_ACTION'; END IF;
  UPDATE public.agent_run_commands SET message=cmd.message,mode=cmd.mode,delivery_state=cmd.delivery_state,consumed=cmd.consumed,sort_order=cmd.sort_order,revision=revision+1 WHERE sequence=p_sequence RETURNING * INTO cmd;
  PERFORM public.agent_emit(p_run_id,'queue_changed');
  RETURN cmd;
END;
$$;

CREATE FUNCTION public.agent_command_delivery_state() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.delivery_state<>'cancelled' THEN
    IF NEW.consumed THEN NEW.delivery_state:='consumed'; ELSIF NEW.durable_admitted THEN NEW.delivery_state:='admitted'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_command_delivery BEFORE UPDATE ON public.agent_run_commands FOR EACH ROW EXECUTE FUNCTION public.agent_command_delivery_state();
CREATE FUNCTION public.agent_cancel_pending_commands() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.cancel_requested OR NEW.status IN ('cancelled','failed') THEN
    UPDATE public.agent_run_commands SET consumed=true,delivery_state='cancelled',revision=revision+1 WHERE run_id=NEW.id AND (delivery_state='pending' OR (NEW.status IN ('cancelled','failed') AND delivery_state='claimed' AND NOT durable_admitted));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_cancel_pending AFTER UPDATE OF cancel_requested,status ON public.agent_runs FOR EACH ROW EXECUTE FUNCTION public.agent_cancel_pending_commands();
REVOKE ALL ON FUNCTION public.agent_claim_command(uuid,text,bigint,bigint),public.agent_change_command(uuid,bigint,integer,text,jsonb),public.agent_command_delivery_state(),public.agent_cancel_pending_commands() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.agent_claim_command(uuid,text,bigint,bigint) TO service_role,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_change_command(uuid,bigint,integer,text,jsonb) TO authenticated;
