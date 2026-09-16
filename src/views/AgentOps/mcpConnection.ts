import type { McpConfig } from './mcpConfig';

export type McpSchema = Record<string, unknown>;
export interface McpMethod { name: string; title?: string; description: string; inputSchema?: McpSchema; outputSchema?: McpSchema; }
export interface McpConnectionInfo { protocolVersion: string; serverVersion: string; provider: string; }
export interface McpInspection extends McpConnectionInfo { methods?: McpMethod[]; }
export type McpInspector = (config: McpConfig, options: { listTools: boolean; signal: AbortSignal; onConnected: (info: McpConnectionInfo) => void }) => Promise<McpInspection>;
const supportedVersions = ['2025-06-18', '2025-03-26', '2024-11-05'];
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new Error('服务返回了无效的 JSON 数据。'); }
}
function rpcResult(message: unknown, id: number): unknown {
  if (!isObject(message) || message.jsonrpc !== '2.0' || message.id !== id) throw new Error('服务返回的请求编号或消息格式不正确。');
  if (message.error) {
    const code = isObject(message.error) && typeof message.error.code === 'number' ? `（${message.error.code}）` : '';
    // Do not display arbitrary server error text, which can echo credentials.
    throw new Error(`MCP 请求失败${code}，请检查服务权限与工具能力。`);
  }
  if (!('result' in message)) throw new Error('服务未返回请求结果。');
  return message.result;
}
function checkHttp(response: Response) {
  if (response.ok) return;
  if ([401, 403].includes(response.status)) throw new Error(`认证失败（HTTP ${response.status}），请检查 Token 或认证请求头。`);
  throw new Error(`连接失败（HTTP ${response.status}），请检查服务地址与 Transport。`);
}
async function readEvents(body: ReadableStream<Uint8Array> | null, receive: (event: string, data: string) => boolean) {
  if (!body) throw new Error('服务没有返回 SSE 数据流。');
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error('SSE 连接已结束，未收到完整响应。');
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 4_000_000) throw new Error('服务单条响应过大，本次同步未应用。');
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        let event = 'message';
        const data: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length && receive(event, data.join('\n'))) return;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function parseMethods(result: unknown): { methods: McpMethod[]; nextCursor?: string } {
  if (!isObject(result) || !Array.isArray(result.tools)) throw new Error('tools/list 未返回有效的工具列表。');
  const methods = result.tools.map((item: unknown): McpMethod => {
    if (!isObject(item) || typeof item.name !== 'string' || !item.name.trim() || !isObject(item.inputSchema) || item.inputSchema.type !== 'object') throw new Error('工具名称或输入 Schema 不完整，本次同步未应用。');
    if (item.description !== undefined && typeof item.description !== 'string') throw new Error('工具描述格式不正确，本次同步未应用。');
    if (item.outputSchema !== undefined && (!isObject(item.outputSchema) || item.outputSchema.type !== 'object')) throw new Error('工具输出 Schema 格式不正确，本次同步未应用。');
    return { name: item.name, ...(typeof item.title === 'string' ? { title: item.title } : {}), description: typeof item.description === 'string' ? item.description : '', inputSchema: item.inputSchema, ...(item.outputSchema ? { outputSchema: item.outputSchema as McpSchema } : {}) };
  });
  if (result.nextCursor !== undefined && typeof result.nextCursor !== 'string') throw new Error('工具列表分页信息不正确，本次同步未应用。');
  return { methods, nextCursor: result.nextCursor as string | undefined };
}

