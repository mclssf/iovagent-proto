<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { ElMessage } from 'element-plus';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { badgeToneClass, projectStatusTone } from '../utils';

type SkillType = 'analysis' | 'capacity' | 'data' | 'logistics' | 'operations';
type SkillTab = 'all' | SkillType;
type SkillUsage = '付费' | '免费' | '短信费' | '需登录' | '需连接';
type LoginAgentStatus = 'complete' | 'idle' | 'running' | 'waitingCode';
type LoginMessageRole = 'agent' | 'system' | 'user';

interface ProjectSkill {
  description: string;
  icon: string;
  id: string;
  name: string;
  type: SkillType;
  usage: SkillUsage;
}

interface LoginAgentMessage {
  id: number;
  role: LoginMessageRole;
  text: string;
}

const store = agentWorkData();
const { goPage } = useAgentWorkNav();
const route = useRoute();
const router = useRouter();
const maxProjectNameLength = 20;
const defaultLogisticsSkillIds = ['route-risk-expert', 'gps-trace-expert', 'parking-event-expert'];
const projectName = ref('');
const activeTab = ref<SkillTab>('all');
const selectedDataSkillId = ref('');
const selectedLogisticsSkillIds = ref<string[]>([...defaultLogisticsSkillIds]);
const selectedOperationsSkillIds = ref<string[]>([]);
const selectedCapacitySkillIds = ref<string[]>([]);
const selectedAnalysisSkillIds = ref<string[]>([]);
const authorizedSkillIds = ref<string[]>([]);
const connectingSkillExpectedTimes = ref<Record<string, string>>({});
const pendingLoginSkill = ref<ProjectSkill | null>(null);
const loginAgentStatus = ref<LoginAgentStatus>('idle');
const loginAgentMessages = ref<LoginAgentMessage[]>([]);
const loginVerificationCode = ref('');
const loginLogRef = ref<HTMLDivElement | null>(null);
const loginForm = reactive({
  systemAddress: '',
  username: '',
  password: '',
});

let loginAgentMessageId = 0;
let loginAgentTimers: number[] = [];

const tabs: { id: SkillTab; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'data', label: '数据员工' },
  { id: 'logistics', label: '在途专家' },
  { id: 'analysis', label: '经营分析参谋' },
  { id: 'operations', label: '运营助手' },
  { id: 'capacity', label: '运力与货源' },
];

const skillTypeLabels: Record<SkillType, string> = {
  analysis: '经营分析参谋',
  capacity: '运力与货源',
  data: '数据员工',
  logistics: '在途专家',
  operations: '运营助手',
};

