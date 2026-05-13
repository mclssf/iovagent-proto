import type { AgentMessage, Order, Project, TimelineEvent } from '@/types/domain';

export const projectsSeed: Project[] = [
  {
    id: 'P001',
    name: '华东干线在途监控',
    status: '已连接',
    sync: '2分钟前',
    total: 128,
    risk: 17,
    tmsUrl: 'https://tms.example.com/east',
    tmsUser: 'east.ops',
    keyword: '华东',
    statusFilter: '在途',
    thresholds: { stopMinutes: 60, loadingOvertimeMinutes: 120, unloadingOvertimeMinutes: 90 }
  },
  {
    id: 'P002',
    name: '冷链城配项目',
    status: '授权失效',
    sync: '昨天 23:10',
    total: 64,
    risk: 9,
    tmsUrl: 'https://cold-chain.example.com',
    tmsUser: 'cold.ops',
    keyword: '冷链',
    statusFilter: '全部',
    thresholds: { stopMinutes: 45, loadingOvertimeMinutes: 90, unloadingOvertimeMinutes: 75 }
  },
  {
    id: 'P003',
    name: '西南工厂发运项目',
    status: '连接中',
    sync: '同步中',
    total: 83,
    risk: 6,
    tmsUrl: 'https://tms.example.com/southwest',
    tmsUser: 'sw.factory',
    keyword: '西南',
    statusFilter: '装货中',
    thresholds: { stopMinutes: 70, loadingOvertimeMinutes: 150, unloadingOvertimeMinutes: 100 }
  }
];

export const ordersSeed: Order[] = [
  {
    id: 'WB20260509001',
    projectId: 'P001',
    plate: '沪A12345',
    driver: '张师傅',
    carrier: '安捷物流',
    route: '上海工厂 → 广州仓',
    factory: '上海一厂',
    origin: '上海一厂',
    destination: '广州仓',
    status: '在途',
    risk: '高风险',
    issue: '异常停车 / GPS疑似造假',
    issueType: '非目的地物流园长停',
    source: '规则预警 + GPS分析',
    updated: '5分钟前',
    eta: '明日 02:30',
    departTime: '10:28',
    delayMinutes: 40,
    stopCount: 2,
    gpsRiskScore: 86
  },
  {
    id: 'WB20260509002',
    projectId: 'P001',
    plate: '苏B88231',
    driver: '李师傅',
    carrier: '远恒运输',
    route: '苏州仓 → 杭州仓',
    factory: '苏州仓',
    origin: '苏州仓',
    destination: '杭州仓',
    status: '已到货',
    risk: '低风险',
    issue: '卸车超时',
    issueType: '卸车超时',
    source: '规则预警',
    updated: '13分钟前',
    eta: '已到达',
    departTime: '07:20',
    arriveTime: '12:10',
    delayMinutes: 0,
    stopCount: 1,
    gpsRiskScore: 18
  },
  {
    id: 'WB20260509003',
    projectId: 'P001',
    plate: '粤B90877',
    driver: '王师傅',
    carrier: '安捷物流',
    route: '深圳仓 → 厦门仓',
    factory: '深圳仓',
    origin: '深圳仓',
    destination: '厦门仓',
    status: '在途',
    risk: '无风险',
    issue: '暂无',
    issueType: '无',
    source: '无',
    updated: '18分钟前',
    eta: '今日 21:40',
    departTime: '11:05',
    delayMinutes: 0,
    stopCount: 0,
    gpsRiskScore: 4
  },
  {
    id: 'WB20260509004',
    projectId: 'P001',
    plate: '川A66520',
    driver: '赵师傅',
    carrier: '顺达货运',
    route: '成都工厂 → 重庆仓',
    factory: '成都工厂',
    origin: '成都工厂',
    destination: '重庆仓',
    status: '装货中',
    risk: '高风险',
    issue: '装车超时',
    issueType: '装车超时',
    source: '规则预警',
    updated: '21分钟前',
    eta: '待发车',
    departTime: '待发车',
    delayMinutes: 120,
    stopCount: 0,
    gpsRiskScore: 0
  },
  {
    id: 'WB20260509005',
    projectId: 'P001',
    plate: '浙C77812',
    driver: '陈师傅',
    carrier: '中联物流',
    route: '宁波港 → 合肥仓',
    factory: '宁波港',
    origin: '宁波港',
    destination: '合肥仓',
    status: '在途',
    risk: '低风险',
    issue: '服务区长停',
    issueType: '服务区长停',
    source: '智能轨迹分析',
    updated: '34分钟前',
    eta: '今日 23:20',
    departTime: '09:56',
    delayMinutes: 10,
    stopCount: 1,
    gpsRiskScore: 12
  },
  {
    id: 'WB20260509006',
    projectId: 'P001',
    plate: '鲁D43190',
    driver: '刘师傅',
    carrier: '远恒运输',
    route: '青岛仓 → 济南仓',
    factory: '青岛仓',
    origin: '青岛仓',
    destination: '济南仓',
    status: '已完成',
    risk: '无风险',
    issue: '暂无',
    issueType: '无',
    source: '无',
    updated: '46分钟前',
    eta: '已完成',
    departTime: '06:40',
    arriveTime: '11:32',
    delayMinutes: 0,
    stopCount: 0,
    gpsRiskScore: 0
  }
];

