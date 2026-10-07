ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS next_task_config jsonb;
CREATE TABLE public.prompt_enhancement_usage (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  calls integer NOT NULL DEFAULT 0 CHECK (calls BETWEEN 0 AND 5),
  PRIMARY KEY(user_id,local_date)
);
ALTER TABLE public.prompt_enhancement_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prompt_enhancement_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.prompt_enhancement_usage TO service_role;
CREATE OR REPLACE FUNCTION public.claim_prompt_enhancement() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE affected integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.prompt_enhancement_usage(user_id,local_date,calls) VALUES(auth.uid(),(now() AT TIME ZONE 'Asia/Shanghai')::date,1)
  ON CONFLICT(user_id,local_date) DO UPDATE SET calls=prompt_enhancement_usage.calls+1 WHERE prompt_enhancement_usage.calls<5;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_prompt_enhancement() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.claim_prompt_enhancement() TO authenticated;
