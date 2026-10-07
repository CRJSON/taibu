ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS daily_briefing_settings jsonb NOT NULL DEFAULT '{}';
-- Keep the existing (user_id,reminder_type) subscription uniqueness.
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='public.reminder_subscriptions'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%reminder_type%' LOOP
  EXECUTE format('ALTER TABLE public.reminder_subscriptions DROP CONSTRAINT %I',item.conname);
 END LOOP;
END $$;
ALTER TABLE public.reminder_subscriptions ADD CONSTRAINT reminder_subscription_type CHECK(reminder_type IN ('solar_term','fortune','key_date','daily_briefing'));

CREATE TABLE public.daily_briefing_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 local_date date NOT NULL, timezone text NOT NULL, deadline timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','generating','completed','failed','cancelled','skipped')),
 billing text NOT NULL DEFAULT 'none' CHECK(billing IN ('none','reserved','settled','refunded')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), lease_token uuid, lease_until timestamptz,
 result_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL, content text, error text,
 notification_pending boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,local_date)
);
CREATE INDEX daily_briefing_pending ON public.daily_briefing_jobs(status,lease_until,created_at);
ALTER TABLE public.daily_briefing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY briefing_owner_read ON public.daily_briefing_jobs FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON TABLE public.daily_briefing_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.daily_briefing_jobs TO authenticated;
GRANT ALL ON public.daily_briefing_jobs TO service_role;

CREATE FUNCTION public.claim_daily_briefings(p_limit integer DEFAULT 2,p_enabled boolean DEFAULT true) RETURNS SETOF public.daily_briefing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.daily_briefing_jobs; balance integer; local_now timestamp; item record;
BEGIN
 PERFORM public.agent_require_admin();
 -- Cancel expired or disabled work. Row locks and billing state fence each refund.
 FOR job IN SELECT j.* FROM public.daily_briefing_jobs j WHERE j.status IN ('pending','generating') AND
 (NOT p_enabled OR j.deadline<=now() OR NOT EXISTS(SELECT 1 FROM public.reminder_subscriptions s WHERE s.user_id=j.user_id AND s.reminder_type='daily_briefing' AND s.enabled))
 ORDER BY j.created_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  IF job.billing='reserved' THEN PERFORM public.increment_ai_chat_count(job.user_id,1); END IF;
  UPDATE public.daily_briefing_jobs SET status='cancelled',billing=CASE WHEN billing='reserved' THEN 'refunded' ELSE billing END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=job.id;
 END LOOP;
 IF NOT p_enabled THEN RETURN; END IF;
 FOR item IN
  SELECT s.user_id,coalesce(tz.name,'Asia/Shanghai') AS zone,
    CASE WHEN u.daily_briefing_settings->>'time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN (u.daily_briefing_settings->>'time')::time ELSE time '08:00' END AS delivery_time
  FROM public.reminder_subscriptions s LEFT JOIN public.user_settings u ON u.user_id=s.user_id
  LEFT JOIN pg_timezone_names tz ON tz.name=coalesce(u.daily_briefing_settings->>'timezone','Asia/Shanghai')
  WHERE s.reminder_type='daily_briefing' AND s.enabled AND
    (now() AT TIME ZONE coalesce(tz.name,'Asia/Shanghai'))::time >= CASE WHEN u.daily_briefing_settings->>'time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN (u.daily_briefing_settings->>'time')::time ELSE time '08:00' END
    AND NOT EXISTS(SELECT 1 FROM public.daily_briefing_jobs j WHERE j.user_id=s.user_id AND j.local_date=(now() AT TIME ZONE coalesce(tz.name,'Asia/Shanghai'))::date)
  ORDER BY s.user_id LIMIT least(greatest(p_limit,1),10)
 LOOP
  local_now:=now() AT TIME ZONE item.zone;
  INSERT INTO public.daily_briefing_jobs(user_id,local_date,timezone,deadline) VALUES(item.user_id,local_now::date,item.zone,((local_now::date+1)::timestamp AT TIME ZONE item.zone)) ON CONFLICT(user_id,local_date) DO NOTHING;
 END LOOP;
 FOR job IN SELECT j.* FROM public.daily_briefing_jobs j WHERE j.deadline>now() AND
 (j.status='pending' OR (j.status='generating' AND j.lease_until<now()))
 ORDER BY j.created_at LIMIT least(greatest(p_limit,1),10) FOR UPDATE SKIP LOCKED LOOP
  IF job.attempts>=3 THEN
   IF job.billing='reserved' THEN PERFORM public.increment_ai_chat_count(job.user_id,1); END IF;
   UPDATE public.daily_briefing_jobs SET status='failed',billing=CASE WHEN billing='reserved' THEN 'refunded' ELSE billing END,lease_token=NULL,lease_until=NULL,error='生成重试耗尽',updated_at=now() WHERE id=job.id;
   CONTINUE;
  END IF;
  IF job.billing='none' THEN
   balance:=public.decrement_ai_chat_count(job.user_id);
   IF balance IS NULL THEN UPDATE public.daily_briefing_jobs SET status='skipped',error='余额不足',updated_at=now() WHERE id=job.id; CONTINUE; END IF;
  END IF;
  UPDATE public.daily_briefing_jobs SET status='generating',billing='reserved',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() WHERE id=job.id RETURNING * INTO job;
  RETURN NEXT job;
 END LOOP;
