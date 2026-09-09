import { defineStore } from 'pinia';
import { readonly, ref } from 'vue';
import type { DeepReadonly } from 'vue';

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
  auth: '无需认证' | 'Bearer Token' | 'OAuth 2.0';
  timeout: number;
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

const parameter = (name: string, type: ToolParameter['type'], description: string, required = true): ToolParameter => ({ name, type, description, required });
const updatedAt = '2026-09-08 10:00';
function createTools(): ManagedTool[] {
  const mcp = (id: string, name: string, description: string, methods: McpTool['methods']): McpTool => ({
    id, name, description, methods, kind: 'mcp', updatedAt,
    transport: 'Streamable HTTP', endpoint: `https://${id}.example.com/mcp`,
    version: '1.0.0', provider: '大卡物流平台', auth: 'Bearer Token', timeout: 30,
  });
  const code = (id: string, name: string, description: string, inputs: ToolParameter[], outputs: ToolParameter[]): CodeTool => ({
    id, name, description, inputs, outputs, kind: 'code', updatedAt,
    runtime: 'Python 3', entrypoint: `tools/${id.replace(/-/g, '_')}.py:run`,
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
    code('datetime-format', '时间标准化', '将业务时间转换为统一格式，并处理时区。', [
      parameter('value', 'string', '待转换的时间文本。'), parameter('timezone', 'string', '时区；默认 Asia/Shanghai。', false),
    ], [parameter('formatted', 'string', '标准化的 ISO 8601 时间。'), parameter('timestamp', 'number', 'Unix 时间戳，单位秒。')]),
    code('risk-evaluate', '在途风险评估', '结合运单、实时定位和历史履约信息，输出风险等级与处置建议。', [
      parameter('waybill', 'object', '运单编号、线路、计划到达时间及承运商。'), parameter('events', 'array', '定位、停车与线路风险事件。'),
    ], [parameter('risk_level', 'string', '风险等级：高、中、低。'), parameter('evidence', 'array', '风险证据明细。'), parameter('suggestions', 'array', '建议处置动作。')]),
    code('trace-verify', '轨迹真实性核验', '核验轨迹断点、速度跳变与定位漂移。', [
      parameter('vehicle_plate', 'string', '查询车辆的车牌号。'), parameter('points', 'array', '含经纬度和时间的轨迹点。'),
    ], [parameter('valid', 'boolean', '轨迹是否通过核验。'), parameter('anomalies', 'array', '异常点、原因及发生时间。')]),
    code('parking-classify', '停车事件分类', '结合停靠位置、时长与运单节点，识别合理停车和高风险长停。', [
      parameter('stops', 'array', '停靠点、开始时间和停车时长。'), parameter('waybill', 'object', '装卸货位置与计划运输节点。'),
    ], [parameter('reasonable_stops', 'array', '合理停车记录及依据。'), parameter('risky_stops', 'array', '高风险停车记录及建议。')]),
    code('eta-predict', '到达时间预测', '根据剩余里程、路况与实时速度计算预计到达时间。', [
      parameter('remaining_km', 'number', '剩余运输里程，单位公里。'), parameter('speed_kmh', 'number', '有效平均速度，单位公里/小时。'), parameter('plan_arrival', 'string', '计划到达时间。'),
    ], [parameter('estimated_arrival', 'string', '预计到达时间。'), parameter('delay_minutes', 'number', '预计晚点分钟数，未晚点时为 0。')]),
    code('route-plan', '运输路线规划', '按装卸货地与车辆约束生成可行运输路线。', [
      parameter('origin', 'object', '起点地址及经纬度。'), parameter('destination', 'object', '终点地址及经纬度。'), parameter('vehicle', 'object', '车辆类型、载重和限高。'),
    ], [parameter('routes', 'array', '推荐和备选路线，含里程、时效与通行约束。')]),
    code('waybill-complete', '运单字段补充', '根据已知运单信息补充缺失字段，保留字段来源。', [parameter('waybill', 'object', '待补充的运单。'), parameter('context', 'object', '授权的车辆、司机和线路资料。')], [parameter('waybill', 'object', '补充后的运单。'), parameter('sources', 'array', '补充字段及数据来源。')]),
    code('waybill-validate', '运单规则校验', '检查运单地址、车辆、时间和状态的一致性，返回字段纠错建议。', [parameter('waybill', 'object', '待校验的运单。')], [parameter('valid', 'boolean', '是否通过校验。'), parameter('corrections', 'array', '问题字段、原值和建议修正值。')]),
    code('spreadsheet-export', '运营表格生成', '将结构化业务数据生成台账、异常清单或对账表。', [parameter('rows', 'array', '逐行数据。'), parameter('columns', 'array', '列名、字段键与格式。'), parameter('filename', 'string', '输出文件名称。')], [parameter('file_url', 'string', '生成文件的下载地址。'), parameter('row_count', 'number', '导出的数据行数。')]),
    code('license-recognize', '证照字段识别', '识别驾驶证、行驶证和运输证中的关键字段。', [parameter('file_url', 'string', '已授权访问的证照文件地址。'), parameter('document_type', 'string', '证照类型。')], [parameter('fields', 'object', '识别出的证照字段。'), parameter('expires_at', 'string', '证照有效期。'), parameter('needs_review', 'boolean', '是否需要人工复核。')]),
  ];
}

export const useAgentOpsStore = defineStore('agentOps', () => {
  const skills = ref(createSkills());
  // Engineering-owned definitions are read-only; loading preferences are separate.
  const tools = readonly(ref(createTools()));
  const globalToolIds = ref<string[]>([]);

  function skillsForTool(toolId: string) {
    return skills.value.filter((skill) => skill.privateToolIds.includes(toolId));
  }
  function getToolLoading(toolId: string) {
    const global = globalToolIds.value.includes(toolId);
    const privateLoading = skillsForTool(toolId).length > 0;
    return { global, private: privateLoading, mixed: global && privateLoading, unloaded: !global && !privateLoading };
  }
  function setToolGlobalLoading(toolId: string, enabled: boolean) {
    if (!tools.value.some((tool) => tool.id === toolId)) return;
    globalToolIds.value = enabled
      ? [...new Set([...globalToolIds.value, toolId])]
      : globalToolIds.value.filter((id) => id !== toolId);
  }
  return { skills, tools, globalToolIds, skillsForTool, getToolLoading, setToolGlobalLoading };
});
