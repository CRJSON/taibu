-- Persist caller time resolution, not a second birth date or a new chart table.
-- Existing place/longitude fields cannot represent an IANA zone or DST policy.
-- Constant defaults preserve the legacy interpretation; do not recalculate old charts.
-- Owner RLS/grants remain unchanged. These fields are not lookup keys requiring indexes.
BEGIN;

ALTER TABLE public.bazi_charts
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Shanghai'
    CHECK (char_length(timezone) BETWEEN 1 AND 100 AND timezone = btrim(timezone)),
  ADD COLUMN IF NOT EXISTS disambiguation text NOT NULL DEFAULT 'reject'
    CHECK (disambiguation IN ('reject', 'earlier', 'later', 'compatible'));
ALTER TABLE public.ziwei_charts
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Shanghai'
    CHECK (char_length(timezone) BETWEEN 1 AND 100 AND timezone = btrim(timezone)),
  ADD COLUMN IF NOT EXISTS disambiguation text NOT NULL DEFAULT 'reject'
    CHECK (disambiguation IN ('reject', 'earlier', 'later', 'compatible'));

COMMIT;
