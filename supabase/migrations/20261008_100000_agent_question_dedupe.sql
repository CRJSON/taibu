-- A question answer is a durable business command.  A second tab may lose the
-- first tab's clientRequestId, so the run lock must also deduplicate by the
-- stable question id and the complete answer payload.
CREATE OR REPLACE FUNCTION public.agent_submit_command(p_run_id uuid,p_request_id text,p_mode text,p_message jsonb)
RETURNS public.agent_run_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; cmd public.agent_run_commands; messages jsonb; previous_write text; question_id text;
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
  question_id:=NULLIF(p_message#>>'{metadata,agentQuestionId}','');
  IF p_mode='reply' AND question_id IS NOT NULL THEN
    SELECT * INTO cmd
      FROM public.agent_run_commands c
     WHERE c.run_id=p_run_id
       AND c.mode='reply'
       AND c.delivery_state<>'cancelled'
       AND coalesce(c.original_message,c.message)#>>'{metadata,agentQuestionId}'=question_id
       AND coalesce(c.original_message,c.message)->>'content' IS NOT DISTINCT FROM p_message->>'content'
       AND coalesce(c.original_message,c.message)->'metadata'->'agentAnswers' IS NOT DISTINCT FROM p_message->'metadata'->'agentAnswers'
       AND coalesce(c.original_message,c.message)->'attachments' IS NOT DISTINCT FROM p_message->'attachments'
     ORDER BY c.sequence
     LIMIT 1;
    IF FOUND THEN RETURN cmd; END IF;
    IF EXISTS (
      SELECT 1 FROM public.agent_run_commands c
       WHERE c.run_id=p_run_id AND c.mode='reply' AND c.delivery_state<>'cancelled'
         AND coalesce(c.original_message,c.message)#>>'{metadata,agentQuestionId}'=question_id
    ) THEN
      RAISE EXCEPTION 'AGENT_QUESTION_ALREADY_ANSWERED' USING ERRCODE='40001';
    END IF;
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