const skills: ProjectSkill[] = [
  {
    id: 'jinyu-cement-tms',
    name: '金隅水泥TMS',
    type: 'data',
    description: '连接金隅水泥TMS，读取发运、车辆、承运商与在途状态数据。',
    usage: '需登录',
    icon: strokeIconPaths.zap,
  },
  {
    id: 'zhilian-shunda-tms',
    name: '智链顺达TMS',
    type: 'data',
    description: '连接智链顺达TMS，自动同步运输任务、轨迹状态和异常事件。',
    usage: '需登录',
    icon: strokeIconPaths.zap,
  },
  {
    id: 'jinmailang-logistics',
    name: '今麦郎物流管理',
    type: 'data',
    description: '接入今麦郎物流管理系统，汇总运单、线路和履约过程数据。',
    usage: '需登录',
    icon: strokeIconPaths.file,
  },
  {
    id: 'spreadsheet-waybill',
    name: '表格运单',
    type: 'data',
    description: '通过表格导入运单数据，适合快速演示、离线对账和批量补录场景。',
    usage: '免费',
    icon: strokeIconPaths.list,
  },
  {
    id: 'tms-sync-employee',
    name: 'TMS同步员工',
    type: 'data',
    description: '连接业务系统，自动同步运单、车辆、司机与在途状态。',
    usage: '需登录',
    icon: strokeIconPaths.zap,
  },
  {
    id: 'route-risk-expert',
    name: '在途风险专家',
    type: 'logistics',
    description: '结合线路、时效和历史履约表现，识别高优先级在途风险。',
    usage: '付费',
    icon: strokeIconPaths.shield,
  },
  {
    id: 'gps-trace-expert',
    name: '轨迹真实性专家',
    type: 'logistics',
    description: '分析轨迹断点、速度跳变和定位漂移，辅助判断GPS造假风险。',
    usage: '付费',
    icon: strokeIconPaths.map,
  },
  {
    id: 'parking-event-expert',
    name: '异常停车专家',
    type: 'logistics',
    description: '识别服务区、物流园、中转仓等停靠点，区分合理休息和高风险长停。',
    usage: '付费',
    icon: strokeIconPaths.truck,
  },
  {
    id: 'delivery-sla-expert',
    name: '到货时效专家',
    type: 'logistics',
    description: '评估预计到达时间、晚点风险和卸货超时，输出时效处置建议。',
    usage: '付费',
    icon: strokeIconPaths.gauge,
  },
  {
    id: 'logistics-route-planning',
    name: '物流路线规划',
    type: 'logistics',
    description: '结合起讫地、车型、限行和实时路况规划运输路线，输出里程、时效与备选方案。',
    usage: '付费',
    icon: strokeIconPaths.route,
  },
  {
    id: 'vehicle-location-query',
    name: '车辆定位查询',
    type: 'logistics',
    description: '查询车辆最新位置、定位时间、速度和方向，为运单补充实时车辆位置信息。',
    usage: '付费',
    icon: strokeIconPaths.locate,
  },
  {
    id: 'vehicle-trace-query',
    name: '轨迹查询',
    type: 'logistics',
    description: '查询车辆历史行驶轨迹、停靠点和里程，辅助核验线路、在途状态与异常事件。',
    usage: '付费',
    icon: strokeIconPaths.waypoints,
  },
  {
    id: 'waybill-data-completion',
    name: '运单补充',
    type: 'logistics',
    description: '识别运单缺失字段，补充车辆、司机、线路和运输节点等信息，提升运单数据完整性。',
    usage: '付费',
    icon: strokeIconPaths.filePlus,
  },
  {
    id: 'waybill-data-correction',
    name: '运单纠错',
    type: 'logistics',
    description: '校验运单字段与业务规则，发现并修正地址、时间、车辆和状态等异常数据。',
    usage: '付费',
    icon: strokeIconPaths.filePen,
  },
  {
    id: 'operations-logistics-sheet',
    name: '物流表格',
    type: 'operations',
    description: '自动生成和维护运输台账、异常清单与对账表，支持运营助手处理和结果沉淀。',
    usage: '免费',
    icon: strokeIconPaths.fileSpreadsheet,
  },
  {
    id: 'operations-sms-notification',
    name: '短信通知',
    type: 'operations',
    description: '遇到在途异常可以短信通知货主、司机、物流负责人等。',
    usage: '短信费',
    icon: strokeIconPaths.messageText,
  },
  {
    id: 'operations-logistics-weather',
    name: '物流天气',
    type: 'operations',
    description: '结合线路和车辆实时位置获取沿途天气预警，辅助提前安排绕行、时效与安全处置。',
    usage: '付费',
    icon: strokeIconPaths.cloudSun,
  },
  {
    id: 'operations-license-recognition',
    name: '证照识别',
    type: 'operations',
    description: '识别驾驶证、行驶证、运输证及回单等资料，自动提取字段并校验证照有效性。',
    usage: '付费',
    icon: strokeIconPaths.scanText,
  },
  {
    id: 'operations-wecom-suite',
    name: '企业微信套件',
    type: 'operations',
    description: '连接企业微信，将在途风险、协同待办和处置结果同步到群聊、消息与工作台。',
    usage: '需连接',
    icon: strokeIconPaths.messages,
  },
  {
    id: 'operations-feishu-suite',
    name: '飞书套件',
    type: 'operations',
    description: '连接飞书，将运单异常、协同任务和处置进展同步到消息、群组与多维表格。',
    usage: '需连接',
    icon: strokeIconPaths.panels,
  },
  {
    id: 'operations-dingtalk-suite',
    name: '钉钉套件',
    type: 'operations',
    description: '连接钉钉，将在途预警、审批待办和运营结果推送到群聊与工作通知。',
    usage: '需连接',
    icon: strokeIconPaths.bellRing,
  },
  {
    id: 'capacity-find-carrier',
    name: '找运力',
    type: 'capacity',
    description: '将货源信息发布至运力生态，供司机或承运方接单。',
    usage: '免费',
    icon: strokeIconPaths.speaker,
  },
  {
    id: 'capacity-quote-query',
    name: '报价查询',
    type: 'capacity',
    description: '查询司机或承运方的抢单及报价信息。',
    usage: '免费',
    icon: strokeIconPaths.receipt,
  },
  {
    id: 'capacity-cargo-search',
    name: '搜索货源',
    type: 'capacity',
    description: '搜索平台已发布的货源信息。',
    usage: '免费',
    icon: strokeIconPaths.packageSearch,
  },
  {
    id: 'capacity-private-fleet',
    name: '私有运力池',
    type: 'capacity',
    description: '管理企业自有及长期合作的司机、车辆和承运商资源，支持定向询价与派单。',
    usage: '付费',
    icon: strokeIconPaths.usersRound,
  },
];

