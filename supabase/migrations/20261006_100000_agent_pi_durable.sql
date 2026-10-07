-- Pi Durable commit log. Each run is one storage and has exactly one lease owner.
CREATE TABLE public.agent_durable_commits (
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  sequence bigint NOT NULL CHECK(sequence > 0),
  writes jsonb NOT NULL CHECK(jsonb_typeof(writes)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,sequence)
);
ALTER TABLE public.agent_durable_commits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_durable_commits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_durable_commits TO service_role;
ALTER TABLE public.agent_workers ADD COLUMN engine text NOT NULL DEFAULT 'pi-agent-core/1.0.2';
ALTER TABLE public.agent_run_commands ADD COLUMN durable_admitted boolean NOT NULL DEFAULT false;

DROP FUNCTION public.agent_worker_heartbeat(text);
CREATE FUNCTION public.agent_worker_heartbeat(p_worker_id text,p_engine text DEFAULT 'pi-agent-core/1.0.2')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.agent_require_admin();
  IF p_engine NOT IN ('pi-agent-core/1.0.2','pi-durable/1.0.4') THEN
    RAISE EXCEPTION 'AGENT_ENGINE_UNSUPPORTED' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.agent_workers(id,heartbeat_at,engine) VALUES(p_worker_id,now(),p_engine)
    ON CONFLICT(id) DO UPDATE SET heartbeat_at=excluded.heartbeat_at,engine=excluded.engine;
END;
$$;
CREATE OR REPLACE FUNCTION public.agent_claim_run(p_worker_id text) RETURNS public.agent_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; worker_engine text;
BEGIN
  PERFORM public.agent_require_admin();
  SELECT engine INTO worker_engine FROM public.agent_workers WHERE id=p_worker_id;
  SELECT * INTO r FROM public.agent_runs
    WHERE (status='queued' OR (status IN ('running','cancelling') AND lease_until<now()))
      AND (coalesce(checkpoint->>'version','1')='1' OR (
        checkpoint->>'version'='2' AND worker_engine='pi-durable/1.0.4'
        AND checkpoint#>>'{durable,engine}'='pi-durable/1.0.4'))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.agent_runs SET status=CASE WHEN cancel_requested THEN 'cancelling' ELSE 'running' END,
    worker_id=p_worker_id,fence=fence+1,lease_until=now()+interval '60 seconds',updated_at=now()
    WHERE id=r.id RETURNING * INTO r;
  PERFORM public.agent_emit(r.id,'claimed');
  SELECT * INTO r FROM public.agent_runs WHERE id=r.id;
  RETURN r;
END;
$$;

CREATE FUNCTION public.agent_durable_read(p_run_id uuid,p_worker_id text,p_fence bigint,p_after bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  IF p_after<0 THEN RAISE EXCEPTION 'AGENT_DURABLE_CURSOR_INVALID' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('sequence',c.sequence,'writes',c.writes) ORDER BY c.sequence),'[]')
    INTO result FROM (SELECT sequence,writes FROM public.agent_durable_commits
      WHERE run_id=p_run_id AND sequence>p_after ORDER BY sequence LIMIT 200) c;
  RETURN result;
END;
$$;

CREATE FUNCTION public.agent_durable_commit(p_run_id uuid,p_worker_id text,p_fence bigint,p_sequence bigint,p_writes jsonb,p_checkpoint jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing jsonb; previous bigint; w jsonb; command_sequence bigint;
BEGIN
  PERFORM public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  IF p_sequence<1 OR jsonb_typeof(p_writes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'AGENT_DURABLE_COMMIT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT writes INTO existing FROM public.agent_durable_commits WHERE run_id=p_run_id AND sequence=p_sequence;
  IF FOUND THEN
    IF existing IS DISTINCT FROM p_writes THEN RAISE EXCEPTION 'AGENT_DURABLE_CONFLICT' USING ERRCODE='40001'; END IF;
    RETURN p_sequence;
  END IF;
  SELECT coalesce(max(sequence),0) INTO previous FROM public.agent_durable_commits WHERE run_id=p_run_id;
  IF p_sequence<>previous+1 THEN RAISE EXCEPTION 'AGENT_DURABLE_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO public.agent_durable_commits(run_id,sequence,writes) VALUES(p_run_id,p_sequence,p_writes);
  UPDATE public.agent_runs SET checkpoint=p_checkpoint,updated_at=now() WHERE id=p_run_id;
  -- Admission alone is not consumption. Pi records a placed submission before
  -- advancing its model task; acknowledge the matching outer command atomically.
  FOR w IN SELECT value FROM jsonb_array_elements(p_writes) LOOP
    IF w->>'type'='submission'
      AND w#>>'{value,requestId}' ~ '^command:[0-9]+$' THEN
      command_sequence:=substring(w#>>'{value,requestId}' FROM 9)::bigint;
      UPDATE public.agent_run_commands SET durable_admitted=true,
        consumed=consumed OR w#>>'{value,status}' IN ('placed','done')
        WHERE run_id=p_run_id AND sequence=command_sequence;
    END IF;
  END LOOP;
  RETURN p_sequence;
END;
$$;

-- A pending native question can hold admitted inputs until its ToolTasks finish.
-- Leave those runs awaiting the next human reply instead of repeatedly claiming
-- the same queued run. Unadmitted late commands still trigger a new lease owner.
DO $migration$
DECLARE definition text;
  old_guard text := 'IF final_status IN (''completed'',''awaiting_input'') AND EXISTS(SELECT 1 FROM public.agent_run_commands WHERE run_id=p_run_id AND NOT consumed) THEN';
  new_guard text := 'IF final_status IN (''completed'',''awaiting_input'') AND EXISTS(SELECT 1 FROM public.agent_run_commands WHERE run_id=p_run_id AND NOT consumed AND NOT (final_status=''awaiting_input'' AND p_checkpoint#>>''{durable,engine}''=''pi-durable/1.0.4'' AND durable_admitted)) THEN';
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.agent_finish_run(uuid,text,bigint,text,jsonb,jsonb,jsonb)'::regprocedure) INTO definition;
  IF position(old_guard IN definition)=0 THEN RAISE EXCEPTION 'Review changed agent_finish_run command guard before migrating'; END IF;
  EXECUTE replace(definition,old_guard,new_guard);
END;
$migration$;

REVOKE ALL ON FUNCTION public.agent_worker_heartbeat(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.agent_durable_read(uuid,text,bigint,bigint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.agent_durable_commit(uuid,text,bigint,bigint,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_worker_heartbeat(text,text),
  public.agent_durable_read(uuid,text,bigint,bigint),
  public.agent_durable_commit(uuid,text,bigint,bigint,jsonb,jsonb) TO authenticated,service_role;
