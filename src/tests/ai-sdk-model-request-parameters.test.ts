import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamText } from 'ai';
import { buildProviderOptions, createModelFromConfig } from '../lib/ai/providers/ai-sdk-provider';
import type { AIModelConfig } from '../types';

const config: AIModelConfig = { id: 'fixture', name: 'fixture', vendor: 'other', modelId: 'fixture-model', apiUrl: 'https://fixture.example/v1', apiKeyEnvVar: '', supportsReasoning: true };

test('real SDK serialization forwards all six reasoning levels in both configured formats', async () => {
    for (const format of ['reasoning_effort', 'reasoning_object'] as const) for (const effort of ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const) {
        let body: Record<string, unknown> | undefined;
        const source = { ...config, defaultReasoningEffort: effort, reasoningEffortFormat: format };
        const model = createModelFromConfig(source, { reasoning: true, apiKey: 'fixture-only', fetch: async (_input, init) => {
            body = JSON.parse(String(init?.body));
            return new Response('data: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture-model","choices":[{"index":0,"delta":{"content":"完整回答"},"finish_reason":null}]}\n\ndata: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
        } });
        const result = streamText({ model, prompt: '问题', providerOptions: buildProviderOptions(source, { reasoning: true }), maxOutputTokens: 100, maxRetries: 0 });
        assert.equal(await result.text, '完整回答');
        assert.ok(body);
        assert.equal(format === 'reasoning_effort' ? body.reasoning_effort : (body.reasoning as { effort: string }).effort, effort);
        assert.equal(body.model, 'fixture-model');
        assert.equal(body.stream, true);
    }
});

test('provider extensions reuse the guarded fetch without replacing transcript, tools or native output limits', async () => {
    let body: Record<string, unknown> | undefined;
    const controller = new AbortController();
    const source = { ...config, vendor: 'deepseek', customParameters: { chat_template_kwargs: { enable_thinking: true }, messages: [{ role: 'system', content: 'must not replace' }], model: 'other-model', tools: [], stream: false, max_tokens: 999999, max_completion_tokens: 999999, maxCompletionTokens: 999999, maxTokens: 999999, maxOutputTokens: 999999 } };
    const model = createModelFromConfig(source, { reasoning: true, apiKey: 'fixture-only', fetch: async (_input, init) => {
        assert.ok(init?.signal);
        body = JSON.parse(String(init?.body));
        return new Response('data: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture-model","choices":[{"index":0,"delta":{"content":"回答"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    const result = streamText({ model, prompt: '原问题', maxOutputTokens: 100, maxRetries: 0, abortSignal: controller.signal, providerOptions: buildProviderOptions(source, { reasoning: true }) });
    assert.equal(await result.text, '回答');
    assert.ok(body);
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: true });
    assert.equal(body.enable_thinking, true);
    assert.equal(body.model, 'fixture-model');
    assert.equal(body.stream, true);
    assert.match(JSON.stringify(body.messages), /原问题/);
    assert.doesNotMatch(JSON.stringify(body.messages), /must not replace/);
    assert.ok(body.max_tokens === 100 || body.max_completion_tokens === 100);
    assert.ok(!Object.values(body).includes(999999));
});

test('a conversation reasoning level overrides model defaults and custom parameters in the real SDK request', async () => {
    let body: Record<string, unknown> | undefined;
    const source: AIModelConfig = { ...config, reasoningEffortFormat: 'reasoning_object', defaultReasoningEffort: 'low', customParameters: { reasoning: { effort: 'medium' }, reasoning_effort: 'low' } };
    const options = { reasoning: true, reasoningEffort: 'max' as const };
    const model = createModelFromConfig(source, { ...options, apiKey: 'fixture-only', fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response('data: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture-model","choices":[{"index":0,"delta":{"content":"回答"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    assert.equal(await streamText({ model, prompt: '问题', maxRetries: 0, providerOptions: buildProviderOptions(source, options) }).text, '回答');
    assert.deepEqual(body?.reasoning, { effort: 'max' });
    assert.equal(body?.reasoning_effort, undefined);
});

test('disabling reasoning also suppresses administrator thinking extensions in the real SDK body', async () => {
    let body: Record<string, unknown> | undefined;
    const source: AIModelConfig = { ...config, vendor: 'deepseek', customParameters: { reasoning_effort: 'max', reasoning: { effort: 'max' }, enable_thinking: true, chat_template_kwargs: { enable_thinking: true, other: 'preserved' }, thinking: { type: 'enabled', budget_tokens: 1000 } } };
    const options = { reasoning: false };
    const model = createModelFromConfig(source, { ...options, apiKey: 'fixture-only', fetch: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response('data: {"id":"fixture","object":"chat.completion.chunk","created":1,"model":"fixture-model","choices":[{"index":0,"delta":{"content":"回答"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    assert.equal(await streamText({ model, prompt: '问题', maxRetries: 0, providerOptions: buildProviderOptions(source, options) }).text, '回答');
    assert.equal(body?.reasoning_effort, undefined); assert.equal(body?.reasoning, undefined);
    assert.equal(body?.enable_thinking, false);
    assert.deepEqual(body?.chat_template_kwargs, { enable_thinking: false, other: 'preserved' });
    assert.deepEqual(body?.thinking, { type: 'disabled' });
});
