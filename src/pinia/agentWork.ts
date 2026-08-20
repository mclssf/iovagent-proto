import type {
  AgentConversation,
  AgentResultFile,
  AgentWorkspaceMode,
  CargoQuote,
  ChatMessage,
  CooperationWindowDays,
  DownloadTask,
  Order,
  PageId,
  PrivateCapacity,
  Project,
  StandardCargo,
  TimelineEvent,
  TmsSyncCustomer,
} from '@/views/AgentWork/interface';

import { ElMessage } from 'element-plus';
import { defineStore } from 'pinia';

import { cargoQuoteSeedData, cargoSeedData, privateCapacitySeedData } from '@/views/AgentWork/capacityData';
import { extractMcpPrompt, runMcpPrompt } from '@/views/AgentWork/mcpClient';
import { getRiskOrders, summarizeOrders } from '@/views/AgentWork/utils';

const defaultOrdersDateRange = {
  start: '2026-05-09',
  end: '2026-05-16',
};

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createDefaultCargoDateRange() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6);
  return { start: formatLocalDate(startDate), end: formatLocalDate(endDate) };
}

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
    skillIds: [
      'jinyu-cement-tms',
      'huadong-cargo-connector',
      'huadong-dispatch-writeback',
      'route-risk-expert',
      'gps-trace-expert',
      'parking-event-expert',
      'capacity-cargo-normalization',
      'capacity-cargo-publish',
      'capacity-quote-collection',
      'capacity-private-fleet',
    ],
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

export const quickPrompts = [
  '帮我处理一下今天的在途预警 挑出真有风险的运单',
  '只看皖K55821异常停车事件',
  '将上面结果通过邮件发送给 logistics.ops@example.com',
  '查看所有运单',
  '下载今天异常运单',
];

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

const warningResultText = [
  '处理结论：今日 17 条在途预警已完成交叉核验，确认 5 单存在真实高风险，11 单属于合理低风险，1 单保留人工复核。',
  '',
  '真实高风险运单：',
  '1. WB20260509001｜沪A12345｜上海工厂 → 广州仓｜非目的地物流园停车 94 分钟，叠加 GPS 断点和速度跳变，建议立即核查车辆与货物状态。',
  '2. WB20260509007｜冀F21680｜北京仓 → 石家庄仓｜偏航 32km 后在建材市场停靠 126 分钟，疑似非计划卸货。',
  '3. WB20260509018｜皖K55821｜合肥仓 → 南京仓｜第三方中转仓非合同经停 73 分钟，存在倒货或换车风险。',
  '4. WB20260509023｜豫P67019｜郑州厂 → 武汉仓｜停车 112 分钟且点火与定位连续性冲突，疑似设备离车或轨迹补传。',
  '5. WB20260509031｜浙A91766｜宁波港 → 苏州仓｜距目的地 79km 的第三方物流园长停 101 分钟，恢复行驶后方向异常。',
  '',
  '建议处置：优先联系前 3 单司机与承运商核实货物状态；对沪A12345、豫P67019发起轨迹真实性复核；其余合理停车暂不升级。',
].join('\n');

const orderEventResultText = [
  '核验结论：皖K55821共识别 2 次停车，其中 1 次为合理休息，1 次确认为高风险异常停车。',
  '',
  '关联运单：WB20260509018',
  '运输线路：合肥仓 → 南京仓',
  '当前状态：车辆已恢复行驶，正驶向南京仓',
  '',
  '停车事件：',
  '1. 11:05–11:48｜滁州高速服务区｜停车 43 分钟。轨迹连续，未超过 60 分钟阈值，符合司机途中休息场景，判定为低风险。',
  '2. 14:32–15:45｜第三方中转仓｜停车 73 分钟。停靠点不在合同节点内，距南京仓约 18km，存在倒货、换车或非计划中转风险，判定为高风险。',
  '',
  '处置建议：立即联系司机确认中转仓停靠原因，要求提供现场照片或货物封签；同步承运商复核运输指令，并持续关注车辆到仓前轨迹。',
].join('\n');

interface EmailDeliveryRequest {
  address: string;
  sourceTitle: string;
  subject: string;
}

const emailAddressPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const emailChannelPattern = /(?:邮件|邮箱|email|e-mail)/i;
const emailSendActionPattern = /(?:发送|发给|发到|转发)/;

function hasEmailDeliveryIntent(raw: string) {
  return emailChannelPattern.test(raw) || (emailAddressPattern.test(raw) && emailSendActionPattern.test(raw));
}

function extractEmailDeliveryRequest(raw: string, messages: ChatMessage[]): EmailDeliveryRequest | null {
  if (!hasEmailDeliveryIntent(raw)) return null;
  const address = raw.match(emailAddressPattern)?.[0];
  if (!address) return null;

  const sourceMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'agent' && message.title);
  const sourceTitle = sourceMessage?.title ?? '智能体处理结果';
  const subject = sourceTitle.includes('在途预警')
    ? '今日在途高风险运单处置清单'
    : sourceTitle.includes('异常停车')
      ? '皖K55821异常停车事件核验结果'
      : `${sourceTitle}处理结果`;

  return { address, sourceTitle, subject };
}