/** Browser client: initialize, notify, and optionally read all tools/list pages. Never invokes tools/call. */
export const inspectMcpServer: McpInspector = async (config, options) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeout * 1000);
  let sessionId = '', protocolVersion = '', nextId = 0;
  let postUrl = config.endpoint;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const headers = (post = true) => {
    const value = new Headers(config.headers.map((row): [string, string] => [row.key, row.value]));
    value.set('Accept', post ? 'application/json, text/event-stream' : 'text/event-stream');
    if (post) value.set('Content-Type', 'application/json');
    if (config.auth === 'Bearer Token') value.set('Authorization', `Bearer ${config.bearerToken}`);
    if (sessionId) value.set('Mcp-Session-Id', sessionId);
    if (protocolVersion) value.set('MCP-Protocol-Version', protocolVersion);
    return value;
  };
  const send = (body: unknown) => fetch(postUrl, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: controller.signal, credentials: 'omit', redirect: 'error' });
  let streamFailure: Error | undefined;
  async function request(method: string, params?: Record<string, unknown>, notification = false): Promise<unknown> {
    if (streamFailure) throw streamFailure;
    const id = ++nextId;
    const body = { jsonrpc: '2.0', ...(notification ? {} : { id }), method, ...(params ? { params } : {}) };
    let reply: Promise<unknown> | undefined;
    if (config.transport === 'SSE Legacy Transport' && !notification) {
      reply = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      void reply.catch(() => {});
    }
    try {
      const response = await send(body);
      checkHttp(response);
      if (config.transport === 'Streamable HTTP') sessionId = response.headers.get('Mcp-Session-Id') ?? sessionId;
      if (notification) { await response.body?.cancel(); return; }
      if (reply) { await response.body?.cancel(); return rpcResult(await reply, id); }
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        let message: unknown;
        await readEvents(response.body, (_event, data) => {
          const value = parseJson(data);
          if (isObject(value) && value.id === id) { message = value; return true; }
          return false;
        });
        return rpcResult(message, id);
      }
      return rpcResult(parseJson(await response.text()), id);
    } finally { pending.delete(id); }
  }
  try {
    if (config.transport === 'SSE Legacy Transport') {
      const response = await fetch(config.endpoint, { headers: headers(false), signal: controller.signal, credentials: 'omit', redirect: 'error' });
      checkHttp(response);
      if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('该地址未返回 SSE 数据流，请检查 Transport。');
      let resolveEndpoint!: () => void, rejectEndpoint!: (error: Error) => void;
      const endpointReady = new Promise<void>((resolve, reject) => { resolveEndpoint = resolve; rejectEndpoint = reject; });
      let receivedEndpoint = false;
      void readEvents(response.body, (event, data) => {
        if (event === 'endpoint' && !receivedEndpoint) {
          const endpoint = new URL(data, config.endpoint);
          if (endpoint.origin !== new URL(config.endpoint).origin || endpoint.username || endpoint.password || endpoint.hash) throw new Error('SSE 消息地址必须与服务地址同源。');
          postUrl = endpoint.href;
          receivedEndpoint = true;
          resolveEndpoint();
        } else if (event === 'message') {
          const value = parseJson(data);
          if (isObject(value) && typeof value.id === 'number') pending.get(value.id)?.resolve(value);
        }
        return false;
      }).catch(cause => {
        streamFailure = cause instanceof Error ? cause : new Error('SSE 连接中断。');
        rejectEndpoint(streamFailure);
        pending.forEach(item => item.reject(streamFailure!));
      });
      await endpointReady;
    }
    const initialized = await request('initialize', { protocolVersion: supportedVersions[0], capabilities: {}, clientInfo: { name: 'iovagent-tool-manager', version: '1.0.0' } });
    if (!isObject(initialized) || typeof initialized.protocolVersion !== 'string' || !isObject(initialized.serverInfo) || !isObject(initialized.capabilities)) throw new Error('MCP 初始化信息不完整。');
    if (!supportedVersions.includes(initialized.protocolVersion)) throw new Error('服务协商的协议版本暂不兼容，请调整 MCP Server 版本。');
    protocolVersion = initialized.protocolVersion;
    const info = { protocolVersion, provider: String(initialized.serverInfo.name ?? ''), serverVersion: String(initialized.serverInfo.version ?? '') };
    await request('notifications/initialized', undefined, true);
    options.onConnected(info);
    if (!options.listTools) return info;
    if (!isObject(initialized.capabilities.tools)) throw new Error('服务未声明工具能力，无法同步工具列表。');
    const methods: McpMethod[] = [], cursors = new Set<string>(), names = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = parseMethods(await request('tools/list', cursor ? { cursor } : {}));
      for (const method of page.methods) {
        if (names.has(method.name)) throw new Error('服务返回重复的工具名称，本次同步未应用。');
        names.add(method.name);
        methods.push(method);
      }
      if (methods.length > 10000 || cursors.size >= 100) throw new Error('工具列表超出单次同步范围，本次同步未应用。');
      cursor = page.nextCursor || undefined;
      if (cursor && cursors.has(cursor)) throw new Error('工具列表分页游标重复，本次同步未应用。');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return { ...info, methods };
  } catch (cause) {
    if (timedOut) throw new Error('连接或同步超时，请检查服务后重试。');
    if (options.signal.aborted) throw new Error('连接配置已变化，本次操作已取消。');
    if (cause instanceof TypeError) throw new Error('无法访问 MCP 服务，请检查地址、网络和跨域访问配置。');
    throw cause;
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', abort);
    controller.abort();
  }
};
