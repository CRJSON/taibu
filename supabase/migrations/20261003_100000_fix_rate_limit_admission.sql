-- Correct admission, not merely the capped stored count. Reuse the existing
-- (identifier, endpoint) unique key; no table/RLS/default/backfill changes.
-- CREATE OR REPLACE preserves ownership and the administrator-login contract.
CREATE OR REPLACE FUNCTION public.consume_rate_limit_slot_as_admin(
  p_identifier text,
  p_endpoint text,
  p_max_requests integer,
  p_window_ms integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_row public.rate_limits;
  v_allowed boolean;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_identifier IS NULL OR p_identifier = '' OR length(p_identifier) > 1024
    OR p_endpoint IS NULL OR p_endpoint = '' OR length(p_endpoint) > 1024
    OR p_max_requests IS NULL OR p_max_requests <= 0
    OR p_window_ms IS NULL OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'invalid rate limit config' USING ERRCODE = '22023';
  END IF;
  v_window := (p_window_ms::text || ' milliseconds')::interval;

  INSERT INTO public.rate_limits (identifier, endpoint, request_count, window_start)
  VALUES (p_identifier, p_endpoint, 1, v_now)
  ON CONFLICT (identifier, endpoint) DO UPDATE
  SET request_count = CASE
        WHEN public.rate_limits.window_start IS NULL
          OR v_now - public.rate_limits.window_start >= v_window THEN 1
        ELSE GREATEST(COALESCE(public.rate_limits.request_count, 0), 0) + 1
      END,
      window_start = CASE
        WHEN public.rate_limits.window_start IS NULL
          OR v_now - public.rate_limits.window_start >= v_window THEN v_now
        ELSE public.rate_limits.window_start
      END
  WHERE public.rate_limits.window_start IS NULL
    OR v_now - public.rate_limits.window_start >= v_window
    OR COALESCE(public.rate_limits.request_count, 0) < p_max_requests
  RETURNING * INTO v_row;
  v_allowed := FOUND;

  IF NOT v_allowed THEN
    -- ON CONFLICT has locked the denied row until transaction end.
    SELECT * INTO v_row FROM public.rate_limits
    WHERE identifier = p_identifier AND endpoint = p_endpoint;
  END IF;
  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'remaining', GREATEST(p_max_requests - COALESCE(v_row.request_count, 0), 0),
    'reset_at', COALESCE(v_row.window_start, v_now) + v_window
  );
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit_slot_as_admin(text, text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit_slot_as_admin(text, text, integer, integer) TO authenticated, service_role;
