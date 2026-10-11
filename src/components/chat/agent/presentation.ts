import type { ChatMessage } from '@/types';
import type { AgentMessageData, AgentPart, AgentRunStatus, AgentRuntimeInfo } from '@/lib/agent/types';
import { getAgentToolFamily, type AgentToolFamily } from '@/lib/agent/tool-catalog';
import { getAgentAttachmentRead, getAgentDataResults, getAgentMethod, getAgentSearchResults, getAgentToolArtifactId, getAgentToolQuestions } from '@/lib/agent/tool-presentation';
import { getChartFocus } from '@/lib/agent/chart-interaction';
import { parallelAnalysisResults } from '@/lib/agent/parallel-results';

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

/**
 * The live line under a running answer: the phase, and while a tool runs what it works on,
 * e.g. 正在定位分析位置 · 月干丁火. A collaboration names the members still analysing instead.
 */
export function getAgentLiveLine(data: AgentMessageData): string {
    const label = getAgentActivityLabel(data);
    const phase = data.runtime?.activity?.phase;
    // A step left marked running must not describe a thinking or answering phase.
    if (data.status !== 'running' || (phase && phase !== 'tools')) return label;
    const tool = data.parts.findLast((part): part is AgentTool => part.type === 'tool' && part.status === 'running');
    if (!tool) return label;
    if (tool.name === 'parallel_analysis') {
        const names = parallelAnalysisResults(tool.output).filter(member => member.status === 'running').map(member => member.name ?? member.system);
        if (names.length) return `等待协作成员 · ${names.join('、')} 正在分析`;
    }
    const head = phase ? label : `正在${tool.title}`;
    const summary = tool.name === 'parallel_analysis' ? null : summarizeAgentTool(tool);
    return summary ? `${head} · ${summary}` : head;
}

