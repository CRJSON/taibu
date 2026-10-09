import type { Usage } from '@earendil-works/pi-ai';
import type { LanguageModelUsage } from 'ai';
import type { AgentRuntimeInfo } from './types';

export function toPiUsage(usage?: LanguageModelUsage): Usage {
    const count = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    const cacheRead = count(usage?.inputTokenDetails?.cacheReadTokens), cacheWrite = count(usage?.inputTokenDetails?.cacheWriteTokens);
    const input = usage?.inputTokenDetails?.noCacheTokens === undefined ? Math.max(0, count(usage?.inputTokens) - cacheRead - cacheWrite) : count(usage.inputTokenDetails.noCacheTokens);
    const output = count(usage?.outputTokens);
    return { input, output, cacheRead, cacheWrite, totalTokens: count(usage?.totalTokens) || input + output + cacheRead + cacheWrite,
        ...(usage?.outputTokenDetails?.reasoningTokens === undefined ? {} : { reasoning: count(usage.outputTokenDetails.reasoningTokens) }),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
}

export function projectAgentUsage(value: unknown): NonNullable<AgentRuntimeInfo['usage']> {
    const source = value as { models?: Record<string, Usage>; tools?: Record<string, Usage> } | undefined;
    const bucket = (items: Record<string, Usage> | undefined) => Object.fromEntries(Object.entries(items ?? {}).map(([name, item]) => {
        const tokens = Object.fromEntries(['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens', 'reasoning'].flatMap(key => {
            const amount = item[key as keyof Usage];
            return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? [[key, amount]] : [];
        }));
        return [name, tokens as NonNullable<AgentRuntimeInfo['usage']>['models'][string]];
    }));
    const models = bucket(source?.models), tools = bucket(source?.tools);
    return { models, tools, totalTokens: [...Object.values(models), ...Object.values(tools)].reduce((sum, item) => sum + (item.totalTokens ?? 0), 0) };
}
