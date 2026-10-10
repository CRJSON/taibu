-- Durable application runtime around Pi Core. Browser writes go through owner-checked RPCs.
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','awaiting_input','cancelling','completed','cancelled','failed')),
  input jsonb NOT NULL,
  checkpoint jsonb NOT NULL,
  public_message jsonb NOT NULL,
  billing text NOT NULL CHECK (billing IN ('charged','exempt','refunded')),
  worker_id text,
  fence bigint NOT NULL DEFAULT 0,
  lease_until timestamptz,
  cancel_requested boolean NOT NULL DEFAULT false,
  record_id uuid REFERENCES public.ming_records(id) ON DELETE SET NULL,
  event_cursor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
CREATE UNIQUE INDEX agent_one_active_conversation ON public.agent_runs(conversation_id)
  WHERE status IN ('queued','running','awaiting_input','cancelling');
CREATE INDEX agent_queue ON public.agent_runs(status, lease_until, created_at);
CREATE INDEX agent_conversation_runs ON public.agent_runs(user_id, conversation_id, created_at DESC);
CREATE TABLE public.agent_run_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_events_cursor ON public.agent_run_events(run_id, sequence);
CREATE TABLE public.agent_run_commands (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('steer','follow_up','reply')),
  message jsonb NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  UNIQUE(run_id, request_id)
);
CREATE TABLE public.agent_run_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  call_id text NOT NULL,
  tool_name text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('calculation','tool')),
  args jsonb NOT NULL,
  result jsonb NOT NULL,
  chart_payload jsonb,
  chart_id uuid,
  chart_type text,
  UNIQUE(run_id,call_id)
);
CREATE TABLE public.agent_run_credentials (
  run_id uuid PRIMARY KEY REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  ciphertext jsonb NOT NULL
);
CREATE TABLE public.agent_workers (
  id text PRIMARY KEY,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_runs_read ON public.agent_runs FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin_user());
CREATE POLICY agent_events_read ON public.agent_run_events FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.agent_runs r WHERE r.id=run_id));
CREATE POLICY agent_artifacts_read ON public.agent_run_artifacts FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.agent_runs r WHERE r.id=run_id));
CREATE POLICY agent_commands_admin ON public.agent_run_commands FOR SELECT TO authenticated USING(public.is_admin_user());
CREATE POLICY agent_credentials_admin ON public.agent_run_credentials FOR SELECT TO authenticated USING(public.is_admin_user());
CREATE POLICY agent_workers_admin ON public.agent_workers FOR SELECT TO authenticated USING(public.is_admin_user());
REVOKE ALL ON TABLE public.agent_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agent_run_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agent_run_commands FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agent_run_artifacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agent_run_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agent_workers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_runs, public.agent_run_events, public.agent_run_commands, public.agent_run_artifacts, public.agent_run_credentials, public.agent_workers TO authenticated;
GRANT ALL ON public.agent_runs, public.agent_run_events, public.agent_run_commands, public.agent_run_artifacts, public.agent_run_credentials, public.agent_workers TO service_role;

CREATE FUNCTION public.agent_require_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT coalesce(public.is_admin_user(),false) THEN
    RAISE EXCEPTION 'AGENT_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
END;
$$;
CREATE FUNCTION public.agent_require_lease(p_run_id uuid,p_worker_id text,p_fence bigint) RETURNS public.agent_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs;
BEGIN
  PERFORM public.agent_require_admin();
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR r.worker_id IS DISTINCT FROM p_worker_id OR r.fence<>p_fence
    OR r.lease_until IS NULL OR r.lease_until<=now() OR r.status NOT IN ('running','cancelling') THEN
    RAISE EXCEPTION 'AGENT_LEASE_LOST' USING ERRCODE='40001';
  END IF;
  RETURN r;
END;
$$;

