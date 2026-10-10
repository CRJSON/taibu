import 'server-only';
import { defineDoc, UsageDoc, type HookApi, type Session } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import type { Usage } from '@earendil-works/pi-ai';

const SummaryDoc = defineDoc({ kind: 'taibu.summary', version: 1, scope: 'task', initial: (): { summary: string | null } => ({ summary: null }) });

export function readSummary(session: Session, api: HookApi, context: Context) {
    return session.commit(async tx => (await tx.doc(SummaryDoc, api.taskId)).summary, context);
}

/** Summary and usage share one native commit, so recovery never adds the same usage twice. */
export function commitSummary(session: Session, api: HookApi, context: Context, model: string, summary: string, usage: Usage) {
    return session.commit(async tx => {
        const memo = await tx.doc(SummaryDoc, api.taskId);
        if (memo.summary) return { summary: memo.summary };
        const totals = (await tx.doc(UsageDoc, api.conversationId)).models;
        const old = Object.hasOwn(totals, model) ? totals[model] : undefined;
        if (!old) totals[model] = usage;
        else {
            for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'] as const) old[key] += usage[key];
            if (usage.reasoning !== undefined) old.reasoning = (old.reasoning ?? 0) + usage.reasoning;
        }
        memo.summary = summary;
        return { summary };
    }, context);
}
