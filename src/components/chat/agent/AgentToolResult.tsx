'use client';

import { useId, useMemo, useState } from 'react';
import { ArrowUpRight, Maximize2, PanelRightOpen, X } from 'lucide-react';
import { getAgentChart, getAgentDataResults, getAgentSearchResults, getAgentToolText, isAgentChartTool, type AgentToolPart } from '@/lib/agent/tool-presentation';
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

export function AgentToolResult({ tool, full = false }: { tool: AgentToolPart; full?: boolean }) {
  const id = useId();
  const workspace = useAgentResultWorkspace();
  const [expanded, setExpanded] = useState(false);
  const value = useMemo(() => getAgentChart(tool), [tool]);
  const analyses = tool.name === 'parallel_analysis' ? parallelAnalysisResults(tool.output) : [];
  if (analyses.length) return <section className="agent-result-list agent-collaboration-results" aria-label="协作分析">
    <h3>协作分析 <span>{analyses.length}</span></h3>
    {analyses.map(analysis => <details key={analysis.conversationId}>
      <summary><span>{analysis.name ?? analysis.system}<small>{analysis.modelName ?? analysis.model ?? '主模型'}</small></span>
        <span>{analysis.status === 'completed' ? '已完成' : analysis.status === 'failed' || tool.status === 'failed' ? '未完成' : '分析中'}</span></summary>
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
    return <article className="agent-result-card" data-tool-result={tool.id} data-result-kind={tool.name}>
      <header><div><h3>{title}</h3><p className="agent-result-summary">{value?.summary ?? '已保留工具返回内容'}</p></div><span className="agent-result-badge">已生成</span></header>
      {value ? <div className="agent-result-preview" aria-hidden="true" inert>{content}</div> : <TextFallback tool={tool} incomplete />}
      <footer>
        <button type="button" className="agent-secondary-button" onClick={() => setExpanded(true)}><Maximize2 size={14} />展开{value ? '命盘' : '结果'}</button>
        {workspace && <button type="button" className="agent-secondary-button" onClick={() => workspace.openResource(`tool:${tool.id}`)}><PanelRightOpen size={14} />固定到工作区</button>}
      </footer>
      <Modal open={expanded} onClose={() => setExpanded(false)} labelledBy={id} className="agent-chart-dialog">
        <header className="agent-chart-dialog-header"><div><h2 id={id}>{title}</h2><p className="agent-result-summary">{value?.summary}</p></div><button type="button" className="agent-icon-button" aria-label="关闭命盘" onClick={() => setExpanded(false)}><X size={20} /></button></header>
        <div className="agent-chart-dialog-body"><div className="agent-chart-scroll" tabIndex={0} aria-label={`${title}内容`}>{content}</div></div>
      </Modal>
    </article>;
  }
  const search = getAgentSearchResults(tool);
  if (search) return <section className="agent-result-list" aria-label={tool.name === 'web_search' ? '查询来源' : '知识库结果'}>
    <h3>{tool.name === 'web_search' ? '查询来源' : '知识库结果'} <span>{search.length}</span></h3>
    {search.length ? search.map(result => <details key={result.id}><summary>{result.url ? <a href={result.url} target="_blank" rel="noopener noreferrer">{result.title}<ArrowUpRight size={13} /></a> : <span>{result.title}</span>}</summary><MarkdownContent content={result.content} /></details>) : <p className="text-sm text-foreground-secondary">没有找到匹配资料。</p>}
  </section>;
  const records = getAgentDataResults(tool);
  if (records) return <section className="agent-result-list" aria-label="个人资料查询结果">
    <h3>个人资料 <span>{records.items.length}</span></h3>
    {records.items.map(item => <details key={`${item.type}:${item.id}`}><summary>{item.name}</summary><p className="text-sm text-foreground-secondary">{item.preview}</p></details>)}
    {!records.items.length && <p className="text-sm text-foreground-secondary">暂无已保存资料。</p>}
    {records.errors.map((error, index) => <p key={index} className="text-sm text-warning">{error}</p>)}
  </section>;
  if (tool.name === 'read_user_data' && getAgentToolText(tool)) return <section className="agent-result-list" aria-label="已读取资料"><h3>已读取资料</h3><div className="agent-result-text" tabIndex={0}><MarkdownContent content={getAgentToolText(tool)!} /></div></section>;
  return null;
}
