import { defineStore } from 'pinia';
import { computed, readonly, ref } from 'vue';
import type { DeepReadonly } from 'vue';
import { analyzeAgentConflicts } from '@/views/AgentOps/agentConflicts';
import type { AgentConflictReport } from '@/views/AgentOps/agentConflicts';
import { createDataEmployeeSkills } from './dataEmployeeSkills';
import type { DataEmployeeSkill } from './dataEmployeeSkills';
import agentRegistry from '@/data/agentOpsAgents.json';
import codeRegistry from '@/data/agentOpsCodeTools.json';
import { loadAgentRegistry, loadCodeToolRegistry, parseAgentRegistry, parseCodeToolRegistry } from '@/views/AgentOps/registry';
import { normalizeMcpConfig } from '@/views/AgentOps/mcpConfig';
import type { McpConfig, McpKeyValue } from '@/views/AgentOps/mcpConfig';

export type AgentRole = 'data-employee' | 'general-chat' | 'project-chat' | 'custom';
export const agentRoleDescriptions: Record<AgentRole, string> = {
  'data-employee': '按数据来源选择 Skill，完成系统登录、数据采集与标准字段映射。',
  'general-chat': '负责未绑定项目的通用对话，按用户提供的信息选择能力。',
  'project-chat': '负责当前项目内的对话，结合项目数据与企业权限调用能力。',
  custom: '按独立的 System Prompt 和能力配置处理任务。',
};

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  skillIds: string[];
  toolIds: string[];
}
export interface ManagedAgent extends AgentConfig {
  id: string;
  role: AgentRole;
  updatedAt: string;
  updatedBy: string;
}

export type SkillCategory = '在途专家' | '经营分析参谋' | '运营助手' | '运力与货源';
export type SkillVisibility = '全部企业' | '指定企业';
export type ToolKind = 'mcp' | 'code';
export interface EnterpriseOption { id: string; name: string; }
export interface ManagedSkill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  content: string;
  fileName: string;
  enabled: boolean;
  enterpriseIds: string[];
  privateToolIds: string[];
  visibility: SkillVisibility;
  updatedAt: string;
  updatedBy: string;
}
export interface AgentCallableSkill extends Omit<ManagedSkill, 'category'> {
  category: SkillCategory | '数据员工';
  source?: 'data-employee' | 'common';
  sourceConfig?: { loginUrl: string; loginType: string; version: string };
}
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
}
interface ToolBase {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}
export interface CodeTool extends ToolBase {
  kind: 'code';
  runtime: 'Python 3' | 'Node.js';
  entrypoint: string;
  inputs: ToolParameter[];
  outputs: ToolParameter[];
}
export interface McpTool extends ToolBase {
  kind: 'mcp';
  transport: 'Streamable HTTP' | 'SSE' | 'stdio';
  endpoint: string;
  version: string;
  provider: string;
  auth: '无需认证' | 'Bearer Token' | 'OAuth 2.0' | '自定义请求头';
  timeout: number;
  args: string[];
  bearerTokenEnvVar: string;
  headers: McpKeyValue[];
  envHeaders: McpKeyValue[];
  envVars: McpKeyValue[];
  discovery: 'demo' | 'pending';
  methods: { name: string; description: string }[];
}
export type ManagedTool = DeepReadonly<CodeTool | McpTool>;

const privateToolSeeds: Record<string, string[]> = {
  'route-risk-expert': ['vehicle-mcp', 'risk-evaluate'],
  'gps-trace-expert': ['vehicle-mcp', 'trace-verify'],
  'parking-event-expert': ['vehicle-mcp', 'parking-classify'],
  'delivery-sla-expert': ['vehicle-mcp', 'eta-predict'],
  'logistics-route-planning': ['vehicle-mcp', 'route-plan'],
  'vehicle-location-query': ['vehicle-mcp'],
  'vehicle-trace-query': ['vehicle-mcp'],
  'waybill-data-completion': ['waybill-complete'],
  'waybill-data-correction': ['waybill-validate'],
  'operations-logistics-sheet': ['spreadsheet-export'],
  'operations-sms-notification': ['notification-mcp'],
  'operations-logistics-weather': ['weather-mcp'],
  'operations-license-recognition': ['license-recognize'],
  'operations-wecom-suite': ['collaboration-mcp'],
  'operations-feishu-suite': ['collaboration-mcp'],
  'operations-dingtalk-suite': ['collaboration-mcp'],
  'capacity-find-carrier': ['capacity-mcp'],
  'capacity-quote-query': ['capacity-mcp'],
  'capacity-cargo-search': ['capacity-mcp'],
  'capacity-private-fleet': ['capacity-mcp'],
};

