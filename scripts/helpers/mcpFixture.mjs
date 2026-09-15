import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function startMcpFixture() {
  const schema = { type: 'object', properties: { location: { type: 'string', description: '查询地点' } }, required: ['location'] };
  const state = { delay: 0, failure: false, empty: false, duplicate: false, malformed: false, protocol: '2025-06-18', requests: [], methods: [
    { name: 'get_weather', title: '天气查询', description: '查询地区天气和运输预警。', inputSchema: schema, outputSchema: { type: 'object', properties: { temperature: { type: 'number' } } } },
    { name: 'check_address', title: '地址校验', description: '校验运输地址。', inputSchema: schema },
  ] };
  const streams = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin ?? '')) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, X-Region');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (url.pathname === '/unauthorized') { res.writeHead(401).end(); return; }
    if (req.method === 'GET' && ['/sse', '/cross-origin'].includes(url.pathname)) {
      const id = randomUUID();
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(`event: endpoint\r\ndata: ${url.pathname === '/cross-origin' ? 'https://other.example.com/messages' : `/messages?id=${id}`}\r\n\r\n`);
      streams.set(id, res);
      req.on('close', () => streams.delete(id));
      state.requests.push({ method: 'sse-connect', headers: req.headers });
      return;
    }
    if (req.method !== 'POST') { res.writeHead(404).end(); return; }
    let input = '';
    for await (const chunk of req) input += chunk;
    const message = JSON.parse(input);
    state.requests.push({ ...message, headers: req.headers });
    const legacyStream = streams.get(url.searchParams.get('id'));
    if (message.id === undefined) { res.writeHead(202).end(); return; }
    let result;
    if (message.method === 'initialize') {
      result = { protocolVersion: state.protocol, serverInfo: { name: '本地验证 MCP', version: '1.2.3' }, capabilities: { tools: {} } };
      res.setHeader('Mcp-Session-Id', 'fixture-session');
    } else if (message.method === 'tools/list') {
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      const index = message.params?.cursor === 'page-2' ? 1 : 0;
      const list = state.empty ? [] : state.methods.slice(index, index + 1);
      result = { tools: state.malformed ? [{ name: 'broken' }] : list, ...(index === 0 && !state.empty && state.methods.length > 1 ? { nextCursor: 'page-2' } : {}) };
      if (state.duplicate && index) result.tools = [state.methods[0]];
    } else { res.writeHead(400).end(); return; }
    const reply = JSON.stringify(state.failure && message.method === 'tools/list' ? { jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'server-error-must-not-be-exposed' } } : { jsonrpc: '2.0', id: message.id, result });
    if (legacyStream) {
      res.writeHead(202).end();
      legacyStream.write(`event: message\ndata: ${reply}\n\n`);
    } else if (url.pathname === '/streaming') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n');
      const frame = `event: message\r\ndata: ${reply}\r\n\r\n`;
      const bytes = Buffer.from(frame), middle = Math.floor(bytes.length / 2);
      res.write(bytes.subarray(0, middle));
      res.write(bytes.subarray(middle));
      // Keep the stream open: clients must stop at their response, not wait for EOF.
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(reply);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: async () => { streams.forEach(stream => stream.end()); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startMcpFixture();
  console.log(`MCP fixture: ${fixture.url} (/mcp, /streaming, /sse)`);
  process.on('SIGINT', async () => { await fixture.close(); process.exit(0); });
}
