import type { Message } from '@earendil-works/pi-ai';
import { estimateContextTokens } from '@earendil-works/pi-ai/utils/estimate';
import type { AgentRuntimeInfo } from './types';

/** Reuse Pi's prefix-aware accounting, including invalidation after compaction. */
export function projectAgentContextUsage(messages: readonly Message[], compactions: number): NonNullable<AgentRuntimeInfo['context']> {
    const estimate = estimateContextTokens(messages);
    const message = estimate.lastUsageIndex === null ? undefined : messages[estimate.lastUsageIndex];
    const usage = message?.role === 'assistant' ? message.usage : undefined;
    return {
        tokens: estimate.tokens,
        measuredTokens: estimate.usageTokens,
        estimatedTokens: estimate.trailingTokens,
        source: usage ? estimate.trailingTokens > 0 ? 'mixed' : 'usage' : 'estimated',
        ...(usage ? { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, ...(usage.reasoning === undefined ? {} : { reasoning: usage.reasoning }) } : {}),
        compactions,
    };
}
