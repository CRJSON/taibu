'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, RotateCcw, Waypoints } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { XiaoliurenChart } from '@/components/xiaoliuren/XiaoliurenChart';
import { CanonicalAISection } from '@/components/divination/CanonicalAISection';
import { LUNAR_DAY_NAMES, LUNAR_MONTH_NAMES } from '@/components/bazi/form/options';
import { SoundWaveLoader } from '@/components/ui/SoundWaveLoader';
import { useToast } from '@/components/ui/Toast';
import { useAdminJsonCopy } from '@/lib/admin/useAdminJsonCopy';
import { readSessionJSON, updateSessionJSON } from '@/lib/cache/session-storage';
import { buildXiaoliurenCanonicalText, type XiaoliurenWebBundle } from '@/lib/divination/xiaoliuren';
import { saveDivinationAction } from '@/lib/divination/save-client';
import { useSessionMembership } from '@/lib/hooks/useSessionMembership';

type XiaoliurenSession = { resultData?: XiaoliurenWebBundle; divinationId?: string; conversationId?: string };

export default function XiaoliurenResultPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { userId, sessionLoading } = useSessionMembership();
  const [bundle, setBundle] = useState<XiaoliurenWebBundle | null>(null);
  const [divinationId, setDivinationId] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const hasAutoSavedRef = useRef(false);
  const canonicalJson = useMemo(() => bundle?.canonicalJson ?? null, [bundle]);
  const { isAdmin, jsonCopied, copyJson } = useAdminJsonCopy(canonicalJson);

  const persistSessionIds = useCallback((next: { divinationId?: string; conversationId?: string }) => {
    updateSessionJSON<XiaoliurenSession>('xiaoliuren_result', (previous) => ({ ...(previous || {}), ...next }));
  }, []);

  const saveRecord = useCallback(async (nextBundle: XiaoliurenWebBundle) => {
    const saved = await saveDivinationAction({ endpoint: '/api/xiaoliuren', body: { resultData: nextBundle }, idKey: 'divinationId', fallbackMessage: '保存小六壬记录失败' });
    if (saved.ok && saved.id) {
      setDivinationId(saved.id);
      persistSessionIds({ divinationId: saved.id });
      return saved.id;
    }
    if (!saved.ok) console.error('[xiaoliuren/result] 保存失败:', saved.error.message);
    return undefined;
  }, [persistSessionIds]);

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    const init = async () => {
      await Promise.resolve();
      const session = readSessionJSON<XiaoliurenSession>('xiaoliuren_result');
      if (!session?.resultData) {
        router.replace('/xiaoliuren');
        return;
      }
      if (cancelled) return;
      setBundle(session.resultData);
      if (session.divinationId) setDivinationId(session.divinationId);
      if (session.conversationId) setConversationId(session.conversationId);
      if (!session.divinationId && userId && !hasAutoSavedRef.current) {
        hasAutoSavedRef.current = true;
        void saveRecord(session.resultData);
      }
      setIsLoading(false);
    };
    void init();
    return () => { cancelled = true; };
  }, [router, saveRecord, sessionLoading, userId]);

  const handleCopy = async () => {
    if (!bundle) return;
    try {
      await navigator.clipboard.writeText(buildXiaoliurenCanonicalText(bundle.result));
      setCopied(true);
      showToast('success', '规范文本已复制');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('error', '复制失败，请重试');
    }
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><SoundWaveLoader variant="block" text="正在排课" /></div>;
  if (!bundle) return <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-5"><p className="text-sm text-foreground-secondary">没有找到起课数据</p><button type="button" onClick={() => router.push('/xiaoliuren')} className="px-4 py-2 border border-border rounded-md text-sm hover:bg-background-secondary">返回</button></div>;

  const result = bundle.result;
  const lunarMonthLabel = bundle.lunarMonthName
    ? `${bundle.lunarMonthName}月`
    : `${bundle.isLeapMonth ? '闰' : ''}${LUNAR_MONTH_NAMES[bundle.lunarMonth] ?? `${bundle.lunarMonth}月`}`;
  const lunarDayLabel = bundle.lunarDayName ?? LUNAR_DAY_NAMES[bundle.lunarDay] ?? `${bundle.lunarDay}日`;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        <header className="flex items-center justify-between border-b border-border/60 pb-5">
          <div className="flex items-center gap-3"><Link href="/xiaoliuren" aria-label="返回小六壬输入页" title="返回小六壬输入页" className="p-2 rounded-md text-foreground-secondary hover:bg-background-secondary active:bg-background-secondary/80 transition-colors"><ArrowLeft className="w-4 h-4" /></Link><div className="flex items-center gap-2"><Waypoints className="w-4 h-4 text-accent" /><h1 className="text-lg font-bold">小六壬</h1></div></div>
          <div className="flex items-center gap-1"><button type="button" onClick={() => router.push('/xiaoliuren')} aria-label="重新起课" title="重新起课" className="p-2 rounded-md text-foreground-secondary hover:bg-background-secondary active:bg-background-secondary/80 transition-colors"><RotateCcw className="w-4 h-4" /></button><button type="button" onClick={() => void handleCopy()} aria-label="复制规范文本" title="复制规范文本" className="p-2 rounded-md text-foreground-secondary hover:bg-background-secondary active:bg-background-secondary/80 transition-colors">{copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</button>{isAdmin && <button type="button" onClick={() => void copyJson()} aria-label="复制规范 JSON" title="复制规范 JSON" className="p-2 rounded-md text-foreground-secondary hover:bg-background-secondary active:bg-background-secondary/80 transition-colors">{jsonCopied ? <Check className="w-4 h-4 text-success" /> : <span className="text-[10px] font-mono">JSON</span>}</button>}</div>
        </header>

        <section className="border border-border rounded-md p-5 sm:p-6 bg-background-secondary/20">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5"><div><div className="text-xs text-foreground-secondary mb-1">占问</div><h2 className="text-xl font-bold">{result.question || '未填写占问'}</h2></div><span className="text-xs text-foreground-secondary">{bundle.solarDateTime}</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"><div><span className="block text-foreground-secondary mb-1">农历月</span><b>{lunarMonthLabel}</b></div><div><span className="block text-foreground-secondary mb-1">农历日</span><b>{lunarDayLabel}</b></div><div><span className="block text-foreground-secondary mb-1">时辰</span><b>{result.input.shichen}</b></div><div><span className="block text-foreground-secondary mb-1">最终落宫</span><b className="text-success">{result.hourStatus}</b></div></div>
        </section>

        <XiaoliurenChart chart={bundle.canonicalJson} />

        <CanonicalAISection endpoint="/api/xiaoliuren" resultData={bundle} recordId={divinationId} conversationId={conversationId} historyType="xiaoliuren" sessionKey="xiaoliuren_result" onConversationId={(id) => { setConversationId(id); persistSessionIds({ conversationId: id }); }} />
      </div>
    </div>
  );
}
