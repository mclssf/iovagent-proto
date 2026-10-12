<script lang="ts" setup>
import { migrateCapacitySkillIds } from '@/pinia/capacitySkills';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { ElMessage } from 'element-plus';
import AppDialog from '@/components/AppDialog.vue';

import { agentWorkData } from '@/pinia/agentWork';
import { createProjectMailbox, emailDemoMailbox, mailboxSkill } from '@/pinia/projectMailboxes';
import type { ProjectMailbox } from '../interface';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { badgeToneClass, projectStatusTone } from '../utils';
import { vehiclePredictionSkill } from '../vehiclePredictionSkill';
const requiredMonitorSkillIds: string[] = [];

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
const defaultLogisticsSkillIds = [vehiclePredictionSkill.id];
const projectName = ref('');
const showSkillInstructions = ref(false);
const activeTab = ref<SkillTab>('all');
const selectedDataSkillIds = ref<string[]>([]);
const selectedLogisticsSkillIds = ref<string[]>([...defaultLogisticsSkillIds]);
const selectedOperationsSkillIds = ref<string[]>([]);
const mailboxDraft = ref<ProjectMailbox | null>(null);
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

const tabs: { id: SkillTab; label: string }[] = [{ id: 'all', label: '全部' }, { id: 'logistics', label: '在途专家' }];

const skillTypeLabels: Record<SkillType, string> = {
  analysis: '经营分析参谋',
  capacity: '运力与货源',
  data: '数据员工',
  logistics: '在途专家',
  operations: '运营助手',
};

const skills: ProjectSkill[] = [{ ...vehiclePredictionSkill, type: 'logistics', usage: '免费', icon: strokeIconPaths.locate }];

const projectNameLength = computed(() => Array.from(projectName.value).length);
const filteredSkills = computed(() => (activeTab.value === 'all' ? skills : skills.filter((skill) => skill.type === activeTab.value)));
const selectedSkills = computed(() =>
  skills.filter(
    (skill) =>
      selectedDataSkillIds.value.includes(skill.id) ||
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
  if (project.skillIds?.length) return migrateCapacitySkillIds(project.skillIds);
  return skills.filter((skill) => project.tmsUrl.includes(skill.name)).map((skill) => skill.id);
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
    selectedDataSkillIds.value = [];
    selectedLogisticsSkillIds.value = [...defaultLogisticsSkillIds];
    selectedOperationsSkillIds.value = [];
    selectedCapacitySkillIds.value = [];
    selectedAnalysisSkillIds.value = [];
    authorizedSkillIds.value = [];
    return;
  }

  const projectSkillIds = ensureRequiredMonitorSkills(getProjectSkillIds());
  const dataSkills = skills.filter((skill) => projectSkillIds.includes(skill.id) && skill.type === 'data');
  projectName.value = project.name;
  selectedDataSkillIds.value = dataSkills.map((skill) => skill.id);
  selectedLogisticsSkillIds.value = projectSkillIds.filter((id) => skills.some((skill) => skill.id === id && skill.type === 'logistics'));
  selectedOperationsSkillIds.value = projectSkillIds.filter((id) => skills.some((skill) => skill.id === id && skill.type === 'operations'));
  selectedCapacitySkillIds.value = projectSkillIds.filter((id) => skills.some((skill) => skill.id === id && skill.type === 'capacity'));
  selectedAnalysisSkillIds.value = projectSkillIds.filter((id) => skills.some((skill) => skill.id === id && skill.type === 'analysis'));
  authorizedSkillIds.value = dataSkills.filter((skill) => skill.usage === '需登录').map((skill) => skill.id);
}

function handleProjectNameInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const nextValue = Array.from(input.value).slice(0, maxProjectNameLength).join('');
  projectName.value = nextValue;
  input.value = nextValue;
}

