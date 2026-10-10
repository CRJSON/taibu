'use client';
// 需要每秒刷新的计时器，显示后台任务已执行时长

import { useSyncExternalStore } from 'react';
import { LoaderCircle, Pause } from 'lucide-react';
import { isAgentRunTerminal, type AgentRunStatus } from '@/lib/agent/types';
import { AgentStatus } from './AgentStatus';

function subscribeToSeconds(onChange: () => void) {
    const timer = window.setInterval(onChange, 1000);
    return () => window.clearInterval(timer);
}
const currentSecond = () => Math.floor(Date.now() / 1000);
const serverSecond = () => 0;

export function formatAgentElapsed(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
    return `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`;
}

/** Header status of the conversation's task: live label and wall-clock time since the task was created. */
export function AgentHeaderStatus({ status, createdAt, reconnecting = false }: { status: AgentRunStatus; createdAt: string; reconnecting?: boolean }) {
    const active = !isAgentRunTerminal(status);
    const now = useSyncExternalStore(active ? subscribeToSeconds : () => () => {}, currentSecond, serverSecond);
    if (!active) return <AgentStatus status={status} />;
    const started = Date.parse(createdAt);
    const elapsed = now > 0 && Number.isFinite(started) && now * 1000 >= started ? formatAgentElapsed(now * 1000 - started) : null;
    const waiting = status === 'awaiting_input';
    const label = waiting ? '等待你回答' : status === 'queued' ? '等待后台开始' : status === 'cancelling' ? '正在停止' : reconnecting ? '正在重新连接' : '后台执行中';
    const Icon = waiting ? Pause : LoaderCircle;
    return <span className="chat-run-status" role="status">
        <Icon size={14} aria-hidden="true" className={waiting ? undefined : 'animate-spin motion-reduce:animate-none'} />
        <span>Agent {label}{elapsed ? ` · ${elapsed}` : ''}</span>
    </span>;
}
