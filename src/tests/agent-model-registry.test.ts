import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContext, type Api, type Model } from '@earendil-works/pi-ai';
import { createGuardedAgentModels } from '../lib/agent/model-registry.server';

test('an already cancelled model request never waits for authorization or starts an upstream stream', { timeout: 1000 }, async () => {
    const model = { id: 'fixture', name: 'fixture', provider: 'taibu', api: 'openai-completions', baseUrl: 'https://example.com', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 0, maxTokens: 100 } as Model<Api>;
    let authorized = false;
    const models = createGuardedAgentModels(model, () => { throw new Error('must not start'); }, async () => { authorized = true; await new Promise(() => {}); });
    const output = models.getProvider('taibu')!.streamSimple(model, normalizeContext({ messages: [] }), { signal: AbortSignal.abort() });
    assert.equal((await output.result()).stopReason, 'aborted');
    assert.equal(authorized, false);
});
