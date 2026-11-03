<script lang="ts" setup>
import { migrateCapacitySkillIds } from '@/pinia/capacitySkills';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { ElMessage } from 'element-plus';
import AppDialog from '@/components/AppDialog.vue';

import { agentWorkData } from '@/pinia/agentWork';
import { useAgentOpsStore } from '@/pinia/agentOps';
import type { WechatEmployeeSource } from '@/pinia/dataEmployeeSkills';
import { createProjectMailbox, emailDemoMailbox, mailboxSkill } from '@/pinia/projectMailboxes';
import type { ProjectMailbox } from '../interface';
import WechatEmployeeDetails from '../component/wechatEmployeeDetails.comp.vue';

import { strokeIconPaths } from '../strokeIconPaths';
import { vehiclePredictionSkill } from '../vehiclePredictionSkill';
import { clone, p1ConfigError, usePhase1 } from '@/pinia/phase1';
import { phaseSkills } from '@/views/Phase1/catalog';
import type { P1Config, P1SkillId } from '../interface';
import MonitoringConfigDialog from '@/views/Phase1/MonitoringConfigDialog.vue';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { badgeToneClass, projectStatusTone } from '../utils';
import { monitorDefinitions } from '../dailyTasks';

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
  wechatSource?: WechatEmployeeSource;
}

interface LoginAgentMessage {
  id: number;
  role: LoginMessageRole;
  text: string;
}

const store = agentWorkData();
const monitoring = usePhase1();
const monitoringDraft = ref<P1Config>();
const configuringMonitor = ref<P1SkillId>();
function openMonitorConfig(id: P1SkillId) {
  monitoringDraft.value ??= monitoring.config(editingProjectId.value);
  monitoringDraft.value.selectedSkills = phaseSkills.map(skill => skill.id);
  configuringMonitor.value = id;
}
const agentOpsStore = useAgentOpsStore();
const { goPage } = useAgentWorkNav();
const route = useRoute();
const router = useRouter();
const maxProjectNameLength = 20;
const projectName = ref('');
const projectNameInput = ref<HTMLInputElement | null>(null);
const activeTab = ref<SkillTab>('all');
const mailboxDraft = ref<ProjectMailbox | null>(null);
const authorizedSkillIds = ref<string[]>([]);
const connectingSkillExpectedTimes = ref<Record<string, string>>({});
const pendingLoginSkill = ref<ProjectSkill | null>(null);
const viewingWechatSkillId = ref('');
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

const defaultSkills: ProjectSkill[] = [
  ...phaseSkills.map(skill => ({ id: skill.id, name: skill.name, type: 'logistics' as const, description: skill.description, usage: '免费' as const, icon: strokeIconPaths[skill.icon] })),
  { id: vehiclePredictionSkill.id, name: vehiclePredictionSkill.name, type: 'logistics', description: vehiclePredictionSkill.description, usage: '付费', icon: strokeIconPaths.locate },
  ...monitorDefinitions.filter((monitor) => monitor.id !== 'parking').map((monitor): ProjectSkill => ({
    id: monitor.skillId,
    name: monitor.name,
    type: 'logistics',
    description: monitor.description,
    usage: monitor.required ? '免费' : '付费',
    icon: strokeIconPaths[monitor.icon],
  })),
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
    description: '通过表格导入运单数据，适合离线对账和批量补录场景。',
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
    id: 'huadong-cargo-connector',
    name: '华东货源对接员工',
    type: 'data',
    description: '抓取客户系统待外调货源并映射标准字段，持续监听修改、取消和派车状态。',
    usage: '需登录',
    icon: strokeIconPaths.packageSearch,
  },
  {
    id: 'huadong-dispatch-writeback',
    name: '华东派车回写员工',
    type: 'data',
    description: '将确认合作的司机、车辆和成交信息回写客户系统，完成指派并触发平台下架。',
    usage: '需登录',
    icon: strokeIconPaths.truck,
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
    ...mailboxSkill,
    type: 'operations',
    usage: '需连接',
    icon: strokeIconPaths.messageText,
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
    id: 'capacity-cargo-normalization',
    name: '货源解析',
    type: 'capacity',
    description: '解析 Excel 或连接器采集的货源并映射标准字段，缺失必填项时通过多轮对话补齐。',
    usage: '免费',
    icon: strokeIconPaths.fileSpreadsheet,
  },
  {
    id: 'capacity-cargo-publish',
    name: '货源发布',
    type: 'capacity',
    description: '将标准货源发布到大卡和已配置的满帮账号，并统一处理跨平台修改与下架。',
    usage: '免费',
    icon: strokeIconPaths.speaker,
  },
  {
    id: 'capacity-quote-collection',
    name: '报价抢单',
    type: 'capacity',
    description: '采集大卡与满帮的司机抢单、报价和电话联系反馈，形成统一候选运力列表。',
    usage: '免费',
    icon: strokeIconPaths.receipt,
  },
  {
    id: 'capacity-private-fleet',
    name: '私有运力池',
    type: 'capacity',
    description: '通过 Excel 维护企业熟车，叠加车辆位置、目的地预测和当前装卸状态，支持筛选与定向询价。',
    usage: '付费',
    icon: strokeIconPaths.usersRound,
  },
];

