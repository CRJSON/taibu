'use client';

import { useId, useMemo, useState } from 'react';
import { Maximize2, Orbit, PanelRightOpen, X } from 'lucide-react';
import { getAgentChart, getAgentToolText, type AgentChart, type AgentToolPart } from '@/lib/agent/tool-presentation';
import { REASONING_EFFORT_LABELS } from '@/lib/chat/model-settings';
import { AI_REASONING_EFFORTS, type AIReasoningEffort } from '@/types';
import { getBranchElement, getElementColor, getStemElement } from '@/lib/divination/display-helpers';
import { isAgentChartTool } from '@/lib/agent/tool-catalog';
import { ChartErrorBoundary } from '@/components/visualization/ChartRenderer';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { Modal } from '@/components/ui/Modal';
import { CanonicalChartView } from './CanonicalChartView';
import { useAgentResultWorkspace } from './AgentResultContext';
import './agent-results.css';
import { getChartFocus } from '@/lib/agent/chart-interaction';
import { parallelAnalysisResults } from '@/lib/agent/parallel-results';

function TextFallback({ tool, incomplete = false }: { tool: AgentToolPart; incomplete?: boolean }) {
  const text = getAgentToolText(tool);
  return <div className="agent-result-fallback">
    <p className="text-sm text-foreground-secondary">{incomplete ? '命盘数据不完整，已保留工具返回内容。' : '暂时无法显示命盘，已切换为工具返回文本。'}</p>
    <div className="agent-result-text" tabIndex={0} aria-label="工具返回文本">{text ? <MarkdownContent content={text} /> : <pre>{JSON.stringify(tool.output, null, 2) ?? '未返回命盘数据。'}</pre>}</div>
  </div>;
}

/** Bazi shows its four pillars in element colors; other readings show their kind. */
function ChartGlyph({ value }: { value: AgentChart | null }) {
  if (value?.kind !== 'bazi') return <span className="agent-result-glyph" aria-hidden="true"><Orbit size={18} /></span>;
  return <span className="agent-result-pillars" aria-hidden="true">{value.chart.四柱.map(pillar => {
    const [stem, branch] = [pillar.干支.charAt(0), pillar.干支.charAt(1)];
    const color = (element: ReturnType<typeof getStemElement>) => element ? { color: getElementColor(element) } : undefined;
    return <span key={pillar.柱} data-day-pillar={pillar.柱 === '日柱' ? 'true' : undefined}><span style={color(getStemElement(stem))}>{stem}</span><span style={color(getBranchElement(branch))}>{branch}</span></span>;
  })}</span>;
}

const effortLabel = (value?: string) => value === 'off' ? '不推理' : value && (AI_REASONING_EFFORTS as readonly string[]).includes(value) ? REASONING_EFFORT_LABELS[value as AIReasoningEffort] : null;

function chartSubtitle(value: AgentChart) {
  if (value.kind !== 'bazi') return value.summary;
  const basic = value.chart.基本信息;
  return [basic.性别, `日主 ${basic.日主}`, value.chart.干支关系[0]].filter(Boolean).join(' · ');
}

export function AgentToolResult({ tool, full = false }: { tool: AgentToolPart; full?: boolean }) {
  const id = useId();
  const workspace = useAgentResultWorkspace();
  const [expanded, setExpanded] = useState(false);
  const value = useMemo(() => getAgentChart(tool), [tool]);
  const analyses = tool.name === 'parallel_analysis' ? parallelAnalysisResults(tool.output) : [];
  if (analyses.length) return <section className="agent-result-list agent-collaboration-results" aria-label="协作分析">
    <header>
      <div><h3>协作分析</h3><p>各成员独立分析，主模型汇总分歧</p></div>
      {workspace && <button type="button" className="agent-primary-button" onClick={() => workspace.openResource(`tool:${tool.id}`)}><PanelRightOpen size={14} aria-hidden="true" />在工作区比较</button>}
    </header>
    {analyses.map(analysis => <details key={analysis.conversationId}>
      <summary><span>{analysis.name ?? analysis.system}<small>{[analysis.modelName ?? analysis.model ?? '主模型', effortLabel(analysis.reasoningEffort)].filter(Boolean).join(' · ')}</small></span>
        <span data-status={analysis.status}>{analysis.status === 'completed' ? '已完成' : analysis.status === 'failed' || tool.status === 'failed' ? '未完成' : '分析中'}</span></summary>
      {analysis.answer && <MarkdownContent content={analysis.answer} />}
    </details>)}
  </section>;
  if (tool.status !== 'completed') return null;
  const focus = getChartFocus(tool);
  if (focus) return <p className="agent-focus-receipt"><span>盘面已定位</span>{focus.caption}</p>;
  if (isAgentChartTool(tool.name) || tool.name === 'inspect_chart') {
    const title = value?.title ?? tool.title;
    const content = value ? <ChartErrorBoundary resetKey={tool.output} fallback={<TextFallback tool={tool} />}><CanonicalChartView value={value} text={getAgentToolText(tool) ?? undefined} /></ChartErrorBoundary> : <TextFallback tool={tool} incomplete />;
    if (full) return <section className="agent-result-full" aria-label={title}>{value && <p className="agent-result-summary">{value.summary}</p>}<div className="agent-chart-scroll" tabIndex={0} aria-label={`${title}内容`}>{content}</div></section>;
    // Calculations are cached task results until the final selection saves them; inspections read saved records.
    const status = tool.name === 'inspect_chart' ? '已存资料' : '暂存成果';
    return <article className="agent-result-card" data-tool-result={tool.id} data-result-kind={tool.name}>
      <header>
        <ChartGlyph value={value} />
        <div className="min-w-0 flex-1"><h3>{title}</h3><p className="agent-result-summary">{value ? `${chartSubtitle(value)} · ${status}` : '已保留工具返回内容'}</p></div>
        {workspace && <button type="button" className="agent-primary-button" onClick={() => workspace.openResource(`tool:${tool.id}`)}><PanelRightOpen size={14} aria-hidden="true" />在工作区查看</button>}
      </header>
      {value ? <div className="agent-result-preview" aria-hidden="true" inert>{content}</div> : <TextFallback tool={tool} incomplete />}
      <footer>
        <button type="button" className="agent-secondary-button" onClick={() => setExpanded(true)}><Maximize2 size={14} />展开{value ? '命盘' : '结果'}</button>
      </footer>
      <Modal open={expanded} onClose={() => setExpanded(false)} labelledBy={id} className="agent-chart-dialog">
        <header className="agent-chart-dialog-header"><div><h2 id={id}>{title}</h2><p className="agent-result-summary">{value?.summary}</p></div><button type="button" className="agent-icon-button" aria-label="关闭命盘" onClick={() => setExpanded(false)}><X size={20} /></button></header>
        <div className="agent-chart-dialog-body"><div className="agent-chart-scroll" tabIndex={0} aria-label={`${title}内容`}>{content}</div></div>
      </Modal>
    </article>;
  }
  return null;
}