/** One line under a process step, read from its arguments and stored result only. */
export function summarizeAgentTool(tool: AgentTool): string | null {
    const args = tool.input && typeof tool.input === 'object' && !Array.isArray(tool.input) ? tool.input as Record<string, unknown> : {};
    if (typeof args.birthYear === 'number' && (tool.name.startsWith('bazi') || tool.name.startsWith('ziwei'))) {
        const date = [args.birthYear, args.birthMonth, args.birthDay].filter(value => typeof value === 'number').join(' / ');
        return [typeof args.name === 'string' ? args.name : '', date, typeof args.birthHour === 'number' ? `${args.birthHour} 时` : ''].filter(Boolean).join(' · ') || null;
    }
    if (tool.name === 'select_final_artifacts' && Array.isArray(args.artifactIds)) return `选定 ${args.artifactIds.length} 份成果`;
    if (tool.name === 'web_search' || tool.name === 'search_knowledge') {
        const query = typeof args.query === 'string' ? `「${args.query.slice(0, 60)}」` : '';
        const results = getAgentSearchResults(tool);
        return results ? `${query} · ${results.length ? `命中 ${results.length} 条` : '没有可引用的结果'}` : query || null;
    }
    if (tool.name === 'list_user_data') {
        const data = getAgentDataResults(tool);
        return data ? `找到 ${data.items.length} 份资料${data.errors.length ? ` · ${data.errors.length} 项暂不可读` : ''}` : null;
    }
    if (tool.name === 'load_analysis_method') return getAgentMethod(tool)?.title ?? (typeof args.id === 'string' ? args.id : null);
    if (tool.name === 'parallel_analysis') {
        const members = parallelAnalysisResults(tool.output);
        return members.length ? `${members.length} 名成员 · ${members.filter(member => member.status === 'completed').length} 名已完成` : null;
    }
    if (tool.name === 'ask_user') {
        const count = getAgentToolQuestions(tool).length;
        return count ? `${count} 个问题` : null;
    }
    // A running focus call has only its arguments; the stored focus replaces them once it completes.
    if (tool.name === 'focus_chart') return getChartFocus(tool)?.caption ?? (typeof args.caption === 'string' && args.caption.trim() ? args.caption.slice(0, 160) : null);
    if (tool.name === 'todo_write' && Array.isArray(args.items)) return `${args.items.length} 项`;
    if (tool.name === 'read_attachment') {
        const read = getAgentAttachmentRead(tool);
        return read ? `${read.name}${read.readUntil !== null && read.total !== null ? ` · 读到 ${read.readUntil} / ${read.total} 字` : ''}` : null;
    }
    if (tool.name === 'remember_user_fact' && typeof args.title === 'string') return args.title;
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

/** Collapsed process line: step titles in first-use order with repeats counted, e.g. 八字排盘、定位分析位置 3 次. */
export function summarizeAgentProcess(tools: readonly AgentTool[], limit = 4): string {
    const counts = new Map<string, number>();
    // Plan updates are bookkeeping, not steps the reader looks for.
    for (const tool of tools) if (tool.name !== 'todo_write') counts.set(tool.title, (counts.get(tool.title) ?? 0) + 1);
    const items = [...counts].map(([title, count]) => count > 1 ? `${title} ${count} 次` : title);
    return items.length > limit ? `${items.slice(0, limit).join('、')}等` : items.join('、');
}

/** Completed results the task did not save: calculations, chart focus and readings left out of the final selection. */
export function getAgentIntermediateResults(tools: readonly AgentTool[], artifacts: readonly AgentArtifact[]): string | null {
    const selected = new Set(artifacts.map(artifact => artifact.id));
    const intermediate = tools.filter(tool => {
        if (tool.status !== 'completed') return false;
        if (tool.name === 'focus_chart' || getAgentToolFamily(tool.name) === 'calculation') return true;
        const artifactId = getAgentToolArtifactId(tool);
        return artifactId !== null && !selected.has(artifactId);
    });
    return intermediate.length ? summarizeAgentProcess(intermediate) : null;
}

/** Process steps of a task: every call except plan updates, which show as the task list instead. */
export function getAgentSteps(parts: readonly AgentPart[]): AgentTool[] {
    return parts.filter((part): part is AgentTool => part.type === 'tool' && getAgentToolFamily(part.name) !== 'plan');
}

/** 第 N 步: one numbering across the whole task, shared by the chat process card and the workspace. */
export function getAgentStepNumbers(parts: readonly AgentPart[]): ReadonlyMap<string, number> {
    return new Map(getAgentSteps(parts).map((tool, index) => [tool.id, index + 1]));
}

const isMeasured = (ms: number | undefined): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0;

/** Note under a call's details: execution apart from waiting, and whether a replay reuses the stored result. */
export function describeAgentCallNote(tool: AgentTool): string | null {
    const execution = isMeasured(tool.durationMs) ? formatAgentToolDuration(tool.durationMs) : null;
    const span = getAgentTaskSpan(tool);
    const stage = span === null ? null : formatAgentToolDuration(span);
    const timing = execution === null ? null
        : stage !== null && stage !== execution ? `执行阶段 ${execution}（不含等待），连同等待共 ${stage}。` : `执行阶段 ${execution}（不含等待）。`;
    // A calculation's output names the artifact it was cached as under this task and call ID.
    const stored = tool.status === 'completed' && getAgentToolArtifactId(tool) !== null ? '结果已按任务与调用 ID 暂存，重放不会重新计算或扣费。' : null;
    return timing || stored ? `${timing ?? ''}${stored ?? ''}` : null;
}

/** A process step's state, the summary line and a note for states other than a plain completion. */
export function describeAgentStep(tool: AgentTool, runStatus: AgentRunStatus) {
    const state = getAgentToolState(tool, runStatus);
    const summary = summarizeAgentTool(tool);
    const note = state.status === 'failed' ? '失败'
        : state.status === 'interrupted' ? '已结束（任务停止时未完成）'
        : state.status === 'awaiting_input' ? '等待你回答'
        : state.status === 'pending' ? '待执行'
        : state.status === 'running' && !summary ? '执行中' : null;
    const measured = ['completed', 'failed'].includes(state.status) && isMeasured(tool.durationMs);
    return { ...state, summary, note, duration: measured ? formatAgentToolDuration(tool.durationMs!) : null };
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

/** Short tags shown on process steps, one per tool family. */
export const AGENT_TOOL_FAMILY_LABELS: Record<AgentToolFamily, string> = {
    chart: '命盘', calculation: '推演', search: '依据', data: '资料', method: '指引', plan: '计划',
    question: '问题', collaboration: '协作', memory: '记忆', artifacts: '成果', external: '外部', other: '工具',
};

/** Results the answer can cite: completed web and knowledge searches of one task. */
export function getAgentEvidenceSummary(parts: AgentPart[]) {
    let web = 0, knowledge = 0;
    for (const part of parts) {
        if (part.type !== 'tool') continue;
        const count = getAgentSearchResults(part)?.length ?? 0;
        if (part.name === 'web_search') web += count;
        else knowledge += count;
    }
    return { total: web + knowledge, web, knowledge };
}