export const enterpriseOptions: EnterpriseOption[] = [
  { id: 'ent-jinyu', name: '金隅水泥' },
  { id: 'ent-tsingtao', name: '青岛啤酒' },
  { id: 'ent-jinmailang', name: '今麦郎' },
  { id: 'ent-anjie', name: '安捷物流' },
  { id: 'ent-zhilian', name: '智链顺达' },
  { id: 'ent-east', name: '华东物流事业部' },
  { id: 'ent-southwest', name: '西南供应链中心' },
  { id: 'ent-demo', name: '演示企业' },
];

const skillSeed: Array<{
  category: SkillCategory;
  enterpriseIds?: string[];
  id: string;
  name: string;
  visibility?: SkillVisibility;
}> = [
  { id: 'route-risk-expert', name: '在途风险专家', category: '在途专家' },
  { id: 'gps-trace-expert', name: '轨迹真实性专家', category: '在途专家' },
  { id: 'parking-event-expert', name: '异常停车专家', category: '在途专家' },
  { id: 'delivery-sla-expert', name: '到货时效专家', category: '在途专家' },
  { id: 'logistics-route-planning', name: '物流路线规划', category: '在途专家' },
  { id: 'vehicle-location-query', name: '车辆定位查询', category: '在途专家' },
  { id: 'vehicle-trace-query', name: '轨迹查询', category: '在途专家' },
  { id: 'waybill-data-completion', name: '运单补充', category: '在途专家' },
  { id: 'waybill-data-correction', name: '运单纠错', category: '在途专家' },
  { id: 'operations-logistics-sheet', name: '物流表格', category: '运营助手' },
  { id: 'operations-sms-notification', name: '短信通知', category: '运营助手' },
  { id: 'operations-logistics-weather', name: '物流天气', category: '运营助手' },
  { id: 'operations-license-recognition', name: '证照识别', category: '运营助手' },
  { id: 'operations-wecom-suite', name: '企业微信套件', category: '运营助手' },
  { id: 'operations-feishu-suite', name: '飞书套件', category: '运营助手' },
  { id: 'operations-dingtalk-suite', name: '钉钉套件', category: '运营助手' },
  { id: 'capacity-find-carrier', name: '找运力', category: '运力与货源' },
  { id: 'capacity-quote-query', name: '报价查询', category: '运力与货源' },
  { id: 'capacity-cargo-search', name: '搜索货源', category: '运力与货源' },
  { id: 'capacity-private-fleet', name: '私有运力池', category: '运力与货源', visibility: '指定企业', enterpriseIds: ['ent-anjie', 'ent-east'] },
];

const skillDescriptions: Record<string, string> = {
  'route-risk-expert': '结合线路、时效和历史履约表现，识别高优先级在途风险。',
  'gps-trace-expert': '分析轨迹断点、速度跳变和定位漂移，辅助判断GPS造假风险。',
  'parking-event-expert': '识别服务区、物流园、中转仓等停靠点，区分合理休息和高风险长停。',
  'delivery-sla-expert': '评估预计到达时间、晚点风险和卸货超时，输出时效处置建议。',
  'logistics-route-planning': '结合起讫地、车型、限行和实时路况规划运输路线，输出里程、时效与备选方案。',
  'vehicle-location-query': '查询车辆最新位置、定位时间、速度和方向，为运单补充实时车辆位置信息。',
  'vehicle-trace-query': '查询车辆历史行驶轨迹、停靠点和里程，辅助核验线路、在途状态与异常事件。',
  'waybill-data-completion': '识别运单缺失字段，补充车辆、司机、线路和运输节点等信息，提升运单数据完整性。',
  'waybill-data-correction': '校验运单字段与业务规则，发现并修正地址、时间、车辆和状态等异常数据。',
  'operations-logistics-sheet': '自动生成和维护运输台账、异常清单与对账表，支持运营助手处理和结果沉淀。',
  'operations-sms-notification': '遇到在途异常可以短信通知货主、司机、物流负责人等。',
  'operations-logistics-weather': '结合线路和车辆实时位置获取沿途天气预警，辅助提前安排绕行、时效与安全处置。',
  'operations-license-recognition': '识别驾驶证、行驶证、运输证及回单等资料，自动提取字段并校验证照有效性。',
  'operations-wecom-suite': '连接企业微信，将在途风险、协同待办和处置结果同步到群聊、消息与工作台。',
  'operations-feishu-suite': '连接飞书，将运单异常、协同任务和处置进展同步到消息、群组与多维表格。',
  'operations-dingtalk-suite': '连接钉钉，将在途预警、审批待办和运营结果推送到群聊与工作通知。',
  'capacity-find-carrier': '将货源信息发布至运力生态，供司机或承运方接单。',
  'capacity-quote-query': '查询司机或承运方的抢单及报价信息。',
  'capacity-cargo-search': '搜索平台已发布的货源信息。',
  'capacity-private-fleet': '管理企业自有及长期合作的司机、车辆和承运商资源，支持定向询价与派单。',
};

