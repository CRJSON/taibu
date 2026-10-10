-- Keep existing model settings valid while supporting Pi's xhigh/max levels.
ALTER TABLE public.ai_models
  DROP CONSTRAINT IF EXISTS ai_models_default_reasoning_effort_check;
ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_default_reasoning_effort_check
  CHECK (default_reasoning_effort IS NULL OR default_reasoning_effort IN ('minimal', 'low', 'medium', 'high', 'xhigh', 'max'));
