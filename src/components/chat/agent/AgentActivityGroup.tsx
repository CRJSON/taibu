'use client';

import { useId, useState } from 'react';
import { ChevronRight, CircleAlert, CircleHelp, ListChecks, LoaderCircle, Pause, Sparkles } from 'lucide-react';
import type { AgentMessageData } from '@/lib/agent/types';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { ThinkingBlock } from '../ThinkingBlock';
import { AgentToolCard } from './AgentToolCard';
import { getAgentActivityLabel, type AgentProcessPart } from './presentation';

export function AgentActivityIndicator({ data }: { data: AgentMessageData }) {
    if (!['queued', 'running', 'awaiting_input', 'cancelling'].includes(data.status)) return null;
    const waiting = data.status === 'awaiting_input';
    const Icon = waiting ? Pause : LoaderCircle;
    return <div className="agent-live-activity" role="status"><Icon size={14} aria-hidden="true" className={waiting ? undefined : 'animate-spin motion-reduce:animate-none'} /><span>{getAgentActivityLabel(data)}</span></div>;
}

export function AgentActivityGroup({ parts, data, active = false }: { parts: AgentProcessPart[]; data: AgentMessageData; active?: boolean }) {
    const id = useId();
    const [disclosed, setDisclosed] = useState<boolean | null>(null);
    const tools = parts.filter(part => part.type === 'tool');
    const toolNumbers = new Map(tools.map((tool, index) => [tool.id, index + 1]));
    const completed = tools.filter(tool => tool.status === 'completed').length;
    const failed = tools.filter(tool => tool.status === 'failed').length;
    const open = disclosed ?? (active || failed > 0);
    return <section className={`agent-activity-group${active ? ' is-active' : ''}`}>
        <button type="button" className="agent-activity-heading" aria-expanded={open} aria-controls={id} onClick={() => setDisclosed(!open)}>
            <ListChecks size={15} aria-hidden="true" />
            <span>任务过程</span>
            <span className="agent-activity-count">{tools.length ? `${tools.length} 个步骤` : '思考与提问'}</span>
            {tools.length > 0 && <span className="agent-activity-progress">{completed}/{tools.length} 完成</span>}
            {failed > 0 && <span className="agent-activity-issues"><CircleAlert size={12} />{failed} 处失败</span>}
            <ChevronRight size={14} aria-hidden="true" className={open ? 'rotate-90' : undefined} />
        </button>
        <div id={id} className="agent-activity-body" hidden={!open} inert={!open}>
            {open && parts.map(part => <div key={part.id} className="agent-activity-step">
                <span className="agent-step-marker" aria-hidden="true">{part.type === 'tool' ? toolNumbers.get(part.id) : part.type === 'reasoning' ? <Sparkles size={11} /> : <CircleHelp size={11} />}</span>
                <div className="min-w-0 flex-1">
                    {part.type === 'tool' ? <AgentToolCard tool={part} runStatus={data.status} />
                        : part.type === 'reasoning' ? <ThinkingBlock content={part.text} isStreaming={active && data.status === 'running'} />
                            : <details className="agent-question"><summary><CircleHelp size={14} /><span>向你确认信息</span><ChevronRight size={13} /></summary><div><MarkdownContent content={part.question} className="text-sm" /></div></details>}
                </div>
            </div>)}
        </div>
    </section>;
}
