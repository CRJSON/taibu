import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage } from '../types';
import { collectAgentArtifacts, formatAgentToolDuration, getAgentArtifactHref, getAgentToolState, getAgentResponseTiming, getAgentTaskSpan, groupAgentParts, getAgentActivityLabel, type AgentArtifact } from '../components/chat/agent/presentation';

const chart: AgentArtifact = { type: 'artifact', id: 'chart-part', title: '命盘', chartType: 'bazi', chartId: 'chart/with?special=字符' };
function message(parts: AgentArtifact[]): ChatMessage {
    return { id: 'message', role: 'assistant', content: '', createdAt: '2026-10-06',
        agent: { version: 1, runId: 'run', status: 'completed', parts } };
}

test('Agent artifact destinations encode IDs and prefer the saved record', () => {
    assert.equal(getAgentArtifactHref(chart), '/bazi/result?chart=chart%2Fwith%3Fspecial%3D%E5%AD%97%E7%AC%A6');
    assert.equal(getAgentArtifactHref({ ...chart, chartType: 'ziwei', chartId: 'z' }), '/ziwei/result?chart=z');
    assert.equal(getAgentArtifactHref({ ...chart, recordId: 'record?a=1' }), '/records?id=record%3Fa%3D1');
});

test('Unsupported or incomplete artifacts do not link to an unrelated chart', () => {
    assert.equal(getAgentArtifactHref({ ...chart, chartType: 'unknown' }), null);
    assert.equal(getAgentArtifactHref({ ...chart, chartId: undefined }), null);
    assert.equal(getAgentArtifactHref({ ...chart, chartId: '' }), null);
});

test('Workspace deduplicates reused charts across regenerated tasks and retains distinct records', () => {
    const reused = { ...chart, id: 'new-part', title: '更新的命盘' };
    const firstRecord: AgentArtifact = { type: 'artifact', id: 'first', title: '分析一', recordId: 'r1' };
    const secondRecord: AgentArtifact = { ...firstRecord, id: 'second', recordId: 'r2' };
    assert.deepEqual(collectAgentArtifacts([message([chart, firstRecord]), message([reused, secondRecord])]), [reused, firstRecord, secondRecord]);
});

test('Workspace derives artifacts only from the visible conversation branch', () => {
    const record: AgentArtifact = { type: 'artifact', id: 'record', title: '旧分析', recordId: 'old' };
    const original = [message([chart, record])];
    assert.equal(collectAgentArtifacts(original).length, 2);
    assert.deepEqual(collectAgentArtifacts([message([chart])]), [chart]);
    assert.deepEqual(collectAgentArtifacts([]), []);
    assert.equal(original[0].agent?.parts.length, 2);
});

test('A terminal task never leaves unfinished tools spinning forever', () => {
    const tool = { type: 'tool', id: 'tool', name: 'bazi', title: '八字', status: 'running' } as const;
    for (const status of ['completed', 'cancelled', 'failed'] as const) {
        assert.equal(getAgentToolState(tool, status).status, 'interrupted');
    }
    for (const status of ['running', 'queued', 'awaiting_input', 'cancelling'] as const) {
        assert.equal(getAgentToolState(tool, status).status, 'running');
    }
    assert.equal(getAgentToolState({ ...tool, status: 'completed' }, 'cancelled').status, 'completed');
    assert.equal(getAgentToolState({ ...tool, status: 'failed' }, 'completed').status, 'failed');
    assert.equal(getAgentToolState({ ...tool, status: 'pending' }, 'running').label, '待执行');
    assert.equal(getAgentToolState({ ...tool, status: 'awaiting_input' }, 'awaiting_input').label, '等待回答');
    assert.equal(getAgentToolState({ ...tool, status: 'awaiting_input' }, 'cancelled').status, 'interrupted');
});

test('Completed cards show the durable-measured tool time without inventing a value for unfinished steps', () => {
    assert.equal(formatAgentToolDuration(0), '不足 1 毫秒');
    assert.equal(formatAgentToolDuration(240), '240 毫秒');
    assert.equal(formatAgentToolDuration(999), '999 毫秒');
    assert.equal(formatAgentToolDuration(1000), '1 秒');
    assert.equal(formatAgentToolDuration(2400), '2.4 秒');
    assert.equal(formatAgentToolDuration(9950), '10 秒');
    assert.equal(formatAgentToolDuration(10_000), '10 秒');
    assert.equal(formatAgentToolDuration(65_400), '65 秒');
    const completed = { type: 'tool', id: 'tool', name: 'bazi', title: '八字', status: 'completed', durationMs: 2400 } as const;
    assert.equal(completed.durationMs, 2400);
    const running = { type: 'tool', id: 'tool', name: 'bazi', title: '八字', status: 'running' } as const;
    assert.equal('durationMs' in running, false);
});

test('response measurements survive JSON history without counting duplicate IDs or inventing old measurements', () => {
    assert.equal(getAgentResponseTiming(undefined), null);
    const responses = [{ id: 'old' }, { id: 'first', durationMs: 1500 }, { id: 'second', durationMs: 0 }, { id: 'first', durationMs: 1500 }, { id: 'invalid', durationMs: -1 }];
    assert.deepEqual(getAgentResponseTiming(JSON.parse(JSON.stringify(responses))), { count: 2, durationMs: 1500 });
    assert.equal(getAgentResponseTiming([{ id: 'invalid', durationMs: NaN }, { id: 'invalid2', durationMs: Infinity }]), null);
    assert.equal(getAgentTaskSpan({ startedAt: 1000, endedAt: 6500 }), 5500);
    assert.equal(getAgentTaskSpan({ startedAt: 1000 }), null);
    assert.equal(getAgentTaskSpan({ endedAt: 6500 }), null);
    assert.equal(getAgentTaskSpan({ startedAt: 2000, endedAt: 1000 }), null);
    assert.equal(getAgentTaskSpan({ startedAt: NaN, endedAt: 1000 }), null);
});

test('Activity grouping preserves narration, question IDs and tool ordering', () => {
    const parts = [{ type: 'text', id: 'intro', text: 'intro' }, { type: 'reasoning', id: 'think', text: 'thinking' }, { type: 'tool', id: 'tool', name: 'bazi', title: '排盘', status: 'completed' }, { type: 'question', id: 'ask', question: 'question' }, { type: 'text', id: 'answer', text: 'answer' }] as const;
    const groups = groupAgentParts([...parts]);
    assert.equal(groups.length, 3);
    assert.equal(groups[1].type, 'activity');
    if (groups[1].type === 'activity') assert.deepEqual(groups[1].parts.map(part => part.id), ['think', 'tool', 'ask']);
    const data = { version: 1, runId: 'run', status: 'running', parts: [] } as const;
    assert.equal(getAgentActivityLabel({ ...data, parts: [], runtime: { model: { id: 'm', name: 'm', contextWindow: null, limitSource: 'unknown' }, activity: { phase: 'compacting' } } }), '正在压缩上下文');
    assert.equal(getAgentActivityLabel({ ...data, parts: [], status: 'awaiting_input' }), '等待你回答问题');
});
