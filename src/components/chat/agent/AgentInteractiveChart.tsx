'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, RotateCcw } from 'lucide-react';
import type { AgentChart, AgentToolPart } from '@/lib/agent/tool-presentation';
import { getAgentToolText } from '@/lib/agent/tool-presentation';
import { chartQuestion, getChartTargets, type ChartFocus } from '@/lib/agent/chart-interaction';
import { ChartErrorBoundary } from '@/components/visualization/ChartRenderer';
import { CanonicalChartView } from './CanonicalChartView';
import './agent-results.css';

export function AgentInteractiveChart({ value, tool, reference, focus, followModel, pinned = false, onManual, onAsk }: {
  value: AgentChart; tool: AgentToolPart; reference: string | null; focus?: ChartFocus | null; followModel: boolean;
  /** The focus was opened from its step or a citation: show and reveal it even while not following. */
  pinned?: boolean;
  onManual: () => void; onAsk?: (text: string) => void;
}) {
  const targets = useMemo(() => getChartTargets(value), [value]);
  const snapshot = useMemo(() => JSON.stringify(value.chart), [value.chart]);
  const [manual, setManual] = useState<{ snapshot: string; ids: string[]; related: boolean } | null>(null);
  const currentManual = manual?.snapshot === snapshot ? manual : null;
  const model = focus?.reference === reference ? focus : null;
  const ids = !followModel && currentManual ? currentManual.ids : model?.targetIds ?? [];
  const related = !followModel && currentManual ? currentManual.related : model?.includeRelated ?? true;
  const selected = targets.filter(target => ids.includes(target.id));
  const viewportRef = useRef<HTMLDivElement>(null);
  const first = selected[0];
  const scrollTarget = first?.kind === 'bazi_relation'
    ? targets.find(target => target.kind === 'bazi_cell' && first.relation.位置.some(cell => target.cell.柱 === cell.柱 && target.cell.部位 === cell.部位))?.id
    : first?.id;
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !(followModel || pinned) || !scrollTarget) return;
    const reveal = () => {
      const target = [...viewport.querySelectorAll<HTMLElement>('[data-chart-target]')].find(node => node.dataset.chartTarget === scrollTarget);
      if (!target) return false;
      const bounds = viewport.getBoundingClientRect(), cell = target.getBoundingClientRect();
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      if (cell.left < bounds.left || cell.right > bounds.right) viewport.scrollBy({ left: cell.left - bounds.left - bounds.width / 2 + cell.width / 2, behavior });
      const panel = viewport.closest<HTMLElement>('.agent-panel-scroll');
      if (panel) {
        const visible = panel.getBoundingClientRect();
        if (cell.top < visible.top || cell.bottom > visible.bottom) panel.scrollBy({ top: cell.top - visible.top - visible.height / 2 + cell.height / 2, behavior });
      }
      return true;
    };
    if (reveal()) return;
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
    observer.observe(viewport, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scrollTarget, followModel, pinned]);
  const select = (id: string) => { onManual(); setManual({ snapshot, ids: [id], related }); };
  const relations = targets.filter(target => target.kind === 'bazi_relation');
  return <section className="agent-interactive-chart" aria-label={value.title}>
    <header className="agent-board-heading"><div><h3>{value.title}</h3><p>{value.summary}</p></div>
      <button type="button" className="agent-icon-button" aria-label="清除盘面高亮" onClick={() => { onManual(); setManual({ snapshot, ids: [], related }); }}><RotateCcw size={15} /></button>
    </header>
    <div className="agent-board-focus" aria-live="polite" data-chart-focus={selected.map(target => target.id).join(',')}>
      <span>{followModel && model ? '当前分析' : pinned && model && !currentManual ? '分析位置' : selected.length ? '正在查看' : '命盘全览'}</span>
      <strong>{(followModel || (pinned && !currentManual)) && model ? model.caption : selected.map(target => target.label).join('、') || '选择盘面中的位置，继续了解'}</strong>
    </div>
    {['ziwei', 'daliuren', 'astrology'].includes(value.kind) && <label className="agent-board-related"><input type="checkbox" checked={related} onChange={event => {
      onManual(); setManual({ snapshot, ids, related: event.target.checked });
    }} />{value.kind === 'ziwei' ? '三方四正' : '关联位置'}</label>}
    <div ref={viewportRef} className="agent-chart-scroll" tabIndex={0} aria-label={value.title + '内容'}>
      <ChartErrorBoundary resetKey={value.chart} fallback={<pre className="agent-board-fallback">{getAgentToolText(tool) ?? '命盘数据暂时无法显示'}</pre>}>
        <CanonicalChartView value={value} targets={selected} includeRelated={related} onTargetSelect={select} />
      </ChartErrorBoundary>
    </div>
    {selected.some(target => target.kind === 'bazi_relation') && <div className="agent-board-relation-path">
      {selected.flatMap(target => target.kind === 'bazi_relation' ? [<p key={target.id}>{target.relation.位置.map(cell => cell.柱 + cell.部位 + cell.字).join(' ↔ ')}<strong>{target.relation.类型}</strong></p>] : [])}
    </div>}
    {value.kind === 'bazi' && <details className="agent-board-relations" open>
      <summary>干支关系 <span>{relations.length}</span></summary>
      {relations.length ? <div>{relations.map(target => <button type="button" key={target.id} data-chart-target={target.id}
        aria-pressed={ids.includes(target.id)} onClick={() => select(target.id)}>{target.label}</button>)}</div>
        : <p>{value.chart.干支关系.join('；') || '此盘未返回干支关系。'}</p>}
      {!value.chart.干支关系明细 && <p>此历史盘仅保留关系文本，可选择天干或地支查看。</p>}
    </details>}
    {reference && onAsk && <footer className="agent-board-actions"><button type="button" className="agent-secondary-button" onClick={() => onAsk(chartQuestion(reference, selected))}>
      <MessageCircle size={14} />{selected.length ? '追问当前位置' : '追问这张命盘'}</button><span>填入输入框后发送</span></footer>}
  </section>;
}
