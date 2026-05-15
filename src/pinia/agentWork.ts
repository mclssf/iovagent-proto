import type { ChatMessage, DownloadTask, Order, PageId, Project, TimelineEvent } from '@/views/AgentWork/interface';

import { ElMessage } from 'element-plus';
import { defineStore } from 'pinia';

import { getRiskOrders, summarizeOrders } from '@/views/AgentWork/utils';

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRecentDateRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days + 1);
  return {
    start: formatDateInputValue(start),
    end: formatDateInputValue(end),
  };
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
  },
  {
    id: 'P003',
    name: '西南工厂发运项目',
    status: '连接中',
    sync: '同步中',
    total: 83,
    risk: 6,
    tmsUrl: 'https://tms.southwest.example.com',
    tmsUser: 'sw_factory',
    keyword: '西南工厂',
    statusFilter: '装货中',
  },
  {
    id: 'P004',
    name: '西南工厂发运项目',
    status: '连接中',
    sync: '同步中',
    total: 83,
    risk: 6,
    tmsUrl: 'https://tms.southwest.example.com',
    tmsUser: 'sw_factory',
    keyword: '西南工厂',
    statusFilter: '在途',
  },
  {
    id: 'P005',
    name: '西南工厂发运项目',
    status: '连接中',
    sync: '同步中',
    total: 83,
    risk: 6,
    tmsUrl: 'https://tms.southwest.example.com',
    tmsUser: 'sw_factory',
    keyword: '西南工厂',
    statusFilter: '已到货',
  },
];

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

export const quickPrompts = ['查看今日高风险运单', '查看所有运单', '只看沪A12345异常停车事件', '下载今天异常运单', '生成今日异常报告'];

export const rightPanelTabs: [string, string][] = [
  ['overview', '概览'],
  ['risk', '异常运单'],
  ['report', '日报摘要'],
];

/** 与 `linglongData` 一致：选项式 state / getters / actions */
export const agentWorkData = defineStore('agentWork', {
  state: () => {
    const defaultOrdersRange = getRecentDateRange(7);
    return {
      ordersStartDate: defaultOrdersRange.start,
      ordersEndDate: defaultOrdersRange.end,
      projects: [...projectsSeed] as Project[],
      currentProjectId: projectsSeed[0]!.id,
      showProjectModal: false,
      downloadTask: null as DownloadTask | null,
      selectedOrder: { ...ordersSeedData[0]! } as Order,
      agentInput: '',
      agentMessages: [
        { role: 'agent', text: '今日已同步 128 单，已加入在途监控 128 单。当前高风险 6 单、低风险 11 单。' },
        { role: 'agent', text: '发现 2 单非目的地物流园长停、1 单 GPS 轨迹疑似造假，建议优先复核。' },
      ] as ChatMessage[],
      rightPanel: 'overview',
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
    currentProject(state): Project {
      return state.projects.find((p) => p.id === state.currentProjectId) ?? state.projects[0]!;
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
      return ['overview', 'report', 'risk'].includes(state.rightPanel) ? state.rightPanel : 'overview';
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
      this.currentProjectId = p.id;
      ElMessage.success(`已切换到：${p.name}`);
    },
    openAddProjectModal() {
      this.showProjectModal = true;
    },
    closeAddProjectModal() {
      this.showProjectModal = false;
    },
    addDemoProject() {
      this.projects = [
        {
          id: `P00${this.projects.length + 1}`,
          name: '新建演示项目',
          status: '已连接',
          sync: '刚刚',
          total: 0,
          risk: 0,
          tmsUrl: 'https://tms.example.com',
          tmsUser: 'demo_user',
          keyword: '演示',
          statusFilter: '在途',
        },
        ...this.projects,
      ];
      this.closeAddProjectModal();
      ElMessage.success('项目创建成功');
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
      const defaultOrdersRange = getRecentDateRange(7);
      this.ordersStartDate = defaultOrdersRange.start;
      this.ordersEndDate = defaultOrdersRange.end;
    },
    /** 智能体对话：由调用方传入 `navigate`，避免 store 依赖 router */
    appendAgentExchange(text: string | undefined, navigate: (page: PageId) => void) {
      const raw = text ?? this.agentInput;
      if (!raw.trim()) return;
      const next: ChatMessage[] = [...this.agentMessages, { role: 'user', text: raw }];
      let reply = '已处理你的请求。';
      if (raw.includes('所有运单')) {
        reply = '已查询当前项目全部运单。';
        this.rightPanel = 'orders';
        navigate('orders');
      }
      if (raw.includes('异常') || raw.includes('高风险')) {
        reply = '已筛选今日高风险和低风险运单，高风险已置顶。';
        this.rightPanel = 'risk';
        navigate('risk');
      }
      if (raw.includes('停车') || raw.includes('沪A12345')) {
        reply = '已定位到沪A12345的异常停车事件。';
        this.rightPanel = 'detail';
        this.setSelectedOrder(this.ordersSeed[0]!);
        navigate('detail');
      }
      if (raw.includes('下载')) {
        reply = '已按“今日异常运单”创建 Excel 下载任务。';
        this.rightPanel = 'download';
        this.startDownloadTask('今日异常运单');
        navigate('downloads');
        ElMessage.success('已创建下载任务');
      }
      if (raw.includes('报告')) {
        reply = '已生成今日异常报告摘要。';
        this.rightPanel = 'report';
        navigate('report');
      }
      this.agentMessages = [...next, { role: 'agent', text: reply }];
      this.agentInput = '';
    },
  },
});