const skills = computed<ProjectSkill[]>(() => [
  ...agentOpsStore.visibleDataEmployeeSkills
    .filter((skill) => skill.sourceType === 'wechat' && skill.wechatSource)
    .map((skill): ProjectSkill => ({
      id: skill.id,
      name: skill.name,
      type: 'data',
      description: skill.description,
      usage: '免费',
      icon: strokeIconPaths.messages,
      wechatSource: skill.wechatSource,
    })),
  ...defaultSkills,
]);
const viewingWechatSkill = computed(() => skills.value.find((skill) => skill.id === viewingWechatSkillId.value));
const projectNameLength = computed(() => Array.from(projectName.value).length);
const filteredSkills = computed(() => (activeTab.value === 'all' ? skills.value : skills.value.filter((skill) => skill.type === activeTab.value)));
const editingProjectId = computed(() => {
  const projectId = Array.isArray(route.query.projectId) ? route.query.projectId[0] : route.query.projectId;
  return typeof projectId === 'string' ? projectId : '';
});
const editingProject = computed(() => store.projects.find((project) => project.id === editingProjectId.value));
const isEditMode = computed(() => Boolean(editingProject.value));
const pageTitle = computed(() => (isEditMode.value ? '编辑项目' : '新建项目'));
const canGoNext = computed(() => projectName.value.trim().length > 0);
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
  if (project.skillIds?.length) return migrateCapacitySkillIds(project.skillIds);
  return skills.value.filter((skill) => !skill.wechatSource && project.tmsUrl.includes(skill.name)).map((skill) => skill.id);
}

function initializeProjectForm() {
  const project = editingProject.value;
  mailboxDraft.value = project?.mailbox ? { ...project.mailbox } : null;
  if (!project && editingProjectId.value) {
    ElMessage.warning('未找到需要编辑的项目');
    goPage('projects');
    return;
  }
  if (!project) {
    projectName.value = '';
    authorizedSkillIds.value = [];
    return;
  }

  projectName.value = project.name;
  authorizedSkillIds.value = project.authorizedDataSkillIds ? [...project.authorizedDataSkillIds] : skills.value.filter(skill => getProjectSkillIds().includes(skill.id) && skill.type === 'data' && skill.usage === '需登录').map(skill => skill.id);
}

function handleProjectNameInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const nextValue = Array.from(input.value).slice(0, maxProjectNameLength).join('');
  projectName.value = nextValue;
  input.value = nextValue;
}

function getSkillDisplayName(skill: ProjectSkill) {
  return skill.wechatSource ? `${skill.name}（${skill.wechatSource.groupName}）` : skill.name;
}