function createSkills(): ManagedSkill[] {
  return skillSeed.map((skill, index) => ({
    ...skill,
    content: `# ${skill.name}\n\n## 适用范围\n${skill.category}\n\n## 执行指引\n根据用户任务识别所需数据和业务约束，调用 ${skill.name} 完成处理，并返回结构化结果与必要的执行说明。`,
    description: skillDescriptions[skill.id] ?? '',
    enabled: index !== 18,
    enterpriseIds: skill.enterpriseIds ?? [],
    fileName: `${skill.id}.skill.md`,
    privateToolIds: [...(privateToolSeeds[skill.id] ?? [])],
    updatedAt: index < 9 ? '2026-07-25 11:20' : '2026-07-23 09:15',
    updatedBy: index % 3 === 0 ? '王运营' : index % 3 === 1 ? '李产品' : '系统管理员',
    visibility: skill.visibility ?? '全部企业',
  }));
}

const updatedAt = '2026-09-08 10:00';
function createMcpTools(): McpTool[] {
  const mcp = (id: string, name: string, description: string, methods: McpTool['methods']): McpTool => ({
    id, name, description, methods, kind: 'mcp', updatedAt,
    transport: 'Streamable HTTP', endpoint: `https://${id}.example.com/mcp`,
    version: '1.0.0', provider: '大卡物流平台', auth: 'Bearer Token', timeout: 30,
    args: [], bearerTokenEnvVar: 'MCP_BEARER_TOKEN', headers: [], envHeaders: [], envVars: [], discovery: 'demo',
  });
  return [
    mcp('vehicle-mcp', '车辆与轨迹服务', '提供车辆最新定位、历史轨迹、停靠事件与线路查询能力。', [
      { name: 'get_vehicle_location', description: '查询车辆位置、速度、航向和定位时间。' },
      { name: 'get_vehicle_trace', description: '按时间范围查询车辆轨迹点和停靠事件。' },
      { name: 'get_route_conditions', description: '查询线路路况、限行与沿途事件。' },
    ]),
    mcp('weather-mcp', '物流天气服务', '查询城市与运输线路的天气预报和气象预警。', [
      { name: 'get_weather', description: '查询指定地区天气预报。' },
      { name: 'get_route_alerts', description: '获取运输线路沿途气象预警。' },
    ]),
    mcp('notification-mcp', '消息通知服务', '为异常处置提供短信与邮件通知能力。', [
      { name: 'send_sms', description: '按通知模板生成短信发送任务。' },
      { name: 'send_email', description: '生成邮件通知任务与发送回执。' },
    ]),
    mcp('collaboration-mcp', '企业协作服务', '连接企业微信、飞书与钉钉，管理协同消息和任务。', [
      { name: 'send_work_message', description: '向指定协作平台提交工作通知。' },
      { name: 'create_work_task', description: '创建协作任务并返回任务编号。' },
    ]),
    mcp('capacity-mcp', '运力与货源服务', '查询运力、货源、报价与企业私有运力池。', [
      { name: 'publish_cargo', description: '发布货源信息供承运方接单。' },
      { name: 'query_quotes', description: '查询承运方报价与抢单记录。' },
      { name: 'search_cargo', description: '检索已发布货源。' },
      { name: 'query_private_fleet', description: '查询当前企业自有及合作运力。' },
    ]),

  ];
}

