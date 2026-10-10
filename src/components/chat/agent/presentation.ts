import type { ChatMessage } from '@/types';
import type { AgentMessageData, AgentPart, AgentRunStatus, AgentRuntimeInfo } from '@/lib/agent/types';

export type AgentArtifact = Extract<AgentPart, { type: 'artifact' }>;
export type AgentTool = Extract<AgentPart, { type: 'tool' }>;
export type AgentProcessPart = Extract<AgentPart, { type: 'tool' | 'reasoning' | 'question' }>;

/** Preserve transcript order: narration separates consecutive process groups. */
export function groupAgentParts(parts: AgentPart[]) {
    const groups: Array<{ type: 'activity'; id: string; parts: AgentProcessPart[] } | { type: 'content'; id: string; part: Exclude<AgentPart, AgentProcessPart> }> = [];
    for (const part of parts) {
        if (part.type === 'tool' || part.type === 'reasoning' || part.type === 'question') {
            const last = groups.at(-1);
            if (last?.type === 'activity') last.parts.push(part);
            else groups.push({ type: 'activity', id: part.id, parts: [part] });
        } else groups.push({ type: 'content', id: part.id, part });
    }
    return groups;
}

export function getAgentActivityLabel(data: AgentMessageData) {
    if (data.status === 'queued') return '等待后台开始任务';
    if (data.status === 'awaiting_input') return '等待你回答问题';
    if (data.status === 'cancelling') return '正在停止任务';
    const activity = data.runtime?.activity;
    switch (activity?.phase) {
        case 'compacting': return '正在压缩上下文';
        case 'tools': return activity.toolTitle ? `正在${activity.toolTitle}` : '正在执行工具';
        case 'thinking': return '正在思考';
        case 'responding': return '正在整理回答';
        case 'settling': return '正在整理任务结果';
        case 'retrying': return `准备重试${activity.attempt ? ` · 第 ${activity.attempt} 次` : ''}`;
        case 'preparing': return '正在准备下一步';
        default: return '等待模型响应';
    }
}

export function summarizeAgentTool(tool: AgentTool): string | null {
    const args = tool.input && typeof tool.input === 'object' && !Array.isArray(tool.input) ? tool.input as Record<string, unknown> : {};
    if (tool.name === 'bazi' || tool.name === 'ziwei') {
        const date = [args.birthYear, args.birthMonth, args.birthDay].filter(value => typeof value === 'number').join(' / ');
        return [typeof args.name === 'string' ? args.name : '', date, typeof args.birthHour === 'number' ? `${args.birthHour} 时` : ''].filter(Boolean).join(' · ') || null;
    }
    if (tool.name === 'select_final_artifacts' && Array.isArray(args.artifactIds)) return `选定 ${args.artifactIds.length} 份成果`;
    for (const key of ['query', 'name', 'type']) if (typeof args[key] === 'string') return (args[key] as string).slice(0, 120);
    return null;
}

export const agentStatusLabels: Record<AgentRunStatus, string> = {
    queued: '任务已排队',
    running: '正在执行',
    awaiting_input: '等待补充信息',
    cancelling: '正在停止',
    completed: '任务完成',
    cancelled: '任务已停止',
    failed: '任务未完成',
};

export function getAgentArtifactHref(artifact: AgentArtifact): string | null {
    if (artifact.recordId) return `/records?id=${encodeURIComponent(artifact.recordId)}`;
    if (!artifact.chartId) return null;
    if (artifact.chartType === 'bazi' || artifact.chartType === 'ziwei') {
        return `/${artifact.chartType}/result?chart=${encodeURIComponent(artifact.chartId)}`;
    }
    return null;
}

/** Only visible messages contribute results; edited-away branches stay hidden. */
export function collectAgentArtifacts(messages: ChatMessage[]): AgentArtifact[] {
    const artifacts = new Map<string, AgentArtifact>();
    for (const message of messages) {
        for (const part of message.agent?.parts ?? []) {
            if (part.type !== 'artifact') continue;
            const href = getAgentArtifactHref(part);
            if (href) artifacts.set(href, part);
        }
    }
    return [...artifacts.values()];
}

export function getAgentToolState(tool: AgentTool, runStatus: AgentRunStatus) {
    if (['running', 'pending', 'awaiting_input'].includes(tool.status) && ['completed', 'cancelled', 'failed'].includes(runStatus)) {
        return { status: 'interrupted', label: '已结束' } as const;
    }
    return {
        status: tool.status,
        label: tool.status === 'pending' ? '待执行' : tool.status === 'awaiting_input' ? '等待回答' : tool.status === 'running' ? '执行中' : tool.status === 'failed' ? '失败' : '完成',
    };
}

/** Tool execution time measured by the durable runtime for the completed attempt. */
export function formatAgentToolDuration(ms: number): string {
    if (ms < 1) return '不足 1 毫秒';
    if (ms < 1000) return `${Math.round(ms)} 毫秒`;
    if (ms < 10_000) return `${Math.round(ms / 100) / 10} 秒`;
    return `${Math.round(ms / 1000)} 秒`;
}

export function getAgentResponseTiming(responses: AgentRuntimeInfo['responses']) {
    const measured = new Map((responses ?? []).filter(response => typeof response.durationMs === 'number' && Number.isFinite(response.durationMs) && response.durationMs >= 0).map(response => [response.id, response.durationMs!]));
    return measured.size ? { count: measured.size, durationMs: [...measured.values()].reduce((total, ms) => total + ms, 0) } : null;
}

/** Wall-clock task spans include human waits and recovery; they are not execute() measurements. */
export function getAgentTaskSpan(timing: { startedAt?: number; endedAt?: number }) {
    return typeof timing.startedAt === 'number' && typeof timing.endedAt === 'number' &&
        Number.isFinite(timing.startedAt) && Number.isFinite(timing.endedAt) && timing.startedAt >= 0 && timing.endedAt >= timing.startedAt
        ? timing.endedAt - timing.startedAt : null;
}

export function formatAgentValue(value: unknown): string {
    if (value === undefined) return '暂无数据';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2) ?? '暂无数据';
}