const projectNameLength = computed(() => Array.from(projectName.value).length);
const filteredSkills = computed(() => (activeTab.value === 'all' ? skills : skills.filter((skill) => skill.type === activeTab.value)));
const selectedSkills = computed(() =>
  skills.filter(
    (skill) =>
      skill.id === selectedDataSkillId.value ||
      selectedLogisticsSkillIds.value.includes(skill.id) ||
      selectedOperationsSkillIds.value.includes(skill.id) ||
      selectedCapacitySkillIds.value.includes(skill.id) ||
      selectedAnalysisSkillIds.value.includes(skill.id),
  ),
);
const editingProjectId = computed(() => {
  const projectId = Array.isArray(route.query.projectId) ? route.query.projectId[0] : route.query.projectId;
  return typeof projectId === 'string' ? projectId : '';
});
const editingProject = computed(() => store.projects.find((project) => project.id === editingProjectId.value));
const isEditMode = computed(() => Boolean(editingProject.value));
const pageTitle = computed(() => (isEditMode.value ? '编辑项目' : '新建项目'));
const canGoNext = computed(() => projectName.value.trim().length > 0 && selectedSkills.value.length > 0);
const loginConfirmText = computed(() => {
  if (loginAgentStatus.value === 'complete') return '完成';
  if (loginAgentStatus.value === 'running') return '执行中';
  if (loginAgentStatus.value === 'waitingCode') return '等待验证码';
  return '确认';
});
const isLoginFormLocked = computed(() => loginAgentStatus.value !== 'idle');
const isPendingTmsSyncEmployee = computed(() => pendingLoginSkill.value?.id === 'tms-sync-employee');

function getProjectSkillIds() {
  const project = editingProject.value;
  if (!project) return [];
  if (project.skillIds?.length) return project.skillIds;
  return skills.filter((skill) => project.tmsUrl.includes(skill.name)).map((skill) => skill.id);
}

function initializeProjectForm() {
  const project = editingProject.value;
  if (!project && editingProjectId.value) {
    ElMessage.warning('未找到需要编辑的项目');
    goPage('projects');
    return;
  }
  if (!project) {
    projectName.value = '';
    selectedDataSkillId.value = '';
    selectedLogisticsSkillIds.value = [...defaultLogisticsSkillIds];
    selectedOperationsSkillIds.value = [];
    selectedCapacitySkillIds.value = [];
    selectedAnalysisSkillIds.value = [];
    authorizedSkillIds.value = [];
    return;
  }

  const projectSkillIds = getProjectSkillIds();
  const dataSkill = skills.find((skill) => projectSkillIds.includes(skill.id) && skill.type === 'data');
  projectName.value = project.name;
  selectedDataSkillId.value = dataSkill?.id ?? '';
  selectedLogisticsSkillIds.value = projectSkillIds.filter((id) => skills.some((skill) => skill.id === id && skill.type === 'logistics'));
  selectedOperationsSkillIds.value = projectSkillIds.filter((id) => skills.some((skill) => skill.id === id && skill.type === 'operations'));
  selectedCapacitySkillIds.value = projectSkillIds.filter((id) => skills.some((skill) => skill.id === id && skill.type === 'capacity'));
  selectedAnalysisSkillIds.value = projectSkillIds.filter((id) => skills.some((skill) => skill.id === id && skill.type === 'analysis'));
  authorizedSkillIds.value = dataSkill?.usage === '需登录' ? [dataSkill.id] : [];
}

function handleProjectNameInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const nextValue = Array.from(input.value).slice(0, maxProjectNameLength).join('');
  projectName.value = nextValue;
  input.value = nextValue;
}

function isSkillSelected(skill: ProjectSkill) {
  if (skill.type === 'data') return selectedDataSkillId.value === skill.id;
  if (skill.type === 'logistics') return selectedLogisticsSkillIds.value.includes(skill.id);
  if (skill.type === 'operations') return selectedOperationsSkillIds.value.includes(skill.id);
  if (skill.type === 'analysis') return selectedAnalysisSkillIds.value.includes(skill.id);
  return selectedCapacitySkillIds.value.includes(skill.id);
}

function isSkillConnecting(skill: ProjectSkill) {
  return Boolean(connectingSkillExpectedTimes.value[skill.id]);
}

function getSkillExpectedTime(skill: ProjectSkill) {
  return connectingSkillExpectedTimes.value[skill.id] ?? '';
}

function skillAvatarClass(skill: ProjectSkill) {
  if (skill.type === 'data') return 'bg-[#eef6f1] text-emerald-700';
  if (skill.type === 'operations') return 'bg-[#edf6f7] text-cyan-700';
  if (skill.type === 'analysis') return 'bg-amber-50 text-amber-700';
  if (skill.type === 'capacity') return 'bg-[#eef4fb] text-blue-700';
  return 'bg-[#eef2f7] text-slate-700';
}

function toggleSkill(skill: ProjectSkill) {
  if (isSkillConnecting(skill)) return;
  if (skill.type === 'data') {
    if (selectedDataSkillId.value === skill.id) {
      selectedDataSkillId.value = '';
      return;
    }
    if (skill.usage === '需登录' && !authorizedSkillIds.value.includes(skill.id)) {
      pendingLoginSkill.value = skill;
      resetLoginAgentState();
      loginForm.systemAddress = '';
      loginForm.username = '';
      loginForm.password = '';
      return;
    }
    selectedDataSkillId.value = skill.id;
    return;
  }

  const selectedSkillIds =
    skill.type === 'logistics'
      ? selectedLogisticsSkillIds
      : skill.type === 'operations'
        ? selectedOperationsSkillIds
        : skill.type === 'analysis'
          ? selectedAnalysisSkillIds
          : selectedCapacitySkillIds;
  if (selectedSkillIds.value.includes(skill.id)) {
    selectedSkillIds.value = selectedSkillIds.value.filter((id) => id !== skill.id);
    return;
  }
  selectedSkillIds.value = [...selectedSkillIds.value, skill.id];
}

function clearLoginAgentTimers() {
  loginAgentTimers.forEach((timer) => window.clearTimeout(timer));
  loginAgentTimers = [];
}

function scrollLoginAgentLog() {
  nextTick(() => {
    if (!loginLogRef.value) return;
    loginLogRef.value.scrollTop = loginLogRef.value.scrollHeight;
  });
}

function appendLoginAgentMessage(role: LoginMessageRole, text: string) {
  loginAgentMessageId += 1;
  loginAgentMessages.value = [...loginAgentMessages.value, { id: loginAgentMessageId, role, text }];
  scrollLoginAgentLog();
}

function scheduleLoginAgentStep(delay: number, callback: () => void) {
  const timer = window.setTimeout(() => {
    loginAgentTimers = loginAgentTimers.filter((id) => id !== timer);
    callback();
  }, delay);
  loginAgentTimers.push(timer);
}

function resetLoginAgentState() {
  clearLoginAgentTimers();
  loginAgentStatus.value = 'idle';
  loginAgentMessages.value = [];
  loginVerificationCode.value = '';
}

