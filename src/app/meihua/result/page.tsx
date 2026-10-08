'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, Flower2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MeihuaChart } from '@/components/meihua/MeihuaChart';
import { CanonicalAISection } from '@/components/divination/CanonicalAISection';
import { SoundWaveLoader } from '@/components/ui/SoundWaveLoader';
import { useToast } from '@/components/ui/Toast';
import { useAdminJsonCopy } from '@/lib/admin/useAdminJsonCopy';
import { readSessionJSON, updateSessionJSON } from '@/lib/cache/session-storage';
import { requestBrowserJson } from '@/lib/browser-api';
import { buildMeihuaCanonicalText, type MeihuaWebBundle } from '@/lib/divination/meihua';
import { saveDivinationAction } from '@/lib/divination/save-client';
import { useSessionMembership } from '@/lib/hooks/useSessionMembership';

type MeihuaSession = {
  input?: MeihuaWebBundle['input'];
  resultData?: MeihuaWebBundle;
  divinationId?: string;
  conversationId?: string;
};

export default function MeihuaResultPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { userId, sessionLoading } = useSessionMembership();
  const [bundle, setBundle] = useState<MeihuaWebBundle | null>(null);
  const [divinationId, setDivinationId] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAutoSavedRef = useRef(false);

  const canonicalJson = useMemo(() => bundle?.canonicalJson ?? null, [bundle]);
  const { isAdmin, jsonCopied, copyJson } = useAdminJsonCopy(canonicalJson);

  const persistSessionIds = useCallback((next: { divinationId?: string; conversationId?: string }) => {
    updateSessionJSON<MeihuaSession>('meihua_result', (previous) => ({ ...(previous || {}), ...next }));
  }, []);

  const saveRecord = useCallback(async (nextBundle: MeihuaWebBundle) => {
    const saved = await saveDivinationAction({
      endpoint: '/api/meihua',
      body: { input: nextBundle.input, resultData: nextBundle },
      idKey: 'divinationId',
      fallbackMessage: '保存梅花记录失败',
    });
    if (saved.ok && saved.id) {
      setDivinationId(saved.id);
      persistSessionIds({ divinationId: saved.id });
      return saved.id;
    }
    if (!saved.ok) console.error('[meihua/result] 保存失败:', saved.error.message);
    return undefined;
  }, [persistSessionIds]);

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;
    const init = async () => {
      const session = readSessionJSON<MeihuaSession>('meihua_result');
      if (!session?.resultData && !session?.input) {
        router.replace('/meihua');
        return;
      }
      try {
        let nextBundle = session.resultData;
        if (!nextBundle && session.input) {
          const response = await requestBrowserJson<MeihuaWebBundle>('/api/meihua', {
            method: 'POST',
            body: JSON.stringify({ action: 'calculate', input: session.input }),
          });
          if (response.error || !response.data) throw new Error(response.error?.message || '排盘失败');
          nextBundle = response.data;
        }
        if (cancelled || !nextBundle) return;
        setBundle(nextBundle);
        if (session.divinationId) setDivinationId(session.divinationId);
        if (session.conversationId) setConversationId(session.conversationId);
        if (!session.divinationId && userId && !hasAutoSavedRef.current) {
          hasAutoSavedRef.current = true;
          await saveRecord(nextBundle);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '排盘失败');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void init();
    return () => { cancelled = true; };
  }, [router, saveRecord, sessionLoading, userId]);

  const handleCopy = async () => {
    if (!bundle) return;
    try {
      await navigator.clipboard.writeText(buildMeihuaCanonicalText(bundle.result));
      setCopied(true);
      showToast('success', '规范文本已复制');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('error', '复制失败，请重试');
    }
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><SoundWaveLoader variant="block" text="正在排盘" /></div>;
  if (!bundle) return <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-5"><p className="text-sm text-foreground-secondary">{error || '没有找到排盘数据'}</p><button type="button" onClick={() => router.push('/meihua')} className="px-4 py-2 border border-border rounded-md text-sm hover:bg-background-secondary">返回</button></div>;

  const result = bundle.result;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        <header className="flex items-center justify-between border-b border-border/60 pb-5">
          <div className="flex items-center gap-3">
            <Link href="/meihua" aria-label="返回梅花输入页" title="返回梅花输入页" className="p-2 rounded-md text-foreground-secondary hover:bg-background-secondary active:bg-background-secondary/80 transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
            <div className="flex items-center gap-2"><Flower2 className="w-4 h-4 text-accent" /><h1 className="text-lg font-bold">梅花易数</h1></div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => router.push('/meihua')} aria-label="重新起卦" title="重新起卦" className="p-2 rounded-md text-foreground-secondary hover:bg-background-secondary active:bg-background-secondary/80 transition-colors"><RotateCcw className="w-4 h-4" /></button>
            <button type="button" onClick={() => void handleCopy()} aria-label="复制规范文本" title="复制规范文本" className="p-2 rounded-md text-foreground-secondary hover:bg-background-secondary active:bg-background-secondary/80 transition-colors">{copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</button>
            {isAdmin && <button type="button" onClick={() => void copyJson()} aria-label="复制规范 JSON" title="复制规范 JSON" className="p-2 rounded-md text-foreground-secondary hover:bg-background-secondary active:bg-background-secondary/80 transition-colors">{jsonCopied ? <Check className="w-4 h-4 text-success" /> : <span className="text-[10px] font-mono">JSON</span>}</button>}
          </div>
        </header>

        <section className="border border-border rounded-md p-5 sm:p-6 bg-background-secondary/20">
          <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
            <div><div className="text-xs text-foreground-secondary mb-1">占问</div><h2 className="text-xl font-bold">{result.question}</h2></div>
            <span className="text-xs text-foreground-secondary">{bundle.input.date}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><span className="block text-foreground-secondary mb-1">起卦方式</span><b>{result.castMeta.methodLabel}</b></div>
            <div><span className="block text-foreground-secondary mb-1">动爻</span><b>第 {result.movingLine} 爻</b></div>
            <div><span className="block text-foreground-secondary mb-1">体卦 / 用卦</span><b>{result.bodyTrigram.name} / {result.useTrigram.name}</b></div>
            <div><span className="block text-foreground-secondary mb-1">判断</span><b className={result.judgement.outcome === '吉' ? 'text-success' : result.judgement.outcome === '凶' ? 'text-danger' : 'text-warning'}>{result.judgement.outcome}</b></div>
          </div>
        </section>

        <MeihuaChart chart={bundle.canonicalJson} />

        <section className="grid gap-3 lg:grid-cols-2">
          <article className="border border-border rounded-md p-5 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-foreground-secondary">体用关系</h2>
            <div className="flex items-center gap-3"><span className="text-2xl font-bold">{result.bodyUseRelation.relation}</span><span className="text-xs text-foreground-secondary">{result.bodyUseRelation.favorable ? '偏有利' : '需谨慎'}</span></div>
            <p className="text-sm leading-relaxed text-foreground/70">{result.bodyUseRelation.summary}</p>
            <div className="grid grid-cols-2 gap-3 text-xs"><div><span className="block text-foreground-secondary mb-1">体卦</span><b>{result.bodyTrigram.name} · {result.bodyTrigram.element}</b></div><div><span className="block text-foreground-secondary mb-1">用卦</span><b>{result.useTrigram.name} · {result.useTrigram.element}</b></div></div>
          </article>
          <article className="border border-border rounded-md p-5 space-y-4">
            <h2 className="text-xs font-bold tracking-widest text-foreground-secondary">判断参考</h2>
            <p className="text-sm leading-relaxed text-foreground/70">{result.judgement.summary}</p>
            <ul className="space-y-2 text-xs text-foreground-secondary list-disc pl-4">{result.judgement.basis.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </section>

        {result.timingHints.length > 0 && <section className="border border-border rounded-md p-5"><h2 className="text-xs font-bold tracking-widest text-foreground-secondary mb-4">阶段推演</h2><div className="grid gap-2 sm:grid-cols-3">{result.timingHints.map((hint) => <div key={`${hint.phase}:${hint.trigger}`} className="p-3 bg-background-secondary/40 rounded-md"><div className="text-xs font-semibold mb-1">{hint.trigger}</div><p className="text-xs text-foreground-secondary leading-relaxed">{hint.summary}</p></div>)}</div></section>}

        {result.warnings.length > 0 && <div className="text-xs text-warning border-l-2 border-warning/50 pl-3 space-y-1">{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}

        <CanonicalAISection endpoint="/api/meihua" resultData={bundle} recordId={divinationId} conversationId={conversationId} historyType="meihua" sessionKey="meihua_result" onConversationId={(id) => { setConversationId(id); persistSessionIds({ conversationId: id }); }} />
      </div>
    </div>
  );
}
