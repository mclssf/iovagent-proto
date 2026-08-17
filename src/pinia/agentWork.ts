import type {
  AgentConversation,
  AgentResultFile,
  AgentWorkspaceMode,
  ChatMessage,
  DownloadTask,
  Order,
  PageId,
  Project,
  TimelineEvent,
  TmsSyncCustomer,
} from '@/views/AgentWork/interface';

import { ElMessage } from 'element-plus';
import { defineStore } from 'pinia';

import { extractMcpPrompt, runMcpPrompt } from '@/views/AgentWork/mcpClient';
import { createTransportDemo, createTransportDemoPageUrl, saveTransportDemo } from '@/views/transportDemo';
import { getRiskOrders, summarizeOrders } from '@/views/AgentWork/utils';

const defaultOrdersDateRange = {
  start: '2026-05-09',
  end: '2026-05-16',
};

function getOrderStartDate(order: Order) {
  return order.startTime.slice(0, 10);
}

const projectsSeed: Project[] = [
  {
    id: 'P001',
    name: '华东干线在途监控',
    status: '已连接',
    sync: '2分钟前',
    total: 128,
    risk: 17,
    tmsUrl: 'https://tms.huadong.example.com',
    tmsUser: 'alfred',
    keyword: '华东干线',
    statusFilter: '在途',
    skillIds: ['jinyu-cement-tms', 'route-risk-expert', 'gps-trace-expert', 'parking-event-expert'],
  },
  {
    id: 'P002',
    name: '冷链城配项目',
    status: '授权失效',
    sync: '昨天 23:10',
    total: 64,
    risk: 9,
    tmsUrl: 'https://tms.coldchain.example.com',
    tmsUser: 'cold_ops',
    keyword: '冷链',
    statusFilter: '全部',
    skillIds: ['spreadsheet-waybill', 'route-risk-expert', 'parking-event-expert', 'delivery-sla-expert'],
  },
  {
    id: 'P003',
    name: '西南工厂发运项目',
    status: '已连接',
    sync: '同步中',
    total: 83,
    risk: 6,
    tmsUrl: 'https://tms.southwest.example.com',
    tmsUser: 'sw_factory',
    keyword: '西南工厂',
    statusFilter: '装货中',
    skillIds: ['zhilian-shunda-tms', 'route-risk-expert', 'gps-trace-expert'],
  },
  {
    id: 'P004',
    name: '华北啤酒城配协同',
    status: '已连接',
    sync: '5分钟前',
    total: 96,
    risk: 8,
    tmsUrl: 'https://tms.beer-north.example.com',
    tmsUser: 'beer_dispatch',
    keyword: '华北城配',
    statusFilter: '在途',
    skillIds: ['qingdao-beer-tms', 'route-risk-expert', 'delivery-sla-expert'],
  },
  {
    id: 'P005',
    name: '今麦郎干线履约',
    status: '已连接',
    sync: '12分钟前',
    total: 142,
    risk: 13,
    tmsUrl: 'https://tms.jinmailang.example.com',
    tmsUser: 'linehaul_ops',
    keyword: '今麦郎',
    statusFilter: '全部',
    skillIds: ['jinmailang-logistics', 'route-risk-expert', 'gps-trace-expert', 'delivery-sla-expert'],
  },
  {
    id: 'P006',
    name: '水泥区域配送项目',
    status: '授权失效',
    sync: '昨天 18:40',
    total: 71,
    risk: 5,
    tmsUrl: 'https://tms.cement-region.example.com',
    tmsUser: 'cement_ops',
    keyword: '水泥配送',
    statusFilter: '装货中',
    skillIds: ['jinyu-cement-tms', 'parking-event-expert', 'delivery-sla-expert'],
  },
  {
    id: 'P007',
    name: '电商大件履约监控',
    status: '已连接',
    sync: '刚刚',
    total: 58,
    risk: 4,
    tmsUrl: 'https://tms.bulky.example.com',
    tmsUser: 'bulky_service',
    keyword: '大件履约',
    statusFilter: '在途',
    skillIds: ['spreadsheet-waybill', 'route-risk-expert', 'delivery-sla-expert'],
  },
];

const projectWelcomeMessages: ChatMessage[] = [
  { role: 'agent', text: '今日已同步 128 单，已加入在途监控 128 单。当前高风险 6 单、低风险 11 单。' },
  { role: 'agent', text: '发现 2 单非目的地物流园长停、1 单 GPS 轨迹疑似造假，建议优先复核。' },
];

const conversationSeeds: AgentConversation[] = [
  ['C001', '今日在途异常处理建议', '今天有哪些真正需要优先处理的在途异常？', '已汇总高风险运单，并按影响程度给出处理顺序。', '10分钟前'],
  ['C002', '沪A12345当前位置查询', '查询沪A12345现在的位置。', '车辆最新定位在 G60 沪昆高速嘉兴服务区东侧，定位状态正常。', '26分钟前'],
  ['C003', '华东线路高风险运单复核', '复核华东线路今天的高风险运单。', '已完成复核，建议优先人工核验 3 单。', '今天 09:42'],
  ['C004', '8月16日在途日报', '生成昨天的在途运输日报。', '日报已生成，包含运单规模、异常分布和处理建议。', '昨天'],
  ['C005', '承运商异常集中度分析', '分析近期异常是否集中在特定承运商。', '异常主要集中在安捷物流与远恒运输，已整理对应线路。', '昨天'],
  ['C006', '皖K55821停车事件复盘', '复盘皖K55821的异常停车。', '该车存在一次合理休息和一次高风险非合同经停。', '8月15日'],
  ['C007', '冷链到货时效预测', '预测冷链项目今晚的到货情况。', '预计 61 单按时到达，3 单存在延误风险。', '8月14日'],
].map(([id, title, userText, agentText, updatedAt]) => ({
  id,
  title,
  updatedAt,
  messages: [
    { role: 'user', text: userText },
    { role: 'agent', text: agentText },
  ],
}));

function cloneChatMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    ...message,
    file: message.file ? { ...message.file } : undefined,
    link: message.link ? { ...message.link } : undefined,
    steps: message.steps?.map((step) => ({ ...step })),
  }));
}

