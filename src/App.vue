<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { message as antMessage, Modal } from 'ant-design-vue';
import AppIcon from '@packages/icon';
import { initialMessages, ordersSeed, projectsSeed, quickPrompts, timelineSeed } from '@/data/mock';
import type { AgentMessage, DownloadTask, Order, OrderStatus, Project, RiskLevel } from '@/types/domain';
import { getRiskOrders, parseAgentIntent, rankByField, riskTone, summarizeOrders } from '@/utils/logic';

type PageKey = 'agent' | 'orders' | 'risk' | 'detail' | 'analytics' | 'report' | 'projects' | 'downloads';
type RightPanelKey = 'overview' | 'risk' | 'report';

const navs: Array<{ id: PageKey; label: string; icon: string }> = [
  { id: 'agent', label: '智能体工作台', icon: 'robot' },
  { id: 'orders', label: '运单列表', icon: 'timeline' },
  { id: 'risk', label: '异常运单列表', icon: 'shield' },
  { id: 'detail', label: '运单详情与地图', icon: 'map' },
  { id: 'analytics', label: '统计归因', icon: 'analytics' },
  { id: 'report', label: '每日报告', icon: 'file' },
  { id: 'projects', label: '项目管理', icon: 'settings' },
  { id: 'downloads', label: '下载任务', icon: 'download' }
];

const rightPanelTabs: Array<{ key: RightPanelKey; label: string }> = [
  { key: 'overview', label: '今日概览' },
  { key: 'risk', label: '异常运单' },
  { key: 'report', label: '日报摘要' }
];

const projects = ref<Project[]>(projectsSeed);
const currentPage = ref<PageKey>('agent');
const currentProjectId = ref(projectsSeed[0].id);
const rightPanelKey = ref<RightPanelKey>('overview');
const currentUser = ref('alfred');
const isLoggedIn = ref(true);
const loginVisible = ref(false);
const projectModalVisible = ref(false);
const connectionVisible = ref(false);
const editingProjectId = ref<string | null>(null);
const selectedOrderId = ref(ordersSeed[0].id);
const agentInput = ref('');
const agentMessages = ref<AgentMessage[]>(initialMessages);
const orderRiskFilter = ref<RiskLevel | '全部'>('全部');
const orderStatusFilter = ref<OrderStatus | '全部'>('全部');
const orderKeyword = ref('');
const riskLevelFilter = ref<RiskLevel | '全部异常'>('全部异常');
const riskSourceFilter = ref('全部来源');
const riskKeyword = ref('');
const traceView = ref<'规则判断' | '智能体判断'>('规则判断');
const onlyStopEvents = ref(false);
const analyticsPeriod = ref<'日' | '周' | '月'>('日');
const downloadTasks = ref<DownloadTask[]>([]);

const themeConfig = {
  token: {
    colorPrimary: '#334155',
    colorInfo: '#334155',
    colorLink: '#334155',
    borderRadius: 6,
    fontSize: 14,
    wireframe: false
  },
  components: {
    Card: {
      borderRadiusLG: 8
    },
    Button: {
      borderRadius: 6
    }
  }
};

const trendData = [
  { date: '05-08', count: 8 },
  { date: '05-09', count: 12 },
  { date: '05-10', count: 9 },
  { date: '05-11', count: 15 },
  { date: '05-12', count: 17 },
  { date: '05-13', count: 13 },
  { date: '05-14', count: 20 }
];

const maxTrendCount = Math.max(...trendData.map((item) => item.count));

const loginForm = reactive({ username: 'alfred', password: '123456' });
const projectForm = reactive({
  name: '',
  tmsUrl: '',
  tmsUser: '',
  keyword: '',
  statusFilter: '在途' as OrderStatus | '全部',
  stopMinutes: 60,
  loadingOvertimeMinutes: 120,
  unloadingOvertimeMinutes: 90
});
const connectionForm = reactive({
  username: '',
  password: '',
  captcha: ''
});

const currentProject = computed(() => projects.value.find((item) => item.id === currentProjectId.value) || projects.value[0]);
const projectOrders = computed(() => ordersSeed.filter((item) => item.projectId === currentProject.value.id));
const riskOrders = computed(() => getRiskOrders(projectOrders.value));
const selectedOrder = computed(() => projectOrders.value.find((item) => item.id === selectedOrderId.value) || projectOrders.value[0] || ordersSeed[0]);

const overviewMetrics = computed(() => {
  const list = projectOrders.value;
  return {
    total: list.length,
    monitored: currentProject.value.total,
    risk: riskOrders.value.length,
    high: list.filter((item) => item.risk === '高风险').length,
    low: list.filter((item) => item.risk === '低风险').length,
    normal: list.filter((item) => item.risk === '无风险').length,
    abnormalRate: `${((riskOrders.value.length / Math.max(list.length, 1)) * 100).toFixed(1)}%`
  };
});

const filteredOrders = computed(() => {
  return projectOrders.value.filter((item) => {
    const riskMatched = orderRiskFilter.value === '全部' || item.risk === orderRiskFilter.value;
    const statusMatched = orderStatusFilter.value === '全部' || item.status === orderStatusFilter.value;
    const keyword = orderKeyword.value.trim();
    const keywordMatched =
      !keyword || `${item.id}${item.plate}${item.driver}${item.carrier}${item.route}${item.factory}`.includes(keyword);
    return riskMatched && statusMatched && keywordMatched;
  });
});

const filteredRiskOrders = computed(() => {
  return riskOrders.value.filter((item) => {
    const riskMatched = riskLevelFilter.value === '全部异常' || item.risk === riskLevelFilter.value;
    const sourceMatched = riskSourceFilter.value === '全部来源' || item.source.includes(riskSourceFilter.value);
    const keyword = riskKeyword.value.trim();
    const keywordMatched =
      !keyword || `${item.id}${item.plate}${item.driver}${item.carrier}${item.route}${item.issue}${item.issueType}`.includes(keyword);
    return riskMatched && sourceMatched && keywordMatched;
  });
});

const visibleEvents = computed(() => {
  const events = timelineSeed.filter((item) => item.orderId === selectedOrder.value.id);
  const fallback = events.length > 0 ? events : timelineSeed;
  return onlyStopEvents.value ? fallback.filter((item) => item.type === 'stop') : fallback;
});

