type JsonRpcResponse<T = unknown> = {
  error?: {
    code?: number;
    message?: string;
  };
  id?: number;
  result?: T;
};

interface McpTool {
  description?: string;
  inputSchema?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  name: string;
}

interface ToolsListResult {
  tools?: McpTool[];
}

interface ToolCallResult {
  content?: {
    text?: string;
    type?: string;
  }[];
  isError?: boolean;
}

interface McpPromptResult {
  detail: string;
  title: string;
}

const promptLikeArguments = ['prompt', 'query', 'message', 'input', 'text', 'question'];
let requestId = 1;
let initialized = false;
let sessionId = '';

function getNextId() {
  requestId += 1;
  return requestId;
}

async function readJsonRpcResponse<T>(response: Response): Promise<JsonRpcResponse<T>> {
  const text = await response.text();
  if (!text.trim()) return {};

  if (text.includes('event:') || text.includes('data:')) {
    const dataLine = text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('data:'));
    if (!dataLine) return {};
    return JSON.parse(dataLine.replace(/^data:\s*/, '')) as JsonRpcResponse<T>;
  }

  return JSON.parse(text) as JsonRpcResponse<T>;
}

async function mcpPost<T>(method: string, params?: Record<string, unknown>, notification = false) {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const body = notification
    ? { jsonrpc: '2.0', method, params }
    : {
        id: getNextId(),
        jsonrpc: '2.0',
        method,
        params,
      };

  const response = await fetch('/mcp-proxy', {
    body: JSON.stringify(body),
    headers,
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`MCP ${method} 请求失败：HTTP ${response.status}`);
  }

  const nextSessionId = response.headers.get('mcp-session-id');
  if (nextSessionId) sessionId = nextSessionId;
  if (notification) return {};

  const json = await readJsonRpcResponse<T>(response);
  if (json.error) {
    throw new Error(json.error.message || `MCP ${method} 返回错误`);
  }
  return json.result as T;
}

async function ensureInitialized() {
  if (initialized) return;

  await mcpPost('initialize', {
    capabilities: {},
    clientInfo: {
      name: 'iovagent-local-prompt-tester',
      version: '0.1.0',
    },
    protocolVersion: '2024-11-05',
  });
  try {
    await mcpPost('notifications/initialized', undefined, true);
  } catch (error) {
    console.warn('MCP initialized notification failed, continuing for local prompt testing.', error);
  }
  initialized = true;
}

function inferPromptArgumentName(tool: McpTool) {
  const properties = Object.keys(tool.inputSchema?.properties ?? {});
  return promptLikeArguments.find((name) => properties.includes(name)) ?? properties[0] ?? 'prompt';
}

function describeTools(tools: McpTool[]) {
  return tools
    .map((tool) => {
      const properties = Object.keys(tool.inputSchema?.properties ?? {});
      return `${tool.name}${properties.length ? `(${properties.join(', ')})` : ''}`;
    })
    .join('、');
}

function pickTool(tools: McpTool[]) {
  const envToolName = import.meta.env.VITE_MCP_TOOL_NAME as string | undefined;
  if (envToolName) {
    return tools.find((tool) => tool.name === envToolName);
  }

  return tools.find((tool) => {
    const properties = Object.keys(tool.inputSchema?.properties ?? {});
    return properties.some((name) => promptLikeArguments.includes(name));
  });
}

function formatToolResult(result: ToolCallResult) {
  const text = result.content
    ?.map((item) => item.text)
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (text) return text;
  return JSON.stringify(result, null, 2);
}

export function extractMcpPrompt(raw: string) {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('/mcp ')) return trimmed.slice(5).trim();
  if (lower.startsWith('mcp:')) return trimmed.slice(4).trim();
  if (trimmed.startsWith('MCP：')) return trimmed.slice(4).trim();
  if (trimmed.includes('测试MCP') || lower.includes('测试mcp')) return trimmed;
  return '';
}

export async function runMcpPrompt(prompt: string): Promise<McpPromptResult> {
  if (!prompt.trim()) {
    throw new Error('请输入要发送到 MCP 服务的 prompt。');
  }

  await ensureInitialized();

  const listResult = await mcpPost<ToolsListResult>('tools/list');
  const tools = listResult.tools ?? [];
  if (tools.length === 0) {
    return {
      detail: '已连接 MCP 服务，但 tools/list 未返回可调用工具。请确认服务是否通过 tools 暴露 prompt 测试入口。',
      title: 'MCP 已连接',
    };
  }

  const tool = pickTool(tools);
  const envToolName = import.meta.env.VITE_MCP_TOOL_NAME as string | undefined;
  if (!tool) {
    return {
      detail: envToolName
        ? `已连接 MCP 服务，但未找到配置的工具 ${envToolName}。当前可用工具：${describeTools(tools)}`
        : `已连接 MCP 服务，但未找到适合直接接收 prompt 的工具。当前可用工具：${describeTools(tools)}。如需测试指定工具，请在 .env.local 设置 VITE_MCP_TOOL_NAME 和 VITE_MCP_PROMPT_ARGUMENT 后重启 Vite。`,
      title: 'MCP 工具待配置',
    };
  }

  const promptArgument = (import.meta.env.VITE_MCP_PROMPT_ARGUMENT as string | undefined) || inferPromptArgumentName(tool);
  const callResult = await mcpPost<ToolCallResult>('tools/call', {
    arguments: {
      [promptArgument]: prompt,
    },
    name: tool.name,
  });

  return {
    detail: formatToolResult(callResult),
    title: `MCP 工具返回：${tool.name}`,
  };
}