function createEmailDeliveryProcessMessage(request: EmailDeliveryRequest): ChatMessage {
  const sentAt = formatTmsSyncCustomerTime();
  return {
    role: 'agent',
    title: '邮件发送',
    status: '已完成',
    text: `正在将“${request.sourceTitle}”整理为邮件并发送。`,
    progressMode: true,
    steps: [
      { title: '确认发送内容', text: `已选取最近一次“${request.sourceTitle}”的文字结论、风险明细和处置建议。` },
      { title: '生成邮件正文', text: `邮件主题：${request.subject}；保留运单号、车牌号、风险依据和建议动作。` },
      { title: '校验收件信息', text: `收件人 ${request.address} 格式有效，正文内容完整。` },
      { title: '发送邮件', text: '已提交至企业邮件通道并取得发送回执。' },
    ],
    result: [
      '发送成功',
      `收件人：${request.address}`,
      `邮件主题：${request.subject}`,
      `发送内容：${request.sourceTitle}的完整文字结论、风险明细与处置建议`,
      `发送时间：${sentAt}`,
      `邮件回执：MAIL-${Date.now().toString(36).toUpperCase()}`,
    ].join('\n'),
  };
}

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

interface TransportStatusRequest {
  plate: string;
  waybill: string;
}

interface VehiclePositionRequest {
  plate: string;
}

interface VehiclePositionDemo {
  direction: string;
  lastLocationTime: string;
  latitude: string;
  longitude: string;
  poi: string;
  speed: string;
}

interface TransportStatusDemo {
  actualDepartTime: string;
  carrier: string;
  cargo: string;
  completedDistanceKm: number;
  currentLatitude: string;
  currentLongitude: string;
  destinationAddress: string;
  destinationLatitude: string;
  destinationLongitude: string;
  destinationName: string;
  direction: string;
  eta: string;
  lastLocationTime: string;
  originAddress: string;
  originLatitude: string;
  originLongitude: string;
  originName: string;
  poi: string;
  progress: number;
  speed: string;
  totalDistanceKm: number;
  transitNode: string;
  waybillNo: string;
}

interface TransportScenario {
  carrier: string;
  cargo: string;
  current: { lat: number; lng: number; name: string };
  destination: { address: string; lat: number; lng: number; name: string };
  direction: string;
  origin: { address: string; lat: number; lng: number; name: string };
  progressRange: [number, number];
  totalDistanceKm: number;
  transitNode: string;
}

const logisticsQueryActions = ['查', '查询', '查找', '查看', '看看', '看下', '看一下', '帮我看', '帮我查', '获取', '调取', '检索', '搜索', '显示', '展示', '告诉我'];
const orderTargetTerms = ['订单', '运单', '货单', '发运单', '运输单', '单号', '运输任务', '货物'];
const vehicleTargetTerms = ['车辆', '这辆车', '该车', '车牌', '货车', '司机'];
const transportStatusIntentTerms = [
  '运输情况',
  '运输进度',
  '运输状态',
  '运输进展',
  '在途状态',
  '在途情况',
  '在途进度',
  '配送进度',
  '发运进度',
  '物流进度',
  '到货进度',
  '行程进度',
  '运输到哪',
  '运到哪',
];
const orderTransportDetailTerms = [
  '位置',
  '定位',
  '到哪',
  '进度',
  '情况',
  '状态',
  '进展',
  '剩余里程',
  '预计到达',
  '多久到达',
  '多长时间到达',
];
const vehiclePositionIntentTerms = [
  '实时定位',
  '当前位置',
  '实时位置',
  '定位',
  '位置',
  '坐标',
  '经纬度',
  '车辆动态',
];
const positionQuestionPattern = /(?:在哪(?:里|儿)?|到哪(?:里|儿)?了?|走到哪(?:里|儿)?了?|开到哪(?:里|儿)?了?|行驶到哪(?:里|儿)?了?|现在何处)/;
const vehicleTrackingActionPattern = /(?:追踪|跟踪)(?:一下|下)?/;

