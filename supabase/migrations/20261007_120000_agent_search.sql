CREATE INDEX IF NOT EXISTS conversation_messages_content_trgm ON public.conversation_messages USING gin (content extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS conversations_title_trgm ON public.conversations USING gin (title extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_conversation_messages(p_query text, p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp SET statement_timeout = '3s' AS $$
DECLARE pattern text; result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF length(trim(p_query)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid search query'; END IF;
  pattern := '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  SELECT coalesce(jsonb_agg(to_jsonb(search_rows)), '[]'::jsonb) INTO result FROM (
    (SELECT c.id AS "conversationId", c.title, NULL::text AS "messageId", c.title AS preview, c.updated_at AS "updatedAt"
      FROM public.conversations c WHERE c.user_id=auth.uid() AND c.title ILIKE pattern ESCAPE '\' ORDER BY c.updated_at DESC LIMIT 10)
    UNION ALL
    (SELECT c.id, c.title, m.message_id, substr(m.content, greatest(1, strpos(lower(m.content),lower(trim(p_query)))-80), 300), c.updated_at
      FROM public.conversation_messages m JOIN public.conversations c ON c.id=m.conversation_id
      WHERE c.user_id=auth.uid() AND m.role <> 'system' AND m.content ILIKE pattern ESCAPE '\'
      ORDER BY c.updated_at DESC,m.sequence LIMIT least(greatest(p_limit,1),30))
  ) search_rows;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.search_conversation_messages(text,integer) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.search_conversation_messages(text,integer) TO authenticated;
