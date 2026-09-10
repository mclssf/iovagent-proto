import type { McpTool } from '@/pinia/agentOps';

export interface McpKeyValue { key: string; value: string; }
export interface McpConfig {
  name: string;
  description: string;
  transport: McpTool['transport'];
  endpoint: string;
  args: string[];
  bearerTokenEnvVar: string;
  headers: McpKeyValue[];
  envHeaders: McpKeyValue[];
  envVars: McpKeyValue[];
  timeout: number;
}
export const sensitiveHeader = (key: string) => /authorization|cookie|token|secret|password|api[-_]?key/i.test(key);
const envName = /^[A-Za-z_][A-Za-z0-9_]*$/;
function pairs(rows: McpKeyValue[], label: string, environmentValues = false): McpKeyValue[] {
  const result = rows.map((row) => ({ key: row.key.trim(), value: row.value.trim() })).filter((row) => row.key || row.value);
  if (result.some((row) => !row.key || !row.value)) throw new Error(`${label}的名称和值都必须填写，或删除空行。`);
  if (result.some((row) => /[\r\n]/.test(row.key + row.value))) throw new Error(`${label}不能包含换行。`);
  if (environmentValues && result.some((row) => !envName.test(row.value))) throw new Error('请求头的环境变量名称只能包含字母、数字和下划线，且不能以数字开头。');
  if (new Set(result.map((row) => row.key.toLowerCase())).size !== result.length) throw new Error(`${label}名称不能重复。`);
  return result;
}
export function normalizeMcpConfig(config: McpConfig): McpConfig {
  const name = config.name.trim(), endpoint = config.endpoint.trim();
  if (!name || name.length > 60) throw new Error('请填写 MCP 名称，最多 60 个字符。');
  if (!['Streamable HTTP', 'SSE', 'stdio'].includes(config.transport)) throw new Error('请选择有效的连接类型。');
  if (!Number.isInteger(config.timeout) || config.timeout < 1 || config.timeout > 300) throw new Error('超时时间须为 1–300 秒的整数。');
  if (config.transport === 'stdio') {
    if (!endpoint || /[\r\n]/.test(endpoint)) throw new Error('请填写有效的启动命令。');
    const envVars = pairs(config.envVars, '环境变量');
    if (envVars.some((row) => !envName.test(row.key))) throw new Error('环境变量名称格式不正确。');
    return { name, description: config.description.trim(), endpoint, transport: config.transport, timeout: config.timeout,
      args: config.args.map((arg) => arg.trim()).filter(Boolean), envVars, headers: [], envHeaders: [], bearerTokenEnvVar: '' };
  }
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
  } catch { throw new Error('请输入有效的 HTTP 或 HTTPS 服务地址；认证信息请使用下方配置。'); }
  const bearerTokenEnvVar = config.bearerTokenEnvVar.trim();
  if (bearerTokenEnvVar && !envName.test(bearerTokenEnvVar)) throw new Error('Bearer Token 环境变量名称格式不正确，请填写变量名。');
  const headers = pairs(config.headers, '请求头'), envHeaders = pairs(config.envHeaders, '环境变量请求头', true);
  const keys = [...headers, ...envHeaders].map((row) => row.key.toLowerCase());
  if ([...headers, ...envHeaders].some((row) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(row.key))) throw new Error('请求头名称包含不支持的字符。');
  if (new Set(keys).size !== keys.length || (bearerTokenEnvVar && keys.includes('authorization'))) throw new Error('同一个请求头只能配置一次，Authorization 不能与 Bearer Token 环境变量重复配置。');
  return { name, description: config.description.trim(), transport: config.transport, endpoint, timeout: config.timeout,
    bearerTokenEnvVar, headers, envHeaders, args: [], envVars: [] };
}