const transportScenarios: TransportScenario[] = [
  {
    origin: { name: '上海嘉定工厂', address: '上海市嘉定区胜辛南路 88 号', lat: 31.2304, lng: 121.4737 },
    destination: { name: '广州黄埔仓', address: '广州市黄埔区开创大道 168 号', lat: 23.158, lng: 113.48 },
    current: { name: 'G60 沪昆高速·南昌东段', lat: 28.6829, lng: 115.8582 },
    transitNode: '南昌东枢纽',
    direction: '西南方向（218°）',
    totalDistanceKm: 1510,
    progressRange: [0.46, 0.62],
    cargo: '袋装水泥 P.O42.5',
    carrier: '安捷物流',
  },
  {
    origin: { name: '合肥经开仓', address: '合肥市经开区云谷路 3188 号', lat: 31.8206, lng: 117.2272 },
    destination: { name: '南京江宁仓', address: '南京市江宁区诚信大道 885 号', lat: 31.9537, lng: 118.839 },
    current: { name: 'G40 沪陕高速·滁州段', lat: 32.075, lng: 118.29 },
    transitNode: '滁州服务区',
    direction: '东南方向（116°）',
    totalDistanceKm: 182,
    progressRange: [0.52, 0.76],
    cargo: '常温食品',
    carrier: '顺达货运',
  },
  {
    origin: { name: '北京顺义仓', address: '北京市顺义区顺平路 18 号', lat: 40.1289, lng: 116.6546 },
    destination: { name: '石家庄栾城仓', address: '石家庄市栾城区裕翔街 165 号', lat: 37.9002, lng: 114.6483 },
    current: { name: 'G4 京港澳高速·保定段', lat: 38.8737, lng: 115.4646 },
    transitNode: '保定南收费站',
    direction: '西南方向（205°）',
    totalDistanceKm: 292,
    progressRange: [0.48, 0.7],
    cargo: '啤酒饮品',
    carrier: '华北速运',
  },
  {
    origin: { name: '青岛市北配送中心', address: '青岛市市北区瑞昌路 168 号', lat: 36.087, lng: 120.374 },
    destination: { name: '济南历城仓', address: '济南市历城区工业北路 241 号', lat: 36.709, lng: 117.121 },
    current: { name: 'G20 青银高速·潍坊段', lat: 36.7069, lng: 119.1618 },
    transitNode: '潍坊西服务区',
    direction: '正西方向（272°）',
    totalDistanceKm: 367,
    progressRange: [0.4, 0.64],
    cargo: '快消品',
    carrier: '远恒运输',
  },
  {
    origin: { name: '成都龙泉工厂', address: '成都市龙泉驿区车城东七路 328 号', lat: 30.5728, lng: 104.269 },
    destination: { name: '重庆江北仓', address: '重庆市江北区港城东路 2 号', lat: 29.6205, lng: 106.694 },
    current: { name: 'G42 沪蓉高速·遂宁段', lat: 30.533, lng: 105.593 },
    transitNode: '遂宁枢纽',
    direction: '东南方向（124°）',
    totalDistanceKm: 318,
    progressRange: [0.43, 0.68],
    cargo: '包装饮用水',
    carrier: '西南联运',
  },
];

const transportDemoPlates = ['沪A12345', '皖K55821', '冀F21680', '鲁B3M579', '川A6P82Q'];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function formatDemoDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function createDemoWaybillNo() {
  const date = new Date();
  const day = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `WB${day}${String(Math.floor(randomBetween(10, 999))).padStart(3, '0')}`;
}

