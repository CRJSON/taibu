import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTool, listToolDefinitions, renderToolResult } from 'taibu-core/mcp';
import { validateOutput } from '../dist/mcp/output-validator.js';

test('every domain and supported detail level satisfies its public output schema', async () => {
  const definitions=listToolDefinitions();
  assert.equal(definitions.length,15);
  for(const definition of definitions) {
    const input={ ...definition.inputSchema.examples[0] };
    // Freeze otherwise dynamic inputs to make this regression replayable.
    if(definition.name==='tarot') { input.seed='contract-completeness'; input.referenceYear=2024; }
    if(definition.name==='astrology') input.transitDateTime='2024-06-01T12:00:00Z';
    const result=await executeTool(definition.name,input);
    for(const detailLevel of ['default','more','full']) {
      const rendered=renderToolResult(definition.name,result,{detailLevel});
      assert.ok(rendered.structuredContent,`${definition.name} ${detailLevel}`);
      assert.ok(rendered.structuredContent.计算规则?.ruleVersion || rendered.structuredContent.计算规则?.规则版本,definition.name);
      assert.doesNotThrow(()=>validateOutput(definition.name,rendered.structuredContent,definition.outputSchema));
      assert.ok(rendered.content[0].text.length>0);
      if(rendered.structuredContent.计算规则) assert.match(rendered.content[0].text,/计算规则/);
    }
    assert.throws(()=>validateOutput(definition.name,{},definition.outputSchema),{code:'OUTPUT_SCHEMA_MISMATCH'});
  }
});

test('Xiaoliuren schema rejects date plus even a partial manual lunar counter',async()=>{
  await assert.rejects(executeTool('xiaoliuren',{date:'2024-01-01',lunarMonth:1,hour:0}),{name:'CoreInputError'});
});

test('incomplete board rows are rejected before MCP serialization', async () => {
  for(const [name,path] of [['bazi',['四柱']],['ziwei',['十二宫位']],['liuyao',['六爻全盘','爻列表']],['qimen',['九宫盘']],['daliuren',['三传']]]) {
    const definition=listToolDefinitions().find(tool=>tool.name===name);
    const raw=await executeTool(name,definition.inputSchema.examples[0]);
    const json=JSON.parse(JSON.stringify(renderToolResult(name,raw).structuredContent));
    let parent=json;
    for(const key of path.slice(0,-1)) parent=parent[key];
    parent[path.at(-1)].pop();
    assert.throws(()=>validateOutput(name,json,definition.outputSchema),{code:'OUTPUT_SCHEMA_MISMATCH'});
  }
});

test('new input bounds, conditional fields and nested profile enums reject invalid MCP calls', async () => {
  for(const [name,patch] of [
    ['bazi',{birthHour:24}],['bazi',{longitude:181}],['ziwei',{calculationOptions:{algorithm:'unknown'}}],
    ['ziwei_horoscope',{targetTimeIndex:13}],['astrology',{zodiac:'sidereal'}],['astrology',{latitude:91}],
    ['liuyao',{method:'coins',yaoValues:[6,7]}],['tarot',{reversedProbability:2}],['tarot',{birthYear:2024}],['tarot',{seedScope:123}],['tarot',{detailLevel:'invalid'}],
    ['xiaoliuren',{date:'2024-01-01'}],['qimen',{panType:'unknown'}],
  ]) {
    const definition=listToolDefinitions().find(tool=>tool.name===name);
    assert.ok(definition,name);
    await assert.rejects(executeTool(name,{...definition.inputSchema.examples[0],...patch}),`${name} ${JSON.stringify(patch)}`);
  }
});

test('empty or anonymous Tarot card rows fail the public output contract',async()=>{
  const definition=listToolDefinitions().find(tool=>tool.name==='tarot');
  const raw=await executeTool('tarot',{seed:'contract',referenceYear:2024});
  const json=renderToolResult('tarot',raw).structuredContent;
  for(const cards of [[],[{}]]) assert.throws(()=>validateOutput('tarot',{...json,牌阵展开:cards},definition.outputSchema),{code:'OUTPUT_SCHEMA_MISMATCH'});
});