function closeWechatDetails() {
  viewingWechatSkillId.value = '';
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

function connectSkill(skill: ProjectSkill) {
  if (skill.type !== 'data' || skill.usage !== '需登录' || isSkillConnecting(skill) || authorizedSkillIds.value.includes(skill.id)) return;
  pendingLoginSkill.value = skill;
  resetLoginAgentState();
  loginForm.systemAddress = '';
  loginForm.username = '';
  loginForm.password = '';
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
  appendLoginAgentMessage('system', `已接收 ${pendingLoginSkill.value.name} 登录任务，开始调用浏览器自动执行。`);
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
  scheduleLoginAgentStep(1900, () => appendLoginAgentMessage('agent', '执行数据获取映射 Skill，检查运单字段映射结果。'));
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

function bindMailbox() {
  mailboxDraft.value = createProjectMailbox();
}

function viewMailboxTask() {
  const project = editingProject.value;
  if (!project?.mailbox) return;
  store.switchProject(project);
  goPage('dailyTasks', { projectId: project.id, taskId: `email-order-${project.id}` });
}

function goNext() {
  const cleanName = projectName.value.trim();
  if (!cleanName) {
    ElMessage.warning('请输入项目名称');
    return;
  }
  const skillNames = skills.value.map(getSkillDisplayName);
  const skillIds = skills.value.map(skill => skill.id);
  const draft = clone(monitoringDraft.value ?? monitoring.config(editingProjectId.value));
  draft.selectedSkills = phaseSkills.map(skill => skill.id);
  const validation = p1ConfigError(draft);
  if (validation) { ElMessage.warning(validation); return; }
  if (editingProject.value && monitoring.config(editingProjectId.value).version !== draft.version) { ElMessage.warning('配置已更新，请重新打开项目'); return; }
  if (editingProject.value) {
    store.updateSkillProject(editingProject.value.id, cleanName, skillNames, skillIds, mailboxDraft.value ?? undefined, authorizedSkillIds.value);
  } else {
    store.addSkillProject(cleanName, skillNames, skillIds, mailboxDraft.value ?? undefined, authorizedSkillIds.value);
  }
  monitoring.saveConfig(editingProjectId.value || store.currentProjectId, draft, editingProjectId.value ? draft.version : undefined);
  goPage('projects');
}

onMounted(async () => {
  initializeProjectForm();
  await nextTick();
  if (!isEditMode.value) projectNameInput.value?.focus();
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

    <div v-if="editingProject" class="shrink-0 border-b border-[#e2e2dc] px-4 py-3">
      <div class="grid grid-cols-2 gap-2 rounded-md border border-[#deded9] bg-[#fbfbfa] p-2 sm:grid-cols-4">
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
          <template v-for="skill in filteredSkills" :key="skill.id">
          <article
            v-if="skill.wechatSource"
            class="flex min-h-[172px] min-w-0 flex-col overflow-hidden rounded-lg border border-[#deded9] bg-white p-4 transition hover:border-slate-400"
            :aria-label="getSkillDisplayName(skill)"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 flex-col text-left outline-none hover:bg-[#fbfcfa] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-800"
              :aria-label="`查看${getSkillDisplayName(skill)}详情`"
              @click="viewingWechatSkillId = skill.id"
            >
              <span class="flex items-start gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :class="skillAvatarClass(skill)">
                  <Icon :svg="skill.icon" :size="17" />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-semibold leading-5 text-slate-950">{{ skill.name }}</span>
                  <span class="mt-1 block text-xs leading-4 text-slate-500">数据员工</span>
                </span>
              </span>
              <span class="mt-4 block break-words text-xs leading-6 text-slate-600">{{ skill.description }}</span>
            </button>
            <div class="skill-card-footer">
              <div class="skill-card-tags text-xs leading-4">
                <span class="rounded-md bg-[#eef6f1] px-2 py-1 text-emerald-700">微信消息</span>
                <span
                  class="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
                  :class="skill.wechatSource.onlineStatus === 'online' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></span>
                  {{ skill.wechatSource.onlineStatus === 'online' ? '微信在线' : '微信离线' }}
                </span>
              </div>
              <button
                type="button"
                class="skill-card-action"
                :aria-label="`查看${getSkillDisplayName(skill)}详情`"
                @click="viewingWechatSkillId = skill.id"
              >查看详情</button>
            </div>
          </article>
          <article
            v-else-if="skill.id === mailboxSkill.id"
            aria-label="邮箱连接"
            class="flex min-h-[172px] min-w-0 flex-col rounded-lg border bg-white p-4 text-left shadow-sm"
            :class="mailboxDraft ? 'border-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.85)]' : 'border-[#deded9]'"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-start gap-3">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :class="skillAvatarClass(skill)">
                  <Icon :svg="skill.icon" :size="17" />
                </span>
                <div><h3 class="text-sm font-semibold leading-5 text-slate-950">{{ skill.name }}</h3><p class="mt-1 text-xs leading-4 text-slate-500">运营助手</p></div>
              </div>
              <span v-if="mailboxDraft" class="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">已绑定</span>
              <span v-else class="shrink-0 rounded-md bg-[#f1f1ef] px-2 py-1 text-xs font-medium text-slate-600">未绑定</span>
            </div>
            <p class="mt-4 text-xs leading-6 text-slate-600">{{ skill.description }}</p>
            <p class="mt-2 break-all text-sm font-medium text-slate-900">{{ mailboxDraft?.address ?? emailDemoMailbox }}</p>
            <p class="mt-1 text-xs leading-5 text-slate-500">项目邮箱 · 订单邮件处理</p>
            <div class="skill-card-footer">
              <span class="min-w-0 flex-1 text-xs leading-5 text-slate-500">{{ mailboxDraft && !editingProject?.mailbox ? '点击完成，保存邮箱绑定' : mailboxDraft ? '邮箱数据源已绑定' : '绑定项目邮箱数据源' }}</span>
              <button v-if="!mailboxDraft" type="button" class="skill-card-action is-primary" @click="bindMailbox">绑定邮箱</button>
              <button v-else type="button" :disabled="!editingProject?.mailbox" class="skill-card-action" @click="viewMailboxTask">查看任务</button>
            </div>
          </article>
          <article
            v-else
            class="flex min-h-[172px] min-w-0 flex-col rounded-lg border bg-white p-4 text-left shadow-sm transition"
            :aria-label="getSkillDisplayName(skill)"
            :class="
              isSkillConnecting(skill)
                ? 'cursor-wait border-[#deded9] bg-[#fafaf8] opacity-80 shadow-none'
                : 'border-[#deded9]'
            "
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
            </div>

            <p class="mt-4 line-clamp-2 flex-1 text-xs leading-6 text-slate-600">{{ skill.description }}</p>
            <div class="skill-card-footer">
              <div v-if="isSkillConnecting(skill)" class="flex min-w-0 min-h-7 flex-1 items-center gap-1.5 text-[11px] font-medium leading-4 text-slate-500">
                <Icon :svg="strokeIconPaths.refresh" :size="13" svg-class="shrink-0 animate-spin text-slate-400" />
                <span>初次连接中...预计智能体解析在{{ getSkillExpectedTime(skill) }}完成</span>
              </div>
              <div v-else class="skill-card-tags">
                <span class="rounded-md bg-[#f1f1ef] px-2 py-1 text-xs leading-4 text-slate-600">{{ skillTypeLabels[skill.type] }}</span>
                <span class="rounded-md bg-[#f1f1ef] px-2 py-1 text-xs leading-4 text-slate-600">{{ skill.usage }}</span>
              </div>
              <button v-if="phaseSkills.some(item => item.id === skill.id)" type="button" class="skill-card-action" :aria-label="`配置 ${skill.name}`" @click="openMonitorConfig(skill.id as P1SkillId)"><Icon :svg="strokeIconPaths.settings" :size="13" />配置</button>
              <button v-if="skill.type === 'data' && skill.usage === '需登录' && !isSkillConnecting(skill)" type="button" class="skill-card-action" :disabled="authorizedSkillIds.includes(skill.id)" :aria-label="`${authorizedSkillIds.includes(skill.id) ? '已连接' : '连接'} ${skill.name}`" @click="connectSkill(skill)"><Icon :svg="strokeIconPaths.zap" :size="13" />{{ authorizedSkillIds.includes(skill.id) ? '已连接' : '连接系统' }}</button>
            </div>
          </article>
          </template>
        </div>
        <div v-else class="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
          <span class="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
            <Icon :svg="strokeIconPaths.list" :size="17" />
          </span>
          <span class="mt-3 text-sm font-medium text-slate-600">暂无技能</span>
        </div>
      </div>

      <form class="project-completion-bar" @submit.prevent="goNext">
        <label class="project-completion-label" for="project-name">
          <span>项目名称</span><span id="project-name-requirement" class="text-xs font-normal text-red-700">必填</span>
        </label>
        <div class="project-name-field flex min-w-0 flex-1 items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 transition focus-within:border-[#4c8dff] focus-within:ring-2 focus-within:ring-blue-100">
          <input
            id="project-name"
            ref="projectNameInput"
            :value="projectName"
            class="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="项目名称"
            aria-describedby="project-name-requirement"
            required
            placeholder="请填写项目名称（必填，最多20字）"
            @input="handleProjectNameInput"
          />
          <span class="project-name-counter ml-3 text-xs" :class="projectNameLength >= maxProjectNameLength ? 'text-amber-600' : 'text-slate-400'">
            {{ projectNameLength }}/{{ maxProjectNameLength }}
          </span>
        </div>
        <button
          type="submit"
          class="shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition"
          :class="canGoNext ? 'bg-slate-900 text-white hover:bg-slate-800' : 'cursor-not-allowed bg-slate-200 text-slate-400'"
          :disabled="!canGoNext"
        >
          完成
        </button>
      </form>
    </section>

    <AppDialog
      v-if="viewingWechatSkill?.wechatSource"
      :model-value="true"
      :title="viewingWechatSkill.name"
      width="580px"
      @update:model-value="closeWechatDetails"
    >
      <WechatEmployeeDetails :source="viewingWechatSkill.wechatSource" />
      <template #footer>
        <div class="dialog-footer justify-end">
          <div class="dialog-actions">
            <button type="button" class="dialog-button" @click="closeWechatDetails">关闭</button>
          </div>
        </div>
      </template>
    </AppDialog>

    <MonitoringConfigDialog v-if="configuringMonitor" :skill-id="configuringMonitor" :project-id="editingProjectId" :draft="monitoringDraft" draft-only @saved="monitoringDraft = $event" @close="configuringMonitor = undefined" />
    <AppDialog v-if="pendingLoginSkill" :model-value="true" :title="pendingLoginSkill.name" width="560px" @update:model-value="cancelSkillLogin">
        <div class="space-y-4">
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
                class="dialog-button dialog-primary"
                @click="submitLoginVerificationCode"
              >
                提交
              </button>
            </div>
          </div>
        </div>
      <template #footer>
        <div class="dialog-footer">
          <p v-if="isPendingTmsSyncEmployee" class="dialog-note">大卡数字人将会加密存储您提供的账密，并提供 <a href="/legal/information-protection-commitment.html" target="_blank" rel="noreferrer" class="font-medium text-blue-600 hover:underline">信息保护承诺书</a></p>
          <p v-else class="dialog-note">Agent 将使用浏览器自动打开目标系统并完成登录。</p>
          <div class="dialog-actions"><button type="button" class="dialog-button" @click="cancelSkillLogin">取消</button><button type="button" class="dialog-button dialog-primary" :disabled="loginAgentStatus === 'running' || loginAgentStatus === 'waitingCode'" @click="confirmSkillLogin">{{ loginConfirmText }}</button></div>
        </div>
      </template>
    </AppDialog>
  </div>
</template>

<style lang="scss" scoped>
.project-completion-bar { display: flex; flex-shrink: 0; align-items: center; gap: 12px; margin: 16px 20px 20px; padding: 12px 16px; border-radius: 8px; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 0.1); }
.project-completion-label { display: flex; flex-shrink: 0; align-items: center; gap: 6px; color: #475569; font-size: 12px; font-weight: 500; white-space: nowrap; }
@media (max-width: 560px) {
  .project-completion-bar { gap: 8px; padding: 10px; }
  .project-completion-label { flex-direction: column; align-items: flex-start; gap: 0; }
  .project-completion-bar .project-name-field { padding: 0 8px; }
  .project-name-counter { display: none; }
}
.skill-card-footer { display: flex; align-items: flex-end; gap: 8px; margin-top: auto; padding-top: 12px; }
.skill-card-tags { display: flex; flex: 1; flex-wrap: wrap; align-items: center; align-self: center; min-width: 0; gap: 6px; }
.skill-card-tags > span { flex-shrink: 0; white-space: nowrap; }
.skill-card-action { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; gap: 4px; height: 28px; margin-left: auto; padding: 0 9px; border: 1px solid #d8dde4; border-radius: 5px; background: #fff; color: #334155; font-size: 12px; font-weight: 500; line-height: 18px; white-space: nowrap; transition: background-color 150ms, border-color 150ms; }
.skill-card-action:hover:not(:disabled) { border-color: #b7c2d0; background: #f4f6f8; }
.skill-card-action:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.skill-card-action:disabled { cursor: default; color: #64748b; background: #f8fafc; }
.skill-card-action.is-primary { border-color: #0f172a; background: #0f172a; color: #fff; }
.skill-card-action.is-primary:hover:not(:disabled) { border-color: #334155; background: #334155; }
</style>