function extractLogisticsReference(raw: string) {
  const normalized = raw.toUpperCase();
  const plate = normalized.match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{5,6}/)?.[0] ?? '';
  const waybill =
    normalized.match(/WB\d{8,}/)?.[0] ?? normalized.match(/(?:订单号?|运单号?|货单号?|发运单号?|运输单号?|单号)[:：\s#-]*([A-Z0-9-]{5,})/)?.[1] ?? '';
  return { plate, waybill };
}

function extractTransportStatusRequest(raw: string): TransportStatusRequest | null {
  const reference = extractLogisticsReference(raw);
  const hasQueryAction = logisticsQueryActions.some((term) => raw.includes(term));
  const hasOrderTarget = Boolean(reference.waybill || orderTargetTerms.some((term) => raw.includes(term)));
  const hasVehicleTarget = Boolean(reference.plate || vehicleTargetTerms.some((term) => raw.includes(term)));
  const hasStrongTransportIntent = transportStatusIntentTerms.some((term) => raw.includes(term));
  const hasOrderDetailIntent = orderTransportDetailTerms.some((term) => raw.includes(term)) || positionQuestionPattern.test(raw);
  const isTransportQuery =
    (hasQueryAction || hasOrderTarget || hasVehicleTarget) &&
    ((hasOrderTarget && hasOrderDetailIntent) || ((hasOrderTarget || hasVehicleTarget) && hasStrongTransportIntent));
  if (!isTransportQuery) return null;
  return reference;
}

function extractVehiclePositionRequest(raw: string): VehiclePositionRequest | null {
  const reference = extractLogisticsReference(raw);
  const hasOrderTarget = Boolean(reference.waybill || orderTargetTerms.some((term) => raw.includes(term)));
  const hasTransportIntent = transportStatusIntentTerms.some((term) => raw.includes(term));
  if (hasOrderTarget || hasTransportIntent) return null;

  const hasQueryAction = logisticsQueryActions.some((term) => raw.includes(term));
  const hasVehicleTarget = Boolean(reference.plate || vehicleTargetTerms.some((term) => raw.includes(term)));
  const hasPositionIntent = vehiclePositionIntentTerms.some((term) => raw.includes(term));
  const hasPositionQuestion = positionQuestionPattern.test(raw);
  const hasTrackingAction = vehicleTrackingActionPattern.test(raw);
  const isVehiclePositionQuery =
    hasVehicleTarget &&
    ((hasQueryAction && (hasPositionIntent || hasPositionQuestion || hasTrackingAction)) || hasPositionIntent || hasPositionQuestion || hasTrackingAction);
  if (!isVehiclePositionQuery) return null;
  return { plate: reference.plate };
}

function getVehiclePositionDemo(plate: string): VehiclePositionDemo {
  const preferredScenarioIndex = plate === '皖K55821' ? 1 : Math.floor(Math.random() * transportScenarios.length);
  const scenario = transportScenarios[preferredScenarioIndex] ?? transportScenarios[0]!;
  const now = new Date(Date.now() - Math.round(randomBetween(15, 95)) * 1000);
  return {
    poi: scenario.current.name,
    direction: scenario.direction,
    lastLocationTime: formatDemoDateTime(now),
    speed: `${Math.round(randomBetween(56, 82))} km/h`,
    latitude: scenario.current.lat.toFixed(6),
    longitude: scenario.current.lng.toFixed(6),
  };
}

function getTransportStatusDemo(plate: string): TransportStatusDemo {
  const preferredScenarioIndex = plate === '皖K55821' ? 1 : Math.floor(Math.random() * transportScenarios.length);
  const scenario = transportScenarios[preferredScenarioIndex] ?? transportScenarios[0]!;
  const progress = Math.round(randomBetween(...scenario.progressRange) * 100);
  const totalDistanceKm = Math.round(scenario.totalDistanceKm * randomBetween(0.98, 1.025));
  const completedDistanceKm = Math.round((totalDistanceKm * progress) / 100);
  const speedKmh = Math.round(randomBetween(58, 82));
  const remainingDistanceKm = totalDistanceKm - completedDistanceKm;
  const etaHours = remainingDistanceKm / (speedKmh * randomBetween(0.72, 0.84)) + randomBetween(0.25, 1.1);
  const elapsedHours = completedDistanceKm / (speedKmh * randomBetween(0.75, 0.86));
  const now = new Date();
  const actualDepartAt = new Date(now.getTime() - elapsedHours * 60 * 60 * 1000);
  const etaAt = new Date(now.getTime() + etaHours * 60 * 60 * 1000);

  return {
    actualDepartTime: formatDemoDateTime(actualDepartAt),
    carrier: scenario.carrier,
    cargo: scenario.cargo,
    completedDistanceKm,
    currentLatitude: scenario.current.lat.toFixed(6),
    currentLongitude: scenario.current.lng.toFixed(6),
    destinationAddress: scenario.destination.address,
    destinationLatitude: scenario.destination.lat.toFixed(6),
    destinationLongitude: scenario.destination.lng.toFixed(6),
    destinationName: scenario.destination.name,
    direction: scenario.direction,
    eta: formatDemoDateTime(etaAt),
    lastLocationTime: formatDemoDateTime(now),
    originAddress: scenario.origin.address,
    originLatitude: scenario.origin.lat.toFixed(6),
    originLongitude: scenario.origin.lng.toFixed(6),
    originName: scenario.origin.name,
    poi: scenario.current.name,
    progress,
    speed: `${speedKmh} km/h`,
    totalDistanceKm,
    transitNode: scenario.transitNode,
    waybillNo: createDemoWaybillNo(),
  };
}

function createVehiclePositionH5Url(plate: string, location: VehiclePositionDemo) {
  const params = new URLSearchParams({
    plate,
    poi: location.poi,
    direction: location.direction,
    speed: location.speed,
    time: location.lastLocationTime,
    lat: location.latitude,
    lng: location.longitude,
  });
  return `/demo/vehicle-location.html?${params.toString()}`;
}

function createVehiclePositionProcessMessage(plate: string, location: VehiclePositionDemo): ChatMessage {
  return {
    role: 'agent',
    title: '车辆实时定位查询',
    status: '已完成',
    text: `正在查询车辆 ${plate} 的最后一次有效定位。`,
    progressMode: true,
    steps: [
      { title: '识别车辆', text: `已识别查询车辆：${plate}。` },
      { title: '调用车辆定位', text: '获取车辆最新经纬度、POI、速度、航向和定位时间。', skill: '车辆定位查询' },
      { title: '校验定位质量', text: '核验 GPS 在线状态、定位时间和坐标有效性。', skill: '车辆定位查询' },
      { title: '生成定位页面', text: '生成仅包含车辆当前位置与定位详情的 H5 页面。' },
    ],
    result: `车辆：${plate}\n当前位置：${location.poi}\n航向：${location.direction}\n速度：${location.speed}\n最后定位时间：${location.lastLocationTime}\n经纬度：${location.latitude}, ${location.longitude}\n定位状态：GPS 在线，定位信号稳定。`,
    link: {
      kind: 'externalH5',
      label: `查看 ${plate} 实时位置`,
      title: `${plate} · 车辆实时位置`,
      description: '单点定位 · 详细 POI · 航向与速度',
      url: createVehiclePositionH5Url(plate, location),
    },
  };
}

function createOrderTransportH5Url(plate: string, waybill: string, location: TransportStatusDemo) {
  const params = new URLSearchParams({
    plate,
    waybill: waybill || location.waybillNo,
    carrier: location.carrier,
    cargo: location.cargo,
    poi: location.poi,
    direction: location.direction,
    speed: location.speed,
    time: location.lastLocationTime,
    eta: location.eta,
    departTime: location.actualDepartTime,
    progress: String(location.progress),
    totalDistance: String(location.totalDistanceKm),
    completedDistance: String(location.completedDistanceKm),
    originName: location.originName,
    originAddress: location.originAddress,
    originLat: location.originLatitude,
    originLng: location.originLongitude,
    destinationName: location.destinationName,
    destinationAddress: location.destinationAddress,
    destinationLat: location.destinationLatitude,
    destinationLng: location.destinationLongitude,
    currentLat: location.currentLatitude,
    currentLng: location.currentLongitude,
    transitNode: location.transitNode,
  });
  return `/demo/order-transport.html?${params.toString()}`;
}

function createTransportStatusProcessMessage(plate: string, waybill: string, location: TransportStatusDemo): ChatMessage {
  const resolvedWaybill = waybill || location.waybillNo;
  const queryObject = `${resolvedWaybill}（车辆 ${plate}）`;
  return {
    role: 'agent',
    title: '订单运输情况查询',
    status: '已完成',
    text: `正在查询 ${queryObject} 的在途位置、运输进度与预计到达情况。`,
    progressMode: true,
    steps: [
      { title: '识别查询对象', text: `已识别查询对象：${queryObject}。` },
      { title: '查询订单与车辆', text: '读取装卸货地、承运商、货物、发车时间和车辆绑定关系。', skill: '运单补充' },
      { title: '查询车辆定位', text: '获取车辆最新经纬度、POI、速度、航向和定位时间。', skill: '车辆定位查询' },
      { title: '核验运输轨迹', text: '按道路拟合行驶轨迹，计算已行驶里程、剩余里程和在途进度。', skill: '轨迹查询' },
      { title: '预测到达时间', text: '结合剩余路程、实时速度和线路时效计算预计到达时间。', skill: '到货时效专家' },
      { title: '生成运输页面', text: '汇总地图、装卸货点和运输节点 Timeline，生成订单运输情况 H5。' },
    ],
    result: `运单：${resolvedWaybill}\n车辆：${plate} · ${location.carrier}\n线路：${location.originName} → ${location.destinationName}\n货物：${location.cargo}\n当前位置：${location.poi}\n运输进度：${location.progress}%（已行驶 ${location.completedDistanceKm} / ${location.totalDistanceKm} km）\n预计到达：${location.eta}\n车辆动态：${location.direction} · ${location.speed}\n最后定位：${location.lastLocationTime}\n轨迹状态：定位连续，当前沿计划道路正常行驶。`,
    link: {
      kind: 'externalH5',
      label: `查看 ${resolvedWaybill} 运输情况`,
      title: `${plate} · 订单运输情况`,
      description: `${location.originName} → ${location.destinationName} · 预计 ${location.eta.slice(5, 16)} 到达`,
      url: createOrderTransportH5Url(plate, resolvedWaybill, location),
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
    const defaultCargoDateRange = createDefaultCargoDateRange();
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
      cargoSources: cargoSeedData.map((cargo) => ({
        ...cargo,
        loadAddresses: cargo.loadAddresses.map((address) => ({ ...address })),
        unloadAddresses: cargo.unloadAddresses.map((address) => ({ ...address })),
        platformPublications: cargo.platformPublications.map((publication) => ({ ...publication })),
        price: { ...cargo.price },
        tags: [...cargo.tags],
        truckLengths: [...cargo.truckLengths],
        truckTypes: [...cargo.truckTypes],
      })) as StandardCargo[],
      cargoQuotes: cargoQuoteSeedData.map((quote) => ({
        ...quote,
        comments: [...quote.comments],
      })) as CargoQuote[],
      privateCapacity: privateCapacitySeedData.map((capacity) => ({
        ...capacity,
        routes: [...capacity.routes],
      })) as PrivateCapacity[],
      cargoKeyword: '',
      cargoStatusFilter: '全部',
      cargoSourceFilter: '全部',
      cargoStartDate: defaultCargoDateRange.start,
      cargoEndDate: defaultCargoDateRange.end,
      cargoPage: 1,
      cargoPageSize: 20,
      quoteKeyword: '',
      quoteTypeFilter: '全部',
      quoteCargoId: '',
      quoteCargoStatusFilter: '全部',
      quotePlatformFilter: '全部',
      quoteStatusFilter: '全部',
      quoteStartDate: '',
      quoteEndDate: '',
      quoteCooperationWindowDays: 30 as CooperationWindowDays,
      privateCapacityKeyword: '',
      privateCapacityLoadStateFilter: '全部',
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
    cargoSourcesFiltered(state): StandardCargo[] {
      const keyword = state.cargoKeyword.trim().toLowerCase();
      return state.cargoSources
        .filter(
          (cargo) =>
            cargo.projectId === state.currentProjectId &&
            (state.cargoStatusFilter === '全部' || cargo.status === state.cargoStatusFilter) &&
            (state.cargoSourceFilter === '全部' || cargo.sourceType === state.cargoSourceFilter) &&
            (!state.cargoStartDate || cargo.createdAt.slice(0, 10) >= state.cargoStartDate) &&
            (!state.cargoEndDate || cargo.createdAt.slice(0, 10) <= state.cargoEndDate) &&
            (!keyword ||
              `${cargo.id}${cargo.externalCargoNo}${cargo.cargoName}${cargo.sourceSystem}${cargo.loadAddresses.map((item) => item.detail).join('')}${cargo.unloadAddresses
                .map((item) => item.detail)
                .join('')}`
                .toLowerCase()
                .includes(keyword)),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    cargoSourcesPaginated(): StandardCargo[] {
      const startIndex = (this.cargoPage - 1) * this.cargoPageSize;
      return this.cargoSourcesFiltered.slice(startIndex, startIndex + this.cargoPageSize);
    },
    cargoTotalPages(): number {
      return Math.max(1, Math.ceil(this.cargoSourcesFiltered.length / this.cargoPageSize));
    },
    cargoQuotesFiltered(state): CargoQuote[] {
      const keyword = state.quoteKeyword.trim().toLowerCase();
      return state.cargoQuotes
        .filter((quote) => {
          const cargo = state.cargoSources.find((item) => item.id === quote.cargoId);
          return (
            cargo?.projectId === state.currentProjectId &&
            (!state.quoteCargoId || quote.cargoId === state.quoteCargoId) &&
            (state.quoteCargoStatusFilter === '全部' || cargo?.status === state.quoteCargoStatusFilter) &&
            (state.quoteTypeFilter === '全部' || quote.type === state.quoteTypeFilter) &&
            (state.quotePlatformFilter === '全部' || quote.sourcePlatform === state.quotePlatformFilter) &&
            (state.quoteStatusFilter === '全部' || quote.status === state.quoteStatusFilter) &&
            (!state.quoteStartDate || quote.createdAt.slice(0, 10) >= state.quoteStartDate) &&
            (!state.quoteEndDate || quote.createdAt.slice(0, 10) <= state.quoteEndDate) &&
            (!keyword || `${quote.driverName}${quote.truckNo}${quote.location}${quote.sourcePlatform}${cargo?.cargoName ?? ''}`.toLowerCase().includes(keyword))
          );
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    privateCapacityFiltered(state): PrivateCapacity[] {
      const keyword = state.privateCapacityKeyword.trim().toLowerCase();
      return state.privateCapacity.filter(
        (capacity) =>
          (state.privateCapacityLoadStateFilter === '全部' || capacity.loadState === state.privateCapacityLoadStateFilter) &&
          (!keyword ||
            `${capacity.driverName}${capacity.truckNo}${capacity.carrierName}${capacity.baseCity}${capacity.currentLocation}${capacity.predictedDestination ?? ''}${capacity.routes.join('')}`
              .toLowerCase()
              .includes(keyword)),
      );
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
    focusCargoQuotes(cargoId: string) {
      this.quoteCargoId = cargoId;
      this.quoteKeyword = '';
      this.quoteTypeFilter = '全部';
      this.quoteCargoStatusFilter = '全部';
      this.quotePlatformFilter = '全部';
      this.quoteStatusFilter = '全部';
      this.quoteStartDate = '';
      this.quoteEndDate = '';
    },
    resetQuoteFilters() {
      this.quoteCargoId = '';
      this.quoteKeyword = '';
      this.quoteTypeFilter = '全部';
      this.quoteCargoStatusFilter = '全部';
      this.quotePlatformFilter = '全部';
      this.quoteStatusFilter = '全部';
      this.quoteStartDate = '';
      this.quoteEndDate = '';
      this.quoteCooperationWindowDays = 30;
    },
    ensureCargoDateRange() {
      const defaultCargoDateRange = createDefaultCargoDateRange();
      if (!this.cargoStartDate) this.cargoStartDate = defaultCargoDateRange.start;
      if (!this.cargoEndDate) this.cargoEndDate = defaultCargoDateRange.end;
    },
    publishCargo(cargoId: string) {
      const cargo = this.cargoSources.find((item) => item.id === cargoId);
      if (!cargo) return;
      if (cargo.status === '待完善') {
        ElMessage.warning('货源必填字段尚未完善，请先通过对话确认缺失信息');
        return;
      }
      const updatedAt = '2026-08-19 11:48';
      cargo.status = '发布中';
      cargo.updatedAt = updatedAt;
      cargo.platformPublications = cargo.platformPublications.map((publication) => ({
        ...publication,
        externalCargoId: publication.externalCargoId || `${publication.platform === '大卡' ? 'DK' : 'MB'}${Date.now()}`,
        publishedAt: publication.publishedAt || updatedAt,
        status: '发布中',
        updatedAt,
      }));
      ElMessage.success('已发布到大卡，并同步到已配置的满帮运掌柜账号');
    },
    offlineCargo(cargoId: string) {
      const cargo = this.cargoSources.find((item) => item.id === cargoId);
      if (!cargo) return;
      cargo.status = '已下架';
      cargo.updatedAt = '2026-08-19 11:49';
      cargo.platformPublications = cargo.platformPublications.map((publication) => ({
        ...publication,
        status: publication.status === '未发布' ? publication.status : '已下架',
        updatedAt: '2026-08-19 11:49',
      }));
      ElMessage.success('大卡与满帮货源已同步下架');
    },
    refreshCargoSources() {
      this.cargoSources = this.cargoSources.map((cargo) =>
        cargo.sourceType === '客户系统'
          ? {
              ...cargo,
              sourceUpdatedAt: '2026-08-19 11:50',
              syncMessage: cargo.status === '已派车' ? '源系统已派车，平台货源保持下架' : '已监听源系统，未发现待同步变更',
            }
          : cargo,
      );
      ElMessage.success('客户系统货源状态同步完成');
    },
    importCargoFile(fileName: string) {
      const template = cargoSeedData[2]!;
      const id = `CG20260819${String(this.cargoSources.length + 1).padStart(4, '0')}`;
      this.cargoSources = [
        {
          ...template,
          id,
          externalCargoNo: `IMPORT-${Date.now()}`,
          sourceSystem: fileName,
          sourceUpdatedAt: '2026-08-19 11:51',
          createdAt: '2026-08-19 11:51',
          updatedAt: '2026-08-19 11:51',
          loadAddresses: template.loadAddresses.map((address) => ({ ...address })),
          unloadAddresses: template.unloadAddresses.map((address) => ({ ...address })),
          platformPublications: template.platformPublications.map((publication) => ({ ...publication, updatedAt: '2026-08-19 11:51' })),
          price: { ...template.price },
          tags: [...template.tags],
          truckLengths: [...template.truckLengths],
          truckTypes: [...template.truckTypes],
        },
        ...this.cargoSources,
      ];
      ElMessage.success(`已解析 ${fileName}，1 条货源需要补充卸货时间`);
    },
    updateImportedCargo(
      cargoId: string,
      updates: {
        cargoName: string;
        chargeUnit: StandardCargo['price']['chargeUnit'];
        findMode: StandardCargo['price']['findMode'];
        freightFen: number;
        loadAddress: string;
        loadTimeEnd: string;
        loadTimeStart: string;
        maxWeight?: number;
        minWeight?: number;
        packageType: string;
        remark: string;
        truckLength: string;
        truckNumber: number;
        truckType: string;
        unloadAddress: string;
        unloadTime: string;
      },
    ) {
      const cargo = this.cargoSources.find((item) => item.id === cargoId && item.sourceType === 'Excel导入');
      if (!cargo) {
        ElMessage.warning('仅支持编辑 Excel 导入货源');
        return;
      }
      const updatedAt = '2026-08-20 10:30';
      cargo.cargoName = updates.cargoName;
      cargo.packageType = updates.packageType;
      cargo.loadAddresses = cargo.loadAddresses.map((address, index) => (index === 0 ? { ...address, detail: updates.loadAddress } : address));
      cargo.unloadAddresses = cargo.unloadAddresses.map((address, index) => (index === 0 ? { ...address, detail: updates.unloadAddress } : address));
      cargo.loadTimeStart = updates.loadTimeStart;
      cargo.loadTimeEnd = updates.loadTimeEnd;
      cargo.unloadTime = updates.unloadTime;
      cargo.minWeight = updates.minWeight;
      cargo.maxWeight = updates.maxWeight;
      cargo.truckTypes = [updates.truckType];
      cargo.truckLengths = [updates.truckLength];
      cargo.truckNumber = updates.truckNumber;
      cargo.price = {
        ...cargo.price,
        findMode: updates.findMode,
        chargeUnit: updates.chargeUnit,
        freightFen: updates.freightFen,
        showPrice: updates.freightFen > 0,
      };
      cargo.remark = updates.remark;
      cargo.status = '发布中';
      cargo.syncStatus = '正常';
      cargo.syncMessage = 'Excel 货源已编辑，最新版本已重新发布';
      cargo.tags = cargo.tags.filter((tag) => !tag.startsWith('待补充'));
      cargo.updatedAt = updatedAt;
      cargo.sourceUpdatedAt = updatedAt;
      cargo.platformPublications = cargo.platformPublications.map((publication) => ({
        ...publication,
        externalCargoId: publication.externalCargoId || `${publication.platform === '大卡' ? 'DK' : 'MB'}${Date.now()}`,
        publishedAt: publication.publishedAt || updatedAt,
        status: '发布中',
        updatedAt,
      }));
      ElMessage.success('Excel 货源已保存，并重新发布到大卡及已配置的满帮账号');
    },
    updateQuoteStatus(quoteId: string, status: CargoQuote['status']) {
      const quote = this.cargoQuotes.find((item) => item.id === quoteId);
      if (!quote) return;
      quote.status = status;
      ElMessage.success(status === '已联系' ? '已记录联系状态' : '报价状态已更新');
    },
    dispatchQuote(quoteId: string) {
      const quote = this.cargoQuotes.find((item) => item.id === quoteId);
      if (!quote) return;
      quote.status = '已合作';
      const cargo = this.cargoSources.find((item) => item.id === quote.cargoId);
      if (cargo) {
        cargo.status = '已派车';
        cargo.updatedAt = '2026-08-19 11:53';
        cargo.platformPublications = cargo.platformPublications.map((publication) => ({
          ...publication,
          status: publication.status === '未发布' ? publication.status : '已下架',
          updatedAt: '2026-08-19 11:53',
        }));
      }
      ElMessage.success(`已确认 ${quote.driverName}，派车信息已回写客户业务系统并同步下架货源`);
    },
    importPrivateCapacityFile(fileName: string) {
      const id = `PC202608${String(this.privateCapacity.length + 1).padStart(3, '0')}`;
      this.privateCapacity = [
        {
          id,
          driverName: '周明',
          driverPhone: '150****6371',
          truckNo: '豫Q5***7',
          truckType: '高栏',
          truckLength: '13米',
          carrierName: '驻马店鸿运物流',
          baseCity: '河南·驻马店',
          routes: ['驻马店—北京', '驻马店—西安'],
          currentLocation: '驻马店市驿城区中原大道附近',
          positionTime: '2026-08-19 11:52',
          predictedDestination: '河南省驻马店市遂平县',
          destinationProbability: 58,
          predictedArrivalTime: '2026-08-19 12:35',
          loadState: '空载',
          loadStateUpdatedAt: '2026-08-19 11:20',
          source: 'Excel导入',
          updatedAt: '2026-08-19 11:54',
        },
        ...this.privateCapacity,
      ];
      ElMessage.success(`已从 ${fileName} 导入 1 条熟车运力`);
    },
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
    createImportedWaybillProject(name: string, importedCount: number, sourceFileNames: string[]) {
      const importedRiskCount = Math.max(1, Math.round(importedCount * 0.08));
      const sourceSummary = sourceFileNames.length > 1 ? `表格运单（${sourceFileNames.length} 个文件）` : `表格运单：${sourceFileNames[0] ?? '已导入文件'}`;
      this.projects = [
        {
          id: `PIMP${Date.now()}`,
          name,
          status: '已连接',
          sync: '刚刚',
          total: importedCount,
          risk: importedRiskCount,
          tmsUrl: sourceSummary,
          tmsUser: '文件导入',
          keyword: '导入运单',
          statusFilter: '在途',
          skillIds: ['spreadsheet-waybill', 'route-risk-expert', 'gps-trace-expert', 'parking-event-expert'],
        },
        ...this.projects,
      ];
      ElMessage.success(`已创建“${name}”并导入 ${importedCount} 条运单`);
    },
    mergeImportedWaybills(projectId: string, importedCount: number) {
      const targetProject = this.projects.find((project) => project.id === projectId);
      if (!targetProject) {
        ElMessage.warning('目标项目不存在，请重新选择');
        return;
      }
      const importedRiskCount = Math.max(1, Math.round(importedCount * 0.08));
      this.projects = this.projects.map((project) => {
        if (project.id !== projectId) return project;
        return {
          ...project,
          sync: '刚刚',
          total: project.total + importedCount,
          risk: project.risk + importedRiskCount,
          tmsUrl: project.tmsUrl.includes('表格运单') ? project.tmsUrl : `${project.tmsUrl} / 表格运单`,
          skillIds: Array.from(new Set([...(project.skillIds ?? []), 'spreadsheet-waybill'])),
        };
      });
      ElMessage.success(`已将 ${importedCount} 条运单合并到“${targetProject.name}”`);
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
      const emailDeliveryRequest = extractEmailDeliveryRequest(raw, this.agentMessages);
      const analysisReportRequest = extractAnalysisReportRequest(raw);
      const transportStatusRequest = extractTransportStatusRequest(raw);
      const vehiclePositionRequest = transportStatusRequest ? null : extractVehiclePositionRequest(raw);
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
      if (hasEmailDeliveryIntent(raw)) {
        if (!emailDeliveryRequest) {
          this.agentMessages = [
            ...next,
            { role: 'agent', text: '请补充有效的收件邮箱地址，例如 logistics.ops@example.com，我会将上一次处理结果整理后发送。' },
          ];
          this.agentInput = '';
          return;
        }
        this.startDelayedAgentProcess(next, createEmailDeliveryProcessMessage(emailDeliveryRequest), () => {
          ElMessage.success('邮件发送成功');
        });
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
        const matchedOrder = transportStatusRequest.waybill
          ? this.ordersSeed.find((order) => order.id.toUpperCase() === transportStatusRequest.waybill)
          : undefined;
        const plate =
          transportStatusRequest.plate ||
          matchedOrder?.plate ||
          transportDemoPlates[Math.floor(Math.random() * transportDemoPlates.length)] ||
          '沪A12345';
        const location = getTransportStatusDemo(plate);
        const processMessage = createTransportStatusProcessMessage(plate, transportStatusRequest.waybill, location);
        this.startDelayedAgentProcess(next, processMessage, () => {
          this.openExternalH5(processMessage.link!.url, processMessage.link!.title);
        });
        this.agentInput = '';
        return;
      }
      if (vehiclePositionRequest) {
        const plate =
          vehiclePositionRequest.plate ||
          transportDemoPlates[Math.floor(Math.random() * transportDemoPlates.length)] ||
          '沪A12345';
        const location = getVehiclePositionDemo(plate);
        const processMessage = createVehiclePositionProcessMessage(plate, location);
        this.startDelayedAgentProcess(next, processMessage, () => {
          this.openExternalH5(processMessage.link!.url, processMessage.link!.title);
        });
        this.agentInput = '';
        return;
      }
      if (raw.includes('在途预警') || raw.includes('真有风险')) {
        this.startDelayedAgentProcess(next, createWarningProcessMessage(warningResultText), () => {
          this.rightPanel = 'risk';
        });
        this.agentInput = '';
        return;
      }
      if (raw.includes('皖K55821')) {
        this.startDelayedAgentProcess(next, createOrderEventProcessMessage(orderEventResultText), () => {
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
