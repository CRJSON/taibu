ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS chat_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.user_settings.chat_preferences IS 'Validated reading width, global font scale and explicit desktop notification preference; no credentials.';