function startSkillLoginAgent() {
  if (!pendingLoginSkill.value) return;
  loginAgentStatus.value = 'running';
  loginAgentMessages.value = [];
  loginVerificationCode.value = '';
  appendLoginAgentMessage('system', `已接收 ${pendingLoginSkill.value.name} 登录任务，开始调用 Playwright 自动执行。`);
  scheduleLoginAgentStep(400, () => appendLoginAgentMessage('agent', '创建隔离浏览器上下文，打开目标 TMS 登录页。'));
  scheduleLoginAgentStep(1000, () => appendLoginAgentMessage('agent', '识别用户名、密码输入框，已使用当前表单凭据填充。'));
  scheduleLoginAgentStep(1600, () => appendLoginAgentMessage('agent', '点击登录按钮，等待目标系统返回校验结果。'));
  scheduleLoginAgentStep(2300, () => appendLoginAgentMessage('agent', '检测到二次校验：需要输入手机验证码。'));
  scheduleLoginAgentStep(2400, () => {
    loginAgentStatus.value = 'waitingCode';
    scrollLoginAgentLog();
  });
}

function submitLoginVerificationCode() {
  if (loginAgentStatus.value !== 'waitingCode') return;
  if (!loginVerificationCode.value.trim()) {
    ElMessage.warning('请输入验证码');
    return;
  }
  appendLoginAgentMessage('user', '已输入验证码，继续执行登录流程。');
  loginVerificationCode.value = '';
  loginAgentStatus.value = 'running';
  scheduleLoginAgentStep(500, () => appendLoginAgentMessage('agent', '验证码已回填并提交，正在校验登录状态。'));
  scheduleLoginAgentStep(1200, () => appendLoginAgentMessage('agent', '登录成功，已进入运单列表页面。'));
  scheduleLoginAgentStep(1900, () => appendLoginAgentMessage('agent', '执行数据获取映射 skill，检查运单字段与标准数据集语义。'));
  scheduleLoginAgentStep(2600, () => {
    appendLoginAgentMessage('system', '数据员工验证完成，登录授权已就绪。');
    loginAgentStatus.value = 'complete';
    scrollLoginAgentLog();
  });
}

function finishSkillLogin() {
  if (!pendingLoginSkill.value) return;
  const skillId = pendingLoginSkill.value.id;
  authorizedSkillIds.value = Array.from(new Set([...authorizedSkillIds.value, skillId]));
  selectedDataSkillId.value = skillId;
  pendingLoginSkill.value = null;
  resetLoginAgentState();
  ElMessage.success('数据员工登录验证完成');
}

function formatExpectedConnectionTime() {
  const expectedAt = new Date(Date.now() + 30 * 60 * 1000);
  return `${String(expectedAt.getHours()).padStart(2, '0')}:${String(expectedAt.getMinutes()).padStart(2, '0')}`;
}

function startTmsInitialConnection() {
  if (!pendingLoginSkill.value) return;
  const skillId = pendingLoginSkill.value.id;
  const projectNumber = store.currentProjectId.replace(/\D/g, '') || '1';
  const loginUser = window.localStorage.getItem('iovagent_login_user')?.trim() ?? '';
  store.submitTmsSyncCustomer({
    enterpriseCid: `CID${projectNumber.padStart(8, '0')}`,
    userPhone: /^1\d{10}$/.test(loginUser) ? loginUser : '13800138000',
    systemUrl: loginForm.systemAddress,
    account: loginForm.username,
    password: loginForm.password,
  });
  connectingSkillExpectedTimes.value = {
    ...connectingSkillExpectedTimes.value,
    [skillId]: formatExpectedConnectionTime(),
  };
  authorizedSkillIds.value = Array.from(new Set([...authorizedSkillIds.value, skillId]));
  selectedDataSkillId.value = skillId;
  pendingLoginSkill.value = null;
  resetLoginAgentState();
  loginForm.systemAddress = '';
  loginForm.username = '';
  loginForm.password = '';
  ElMessage.success('TMS同步员工已开始初次连接');
}