export const timelineSeed: TimelineEvent[] = [
  { id: 1, orderId: 'WB20260509001', type: 'normal', title: '运单创建', time: '08:05', place: '目标 TMS', desc: '系统同步到运单，进入项目运单池。' },
  { id: 2, orderId: 'WB20260509001', type: 'normal', title: '加入在途监控', time: '08:07', place: '华东干线在途监控', desc: '符合项目筛选条件，进入在途监控范围。' },
  { id: 3, orderId: 'WB20260509001', type: 'normal', title: '到达装货地', time: '09:10', place: '上海一厂', desc: '车辆进入装货地围栏。' },
  { id: 4, orderId: 'WB20260509001', type: 'normal', title: '发车离场', time: '10:28', place: '上海一厂', desc: '车辆离开装货地围栏，进入在途阶段。' },
  {
    id: 5,
    orderId: 'WB20260509001',
    type: 'stop',
    title: '异常停车事件',
    time: '13:42 - 15:21',
    place: 'G60 高速服务区附近',
    desc: '停车 99 分钟，超过项目配置阈值。',
    rule: '停车时长 99 分钟 > 阈值 60 分钟，命中停车异常。',
    agent: '停车点接近服务区，结合长途线路和同线路历史停车习惯，判定为低风险合理休息。',
    poiType: '服务区',
    reasonable: true
  },
  {
    id: 6,
    orderId: 'WB20260509001',
    type: 'stop',
    title: '异常停车事件',
    time: '17:06 - 18:40',
    place: '非目的地物流园',
    desc: '停车 94 分钟，POI 识别为物流园，非计划卸货地。',
    rule: '停车时长 94 分钟 > 阈值 60 分钟，命中停车异常。',
    agent: '停车点为非目的地物流园，距离卸货地 184km，存在疑似非目的地卸货风险。',
    poiType: '物流园',
    reasonable: false
  },
  { id: 7, orderId: 'WB20260509001', type: 'risk', title: 'GPS 风险事件', time: '19:12', place: '沪昆高速附近', desc: '轨迹出现断点和速度异常，外部算法输出高风险。' },
  { id: 8, orderId: 'WB20260509001', type: 'arrive', title: '预计到达卸货地', time: '明日 02:30', place: '广州仓', desc: '按当前速度预计存在 40 分钟延误风险。' }
];

export const quickPrompts = [
  '查看今日高风险运单',
  '查看所有运单',
  '只看沪A12345异常停车事件',
  '下载今天异常运单',
  '生成今日异常报告'
];

export const initialMessages: AgentMessage[] = [
  {
    id: 'M001',
    role: 'agent',
    text: '今日已同步 128 单，已加入在途监控 128 单。当前高风险 6 单、低风险 11 单。'
  },
  {
    id: 'M002',
    role: 'agent',
    text: '发现 2 单非目的地物流园长停、1 单 GPS 轨迹疑似造假，建议优先复核。'
  }
];
