import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon';

test('chart CRUD retains time rules, rejects invalid calculations, and keeps owner boundaries', async (t) => {
    const apiUtils = require('../lib/api-utils') as typeof import('../lib/api-utils');
    const original = apiUtils.requireUserContext;
    const chartId = '550e8400-e29b-41d4-a716-446655440000';
    const base = { id: chartId, user_id: 'user-1', name: 'DST', gender: 'male', birth_date: '2024-03-10', birth_time: '02:30', calendar_type: 'solar', longitude: -74, timezone: 'America/New_York', disambiguation: 'later' };
    let existing: Record<string, unknown> | null = base;
    const writes: Record<string, unknown>[] = [];
    const filters: Array<[string, unknown]> = [];
    apiUtils.requireUserContext = (async () => ({
        user: { id: 'user-1' },
        supabase: {
            from() {
                let mode = 'read';
                const query = {
                    select(fields: string) {
                        if (mode === 'read') {
                            assert.match(fields, /timezone/);
                            assert.match(fields, /disambiguation/);
                        }
                        return query;
                    },
                    eq(field: string, value: unknown) { filters.push([field, value]); return query; },
                    insert(payload: Record<string, unknown>) { mode = 'insert'; writes.push(payload); return query; },
                    update(payload: Record<string, unknown>) { mode = 'update'; writes.push(payload); return query; },
                    async maybeSingle() { return { data: mode === 'read' ? existing : existing ? { id: chartId } : null, error: null }; },
                };
                return query;
            },
        },
    })) as unknown as typeof apiUtils.requireUserContext;
    t.after(() => { apiUtils.requireUserContext = original; });

    const handlers = [
        { type: 'bazi', create: (await import('../app/api/bazi/charts/route')).POST, update: (await import('../app/api/bazi/charts/update/route')).POST },
        { type: 'ziwei', create: (await import('../app/api/ziwei/charts/route')).POST, update: (await import('../app/api/ziwei/charts/update/route')).POST },
    ];
    for (const { type, create, update } of handlers) {
        const request = (body: unknown, expectedUserId = 'user-1') => new NextRequest(`http://localhost/api/${type}/charts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Expected-User-Id': expectedUserId }, body: JSON.stringify(body) });
        existing = base;
        writes.length = 0;
        assert.equal((await create(request({ payload: { ...base, user_id: 'attacker' } }))).status, 201);
        assert.equal(writes[0].timezone, 'America/New_York');
        assert.equal(writes[0].disambiguation, 'later');
        assert.equal(writes[0].user_id, 'user-1');
        if (type === 'bazi') assert.equal(typeof writes[0].day_master, 'string');

        for (const patch of [{ timezone: 'invalid/timezone' }, { disambiguation: 'invalid' }, { disambiguation: 'reject' }, { birth_date: '2024-02-30' }]) {
            writes.length = 0;
            assert.equal((await create(request({ payload: { ...base, ...patch } }))).status, 400);
            assert.equal((await update(request({ chartId, payload: patch }))).status, 400);
            assert.equal(writes.length, 0);
        }
        writes.length = 0;
        assert.equal((await update(request({ chartId, payload: { timezone: 'UTC' } }))).status, 200);
        assert.equal(writes[0].timezone, 'UTC');
        assert.equal(writes[0].disambiguation, 'later');
        writes.length = 0;
        assert.equal((await update(request({ chartId, payload: { disambiguation: 'earlier' } }))).status, 200);
        assert.equal(writes[0].timezone, 'America/New_York');
        assert.equal(writes[0].disambiguation, 'earlier');
        writes.length = 0;
        assert.equal((await update(request({ chartId, payload: { name: 'renamed', user_id: 'attacker' } }))).status, 200);
        assert.deepEqual(writes[0], { name: 'renamed' });
        assert.ok(filters.some(([field, value]) => field === 'user_id' && value === 'user-1'));

        writes.length = 0;
        assert.equal((await update(request({ chartId, payload: { timezone: 'UTC' } }, 'other-user'))).status, 409);
        assert.equal((await create(request({ payload: base }, 'other-user'))).status, 409);
        assert.equal(writes.length, 0);
        existing = null;
        assert.equal((await update(request({ chartId, payload: { timezone: 'UTC' } }))).status, 404);
        assert.equal(writes.length, 0);
        assert.equal((await create(request(null))).status, 400);
        assert.equal((await update(request(null))).status, 400);
    }
});

test('bazi chart create rejects missing birth_time', async (t) => {
    const apiUtils = require('../lib/api-utils') as {
        requireUserContext: typeof import('../lib/api-utils').requireUserContext;
    };
    const originalRequireUserContext = apiUtils.requireUserContext;
    let insertCalled = false;

    apiUtils.requireUserContext = (async () => ({
        user: { id: 'user-1' },
        supabase: {
            from() {
                return {
                    insert() {
                        insertCalled = true;
                        return {
                            select() {
                                return {
                                    maybeSingle: async () => ({
                                        data: { id: 'bazi-1' },
                                        error: null,
                                    }),
                                };
                            },
                        };
                    },
                };
            },
        },
    })) as unknown as typeof apiUtils.requireUserContext;

    t.after(() => {
        apiUtils.requireUserContext = originalRequireUserContext;
    });

    const { POST } = await import('../app/api/bazi/charts/route');
    const request = new NextRequest('http://localhost/api/bazi/charts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            payload: {
                name: '八字一号',
                gender: 'male',
                birth_date: '1990-01-01',
                birth_time: null,
            },
        }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, '八字命盘必须提供有效的出生时辰');
    assert.equal(insertCalled, false);
});

test('bazi chart update recomputes derived fields from merged existing chart data', async (t) => {
    const apiUtils = require('../lib/api-utils') as {
        requireUserContext: typeof import('../lib/api-utils').requireUserContext;
    };
    const originalRequireUserContext = apiUtils.requireUserContext;
    let updatedPayload: Record<string, unknown> | null = null;

    apiUtils.requireUserContext = (async () => ({
        user: { id: 'user-1' },
        supabase: {
            from(table: string) {
                assert.equal(table, 'bazi_charts');
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            maybeSingle: async () => ({
                                                data: {
                                                    id: '550e8400-e29b-41d4-a716-446655440000',
                                                    user_id: 'user-1',
                                                    gender: 'male',
                                                    birth_date: '1990-01-01',
                                                    birth_time: '08:00',
                                                    birth_place: '北京',
                                                    longitude: null,
                                                    calendar_type: 'solar',
                                                    is_leap_month: false,
                                                },
                                                error: null,
                                            }),
                                        };
                                    },
                                };
                            },
                        };
                    },
                    update(payload: Record<string, unknown>) {
                        updatedPayload = payload;
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            select() {
                                                return {
                                                    maybeSingle: async () => ({
                                                        data: { id: '550e8400-e29b-41d4-a716-446655440000' },
                                                        error: null,
                                                    }),
                                                };
                                            },
                                        };
                                    },
                                };
                            },
                        };
                    },
                };
            },
        },
    })) as unknown as typeof apiUtils.requireUserContext;

    t.after(() => {
        apiUtils.requireUserContext = originalRequireUserContext;
    });

    const { POST } = await import('../app/api/bazi/charts/update/route');
    const request = new NextRequest('http://localhost/api/bazi/charts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chartId: '550e8400-e29b-41d4-a716-446655440000',
            payload: {
                birth_time: '09:30',
            },
        }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.ok(updatedPayload);
    const updatedRecord = updatedPayload as Record<string, unknown>;
    assert.equal(updatedRecord.birth_time, '09:30');
    assert.equal(typeof updatedRecord.day_master, 'string');
    assert.equal(typeof updatedRecord.day_branch, 'string');
});

test('bazi chart update rejects merged records without valid birth_time', async (t) => {
    const apiUtils = require('../lib/api-utils') as {
        requireUserContext: typeof import('../lib/api-utils').requireUserContext;
    };
    const originalRequireUserContext = apiUtils.requireUserContext;
    let updateCalled = false;

    apiUtils.requireUserContext = (async () => ({
        user: { id: 'user-1' },
        supabase: {
            from(table: string) {
                assert.equal(table, 'bazi_charts');
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            maybeSingle: async () => ({
                                                data: {
                                                    id: '550e8400-e29b-41d4-a716-446655440000',
                                                    user_id: 'user-1',
                                                    gender: 'male',
                                                    birth_date: '1990-01-01',
                                                    birth_time: null,
                                                    birth_place: '北京',
                                                    longitude: null,
                                                    calendar_type: 'solar',
                                                    is_leap_month: false,
                                                },
                                                error: null,
                                            }),
                                        };
                                    },
                                };
                            },
                        };
                    },
                    update() {
                        updateCalled = true;
                        return {
                            eq() {
                                return {
                                    eq() {
                                        return {
                                            select() {
                                                return {
                                                    maybeSingle: async () => ({
                                                        data: { id: '550e8400-e29b-41d4-a716-446655440000' },
                                                        error: null,
                                                    }),
                                                };
                                            },
                                        };
                                    },
                                };
                            },
                        };
                    },
                };
            },
        },
    })) as unknown as typeof apiUtils.requireUserContext;

    t.after(() => {
        apiUtils.requireUserContext = originalRequireUserContext;
    });

    const { POST } = await import('../app/api/bazi/charts/update/route');
    const request = new NextRequest('http://localhost/api/bazi/charts/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chartId: '550e8400-e29b-41d4-a716-446655440000',
            payload: {
                name: '更新名称',
            },
        }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, '八字命盘必须提供有效的出生时辰');
    assert.equal(updateCalled, false);
});