function confirmSkillLogin() {
  if (!pendingLoginSkill.value) return;
  if (loginAgentStatus.value === 'complete') {
    finishSkillLogin();
    return;
  }
  if (loginAgentStatus.value !== 'idle') return;
  if (isPendingTmsSyncEmployee.value && !loginForm.systemAddress.trim()) {
    ElMessage.warning('请填写需要连接的系统地址');
    return;
  }
  if (!loginForm.username.trim() || !loginForm.password.trim()) {
    ElMessage.warning('请填写用户名和密码');
    return;
  }
  if (isPendingTmsSyncEmployee.value) {
    startTmsInitialConnection();
    return;
  }
  startSkillLoginAgent();
}

function cancelSkillLogin() {
  resetLoginAgentState();
  pendingLoginSkill.value = null;
  loginForm.systemAddress = '';
  loginForm.username = '';
  loginForm.password = '';
}

function cancelCreate() {
  const from = Array.isArray(route.query.from) ? route.query.from[0] : route.query.from;
  if (typeof from === 'string' && from.startsWith('/index') && from !== route.fullPath) {
    router.replace(from);
    return;
  }
  goPage('projects');
}

function goNext() {
  const cleanName = projectName.value.trim();
  if (!cleanName) {
    ElMessage.warning('请输入项目名称');
    return;
  }
  if (selectedSkills.value.length === 0) {
    ElMessage.warning('请选择至少一项项目技能');
    return;
  }
  const skillNames = selectedSkills.value.map((skill) => skill.name);
  const skillIds = selectedSkills.value.map((skill) => skill.id);
  if (editingProject.value) {
    store.updateSkillProject(editingProject.value.id, cleanName, skillNames, skillIds);
  } else {
    store.addSkillProject(cleanName, skillNames, skillIds);
  }
  goPage('projects');
}

onMounted(() => {
  initializeProjectForm();
});