CREATE FUNCTION public.agent_sync_message(p_run_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; messages jsonb; user_message jsonb; versions jsonb; previous_write text;
BEGIN
  PERFORM public.agent_require_admin();
  SELECT * INTO STRICT r FROM public.agent_runs WHERE id=p_run_id;
  SELECT coalesce(c.messages,'[]') INTO messages FROM public.conversations c WHERE c.id=r.conversation_id FOR UPDATE;
  SELECT coalesce(jsonb_agg(CASE WHEN m->>'id'=r.public_message->>'id' THEN r.public_message ELSE m END ORDER BY n),'[]')
    INTO messages FROM jsonb_array_elements(messages) WITH ORDINALITY AS items(m,n);
  IF r.input->>'replaceFromMessageId' IS NOT NULL AND r.status IN ('completed','failed','cancelled') THEN
    SELECT m INTO user_message FROM jsonb_array_elements(messages) t(m) WHERE m->>'id'=r.input#>>'{userMessage,id}';
    versions:=coalesce(user_message->'versions','[]')||jsonb_build_array(jsonb_build_object('userContent',user_message->>'content','mentions',user_message->'mentions','aiContent',r.public_message->>'content','aiAgent',r.public_message->'agent','aiMetadata',r.public_message->'metadata','createdAt',now()));
    SELECT coalesce(jsonb_agg(CASE WHEN m->>'id'=user_message->>'id' THEN m||jsonb_build_object('versions',versions,'currentVersionIndex',jsonb_array_length(versions)-1) ELSE m END ORDER BY n),'[]') INTO messages FROM jsonb_array_elements(messages) WITH ORDINALITY t(m,n);
  END IF;
  previous_write:=current_setting('taibu.agent_write',true);
  PERFORM set_config('taibu.agent_write','true',true);
  PERFORM public.replace_conversation_messages(r.conversation_id,messages);
  PERFORM set_config('taibu.agent_write',coalesce(previous_write,''),true);
END;
$$;

CREATE FUNCTION public.agent_emit(p_run_id uuid,p_type text,p_payload jsonb DEFAULT '{}') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cursor_value bigint;
BEGIN
  INSERT INTO public.agent_run_events(run_id,type,payload) VALUES(p_run_id,p_type,p_payload) RETURNING sequence INTO cursor_value;
  UPDATE public.agent_runs SET event_cursor=cursor_value WHERE id=p_run_id;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_emit(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.agent_create_run(p_id uuid,p_user_id uuid,p_conversation_id uuid,p_request_id text,p_request_hash text,p_input jsonb,p_checkpoint jsonb,p_message jsonb,p_credential jsonb,p_charge boolean)
RETURNS public.agent_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; c public.conversations; balance integer; messages jsonb; anchor_position bigint; anchor_message jsonb; old_answer jsonb; versions jsonb; previous_write text;
BEGIN
  PERFORM public.agent_require_admin();
  SELECT * INTO c FROM public.conversations WHERE id=p_conversation_id FOR UPDATE;
  IF NOT FOUND OR c.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'AGENT_CONVERSATION_NOT_FOUND' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.agent_runs WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.request_hash<>p_request_hash THEN RAISE EXCEPTION 'AGENT_REQUEST_MISMATCH' USING ERRCODE='22023'; END IF;
    RETURN r;
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_runs WHERE conversation_id=p_conversation_id AND status IN ('queued','running','awaiting_input','cancelling')) THEN
    RAISE EXCEPTION 'AGENT_CONVERSATION_BUSY' USING ERRCODE='23505';
  END IF;
  IF p_charge THEN
    balance:=public.decrement_ai_chat_count(p_user_id);
    IF balance IS NULL THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE='P0001'; END IF;
  END IF;
  INSERT INTO public.agent_runs(id,user_id,conversation_id,request_id,request_hash,input,checkpoint,public_message,billing)
    VALUES(p_id,p_user_id,p_conversation_id,p_request_id,p_request_hash,p_input,p_checkpoint,p_message,CASE WHEN p_charge THEN 'charged' ELSE 'exempt' END) RETURNING * INTO r;
  IF p_credential IS NOT NULL THEN INSERT INTO public.agent_run_credentials VALUES(p_id,p_credential); END IF;
  messages:=coalesce(c.messages,'[]');
  IF p_input->>'replaceFromMessageId' IS NOT NULL THEN
    SELECT n INTO anchor_position FROM jsonb_array_elements(messages) WITH ORDINALITY t(m,n) WHERE m->>'id'=p_input->>'replaceFromMessageId' AND m->>'role'='user';
    IF anchor_position IS NULL THEN RAISE EXCEPTION 'AGENT_EDIT_ANCHOR_NOT_FOUND'; END IF;
    anchor_message:=messages->(anchor_position::integer-1);old_answer:=messages->anchor_position::integer;
    versions:=coalesce(anchor_message->'versions','[]');
    IF jsonb_array_length(versions)=0 THEN versions:=jsonb_build_array(jsonb_build_object('userContent',anchor_message->>'content','mentions',anchor_message->'mentions','aiContent',coalesce(old_answer->>'content',''),'aiAgent',old_answer->'agent','aiMetadata',old_answer->'metadata','createdAt',anchor_message->>'createdAt','subsequentMessages',coalesce((SELECT jsonb_agg(m ORDER BY n) FROM jsonb_array_elements(messages) WITH ORDINALITY t(m,n) WHERE n>anchor_position+1),'[]'))); END IF;
    p_input:=jsonb_set(p_input,'{userMessage}',(p_input->'userMessage')||jsonb_build_object('versions',versions,'currentVersionIndex',jsonb_array_length(versions)-1));
    UPDATE public.agent_runs SET input=p_input WHERE id=p_id;
    SELECT coalesce(jsonb_agg(m ORDER BY n),'[]') INTO messages FROM jsonb_array_elements(messages) WITH ORDINALITY t(m,n) WHERE n<anchor_position;
  END IF;
  messages:=messages||jsonb_build_array(p_input->'userMessage',p_message);
  previous_write:=current_setting('taibu.agent_write',true);
  PERFORM set_config('taibu.agent_write','true',true);
  PERFORM public.replace_conversation_messages(p_conversation_id,messages);
  PERFORM set_config('taibu.agent_write',coalesce(previous_write,''),true);
  PERFORM public.agent_emit(p_id,'queued');
  SELECT * INTO r FROM public.agent_runs WHERE id=p_id;
  RETURN r;
END;
$$;

CREATE FUNCTION public.agent_worker_heartbeat(p_worker_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.agent_require_admin();
  INSERT INTO public.agent_workers VALUES(p_worker_id,now()) ON CONFLICT(id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at;
END;
$$;
CREATE FUNCTION public.agent_claim_run(p_worker_id text) RETURNS public.agent_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs;
BEGIN
  PERFORM public.agent_require_admin();
  SELECT * INTO r FROM public.agent_runs WHERE status='queued' OR (status IN ('running','cancelling') AND lease_until<now())
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.agent_runs SET status=CASE WHEN cancel_requested THEN 'cancelling' ELSE 'running' END,
    worker_id=p_worker_id,fence=fence+1,lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=r.id RETURNING * INTO r;
  PERFORM public.agent_emit(r.id,'claimed');
  SELECT * INTO r FROM public.agent_runs WHERE id=r.id;
  RETURN r;
END;
$$;
CREATE FUNCTION public.agent_renew_lease(p_run_id uuid,p_worker_id text,p_fence bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs;
BEGIN
  r:=public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  UPDATE public.agent_runs SET lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=p_run_id;
  RETURN r.cancel_requested;
END;
$$;
CREATE FUNCTION public.agent_checkpoint(p_run_id uuid,p_worker_id text,p_fence bigint,p_checkpoint jsonb,p_message jsonb,p_event jsonb,p_command bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  UPDATE public.agent_runs SET checkpoint=p_checkpoint,public_message=p_message,updated_at=now() WHERE id=p_run_id;
  IF p_command IS NOT NULL THEN UPDATE public.agent_run_commands SET consumed=true WHERE run_id=p_run_id AND sequence=p_command; END IF;
  PERFORM public.agent_emit(p_run_id,coalesce(p_event->>'type','checkpoint'),p_event);
END;
$$;
CREATE FUNCTION public.agent_cache_tool(p_run_id uuid,p_worker_id text,p_fence bigint,p_call_id text,p_tool_name text,p_kind text,p_args jsonb,p_result jsonb,p_chart jsonb DEFAULT NULL)
RETURNS public.agent_run_artifacts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.agent_run_artifacts;
BEGIN
  PERFORM public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  INSERT INTO public.agent_run_artifacts(run_id,call_id,tool_name,kind,args,result,chart_payload)
    VALUES(p_run_id,p_call_id,p_tool_name,p_kind,p_args,p_result,p_chart) ON CONFLICT(run_id,call_id) DO NOTHING;
  SELECT * INTO STRICT a FROM public.agent_run_artifacts WHERE run_id=p_run_id AND call_id=p_call_id;
  IF a.tool_name<>p_tool_name OR a.args IS DISTINCT FROM p_args OR a.kind<>p_kind THEN RAISE EXCEPTION 'AGENT_TOOL_CALL_MISMATCH'; END IF;
  RETURN a;
END;
$$;

CREATE FUNCTION public.agent_submit_command(p_run_id uuid,p_request_id text,p_mode text,p_message jsonb)
RETURNS public.agent_run_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; cmd public.agent_run_commands; messages jsonb; previous_write text;
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR (r.user_id IS DISTINCT FROM auth.uid() AND NOT coalesce(public.is_admin_user(),false) AND coalesce(auth.role(),'')<>'service_role') THEN
    RAISE EXCEPTION 'AGENT_RUN_NOT_FOUND' USING ERRCODE='42501';
  END IF;
  SELECT * INTO cmd FROM public.agent_run_commands WHERE run_id=p_run_id AND request_id=p_request_id;
  IF FOUND THEN
    IF cmd.message->>'content' IS DISTINCT FROM p_message->>'content' OR cmd.mode<>p_mode THEN RAISE EXCEPTION 'AGENT_REQUEST_MISMATCH' USING ERRCODE='22023'; END IF;
    RETURN cmd;
  END IF;
  IF r.status NOT IN ('queued','running','awaiting_input') OR r.cancel_requested THEN RAISE EXCEPTION 'AGENT_RUN_CLOSED' USING ERRCODE='22023'; END IF;
  IF p_message->>'role'<>'user' OR coalesce(btrim(p_message->>'content'),'')='' THEN RAISE EXCEPTION 'AGENT_INVALID_MESSAGE' USING ERRCODE='22023'; END IF;
  INSERT INTO public.agent_run_commands(run_id,request_id,mode,message) VALUES(p_run_id,p_request_id,p_mode,p_message) RETURNING * INTO cmd;
  SELECT coalesce(c.messages,'[]') INTO messages FROM public.conversations c WHERE c.id=r.conversation_id FOR UPDATE;
  -- This invoker is the owner (or admin), so the existing RPC remains the common write path.
  previous_write:=current_setting('taibu.agent_write',true);
  PERFORM set_config('taibu.agent_write','true',true);
  PERFORM public.replace_conversation_messages(r.conversation_id,messages||jsonb_build_array(p_message));
  PERFORM set_config('taibu.agent_write',coalesce(previous_write,''),true);
  UPDATE public.agent_runs SET status=CASE WHEN status='awaiting_input' THEN 'queued' ELSE status END,updated_at=now() WHERE id=p_run_id;
  PERFORM public.agent_emit(p_run_id,'command');
  RETURN cmd;
END;
$$;

CREATE FUNCTION public.agent_finish_run(p_run_id uuid,p_worker_id text,p_fence bigint,p_status text,p_checkpoint jsonb,p_message jsonb,p_record jsonb DEFAULT NULL)
RETURNS public.agent_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; a public.agent_run_artifacts; final_id uuid; v_chart_id uuid; chart_table text; selected text; final_status text; record_body text;
BEGIN
  r:=public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  IF p_status NOT IN ('completed','awaiting_input','failed','cancelled') THEN RAISE EXCEPTION 'AGENT_INVALID_STATUS'; END IF;
  final_status:=CASE WHEN r.cancel_requested THEN 'cancelled' ELSE p_status END;
  -- A command accepted while the final model turn was settling must be drained
  -- before success/save. Row locking makes acceptance and settlement atomic.
  IF final_status IN ('completed','awaiting_input') AND EXISTS(SELECT 1 FROM public.agent_run_commands WHERE run_id=p_run_id AND NOT consumed) THEN
    final_status:='queued';
  END IF;
  IF final_status='completed' AND p_record IS NOT NULL AND r.record_id IS NULL THEN
    record_body:=coalesce(p_record->>'content','');
    FOR selected IN SELECT jsonb_array_elements_text(coalesce(p_checkpoint->'finalArtifacts','[]')) LOOP
      SELECT * INTO a FROM public.agent_run_artifacts WHERE id=selected::uuid AND run_id=p_run_id AND kind='calculation';
      IF NOT FOUND THEN RAISE EXCEPTION 'AGENT_ARTIFACT_NOT_FOUND'; END IF;
      record_body:=record_body||E'\n\n'||coalesce(a.result->>'canonicalText','');
      IF a.chart_payload IS NOT NULL AND a.tool_name IN ('bazi','ziwei') THEN
        chart_table:=CASE WHEN a.tool_name='bazi' THEN 'bazi_charts' ELSE 'ziwei_charts' END;
        -- Serialize matching/insertion across tasks of this owner as well as within this run.
        PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(r.user_id,chart_table,a.chart_payload->>'birth_date',a.chart_payload->>'birth_time',a.chart_payload->>'gender',a.chart_payload->>'calendar_type',coalesce((a.chart_payload->>'is_leap_month')::boolean,false),a.chart_payload->>'longitude')::text,0));
        EXECUTE format('SELECT id FROM public.%I WHERE user_id=$1 AND birth_date=$2::date AND birth_time=$3 AND gender IS NOT DISTINCT FROM $4 AND calendar_type=$5 AND coalesce(is_leap_month,false)=$6 AND longitude IS NOT DISTINCT FROM $7 LIMIT 1',chart_table)
          INTO v_chart_id USING r.user_id,a.chart_payload->>'birth_date',a.chart_payload->>'birth_time',a.chart_payload->>'gender',a.chart_payload->>'calendar_type',coalesce((a.chart_payload->>'is_leap_month')::boolean,false),(a.chart_payload->>'longitude')::double precision;
        IF v_chart_id IS NULL THEN
          EXECUTE format('INSERT INTO public.%I(user_id,name,birth_date,birth_time,gender,calendar_type,is_leap_month,birth_place,longitude) VALUES($1,$2,$3::date,$4,$5,$6,$7,$8,$9) RETURNING id',chart_table)
            INTO v_chart_id USING r.user_id,a.chart_payload->>'name',a.chart_payload->>'birth_date',a.chart_payload->>'birth_time',a.chart_payload->>'gender',a.chart_payload->>'calendar_type',coalesce((a.chart_payload->>'is_leap_month')::boolean,false),a.chart_payload->>'birth_place',(a.chart_payload->>'longitude')::double precision;
          IF a.tool_name='bazi' THEN
            UPDATE public.bazi_charts SET day_master=a.chart_payload->>'day_master',day_branch=a.chart_payload->>'day_branch' WHERE id=v_chart_id;
          END IF;
        END IF;
        UPDATE public.agent_run_artifacts SET chart_id=v_chart_id,chart_type=a.tool_name WHERE id=a.id;
        p_message:=jsonb_set(p_message,'{agent,parts}',coalesce(p_message#>'{agent,parts}','[]')||jsonb_build_array(jsonb_build_object('type','artifact','id',a.id,'title',a.chart_payload->>'name','chartId',v_chart_id,'chartType',a.tool_name)));
        v_chart_id:=NULL;
      END IF;
    END LOOP;
    INSERT INTO public.ming_records(user_id,title,content,category,tags)
      VALUES(r.user_id,coalesce(nullif(p_record->>'title',''),'Agent 分析'),record_body,'general',ARRAY['Agent']) RETURNING id INTO final_id;
    r.record_id:=final_id;
    p_message:=jsonb_set(p_message,'{agent,parts}',coalesce(p_message#>'{agent,parts}','[]')||jsonb_build_array(jsonb_build_object('type','artifact','id',final_id,'title','已保存分析记录','recordId',final_id)));
  END IF;
  IF final_status IN ('failed','cancelled') AND r.billing='charged' AND coalesce(btrim(p_message->>'content'),'')='' AND r.record_id IS NULL THEN
    IF public.increment_ai_chat_count(r.user_id,1) IS NULL THEN RAISE EXCEPTION 'AGENT_REFUND_FAILED'; END IF;
    r.billing:='refunded';
  END IF;
  p_message:=jsonb_set(p_message,'{agent,status}',to_jsonb(final_status));
  UPDATE public.agent_runs SET status=final_status,checkpoint=p_checkpoint,public_message=p_message,billing=r.billing,record_id=r.record_id,
    lease_until=NULL,worker_id=NULL,updated_at=now() WHERE id=p_run_id RETURNING * INTO r;
  IF final_status IN ('completed','failed','cancelled') THEN DELETE FROM public.agent_run_credentials WHERE run_id=p_run_id; END IF;
  PERFORM public.agent_emit(p_run_id,final_status);
  PERFORM public.agent_sync_message(p_run_id);
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id;
  RETURN r;
END;
$$;

CREATE FUNCTION public.agent_cancel_run(p_run_id uuid) RETURNS public.agent_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs;
BEGIN
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND OR (r.user_id IS DISTINCT FROM auth.uid() AND NOT coalesce(public.is_admin_user(),false) AND coalesce(auth.role(),'')<>'service_role') THEN RAISE EXCEPTION 'AGENT_RUN_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF r.status IN ('completed','failed','cancelled') THEN RETURN r; END IF;
  UPDATE public.agent_runs SET cancel_requested=true,status=CASE WHEN status IN ('queued','awaiting_input') THEN 'queued' ELSE 'cancelling' END WHERE id=p_run_id RETURNING * INTO r;
  PERFORM public.agent_emit(p_run_id,'cancel_requested');
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id;
  RETURN r;
END;
$$;

-- Helpers are callable only by their definer; exposed mutations validate identity inside.
REVOKE ALL ON FUNCTION public.agent_require_admin(),public.agent_require_lease(uuid,text,bigint),public.agent_sync_message(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.agent_create_run(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,boolean),public.agent_worker_heartbeat(text),public.agent_claim_run(text),public.agent_renew_lease(uuid,text,bigint),public.agent_checkpoint(uuid,text,bigint,jsonb,jsonb,jsonb,bigint),public.agent_cache_tool(uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb),public.agent_submit_command(uuid,text,text,jsonb),public.agent_finish_run(uuid,text,bigint,text,jsonb,jsonb,jsonb),public.agent_cancel_run(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_create_run(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,boolean),public.agent_worker_heartbeat(text),public.agent_claim_run(text),public.agent_renew_lease(uuid,text,bigint),public.agent_checkpoint(uuid,text,bigint,jsonb,jsonb,jsonb,bigint),public.agent_cache_tool(uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb),public.agent_submit_command(uuid,text,text,jsonb),public.agent_finish_run(uuid,text,bigint,text,jsonb,jsonb,jsonb),public.agent_cancel_run(uuid) TO authenticated,service_role;

-- Bind existing search RPCs to the leased task owner. JWT settings are local to
-- this transaction and restored even on failure; callers cannot choose an owner.
CREATE FUNCTION public.agent_search_knowledge(p_run_id uuid,p_worker_id text,p_fence bigint,p_method text,p_args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE r public.agent_runs; result jsonb; previous_sub text; previous_claims text; kb_ids uuid[]; query_text text; max_rows integer;
BEGIN
  r:=public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=r.user_id AND u.membership IN ('plus','pro') AND (u.membership_expires_at IS NULL OR u.membership_expires_at>now())) THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_method='vector' AND NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=r.user_id AND u.membership='pro') THEN RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT array_agg(v::uuid) INTO kb_ids FROM jsonb_array_elements_text(nullif(p_args->'p_kb_ids','null'::jsonb)) AS t(v);
  query_text:=p_args->>'p_query'; max_rows:=coalesce((p_args->>'p_limit')::integer,20);
  IF max_rows<1 OR max_rows>100 THEN RAISE EXCEPTION 'INVALID_SEARCH_LIMIT'; END IF;
  previous_sub:=current_setting('request.jwt.claim.sub',true); previous_claims:=current_setting('request.jwt.claims',true);
  PERFORM set_config('request.jwt.claim.sub',r.user_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r.user_id,'role','authenticated')::text,true);
  BEGIN
    CASE p_method
      WHEN 'fts' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM public.search_knowledge_fts(query_text,kb_ids,max_rows,coalesce(p_args->>'p_config','simple')) q;
      WHEN 'trigram' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM public.search_knowledge_trigram(query_text,kb_ids,max_rows,coalesce((p_args->>'p_threshold')::real,0.3)) q;
      WHEN 'vector' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM public.search_knowledge_vector(ARRAY(SELECT v::float8 FROM jsonb_array_elements_text(p_args->'p_query_vector') t(v)),kb_ids,max_rows,(p_args->>'p_dim')::integer) q;
      WHEN 'weights' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',kb.id,'weight',kb.weight)),'[]') INTO result FROM public.knowledge_bases kb WHERE kb.user_id=r.user_id AND kb.id=ANY(kb_ids);
      ELSE RAISE EXCEPTION 'INVALID_SEARCH_METHOD';
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true); PERFORM set_config('request.jwt.claims',coalesce(previous_claims,''),true); RAISE;
  END;
  PERFORM set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true); PERFORM set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_search_knowledge(uuid,text,bigint,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_search_knowledge(uuid,text,bigint,text,jsonb) TO authenticated,service_role;

CREATE FUNCTION public.agent_protect_conversation_messages() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF OLD.messages IS DISTINCT FROM NEW.messages AND coalesce(current_setting('taibu.agent_write',true),'')<>'true'
    AND EXISTS(SELECT 1 FROM public.agent_runs WHERE conversation_id=OLD.id AND status IN ('queued','running','awaiting_input','cancelling')) THEN
    RAISE EXCEPTION 'AGENT_CONVERSATION_BUSY' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_protect_conversation_messages() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER agent_conversation_message_guard BEFORE UPDATE OF messages ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.agent_protect_conversation_messages();

CREATE FUNCTION public.agent_protect_normalized_messages() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target_id uuid;
BEGIN
  IF coalesce(current_setting('taibu.agent_write',true),'')<>'true' THEN
    target_id:=CASE WHEN TG_OP='DELETE' THEN OLD.conversation_id ELSE NEW.conversation_id END;
    IF EXISTS(SELECT 1 FROM public.agent_runs r JOIN public.conversations c ON c.id=r.conversation_id
      WHERE r.conversation_id=target_id AND r.status IN ('queued','running','awaiting_input','cancelling'))
      OR (TG_OP='UPDATE' AND OLD.conversation_id IS DISTINCT FROM NEW.conversation_id AND EXISTS(SELECT 1 FROM public.agent_runs r JOIN public.conversations c ON c.id=r.conversation_id
      WHERE r.conversation_id=OLD.conversation_id AND r.status IN ('queued','running','awaiting_input','cancelling'))) THEN
      RAISE EXCEPTION 'AGENT_CONVERSATION_BUSY' USING ERRCODE='23505';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_protect_normalized_messages() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER agent_normalized_message_guard BEFORE INSERT OR UPDATE OR DELETE ON public.conversation_messages FOR EACH ROW EXECUTE FUNCTION public.agent_protect_normalized_messages();