END;
$$;

CREATE FUNCTION public.settle_daily_briefing(p_id uuid,p_token uuid,p_content text,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.daily_briefing_jobs; conversation uuid;
BEGIN
 PERFORM public.agent_require_admin();
 SELECT * INTO job FROM public.daily_briefing_jobs WHERE id=p_id FOR UPDATE;
 IF job.id IS NULL OR job.status<>'generating' OR job.lease_token IS DISTINCT FROM p_token OR job.lease_until<=now() THEN RETURN false; END IF;
 IF job.deadline<=now() OR NOT EXISTS(SELECT 1 FROM public.reminder_subscriptions WHERE user_id=job.user_id AND reminder_type='daily_briefing' AND enabled) THEN
  p_content:=NULL; p_error:='当天截止或订阅已关闭'; job.attempts:=3;
 END IF;
 IF p_error IS NULL AND length(btrim(coalesce(p_content,'')))>=20 AND length(p_content)<=64000 THEN
  conversation:=public.create_conversation_with_messages(job.user_id,'早报 · '||job.local_date::text,'general',NULL,jsonb_build_object('kind','daily_briefing','jobId',job.id,'localDate',job.local_date,'timezone',job.timezone),
    jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'role','assistant','content',p_content,'createdAt',now(),'metadata',jsonb_build_object('dailyBriefingJobId',job.id))));
  UPDATE public.daily_briefing_jobs SET status='completed',billing='settled',content=p_content,result_conversation_id=conversation,notification_pending=true,lease_token=NULL,lease_until=NULL,error=NULL,updated_at=now() WHERE id=job.id;
 ELSE
  IF job.attempts>=3 AND job.billing='reserved' THEN PERFORM public.increment_ai_chat_count(job.user_id,1); END IF;
  UPDATE public.daily_briefing_jobs SET status=CASE WHEN job.attempts>=3 THEN 'failed' ELSE 'pending' END,billing=CASE WHEN job.attempts>=3 AND billing='reserved' THEN 'refunded' ELSE billing END,lease_token=NULL,lease_until=NULL,error=left(coalesce(p_error,'早报内容为空或无效'),500),updated_at=now() WHERE id=job.id;
 END IF;
 RETURN true;
END;
$$;

CREATE FUNCTION public.deliver_daily_briefing_notices(p_limit integer DEFAULT 50) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job public.daily_briefing_jobs; count_sent integer:=0;
BEGIN
 PERFORM public.agent_require_admin();
 FOR job IN SELECT * FROM public.daily_briefing_jobs WHERE status='completed' AND notification_pending ORDER BY created_at LIMIT least(greatest(p_limit,1),100) FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   IF NOT EXISTS(SELECT 1 FROM public.user_settings WHERE user_id=job.user_id AND (NOT notifications_enabled OR NOT notify_site)) AND job.result_conversation_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,type,title,content,link,event_key,event_data) VALUES(job.user_id,'system','你的早报已生成',job.local_date::text||' 的早报已送达，消耗 1 积分。','/chat?id='||job.result_conversation_id,'briefing:'||job.id,jsonb_build_object('conversationId',job.result_conversation_id,'briefingId',job.id)) ON CONFLICT(user_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
   END IF;
   UPDATE public.daily_briefing_jobs SET notification_pending=false WHERE id=job.id; count_sent:=count_sent+1;
  EXCEPTION WHEN OTHERS THEN NULL; -- Retry delivery only; keep the saved result and settled charge.
  END;
 END LOOP;
 RETURN count_sent;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_daily_briefings(integer,boolean),public.settle_daily_briefing(uuid,uuid,text,text),public.deliver_daily_briefing_notices(integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_briefings(integer,boolean),public.settle_daily_briefing(uuid,uuid,text,text),public.deliver_daily_briefing_notices(integer) TO service_role;
