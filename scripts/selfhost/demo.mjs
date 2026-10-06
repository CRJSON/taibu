import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
// Deliberately deterministic/offline. Never represents actual divination or model quality.
const content = '这是本地离线演示回复，仅用于验证请求、流式响应与保存流程，不提供真实 AI 分析。';
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
    const base = { id: 'chatcmpl-local-demo', created: 0, model: 'taibu-demo' };
    const message={content};
    if (body.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const deltas = [{ role: 'assistant' }, ...Array.from(message.content.matchAll(/.{1,12}/gu), match => ({ content: match[0] })), {}];
      for (let index = 0; index < deltas.length; index++) {
        if (response.destroyed) return;
        response.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: deltas[index], finish_reason: index === deltas.length - 1 ? 'stop' : null }] })}\n\n`);
        await delay(60);
      }
      response.end('data: [DONE]\n\n');
    } else response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  } catch { if (!response.headersSent) response.writeHead(400); response.end(); }
}).listen(8000, '0.0.0.0');