const carrierRank = computed(() => rankByField(projectOrders.value, 'carrier'));
const routeRank = computed(() => rankByField(projectOrders.value, 'route'));
const factoryRank = computed(() => rankByField(projectOrders.value, 'factory'));

const orderColumns = [
  { title: '运单', key: 'order', width: 220 },
  { title: '线路', key: 'route', width: 240 },
  { title: '状态', key: 'status', width: 100 },
  { title: '风险', key: 'risk', width: 100 },
  { title: '异常说明', key: 'issue' },
  { title: '预计到达', dataIndex: 'eta', key: 'eta', width: 130 },
  { title: '操作', key: 'action', width: 110 }
];

const projectColumns = [
  { title: '项目', key: 'project' },
  { title: '连接', key: 'status', width: 120 },
  { title: '筛选条件', key: 'filter' },
  { title: '阈值', key: 'threshold' },
  { title: '数据', key: 'data', width: 150 },
  { title: '操作', key: 'action', width: 220 }
];

const downloadColumns = [
  { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
  { title: '范围', dataIndex: 'scope', key: 'scope' },
  { title: '创建人', dataIndex: 'creator', key: 'creator', width: 100 },
  { title: '状态', key: 'status', width: 180 },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 160 }
];

const reportSections = computed(() => [
  {
    title: '核心结论',
    text: `当前项目监控 ${currentProject.value.total} 单，今日异常 ${currentProject.value.risk} 单。异常率较昨日上升 2.1 个百分点，主要集中在安捷物流和上海工厂 → 广州仓线路。`
  },
  {
    title: '风险建议',
    text: '优先复核非目的地物流园长停和 GPS 高风险轨迹段；服务区长停经智能轨迹分析后可降级处理。'
  },
  {
    title: '阈值建议',
    text: `当前停车阈值 ${currentProject.value.thresholds.stopMinutes} 分钟，长途线路服务区误报较多，可按线路维度评估 75-90 分钟阈值。`
  }
]);

function statusColor(status: string) {
  if (status === '已连接' || status === '已完成' || status === '已到货') return 'success';
  if (status === '授权失效' || status === '高风险') return 'error';
  if (status === '连接中' || status === '在途') return 'processing';
  if (status === '低风险' || status === '装货中') return 'warning';
  return 'default';
}

function riskColor(risk: RiskLevel) {
  const tone = riskTone(risk);
  return tone === 'red' ? 'error' : tone === 'orange' ? 'warning' : 'success';
}

function switchProject(project: Project) {
  currentProjectId.value = project.id;
  currentPage.value = 'agent';
  rightPanelKey.value = 'overview';
  antMessage.success(`已切换到：${project.name}`);
}

function openOrderDetail(order: Order) {
  selectedOrderId.value = order.id;
  currentPage.value = 'detail';
}

function resetProjectForm() {
  Object.assign(projectForm, {
    name: '',
    tmsUrl: '',
    tmsUser: '',
    keyword: '',
    statusFilter: '在途',
    stopMinutes: 60,
    loadingOvertimeMinutes: 120,
    unloadingOvertimeMinutes: 90
  });
}

function openCreateProject() {
  editingProjectId.value = null;
  resetProjectForm();
  projectModalVisible.value = true;
}

function openEditProject(project: Project) {
  editingProjectId.value = project.id;
  Object.assign(projectForm, {
    name: project.name,
    tmsUrl: project.tmsUrl,
    tmsUser: project.tmsUser,
    keyword: project.keyword,
    statusFilter: project.statusFilter,
    stopMinutes: project.thresholds.stopMinutes,
    loadingOvertimeMinutes: project.thresholds.loadingOvertimeMinutes,
    unloadingOvertimeMinutes: project.thresholds.unloadingOvertimeMinutes
  });
  projectModalVisible.value = true;
}

function submitProject() {
  if (!projectForm.name || !projectForm.tmsUrl || !projectForm.tmsUser) {
    antMessage.warning('请填写项目名称、目标 TMS 地址和 TMS 登录用户');
    return;
  }

  if (editingProjectId.value) {
    projects.value = projects.value.map((item) =>
      item.id === editingProjectId.value
        ? {
            ...item,
            name: projectForm.name,
            tmsUrl: projectForm.tmsUrl,
            tmsUser: projectForm.tmsUser,
            keyword: projectForm.keyword,
            statusFilter: projectForm.statusFilter,
            thresholds: {
              stopMinutes: projectForm.stopMinutes,
              loadingOvertimeMinutes: projectForm.loadingOvertimeMinutes,
              unloadingOvertimeMinutes: projectForm.unloadingOvertimeMinutes
            }
          }
        : item
    );
    projectModalVisible.value = false;
    antMessage.success('项目已更新');
    return;
  }

  projectModalVisible.value = false;
  connectionForm.username = projectForm.tmsUser;
  connectionForm.password = '';
  connectionForm.captcha = '';
  connectionVisible.value = true;
}

function completeConnection() {
  if (!connectionForm.username || !connectionForm.password || !connectionForm.captcha) {
    antMessage.warning('请完成用户授权的目标 TMS 系统连接信息');
    return;
  }
  const next: Project = {
    id: `P${String(projects.value.length + 1).padStart(3, '0')}`,
    name: projectForm.name,
    status: '已连接',
    sync: '刚刚',
    total: 0,
    risk: 0,
    tmsUrl: projectForm.tmsUrl,
    tmsUser: projectForm.tmsUser,
    keyword: projectForm.keyword,
    statusFilter: projectForm.statusFilter,
    thresholds: {
      stopMinutes: projectForm.stopMinutes,
      loadingOvertimeMinutes: projectForm.loadingOvertimeMinutes,
      unloadingOvertimeMinutes: projectForm.unloadingOvertimeMinutes
    }
  };
  projects.value = [next, ...projects.value];
  currentProjectId.value = next.id;
  connectionVisible.value = false;
  antMessage.success('连接成功，项目已创建');
}

