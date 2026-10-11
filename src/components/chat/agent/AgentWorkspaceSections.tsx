'use client';
// 需要点击事件在工作区内切换标签，并派发导出对话事件

import { ArrowUpRight, BookOpen, Calculator, CircleHelp, Database, Download, Files, FileText, Globe, ListChecks, Search, Users, Wrench, type LucideIcon } from 'lucide-react';
import type { AgentMessageData, AgentPart, AgentRunView } from '@/lib/agent/types';
import { getAgentToolFamily } from '@/lib/agent/tool-catalog';
import { getAgentChart, getAgentFinalSelection, getAgentSearchResults, getAgentToolArtifactId, getAgentUnrepresentedArtifacts, type AgentToolPart } from '@/lib/agent/tool-presentation';
import type { AgentWorkspaceModel, AgentWorkspaceResource } from '@/lib/agent/workspace';
import { REASONING_EFFORT_LABELS } from '@/lib/chat/model-settings';
import { requestConversationExport } from '@/lib/chat/conversation-export';
import { AgentArtifactCard } from './AgentArtifactCard';
import { AgentStatus } from './AgentStatus';
import { AgentActivityIndicator } from './AgentActivityGroup';
import { AgentContextDetails } from './AgentContextUsage';
import { formatAgentToolDuration, getAgentArtifactHref, getAgentResponseTiming, getAgentToolState, summarizeAgentTool, type AgentArtifact } from './presentation';

export const WORKSPACE_ICONS: Record<AgentWorkspaceResource['family'], LucideIcon> = {
    chart: Calculator, calculation: Calculator, search: Search, data: Database, method: BookOpen, plan: ListChecks,
    question: CircleHelp, collaboration: Users, memory: Database, artifacts: ListChecks, external: Globe, other: Wrench,
    saved: Files, attachment: FileText,
};

const BILLING_LABELS: Record<NonNullable<AgentRunView['billing']>, string> = {
    charged: '本任务计费 1 次，补充与续问不再扣费',
    exempt: '使用自定义模型，不扣平台积分',
    refunded: '未产生内容，已退还积分',
};

export type WorkspaceRunInfo = Pick<AgentRunView, 'billing' | 'configuration'>;

/** 成果: saved results apart from intermediate readings, plus evidence, materials, billing and export. */
export function WorkspaceResultsSection({ model, artifacts, data, run, onOpen, canExport }: {
    model: AgentWorkspaceModel; artifacts: AgentArtifact[]; data?: AgentMessageData; run?: WorkspaceRunInfo;
    onOpen: (id: string) => void; canExport: boolean;
}) {
    const tools = model.tools;
    const selected = new Set(tools.flatMap(tool => getAgentFinalSelection(tool) ?? []));
    const charts = model.resources.filter(resource => resource.view === 'chart').flatMap(resource => {
        const reading = resource.toolIds.flatMap(id => model.toolsById.get(id) ?? []).findLast(tool => getAgentChart(tool));
        const value = reading && getAgentChart(reading);
        if (!value) return [];
        const saved = resource.toolIds.some(id => {
            const tool = model.toolsById.get(id);
            const artifactId = tool ? getAgentToolArtifactId(tool) : null;
            return artifactId !== null && selected.has(artifactId);
        });
        return [{ resource, value, saved }];
    });
    const savedOnly = getAgentUnrepresentedArtifacts(tools, artifacts);
    const evidence = tools.filter(tool => getAgentToolFamily(tool.name) === 'search');
    const evidenceCount = evidence.reduce((total, tool) => total + (getAgentSearchResults(tool)?.length ?? 0), 0);
    const others = model.resources.filter(resource => !['chart', 'saved', 'evidence', 'attachment'].includes(resource.view));
    const attachments = model.resources.filter(resource => resource.view === 'attachment');
    const timing = getAgentResponseTiming(data?.runtime?.responses);
    return <>
        <p className="agent-panel-description">本次对话的命盘、推演、依据与资料。分析过程保留在聊天中。</p>
        {charts.length > 0 && <section className="agent-ws-group" aria-label="命盘">
            <h3>命盘 <span>{charts.length}</span></h3>
            <div className="agent-panel-artifacts">
                {charts.map(({ resource, value, saved }) => <button type="button" key={resource.id} className="agent-workspace-chart-link" onClick={() => onOpen(resource.id)}>
                    <span>{value.title}</span>
                    <small>{value.summary}{selected.size > 0 ? saved ? ' · 已选为成果' : ' · 中间结果' : ''}</small>
                    <ArrowUpRight size={14} aria-hidden="true" />
                </button>)}
            </div>
        </section>}
        {savedOnly.length ? <div className="agent-panel-artifacts">
            {savedOnly.map(artifact => <div key={getAgentArtifactHref(artifact)}>
                <AgentArtifactCard artifact={artifact} />
                <button type="button" className="agent-secondary-button mt-2" onClick={() => onOpen(`chart:${artifact.id}`)}>预览命盘</button>
            </div>)}
        </div> : !charts.length && <div className="agent-panel-empty"><Files size={28} aria-hidden="true" /><h3>还没有成果</h3><p>任务生成的命盘会显示在这里。</p></div>}
        {evidence.length > 0 && <section className="agent-panel-sources">
            <h3>回答依据 <span>{evidenceCount}</span></h3>
            <button type="button" className="agent-source-link py-2" onClick={() => onOpen('evidence')}>
                <Search size={14} aria-hidden="true" /><span>{evidence.length} 次检索 · {evidenceCount} 条结果</span><ArrowUpRight size={12} aria-hidden="true" />
            </button>
        </section>}
        {others.length > 0 && <section className="agent-panel-sources">
            <h3>过程资料 <span>{others.length}</span></h3>
            <div className="agent-ws-links">{others.map(resource => {
                const Icon = WORKSPACE_ICONS[resource.family];
                return <button key={resource.id} type="button" className="agent-secondary-button" onClick={() => onOpen(resource.id)}><Icon size={12} aria-hidden="true" />{resource.title}</button>;
            })}</div>
        </section>}
        {attachments.length > 0 && <section className="agent-panel-sources">
            <h3>对话资料 <span>{attachments.length}</span></h3>
            <div className="agent-ws-links">{attachments.map(resource => <button key={resource.id} type="button" className="agent-secondary-button" onClick={() => onOpen(resource.id)}>{resource.title}</button>)}</div>
        </section>}
        {(data || canExport) && <section className="agent-ws-summary" aria-label="任务概览">
            <dl className="agent-ws-facts">
                <div><dt>步骤</dt><dd>{tools.length} 个 · {tools.filter(tool => tool.status === 'completed').length} 个完成</dd></div>
                {timing && <div><dt>模型响应</dt><dd>{formatAgentToolDuration(timing.durationMs)} · {timing.count} 次</dd></div>}
                {run?.billing && <div><dt>计费</dt><dd>{BILLING_LABELS[run.billing]}</dd></div>}
            </dl>
            {canExport && <button type="button" className="agent-secondary-button" onClick={requestConversationExport}><Download size={12} aria-hidden="true" />导出对话</button>}
        </section>}
    </>;
}