export const useAgentOpsStore = defineStore('agentOps', () => {
  const skills = ref(createSkills());
  const dataEmployeeSkills = ref(createDataEmployeeSkills());
  // Data acquisition definitions have one source, shared by both configuration views.
  const agentCallableSkills = computed<AgentCallableSkill[]>(() => [
    ...skills.value.map((skill) => ({ ...skill, source: 'common' as const })),
    ...dataEmployeeSkills.value.map((skill) => ({
      id: skill.id, name: skill.name, category: '数据员工' as const, source: 'data-employee' as const,
      description: skill.description, content: skill.skillContent, fileName: skill.skillFileName,
      enabled: true, privateToolIds: [], visibility: skill.visibility, enterpriseIds: skill.enterpriseIds,
      updatedAt: skill.skillUpdated, updatedBy: '数据员工配置',
      sourceConfig: { loginUrl: skill.loginUrl, loginType: skill.loginType, version: skill.skillVersion },
    })),
  ]);
  const codeTools = ref(parseCodeToolRegistry(codeRegistry));
  const mcpServices = ref(createMcpTools());
  const tools = readonly(computed<ManagedTool[]>(() => [...mcpServices.value, ...codeTools.value]));
  const agents = ref<ManagedAgent[]>(parseAgentRegistry(agentRegistry));
  const configuredAgentIds = ref<string[]>([]);
  const agentReports = ref<Record<string, AgentConflictReport>>({});
  const agentSync = ref({ busy: false, lastSyncedAt: '', error: '', summary: '' });
  const codeToolSync = ref({ busy: false, lastSyncedAt: '', error: '', summary: '' });

  async function syncAgents(loader: () => Promise<unknown> = loadAgentRegistry) {
    if (agentSync.value.busy) return;
    agentSync.value.busy = true;
    agentSync.value.error = '';
    try {
      const incoming = parseAgentRegistry(await loader());
      const current = new Map(agents.value.map((agent) => [agent.id, agent]));
      const next = incoming.map((definition) => {
        const configured = current.get(definition.id);
        if (configured && configuredAgentIds.value.includes(definition.id)) return { ...configured, role: definition.role };
        return { ...definition, skillIds: definition.role === 'data-employee' ? dataEmployeeSkills.value.map((skill) => skill.id) : definition.skillIds };
      });
      const added = incoming.filter((agent) => !current.has(agent.id)).length;
      const removed = agents.value.filter((agent) => !incoming.some((item) => item.id === agent.id)).length;
      agents.value = next;
      configuredAgentIds.value = configuredAgentIds.value.filter((id) => incoming.some((agent) => agent.id === id));
      Object.keys(agentReports.value).filter((id) => !incoming.some((agent) => agent.id === id)).forEach((id) => delete agentReports.value[id]);
      agentSync.value.lastSyncedAt = new Date().toLocaleString('zh-CN', { hour12: false });
      agentSync.value.summary = `已读取 ${incoming.length} 个 Agent，新增 ${added} 个、移除 ${removed} 个；已保存的配置保留。`;
      return incoming.length;
    } catch (error) {
      agentSync.value.error = error instanceof Error ? error.message : '同步失败，请重试。';
      throw error;
    } finally { agentSync.value.busy = false; }
  }
  async function syncCodeTools(loader: () => Promise<unknown> = loadCodeToolRegistry) {
    if (codeToolSync.value.busy) return;
    codeToolSync.value.busy = true;
    codeToolSync.value.error = '';
    try {
      const incoming = parseCodeToolRegistry(await loader());
      if (incoming.some((tool) => mcpServices.value.some((mcp) => mcp.id === tool.id))) throw new Error('工具标识与 MCP 服务冲突，本次同步未应用。');
      const added = incoming.filter((tool) => !codeTools.value.some((item) => item.id === tool.id)).length;
      const removed = codeTools.value.filter((tool) => !incoming.some((item) => item.id === tool.id)).length;
      codeTools.value = incoming;
      codeToolSync.value.lastSyncedAt = new Date().toLocaleString('zh-CN', { hour12: false });
      codeToolSync.value.summary = `已读取 ${incoming.length} 个代码工具，新增 ${added} 个、移除 ${removed} 个。加载配置保留${removed ? '；失效引用可在 Agent 冲突检测中查看' : ''}。`;
      return incoming.length;
    } catch (error) {
      codeToolSync.value.error = error instanceof Error ? error.message : '同步失败，请重试。';
      throw error;
    } finally { codeToolSync.value.busy = false; }
  }

  function saveMcp(config: McpConfig, id?: string) {
    const value = normalizeMcpConfig(config);
    const current = mcpServices.value.find((tool) => tool.id === id);
    if (id && !current) throw new Error('MCP 服务不存在，代码工具不能在页面中编辑。');
    if (current && current.transport !== value.transport) throw new Error('编辑时不能切换连接类型，请删除后重新添加。');
    if (mcpServices.value.some((tool) => tool.id !== id && tool.name === value.name)) throw new Error('MCP 名称已存在，请使用其他名称。');
    const connection = (tool: McpConfig) => JSON.stringify([tool.transport, tool.endpoint, tool.args, tool.bearerTokenEnvVar, tool.headers, tool.envHeaders, tool.envVars]);
    const connectionChanged = !current || connection(current) !== connection(value);
    const record: McpTool = {
      ...value, id: current?.id ?? `mcp-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`, kind: 'mcp',
      provider: current?.provider ?? '运营配置', version: connectionChanged ? '' : current.version,
      auth: value.bearerTokenEnvVar ? 'Bearer Token' : value.headers.length || value.envHeaders.length ? '自定义请求头' : '无需认证',
      methods: connectionChanged ? [] : current.methods, discovery: connectionChanged ? 'pending' : current.discovery,
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    };
    const index = mcpServices.value.findIndex((tool) => tool.id === record.id);
    if (index < 0) mcpServices.value.unshift(record);
    else mcpServices.value[index] = record;
    return record;
  }
  function mcpUsage(id: string) {
    return { skills: skillsForTool(id), agents: agentsForTool(id) };
  }
  function deleteMcp(id: string) {
    if (!mcpServices.value.some((tool) => tool.id === id)) throw new Error('MCP 服务不存在，代码工具不能在页面中删除。');
    mcpServices.value = mcpServices.value.filter((tool) => tool.id !== id);
    skills.value.forEach((skill) => { skill.privateToolIds = skill.privateToolIds.filter((toolId) => toolId !== id); });
    agents.value.forEach((agent) => {
      if (agent.toolIds.includes(id)) {
        agent.toolIds = agent.toolIds.filter((toolId) => toolId !== id);
        configuredAgentIds.value = [...new Set([...configuredAgentIds.value, agent.id])];
      }
    });
  }

  function availableSkillsForAgent(agentId?: string) {
    const agent = agents.value.find((item) => item.id === agentId);
    return agentCallableSkills.value.filter((skill) => agent?.role === 'data-employee' ? skill.source === 'data-employee' : skill.source === 'common');
  }
  function saveDataEmployeeSkill(skill: DataEmployeeSkill) {
    const index = dataEmployeeSkills.value.findIndex((item) => item.id === skill.id);
    const record = { ...skill, enterpriseIds: [...skill.enterpriseIds] };
    if (index >= 0) dataEmployeeSkills.value[index] = record;
    else {
      dataEmployeeSkills.value.unshift(record);
      agents.value.filter((agent) => agent.role === 'data-employee').forEach((agent) => {
        agent.skillIds = [...new Set([...agent.skillIds, record.id])];
      });
    }
  }

  function saveAgent(config: AgentConfig, agentId: string) {
    if (!agentId || !agents.value.some((agent) => agent.id === agentId)) throw new Error('Agent 只能编辑，请先同步工程中已注册的 Agent。');
    const name = config.name.trim();
    if (!name || !config.systemPrompt.trim()) throw new Error('请填写 Agent 名称和 System Prompt。');
    if (name.length > 60) throw new Error('Agent 名称不能超过 60 个字符。');
    if (agents.value.some((agent) => agent.id !== agentId && agent.name === name)) throw new Error('Agent 名称已存在，请使用其他名称。');
    const record: ManagedAgent = {
      id: agentId,
      role: agents.value.find((agent) => agent.id === agentId)?.role ?? 'custom',
      name, systemPrompt: config.systemPrompt.trim(),
      skillIds: [...new Set(config.skillIds)], toolIds: [...new Set(config.toolIds)],
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }), updatedBy: '当前运营用户',
    };
    const index = agents.value.findIndex((agent) => agent.id === record.id);
    agents.value[index] = record;
    configuredAgentIds.value = [...new Set([...configuredAgentIds.value, agentId])];
    return record;
  }
  function detectAgentConflicts(id: string) {
    const agent = agents.value.find((item) => item.id === id);
    if (!agent) throw new Error('Agent 已不存在。');
    const report = analyzeAgentConflicts(agent, { skills: agentCallableSkills.value, tools: tools.value });
    agentReports.value[id] = report;
    return report;
  }

  function skillsForTool(toolId: string) {
    return skills.value.filter((skill) => skill.privateToolIds.includes(toolId));
  }
  function agentsForTool(toolId: string) {
    return agents.value.filter((agent) => agent.toolIds.includes(toolId));
  }
  function getToolLoading(toolId: string) {
    const direct = agentsForTool(toolId).length > 0;
    const privateLoading = skillsForTool(toolId).length > 0;
    return { direct, private: privateLoading, unloaded: !direct && !privateLoading };
  }
  return { skills, dataEmployeeSkills, agentCallableSkills, availableSkillsForAgent, saveDataEmployeeSkill, tools, agents, agentReports, saveAgent, detectAgentConflicts, skillsForTool, agentsForTool, getToolLoading, agentSync, codeToolSync, syncAgents, syncCodeTools, saveMcp, deleteMcp, mcpUsage };
});