const tmsSyncCustomerStorageKey = 'iovagent_tms_sync_customers';
const tmsSyncCustomersSeed: TmsSyncCustomer[] = [
  {
    id: 'TMSC20260812001',
    enterpriseCid: 'CID00000186',
    userPhone: '13800138000',
    systemUrl: 'https://tms.huadong.example.com/login',
    account: 'huadong_ops',
    password: 'Hdtms@2026',
    status: '未处理',
    submittedAt: '2026-08-12 10:24',
  },
  {
    id: 'TMSC20260811002',
    enterpriseCid: 'CID00000193',
    userPhone: '13900139000',
    systemUrl: 'https://tms.coldchain.example.com/login',
    account: 'cold_ops',
    password: 'Cold@2026',
    status: '已处理',
    submittedAt: '2026-08-11 16:42',
    processedBy: '王运营',
    processedAt: '2026-08-11 17:05',
  },
];

function loadTmsSyncCustomers() {
  if (typeof window === 'undefined') return [...tmsSyncCustomersSeed];
  try {
    const saved = window.localStorage.getItem(tmsSyncCustomerStorageKey);
    if (!saved) return [...tmsSyncCustomersSeed];
    const parsed = JSON.parse(saved) as TmsSyncCustomer[];
    return Array.isArray(parsed) ? parsed : [...tmsSyncCustomersSeed];
  } catch {
    return [...tmsSyncCustomersSeed];
  }
}