/** 过程: live status, the full task list and every step of the latest task, each opening its view. */
export function WorkspaceProcessSection({ model, data, run, active, onOpen }: {
    model: AgentWorkspaceModel; data?: AgentMessageData; run?: WorkspaceRunInfo; active: string | null; onOpen: (id: string) => void;
}) {
    if (!data) return <div className="agent-panel-empty"><ListChecks size={28} aria-hidden="true" /><h3>尚未开始任务</h3><p>Agent 会根据问题决定需要哪些步骤。</p></div>;
    const steps = data.parts.filter((part): part is AgentToolPart => part.type === 'tool');
    const todo = data.parts.findLast((part): part is Extract<AgentPart, { type: 'todo' }> => part.type === 'todo');
    const done = todo?.items.filter(item => item.status === 'completed').length ?? 0;
    const effort = run?.configuration && (run.configuration.reasoning ? run.configuration.reasoningEffort ? `推理 ${REASONING_EFFORT_LABELS[run.configuration.reasoningEffort]}` : '推理 默认' : '不推理');
    return <>
        <section className="agent-ws-status" aria-label="任务状态">
            <div><AgentStatus status={data.status} /><span>{data.runtime?.model.name ?? '尚未调用模型'}{effort ? ` · ${effort}` : ''}</span></div>
            <AgentContextDetails runtime={data.runtime} />
            {run?.billing && <p>{BILLING_LABELS[run.billing]}</p>}
        </section>
        {todo && <section className="agent-ws-group" aria-label="任务清单">
            <h3>任务清单 <span>{done} / {todo.items.length}</span></h3>
            <ol className="agent-todo-list">{todo.items.map(item => <li key={item.id} data-state={item.status}><span aria-hidden="true">{item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○'}</span>{item.title}</li>)}</ol>
        </section>}
        <section className="agent-ws-group" aria-label="任务步骤">
            <h3>步骤 <span>{steps.length}</span></h3>
            {steps.length ? <ol className="agent-ws-steps">
                {steps.map((tool, index) => {
                    const state = getAgentToolState(tool, data.status);
                    const location = model.locations.get(tool.id);
                    const Icon = WORKSPACE_ICONS[getAgentToolFamily(tool.name)];
                    const summary = summarizeAgentTool(tool);
                    return <li key={tool.id} data-state={state.status}>
                        <button type="button" disabled={!location} aria-current={location && location === active ? 'true' : undefined} onClick={() => location && onOpen(location)}>
                            <span className="agent-ws-step-number" aria-hidden="true">{index + 1}</span>
                            <Icon size={13} aria-hidden="true" />
                            <span className="agent-ws-step-label"><span>{tool.title}</span>{summary && <small>{summary}</small>}</span>
                            {typeof tool.durationMs === 'number' && Number.isFinite(tool.durationMs) && tool.durationMs >= 0 && <small>{formatAgentToolDuration(tool.durationMs)}</small>}
                            <small>{state.label}</small>
                        </button>
                    </li>;
                })}
            </ol> : <p className="agent-ws-note">尚未调用工具。</p>}
        </section>
        {data.error && <p className="agent-error" role="alert">{data.error}</p>}
        <AgentActivityIndicator data={data} />
    </>;
}
