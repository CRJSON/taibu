CREATE FUNCTION public.fork_conversation_snapshot(p_parent uuid,p_through text,p_source_messages jsonb,p_messages jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE parent public.conversations; target jsonb;
BEGIN
 SELECT * INTO parent FROM public.conversations WHERE id=p_parent AND user_id=auth.uid() FOR UPDATE;
 IF parent.id IS NULL THEN RAISE EXCEPTION 'CONVERSATION_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF parent.messages IS DISTINCT FROM p_source_messages THEN RAISE EXCEPTION 'BRANCH_CHANGED' USING ERRCODE='40001'; END IF;
 SELECT value INTO target FROM jsonb_array_elements(parent.messages) WHERE value->>'id'=p_through;
 IF target IS NULL OR target->>'role'<>'assistant' OR (target->'agent' IS NOT NULL AND target#>>'{agent,status}'<>'completed') THEN RAISE EXCEPTION 'ANSWER_NOT_COMPLETED' USING ERRCODE='22023'; END IF;
 RETURN public.create_conversation_with_messages(auth.uid(),coalesce(parent.title,'对话')||' · 分叉',parent.personality,NULL,jsonb_build_object('kind','fork','parentConversationId',p_parent,'parentMessageId',p_through),p_messages);
END;
$$;
REVOKE ALL ON FUNCTION public.fork_conversation_snapshot(uuid,text,jsonb,jsonb) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.fork_conversation_snapshot(uuid,text,jsonb,jsonb) TO authenticated;

-- Protect copied history through ordinary saves and Agent edits alike.
CREATE FUNCTION public.protect_fork_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE original jsonb; replacement jsonb;
BEGIN
 FOR original IN SELECT value FROM jsonb_array_elements(coalesce(OLD.messages,'[]')) WHERE value#>>'{metadata,forkHistory}'='true' LOOP
  SELECT value INTO replacement FROM jsonb_array_elements(coalesce(NEW.messages,'[]')) WHERE value->>'id'=original->>'id';
  IF replacement IS DISTINCT FROM original THEN RAISE EXCEPTION 'FORK_HISTORY_READ_ONLY' USING ERRCODE='22023'; END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_fork_history() FROM public,anon,authenticated;
CREATE TRIGGER fork_history_read_only BEFORE UPDATE OF messages ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.protect_fork_history();
