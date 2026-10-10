-- Agent chart identity includes the caller timezone and DST resolution policy.
-- Depends on the runtime and chart-time migrations; Durable augments this function later.
BEGIN;

-- Keep Agent lease/fence, owner and transaction boundaries intact. Time rules
-- are part of chart identity, including when finishing pre-migration artifacts.
CREATE OR REPLACE FUNCTION public.agent_finish_run(p_run_id uuid,p_worker_id text,p_fence bigint,p_status text,p_checkpoint jsonb,p_message jsonb,p_record jsonb DEFAULT NULL)
RETURNS public.agent_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_runs; a public.agent_run_artifacts; final_id uuid; v_chart_id uuid; chart_table text; selected text; final_status text; record_body text; chart_timezone text; chart_disambiguation text;
BEGIN
  r:=public.agent_require_lease(p_run_id,p_worker_id,p_fence);
  IF p_status NOT IN ('completed','awaiting_input','failed','cancelled') THEN RAISE EXCEPTION 'AGENT_INVALID_STATUS'; END IF;
  final_status:=CASE WHEN r.cancel_requested THEN 'cancelled' ELSE p_status END;
  -- A command accepted while the final model turn was settling must be drained
  -- before success/save. Row locking makes acceptance and settlement atomic.
  IF final_status IN ('completed','awaiting_input') AND EXISTS(SELECT 1 FROM public.agent_run_commands WHERE run_id=p_run_id AND NOT consumed) THEN
    final_status:='queued';
  END IF;
  IF final_status='completed' AND p_record IS NOT NULL AND r.record_id IS NULL THEN
    record_body:=coalesce(p_record->>'content','');
    FOR selected IN SELECT jsonb_array_elements_text(coalesce(p_checkpoint->'finalArtifacts','[]')) LOOP
      SELECT * INTO a FROM public.agent_run_artifacts WHERE id=selected::uuid AND run_id=p_run_id AND kind='calculation';
      IF NOT FOUND THEN RAISE EXCEPTION 'AGENT_ARTIFACT_NOT_FOUND'; END IF;
      record_body:=record_body||E'\n\n'||coalesce(a.result->>'canonicalText','');
      IF a.chart_payload IS NOT NULL AND a.tool_name IN ('bazi','ziwei') THEN
        chart_table:=CASE WHEN a.tool_name='bazi' THEN 'bazi_charts' ELSE 'ziwei_charts' END;
        chart_timezone:=coalesce(nullif(btrim(a.chart_payload->>'timezone'),''),'Asia/Shanghai');
        chart_disambiguation:=coalesce(a.chart_payload->>'disambiguation','reject');
        -- Serialize matching/insertion across tasks of this owner as well as within this run.
        PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(r.user_id,chart_table,a.chart_payload->>'birth_date',a.chart_payload->>'birth_time',a.chart_payload->>'gender',a.chart_payload->>'calendar_type',coalesce((a.chart_payload->>'is_leap_month')::boolean,false),a.chart_payload->>'longitude',chart_timezone,chart_disambiguation)::text,0));
        EXECUTE format('SELECT id FROM public.%I WHERE user_id=$1 AND birth_date=$2::date AND birth_time=$3 AND gender IS NOT DISTINCT FROM $4 AND calendar_type=$5 AND coalesce(is_leap_month,false)=$6 AND longitude IS NOT DISTINCT FROM $7 AND timezone=$8 AND disambiguation=$9 LIMIT 1',chart_table)
          INTO v_chart_id USING r.user_id,a.chart_payload->>'birth_date',a.chart_payload->>'birth_time',a.chart_payload->>'gender',a.chart_payload->>'calendar_type',coalesce((a.chart_payload->>'is_leap_month')::boolean,false),(a.chart_payload->>'longitude')::double precision,chart_timezone,chart_disambiguation;
        IF v_chart_id IS NULL THEN
          EXECUTE format('INSERT INTO public.%I(user_id,name,birth_date,birth_time,gender,calendar_type,is_leap_month,birth_place,longitude,timezone,disambiguation) VALUES($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',chart_table)
            INTO v_chart_id USING r.user_id,a.chart_payload->>'name',a.chart_payload->>'birth_date',a.chart_payload->>'birth_time',a.chart_payload->>'gender',a.chart_payload->>'calendar_type',coalesce((a.chart_payload->>'is_leap_month')::boolean,false),a.chart_payload->>'birth_place',(a.chart_payload->>'longitude')::double precision,chart_timezone,chart_disambiguation;
          IF a.tool_name='bazi' THEN
            UPDATE public.bazi_charts SET day_master=a.chart_payload->>'day_master',day_branch=a.chart_payload->>'day_branch' WHERE id=v_chart_id;
          END IF;
        END IF;
        UPDATE public.agent_run_artifacts SET chart_id=v_chart_id,chart_type=a.tool_name WHERE id=a.id;
        p_message:=jsonb_set(p_message,'{agent,parts}',coalesce(p_message#>'{agent,parts}','[]')||jsonb_build_array(jsonb_build_object('type','artifact','id',a.id,'title',a.chart_payload->>'name','chartId',v_chart_id,'chartType',a.tool_name)));
        v_chart_id:=NULL;
      END IF;
    END LOOP;
    INSERT INTO public.ming_records(user_id,title,content,category,tags)
      VALUES(r.user_id,coalesce(nullif(p_record->>'title',''),'Agent 分析'),record_body,'general',ARRAY['Agent']) RETURNING id INTO final_id;
    r.record_id:=final_id;
    p_message:=jsonb_set(p_message,'{agent,parts}',coalesce(p_message#>'{agent,parts}','[]')||jsonb_build_array(jsonb_build_object('type','artifact','id',final_id,'title','已保存分析记录','recordId',final_id)));
  END IF;
  IF final_status IN ('failed','cancelled') AND r.billing='charged' AND coalesce(btrim(p_message->>'content'),'')='' AND r.record_id IS NULL THEN
    IF public.increment_ai_chat_count(r.user_id,1) IS NULL THEN RAISE EXCEPTION 'AGENT_REFUND_FAILED'; END IF;
    r.billing:='refunded';
  END IF;
  p_message:=jsonb_set(p_message,'{agent,status}',to_jsonb(final_status));
  UPDATE public.agent_runs SET status=final_status,checkpoint=p_checkpoint,public_message=p_message,billing=r.billing,record_id=r.record_id,
    lease_until=NULL,worker_id=NULL,updated_at=now() WHERE id=p_run_id RETURNING * INTO r;
  IF final_status IN ('completed','failed','cancelled') THEN DELETE FROM public.agent_run_credentials WHERE run_id=p_run_id; END IF;
  PERFORM public.agent_emit(p_run_id,final_status);
  PERFORM public.agent_sync_message(p_run_id);
  SELECT * INTO r FROM public.agent_runs WHERE id=p_run_id;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.agent_finish_run(uuid,text,bigint,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_finish_run(uuid,text,bigint,text,jsonb,jsonb,jsonb) TO authenticated,service_role;

COMMIT;
