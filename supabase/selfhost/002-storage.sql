-- Local avatar policy contract, applied ONLY after the real Storage migrations.
-- Caller MUST wrap this script in one transaction. No storage table emulation.
-- Application evidence: src/app/api/supabase/storage/route.ts and
-- src/lib/user/profile.ts use <auth uid>-<timestamp>.<extension>, max 2 MiB.
SET LOCAL search_path = pg_catalog;
DO $$ BEGIN
  IF current_user <> 'postgres' OR to_regclass('storage.buckets') IS NULL
    OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Storage must migrate its real schema before avatar policies';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars') THEN
    RAISE EXCEPTION 'Avatar bootstrap requires a fresh bucket; use the stack fingerprint guard for reuse';
  END IF;
END $$;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152,
  ARRAY['image/png','image/jpeg','image/webp','image/gif','image/avif']);
-- A deliberately narrower local allowlist than image/* excludes active SVG.
-- Storage enforces payload size and MIME; RLS enforces identity/object naming.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
CREATE POLICY selfhost_avatar_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND name LIKE (SELECT auth.uid())::text || '-%');
CREATE POLICY selfhost_avatar_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars'
    AND name LIKE (SELECT auth.uid())::text || '-%'
    AND name ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$'
    AND position('..' IN name) = 0);
CREATE POLICY selfhost_avatar_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND name LIKE (SELECT auth.uid())::text || '-%')
  WITH CHECK (bucket_id = 'avatars'
    AND name LIKE (SELECT auth.uid())::text || '-%'
    AND name ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$'
    AND position('..' IN name) = 0);
CREATE POLICY selfhost_avatar_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND name LIKE (SELECT auth.uid())::text || '-%');
-- Public avatar downloads use Storage's public bucket endpoint; no anonymous
-- object metadata/list or write policy is granted here.
NOTIFY pgrst, 'reload schema';
SELECT public.configure_agent_attachment_storage();
