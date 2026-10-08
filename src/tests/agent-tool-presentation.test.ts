import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildToolSuccessPayload, executeTool, listToolDefinitions } from 'taibu-core/mcp';
import { AGENT_CHART_NAMES, getAgentChart, getAgentDataResults, getAgentSearchResults, getAgentToolArtifactId, getAgentToolText, getAgentUnrepresentedArtifacts, isAgentChartTool, type AgentToolPart } from '../lib/agent/tool-presentation';

test('eight real tool results display the persisted reading in default/full formats and after JSON history restore', async () => {
  const definitions = listToolDefinitions();
  for (const name of Object.keys(AGENT_CHART_NAMES)) {
    const definition = definitions.find(tool => tool.name === name)!;
    const input = { ...definition.inputSchema.examples![0] as Record<string, unknown> };
    if (definition.inputSchema.properties?.seed) input.seed = 'ui-presentation-contract';
    if (name === 'tarot') input.referenceYear = 2026;
    const result = await executeTool(name, input);
    for (const detailLevel of ['default', 'full'] as const) {
      const returned = buildToolSuccessPayload(name, result, { detailLevel });
      const tool: AgentToolPart = { type: 'tool', id: name, name, title: name, status: 'completed', input,
        output: { artifactId: name, result: returned.structuredContent }, canonicalText: returned.content.map(item => item.text).join('\n') };
      const before = JSON.stringify(tool);
      const value = getAgentChart(tool);
      assert.ok(value, `${name} ${detailLevel}`);
      assert.equal(value.kind, name);
      assert.ok(value.summary);
      assert.deepEqual(getAgentChart(JSON.parse(before)), value, `${name}: restored history must keep the reading`);
      assert.equal(JSON.stringify(tool), before, 'presentation does not mutate execution data');
      if (value.kind === 'liuyao') {
        assert.equal(value.chart.六爻.length, 6);
        assert.equal(value.chart.卦盘.本卦.卦名, (returned.structuredContent as { 卦盘: { 本卦: { 卦名: string } } }).卦盘.本卦.卦名);
      } else assert.equal(value.chart, returned.structuredContent, 'the view consumes the returned object directly');
      assert.equal(getAgentToolText(tool), tool.canonicalText);
      for (const status of ['pending', 'running', 'awaiting_input', 'failed'] as const) assert.equal(getAgentChart({ ...tool, status }), null);
    }
  }
});

test('invalid, incomplete and unknown tool data cannot invent a replacement chart', () => {
  for (const name of Object.keys(AGENT_CHART_NAMES)) for (const output of [null, [], '{}', {}, { result: null }, { result: {} }, { result: { 四柱: [], 六爻: [], 十二宫位: [] } }]) {
    const tool: AgentToolPart = { type: 'tool', id: name, name, title: name, status: 'completed', output, canonicalText: '真实工具文本' };
    assert.equal(getAgentChart(tool), null);
    assert.equal(getAgentToolText(tool), '真实工具文本');
  }
  for (const name of ['unknown', '__proto__', 'constructor', 'bazi_dayun']) assert.equal(isAgentChartTool(name), false);
});

test('search views keep returned excerpts and only expose HTTP sources', () => {
  const tool: AgentToolPart = { type: 'tool', id: 'search', name: 'web_search', title: '联网查询', status: 'completed', output: [
    { title: '可信来源', url: 'https://example.com/source', content: '返回摘要' },
    { title: '无链接资料', url: 'javascript:alert(1)', content: '保留其文本' }, {},
  ] };
  assert.deepEqual(getAgentSearchResults(tool)?.map(item => [item.title, item.url]), [['可信来源', 'https://example.com/source'], ['无链接资料', null]]);
  assert.equal(getAgentSearchResults({ ...tool, status: 'failed' }), null);
  assert.equal(getAgentSearchResults({ ...tool, name: 'bazi' }), null);
  assert.deepEqual(getAgentSearchResults({ ...tool, output: [] }), []);
  assert.equal(getAgentToolText({ ...tool, name: 'read_user_data', output: [{ type: 'text', text: '已保存命盘' }] }), '已保存命盘');
});

test('personal-data results preserve partial failures and filter incomplete rows', () => {
  const tool: AgentToolPart = { type: 'tool', id: 'data', name: 'list_user_data', title: '资料', status: 'completed', output: {
    items: [{ id: 'chart-id', type: 'bazi_chart', name: '命盘', preview: '真实摘要' }, { id: 'incomplete' }],
    errors: [{ type: 'tarot', message: '查询失败' }],
  } };
  assert.deepEqual(getAgentDataResults(tool), { items: [{ id: 'chart-id', type: 'bazi_chart', name: '命盘', preview: '真实摘要' }], errors: ['查询失败'] });
  assert.equal(getAgentDataResults({ ...tool, status: 'running' }), null);
});

test('saved artifacts are counted once with their completed chart tool and unrelated history remains visible', () => {
  const tool: AgentToolPart = { type: 'tool', id: 'call', name: 'bazi', title: '八字', status: 'completed', output: { artifactId: 'saved', result: {} } };
  const artifacts = [{ id: 'saved', title: '已保存八字' }, { id: 'legacy', title: '历史记录' }];
  assert.equal(getAgentToolArtifactId(tool), 'saved');
  assert.deepEqual(getAgentUnrepresentedArtifacts([tool], artifacts), [artifacts[1]]);
  assert.deepEqual(getAgentUnrepresentedArtifacts([{ ...tool, status: 'failed' }], artifacts), artifacts);
  assert.deepEqual(getAgentUnrepresentedArtifacts([{ ...tool, name: 'web_search' }], artifacts), artifacts);
  assert.equal(getAgentToolArtifactId({ ...tool, output: { artifactId: 12 } }), null);
});