function deleteProject(project: Project) {
  Modal.confirm({
    title: '删除项目',
    content: `确认删除“${project.name}”？删除后不再同步该项目运单。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      projects.value = projects.value.filter((item) => item.id !== project.id);
      if (currentProjectId.value === project.id && projects.value.length) {
        currentProjectId.value = projects.value[0].id;
      }
      antMessage.success('项目已删除');
    }
  });
}

function createDownload(scope: string, stayOnCurrentPage = false) {
  const id = `D${Date.now()}`;
  const task: DownloadTask = {
    id,
    fileName: `${scope}.xlsx`,
    scope,
    creator: currentUser.value,
    status: '生成中',
    progress: 35,
    createdAt: '2026-05-14 10:18'
  };
  downloadTasks.value = [task, ...downloadTasks.value];
  if (!stayOnCurrentPage) {
    currentPage.value = 'downloads';
  }
  antMessage.success('已创建下载任务');
  window.setTimeout(() => {
    downloadTasks.value = downloadTasks.value.map((item) =>
      item.id === id ? { ...item, status: '已完成', progress: 100 } : item
    );
  }, 1100);
}

function runQuickPrompt(prompt: string) {
  agentInput.value = prompt;
  sendAgent(prompt, true);
}

function sendAgent(text = agentInput.value, stayOnWorkbench = false) {
  const content = text.trim();
  if (!content) return;

  const intent = parseAgentIntent(content);
  agentMessages.value.push({ id: `U${Date.now()}`, role: 'user', text: content });
  let reply = '';

  if (intent.intent === 'download') {
    reply = '已理解为“异常运单导出”任务，条件解析为：今日、当前项目、异常运单。已调用 export_exception_orders skill 创建 Excel 下载任务。';
    rightPanelKey.value = 'risk';
    createDownload('今日异常运单', stayOnWorkbench);
  } else if (intent.intent === 'report') {
    reply = '已拆解为统计汇总、异常归因、风险建议三步，并调用 generate_daily_report skill 生成日报摘要。右侧已切换到日报摘要。';
    rightPanelKey.value = 'report';
    currentPage.value = stayOnWorkbench ? 'agent' : 'report';
  } else if (intent.intent === 'analytics') {
    reply = '已调用 analyze_warning_trend skill，按时间、承运商、线路和工厂维度计算异常排名，并识别异常量上升原因。';
    currentPage.value = stayOnWorkbench ? 'agent' : 'analytics';
  } else if (intent.intent === 'threshold') {
    reply = `已读取当前停车阈值 ${currentProject.value.thresholds.stopMinutes} 分钟。结合服务区长停误报和非目的地物流园风险，建议长途线路单独设置 75-90 分钟阈值，非目的地物流园不降级。`;
    rightPanelKey.value = 'overview';
  } else if (intent.intent === 'detail') {
    reply = '已定位到沪A12345异常停车事件，并调用 analyze_order_trace skill 对比规则判断与智能轨迹分析结果。';
    selectedOrderId.value = 'WB20260509001';
    currentPage.value = stayOnWorkbench ? 'agent' : 'detail';
    rightPanelKey.value = 'risk';
  } else if (intent.intent === 'risk') {
    reply = '已按“今日 + 当前项目 + 高/低风险”筛选异常运单，高风险置顶，并生成简短总结。';
    rightPanelKey.value = 'risk';
    currentPage.value = stayOnWorkbench ? 'agent' : 'risk';
  } else {
    reply = `已调用 query_monitor_orders skill 查询监控运单。${summarizeOrders(filteredOrders.value)}`;
    currentPage.value = stayOnWorkbench ? 'agent' : 'orders';
  }

  agentMessages.value.push({ id: `A${Date.now()}`, role: 'agent', text: reply, skill: intent.skill });
  agentInput.value = '';
}

function generateRiskBrief() {
  agentMessages.value.push({
    id: `A${Date.now()}`,
    role: 'agent',
    text: `今日异常简报：${summarizeOrders(filteredRiskOrders.value)}建议优先处理高风险非目的地物流园长停和 GPS 高风险轨迹段。`,
    skill: 'generate_exception_brief'
  });
  currentPage.value = 'agent';
  rightPanelKey.value = 'risk';
}

function login() {
  if (!loginForm.username || !loginForm.password) {
    antMessage.warning('请输入账号和密码');
    return;
  }
  currentUser.value = loginForm.username;
  isLoggedIn.value = true;
  loginVisible.value = false;
  antMessage.success('登录成功');
}

function logout() {
  isLoggedIn.value = false;
  loginVisible.value = true;
}

function refreshProject(project: Project) {
  projects.value = projects.value.map((item) => (item.id === project.id ? { ...item, sync: '刚刚', status: '已连接' } : item));
  antMessage.success('连接状态已刷新');
}

function eventColor(type: string) {
  if (type === 'stop') return 'red';
  if (type === 'risk') return 'purple';
  if (type === 'arrive') return 'green';
  return 'gray';
}

function eventBadgeColor(type: string) {
  if (type === 'stop') return 'error';
  if (type === 'risk') return 'purple';
  if (type === 'arrive') return 'success';
  return 'default';
}
</script>

<template>
  <a-config-provider :theme="themeConfig">
  <a-layout class="min-h-screen bg-panel">
    <a-layout-header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
          <AppIcon name="truck" :size="21" />
        </div>
        <div>
          <div class="text-base font-semibold text-slate-900">在途物流智能体</div>
          <div class="text-xs text-slate-500">TMS 连接 · 在途监控 · 异常分析</div>
        </div>
      </div>

      <div class="flex items-center gap-3 text-sm text-slate-600">
        <a-tag :color="statusColor(currentProject.status)">{{ currentProject.status }}</a-tag>
        <span>{{ currentProject.name }}</span>
        <span class="flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1">
          <AppIcon name="user" :size="14" />
          {{ currentUser }}
        </span>
        <a-button v-if="isLoggedIn" size="small" @click="logout">
          <template #icon><AppIcon name="logout" :size="14" /></template>
          退出
        </a-button>
      </div>
    </a-layout-header>

    <a-layout>
      <a-layout-sider width="280" theme="light" class="border-r border-slate-200">
        <div class="p-4">
          <a-button type="primary" block size="large" @click="openCreateProject">
            <template #icon><AppIcon name="plus" :size="16" /></template>
            新建项目
          </a-button>

          <div class="mt-5">
            <div class="mb-2 text-xs font-semibold uppercase text-slate-400">项目</div>
            <div class="space-y-2">
              <button
                v-for="project in projects"
                :key="project.id"
                class="w-full rounded-md border p-3 text-left transition"
                :class="project.id === currentProjectId ? 'border-slate-300 bg-slate-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'"
                @click="switchProject(project)"
              >
                <div class="flex items-start justify-between gap-2">
                  <span class="text-sm font-medium text-slate-900">{{ project.name }}</span>
                  <a-tag :color="statusColor(project.status)" class="m-0">{{ project.status }}</a-tag>
                </div>
                <div class="mt-2 text-xs text-slate-500">
                  {{ project.total }} 单 · {{ project.risk }} 异常 · {{ project.sync }}
                </div>
              </button>
            </div>
          </div>

          <div class="mt-6">
            <div class="mb-2 text-xs font-semibold uppercase text-slate-400">菜单</div>
            <nav class="space-y-1">
              <button
                v-for="nav in navs"
                :key="nav.id"
                class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition"
                :class="currentPage === nav.id ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'"
                @click="currentPage = nav.id"
              >
                <AppIcon :name="nav.icon" :size="17" />
                {{ nav.label }}
              </button>
            </nav>
          </div>
        </div>
      </a-layout-sider>

      <a-layout-content class="p-5">
        <section v-if="currentPage === 'agent'" class="grid grid-cols-[minmax(520px,1fr)_minmax(520px,0.95fr)] gap-5">
          <a-card :body-style="{ padding: 0 }" class="agent-chat-card h-[calc(100vh-104px)] overflow-hidden">
            <div class="border-b border-slate-200 p-5">
              <div class="flex items-start gap-3">
                <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                  <AppIcon name="message" :size="18" />
                </div>
                <div>
                  <h1 class="m-0 text-xl font-semibold text-slate-900">与智能体对话</h1>
                  <p class="m-0 mt-1 text-sm text-slate-500">查询、筛选、分析、下载和报告生成</p>
                </div>
              </div>
            </div>

            <div class="flex-1 space-y-4 overflow-auto bg-slate-50 p-5">
              <div v-for="msg in agentMessages" :key="msg.id" class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
                <div
                  class="max-w-[76%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm"
                  :class="msg.role === 'user' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'"
                >
                  <div>{{ msg.text }}</div>
                  <a-tag v-if="msg.skill" color="blue" class="mt-2">skill: {{ msg.skill }}</a-tag>
                </div>
              </div>
            </div>

            <div class="border-t border-slate-200 bg-white p-4">
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <span class="mr-1 text-xs font-medium text-slate-500">推荐指令</span>
                <a-button v-for="prompt in quickPrompts" :key="prompt" class="prompt-chip" size="small" @click="runQuickPrompt(prompt)">
                  {{ prompt }}
                </a-button>
              </div>
              <div class="agent-composer">
                <a-textarea
                  v-model:value="agentInput"
                  :bordered="false"
                  :auto-size="{ minRows: 2, maxRows: 4 }"
                  placeholder="问在途异常、查运单、做归因、生成报告或下载 Excel"
                  @keydown.enter.exact.prevent="sendAgent()"
                />
                <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                  <div class="text-xs text-slate-400">Enter 发送，Shift Enter 换行</div>
                  <a-button type="primary" shape="circle" @click="sendAgent()">
                    <template #icon><AppIcon name="message" :size="15" /></template>
                  </a-button>
                </div>
              </div>
            </div>
          </a-card>

          <a-card :body-style="{ padding: 0 }" class="right-panel-card h-[calc(100vh-104px)] overflow-hidden">
            <div class="border-b border-slate-200 p-5">
              <div class="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 class="m-0 text-xl font-semibold text-slate-900">输出结果</h2>
                  <p class="m-0 mt-1 text-sm text-slate-500">预警汇总、运单结果、分析结论</p>
                </div>
                <a-tag color="success">实时同步</a-tag>
              </div>
              <div class="grid grid-cols-4 gap-3">
                <div class="rounded-md bg-slate-50 p-3">
                  <div class="text-xs text-slate-500">监控运单</div>
                  <div class="mt-1 text-2xl font-semibold">{{ currentProject.total }}</div>
                </div>
                <div class="rounded-md bg-red-50 p-3">
                  <div class="text-xs text-red-500">异常运单</div>
                  <div class="mt-1 text-2xl font-semibold text-red-600">{{ currentProject.risk }}</div>
                </div>
                <div class="rounded-md bg-red-50 p-3">
                  <div class="text-xs text-red-500">高风险</div>
                  <div class="mt-1 text-2xl font-semibold text-red-600">{{ overviewMetrics.high }}</div>
                </div>
                <div class="rounded-md bg-amber-50 p-3">
                  <div class="text-xs text-amber-600">低风险</div>
                  <div class="mt-1 text-2xl font-semibold text-amber-600">{{ overviewMetrics.low }}</div>
                </div>
              </div>
            </div>

            <div class="border-b border-slate-200 bg-white px-5 py-3">
              <div class="right-panel-tabs">
                <button
                  v-for="tab in rightPanelTabs"
                  :key="tab.key"
                  class="right-panel-tab-button"
                  :class="rightPanelKey === tab.key ? 'is-active' : ''"
                  @click="rightPanelKey = tab.key"
                >
                  {{ tab.label }}
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-hidden bg-slate-50 p-5">
              <div v-if="rightPanelKey === 'overview'" class="h-full overflow-auto pb-1">
                  <div class="grid grid-cols-2 gap-4">
                    <div class="rounded-md border border-slate-200 bg-white p-4">
                      <div class="mb-3 flex items-center justify-between">
                        <div class="text-sm font-semibold">近 7 天异常趋势</div>
                        <span class="text-xs text-slate-400">单位：单</span>
                      </div>
                      <div class="flex h-40 items-end gap-2 rounded-md bg-slate-50 px-3 pb-3 pt-5">
                        <div v-for="item in trendData" :key="item.date" class="flex flex-1 flex-col items-center gap-1">
                          <span class="text-[11px] font-medium text-slate-600">{{ item.count }}</span>
                          <div
                            class="w-full rounded-t bg-slate-700 transition"
                            :style="{ height: `${Math.max(18, (item.count / maxTrendCount) * 88)}px` }"
                          />
                          <span class="text-[10px] text-slate-400">{{ item.date }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="rounded-md border border-slate-200 bg-white p-4">
                      <div class="mb-3 text-sm font-semibold">风险来源</div>
                      <div class="space-y-3 text-sm">
                        <div>
                          <div class="mb-1 flex justify-between text-xs text-slate-500"><span>规则预警</span><span>9 单</span></div>
                          <a-progress :percent="72" :show-info="false" stroke-color="#111827" />
                        </div>
                        <div>
                          <div class="mb-1 flex justify-between text-xs text-slate-500"><span>智能轨迹分析</span><span>5 单</span></div>
                          <a-progress :percent="48" :show-info="false" stroke-color="#0f766e" />
                        </div>
                        <div>
                          <div class="mb-1 flex justify-between text-xs text-slate-500"><span>GPS 造假分析</span><span>3 单</span></div>
                          <a-progress :percent="32" :show-info="false" stroke-color="#7c3aed" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="mt-4 rounded-md border border-slate-200 bg-white p-4">
                    <div class="mb-3 flex items-center justify-between">
                      <div class="text-sm font-semibold">智能体结论</div>
                      <a-button type="link" size="small" @click="currentPage = 'analytics'">查看统计归因</a-button>
                    </div>
                    <div class="space-y-3 text-sm">
                      <a-alert type="error" show-icon message="今日异常率 13.3%，较昨日上升 2.1 个百分点。" />
                      <a-alert type="warning" show-icon message="异常主要集中在安捷物流和上海工厂 → 广州仓线路。" />
                      <a-alert type="info" show-icon message="建议优先复核非目的地物流园长停，以及 GPS 高风险轨迹段。" />
                    </div>
                  </div>

                  <div class="mt-4 grid grid-cols-2 gap-3">
                    <a-button type="primary" size="large" @click="currentPage = 'risk'">查看异常运单</a-button>
                    <a-button size="large" @click="currentPage = 'orders'">查看全部运单</a-button>
                  </div>
                </div>

              <div v-else-if="rightPanelKey === 'risk'" class="h-full overflow-auto pb-1">
                  <div class="space-y-3">
                    <button
                      v-for="order in riskOrders"
                      :key="order.id"
                      class="w-full rounded-md border border-slate-200 bg-white p-4 text-left transition hover:bg-slate-50"
                      @click="openOrderDetail(order)"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <div class="font-medium text-slate-900">{{ order.plate }} · {{ order.id }}</div>
                          <div class="mt-1 text-sm text-slate-500">{{ order.route }}</div>
                        </div>
                        <a-tag :color="riskColor(order.risk)">{{ order.risk }}</a-tag>
                      </div>
                      <div class="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{{ order.issue }}</div>
                    </button>
                  </div>
                  <a-button class="mt-4" type="primary" block size="large" @click="createDownload('今日异常运单')">
                    下载今日异常运单
                  </a-button>
                </div>

              <div v-else class="h-full overflow-auto pb-1">
                  <div class="rounded-md border border-slate-200 bg-white p-5">
                    <div class="mb-4 flex items-center justify-between">
                      <div>
                        <div class="text-sm font-semibold">每日异常报告</div>
                        <div class="mt-1 text-xs text-slate-500">2026-05-14 · {{ currentProject.name }}</div>
                      </div>
                      <a-tag color="processing">已生成</a-tag>
                    </div>
                    <div class="space-y-3 text-sm text-slate-700">
                      <div v-for="section in reportSections" :key="section.title" class="rounded-md bg-slate-50 p-3">
                        <b>{{ section.title }}：</b>{{ section.text }}
                      </div>
                    </div>
                  </div>
                  <div class="mt-4 grid grid-cols-2 gap-3">
                    <a-button size="large" @click="currentPage = 'report'">查看完整报告</a-button>
                    <a-button type="primary" size="large" @click="createDownload('今日报告明细')">下载报告明细</a-button>
                  </div>
                </div>
            </div>
          </a-card>
        </section>

        <section v-else-if="currentPage === 'orders'" class="space-y-4">
          <a-card>
            <div class="mb-4 flex items-start justify-between">
              <div>
                <h1 class="m-0 text-xl font-semibold">运单列表</h1>
                <p class="m-0 mt-1 text-sm text-slate-500">当前项目全部监控运单</p>
              </div>
              <a-button type="primary" @click="createDownload('当前运单列表筛选结果')">
                <template #icon><AppIcon name="download" :size="15" /></template>
                下载当前结果
              </a-button>
            </div>
            <div class="grid grid-cols-4 gap-3">
              <a-statistic title="全部" :value="overviewMetrics.total" />
              <a-statistic title="高风险" :value="overviewMetrics.high" value-style="color:#dc2626" />
              <a-statistic title="低风险" :value="overviewMetrics.low" value-style="color:#d97706" />
              <a-statistic title="无风险" :value="overviewMetrics.normal" value-style="color:#059669" />
            </div>
          </a-card>

          <a-card>
            <div class="mb-4 flex flex-wrap items-end gap-3">
              <a-select v-model:value="orderRiskFilter" class="w-36" :options="['全部', '高风险', '低风险', '无风险'].map((value) => ({ value, label: value }))" />
              <a-select v-model:value="orderStatusFilter" class="w-36" :options="['全部', '在途', '装货中', '已到货', '已完成'].map((value) => ({ value, label: value }))" />
              <a-input v-model:value="orderKeyword" class="max-w-md" placeholder="运单号 / 车牌 / 承运商 / 线路 / 工厂">
                <template #prefix><AppIcon name="search" :size="15" /></template>
              </a-input>
            </div>

            <a-table :columns="orderColumns" :data-source="filteredOrders" row-key="id" :pagination="{ pageSize: 8 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'order'">
                  <div class="font-medium">{{ record.id }}</div>
                  <div class="text-xs text-slate-500">{{ record.plate }} · {{ record.driver }}</div>
                </template>
                <template v-else-if="column.key === 'route'">
                  <div>{{ record.route }}</div>
                  <div class="text-xs text-slate-500">{{ record.carrier }} · {{ record.factory }}</div>
                </template>
                <template v-else-if="column.key === 'status'">
                  <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
                </template>
                <template v-else-if="column.key === 'risk'">
                  <a-tag :color="riskColor(record.risk)">{{ record.risk }}</a-tag>
                </template>
                <template v-else-if="column.key === 'issue'">
                  <div>{{ record.issue }}</div>
                  <div class="text-xs text-slate-400">{{ record.source }}</div>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-button size="small" @click="openOrderDetail(record)">查看详情</a-button>
                </template>
              </template>
            </a-table>
          </a-card>
        </section>

        <section v-else-if="currentPage === 'risk'" class="space-y-4">
          <a-card>
            <div class="mb-4 flex items-start justify-between">
              <div>
                <h1 class="m-0 text-xl font-semibold">异常运单列表</h1>
                <p class="m-0 mt-1 text-sm text-slate-500">高风险、低风险运单，含规则预警与智能轨迹分析来源</p>
              </div>
              <div class="flex gap-2">
                <a-button @click="generateRiskBrief">生成简报</a-button>
                <a-button type="primary" @click="createDownload('当前异常运单筛选结果')">下载当前结果</a-button>
              </div>
            </div>
            <a-alert
              show-icon
              type="warning"
              :message="`今日异常 ${filteredRiskOrders.length} 单，高风险 ${overviewMetrics.high} 单。非目的地物流园长停和 GPS 高风险轨迹段需要优先复核。`"
            />
          </a-card>

          <a-card>
            <div class="mb-4 flex flex-wrap items-end gap-3">
              <a-select v-model:value="riskLevelFilter" class="w-36" :options="['全部异常', '高风险', '低风险'].map((value) => ({ value, label: value }))" />
              <a-select v-model:value="riskSourceFilter" class="w-40" :options="['全部来源', '规则预警', '智能轨迹分析', 'GPS分析'].map((value) => ({ value, label: value }))" />
              <a-input v-model:value="riskKeyword" class="max-w-md" placeholder="搜索异常运单 / 车牌 / 异常类型 / 承运商">
                <template #prefix><AppIcon name="search" :size="15" /></template>
              </a-input>
            </div>
            <a-table :columns="orderColumns" :data-source="filteredRiskOrders" row-key="id" :pagination="{ pageSize: 8 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'order'">
                  <div class="font-medium">{{ record.id }}</div>
                  <div class="text-xs text-slate-500">{{ record.plate }} · {{ record.driver }}</div>
                </template>
                <template v-else-if="column.key === 'route'">
                  <div>{{ record.route }}</div>
                  <div class="text-xs text-slate-500">{{ record.carrier }} · {{ record.factory }}</div>
                </template>
                <template v-else-if="column.key === 'status'">
                  <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
                </template>
                <template v-else-if="column.key === 'risk'">
                  <a-tag :color="riskColor(record.risk)">{{ record.risk }}</a-tag>
                </template>
                <template v-else-if="column.key === 'issue'">
                  <div>{{ record.issueType }}</div>
                  <div class="text-xs text-slate-400">{{ record.source }}</div>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-button size="small" @click="openOrderDetail(record)">查看详情</a-button>
                </template>
              </template>
            </a-table>
          </a-card>
        </section>

        <section v-else-if="currentPage === 'detail'" class="space-y-4">
          <a-card>
            <div class="mb-4 flex items-start justify-between">
              <div>
                <h1 class="m-0 text-xl font-semibold">运单详情与地图轨迹</h1>
                <p class="m-0 mt-1 text-sm text-slate-500">{{ selectedOrder.id }} · {{ selectedOrder.plate }}</p>
              </div>
              <a-space>
                <a-tag :color="riskColor(selectedOrder.risk)">{{ selectedOrder.risk }}</a-tag>
                <a-button @click="currentPage = 'risk'">返回异常列表</a-button>
              </a-space>
            </div>
            <div class="grid grid-cols-6 gap-3">
              <div v-for="item in [
                ['运单', selectedOrder.id],
                ['车牌', selectedOrder.plate],
                ['司机', selectedOrder.driver],
                ['承运商', selectedOrder.carrier],
                ['状态', selectedOrder.status],
                ['预计到达', selectedOrder.eta]
              ]" :key="item[0]" class="rounded-md bg-slate-50 p-3">
                <div class="text-xs text-slate-500">{{ item[0] }}</div>
                <div class="mt-1 truncate text-sm font-semibold">{{ item[1] }}</div>
              </div>
            </div>
          </a-card>

          <div class="grid grid-cols-[1.15fr_0.85fr] gap-4">
            <a-card :body-style="{ padding: 0 }" class="overflow-hidden">
              <div class="flex items-center justify-between border-b border-slate-200 p-4">
                <div class="font-semibold">地图轨迹</div>
                <div class="flex gap-2">
                  <a-tag color="error">异常停车点 2</a-tag>
                  <a-tag color="purple">GPS 风险段 1</a-tag>
                </div>
              </div>
              <div class="route-map relative h-[590px] overflow-hidden p-5">
                <svg class="absolute inset-0 h-full w-full" viewBox="0 0 800 590" fill="none">
                  <path d="M90 110 C180 160, 240 190, 300 230 S440 310, 520 335 S630 390, 715 500" stroke="#111827" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 10" />
                  <path d="M520 335 C560 296, 610 286, 655 258" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 9" />
                </svg>
                <div class="map-label left-10 top-16">装货地 · {{ selectedOrder.origin }}</div>
                <div class="map-label bottom-14 right-10">卸货地 · {{ selectedOrder.destination }}</div>
                <div class="map-point left-[18%] top-[24%] bg-slate-900" />
                <div class="map-point left-[32%] top-[39%] bg-red-500" />
                <div class="map-point left-[52%] top-[55%] bg-red-600" />
                <div class="map-point left-[68%] top-[64%] bg-violet-600" />
                <div class="map-label left-[34%] top-[44%]">
                  <b>服务区长停</b><br />
                  POI：服务区 · 合理休息<br />
                  规则异常，智能体降级
                </div>
                <div class="map-label left-[54%] top-[58%]">
                  <b>非目的地物流园</b><br />
                  POI：物流园 · 不合理<br />
                  智能体高风险
                </div>
              </div>
            </a-card>

            <a-card>
              <div class="mb-4 flex items-center justify-between gap-2">
                <div class="font-semibold">事件 Timeline</div>
                <a-switch v-model:checked="onlyStopEvents" checked-children="停车" un-checked-children="全部" />
              </div>
              <a-segmented v-model:value="traceView" block :options="['规则判断', '智能体判断']" />
              <div class="mt-5 max-h-[520px] overflow-auto pr-1">
                <a-timeline class="event-timeline">
                  <a-timeline-item v-for="event in visibleEvents" :key="event.id" :color="eventColor(event.type)">
                    <div class="pb-4">
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium text-slate-900">{{ event.title }}</span>
                          <a-tag :color="eventBadgeColor(event.type)" class="m-0">{{ event.time }}</a-tag>
                        </div>
                        <span class="text-xs text-slate-500">{{ event.place }}</span>
                      </div>
                      <div class="mt-2 text-sm leading-6 text-slate-600">{{ event.desc }}</div>
                      <div v-if="event.poiType" class="mt-2 flex gap-2">
                        <a-tag color="blue">POI：{{ event.poiType }}</a-tag>
                        <a-tag :color="event.reasonable ? 'success' : 'error'">{{ event.reasonable ? '合理' : '不合理' }}</a-tag>
                      </div>
                      <div v-if="event.type === 'stop'" class="mt-2 border-l-2 border-slate-200 pl-3 text-xs leading-5 text-slate-600">
                        {{ traceView === '规则判断' ? event.rule : event.agent }}
                      </div>
                    </div>
                  </a-timeline-item>
                </a-timeline>
              </div>
            </a-card>
          </div>
        </section>

        <section v-else-if="currentPage === 'analytics'" class="space-y-4">
          <a-card>
            <div class="mb-4 flex items-start justify-between">
              <div>
                <h1 class="m-0 text-xl font-semibold">在途异常分析</h1>
                <p class="m-0 mt-1 text-sm text-slate-500">按时间、项目、承运商、线路、工厂和风险来源分析异常变化</p>
              </div>
              <a-segmented v-model:value="analyticsPeriod" :options="['日', '周', '月']" />
            </div>
            <div class="grid grid-cols-4 gap-3">
              <a-statistic :title="`${analyticsPeriod}异常`" :value="currentProject.risk" value-style="color:#dc2626" />
              <a-statistic title="高风险" :value="overviewMetrics.high" value-style="color:#dc2626" />
              <a-statistic title="低风险" :value="overviewMetrics.low" value-style="color:#d97706" />
              <a-statistic title="异常率" :value="overviewMetrics.abnormalRate" />
            </div>
          </a-card>

          <div class="grid grid-cols-2 gap-4">
            <a-card title="异常趋势">
              <div class="flex h-64 items-end gap-3 rounded-md bg-slate-50 p-4">
                <div v-for="(h, i) in [8, 12, 9, 15, 17, 13, 20]" :key="i" class="flex flex-1 flex-col items-center gap-2">
                  <div class="w-full rounded-t bg-slate-900" :style="{ height: `${h * 8}px` }" />
                  <span class="text-xs text-slate-400">{{ analyticsPeriod }}{{ i + 1 }}</span>
                </div>
              </div>
            </a-card>
            <a-card title="异常归因">
              <div class="space-y-3 text-sm text-slate-700">
                <a-alert type="error" show-icon message="安捷物流异常增量占比 42%，高于项目平均水平。" />
                <a-alert type="warning" show-icon message="上海工厂 → 广州仓线路服务区长停增加。" />
                <a-alert type="info" show-icon message="异常数量和异常率同步上升，非单纯运单量增加导致。" />
                <a-button type="primary" @click="currentPage = 'risk'">查看异常运单</a-button>
              </div>
            </a-card>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <a-card title="承运商异常排名">
              <div class="space-y-3">
                <div v-for="item in carrierRank" :key="item.name" class="flex items-center gap-3">
                  <div class="w-20 truncate text-sm text-slate-600">{{ item.name }}</div>
                  <a-progress class="flex-1" :percent="item.value * 25" :show-info="false" stroke-color="#111827" />
                  <div class="w-8 text-right text-sm font-medium">{{ item.value }}</div>
                </div>
              </div>
            </a-card>
            <a-card title="线路异常排名">
              <div class="space-y-3">
                <div v-for="item in routeRank" :key="item.name" class="flex items-center gap-3">
                  <div class="w-28 truncate text-sm text-slate-600">{{ item.name }}</div>
                  <a-progress class="flex-1" :percent="item.value * 25" :show-info="false" stroke-color="#0f766e" />
                  <div class="w-8 text-right text-sm font-medium">{{ item.value }}</div>
                </div>
              </div>
            </a-card>
            <a-card title="发货工厂异常排名">
              <div class="space-y-3">
                <div v-for="item in factoryRank" :key="item.name" class="flex items-center gap-3">
                  <div class="w-24 truncate text-sm text-slate-600">{{ item.name }}</div>
                  <a-progress class="flex-1" :percent="item.value * 25" :show-info="false" stroke-color="#7c3aed" />
                  <div class="w-8 text-right text-sm font-medium">{{ item.value }}</div>
                </div>
              </div>
            </a-card>
          </div>
        </section>

        <section v-else-if="currentPage === 'report'" class="space-y-4">
          <a-card>
            <div class="mb-5 flex items-start justify-between">
              <div>
                <h1 class="m-0 text-xl font-semibold">每日在途异常报告</h1>
                <p class="m-0 mt-1 text-sm text-slate-500">2026-05-14 · {{ currentProject.name }}</p>
              </div>
              <a-button type="primary" @click="createDownload('今日报告异常明细')">下载明细</a-button>
            </div>
            <div class="mb-5 grid grid-cols-4 gap-3">
              <a-statistic title="全部运单" :value="currentProject.total" />
              <a-statistic title="异常运单" :value="currentProject.risk" value-style="color:#dc2626" />
              <a-statistic title="高风险" :value="overviewMetrics.high" value-style="color:#dc2626" />
              <a-statistic title="低风险" :value="overviewMetrics.low" value-style="color:#d97706" />
            </div>
            <div class="space-y-3 text-sm text-slate-700">
              <div v-for="section in reportSections" :key="section.title" class="rounded-md bg-slate-50 p-4">
                <b>{{ section.title }}：</b>{{ section.text }}
              </div>
            </div>
            <div class="mt-6 flex gap-3">
              <a-button @click="currentPage = 'risk'">查看异常运单</a-button>
              <a-button @click="currentPage = 'orders'">查看全部运单</a-button>
            </div>
          </a-card>
        </section>

        <section v-else-if="currentPage === 'projects'" class="space-y-4">
          <a-card>
            <div class="mb-4 flex items-start justify-between">
              <div>
                <h1 class="m-0 text-xl font-semibold">项目管理</h1>
                <p class="m-0 mt-1 text-sm text-slate-500">项目连接、同步状态、监控条件和阈值配置</p>
              </div>
              <a-button type="primary" @click="openCreateProject">
                <template #icon><AppIcon name="plus" :size="15" /></template>
                新建项目
              </a-button>
            </div>
            <a-table :columns="projectColumns" :data-source="projects" row-key="id" :pagination="false">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'project'">
                  <div class="font-medium">{{ record.name }}</div>
                  <div class="text-xs text-slate-500">{{ record.tmsUrl }} · {{ record.tmsUser }}</div>
                </template>
                <template v-else-if="column.key === 'status'">
                  <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
                  <div class="mt-1 text-xs text-slate-500">{{ record.sync }}</div>
                </template>
                <template v-else-if="column.key === 'filter'">
                  <div>关键词：{{ record.keyword || '无' }}</div>
                  <div class="text-xs text-slate-500">状态：{{ record.statusFilter }}</div>
                </template>
                <template v-else-if="column.key === 'threshold'">
                  <div>停车 {{ record.thresholds.stopMinutes }} 分钟</div>
                  <div class="text-xs text-slate-500">
                    装车 {{ record.thresholds.loadingOvertimeMinutes }} / 卸车 {{ record.thresholds.unloadingOvertimeMinutes }}
                  </div>
                </template>
                <template v-else-if="column.key === 'data'">
                  <div>{{ record.total }} 单</div>
                  <div class="text-xs text-red-500">{{ record.risk }} 异常</div>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-space>
                    <a-button size="small" @click="refreshProject(record)">刷新</a-button>
                    <a-button size="small" @click="openEditProject(record)">编辑</a-button>
                    <a-button size="small" danger @click="deleteProject(record)">删除</a-button>
                  </a-space>
                </template>
              </template>
            </a-table>
          </a-card>
        </section>

        <section v-else-if="currentPage === 'downloads'" class="space-y-4">
          <a-card>
            <div class="mb-4 flex items-start justify-between">
              <div>
                <h1 class="m-0 text-xl font-semibold">下载任务</h1>
                <p class="m-0 mt-1 text-sm text-slate-500">Excel 文件生成与下载</p>
              </div>
              <a-button type="primary" @click="createDownload('今日异常运单')">新建下载</a-button>
            </div>
            <a-empty v-if="downloadTasks.length === 0" description="暂无下载任务" />
            <a-table v-else :columns="downloadColumns" :data-source="downloadTasks" row-key="id" :pagination="false">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'status'">
                  <a-progress v-if="record.status === '生成中'" :percent="record.progress" size="small" />
                  <a-tag v-else :color="record.status === '已完成' ? 'success' : 'error'">{{ record.status }}</a-tag>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-space>
                    <a-button size="small" type="primary" :disabled="record.status !== '已完成'">下载文件</a-button>
                    <a-button size="small" @click="createDownload(record.scope)">重新生成</a-button>
                  </a-space>
                </template>
              </template>
            </a-table>
          </a-card>
        </section>
      </a-layout-content>
    </a-layout>

    <a-modal v-model:open="projectModalVisible" :title="editingProjectId ? '编辑项目' : '新建项目'" width="760px" @ok="submitProject">
      <a-form layout="vertical">
        <div class="grid grid-cols-2 gap-4">
          <a-form-item label="项目名称" required>
            <a-input v-model:value="projectForm.name" placeholder="例如：华东干线在途监控" />
          </a-form-item>
          <a-form-item label="目标 TMS 地址" required>
            <a-input v-model:value="projectForm.tmsUrl" placeholder="https://tms.example.com" />
          </a-form-item>
          <a-form-item label="TMS 登录用户" required>
            <a-input v-model:value="projectForm.tmsUser" placeholder="目标 TMS 用户名" />
          </a-form-item>
          <a-form-item label="运单关键词筛选">
            <a-input v-model:value="projectForm.keyword" placeholder="当前版本单一关键词" />
          </a-form-item>
          <a-form-item label="运单状态筛选">
            <a-select v-model:value="projectForm.statusFilter" :options="['全部', '在途', '装货中', '已到货', '已完成'].map((value) => ({ value, label: value }))" />
          </a-form-item>
          <a-form-item label="停车阈值（分钟）">
            <a-input-number v-model:value="projectForm.stopMinutes" class="w-full" :min="10" :max="360" />
          </a-form-item>
          <a-form-item label="装车超时阈值（分钟）">
            <a-input-number v-model:value="projectForm.loadingOvertimeMinutes" class="w-full" :min="10" :max="480" />
          </a-form-item>
          <a-form-item label="卸车超时阈值（分钟）">
            <a-input-number v-model:value="projectForm.unloadingOvertimeMinutes" class="w-full" :min="10" :max="480" />
          </a-form-item>
        </div>
      </a-form>
      <a-alert
        v-if="!editingProjectId"
        type="info"
        show-icon
        message="首次创建项目需要完成用户授权的目标 TMS 系统连接。连接成功后，系统将持续同步目标 TMS 运单并加入在途监控。"
      />
    </a-modal>

    <a-modal v-model:open="connectionVisible" title="用户授权的目标 TMS 系统连接" @ok="completeConnection">
      <a-form layout="vertical">
        <a-form-item label="目标 TMS 用户名" required>
          <a-input v-model:value="connectionForm.username" />
        </a-form-item>
        <a-form-item label="目标 TMS 密码" required>
          <a-input-password v-model:value="connectionForm.password" />
        </a-form-item>
        <a-form-item label="验证码" required>
          <a-input v-model:value="connectionForm.captcha" placeholder="输入目标系统验证码" />
        </a-form-item>
      </a-form>
      <a-alert type="warning" show-icon message="该连接仅用于用户授权的数据同步，不在前端明文展示敏感凭据。" />
    </a-modal>

    <a-modal v-model:open="loginVisible" title="用户登录" :closable="false" :mask-closable="false" @ok="login">
      <a-form layout="vertical">
        <a-form-item label="账号">
          <a-input v-model:value="loginForm.username" />
        </a-form-item>
        <a-form-item label="密码">
          <a-input-password v-model:value="loginForm.password" @press-enter="login" />
        </a-form-item>
      </a-form>
    </a-modal>
  </a-layout>
  </a-config-provider>
</template>
