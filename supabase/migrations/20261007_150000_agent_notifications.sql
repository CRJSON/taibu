-- Waiting for input must not repeatedly lease a run just because a follow-up is held.
DO $migration$
DECLARE definition text; old_guard text := 'AND NOT (final_status=''awaiting_input'' AND p_checkpoint#>>''{durable,engine}''=''pi-durable/1.0.4'' AND durable_admitted)';
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.agent_finish_run(uuid,text,bigint,text,jsonb,jsonb,jsonb)'::regprocedure) INTO definition;
  IF position(old_guard IN definition)=0 THEN RAISE EXCEPTION 'Review agent_finish_run before replacing question queue guard'; END IF;
  EXECUTE replace(definition,old_guard,'AND (final_status<>''awaiting_input'' OR (mode=''reply'' AND NOT durable_admitted))');
END; $migration$;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_key text, ADD COLUMN IF NOT EXISTS event_data jsonb, ADD COLUMN IF NOT EXISTS popup_claimed_at timestamptz;
CREATE UNIQUE INDEX notifications_owner_event ON public.notifications(user_id,event_key) WHERE event_key IS NOT NULL;
CREATE FUNCTION public.agent_task_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE event text; heading text; target_message text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('completed','failed','awaiting_input') THEN RETURN NEW; END IF;
  IF NOT coalesce((SELECT notifications_enabled AND notify_site FROM public.user_settings WHERE user_id=NEW.user_id),true) THEN RETURN NEW; END IF;
  event:='agent:'||NEW.id::text||':'||NEW.status||CASE WHEN NEW.status='awaiting_input' THEN ':'||coalesce(NEW.checkpoint->>'questionId','legacy') ELSE '' END;
  heading:=CASE NEW.status WHEN 'completed' THEN '太卜任务完成' WHEN 'failed' THEN '太卜任务未完成' ELSE '太卜需要你补充信息' END;
  target_message:=NEW.public_message->>'id';
  INSERT INTO public.notifications(user_id,type,title,content,link,event_key,event_data)
    VALUES(NEW.user_id,'system',heading,coalesce(NEW.input->>'title','打开对话查看任务'),'/chat?id='||NEW.conversation_id::text||'&message='||coalesce(target_message,''),event,jsonb_build_object('kind','agent','conversationId',NEW.conversation_id,'messageId',target_message,'questionId',NEW.checkpoint->>'questionId','status',NEW.status))
    ON CONFLICT(user_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER agent_task_notice AFTER UPDATE OF status ON public.agent_runs FOR EACH ROW EXECUTE FUNCTION public.agent_task_notification();
CREATE FUNCTION public.claim_notification_popup(p_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE affected integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  UPDATE public.notifications SET popup_claimed_at=now() WHERE id=p_id AND user_id=auth.uid() AND NOT is_read AND popup_claimed_at IS NULL AND event_key IS NOT NULL;
  GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_task_notification(),public.claim_notification_popup(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.claim_notification_popup(uuid) TO authenticated;
