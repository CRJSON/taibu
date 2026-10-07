import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AssistantMessage, Message } from '@earendil-works/pi-ai';
import { projectAgentContextUsage } from '../lib/agent/context-usage';
import { resolveKnownModelContextConfig, resolveModelContextConfig } from '../lib/ai/model-context';
import { shouldRequestChatPreview } from '../lib/chat/chat-preview';

const assistant: AssistantMessage = { role: 'assistant', api: 'openai-completions', provider: 'fixture', model: 'fixture', timestamp: 2, stopReason: 'stop', content: [{ type: 'text', text: 'answer' }], usage: { input: 600, output: 100, cacheRead: 200, cacheWrite: 100, reasoning: 30, totalTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
const user: Message = { role: 'user', content: 'original task', timestamp: 1 };

test('Pi context uses provider totals without double-counting cached or reasoning tokens', () => {
    const result = projectAgentContextUsage([user, assistant], 1);
    assert.equal(result.tokens, 1000);
    assert.equal(result.measuredTokens, 1000);
    assert.equal(result.estimatedTokens, 0);
    assert.equal(result.source, 'usage');
    assert.equal(result.reasoning, 30);
    assert.equal(result.compactions, 1);
});

test('Pi context distinguishes subsequent estimates from measured usage', () => {
    const result = projectAgentContextUsage([user, assistant, { role: 'toolResult', toolCallId: 'tool', toolName: 'read', isError: false, timestamp: 3, content: [{ type: 'text', text: '12345678' }] }], 0);
    assert.equal(result.tokens, 1002);
    assert.equal(result.estimatedTokens, 2);
    assert.equal(result.source, 'mixed');
});

test('compacted prefixes invalidate old usage and missing/error usage remains explicitly estimated', () => {
    const summary: Message = { role: 'user', content: 'summary', timestamp: 5 };
    const result = projectAgentContextUsage([summary, assistant], 1);
    assert.equal(result.source, 'estimated');
    assert.equal(result.measuredTokens, 0);
    assert.equal(result.input, undefined);
    for (const stopReason of ['error', 'aborted'] as const) assert.equal(projectAgentContextUsage([user, { ...assistant, stopReason }], 0).source, 'estimated');
    assert.equal(projectAgentContextUsage([user, { ...assistant, usage: { ...assistant.usage, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 } }], 0).source, 'estimated');
});

test('unknown model capacities do not inherit ordinary-chat prompt budgets', () => {
    for (const id of ['custom-gpt', 'fixture', 'default', '__proto__']) assert.equal(resolveKnownModelContextConfig(id), null);
    assert.equal(resolveKnownModelContextConfig('deepseek-v3.2')?.maxContext, 32000);
    assert.equal(resolveKnownModelContextConfig('glm-4.7', true)?.promptRatio, 0.35);
    assert.equal(resolveModelContextConfig('unknown').maxContext, 32000, 'ordinary chat retains its bounded prompt policy');
});

test('Agent mode never requests the ordinary-chat prompt preview', () => {
    const idle = { userId: 'user', isLoading: false, isSendingToList: false };
    assert.equal(shouldRequestChatPreview(idle), true);
    assert.equal(shouldRequestChatPreview({ ...idle, agentMode: true }), false);
    assert.equal(shouldRequestChatPreview({ ...idle, userId: null }), false);
    assert.equal(shouldRequestChatPreview({ ...idle, isLoading: true }), false);
    assert.equal(shouldRequestChatPreview({ ...idle, isSendingToList: true }), false);
});
