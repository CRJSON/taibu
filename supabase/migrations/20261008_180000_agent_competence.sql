BEGIN;
CREATE TABLE public.user_agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 2000),
  kind text NOT NULL DEFAULT 'preference' CHECK (kind IN ('preference','context')),
  fingerprint text GENERATED ALWAYS AS (md5(content)) STORED,
  source_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  source_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,fingerprint)
);
ALTER TABLE public.user_agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_agent_memory_owner ON public.user_agent_memory FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY user_agent_memory_worker_read ON public.user_agent_memory FOR SELECT TO authenticated USING (public.is_admin_user());
REVOKE ALL ON TABLE public.user_agent_memory FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_agent_memory TO authenticated;

CREATE FUNCTION public.agent_memory_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN PERFORM public.agent_require_admin(); END IF;
  IF NEW.source_run_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.agent_runs WHERE id=NEW.source_run_id AND user_id=NEW.user_id) THEN RAISE EXCEPTION 'AGENT_MEMORY_SOURCE_OWNER'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,910));
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM public.user_agent_memory WHERE user_id=NEW.user_id AND fingerprint=md5(NEW.content)) AND (SELECT count(*) FROM public.user_agent_memory WHERE user_id=NEW.user_id)>=128 THEN RAISE EXCEPTION 'AGENT_MEMORY_LIMIT'; END IF;
  NEW.updated_at:=now(); RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_memory_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER agent_memory_guard BEFORE INSERT OR UPDATE ON public.user_agent_memory FOR EACH ROW EXECUTE FUNCTION public.agent_memory_guard();

CREATE FUNCTION public.agent_write_memory(p_run_id uuid,p_worker_id text,p_fence bigint,p_title text,p_content text,p_kind text,p_evidence text)
RETURNS public.user_agent_memory LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; m public.user_agent_memory;
BEGIN
  r:=public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  IF r.cancel_requested THEN RAISE EXCEPTION 'AGENT_CANCELLED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_settings WHERE user_id=r.user_id AND chat_preferences->>'memoryEnabled'='true') THEN RAISE EXCEPTION 'AGENT_MEMORY_DISABLED'; END IF;
  IF p_evidence IS NULL OR p_content IS NULL OR p_title IS NULL OR length(btrim(p_evidence))<8 OR length(p_evidence)>500 OR btrim(p_content)<>btrim(p_evidence) OR ((r.input->'userMessage'->>'role' IS DISTINCT FROM 'user' OR strpos(coalesce(r.input->'userMessage'->>'content',''),p_evidence)=0) AND NOT EXISTS(SELECT 1 FROM public.agent_run_commands WHERE run_id=r.id AND message->>'role'='user' AND delivery_state IN ('admitted','consumed') AND strpos(message->>'content',p_evidence)>0)) THEN RAISE EXCEPTION 'AGENT_MEMORY_EVIDENCE_REQUIRED'; END IF;
  INSERT INTO public.user_agent_memory(user_id,title,content,kind,source_run_id,source_text)
  VALUES(r.user_id,btrim(p_title),btrim(p_content),p_kind,r.id,p_evidence)
  ON CONFLICT(user_id,fingerprint) DO UPDATE SET title=excluded.title,kind=excluded.kind,source_run_id=excluded.source_run_id,source_text=excluded.source_text,updated_at=now()
  RETURNING * INTO m;
  RETURN m;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_write_memory(uuid,text,bigint,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_write_memory(uuid,text,bigint,text,text,text,text) TO authenticated;
COMMIT;
