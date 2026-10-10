import { Check, CircleAlert, CirclePause, LoaderCircle, Square } from 'lucide-react';
import type { AgentRunStatus } from '@/lib/agent/types';
import { agentStatusLabels } from './presentation';

export function AgentStatus({ status }: { status: AgentRunStatus }) {
    const busy = status === 'running' || status === 'queued' || status === 'cancelling';
    const Icon = busy ? LoaderCircle : status === 'completed' ? Check
        : status === 'awaiting_input' ? CirclePause : status === 'cancelled' ? Square : CircleAlert;
    return (
        <span className={`agent-status agent-status--${status}`} role="status">
            <Icon size={14} className={busy ? 'animate-spin motion-reduce:animate-none' : undefined} aria-hidden="true" />
            <span>{agentStatusLabels[status]}</span>
        </span>
    );
}
