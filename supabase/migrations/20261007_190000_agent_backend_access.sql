-- The application uses an authenticated system administrator session for backend I/O.
-- Keep ordinary callers read-only and reuse the existing protected admin predicate.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_attachments TO authenticated;
CREATE POLICY attachment_backend_admin ON public.agent_attachments FOR ALL TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
GRANT SELECT ON public.agent_attachment_refs TO authenticated;
CREATE POLICY attachment_refs_backend_read ON public.agent_attachment_refs FOR SELECT TO authenticated
  USING (public.is_admin_user());
CREATE POLICY briefing_backend_read ON public.daily_briefing_jobs FOR SELECT TO authenticated
  USING (public.is_admin_user());
GRANT EXECUTE ON FUNCTION public.claim_agent_attachment_cleanup(integer),
  public.claim_daily_briefings(integer,boolean), public.settle_daily_briefing(uuid,uuid,text,text),
  public.deliver_daily_briefing_notices(integer) TO authenticated;

-- Only migration owners can invoke the shared Storage setup. A fresh local stack
-- runs it after Storage creates its real tables; an existing stack runs it here.
CREATE FUNCTION public.configure_agent_attachment_storage() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('agent-attachments','agent-attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','text/plain'])
  ON CONFLICT(id) DO NOTHING;
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='agent-attachments' AND public) THEN
    RAISE EXCEPTION 'Agent attachment bucket must be private';
  END IF;
  GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='agent_attachment_backend') THEN
    CREATE POLICY agent_attachment_backend ON storage.objects FOR ALL TO authenticated
      USING (bucket_id='agent-attachments' AND public.is_admin_user())
      WITH CHECK (bucket_id='agent-attachments' AND public.is_admin_user());
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.configure_agent_attachment_storage() FROM public,anon,authenticated,service_role;
SELECT public.configure_agent_attachment_storage();
NOTIFY pgrst, 'reload schema';
