import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
// Deliberately deterministic/offline. Never represents actual divination or model quality.
const content = '这是本地离线演示回复，仅用于验证请求、流式响应与保存流程，不提供真实 AI 分析。';
function agentReply(body) {
  if(!body.tools?.some(tool=>tool.function?.name==='bazi'))return {content};
  const messages=body.messages??[];
  const first=messages.find(message=>message.role==='user'&&String(message.content).includes('Agent验收：'));
  if(!first)return {content};
  const completed=new Map(messages.filter(message=>message.role==='tool').map(message=>[message.tool_call_id,message.content]));
  const call=(id,name,args)=>({content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
  if(String(first.content).includes('补充信息')&&!completed.has('fixture-ask'))return call('fixture-ask','ask_user',{question:'请补充出生年月日、出生时刻和性别。'});
  if(!completed.has('fixture-bazi'))return call('fixture-bazi','bazi',{gender:'male',birthYear:1990,birthMonth:1,birthDay:15,birthHour:9});
  if(String(first.content).includes('跨命盘')&&!completed.has('fixture-other'))return call('fixture-other','bazi',{gender:'female',birthYear:1995,birthMonth:6,birthDay:20,birthHour:10,birthMinute:30});
  if(!completed.has('fixture-select')) {
    const artifactIds=[...completed.entries()].filter(([id])=>id.startsWith('fixture-bazi')||id==='fixture-other').map(([,text])=>String(text).match(/成果 ID: ([a-f0-9-]{36})/iu)?.[1]).filter(Boolean);
    return call('fixture-select','select_final_artifacts',{artifactIds});
  }
  return {content:'Agent 离线验收已完成真实工具排盘和成果选择。此文字来自确定性测试模型，用于验证后台执行、恢复和保存流程。'};
}
if (!process.env.DEMO_API_KEY) throw new Error('缺少演示密钥');
http.createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${process.env.DEMO_API_KEY}`) { response.writeHead(401).end(); return; }
  if (request.method === 'GET' && request.url === '/v1/models') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: 'taibu-demo', object: 'model', owned_by: 'local-demo' }] })); return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404).end(); return; }
  let raw = '';
  try {
    for await (const chunk of request) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 1_048_576) { response.writeHead(413).end(); return; }
    }
    const body = JSON.parse(raw);
    if (body.tools && (body.messages ?? []).some(message => message.role === 'user' && String(message.content).includes('Agent验收：崩溃恢复'))) await delay(3000);
    const base = { id: 'chatcmpl-local-demo', created: 0, model: 'taibu-demo' };
    const message=agentReply(body);
    if (body.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const deltas = message.tool_calls?[{role:'assistant'},...message.tool_calls.map((call,index)=>({tool_calls:[{index,...call}]})),{}]:[{ role: 'assistant' }, ...Array.from(message.content.matchAll(/.{1,12}/gu), match => ({ content: match[0] })), {}];
      for (let index = 0; index < deltas.length; index++) {
        if (response.destroyed) return;
        response.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: deltas[index], finish_reason: index === deltas.length - 1 ? message.tool_calls?'tool_calls':'stop' : null }] })}\n\n`);
        await delay(60);
      }
      response.end('data: [DONE]\n\n');
    } else response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason: message.tool_calls?'tool_calls':'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  } catch { if (!response.headersSent) response.writeHead(400); response.end(); }
}).listen(8000, '0.0.0.0');
