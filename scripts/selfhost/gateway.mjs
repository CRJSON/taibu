import http from 'node:http';
import { pathToFileURL } from 'node:url';

const routes = [
  ['/auth/v1', 'auth', 9999], ['/rest/v1', 'rest', 3000],
  ['/storage/v1', 'storage', 5000], ['/functions/v1/create-vector-index', 'functions', 8000],
];
export function routeFor(url) {
  const path = url.split('?')[0];
  const route = routes.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return route ? { hostname: route[1], port: route[2], path: url.slice(route[0].length) || '/' }
    : { hostname: 'web', port: 3000, path: url };
}
export function cleanHeaders(headers, address, origin) {
  const output = { ...headers };
  const connectionHeaders = String(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim());
  for (const name of Object.keys(output)) {
    if (/^(cf-|x-vercel-|x-forwarded-|x-real-ip$|forwarded$|true-client-ip$|fastly-client-ip$)/i.test(name)
      || ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', ...connectionHeaders].includes(name.toLowerCase())) delete output[name];
  }
  const publicUrl = new URL(origin);
  output.host = publicUrl.host;
  output['x-forwarded-host'] = publicUrl.host;
  output['x-forwarded-proto'] = publicUrl.protocol.slice(0, -1);
  output['x-forwarded-for'] = address;
  output['x-real-ip'] = address;
  return output;
}
export function createGateway(origin) {
  const server = http.createServer((request, response) => {
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) { response.writeHead(400).end(); return; }
    const target = routeFor(request.url);
    if (target.path.startsWith('?')) target.path = `/${target.path}`;
    const upstream = http.request({ ...target, method: request.method,
      headers: cleanHeaders(request.headers, request.socket.remoteAddress ?? 'unknown', origin),
    }, incoming => {
      const headers = { ...incoming.headers };
      delete headers.connection;
      delete headers['transfer-encoding'];
      response.writeHead(incoming.statusCode ?? 502, headers);
      incoming.on('error', () => response.destroy());
      incoming.pipe(response); // Stream directly: no buffering, including SSE.
    });
    const deadline = setTimeout(() => upstream.destroy(new Error('deadline')), 300_000);
    upstream.setTimeout(60_000, () => upstream.destroy(new Error('idle')));
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => { clearTimeout(deadline); upstream.destroy(); });
    request.pipe(upstream);
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 300_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createGateway(process.env.APP_ORIGIN).listen(8000, '0.0.0.0');
}