function isSkillSelected(skill: ProjectSkill) {
  if (skill.type === 'data') return selectedDataSkillIds.value.includes(skill.id);
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
  if (skill.id === mailboxSkill.id) return;
  if (isSkillConnecting(skill) || requiredMonitorSkillIds.includes(skill.id)) return;
  if (skill.type === 'data') {
    if (selectedDataSkillIds.value.includes(skill.id)) {
      selectedDataSkillIds.value = selectedDataSkillIds.value.filter((id) => id !== skill.id);
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
    selectedDataSkillIds.value = [...selectedDataSkillIds.value, skill.id];
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
  selectedDataSkillIds.value = Array.from(new Set([...selectedDataSkillIds.value, skillId]));
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
  selectedDataSkillIds.value = Array.from(new Set([...selectedDataSkillIds.value, skillId]));
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
  selectedOperationsSkillIds.value = [...new Set([...selectedOperationsSkillIds.value, mailboxSkill.id])];
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
  if (selectedSkills.value.length === 0) {
    ElMessage.warning('请选择至少一项项目技能');
    return;
  }
  const skillNames = selectedSkills.value.map((skill) => skill.name);
  const skillIds = selectedSkills.value.map((skill) => skill.id);
  if (editingProject.value) {
    store.updateSkillProject(editingProject.value.id, cleanName, skillNames, skillIds, mailboxDraft.value ?? undefined);
  } else {
    store.addSkillProject(cleanName, skillNames, skillIds, mailboxDraft.value ?? undefined);
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
      <div v-if="editingProject" class="mt-3 grid grid-cols-2 gap-2 rounded-md border border-[#deded9] bg-[#fbfbfa] p-2 sm:grid-cols-4">
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
          <button type="button" class="text-xs text-blue-600 hover:underline" @click="showSkillInstructions = true">查看技能规则</button>
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
          <template v-for="skill in filteredSkills" :key="skill.id">
          <article
            v-if="skill.id === mailboxSkill.id"
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
            <p class="mt-1 text-xs leading-5 text-slate-500">演示邮箱 · 模拟收件与回复</p>
            <div class="mt-auto flex items-center justify-between gap-3 pt-3">
              <span class="text-xs leading-5 text-slate-500">{{ mailboxDraft && !editingProject?.mailbox ? '点击完成，保存绑定并创建任务' : mailboxDraft ? '已关联邮件处理订单' : '绑定后自动创建邮件处理订单任务' }}</span>
              <button v-if="!mailboxDraft" type="button" class="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" @click="bindMailbox">绑定邮箱</button>
              <button v-else type="button" :disabled="!editingProject?.mailbox" class="shrink-0 rounded-md border border-[#deded9] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#f7f7f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-default disabled:opacity-50" @click="viewMailboxTask">查看任务</button>
            </div>
          </article>
          <button
            v-else
            type="button"
            class="group flex min-h-[172px] flex-col rounded-lg border bg-white p-4 text-left shadow-sm transition"
            :class="
              isSkillConnecting(skill)
                ? 'cursor-wait border-[#deded9] bg-[#fafaf8] opacity-80 shadow-none'
                : isSkillSelected(skill)
                ? 'border-slate-900 shadow-[0_0_0_1px_rgba(15,23,42,0.85),0_10px_22px_rgba(15,23,42,0.08)]'
                : 'border-transparent hover:border-[#deded9] hover:shadow-md'
            "
            :disabled="isSkillConnecting(skill) || requiredMonitorSkillIds.includes(skill.id)"
            :aria-pressed="isSkillSelected(skill)"
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
                {{ requiredMonitorSkillIds.includes(skill.id) ? '必选 · 状态流转' : isSkillSelected(skill) ? '已选择' : '未选择' }}
              </span>
            </div>
          </button>
          </template>
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
          class="shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition"
          :class="canGoNext ? 'bg-slate-900 text-white hover:bg-slate-800' : 'cursor-not-allowed bg-slate-200 text-slate-400'"
          :disabled="!canGoNext"
          @click="goNext"
        >
          完成
        </button>
      </div>
    </section>

    <AppDialog v-model="showSkillInstructions" :title="vehiclePredictionSkill.name" width="800px">
      <pre class="max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{{ vehiclePredictionSkill.instructions }}</pre>
    </AppDialog>
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

<style lang="scss" scoped></style>