onBeforeUnmount(() => {
  clearLoginAgentTimers();
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
    <div class="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4">
      <div class="flex items-center gap-2.5">
        <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
          <Icon :svg="strokeIconPaths.plus" :size="16" />
        </div>
        <h1 class="text-sm font-semibold leading-5 text-slate-950">{{ pageTitle }}</h1>
      </div>
      <button type="button" class="rounded-md border border-[#deded9] px-3 py-1.5 text-xs text-slate-600 hover:bg-[#f7f7f5]" @click="cancelCreate">
        取消
      </button>
    </div>

    <div class="shrink-0 border-b border-[#e2e2dc] px-4 py-3">
      <label class="mb-1.5 block text-xs font-medium text-slate-600" for="project-name">项目名称</label>
      <div class="flex items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
        <input
          id="project-name"
          :value="projectName"
          class="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          placeholder="请输入项目名称，不超过20个汉字"
          @input="handleProjectNameInput"
        />
        <span class="ml-3 text-xs" :class="projectNameLength >= maxProjectNameLength ? 'text-amber-600' : 'text-slate-400'">
          {{ projectNameLength }}/{{ maxProjectNameLength }}
        </span>
      </div>
      <div v-if="editingProject" class="mt-3 grid grid-cols-4 gap-2 rounded-md border border-[#deded9] bg-[#fbfbfa] p-2">
        <div class="rounded-md bg-white px-3 py-2">
          <div class="text-[11px] leading-4 text-slate-500">当前连接状态</div>
          <span class="mt-1 inline-flex rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass(projectStatusTone(editingProject.status))">
            {{ editingProject.status }}
          </span>
        </div>
        <div class="rounded-md bg-white px-3 py-2">
          <div class="text-[11px] leading-4 text-slate-500">最近同步</div>
          <div class="mt-1 truncate text-sm font-medium text-slate-900">{{ editingProject.sync }}</div>
        </div>
        <div class="rounded-md bg-white px-3 py-2">
          <div class="text-[11px] leading-4 text-slate-500">历史数据</div>
          <div class="mt-1 truncate text-sm font-medium text-slate-900">{{ editingProject.total }} 单 · {{ editingProject.risk }} 异常</div>
        </div>
        <div class="rounded-md bg-white px-3 py-2">
          <div class="text-[11px] leading-4 text-slate-500">筛选条件</div>
          <div class="mt-1 truncate text-sm font-medium text-slate-900">{{ editingProject.keyword || '无关键词' }} · {{ editingProject.statusFilter }}</div>
        </div>
      </div>
    </div>

    <section class="m-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-[#f5f5f3]">
      <div class="flex shrink-0 items-center justify-between gap-3 px-5 pt-4">
        <div class="flex min-w-0 items-baseline gap-4">
          <h2 class="text-lg font-semibold leading-6 text-slate-950">数字人技能</h2>
          <span class="text-sm font-semibold leading-5 text-slate-400">技能库</span>
        </div>
        <div class="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">已选 {{ selectedSkills.length }} 项</div>
      </div>

      <div class="flex shrink-0 items-center px-5 pt-3">
        <div class="flex w-full flex-wrap items-center gap-2">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium transition"
            :class="activeTab === tab.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-5 pt-4">
        <div v-if="filteredSkills.length" class="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <button
            v-for="skill in filteredSkills"
            :key="skill.id"
            type="button"
            class="group flex min-h-[172px] flex-col rounded-lg border bg-white p-4 text-left shadow-sm transition"
            :class="
              isSkillConnecting(skill)
                ? 'cursor-wait border-[#deded9] bg-[#fafaf8] opacity-80 shadow-none'
                : isSkillSelected(skill)
                ? 'border-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.85),0_10px_22px_rgba(15,23,42,0.08)]'
                : 'border-transparent hover:border-[#deded9] hover:shadow-md'
            "
            :disabled="isSkillConnecting(skill)"
            @click="toggleSkill(skill)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-start gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :class="skillAvatarClass(skill)">
                  <Icon :svg="skill.icon" :size="17" />
                </span>
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold leading-5 text-slate-950">{{ skill.name }}</span>
                  <span class="mt-1 block truncate text-xs leading-4 text-slate-500">{{ skillTypeLabels[skill.type] }}</span>
                </span>
              </div>
              <span
                v-if="!isSkillConnecting(skill)"
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                :class="isSkillSelected(skill) ? 'border-slate-900 bg-slate-900 text-white' : 'border-[#deded9] text-transparent group-hover:text-slate-300'"
              >
                <Icon :svg="strokeIconPaths.check" :size="14" />
              </span>
            </div>

            <p class="mt-4 line-clamp-2 flex-1 text-xs leading-6 text-slate-600">{{ skill.description }}</p>

            <div v-if="isSkillConnecting(skill)" class="mt-3 flex min-h-6 items-center gap-1.5 text-[11px] font-medium leading-4 text-slate-500">
              <Icon :svg="strokeIconPaths.refresh" :size="13" svg-class="shrink-0 animate-spin text-slate-400" />
              <span>初次连接中...预计智能体解析在{{ getSkillExpectedTime(skill) }}完成</span>
            </div>

            <div v-else class="mt-3 flex flex-wrap items-center gap-2">
              <span class="rounded-md bg-[#f1f1ef] px-2 py-1 text-xs leading-4 text-slate-600">
                {{ skillTypeLabels[skill.type] }}
              </span>
              <span class="rounded-md bg-[#f1f1ef] px-2 py-1 text-xs leading-4 text-slate-600">
                {{ skill.usage }}
              </span>
              <span
                class="rounded-md px-2 py-1 text-xs font-medium leading-4"
                :class="isSkillSelected(skill) ? 'bg-slate-900 text-white' : 'bg-[#f1f1ef] text-slate-600'"
              >
                {{ isSkillSelected(skill) ? '已选择' : '未选择' }}
              </span>
            </div>
          </button>
        </div>
        <div v-else class="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
            <Icon :svg="strokeIconPaths.list" :size="17" />
          </span>
          <span class="mt-3 text-sm font-medium text-slate-600">暂无技能</span>
        </div>
      </div>

      <div class="mx-5 mb-5 flex h-14 shrink-0 items-center justify-between gap-3 rounded-lg bg-white px-4 shadow-sm">
        <div class="min-w-0 truncate text-xs text-slate-500">
          {{ selectedSkills.length ? selectedSkills.map((skill) => skill.name).join('、') : '请选择项目技能' }}
        </div>
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-medium transition"
          :class="canGoNext ? 'bg-slate-900 text-white hover:bg-slate-800' : 'cursor-not-allowed bg-slate-200 text-slate-400'"
          :disabled="!canGoNext"
          @click="goNext"
        >
          完成
        </button>
      </div>
    </section>

    <div v-if="pendingLoginSkill" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
      <div class="w-full max-w-[560px] overflow-hidden rounded-md border border-[#deded9] bg-white shadow-xl">
        <div class="flex h-12 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div class="flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
              <Icon :svg="strokeIconPaths.user" :size="16" />
            </div>
            <h2 class="text-sm font-semibold leading-5 text-slate-950">{{ pendingLoginSkill.name }}</h2>
          </div>
          <button type="button" class="rounded-md p-1 text-slate-400 hover:bg-[#f7f7f5] hover:text-slate-700" @click="cancelSkillLogin">
            <Icon :svg="strokeIconPaths.x" :size="16" />
          </button>
        </div>
        <div class="space-y-4 px-4 py-4">
          <label v-if="isPendingTmsSyncEmployee" class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-600">需要连接的系统地址：</span>
            <input
              v-model.trim="loginForm.systemAddress"
              :disabled="isLoginFormLocked"
              type="url"
              class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
              placeholder="请输入 TMS 系统登录地址"
            />
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">用户名</span>
              <input
                v-model.trim="loginForm.username"
                :disabled="isLoginFormLocked"
                class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                placeholder="请输入用户名"
              />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">密码</span>
              <input
                v-model.trim="loginForm.password"
                :disabled="isLoginFormLocked"
                type="password"
                class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                placeholder="请输入密码"
              />
            </label>
          </div>

          <div class="flex items-center justify-between gap-3">
            <div v-if="isPendingTmsSyncEmployee" class="min-w-0 text-xs leading-5 text-slate-500">
              大卡数字人将会加密存储您提供的账密，并提供
              <a
                href="/legal/information-protection-commitment.html"
                target="_blank"
                rel="noreferrer"
                class="font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >信息保护承诺书</a>
            </div>
            <div v-else class="min-w-0 text-xs leading-5 text-slate-500">
              Agent 将使用 Playwright 自动打开目标系统并完成登录。
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-[#deded9] px-3 py-1.5 text-sm text-slate-600 hover:bg-[#f7f7f5]"
                @click="cancelSkillLogin"
              >
                取消
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-sm font-medium transition"
                :class="
                  loginAgentStatus === 'complete'
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : loginAgentStatus === 'idle'
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'cursor-not-allowed bg-slate-200 text-slate-500'
                "
                :disabled="loginAgentStatus === 'running' || loginAgentStatus === 'waitingCode'"
                @click="confirmSkillLogin"
              >
                {{ loginConfirmText }}
              </button>
            </div>
          </div>

          <div v-if="loginAgentStatus !== 'idle'" class="overflow-hidden rounded-md border border-[#deded9] bg-[#fbfbfa]">
            <div class="flex h-9 items-center justify-between border-b border-[#e2e2dc] px-3">
              <span class="text-xs font-medium text-slate-700">Agent 执行过程</span>
              <span
                class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                :class="loginAgentStatus === 'complete' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'"
              >
                {{ loginAgentStatus === 'complete' ? '已完成' : loginAgentStatus === 'waitingCode' ? '等待输入' : '执行中' }}
              </span>
            </div>
            <div ref="loginLogRef" class="h-52 space-y-2 overflow-y-auto p-3">
              <div
                v-for="message in loginAgentMessages"
                :key="message.id"
                class="flex"
                :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
              >
                <div
                  class="max-w-[86%] rounded-md px-3 py-2 text-xs leading-5"
                  :class="
                    message.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : message.role === 'system'
                        ? 'border border-blue-100 bg-blue-50 text-blue-700'
                        : 'border border-[#e2e2dc] bg-white text-slate-700'
                  "
                >
                  {{ message.text }}
                </div>
              </div>
            </div>
            <div v-if="loginAgentStatus === 'waitingCode'" class="flex items-center gap-2 border-t border-[#e2e2dc] bg-white p-3">
              <input
                v-model.trim="loginVerificationCode"
                class="h-9 min-w-0 flex-1 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
                placeholder="请输入验证码 / 手机验证码"
                @keydown.enter.prevent="submitLoginVerificationCode"
              />
              <button
                type="button"
                class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                @click="submitLoginVerificationCode"
              >
                提交
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
