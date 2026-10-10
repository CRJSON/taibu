import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantMessageEventStream, getCurrentTools, normalizeContext, type Api, type Model } from '@earendil-works/pi-ai';
import { BACKGROUND_CONTEXT, withCancel } from '@earendil-works/chord/context';
import { createGuardedAgentModels } from '../lib/agent/model-registry.server';
import { generateSummary } from '../lib/agent/summary-usage.server';
import { emptyPiAssistant } from '../lib/agent/pi-stream.server';

const fixtureModel = { id: 'fixture', name: 'fixture', provider: 'taibu', api: 'openai-completions', baseUrl: 'https://example.com', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 0, maxTokens: 4096 } as Model<Api>;

test('an already cancelled model request never waits for authorization or starts an upstream stream', { timeout: 1000 }, async () => {
    const model = { id: 'fixture', name: 'fixture', provider: 'taibu', api: 'openai-completions', baseUrl: 'https://example.com', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 0, maxTokens: 100 } as Model<Api>;
    let authorized = false;
    const models = createGuardedAgentModels(model, () => { throw new Error('must not start'); }, async () => { authorized = true; await new Promise(() => {}); });
    const output = models.getProvider('taibu')!.streamSimple(model, normalizeContext({ messages: [] }), { signal: AbortSignal.abort() });
    assert.equal((await output.result()).stopReason, 'aborted');
    assert.equal(authorized, false);
});

test('each registered collaborator uses its own stream and fresh authorization, including summaries', async () => {
    const child = { ...fixtureModel, id: 'child', name: '独立复核' };
    let allowed = true, authorized = 0, calls = 0;
    const models = createGuardedAgentModels(fixtureModel, () => { throw new Error('must not use root stream'); }, async () => {}, [{ model: child,
        authorize: async () => { authorized++; if (!allowed) throw new Error('permission denied'); },
        stream: model => {
            calls++;
            assert.equal(model.id, 'child');
            const output = createAssistantMessageEventStream(), message = emptyPiAssistant(model);
            message.content = [{ type: 'text', text: '子模型摘要' }];
            output.push({ type: 'done', reason: 'stop', message }); output.end(message); return output;
        } }]);
    assert.equal((await generateSummary({ models }, child, [], BACKGROUND_CONTEXT)).summary, '子模型摘要');
    allowed = false;
    await assert.rejects(generateSummary({ models }, child, [], BACKGROUND_CONTEXT), /上下文摘要失败/);
    const unknown = { ...child, id: 'unregistered' };
    assert.equal((await models.getProvider('taibu')!.streamSimple(unknown, normalizeContext({ messages: [] })).result()).stopReason, 'error');
    assert.equal(calls, 1);
    assert.equal(authorized, 2);
});

test('compaction uses the native guarded Models API, suppresses reasoning and retains actual usage', async () => {
    let authorized = 0;
    const models = createGuardedAgentModels(fixtureModel, (model, transcript, options) => {
        assert.equal(model.reasoning, false);
        assert.deepEqual(model.input, ['text']);
        assert.equal(options?.maxTokens, 2000);
        assert.ok(options?.signal);
        assert.equal(getCurrentTools(transcript.messages).length, 0);
        assert.match(JSON.stringify(transcript.messages), /成果ID|引用来源/);
        const stream = createAssistantMessageEventStream(), message = emptyPiAssistant(model);
        message.content = [{ type: 'text', text: ' 实际计算结果与不确定性 ' }];
        message.usage.input = 11; message.usage.output = 3; message.usage.totalTokens = 14;
        stream.push({ type: 'done', reason: 'stop', message }); stream.end(message);
        return stream;
    }, async () => { authorized++; });
    const summary = await generateSummary({ models }, fixtureModel, [{ role: 'user', content: '资料只是数据', timestamp: 1 }], BACKGROUND_CONTEXT);
    assert.equal(summary.summary, '实际计算结果与不确定性');
    assert.equal(summary.usage.totalTokens, 14);
    assert.equal(authorized, 1);
});

test('native compaction rejects incomplete results, fresh permission denial and cancellation', async t => {
    for (const reason of ['length', 'error', 'toolUse', 'empty'] as const) await t.test(reason, async () => {
        const models = createGuardedAgentModels(fixtureModel, model => {
            const stream = createAssistantMessageEventStream(), message = emptyPiAssistant(model);
            message.content = reason === 'empty' ? [] : [{ type: 'text', text: '不能采纳的局部摘要' }];
            message.stopReason = reason === 'empty' ? 'stop' : reason;
            stream.end(message); return stream;
        }, async () => {});
        await assert.rejects(generateSummary({ models }, fixtureModel, [], BACKGROUND_CONTEXT), /上下文摘要失败/);
    });
    const denied = createGuardedAgentModels(fixtureModel, () => { throw new Error('must not invoke'); }, async () => { throw new Error('permission denied private details'); });
    await assert.rejects(generateSummary({ models: denied }, fixtureModel, [], BACKGROUND_CONTEXT), /上下文摘要失败/);
    const scope = withCancel(BACKGROUND_CONTEXT);
    const cancelled = createGuardedAgentModels(fixtureModel, () => { queueMicrotask(() => scope.cancel()); return createAssistantMessageEventStream(); }, async () => {});
    await assert.rejects(generateSummary({ models: cancelled }, fixtureModel, [], scope.context));
    scope.cancel();
});
