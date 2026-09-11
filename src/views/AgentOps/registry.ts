import type { CodeTool, ManagedAgent } from '@/pinia/agentOps';

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function uniqueIds(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => object(item) && typeof item.id === 'string' && item.id.trim()) && new Set(value.map((item) => item.id)).size === value.length;
}
export function parseAgentRegistry(value: unknown): ManagedAgent[] {
  if (!uniqueIds(value) || !value.every((item) =>
    ['data-employee', 'general-chat', 'project-chat', 'custom'].includes(String(item.role)) &&
    typeof item.name === 'string' && item.name.trim() && typeof item.systemPrompt === 'string' && item.systemPrompt.trim() &&
    typeof item.updatedAt === 'string' && typeof item.updatedBy === 'string'
  )) throw new Error('Agent 目录格式不正确，未更新当前配置。');
  return value.map(({ id, role, name, systemPrompt, updatedAt, updatedBy }) => ({ id, role, name, systemPrompt, updatedAt, updatedBy })) as ManagedAgent[];
}
export function parseCodeToolRegistry(value: unknown): CodeTool[] {
  const parameters = (items: unknown) => Array.isArray(items) && items.every((item) => object(item) &&
    typeof item.name === 'string' && item.name.trim() && ['string', 'number', 'boolean', 'object', 'array'].includes(String(item.type)) &&
    typeof item.required === 'boolean' && typeof item.description === 'string');
  if (!uniqueIds(value) || !value.every((item) => item.kind === 'code' &&
    typeof item.name === 'string' && item.name.trim() && typeof item.description === 'string' &&
    ['Python 3', 'Node.js'].includes(String(item.runtime)) && typeof item.entrypoint === 'string' && item.entrypoint.trim() &&
    typeof item.updatedAt === 'string' && parameters(item.inputs) && parameters(item.outputs)
  )) throw new Error('代码工具目录格式不正确，未更新当前配置。');
  return JSON.parse(JSON.stringify(value)) as CodeTool[];
}

async function fetchRegistry(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`同步失败（HTTP ${response.status}），请重试。`);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('同步超时，请检查连接后重试。');
    throw error;
  } finally { clearTimeout(timeout); }
}
// These files are the demo's engineering registry, shared by initial load and manual sync.
export const loadAgentRegistry = () => fetchRegistry(new URL('../../data/agentOpsAgents.json?no-inline', import.meta.url));
export const loadCodeToolRegistry = () => fetchRegistry(new URL('../../data/agentOpsCodeTools.json?no-inline', import.meta.url));
