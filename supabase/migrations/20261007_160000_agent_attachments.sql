DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('agent-attachments','agent-attachments',false,10485760,ARRAY['image/jpeg','image/png','image/webp','text/plain']) ON CONFLICT(id) DO NOTHING;
 END IF;
END $$;
CREATE TABLE public.agent_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 object_path text NOT NULL UNIQUE, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('image','text')),
 mime_type text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=10485760), sha256 text NOT NULL,
 width integer, height integer, status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','ready','deleting')),
 created_at timestamptz NOT NULL DEFAULT now(), orphaned_at timestamptz DEFAULT now()
);
CREATE TABLE public.agent_attachment_refs (
 attachment_id uuid NOT NULL REFERENCES public.agent_attachments(id) ON DELETE CASCADE,
 conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
 command_sequence bigint REFERENCES public.agent_run_commands(sequence) ON DELETE CASCADE,
 CHECK((conversation_id IS NULL)<>(command_sequence IS NULL))
);
CREATE UNIQUE INDEX agent_attachment_conversation_ref ON public.agent_attachment_refs(attachment_id,conversation_id) WHERE conversation_id IS NOT NULL;
CREATE UNIQUE INDEX agent_attachment_command_ref ON public.agent_attachment_refs(attachment_id,command_sequence) WHERE command_sequence IS NOT NULL;
ALTER TABLE public.agent_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_attachment_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachment_owner_read ON public.agent_attachments FOR SELECT TO authenticated USING(user_id=auth.uid() AND status='ready');
REVOKE ALL ON TABLE public.agent_attachments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.agent_attachment_refs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_attachments TO authenticated;
REVOKE ALL ON public.agent_attachment_refs FROM anon,authenticated;
GRANT ALL ON public.agent_attachments,public.agent_attachment_refs TO service_role;

CREATE FUNCTION public.sync_agent_attachment_refs() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid; document jsonb; ids uuid[]; a public.agent_attachments;
BEGIN
 IF TG_TABLE_NAME='conversations' THEN owner_id:=NEW.user_id; document:=coalesce(NEW.messages,'[]');
 ELSE SELECT user_id INTO owner_id FROM public.agent_runs WHERE id=NEW.run_id; document:=NEW.message; END IF;
 SELECT coalesce(array_agg(DISTINCT value::uuid),'{}') INTO ids FROM jsonb_path_query(document,'lax $.**.attachments.ids[*]') valueset(element),LATERAL (SELECT element#>>'{}' AS value) extracted
 WHERE value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
 FOR a IN SELECT * FROM public.agent_attachments WHERE id=ANY(ids) OR id IN (
   SELECT attachment_id FROM public.agent_attachment_refs WHERE
    (TG_TABLE_NAME='conversations' AND conversation_id=(to_jsonb(NEW)->>'id')::uuid) OR
    (TG_TABLE_NAME='agent_run_commands' AND command_sequence=(to_jsonb(NEW)->>'sequence')::bigint)
 ) ORDER BY id FOR UPDATE LOOP
   IF a.id=ANY(ids) AND (a.user_id IS DISTINCT FROM owner_id OR a.status<>'ready') THEN RAISE EXCEPTION 'ATTACHMENT_NOT_AVAILABLE' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.agent_attachments WHERE id=ANY(ids) AND user_id=owner_id AND status='ready')<>cardinality(ids) THEN RAISE EXCEPTION 'ATTACHMENT_NOT_AVAILABLE' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='conversations' THEN
   DELETE FROM public.agent_attachment_refs WHERE conversation_id=NEW.id AND NOT attachment_id=ANY(ids);
   INSERT INTO public.agent_attachment_refs(attachment_id,conversation_id) SELECT unnest(ids),NEW.id ON CONFLICT DO NOTHING;
 ELSE
   DELETE FROM public.agent_attachment_refs WHERE command_sequence=NEW.sequence AND (NOT attachment_id=ANY(ids) OR NEW.delivery_state IN ('cancelled','consumed'));
   IF NEW.delivery_state NOT IN ('cancelled','consumed') THEN INSERT INTO public.agent_attachment_refs(attachment_id,command_sequence) SELECT unnest(ids),NEW.sequence ON CONFLICT DO NOTHING; END IF;
 END IF;
 UPDATE public.agent_attachments SET orphaned_at=NULL WHERE id=ANY(ids) AND EXISTS(SELECT 1 FROM public.agent_attachment_refs WHERE attachment_id=id);
 RETURN NEW;
END;
$$;
CREATE TRIGGER conversation_attachment_refs AFTER INSERT OR UPDATE OF messages ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.sync_agent_attachment_refs();
CREATE TRIGGER command_attachment_refs AFTER INSERT OR UPDATE OF message,delivery_state ON public.agent_run_commands FOR EACH ROW EXECUTE FUNCTION public.sync_agent_attachment_refs();
CREATE FUNCTION public.orphan_agent_attachment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.agent_attachments SET orphaned_at=now() WHERE id=OLD.attachment_id AND NOT EXISTS(SELECT 1 FROM public.agent_attachment_refs WHERE attachment_id=OLD.attachment_id);
 RETURN OLD;
END;
$$;
CREATE TRIGGER attachment_ref_removed AFTER DELETE ON public.agent_attachment_refs FOR EACH ROW EXECUTE FUNCTION public.orphan_agent_attachment();
CREATE FUNCTION public.claim_agent_attachment_cleanup(p_limit integer DEFAULT 50) RETURNS SETOF public.agent_attachments
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.agent_require_admin();
 RETURN QUERY UPDATE public.agent_attachments SET status='deleting' WHERE id IN (
   SELECT a.id FROM public.agent_attachments a WHERE (a.status='deleting' OR a.orphaned_at<now()-interval '24 hours') AND NOT EXISTS(SELECT 1 FROM public.agent_attachment_refs r WHERE r.attachment_id=a.id)
   ORDER BY a.created_at LIMIT least(greatest(p_limit,1),100) FOR UPDATE SKIP LOCKED
 ) RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_agent_attachment_refs(),public.orphan_agent_attachment(),public.claim_agent_attachment_cleanup(integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_attachment_cleanup(integer) TO service_role;

-- Preserve attachment IDs with both legacy version snapshots and new Agent versions.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.agent_sync_message(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'''userContent'',user_message->>''content'',''mentions''','''userContent'',user_message->>''content'',''attachments'',user_message->''attachments'',''mentions''');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.agent_create_run(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure) INTO definition;
 definition:=replace(definition,'''userContent'',anchor_message->>''content'',''mentions''','''userContent'',anchor_message->>''content'',''attachments'',anchor_message->''attachments'',''mentions''');
 EXECUTE definition;
END $migration$;
