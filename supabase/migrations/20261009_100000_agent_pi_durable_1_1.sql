BEGIN;
-- Pi Durable 1.1.0 engine generation. New workers and new runs record
-- pi-durable/1.1.0; checkpoints written before the upgrade keep their recorded
-- pi-durable/1.0.4 marker. A worker may claim native (V2) runs of its own
-- generation or older, never a newer one: the upgraded worker resumes
-- in-flight runs, while a stale binary cannot adopt a run it does not
-- understand.
CREATE OR REPLACE FUNCTION public.agent_worker_heartbeat(p_worker_id text,p_engine text DEFAULT 'pi-agent-core/1.0.2')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.agent_require_admin();
  IF p_engine NOT IN ('pi-agent-core/1.0.2','pi-durable/1.0.4','pi-durable/1.1.0') THEN
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
        checkpoint->>'version'='2' AND (
          (worker_engine='pi-durable/1.1.0' AND checkpoint#>>'{durable,engine}' IN ('pi-durable/1.0.4','pi-durable/1.1.0')) OR
          (worker_engine='pi-durable/1.0.4' AND checkpoint#>>'{durable,engine}'='pi-durable/1.0.4'))))
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
REVOKE ALL ON FUNCTION public.agent_worker_heartbeat(text,text),public.agent_claim_run(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_worker_heartbeat(text,text),public.agent_claim_run(text) TO authenticated,service_role;
COMMIT;
