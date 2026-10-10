-- Reviewed excerpts of local SQL supplied for the self-host prototype.
-- INPUT ONLY to scripts/selfhost-schema.mjs; do not execute directly.

-- Original: supabase/migrations/20260408_transactional_multi_write_rpcs.sql
-- Original SHA256: 5d464b9a96a4de8b010af3815023d1c67714900b707de4617e75c1610e07b0df

CREATE OR REPLACE FUNCTION public.admin_create_ai_model_with_binding(
  p_model jsonb,
  p_primary_gateway_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gateway_id uuid;
  v_model public.ai_models;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id
  INTO v_gateway_id
  FROM public.ai_gateways
  WHERE gateway_key = p_primary_gateway_key;

  IF v_gateway_id IS NULL THEN
    RETURN jsonb_build_object('status', 'gateway_not_found');
  END IF;

  INSERT INTO public.ai_models (
    model_key,
    display_name,
    vendor,
    usage_type,
    routing_mode,
    is_enabled,
    sort_order,
    required_tier,
    supports_reasoning,
    reasoning_required_tier,
    is_reasoning_default,
    supports_vision,
    default_temperature,
    default_top_p,
    default_presence_penalty,
    default_frequency_penalty,
    default_max_tokens,
    default_reasoning_effort,
    reasoning_effort_format,
    custom_parameters,
    description
  )
  VALUES (
    NULLIF(p_model->>'model_key', ''),
    NULLIF(p_model->>'display_name', ''),
    NULLIF(p_model->>'vendor', ''),
    COALESCE(NULLIF(p_model->>'usage_type', ''), 'chat'),
    COALESCE(NULLIF(p_model->>'routing_mode', ''), 'auto'),
    COALESCE((p_model->>'is_enabled')::boolean, true),
    COALESCE((p_model->>'sort_order')::integer, 0),
    COALESCE(NULLIF(p_model->>'required_tier', ''), 'free'),
    COALESCE((p_model->>'supports_reasoning')::boolean, false),
    COALESCE(NULLIF(p_model->>'reasoning_required_tier', ''), 'plus'),
    COALESCE((p_model->>'is_reasoning_default')::boolean, false),
    COALESCE((p_model->>'supports_vision')::boolean, false),
    CASE WHEN p_model ? 'default_temperature' THEN (p_model->>'default_temperature')::numeric ELSE NULL END,
    CASE WHEN p_model ? 'default_top_p' THEN (p_model->>'default_top_p')::numeric ELSE NULL END,
    CASE WHEN p_model ? 'default_presence_penalty' THEN (p_model->>'default_presence_penalty')::numeric ELSE NULL END,
    CASE WHEN p_model ? 'default_frequency_penalty' THEN (p_model->>'default_frequency_penalty')::numeric ELSE NULL END,
    CASE WHEN p_model ? 'default_max_tokens' THEN (p_model->>'default_max_tokens')::integer ELSE NULL END,
    CASE WHEN p_model ? 'default_reasoning_effort' THEN NULLIF(p_model->>'default_reasoning_effort', '') ELSE NULL END,
    CASE WHEN p_model ? 'reasoning_effort_format' THEN NULLIF(p_model->>'reasoning_effort_format', '') ELSE NULL END,
    CASE
      WHEN p_model ? 'custom_parameters' THEN
        CASE
          WHEN jsonb_typeof(p_model->'custom_parameters') = 'null' THEN NULL
          ELSE p_model->'custom_parameters'
        END
      ELSE NULL
    END,
    CASE WHEN p_model ? 'description' THEN p_model->>'description' ELSE NULL END
  )
  RETURNING *
  INTO v_model;

  INSERT INTO public.ai_model_gateway_bindings (
    model_id,
    gateway_id,
    model_id_override,
    reasoning_model_id,
    is_enabled,
    priority,
    notes
  )
  VALUES (
    v_model.id,
    v_gateway_id,
    NULL,
    NULL,
    true,
    0,
    'Auto-created primary binding'
  );

  RETURN jsonb_build_object(
    'status', 'ok',
    'model', to_jsonb(v_model)
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'conflict');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_ai_model_and_cleanup_bindings(
  p_model_id text,
  p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_model_key text;
  v_model public.ai_models;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT model_key
  INTO v_previous_model_key
  FROM public.ai_models
  WHERE id::text = p_model_id;

  IF v_previous_model_key IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  UPDATE public.ai_models
  SET
    model_key = CASE WHEN p_patch ? 'model_key' THEN p_patch->>'model_key' ELSE model_key END,
    display_name = CASE WHEN p_patch ? 'display_name' THEN p_patch->>'display_name' ELSE display_name END,
    vendor = CASE WHEN p_patch ? 'vendor' THEN p_patch->>'vendor' ELSE vendor END,
    usage_type = CASE WHEN p_patch ? 'usage_type' THEN p_patch->>'usage_type' ELSE usage_type END,
    routing_mode = CASE WHEN p_patch ? 'routing_mode' THEN p_patch->>'routing_mode' ELSE routing_mode END,
    is_enabled = CASE WHEN p_patch ? 'is_enabled' THEN (p_patch->>'is_enabled')::boolean ELSE is_enabled END,
    sort_order = CASE WHEN p_patch ? 'sort_order' THEN (p_patch->>'sort_order')::integer ELSE sort_order END,
    required_tier = CASE WHEN p_patch ? 'required_tier' THEN p_patch->>'required_tier' ELSE required_tier END,
    supports_reasoning = CASE WHEN p_patch ? 'supports_reasoning' THEN (p_patch->>'supports_reasoning')::boolean ELSE supports_reasoning END,
    reasoning_required_tier = CASE WHEN p_patch ? 'reasoning_required_tier' THEN p_patch->>'reasoning_required_tier' ELSE reasoning_required_tier END,
    is_reasoning_default = CASE WHEN p_patch ? 'is_reasoning_default' THEN (p_patch->>'is_reasoning_default')::boolean ELSE is_reasoning_default END,
    supports_vision = CASE WHEN p_patch ? 'supports_vision' THEN (p_patch->>'supports_vision')::boolean ELSE supports_vision END,
    default_temperature = CASE WHEN p_patch ? 'default_temperature' THEN (p_patch->>'default_temperature')::numeric ELSE default_temperature END,
    default_top_p = CASE WHEN p_patch ? 'default_top_p' THEN (p_patch->>'default_top_p')::numeric ELSE default_top_p END,
    default_presence_penalty = CASE WHEN p_patch ? 'default_presence_penalty' THEN (p_patch->>'default_presence_penalty')::numeric ELSE default_presence_penalty END,
    default_frequency_penalty = CASE WHEN p_patch ? 'default_frequency_penalty' THEN (p_patch->>'default_frequency_penalty')::numeric ELSE default_frequency_penalty END,
    default_max_tokens = CASE WHEN p_patch ? 'default_max_tokens' THEN (p_patch->>'default_max_tokens')::integer ELSE default_max_tokens END,
    default_reasoning_effort = CASE WHEN p_patch ? 'default_reasoning_effort' THEN NULLIF(p_patch->>'default_reasoning_effort', '') ELSE default_reasoning_effort END,
    reasoning_effort_format = CASE WHEN p_patch ? 'reasoning_effort_format' THEN NULLIF(p_patch->>'reasoning_effort_format', '') ELSE reasoning_effort_format END,
    custom_parameters = CASE
      WHEN p_patch ? 'custom_parameters' THEN
        CASE
          WHEN jsonb_typeof(p_patch->'custom_parameters') = 'null' THEN NULL
          ELSE p_patch->'custom_parameters'
        END
      ELSE custom_parameters
    END,
    description = CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE description END
  WHERE id::text = p_model_id
  RETURNING *
  INTO v_model;

  IF v_previous_model_key IS DISTINCT FROM v_model.model_key THEN
    UPDATE public.ai_model_gateway_bindings
    SET model_id_override = NULL
    WHERE model_id = v_model.id
      AND model_id_override = v_previous_model_key;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'model', to_jsonb(v_model)
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'conflict');
END;
$$;

CREATE OR REPLACE FUNCTION public.import_ming_records_and_notes(
  p_records jsonb,
  p_notes jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_records_imported integer := 0;
  v_notes_imported integer := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(jsonb_typeof(p_records), 'null') <> 'array' THEN
    RAISE EXCEPTION 'records must be an array' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(jsonb_typeof(p_notes), 'null') <> 'array' THEN
    RAISE EXCEPTION 'notes must be an array' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.ming_records
  WHERE user_id = v_user_id;

  DELETE FROM public.ming_notes
  WHERE user_id = v_user_id;

  INSERT INTO public.ming_records (
    user_id,
    title,
    content,
    category,
    tags,
    event_date,
    related_chart_type,
    related_chart_id,
    is_pinned,
    created_at,
    updated_at
  )
  SELECT
    v_user_id,
    record.title,
    record.content,
    COALESCE(record.category, 'general'),
    CASE
      WHEN record.tags IS NULL THEN '{}'::text[]
      ELSE ARRAY(SELECT jsonb_array_elements_text(record.tags))
    END,
    record.event_date,
    record.related_chart_type,
    record.related_chart_id,
    COALESCE(record.is_pinned, false),
    COALESCE(record.created_at, now()),
    COALESCE(record.updated_at, now())
  FROM jsonb_to_recordset(p_records) AS record(
    title text,
    content text,
    category text,
    tags jsonb,
    event_date date,
    related_chart_type text,
    related_chart_id uuid,
    is_pinned boolean,
    created_at timestamptz,
    updated_at timestamptz
  );

  GET DIAGNOSTICS v_records_imported = ROW_COUNT;

  INSERT INTO public.ming_notes (
    user_id,
    note_date,
    content,
    mood,
    created_at,
    updated_at
  )
  SELECT
    v_user_id,
    COALESCE(note.note_date, CURRENT_DATE),
    note.content,
    note.mood,
    COALESCE(note.created_at, now()),
    COALESCE(note.updated_at, now())
  FROM jsonb_to_recordset(p_notes) AS note(
    note_date date,
    content text,
    mood text,
    created_at timestamptz,
    updated_at timestamptz
  );

  GET DIAGNOSTICS v_notes_imported = ROW_COUNT;

  RETURN jsonb_build_object(
    'recordsImported', v_records_imported,
    'notesImported', v_notes_imported
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_conversation_graph(
  p_conversation_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_conversation_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT id
  INTO v_conversation_id
  FROM public.conversations
  WHERE id::text = p_conversation_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF v_conversation_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.knowledge_entries
  WHERE source_type = 'conversation'
    AND source_id = p_conversation_id;

  DELETE FROM public.archived_sources
  WHERE source_type = 'conversation'
    AND source_id = p_conversation_id
    AND user_id = v_user_id;

  DELETE FROM public.conversations
  WHERE id = v_conversation_id
    AND user_id = v_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_ai_model_with_binding(jsonb, text) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_update_ai_model_and_cleanup_bindings(text, jsonb) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.import_ming_records_and_notes(jsonb, jsonb) FROM public, anon;

REVOKE ALL ON FUNCTION public.delete_conversation_graph(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_ai_model_with_binding(jsonb, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_update_ai_model_and_cleanup_bindings(text, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.import_ming_records_and_notes(jsonb, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_conversation_graph(text) TO authenticated;

-- Original: supabase/migrations/20260124_vector_index_helpers.sql
-- Original SHA256: 89fbafea1b41e619c2294399924813ab7bfd44c6a2524c57d857d98fc33393f1

CREATE OR REPLACE FUNCTION public.check_vector_index_exists(p_dim INT DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND (
              (p_dim IS NOT NULL AND indexname = 'knowledge_entries_vector_' || p_dim || '_idx')
              OR
              (p_dim IS NULL AND indexname LIKE 'knowledge_entries_vector_%_idx')
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_vector_index_dimensions()
RETURNS INT[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        array_agg(
            SUBSTRING(indexname FROM 'knowledge_entries_vector_(\d+)_idx')::int
        ),
        ARRAY[]::INT[]
    )
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname ~ '^knowledge_entries_vector_\d+_idx$';
$$;

REVOKE ALL ON FUNCTION public.check_vector_index_exists(INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_vector_index_exists(INT) TO authenticated;

REVOKE ALL ON FUNCTION public.get_vector_index_dimensions() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_vector_index_dimensions() TO service_role;

-- Original: supabase/migrations/20260124_batch_update_vectors.sql
-- Original SHA256: c26bc542fe4f282c69b838d9c6eba63647eb86a535d92c607d219e4f9fc57eea

CREATE OR REPLACE FUNCTION public.batch_update_vectors(
    p_updates JSONB,
    p_expected_dim INT DEFAULT 1536,
    p_force_overwrite BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    updated_count INT,
    skipped_count INT,
    already_exists_count INT,
    error_details JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_update JSONB;
    v_entry_id UUID;
    v_vector_jsonb JSONB;
    v_vector_arr float8[];
    v_vector vector;
    v_updated INT := 0;
    v_skipped INT := 0;
    v_already_exists INT := 0;
    v_errors JSONB := '[]'::jsonb;
    v_dim INT;
    v_elem JSONB;
    v_elem_text TEXT;
    v_elem_type TEXT;
    v_has_invalid_elem BOOLEAN;
    v_invalid_elem_info TEXT;
    v_ord INT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        v_entry_id := (v_update->>'id')::uuid;
        v_vector_jsonb := v_update->'content_vector';

        IF v_vector_jsonb IS NULL THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('id', v_entry_id, 'reason', 'content_vector is NULL');
            CONTINUE;
        END IF;

        IF jsonb_typeof(v_vector_jsonb) = 'null' THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('id', v_entry_id, 'reason', 'content_vector is JSON null');
            CONTINUE;
        END IF;

        IF jsonb_typeof(v_vector_jsonb) != 'array' THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object(
                'id', v_entry_id,
                'reason', 'content_vector is not an array',
                'actual_type', jsonb_typeof(v_vector_jsonb)
            );
            CONTINUE;
        END IF;

        IF jsonb_array_length(v_vector_jsonb) = 0 THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('id', v_entry_id, 'reason', 'content_vector is empty array');
            CONTINUE;
        END IF;

        v_has_invalid_elem := FALSE;
        v_invalid_elem_info := NULL;
        v_ord := 0;

        FOR v_elem IN SELECT value FROM jsonb_array_elements(v_vector_jsonb)
        LOOP
            v_ord := v_ord + 1;
            v_elem_type := jsonb_typeof(v_elem);

            IF v_elem_type = 'null' THEN
                v_has_invalid_elem := TRUE;
                v_invalid_elem_info := format('element[%s] is null', v_ord - 1);
                EXIT;
            END IF;

            IF v_elem_type NOT IN ('number') THEN
                v_has_invalid_elem := TRUE;
                v_invalid_elem_info := format('element[%s] is %s, expected number', v_ord - 1, v_elem_type);
                EXIT;
            END IF;

            v_elem_text := v_elem::text;
            IF v_elem_text IN ('NaN', 'Infinity', '-Infinity', 'null')
               OR v_elem_text !~ '^-?[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?$' THEN
                v_has_invalid_elem := TRUE;
                v_invalid_elem_info := format('element[%s] is invalid: %s', v_ord - 1, v_elem_text);
                EXIT;
            END IF;
        END LOOP;

        IF v_has_invalid_elem THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object(
                'id', v_entry_id,
                'reason', 'invalid_element',
                'detail', v_invalid_elem_info
            );
            CONTINUE;
        END IF;

        SELECT array_agg(t.val::float8 ORDER BY t.ord)
        INTO v_vector_arr
        FROM jsonb_array_elements_text(v_vector_jsonb) WITH ORDINALITY AS t(val, ord);

        IF EXISTS (SELECT 1 FROM unnest(v_vector_arr) AS x WHERE NOT isfinite(x)) THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('id', v_entry_id, 'reason', 'vector contains non-finite values');
            CONTINUE;
        END IF;

        v_dim := array_length(v_vector_arr, 1);
        IF v_dim != p_expected_dim THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object(
                'id', v_entry_id,
                'reason', 'dimension mismatch',
                'expected', p_expected_dim,
                'actual', v_dim
            );
            CONTINUE;
        END IF;

        v_vector := v_vector_arr::vector;

        IF p_force_overwrite THEN
            UPDATE public.knowledge_entries e
            SET
                content_vector = v_vector,
                metadata = e.metadata || COALESCE(v_update->'metadata', '{}'::jsonb)
            FROM public.knowledge_bases kb
            WHERE e.id = v_entry_id
              AND e.kb_id = kb.id
              AND kb.user_id = v_user_id;
        ELSE
            UPDATE public.knowledge_entries e
            SET
                content_vector = v_vector,
                metadata = e.metadata || COALESCE(v_update->'metadata', '{}'::jsonb)
            FROM public.knowledge_bases kb
            WHERE e.id = v_entry_id
              AND e.kb_id = kb.id
              AND kb.user_id = v_user_id
              AND e.content_vector IS NULL;
        END IF;

        IF FOUND THEN
            v_updated := v_updated + 1;
        ELSE
            IF NOT p_force_overwrite AND EXISTS (
                SELECT 1 FROM public.knowledge_entries e
                JOIN public.knowledge_bases kb ON e.kb_id = kb.id
                WHERE e.id = v_entry_id
                  AND kb.user_id = v_user_id
                  AND e.content_vector IS NOT NULL
            ) THEN
                v_already_exists := v_already_exists + 1;
            ELSE
                v_skipped := v_skipped + 1;
                v_errors := v_errors || jsonb_build_object('id', v_entry_id, 'reason', 'entry not found or not owned');
            END IF;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_updated, v_skipped, v_already_exists, v_errors;
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_update_vectors(JSONB, INT, BOOLEAN) TO authenticated;

-- Original: supabase/migrations/20260125_fix_community_anonymous_mapping_rls_and_views.sql
-- Original SHA256: eb13917b1db3eb854745d2663a507e3012882c808709a762202653e06e4c3dbf

CREATE OR REPLACE FUNCTION public.increment_community_post_view_count(post_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.community_posts
  SET view_count = view_count + 1
  WHERE id = post_id
  RETURNING view_count INTO updated_count;

  RETURN updated_count;
END;
$$;
