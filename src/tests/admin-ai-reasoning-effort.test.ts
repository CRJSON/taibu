import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'fixture-anon';

test('admin model creation and updates preserve xhigh/max and reject invalid effort before database mutation', async t => {
    const api = require('../lib/api-utils') as typeof import('../lib/api-utils');
    const config = require('../lib/server/ai-config') as typeof import('../lib/server/ai-config');
    const writes: Array<{ name: string; args: Record<string, unknown> }> = [];
    t.mock.method(api, 'requireAdminUser', async () => ({ user: { id: 'fixture-admin' } }));
    t.mock.method(api, 'getSystemAdminClient', () => ({ rpc: async (name: string, args: Record<string, unknown>) => { writes.push({ name, args }); return { data: { status: 'ok', model: { id: 'fixture-model' } }, error: null }; } }));
    t.mock.method(config, 'clearModelCache', () => {});
    const { POST } = await import('../app/api/admin/ai-models/route');
    const { PATCH } = await import('../app/api/admin/ai-models/[id]/route');
    for (const effort of ['xhigh', 'max', 'high', null]) {
        const create = await POST(new NextRequest('http://localhost/api/admin/ai-models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelKey: 'fixture', displayName: 'fixture', vendor: 'openai', supportsReasoning: true, defaultReasoningEffort: effort }) }));
        assert.equal(create.status, 201);
        assert.equal((writes.at(-1)!.args.p_model as Record<string, unknown>).default_reasoning_effort, effort);
        const edit = await PATCH(new NextRequest('http://localhost/api/admin/ai-models/fixture-model', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultReasoningEffort: effort }) }), { params: Promise.resolve({ id: 'fixture-model' }) });
        assert.equal(edit.status, 200);
        assert.equal((writes.at(-1)!.args.p_patch as Record<string, unknown>).default_reasoning_effort, effort);
    }
    const count = writes.length;
    for (const effort of ['extreme', '', 0, [], {}]) {
        const create = await POST(new NextRequest('http://localhost/api/admin/ai-models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelKey: 'fixture', displayName: 'fixture', vendor: 'openai', supportsReasoning: true, defaultReasoningEffort: effort }) }));
        assert.equal(create.status, 400);
        const edit = await PATCH(new NextRequest('http://localhost/api/admin/ai-models/fixture-model', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultReasoningEffort: effort }) }), { params: Promise.resolve({ id: 'fixture-model' }) });
        assert.equal(edit.status, 400);
    }
    assert.equal(writes.length, count);
});

test('new reasoning levels remain protected by the existing administrator boundary', async t => {
    const api = require('../lib/api-utils') as typeof import('../lib/api-utils');
    t.mock.method(api, 'requireAdminUser', async () => ({ error: { message: '管理员权限不足', status: 403 } }));
    t.mock.method(api, 'getSystemAdminClient', () => { throw new Error('must not reach database'); });
    const { POST } = await import('../app/api/admin/ai-models/route');
    const { PATCH } = await import('../app/api/admin/ai-models/[id]/route');
    assert.equal((await POST(new NextRequest('http://localhost/api/admin/ai-models', { method: 'POST', body: JSON.stringify({ defaultReasoningEffort: 'max' }) }))).status, 403);
    assert.equal((await PATCH(new NextRequest('http://localhost/api/admin/ai-models/fixture-model', { method: 'PATCH', body: JSON.stringify({ defaultReasoningEffort: 'xhigh' }) }), { params: Promise.resolve({ id: 'fixture-model' }) })).status, 403);
});
