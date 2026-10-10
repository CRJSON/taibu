import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage } from '../types';
import { collectAgentArtifacts, formatAgentToolDuration, getAgentArtifactHref, getAgentToolState, getAgentResponseTiming, getAgentTaskSpan, groupAgentParts, getAgentActivityLabel, getAgentEvidenceSummary, summarizeAgentTool, AGENT_TOOL_FAMILY_LABELS, type AgentArtifact, type AgentTool } from '../components/chat/agent/presentation';
import { formatAgentElapsed } from '../components/chat/agent/AgentHeaderStatus';

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

test('process steps summarize each call from its arguments and stored result only', () => {
    const tool = (name: string, extra: Partial<AgentTool> = {}): AgentTool => ({ type: 'tool', id: name, name, title: name, status: 'completed', ...extra });
    assert.equal(summarizeAgentTool(tool('bazi_dayun', { input: { birthYear: 1990, birthMonth: 1, birthDay: 15, birthHour: 9 } })), '1990 / 1 / 15 · 9 时');
    assert.equal(summarizeAgentTool(tool('search_knowledge', { input: { query: '庚金 正官 月令' }, output: [{ content: '庚金带煞' }, { content: '八字用神' }] })), '「庚金 正官 月令」 · 命中 2 条');
    assert.equal(summarizeAgentTool(tool('web_search', { input: { query: '丑月' }, output: [] })), '「丑月」 · 没有可引用的结果');
    assert.equal(summarizeAgentTool(tool('web_search', { status: 'running', input: { query: '丑月' } })), '「丑月」', 'a running search never claims a hit count');
    assert.equal(summarizeAgentTool(tool('list_user_data', { output: { items: [{ id: 'a', type: 'bazi_chart', name: '本人', preview: '己巳' }], errors: [{ message: '塔罗不可读' }] } })), '找到 1 份资料 · 1 项暂不可读');
    assert.equal(summarizeAgentTool(tool('parallel_analysis', { status: 'running', output: { analyses: [{ system: 'bazi', conversationId: 1, status: 'completed' }, { system: 'bazi', conversationId: 2, status: 'running' }] } })), '2 名成员 · 1 名已完成');
    assert.equal(summarizeAgentTool(tool('ask_user', { status: 'awaiting_input', input: { questions: [{ id: 'a', question: '城市？' }, { id: 'b', question: '行业？' }] } })), '2 个问题');
    assert.equal(summarizeAgentTool(tool('focus_chart', { output: { chartFocus: { version: 1, reference: 'artifact:11111111-1111-4111-8111-111111111111', targetIds: [], includeRelated: true, caption: '月干丁火' } } })), '月干丁火');
    assert.equal(summarizeAgentTool(tool('read_attachment', { output: { id: 'a', name: '长文.txt', kind: 'text', text: '一二', offset: 0, total: 9, nextOffset: 2 } })), '长文.txt · 读到 2 / 9 字');
    assert.equal(summarizeAgentTool(tool('mcp__archive__lookup', { input: { keyword: 1 } })), null);
    assert.equal(Object.keys(AGENT_TOOL_FAMILY_LABELS).length, 12, 'every tool family has a step tag');
});

test('the evidence chip counts only completed search results and the header clock never runs backwards', () => {
    const parts = [
        { type: 'tool', id: 'w', name: 'web_search', title: '', status: 'completed', output: [{ title: 'a', url: 'https://a.example', content: 'x' }] },
        { type: 'tool', id: 'k', name: 'search_knowledge', title: '', status: 'completed', output: [{ content: 'y' }, { content: 'z' }] },
        { type: 'tool', id: 'r', name: 'web_search', title: '', status: 'running' },
        { type: 'tool', id: 'b', name: 'bazi', title: '', status: 'completed', output: [{ content: 'not evidence' }] },
    ] as AgentTool[];
    assert.deepEqual(getAgentEvidenceSummary(parts), { total: 3, web: 1, knowledge: 2 });
    assert.deepEqual(getAgentEvidenceSummary([]), { total: 0, web: 0, knowledge: 0 });
    assert.equal(formatAgentElapsed(72_000), '1 分 12 秒');
    assert.equal(formatAgentElapsed(-5), '0 秒');
    assert.equal(formatAgentElapsed(3_723_000), '1 小时 2 分');
});
