'use client';

import { useId, useState } from 'react';
import { ChevronRight, CircleAlert, CircleHelp, LoaderCircle, PanelRightOpen, Pause, Sparkles } from 'lucide-react';
import type { AgentMessageData } from '@/lib/agent/types';
import { deduplicateChartResults } from '@/lib/agent/chart-interaction';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { ThinkingBlock } from '../ThinkingBlock';
import { AgentToolCard } from './AgentToolCard';
import { AgentToolResult } from './AgentToolResult';
import { getAgentActivityLabel, type AgentProcessPart } from './presentation';
import { useAgentResultWorkspace } from './AgentResultContext';

export function AgentActivityIndicator({ data }: { data: AgentMessageData }) {
    if (!['queued', 'running', 'awaiting_input', 'cancelling'].includes(data.status)) return null;
    const waiting = data.status === 'awaiting_input';
    const Icon = waiting ? Pause : LoaderCircle;
    return <div className="agent-live-activity" role="status"><Icon size={14} aria-hidden="true" className={waiting ? undefined : 'animate-spin motion-reduce:animate-none'} /><span>{getAgentActivityLabel(data)}</span></div>;
}

/** 任务过程: one card whose rows expand to the call details; each step also opens its workspace view. */
export function AgentActivityGroup({ parts, data, active = false }: { parts: AgentProcessPart[]; data: AgentMessageData; active?: boolean }) {
    const id = useId();
    const workspace = useAgentResultWorkspace();
    const [disclosed, setDisclosed] = useState<boolean | null>(null);
    const tools = parts.filter(part => part.type === 'tool');
    const resultIds = new Set(deduplicateChartResults(data.parts.filter(part => part.type === 'tool')).map(tool => tool.id));
    const completed = tools.filter(tool => tool.status === 'completed').length;
    const failed = tools.filter(tool => tool.status === 'failed').length;
    const open = disclosed ?? (active || failed > 0);
    return <section className={`agent-activity-group${active ? ' is-active' : ''}`}><div className="agent-activity-card">
        <button type="button" className="agent-activity-heading" aria-expanded={open} aria-controls={id} onClick={() => setDisclosed(!open)}>
            <span className="agent-activity-title">任务过程</span>
            <span className="agent-activity-count">{tools.length ? `${tools.length} 个步骤 · ${completed === tools.length ? '全部完成' : `${completed} 个已完成`}` : '思考与提问'}</span>
            {failed > 0 && <span className="agent-activity-issues"><CircleAlert size={12} aria-hidden="true" />{failed} 处失败</span>}
            {workspace && tools.length > 0 && <span className="agent-activity-hint">可在工作区查看每一步</span>}
            <ChevronRight size={14} aria-hidden="true" className={open ? 'rotate-90' : undefined} />
        </button>
        <div id={id} className="agent-activity-body" hidden={!open} inert={!open}>
            {open && <ol className="agent-activity-steps">{parts.map(part => <li key={part.id} className="agent-activity-step" data-kind={part.type}>
                {part.type === 'tool' ? <>
                    <div className="min-w-0 flex-1"><AgentToolCard tool={part} runStatus={data.status} showResult={false} /></div>
                    {workspace && <button type="button" className="agent-icon-button agent-step-open" aria-label={`在工作区查看：${part.title}`} title="在工作区查看" onClick={() => workspace.openResource(`tool:${part.id}`)}>
                        <PanelRightOpen size={14} aria-hidden="true" />
                    </button>}
                </> : <>
                    <span className="agent-step-marker" aria-hidden="true">{part.type === 'reasoning' ? <Sparkles size={12} /> : <CircleHelp size={12} />}</span>
                    <div className="min-w-0 flex-1">
                        {part.type === 'reasoning' ? <ThinkingBlock content={part.text} isStreaming={active && data.status === 'running'} />
                            : <details className="agent-question"><summary><span>向你确认信息</span><ChevronRight size={13} aria-hidden="true" /></summary><div><MarkdownContent content={part.question} className="text-sm" /></div></details>}
                    </div>
                </>}
            </li>)}</ol>}
        </div>
    </div>
        <div className="agent-activity-results">{tools.filter(tool => resultIds.has(tool.id) || tool.name === 'parallel_analysis').map(tool => <AgentToolResult key={tool.id} tool={tool} />)}</div>
    </section>;
}
