import test from 'node:test';
import assert from 'node:assert/strict';
import { listToolDefinitions, executeTool } from 'taibu-core/mcp';
import { prepareToolArguments, toolPolicyBlock } from '../lib/agent/tool-arguments';

test('schema repairs numeric representations and enum defaults without clamping invalid birth times', async () => {
    const schema = listToolDefinitions().find(tool => tool.name === 'bazi')!.inputSchema;
    const original = { gender: 'MALE', birthYear: '1990', birthMonth: '1', birthDay: '15', birthHour: '9', detailLevel: 'unknown' };
    const prepared = prepareToolArguments(schema, original) as Record<string, unknown>;
    assert.equal(prepared.birthHour, 9);
    assert.equal(prepared.calendarType, 'solar');
    assert.equal(prepared.gender, 'male');
    assert.equal(prepared.detailLevel, 'default');
    assert.deepEqual(prepareToolArguments(schema, prepared), prepared);
    assert.equal(original.birthHour, '9');
    await executeTool('bazi', prepared);
    await assert.rejects(() => executeTool('bazi', prepareToolArguments(schema, { ...prepared, birthHour: '24' }) as Record<string, unknown>));
    await assert.rejects(() => executeTool('bazi', prepareToolArguments(schema, { ...prepared, birthHour: '9.5' }) as Record<string, unknown>));
});

test('task identity and random seed overrides are blocked, legitimate record IDs stay available', () => {
    assert.ok(toolPolicyBlock('read_user_data', { userId: 'other' }));
    assert.ok(toolPolicyBlock('tarot', { seed: 'model-chosen' }));
    assert.ok(toolPolicyBlock('tarot', { seedScope: 'other' }));
    assert.equal(toolPolicyBlock('read_user_data', { type: 'bazi', id: 'owned-record' }), undefined);
    assert.equal(toolPolicyBlock('tarot', {}), undefined);
});
