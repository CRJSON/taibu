-- Reuse the conversation's existing JSON message versions and Agent ledger.
-- No new tables/columns or backfill: capture the visible branch before its next
-- edit/regeneration, including the tail added since that branch was created.
BEGIN;

CREATE OR REPLACE FUNCTION public.agent_create_run(p_id uuid,p_user_id uuid,p_conversation_id uuid,p_request_id text,p_request_hash text,p_input jsonb,p_checkpoint jsonb,p_message jsonb,p_credential jsonb,p_charge boolean)
RETURNS public.agent_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  r public.agent_runs; c public.conversations; balance integer; messages jsonb;
  anchor_position bigint; anchor_message jsonb; old_answer jsonb; versions jsonb;
  version_index integer; version_snapshot jsonb; tail_position bigint; previous_write text;
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
    anchor_message:=messages->(anchor_position::integer-1);
    old_answer:=messages->anchor_position::integer;
    tail_position:=anchor_position;
    IF old_answer->>'role'='assistant' THEN tail_position:=anchor_position+1; ELSE old_answer:=NULL; END IF;
    versions:=CASE WHEN jsonb_typeof(anchor_message->'versions')='array' THEN anchor_message->'versions' ELSE '[]'::jsonb END;
    version_index:=jsonb_array_length(versions)-1;
    IF coalesce(anchor_message->>'currentVersionIndex','') ~ '^[0-9]{1,9}$' THEN
      IF (anchor_message->>'currentVersionIndex')::integer < jsonb_array_length(versions) THEN
        version_index:=(anchor_message->>'currentVersionIndex')::integer;
      END IF;
    END IF;
    version_snapshot:=CASE WHEN jsonb_typeof(versions->version_index)='object' THEN versions->version_index ELSE '{}'::jsonb END;
    version_snapshot:=version_snapshot||jsonb_build_object(
      'userContent',anchor_message->>'content','mentions',anchor_message->'mentions',
      'aiContent',coalesce(old_answer->>'content',''),'aiAgent',old_answer->'agent','aiMetadata',old_answer->'metadata',
      'createdAt',coalesce(old_answer->>'createdAt',anchor_message->>'createdAt'),
      'subsequentMessages',coalesce((SELECT jsonb_agg(m ORDER BY n) FROM jsonb_array_elements(messages) WITH ORDINALITY t(m,n) WHERE n>tail_position),'[]'));
    IF version_index<0 THEN
      versions:=jsonb_build_array(version_snapshot); version_index:=0;
    ELSE
      versions:=jsonb_set(versions,ARRAY[version_index::text],version_snapshot);
    END IF;
    p_input:=jsonb_set(p_input,'{userMessage}',(p_input->'userMessage')||jsonb_build_object('versions',versions,'currentVersionIndex',version_index));
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
REVOKE ALL ON FUNCTION public.agent_create_run(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_create_run(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,boolean) TO authenticated,service_role;

-- Covers both the graph RPC and direct owner/admin DELETE. The conversation row
-- is already locked by DELETE; avoid taking a run lock in the reverse order of
-- settlement. The existing create RPC holds the same conversation lock, so a
-- new run cannot race a successful deletion.
CREATE FUNCTION public.agent_protect_conversation_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.agent_runs WHERE conversation_id=OLD.id AND status IN ('queued','running','awaiting_input','cancelling')) THEN
    RAISE EXCEPTION 'AGENT_CONVERSATION_BUSY' USING ERRCODE='23505';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_protect_conversation_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER agent_conversation_delete_guard BEFORE DELETE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.agent_protect_conversation_delete();

COMMIT;