function persistTmsSyncCustomers(customers: TmsSyncCustomer[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(tmsSyncCustomerStorageKey, JSON.stringify(customers));
}

function formatTmsSyncCustomerTime(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

const ordersSeedData: Order[] = [
  {
    id: 'WB20260509001',
    plate: '沪A12345',
    driver: '张师傅',
    carrier: '安捷物流',
    route: '上海工厂 → 广州仓',
    factory: '上海一厂',
    status: '在途',
    risk: '高风险',
    issue: '异常停车 / GPS疑似造假',
    source: '规则预警 + GPS分析',
    startTime: '2026-05-15 08:05',
    updated: '5分钟前',
    eta: '明日 02:30',
  },
  {
    id: 'WB20260509002',
    plate: '苏B88231',
    driver: '李师傅',
    carrier: '远恒运输',
    route: '苏州仓 → 杭州仓',
    factory: '苏州仓',
    status: '已到货',
    risk: '低风险',
    issue: '卸车超时',
    source: '规则预警',
    startTime: '2026-05-14 09:20',
    updated: '13分钟前',
    eta: '已到达',
  },
  {
    id: 'WB20260509003',
    plate: '粤B90877',
    driver: '王师傅',
    carrier: '安捷物流',
    route: '深圳仓 → 厦门仓',
    factory: '深圳仓',
    status: '在途',
    risk: '无风险',
    issue: '暂无',
    source: '无',
    startTime: '2026-05-13 10:15',
    updated: '18分钟前',
    eta: '今日 21:40',
  },
  {
    id: 'WB20260509004',
    plate: '川A66520',
    driver: '赵师傅',
    carrier: '顺达货运',
    route: '成都工厂 → 重庆仓',
    factory: '成都工厂',
    status: '装货中',
    risk: '高风险',
    issue: '装车超时',
    source: '规则预警',
    startTime: '2026-05-12 11:30',
    updated: '21分钟前',
    eta: '待发车',
  },
  {
    id: 'WB20260509005',
    plate: '浙C77812',
    driver: '陈师傅',
    carrier: '中联物流',
    route: '宁波港 → 合肥仓',
    factory: '宁波港',
    status: '在途',
    risk: '低风险',
    issue: '服务区长停',
    source: '智能轨迹分析',
    startTime: '2026-05-10 07:45',
    updated: '34分钟前',
    eta: '今日 23:20',
  },
  {
    id: 'WB20260509006',
    plate: '鲁D43190',
    driver: '刘师傅',
    carrier: '远恒运输',
    route: '青岛仓 → 济南仓',
    factory: '青岛仓',
    status: '已完成',
    risk: '无风险',
    issue: '暂无',
    source: '无',
    startTime: '2026-05-09 14:10',
    updated: '46分钟前',
    eta: '已完成',
  },
];

const timelineSeed: TimelineEvent[] = [
  { id: 1, type: 'normal', title: '运单开始-车辆进入装货地', time: '09:10', place: '上海一厂', desc: '车辆进入装货地围栏，开始执行运输任务。' },
  { id: 2, type: 'normal', title: '发车离场', time: '10:28', place: '上海一厂', desc: '车辆离开装货地围栏，进入在途阶段。' },
  {
    id: 3,
    type: 'stop',
    title: '异常停车事件',
    time: '13:42 - 15:21',
    place: 'G60 高速服务区附近',
    desc: '停车 99 分钟。',
    rule: '停车时长 99 分钟 > 阈值 60 分钟，命中停车异常。',
    agent: '停车点接近服务区，结合长途线路和同线路历史停车习惯，判定为低风险合理休息。',
    stopPlace: '服务区',
    agentVerdict: '合理',
    agentTone: 'green',
  },
  {
    id: 4,
    type: 'stop',
    title: '异常停车事件',
    time: '17:06 - 18:40',
    place: '非目的地物流园',
    desc: '停车 94 分钟，非计划停靠点。',
    rule: '停车时长 94 分钟 > 阈值 60 分钟，命中停车异常。',
    agent: '停车点为非目的地物流园，距离卸货地 184km，存在疑似非目的地卸货风险。',
    stopPlace: '物流园',
    agentVerdict: '高风险',
    agentTone: 'red',
  },
  { id: 5, type: 'risk', title: '轨迹造假高风险事件', time: '19:12', place: '沪昆高速附近', desc: '轨迹出现断点和速度异常，外部算法输出高风险。' },
  { id: 6, type: 'normal', title: '到达卸货地', time: '次日 01:52', place: '广州仓', desc: '车辆进入卸货地围栏，等待卸货确认。' },
];

export const quickPrompts = ['帮我处理一下今天的在途预警 挑出真有风险的运单', '只看皖K55821异常停车事件', '查看所有运单', '下载今天异常运单'];

export const rightPanelTabs: [string, string][] = [
  ['overview', '概览'],
  ['risk', '异常运单'],
];

const processStepInitialDelay = 360;
const processStepInterval = 680;
const spreadsheetProcessStepInterval = 1200;
let agentProcessTimers: ReturnType<typeof setTimeout>[] = [];

const warningProcessSteps = [
  { title: '理解需求', text: '筛出真实高风险，不展示全量预警。' },
  { title: '拆解任务', text: '预警处理、轨迹核验、停车点评估、低风险过滤。' },
  { title: '处理执行预警', text: '核验 17 单，合并规则 / GPS / POI 证据。' },
  { title: '识别轨迹造假', text: '1 单命中断点、速度跳变、点火状态冲突。' },
  { title: '判断风险停车地点', text: '5 单命中物流园 / 中转仓 / 货场长停。' },
  { title: '汇总成表', text: '输出高风险清单、停靠点、判定理由；低风险折叠。' },
];

const orderEventProcessSteps = [
  { title: '理解需求', text: '只查看皖K55821对应运单的异常停车事件。' },
  { title: '展示运单详情', text: '定位运单 WB20260509018，线路为合肥仓 → 南京仓。' },
  { title: '渲染地图轨迹', text: '已加载运输路线、当前位置、装卸货节点和停靠点。' },
  { title: '标注异常事件', text: '已标注高速服务区低风险停车和第三方中转仓高风险停车。' },
];

function createSpreadsheetFillSteps(sourceFileName: string): NonNullable<ChatMessage['steps']> {
  return [
    { title: '解析 Excel', text: `读取“${sourceFileName}”，识别工作表结构、128 行运单和 12 个已有字段。` },
    { title: '识别待填字段', text: '发现“当前车辆位置、在途状态、预计到达时间、在途异常”存在批量空值，需要逐项补充。' },
    { title: '核验运单真实性', text: '比对 TMS 原始运单、车牌、司机和线路关系，确认 126 条有效，标记 2 条待复核记录。' },
    {
      title: '纠正基础数据',
      text: '修正 3 处车牌格式、2 处地址语义和 1 处运单状态冲突。',
      skill: '运单纠错',
    },
    {
      title: '查询车辆位置',
      text: '按车牌批量获取最新定位、定位时间、速度和方向，回填“当前车辆位置”。',
      skill: '车辆定位查询',
    },
    {
      title: '查询行驶轨迹',
      text: '查询近 24 小时轨迹、停靠点和行驶里程，辅助判断车辆实际在途状态。',
      skill: '轨迹查询',
    },
    {
      title: '判断在途风险',
      text: '结合偏航、长停、轨迹断点和非计划经停，回填“在途异常”及风险说明。',
      skill: '在途风险专家',
    },
    {
      title: '计算预计到达',
      text: '根据实时位置、剩余里程、道路拥堵和历史线路时效，回填“预计到达时间”。',
      skill: '到货时效专家',
    },
    {
      title: '补充运单表格',
      text: '将查询与分析结果写入对应行，保持原工作表字段顺序和单元格格式。',
      skill: '运单补充',
    },
    { title: '复检输出结果', text: '复核字段格式、空值、跨字段一致性和异常标记，128 行运单全部检验完成。' },
  ];
}

function extractSpreadsheetRequest(raw: string) {
  const attachmentMarker = '\n附件：';
  const markerIndex = raw.lastIndexOf(attachmentMarker);
  if (markerIndex <= 0) return null;

  const prompt = raw.slice(0, markerIndex).trim();
  const sourceFileName = raw
    .slice(markerIndex + attachmentMarker.length)
    .split('、')
    .map((name) => name.trim())
    .find(Boolean);
  if (!prompt || !sourceFileName) return null;
  return { prompt, sourceFileName };
}

interface VehicleLocationRequest {
  plate: string;
  waybill: string;
}

interface TransportStatusRequest {
  query: string;
}

const transportStatusActions = ['查', '查询', '查找', '查看', '看看', '看下', '看一下', '帮我看', '帮我查', '获取', '了解', '追踪', '跟踪'];
const transportStatusTargets = ['订单', '运单', '货单', '货运单', '托运单', '运输单', '单号', '车牌号', '车牌', '车辆', '货车', '货物', '物流'];
const transportStatusIntents = ['运输位置', '实时位置', '当前位置', '定位', '位置', '运输进度', '当前进度', '进度', '运输情况', '在途情况', '当前情况', '运输状态', '当前状态'];
const transportStatusQuestionPattern = /(?:在哪(?:里|儿)?|到哪(?:里|儿)?了?|走到哪(?:里|儿)?了?|开到哪(?:里|儿)?了?|现在什么情况|目前什么情况)/;

function extractTransportStatusRequest(raw: string): TransportStatusRequest | null {
  const compact = raw.replace(/\s+/g, '');
  const normalized = compact.toUpperCase();
  const hasAction = transportStatusActions.some((term) => compact.includes(term));
  const hasTarget =
    transportStatusTargets.some((term) => compact.includes(term)) ||
    /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/.test(normalized) ||
    /(?:WB|YT|NO)[A-Z0-9-]{5,}/.test(normalized);
  const hasIntent = transportStatusIntents.some((term) => compact.includes(term)) || transportStatusQuestionPattern.test(compact);

  return hasAction && hasTarget && hasIntent ? { query: raw.trim() } : null;
}

function formatTransportDateTime(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createTransportStatusProcessMessage(request: TransportStatusRequest): ChatMessage {
  const demo = createTransportDemo(request.query);
  saveTransportDemo(demo);
  const pageUrl = createTransportDemoPageUrl(demo, request.query);

  return {
    role: 'agent',
    title: '订单运输情况查询',
    status: '已完成',
    text: `正在查询 ${demo.orderNo}（${demo.plate}）的实时运输情况。`,
    progressMode: true,
    steps: [
      { title: '识别查询对象', text: `已关联运单 ${demo.orderNo}、车辆 ${demo.plate} 和当前运输任务。` },
      { title: '查询车辆定位', text: '获取车辆最新经纬度、道路 POI、速度和定位时间。', skill: '车辆定位查询' },
      { title: '计算运输进度', text: `结合计划线路与已行驶里程，计算当前进度和剩余 ${demo.remainingKm} km。`, skill: '轨迹查询' },
      { title: '预测到达时间', text: '结合剩余路程、实时速度和线路时效，计算预计到达时间。', skill: '到货时效专家' },
      { title: '生成运输详情', text: '生成包含真实底图、道路路线与运输节点的外部 H5 页面。' },
    ],
    result: `已查询到 ${demo.orderNo}：车辆 ${demo.plate} 当前位于${demo.currentLocation}，已行驶 ${demo.totalKm - demo.remainingKm}/${demo.totalKm} km（${demo.progressPercent}%），预计 ${formatTransportDateTime(demo.estimatedArrival)} 到达。`,
    link: {
      kind: 'externalH5',
      label: `查看 ${demo.orderNo} 运输详情`,
      title: `${demo.orderNo} 运输情况`,
      description: '模拟外部 H5 · 地图路线与运输节点',
      url: pageUrl,
    },
  };
}

interface VehicleLocationDemo {
  direction: string;
  lastLocationTime: string;
  latitude: string;
  longitude: string;
  poi: string;
  speed: string;
}

const vehicleLocationQueryActions = ['查', '查询', '查找', '查看', '看看', '看下', '看一下', '帮我看', '帮我查', '获取', '调取', '检索', '搜索', '显示', '展示', '告诉我'];
const vehicleLocationIntentTerms = [
  '定位',
  '轨迹',
  '位置',
  '坐标',
  '经纬度',
  '车辆动态',
  '行车记录',
  '行驶记录',
  '行车路线',
  '行驶路线',
  '行驶路径',
];
const vehicleLocationTargetTerms = ['车辆', '这辆车', '该车', '车牌', '货车', '司机', '运单', '货物'];
const vehicleLocationQuestionPattern = /(?:在哪(?:里|儿)?|到哪(?:里|儿)?了?|走到哪(?:里|儿)?了?|开到哪(?:里|儿)?了?|行驶到哪(?:里|儿)?了?|现在何处)/;
const vehicleTrackingActionPattern = /(?:追踪|跟踪)(?:一下|下)?/;

function extractVehicleLocationRequest(raw: string): VehicleLocationRequest | null {
  const normalized = raw.toUpperCase();
  const plate = normalized.match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{5,6}/)?.[0] ?? '';
  const waybill =
    normalized.match(/WB\d{8,}/)?.[0] ?? normalized.match(/(?:运单号?|单号)[:：\s-]*([A-Z0-9-]{6,})/)?.[1] ?? '';
  const hasQueryAction = vehicleLocationQueryActions.some((term) => raw.includes(term));
  const hasLocationIntent = vehicleLocationIntentTerms.some((term) => raw.includes(term));
  const hasLocationQuestion = vehicleLocationQuestionPattern.test(raw);
  const hasTrackingAction = vehicleTrackingActionPattern.test(raw);
  const hasTarget = Boolean(plate || waybill || vehicleLocationTargetTerms.some((term) => raw.includes(term)));

  const isLocationQuery = (hasQueryAction && (hasLocationIntent || hasLocationQuestion || hasTrackingAction)) || (hasTarget && (hasLocationIntent || hasLocationQuestion || hasTrackingAction));
  if (!isLocationQuery) return null;
  return { plate, waybill };
}

function getVehicleLocationDemo(plate: string): VehicleLocationDemo {
  if (plate === '皖K55821') {
    return {
      poi: '南京绕城高速·六合枢纽西南侧 1.2km',
      direction: '东北方向（42°）',
      lastLocationTime: '2026-08-03 16:39:52',
      speed: '72 km/h',
      latitude: '32.286842',
      longitude: '118.823517',
    };
  }
  return {
    poi: 'G60 沪昆高速·嘉兴服务区东侧 2.4km',
    direction: '正东方向（88°）',
    lastLocationTime: '2026-08-03 16:42:18',
    speed: '68 km/h',
    latitude: '30.768421',
    longitude: '120.684295',
  };
}

function createVehicleLocationProcessMessage(plate: string, waybill: string, location: VehicleLocationDemo): ChatMessage {
  const queryObject = waybill ? `${waybill}（关联车辆 ${plate}）` : plate;
  return {
    role: 'agent',
    title: '车辆定位与轨迹查询',
    status: '已完成',
    text: `正在查询 ${queryObject} 的最新定位与行驶轨迹。`,
    progressMode: true,
    steps: [
      { title: '识别查询对象', text: `已识别查询对象：${queryObject}。` },
      { title: '查询车辆定位', text: '获取车辆最新经纬度、POI、速度、航向和定位时间。', skill: '车辆定位查询' },
      { title: '查询行驶轨迹', text: '核验最近行驶轨迹、道路匹配结果和定位连续性。', skill: '轨迹查询' },
      { title: '生成定位结果', text: '汇总当前位置与轨迹核验结果，生成车辆定位 H5 页面。' },
    ],
    result: `车辆：${plate}\n当前位置：${location.poi}\n航向：${location.direction} · 速度：${location.speed}\n最后定位时间：${location.lastLocationTime}\n经纬度：${location.latitude}, ${location.longitude}\n轨迹状态：定位连续，当前沿计划道路正常行驶。`,
    link: {
      label: `查看 ${plate} 车辆定位的 H5 页面`,
      title: `${plate} 车辆定位`,
      url: 'https://www.sinoiov.com/',
    },
  };
}

interface AnalysisReportRequest {
  prompt: string;
  title: string;
  topic: string;
}

const analysisReportGenerationTerms = ['生成', '输出', '制作', '创建', '形成', '整理', '产出', '做一份', '做一个', '做个', '出一份', '出一个', '出个', '给我一份'];
const analysisReportIntentTerms = ['分析报告', '经营报告', '运营报告', '统计报告', '数据报告', '专题报告'];
const analysisReportDomainTerms = ['分析', '统计', '经营', '运营', '异常', '风险', '预警', '运单', '物流', '承运商', '时效', '轨迹', '停车', '复盘', '洞察'];

function resolveAnalysisReportTopic(prompt: string) {
  if (/(GPS|轨迹|定位真实性|造假)/i.test(prompt)) return '车辆轨迹真实性';
  if (/(停车|停留|长停)/.test(prompt)) return '异常停车风险';
  if (/(承运商|承运单位|物流商)/.test(prompt)) return '承运商履约';
  if (/(时效|到货|晚到|预计到达|ETA)/i.test(prompt)) return '在途运输时效';
  if (/(异常|风险|预警)/.test(prompt)) return '今日在途异常风险';
  if (/(运单|在途|运输)/.test(prompt)) return '在途运单运营';
  return '物流经营综合';
}

function extractAnalysisReportRequest(raw: string): AnalysisReportRequest | null {
  const prompt = raw.trim();
  const compactPrompt = prompt.replace(/\s+/g, '');
  const hasGenerationAction = analysisReportGenerationTerms.some((term) => compactPrompt.includes(term));
  const hasNamedReportIntent = analysisReportIntentTerms.some((term) => compactPrompt.includes(term));
  const hasReportWithDomain = compactPrompt.includes('报告') && analysisReportDomainTerms.some((term) => compactPrompt.includes(term));
  const hasImpliedReport = analysisReportDomainTerms.some((term) => compactPrompt.includes(term)) && /(?:给我一份|做一份|做一个|做个|出一份|出一个|出个)/.test(compactPrompt);
  if (!hasGenerationAction || (!hasNamedReportIntent && !hasReportWithDomain && !hasImpliedReport)) return null;

  const topic = resolveAnalysisReportTopic(compactPrompt);
  return {
    prompt,
    topic,
    title: `${topic}分析报告`,
  };
}

function createAnalysisReportProcessMessage(request: AnalysisReportRequest): ChatMessage {
  return {
    role: 'agent',
    title: '经营分析报告生成',
    status: '已完成',
    text: `正在围绕“${request.topic}”构建经营分析报告。`,
    progressMode: true,
    steps: [
      { title: '识别分析问题', text: `识别分析主题、统计周期和核心指标：${request.topic}。` },
      { title: '汇聚经营数据', text: '读取在途运单、车辆定位、轨迹、承运商及风险事件数据。', skill: '大卡鹰眼' },
      { title: '执行经营分析', text: '统一指标口径，分析趋势、风险构成、线路与承运商表现。', skill: '经营分析参谋' },
      { title: '生成可视化报告', text: '生成指标卡、趋势图、风险分布、排名明细和经营建议。', skill: '经营分析参谋' },
    ],
    result: `已完成《${request.title}》。大卡鹰眼汇聚 128 单在途运单及相关轨迹、风险事件，经营分析参谋识别出 17 单异常和 6 单高风险运单。`,
    link: {
      kind: 'analysisReport',
      label: `查看《${request.title}》`,
      prompt: request.prompt,
      title: request.title,
      topic: request.topic,
      description: '经营分析参谋 · 大卡鹰眼生成',
      url: '#analysis-report',
    },
  };
}

function formatFileTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function createSpreadsheetResultFile(sourceFileName: string): AgentResultFile {
  const sourceBaseName = sourceFileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || '运单表';
  return {
    name: `${sourceBaseName}_智能补全_${formatFileTimestamp(new Date())}.xlsx`,
    url: '/demo/waybill-fill-result.xlsx',
  };
}

function clearAgentProcessTimers() {
  agentProcessTimers.forEach((timer) => clearTimeout(timer));
  agentProcessTimers = [];
}

function createWarningProcessMessage(result: string, status = '已完成', steps = warningProcessSteps): ChatMessage {
  return {
    role: 'agent',
    title: '在途预警深度处理',
    status,
    text: '',
    steps,
    result,
  };
}

function createOrderEventProcessMessage(result: string, status = '已完成', steps = orderEventProcessSteps): ChatMessage {
  return {
    role: 'agent',
    title: '单票异常停车分析',
    status,
    text: '',
    steps,
    result,
  };
}

/** 与 `linglongData` 一致：选项式 state / getters / actions */
export const agentWorkData = defineStore('agentWork', {
  state: () => {
    return {
      ordersStartDate: defaultOrdersDateRange.start,
      ordersEndDate: defaultOrdersDateRange.end,
      projects: [...projectsSeed] as Project[],
      recentConversations: conversationSeeds.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) => ({ ...message })),
      })) as AgentConversation[],
      tmsSyncCustomers: loadTmsSyncCustomers(),
      currentProjectId: projectsSeed[0]!.id,
      currentConversationId: '',
      workspaceMode: 'project' as AgentWorkspaceMode,
      showProjectModal: false,
      downloadTask: null as DownloadTask | null,
      selectedOrder: { ...ordersSeedData[0]! } as Order,
      agentInput: '',
      agentMessages: projectWelcomeMessages.map((message) => ({ ...message })) as ChatMessage[],
      rightPanel: 'overview',
      externalH5Title: '',
      externalH5Url: '',
      analysisReportPrompt: '',
      analysisReportTitle: '',
      analysisReportTopic: '',
      ordersRiskFilter: '全部',
      ordersStatusFilter: '全部',
      ordersKeyword: '',
      riskOrdersRisk: '全部异常',
      riskOrdersSource: '全部来源',
      riskOrdersKeyword: '',
      detailView: 'agent' as 'agent' | 'rule',
      detailOnlyAbnormal: false,
      /** 演示数据，只读引用 */
      ordersSeed: ordersSeedData,
    };
  },
  getters: {
    unprocessedTmsSyncCustomerCount(state): number {
      return state.tmsSyncCustomers.filter((customer) => customer.status === '未处理').length;
    },
    currentProject(state): Project {
      return state.projects.find((p) => p.id === state.currentProjectId) ?? state.projects[0]!;
    },
    currentConversation(state): AgentConversation | null {
      return state.recentConversations.find((conversation) => conversation.id === state.currentConversationId) ?? null;
    },
    ordersFiltered(state): Order[] {
      return state.ordersSeed.filter(
        (o) =>
          (state.ordersRiskFilter === '全部' || o.risk === state.ordersRiskFilter) &&
          (state.ordersStatusFilter === '全部' || o.status === state.ordersStatusFilter) &&
          (!state.ordersStartDate || getOrderStartDate(o) >= state.ordersStartDate) &&
          (!state.ordersEndDate || getOrderStartDate(o) <= state.ordersEndDate) &&
          (state.ordersKeyword === '' || `${o.id}${o.plate}${o.carrier}${o.route}`.includes(state.ordersKeyword)),
      );
    },
    riskOrdersFiltered(state): Order[] {
      const keyword = state.riskOrdersKeyword.trim().toLowerCase();
      return getRiskOrders(state.ordersSeed)
        .filter((o) => state.riskOrdersRisk === '全部异常' || o.risk === state.riskOrdersRisk)
        .filter((o) => state.riskOrdersSource === '全部来源' || o.source.includes(state.riskOrdersSource))
        .filter((o) => !state.ordersStartDate || getOrderStartDate(o) >= state.ordersStartDate)
        .filter((o) => !state.ordersEndDate || getOrderStartDate(o) <= state.ordersEndDate)
        .filter(
          (o) =>
            keyword === '' ||
            `${o.id}${o.plate}${o.driver}${o.carrier}${o.route}${o.factory}${o.issue}${o.source}${o.risk}${o.status}`.toLowerCase().includes(keyword),
        );
    },
    riskOrdersSummary(): string {
      return summarizeOrders(this.riskOrdersFiltered);
    },
    visibleRightPanel(state): string {
      return ['overview', 'risk', 'orderEvent', 'externalH5', 'analysisReport'].includes(state.rightPanel) ? state.rightPanel : 'overview';
    },
    timelineEvents(state): TimelineEvent[] {
      if (state.detailOnlyAbnormal) return timelineSeed.filter((e) => e.type !== 'normal');
      return state.detailView === 'rule' ? timelineSeed.filter((e) => e.type !== 'risk') : timelineSeed;
    },
    currentDetailOrder(state): Order {
      return state.selectedOrder ?? state.ordersSeed[0]!;
    },
    detailInfoRows(): { danger: boolean; label: string; value: string }[] {
      const o = this.currentDetailOrder;
      return [
        { label: '运单', value: o.id, danger: false },
        { label: '车牌', value: o.plate, danger: false },
        { label: '司机', value: o.driver, danger: false },
        { label: '承运商', value: o.carrier, danger: false },
        { label: '状态', value: o.status, danger: false },
        { label: '风险', value: o.risk, danger: o.risk === '高风险' },
      ];
    },
  },
  actions: {
    persistActiveConversationMessages() {
      if (this.workspaceMode !== 'conversation' || !this.currentConversationId) return;
      this.recentConversations = this.recentConversations.map((conversation) =>
        conversation.id === this.currentConversationId
          ? {
              ...conversation,
              messages: cloneChatMessages(this.agentMessages),
              updatedAt: '刚刚',
            }
          : conversation,
      );
    },
    startNewConversation() {
      this.persistActiveConversationMessages();
      this.workspaceMode = 'conversation';
      this.currentConversationId = '';
      this.agentMessages = [];
      this.agentInput = '';
      this.rightPanel = 'overview';
    },
    openConversation(conversationId: string) {
      this.persistActiveConversationMessages();
      const conversation = this.recentConversations.find((item) => item.id === conversationId);
      if (!conversation) return;
      this.workspaceMode = 'conversation';
      this.currentConversationId = conversation.id;
      this.agentMessages = cloneChatMessages(conversation.messages);
      this.agentInput = '';
      this.rightPanel = 'overview';
    },
    renameConversation(conversationId: string, title: string) {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) return;
      this.recentConversations = this.recentConversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, title: normalizedTitle } : conversation,
      );
    },
    ensureConversationStarted() {
      if (this.workspaceMode !== 'conversation' || this.currentConversationId) return;
      const conversationId = `C${Date.now()}`;
      this.recentConversations = [
        {
          id: conversationId,
          title: '对第一项对话的总结',
          updatedAt: '刚刚',
          messages: [],
        },
        ...this.recentConversations,
      ];
      this.currentConversationId = conversationId;
    },
    submitTmsSyncCustomer(payload: Pick<TmsSyncCustomer, 'account' | 'enterpriseCid' | 'password' | 'systemUrl' | 'userPhone'>) {
      const now = new Date();
      this.tmsSyncCustomers = [
        {
          ...payload,
          id: `TMSC${now.getTime()}`,
          status: '未处理',
          submittedAt: formatTmsSyncCustomerTime(now),
        },
        ...this.tmsSyncCustomers,
      ];
      persistTmsSyncCustomers(this.tmsSyncCustomers);
    },
    markTmsSyncCustomerProcessed(customerId: string, processedBy: string) {
      const processedAt = formatTmsSyncCustomerTime();
      this.tmsSyncCustomers = this.tmsSyncCustomers.map((customer) =>
        customer.id === customerId
          ? {
              ...customer,
              status: '已处理',
              processedAt,
              processedBy,
            }
          : customer,
      );
      persistTmsSyncCustomers(this.tmsSyncCustomers);
      ElMessage.success('已标记为已处理');
    },
    openExternalH5(url: string, title: string) {
      this.externalH5Url = url;
      this.externalH5Title = title;
      this.rightPanel = 'externalH5';
    },
    openAnalysisReport(title: string, topic: string, prompt: string) {
      this.analysisReportTitle = title;
      this.analysisReportTopic = topic;
      this.analysisReportPrompt = prompt;
      this.rightPanel = 'analysisReport';
    },
    showDefaultRightPanel() {
      this.rightPanel = 'overview';
    },
    setSelectedOrder(order: Order) {
      this.selectedOrder = order;
    },
    startDownloadTask(scope: string) {
      this.downloadTask = { scope, status: '生成中', progress: 35 };
      setTimeout(() => {
        this.downloadTask = { scope, status: '已完成', progress: 100 };
      }, 1200);
    },
    switchProject(p: Project) {
      this.persistActiveConversationMessages();
      this.workspaceMode = 'project';
      this.currentConversationId = '';
      this.currentProjectId = p.id;
      this.agentMessages = cloneChatMessages(projectWelcomeMessages);
      this.agentInput = '';
      this.rightPanel = 'overview';
      ElMessage.success(`已切换到：${p.name}`);
    },
    openAddProjectModal() {
      this.showProjectModal = true;
    },
    closeAddProjectModal() {
      this.showProjectModal = false;
    },
    addDemoProject(address = '金隅水泥') {
      this.workspaceMode = 'project';
      this.currentConversationId = '';
      this.projects = [
        {
          id: `P00${this.projects.length + 1}`,
          name: '新建演示项目',
          status: '已连接',
          sync: '刚刚',
          total: 0,
          risk: 0,
          tmsUrl: address,
          tmsUser: 'demo_user',
          keyword: '演示',
          statusFilter: '在途',
          skillIds: ['spreadsheet-waybill', 'route-risk-expert', 'gps-trace-expert', 'parking-event-expert'],
        },
        ...this.projects,
      ];
      this.closeAddProjectModal();
      ElMessage.success('项目创建成功');
    },
    addSkillProject(name: string, skillNames: string[], skillIds: string[]) {
      const projectId = `P${String(this.projects.length + 1).padStart(3, '0')}`;
      const skillSummary = skillNames.length > 0 ? skillNames.join(' / ') : '内置技能';
      this.workspaceMode = 'project';
      this.currentConversationId = '';
      this.projects = [
        {
          id: projectId,
          name,
          status: '已连接',
          sync: '刚刚',
          total: 0,
          risk: 0,
          tmsUrl: skillSummary,
          tmsUser: 'skill_agent',
          keyword: skillNames.slice(0, 2).join('、') || name,
          statusFilter: '在途',
          skillIds,
        },
        ...this.projects,
      ];
      this.currentProjectId = projectId;
      ElMessage.success('项目创建成功');
    },
    updateSkillProject(projectId: string, name: string, skillNames: string[], skillIds: string[]) {
      const skillSummary = skillNames.length > 0 ? skillNames.join(' / ') : '内置技能';
      this.workspaceMode = 'project';
      this.currentConversationId = '';
      this.projects = this.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              name,
              tmsUrl: skillSummary,
              tmsUser: project.tmsUser || 'skill_agent',
              keyword: skillNames.slice(0, 2).join('、') || name,
              skillIds,
            }
          : project,
      );
      this.currentProjectId = projectId;
      ElMessage.success('项目已更新');
    },
    removeProjectAt(index: number) {
      this.projects = this.projects.filter((_, idx) => idx !== index);
      if (!this.projects.find((p) => p.id === this.currentProjectId)) {
        this.currentProjectId = this.projects[0]?.id ?? '';
      }
      ElMessage.success('项目已删除');
    },
    refreshProject(project: Project) {
      this.projects = this.projects.map((item) => (item.id === project.id ? { ...item, sync: '刚刚', status: '已连接' } : item));
      ElMessage.success('连接状态已刷新');
    },
    editProject(project: Project) {
      ElMessage.info(`编辑项目：${project.name}`);
    },
    generateRiskBrief() {
      this.agentMessages = [
        ...this.agentMessages,
        {
          role: 'agent',
          text: `今日异常简报：${summarizeOrders(this.riskOrdersFiltered)}建议优先处理高风险非目的地物流园长停和轨迹造假高风险事件。`,
        },
      ];
      this.rightPanel = 'risk';
      ElMessage.success('已生成异常简报');
    },
    ensureOrdersDateRange() {
      if (this.ordersStartDate && this.ordersEndDate) return;
      this.ordersStartDate = defaultOrdersDateRange.start;
      this.ordersEndDate = defaultOrdersDateRange.end;
    },
    /** 智能体对话：由调用方传入 `navigate`，避免 store 依赖 router */
    async appendAgentExchange(text: string | undefined, navigate: (page: PageId) => void) {
      clearAgentProcessTimers();
      const raw = text ?? this.agentInput;
      if (!raw.trim()) return;
      this.ensureConversationStarted();
      const next: ChatMessage[] = [...this.agentMessages, { role: 'user', text: raw }];
      const spreadsheetRequest = extractSpreadsheetRequest(raw);
      const mcpPrompt = extractMcpPrompt(raw);
      const analysisReportRequest = extractAnalysisReportRequest(raw);
      const transportStatusRequest = extractTransportStatusRequest(raw);
      const vehicleLocationRequest = extractVehicleLocationRequest(raw);
      let replyMessage: ChatMessage = { role: 'agent', text: '已处理你的请求。你可以继续补充需要关注的范围。' };
      if (spreadsheetRequest) {
        this.startSpreadsheetFillProcess(next, spreadsheetRequest.sourceFileName);
        this.agentInput = '';
        return;
      }
      if (mcpPrompt) {
        await this.startMcpPromptTest(next, mcpPrompt);
        this.agentInput = '';
        return;
      }
      if (analysisReportRequest) {
        const processMessage = createAnalysisReportProcessMessage(analysisReportRequest);
        this.startDelayedAgentProcess(next, processMessage, () => {
          this.openAnalysisReport(analysisReportRequest.title, analysisReportRequest.topic, analysisReportRequest.prompt);
        });
        this.agentInput = '';
        return;
      }
      if (transportStatusRequest) {
        const processMessage = createTransportStatusProcessMessage(transportStatusRequest);
        this.startDelayedAgentProcess(next, processMessage, () => {
          this.openExternalH5(processMessage.link!.url, processMessage.link!.title);
        });
        this.agentInput = '';
        return;
      }
      if (vehicleLocationRequest) {
        const matchedOrder = vehicleLocationRequest.waybill
          ? this.ordersSeed.find((order) => order.id.toUpperCase() === vehicleLocationRequest.waybill)
          : undefined;
        const plate = vehicleLocationRequest.plate || matchedOrder?.plate || '沪A12345';
        const location = getVehicleLocationDemo(plate);
        const processMessage = createVehicleLocationProcessMessage(plate, vehicleLocationRequest.waybill, location);
        this.startDelayedAgentProcess(next, processMessage, () => {
          this.openExternalH5(processMessage.link!.url, processMessage.link!.title);
        });
        this.agentInput = '';
        return;
      }
      if (raw.includes('在途预警') || raw.includes('真有风险')) {
        this.startDelayedAgentProcess(next, createWarningProcessMessage('已完成今日在途预警处理，真实高风险清单已整理。'), () => {
          this.rightPanel = 'risk';
        });
        this.agentInput = '';
        return;
      }
      if (raw.includes('皖K55821')) {
        this.startDelayedAgentProcess(next, createOrderEventProcessMessage('已完成皖K55821异常停车事件分析。'), () => {
          this.rightPanel = 'orderEvent';
          this.detailView = 'agent';
          this.detailOnlyAbnormal = false;
        });
        this.agentInput = '';
        return;
      }
      if (raw.includes('所有运单')) {
        replyMessage = { role: 'agent', text: '已查询当前项目全部运单。' };
        this.rightPanel = 'orders';
        navigate('orders');
      }
      if ((raw.includes('异常') || raw.includes('高风险')) && !raw.includes('在途预警') && !raw.includes('真有风险') && !raw.includes('皖K55821')) {
        replyMessage = { role: 'agent', text: '已筛选今日真实高风险运单，低风险合理停车已在右侧简略说明。' };
        this.rightPanel = 'risk';
      }
      if ((raw.includes('停车') || raw.includes('沪A12345')) && !raw.includes('皖K55821')) {
        replyMessage = { role: 'agent', text: '已定位到沪A12345的异常停车事件。' };
        this.rightPanel = 'detail';
        this.setSelectedOrder(this.ordersSeed[0]!);
        navigate('detail');
      }
      if (raw.includes('下载')) {
        replyMessage = { role: 'agent', text: '已按“今日异常运单”创建 Excel 下载任务。' };
        this.rightPanel = 'download';
        this.startDownloadTask('今日异常运单');
        navigate('downloads');
        ElMessage.success('已创建下载任务');
      }
      this.agentMessages = [...next, replyMessage];
      this.agentInput = '';
    },
    startSpreadsheetFillProcess(next: ChatMessage[], sourceFileName: string) {
      const steps = createSpreadsheetFillSteps(sourceFileName);
      const resultFile = createSpreadsheetResultFile(sourceFileName);
      const messageIndex = next.length;
      this.agentMessages = [
        ...next,
        {
          role: 'agent',
          title: '智能填表任务',
          status: '处理中',
          text: `已接收“${sourceFileName}”，正在依据空缺字段编排在途专家技能。`,
          steps,
          result: '',
          progressMode: true,
          activeStepIndex: 0,
        },
      ];

      steps.forEach((_, stepIndex) => {
        const timer = setTimeout(() => {
          const completedStepCount = stepIndex + 1;
          const isComplete = completedStepCount === steps.length;
          this.agentMessages = this.agentMessages.map((message, index) => {
            if (index !== messageIndex) return message;
            return {
              ...message,
              activeStepIndex: completedStepCount,
              status: isComplete ? '已完成' : '处理中',
              result: isComplete ? '任务执行完成，已补全 128 行运单并通过最终检验。' : '',
              file: isComplete ? resultFile : undefined,
            };
          });

          if (isComplete) clearAgentProcessTimers();
        }, (stepIndex + 1) * spreadsheetProcessStepInterval);
        agentProcessTimers.push(timer);
      });
    },
    startDelayedAgentProcess(next: ChatMessage[], finalMessage: ChatMessage, onComplete: () => void) {
      const steps = finalMessage.steps ?? [];
      const messageIndex = next.length;

      this.agentMessages = [
        ...next,
        {
          ...finalMessage,
          status: '处理中',
          steps: finalMessage.progressMode ? steps : [],
          activeStepIndex: 0,
          result: '',
          link: undefined,
        },
      ];

      steps.forEach((_, stepIndex) => {
        const timer = setTimeout(() => {
          const isComplete = stepIndex === steps.length - 1;
          this.agentMessages = this.agentMessages.map((message, index) => {
            if (index !== messageIndex) return message;
            return {
              ...message,
              status: isComplete ? '已完成' : '处理中',
              steps: finalMessage.progressMode ? steps : steps.slice(0, stepIndex + 1),
              activeStepIndex: isComplete ? steps.length : stepIndex,
              result: isComplete ? finalMessage.result : '',
              link: isComplete ? finalMessage.link : undefined,
            };
          });

          if (isComplete) {
            onComplete();
            clearAgentProcessTimers();
          }
        }, processStepInitialDelay + stepIndex * processStepInterval);
        agentProcessTimers.push(timer);
      });
    },
    async startMcpPromptTest(next: ChatMessage[], prompt: string) {
      const messageIndex = next.length;
      this.agentMessages = [
        ...next,
        {
          role: 'agent',
          title: '外部 MCP prompt 测试',
          status: '调用中',
          text: '',
          steps: [
            { title: '连接服务', text: '通过本地 Vite 代理连接 shuziren-mcp-server。' },
            { title: '发送 Prompt', text: prompt },
          ],
          result: '',
        },
      ];

      try {
        const result = await runMcpPrompt(prompt);
        this.agentMessages = this.agentMessages.map((message, index) => {
          if (index !== messageIndex) return message;
          return {
            ...message,
            result: result.detail.slice(0, 3000),
            status: '已完成',
            title: result.title,
          };
        });
      } catch (error) {
        this.agentMessages = this.agentMessages.map((message, index) => {
          if (index !== messageIndex) return message;
          return {
            ...message,
            result: error instanceof Error ? error.message : 'MCP 调用失败，请检查本地代理配置和服务状态。',
            status: '失败',
          };
        });
      }
    },
  },
});
