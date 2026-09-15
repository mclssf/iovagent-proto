export type McpTransport = 'Streamable HTTP' | 'SSE Legacy Transport';
export type McpAuth = '无需认证' | 'Bearer Token' | '自定义请求头';
export interface McpKeyValue { key: string; value: string; }
export interface McpConfig {
  name: string;
  description: string;
  transport: McpTransport;
  endpoint: string;
  auth: McpAuth;
  bearerToken: string;
  headers: McpKeyValue[];
  timeout: number;
}
export const sensitiveHeader = (key: string) => /authorization|cookie|token|secret|password|api[-_]?key/i.test(key);
export function normalizeMcpConfig(config: McpConfig): McpConfig {
  const name = config.name.trim(), endpoint = config.endpoint.trim();
  if (!name || name.length > 60) throw new Error('请填写 MCP 名称，最多 60 个字符。');
  if (!['Streamable HTTP', 'SSE Legacy Transport'].includes(config.transport)) throw new Error('请选择 Streamable HTTP 或 SSE Legacy Transport。');
  if (!Number.isInteger(config.timeout) || config.timeout < 1 || config.timeout > 300) throw new Error('超时时间须为 1–300 秒的整数。');
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) throw new Error();
  } catch { throw new Error('请输入有效的 HTTP 或 HTTPS 服务地址；认证信息请使用下方配置。'); }
  if (!['无需认证', 'Bearer Token', '自定义请求头'].includes(config.auth)) throw new Error('请选择认证方式。');
  const bearerToken = config.auth === 'Bearer Token' ? config.bearerToken.trim() : '';
  if (config.auth === 'Bearer Token' && (!bearerToken || /\s/.test(bearerToken))) throw new Error('请填写有效的 Bearer Token，不包含空白字符。');
  const headers = config.headers.map(row => ({ key: row.key.trim(), value: row.value.trim() })).filter(row => row.key || row.value);
  if (headers.some(row => !row.key || !row.value)) throw new Error('请求头的名称和值都必须填写，或删除空行。');
  if (headers.some(row => /[\r\n]/.test(row.key + row.value))) throw new Error('请求头不能包含换行。');
  if (headers.some(row => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(row.key))) throw new Error('请求头名称包含不支持的字符。');
  const keys = headers.map(row => row.key.toLowerCase());
  if (new Set(keys).size !== keys.length) throw new Error('同一个请求头只能配置一次。');
  if (keys.some(key => ['accept', 'content-type', 'mcp-session-id', 'mcp-protocol-version', 'host', 'content-length', 'origin', 'cookie'].includes(key))) throw new Error('该请求头由连接过程管理，请移除后保存。');
  if (bearerToken && keys.includes('authorization')) throw new Error('Authorization 不能与 Bearer Token 重复配置。');
  if (config.auth === '自定义请求头' && !headers.length) throw new Error('请至少添加一个认证请求头。');
  if (config.auth === '无需认证' && keys.some(sensitiveHeader)) throw new Error('认证请求头请使用“自定义请求头”认证方式。');
  return { name, description: config.description.trim(), transport: config.transport, endpoint, timeout: config.timeout, auth: config.auth, bearerToken, headers };
}
