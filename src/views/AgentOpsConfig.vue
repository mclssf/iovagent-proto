<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { ElDialog, ElMessage, ElMessageBox, ElOption, ElSelect } from 'element-plus';

import { agentWorkData } from '@/pinia/agentWork';
import { skillGroups, useAgentOpsStore } from '@/pinia/agentOps';
import type { AgentCallableSkill, ManagedSkill, SkillCategory, SkillGroup } from '@/pinia/agentOps';
import type { DataEmployeeSkill as DataEmployee, LoginType } from '@/pinia/dataEmployeeSkills';
import ToolManagement from './AgentOps/ToolManagement.vue';
import AgentManagement from './AgentOps/AgentManagement.vue';
import CustomerAgentManagement from './AgentOps/CustomerAgentManagement.vue';
import type { CustomerAgentTarget } from '@/pinia/customerAgents';

import { strokeIconPaths } from './AgentWork/strokeIconPaths';

type ConfigTab = 'dataset' | 'employees' | 'skills' | 'tmsCustomers' | 'tools' | 'agents' | 'customers';
type SkillManagementTab = 'skills' | 'systemPrompt';

interface WaybillField {
  example: string;
  name: string;
  semantic: string;
}

interface ValidationResult {
  checkedAt: string;
  entity: Record<string, string>;
  fieldNames: string[];
  message: string;
  success: boolean;
}

interface SystemPromptConfig {
  content: string;
  fileName: string;
  updatedAt: string;
  updatedBy: string;
}

const router = useRouter();
const store = agentWorkData();
const opsStore = useAgentOpsStore();
const { skills: managedSkills, tools: managedTools, dataEmployeeSkills: dataEmployees } = storeToRefs(opsStore);
const activeTab = ref<ConfigTab>('customers');
const agentConfigPageOpen = ref(false);
const customerToEdit = ref<CustomerAgentTarget>();
function updateAgentEditing(open: boolean) {
  agentConfigPageOpen.value = open;
  if (!open) customerToEdit.value = undefined;
}
function editCustomerAgentFromTool(target: CustomerAgentTarget) {
  customerToEdit.value = target;
  activeTab.value = 'customers';
}
function editSkillFromTool(skill: AgentCallableSkill) {
  if (skill.source === 'data-employee') {
    const employee = dataEmployees.value.find(item => item.id === skill.id);
    if (employee) { activeTab.value = 'employees'; openEditEmployeeModal(employee); }
  } else {
    const common = managedSkills.value.find(item => item.id === skill.id);
    if (common) openEditSkillModal(common);
  }
}

const activeSkillManagementTab = ref<SkillManagementTab>('skills');
const isCreateEmployeeModalOpen = ref(false);
const isValidationModalOpen = ref(false);
const isSkillFormModalOpen = ref(false);
const isSkillPreviewModalOpen = ref(false);
const editingEmployeeId = ref('');
const editingSkillId = ref('');
const previewingSkill = ref<ManagedSkill | null>(null);
const validatingEmployee = ref<DataEmployee | null>(null);
const visibleCustomerPasswordIds = ref<string[]>([]);
const loginTypes: LoginType[] = ['无验证', '图形验证码', '短信验证码', '手机扫码'];
const newEmployeeForm = reactive({
  description: '',
  loginType: '无验证' as LoginType,
  loginUrl: '',
  name: '',
  skillContent: '',
  skillFileName: '',
  privateToolIds: [] as string[],
  group: '基础 Skill 组' as SkillGroup,
});
const validationForm = reactive({
  graphicCode: '',
  password: '',
  smsCode: '',
  username: '',
});
const validationResult = ref<ValidationResult | null>(null);
const skillSearch = ref('');
const skillGroupFilter = ref<'全部' | SkillGroup>('全部');
const skillCategoryFilter = ref<'全部' | SkillCategory>('全部');
const pendingPrivateToolId = ref('');
const skillForm = reactive({
  category: '在途专家' as SkillCategory,
  description: '',
  privateToolIds: [] as string[],
  fileContent: '',
  fileName: '',
  name: '',
  group: '基础 Skill 组' as SkillGroup,
});

const systemPrompt = ref<SystemPromptConfig>({
  fileName: 'iovagent-system-prompt.md',
  updatedAt: '2026-07-26 18:05',
  updatedBy: '系统管理员',
  content: `# 大卡数字人 System Prompt

你是服务于企业物流运输场景的智能体。

## 核心原则
1. 先识别用户意图和当前项目上下文，再选择合适的 Skill。
2. 涉及运单、车辆、轨迹和风险结论时，优先使用真实数据源并注明数据时间。
3. 无项目上下文时，不得推测或引用任何企业私有数据。
4. 涉及付费、短信或外部系统连接的 Skill，执行前应明确告知用户。
5. 输出应简洁、可追溯，并给出下一步可执行建议。`,
});
const selectedEmployeeId = ref(dataEmployees.value[0]!.id);

const menuItems = computed<Array<{ badge?: number; desc: string; icon: string; id: ConfigTab; label: string }>>(() => [
  { id: 'customers', label: '客户 Agent 配置', desc: '客户授权、能力加载、冲突检测', icon: strokeIconPaths.usersRound },
  { id: 'employees', label: '数据员工配置', desc: '数据员工 Agent 的采集与映射 Skill', icon: strokeIconPaths.bot },
  { id: 'tmsCustomers', label: 'TMS同步客户', desc: '客户提交、连接处理', icon: strokeIconPaths.usersRound, badge: store.unprocessedTmsSyncCustomerCount },
  { id: 'dataset', label: '标准数据集', desc: '运单字段、语义、数据示例', icon: strokeIconPaths.list },
  { id: 'agents', label: 'Agent 管理', desc: '名称、System Prompt', icon: strokeIconPaths.bot },
  { id: 'tools', label: 'Tool 管理', desc: 'MCP 服务、代码工具、加载范围', icon: strokeIconPaths.waypoints },
  { id: 'skills', label: 'Skill 管理', desc: '通用技能、分组、私有工具', icon: strokeIconPaths.settings },
]);
const skillManagementTabs: { id: SkillManagementTab; label: string }[] = [
  { id: 'skills', label: 'Skill 列表' },
  { id: 'systemPrompt', label: 'System Prompt 管理' },
];
const skillCategoryOptions: Array<'全部' | SkillCategory> = ['全部', '在途专家', '经营分析参谋', '运营助手', '运力与货源'];

const waybillFields: WaybillField[] = [
  { name: 'waybill_no', semantic: '运单唯一编号，用于跨系统识别同一票运输任务。', example: 'WB202606250018' },
  { name: 'source_system', semantic: '数据来源系统或导入渠道，便于追踪抓取来源。', example: '金隅水泥TMS' },
  { name: 'project_name', semantic: '归属项目或客户项目名称。', example: '华东干线在途监控' },
  { name: 'carrier_name', semantic: '承运商、物流商或实际运输服务商名称。', example: '安捷物流' },
  { name: 'vehicle_plate', semantic: '执行运输任务的车辆车牌号。', example: '沪A12345' },
  { name: 'driver_name', semantic: '当前运单绑定司机姓名。', example: '张师傅' },
  { name: 'driver_phone', semantic: '司机联系方式，用于人工复核和异常联系。', example: '138****6821' },
  { name: 'route_name', semantic: '线路名称或起止点组合后的标准线路。', example: '上海工厂 → 广州仓' },
  { name: 'origin_name', semantic: '装货地、发货工厂或起运仓名称。', example: '上海一厂' },
  { name: 'origin_address', semantic: '装货地详细地址或围栏地址。', example: '上海市嘉定区胜辛南路88号' },
  { name: 'destination_name', semantic: '卸货地、收货仓或目的地名称。', example: '广州仓' },
  { name: 'destination_address', semantic: '卸货地详细地址或目的地围栏地址。', example: '广州市黄埔区开创大道168号' },
  { name: 'cargo_name', semantic: '货品、物料或运输品类名称。', example: '袋装水泥 P.O42.5' },
  { name: 'cargo_weight', semantic: '货物重量，统一保留数值和单位。', example: '31.5 吨' },
  { name: 'order_status', semantic: '运单当前执行状态。', example: '在途' },
  { name: 'plan_depart_time', semantic: '计划发车或计划出库时间。', example: '2026-06-25 08:00' },
  { name: 'actual_depart_time', semantic: '实际发车或离开发货地时间。', example: '2026-06-25 08:23' },
  { name: 'plan_arrival_time', semantic: '计划到达目的地时间。', example: '2026-06-26 02:30' },
  { name: 'actual_arrival_time', semantic: '实际到达目的地时间，未到达时为空。', example: '-' },
  { name: 'current_location', semantic: '最近一次定位解析出的当前位置。', example: 'G60沪昆高速嘉兴段' },
  { name: 'gps_time', semantic: '最近一次有效GPS定位时间。', example: '2026-06-25 14:16:32' },
  { name: 'risk_level', semantic: '智能体归一后的风险等级。', example: '高风险' },
  { name: 'abnormal_type', semantic: '异常类型，可承接规则预警、GPS疑似造假、长时间停车等。', example: '非目的地物流园长停' },
  { name: 'raw_payload_ref', semantic: '原始抓取数据引用，用于问题追溯和重新映射。', example: 'crawl://20260625/jinyu/018' },
];

const selectedEmployee = computed(() => dataEmployees.value.find((employee) => employee.id === selectedEmployeeId.value) ?? dataEmployees.value[0]!);
const currentValidationLoginType = computed(() => validatingEmployee.value?.loginType ?? '无验证');
const isEditingEmployee = computed(() => editingEmployeeId.value.length > 0);
const isEditingSkill = computed(() => editingSkillId.value.length > 0);
const employeeFormTitle = computed(() => (isEditingEmployee.value ? '编辑数据员工 Skill' : '新增数据员工 Skill'));
const employeeFormConfirmText = computed(() => (isEditingEmployee.value ? '保存' : '确认'));
const skillFormTitle = computed(() => (isEditingSkill.value ? '配置 Skill' : '添加 Skill'));
const filteredManagedSkills = computed(() => {
  const search = skillSearch.value.trim().toLowerCase();
  return managedSkills.value.filter((skill) => {
    const matchesCategory = skillCategoryFilter.value === '全部' || skill.category === skillCategoryFilter.value;
    const matchesSearch = !search || `${skill.name} ${skill.description} ${skill.fileName} ${skill.category}`.toLowerCase().includes(search);
    return matchesCategory && matchesSearch && (skillGroupFilter.value === '全部' || skill.group === skillGroupFilter.value);
  });
});
const availablePrivateTools = computed(() => managedTools.value.filter((tool) => !skillForm.privateToolIds.includes(tool.id)));
function toolName(id: string) {
  return managedTools.value.find((tool) => tool.id === id)?.name ?? id;
}
function toolById(id: string) {
  return managedTools.value.find((tool) => tool.id === id);
}
function addPrivateTool() {
  if (!availablePrivateTools.value.some((tool) => tool.id === pendingPrivateToolId.value)) return;
  skillForm.privateToolIds.push(pendingPrivateToolId.value);
  pendingPrivateToolId.value = '';
}


function bumpVersion(version: string) {
  const versionNumber = Number(version.replace('v', ''));
  return Number.isFinite(versionNumber) ? `v${(versionNumber + 0.1).toFixed(1)}` : 'v1.0';
}

function loginTypeClass(loginType: LoginType) {
  if (loginType === '短信验证码') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (loginType === '图形验证码') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (loginType === '手机扫码') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}


function showSkill(employee: DataEmployee) {
  selectedEmployeeId.value = employee.id;
}

function resetValidationForm() {
  validationForm.username = '';
  validationForm.password = '';
  validationForm.graphicCode = '';
  validationForm.smsCode = '';
  validationResult.value = null;
}

function openValidationModal(employee: DataEmployee) {
  showSkill(employee);
  validatingEmployee.value = employee;
  resetValidationForm();
  isValidationModalOpen.value = true;
}

function closeValidationModal() {
  isValidationModalOpen.value = false;
  validatingEmployee.value = null;
  resetValidationForm();
}

function sendSmsCode() {
  if (!validationForm.username.trim()) {
    ElMessage.warning('请先输入账号');
    return;
  }
  validationForm.smsCode = '246810';
  ElMessage.success('短信验证码已发送');
}

function resetNewEmployeeForm() {
  editingEmployeeId.value = '';
  newEmployeeForm.name = '';
  newEmployeeForm.description = '';
  newEmployeeForm.loginUrl = '';
  newEmployeeForm.loginType = '无验证';
  newEmployeeForm.group = '基础 Skill 组';
  newEmployeeForm.privateToolIds = [];
  newEmployeeForm.skillContent = '';
  newEmployeeForm.skillFileName = '';
}

function openCreateEmployeeModal() {
  resetNewEmployeeForm();
  isCreateEmployeeModalOpen.value = true;
}

function openEditEmployeeModal(employee: DataEmployee) {
  showSkill(employee);
  editingEmployeeId.value = employee.id;
  newEmployeeForm.name = employee.name;
  newEmployeeForm.description = employee.description;
  newEmployeeForm.loginUrl = employee.loginUrl;
  newEmployeeForm.loginType = employee.loginType;
  newEmployeeForm.group = employee.group;
  newEmployeeForm.privateToolIds = [...employee.privateToolIds];
  newEmployeeForm.skillContent = employee.skillContent;
  newEmployeeForm.skillFileName = employee.skillFileName;
  isCreateEmployeeModalOpen.value = true;
}

function closeCreateEmployeeModal() {
  isCreateEmployeeModalOpen.value = false;
  resetNewEmployeeForm();
}

async function uploadNewEmployeeSkill(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  newEmployeeForm.skillContent = await file.text();
  newEmployeeForm.skillFileName = file.name;
  input.value = '';
}


function confirmCreateEmployee() {
  const name = newEmployeeForm.name.trim();
  const description = newEmployeeForm.description.trim();
  const loginUrl = newEmployeeForm.loginUrl.trim();
  if (!name) {
    ElMessage.warning('请输入数据员工 Skill 名称');
    return;
  }
  if (!description) {
    ElMessage.warning('请输入数据员工 Skill 描述');
    return;
  }
  if (!loginUrl) {
    ElMessage.warning('请输入接入地址');
    return;
  }
  if (!newEmployeeForm.skillFileName || !newEmployeeForm.skillContent) {
    ElMessage.warning('请上传数据获取映射 skill 文件');
    return;
  }

  if (isEditingEmployee.value) {
    const employee = dataEmployees.value.find((item) => item.id === editingEmployeeId.value);
    if (!employee) {
      ElMessage.warning('未找到需要编辑的数据员工 Skill');
      return;
    }
    const isSkillChanged = newEmployeeForm.skillFileName !== employee.skillFileName || newEmployeeForm.skillContent !== employee.skillContent;
    opsStore.saveDataEmployeeSkill({
      ...employee, name, description, loginUrl,
      loginType: newEmployeeForm.loginType, group: newEmployeeForm.group, privateToolIds: [...newEmployeeForm.privateToolIds],
      skillContent: newEmployeeForm.skillContent, skillFileName: newEmployeeForm.skillFileName,
      skillUpdated: '刚刚', skillVersion: isSkillChanged ? bumpVersion(employee.skillVersion) : employee.skillVersion,
    });
    selectedEmployeeId.value = employee.id;
    isCreateEmployeeModalOpen.value = false;
    resetNewEmployeeForm();
    ElMessage.success('数据员工 Skill 已保存，可在客户 Agent 配置中选择');
    return;
  }

  const employee: DataEmployee = {
    id: `custom-tms-${Date.now()}`,
    name,
    description,
    loginUrl,
    loginType: newEmployeeForm.loginType,
    group: newEmployeeForm.group,
    privateToolIds: [...newEmployeeForm.privateToolIds],
    skillVersion: 'v1.0',
    skillUpdated: '刚刚',
    skillFileName: newEmployeeForm.skillFileName,
    skillContent: newEmployeeForm.skillContent,
  };
  opsStore.saveDataEmployeeSkill(employee);
  selectedEmployeeId.value = employee.id;
  isCreateEmployeeModalOpen.value = false;
  resetNewEmployeeForm();
  ElMessage.success('Skill 已新增，请在客户 Agent 配置中按需加载');
}

function buildValidationEntity(employee: DataEmployee) {
  return {
    waybill_no: `WB${new Date().toISOString().slice(0, 10).replaceAll('-', '')}001`,
    source_system: employee.name,
    carrier_name: '安捷物流',
    vehicle_plate: '沪A12345',
    driver_name: '张师傅',
    route_name: '上海工厂 → 广州仓',
    origin_name: '上海一厂',
    destination_name: '广州仓',
    order_status: '在途',
    current_location: 'G60沪昆高速嘉兴段',
    gps_time: '2026-06-25 14:16:32',
    risk_level: '低风险',
  };
}

function validateEmployee() {
  if (!validatingEmployee.value) return;
  if (currentValidationLoginType.value === '手机扫码') {
    const entity = buildValidationEntity(validatingEmployee.value);
    validationResult.value = {
      checkedAt: '刚刚',
      entity,
      fieldNames: Object.keys(entity),
      message: `${validatingEmployee.value.name} 扫码登录成功，已通过数据映射 skill 获取 1 条运单样例。`,
      success: true,
    };
    ElMessage.success('验证完成');
    return;
  }
  if (!validationForm.username.trim()) {
    ElMessage.warning('请输入账号');
    return;
  }
  if (!validationForm.password.trim()) {
    ElMessage.warning('请输入密码');
    return;
  }
  if (currentValidationLoginType.value === '图形验证码' && !validationForm.graphicCode.trim()) {
    ElMessage.warning('请输入图形验证码');
    return;
  }
  if (currentValidationLoginType.value === '短信验证码' && !validationForm.smsCode.trim()) {
    ElMessage.warning('请输入短信验证码');
    return;
  }
  const entity = buildValidationEntity(validatingEmployee.value);
  validationResult.value = {
    checkedAt: '刚刚',
    entity,
    fieldNames: Object.keys(entity),
    message: `${validatingEmployee.value.name} 登录成功，已通过数据映射 skill 获取 1 条运单样例。`,
    success: true,
  };
  ElMessage.success('验证完成');
}

async function uploadSkill(employee: DataEmployee, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const content = await file.text();
  opsStore.saveDataEmployeeSkill({
    ...employee, skillContent: content || employee.skillContent, skillFileName: file.name,
    skillUpdated: '刚刚', skillVersion: bumpVersion(employee.skillVersion),
  });
  selectedEmployeeId.value = employee.id;
  input.value = '';
  ElMessage.success(`${employee.name} 的数据映射 skill 已更新`);
}


function resetSkillForm() {
  editingSkillId.value = '';
  pendingPrivateToolId.value = '';
  skillForm.name = '';
  skillForm.description = '';
  skillForm.category = '在途专家';
  skillForm.group = '基础 Skill 组';
  skillForm.privateToolIds = [];
  skillForm.fileName = '';
  skillForm.fileContent = '';
}

function openCreateSkillModal() {
  resetSkillForm();
  isSkillFormModalOpen.value = true;
}

function openEditSkillModal(skill: ManagedSkill) {
  editingSkillId.value = skill.id;
  pendingPrivateToolId.value = '';
  skillForm.name = skill.name;
  skillForm.description = skill.description;
  skillForm.category = skill.category;
  skillForm.group = skill.group;
  skillForm.privateToolIds = [...skill.privateToolIds];
  skillForm.fileName = skill.fileName;
  skillForm.fileContent = skill.content;
  isSkillFormModalOpen.value = true;
}

function closeSkillFormModal() {
  isSkillFormModalOpen.value = false;
}

async function uploadSkillFormFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  skillForm.fileName = file.name;
  skillForm.fileContent = await file.text();
  input.value = '';
}

function confirmSkillForm() {
  const name = skillForm.name.trim();
  const description = skillForm.description.trim();
  if (!name) {
    ElMessage.warning('请输入 Skill 名称');
    return;
  }
  if (!description) {
    ElMessage.warning('请输入 Skill 描述');
    return;
  }
  if (!skillForm.fileName || !skillForm.fileContent) {
    ElMessage.warning('请上传 Skill 文件');
    return;
  }

  if (isEditingSkill.value) {
    managedSkills.value = managedSkills.value.map((skill) =>
      skill.id === editingSkillId.value
        ? {
            ...skill,
            name,
            description,
            category: skillForm.category,
            group: skillForm.group,

            privateToolIds: [...skillForm.privateToolIds],
            fileName: skillForm.fileName,
            content: skillForm.fileContent,
            updatedAt: '刚刚',
            updatedBy: '当前运营用户',
          }
        : skill,
    );
    ElMessage.success('Skill 配置已保存');
  } else {
    managedSkills.value = [
      {
        id: `custom-skill-${Date.now()}`,
        name,
        description,
        category: skillForm.category,
        group: skillForm.group,

        privateToolIds: [...skillForm.privateToolIds],
        fileName: skillForm.fileName,
        content: skillForm.fileContent,
        enabled: true,
        updatedAt: '刚刚',
        updatedBy: '当前运营用户',
      },
      ...managedSkills.value,
    ];
    ElMessage.success('Skill 已添加并启用');
  }
  closeSkillFormModal();
}

function toggleManagedSkill(skill: ManagedSkill) {
  skill.enabled = !skill.enabled;
  skill.updatedAt = '刚刚';
  skill.updatedBy = '当前运营用户';
  ElMessage.success(`${skill.name} 已${skill.enabled ? '启用' : '禁用'}`);
}

async function removeManagedSkill(skill: ManagedSkill) {
  try {
    await ElMessageBox.confirm(`删除后将无法在项目中继续选择“${skill.name}”，是否确认删除？`, '删除 Skill', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  managedSkills.value = managedSkills.value.filter((item) => item.id !== skill.id);
  if (previewingSkill.value?.id === skill.id) {
    previewingSkill.value = null;
    isSkillPreviewModalOpen.value = false;
  }
  ElMessage.success('Skill 已删除');
}

function showManagedSkill(skill: ManagedSkill) {
  previewingSkill.value = skill;
  isSkillPreviewModalOpen.value = true;
}

function closeSkillPreviewModal() {
  isSkillPreviewModalOpen.value = false;
  previewingSkill.value = null;
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function uploadManagedSkill(skill: ManagedSkill, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  skill.fileName = file.name;
  skill.content = (await file.text()) || skill.content;
  skill.updatedAt = '刚刚';
  skill.updatedBy = '当前运营用户';
  input.value = '';
  ElMessage.success(`${skill.name} 已更新`);
}

async function uploadSystemPrompt(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  systemPrompt.value = {
    fileName: file.name,
    content: (await file.text()) || systemPrompt.value.content,
    updatedAt: '刚刚',
    updatedBy: '当前运营用户',
  };
  input.value = '';
  ElMessage.success('System Prompt 已更新');
}

function isCustomerPasswordVisible(customerId: string) {
  return visibleCustomerPasswordIds.value.includes(customerId);
}

function toggleCustomerPassword(customerId: string) {
  visibleCustomerPasswordIds.value = isCustomerPasswordVisible(customerId)
    ? visibleCustomerPasswordIds.value.filter((id) => id !== customerId)
    : [...visibleCustomerPasswordIds.value, customerId];
}

function markTmsCustomerProcessed(customerId: string) {
  const operator = window.localStorage.getItem('iovagent_login_user')?.trim() || '当前运营用户';
  store.markTmsSyncCustomerProcessed(customerId, operator);
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-[#f7f7f5] text-slate-900" :class="{ 'ops-catalog-screen': ['customers', 'agents', 'tools', 'skills', 'employees'].includes(activeTab) }">
    <header v-if="!agentConfigPageOpen" class="flex h-14 shrink-0 items-center justify-between border-b border-[#deded9] bg-white px-5">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#deded9] bg-[#f7f7f5] text-slate-700">
          <Icon :svg="strokeIconPaths.bot" :size="18" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-sm font-semibold leading-5 text-slate-950">智能体运营配置</h1>
          <p class="truncate text-xs leading-4 text-slate-500">客户 Agent 配置、Agent 定义、Skill 与 Tool 管理</p>
        </div>
      </div>
      <button type="button" class="shrink-0 rounded-md border border-[#deded9] px-3 py-1.5 text-xs text-slate-600 hover:bg-[#f7f7f5]" @click="router.push('/index')">
        返回工作台
      </button>
    </header>

    <main :class="{ 'is-agent-editor': agentConfigPageOpen }" class="ops-main grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)] gap-3 p-4">
      <aside v-if="!agentConfigPageOpen" class="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
        <div class="border-b border-[#e2e2dc] px-4 py-3">
          <h2 class="text-sm font-semibold leading-5 text-slate-950">运营菜单</h2>
          <p class="mt-1 text-xs leading-5 text-slate-500">维护智能体运行所需的运营配置。</p>
        </div>
        <nav class="flex-1 space-y-1 p-3">
          <button
            v-for="item in menuItems"
            :key="item.id"
            type="button"
            class="flex w-full items-start gap-2.5 rounded-md px-3 py-2.5 text-left transition"
            :class="activeTab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-[#f7f7f5] hover:text-slate-950'"
            @click="activeTab = item.id"
          >
            <span
              class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
              :class="activeTab === item.id ? 'bg-white/12 text-white' : 'bg-[#f2f2ef] text-slate-600'"
            >
              <Icon :svg="item.icon" :size="15" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center justify-between gap-2 text-sm font-medium leading-5">
                <span class="truncate">{{ item.label }}</span>
                <span
                  v-if="item.badge"
                  class="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none"
                  :class="activeTab === item.id ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
                >
                  {{ item.badge > 99 ? '99+' : item.badge }}
                </span>
              </span>
              <span class="mt-0.5 block text-xs leading-4" :class="activeTab === item.id ? 'text-white/70' : 'text-slate-400'">
                {{ item.desc }}
              </span>
            </span>
          </button>
        </nav>
        <div class="border-t border-[#e2e2dc] px-4 py-3 text-xs leading-5 text-slate-500">
          配置变更仅用于当前前端演示，不会写入生产环境。
        </div>
      </aside>

      <div class="h-full min-h-0 overflow-hidden">
        <section v-if="activeTab === 'employees'" class="grid h-full min-h-0 grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)] gap-3">
        <div class="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
          <div class="flex h-11 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
            <h2 class="text-sm font-semibold leading-5 text-slate-950">数据员工 Skill 列表</h2>
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-500">{{ dataEmployees.length }} 个 Skill</span>
              <button type="button" class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800" @click="openCreateEmployeeModal">
                新增 Skill
              </button>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e2dc] px-4 py-3 text-xs leading-5 text-slate-600"><span>每项配置都是采集与映射 Skill，可在客户 Agent 配置中为数据员工 Agent 按组或逐项选择。</span><button type="button" class="shrink-0 font-medium underline underline-offset-4" @click="activeTab = 'customers'">配置客户 Agent</button></div>
          <div class="min-h-0 flex-1 overflow-auto">
            <table class="w-full table-fixed border-collapse text-left text-sm">
              <thead class="sticky top-0 z-10 bg-[#f7f7f5]">
                <tr class="text-xs font-semibold text-slate-500">
                  <th class="px-4 py-3">Skill / 数据来源</th>
                  <th class="w-[205px] px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#ededea]">
                <tr
                  v-for="employee in dataEmployees"
                  :key="employee.id"
                  class="cursor-pointer hover:bg-[#f7f7f5]"
                  :class="selectedEmployee.id === employee.id ? 'bg-[#f7f7f5]' : 'bg-white'"
                  @click="showSkill(employee)"
                >
                  <td class="px-4 py-4 align-middle">
                    <div class="font-medium text-slate-950">{{ employee.name }}</div>
                    <div class="mt-1 max-w-[300px] truncate text-xs text-slate-500">{{ employee.description || '暂无描述' }}</div>
                    <div class="mt-2 max-w-[400px] truncate font-mono text-xs text-slate-500">{{ employee.loginUrl }}</div>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                      <span class="inline-flex rounded-md border px-2 py-0.5 text-xs font-medium" :class="loginTypeClass(employee.loginType)">{{ employee.loginType }}</span>
                      <span class="inline-flex max-w-[230px] truncate rounded-md border border-[#deded9] bg-white px-2 py-0.5 text-xs text-slate-600" :title="employee.group">
                        {{ employee.group }}
                      </span>
                      <span class="text-xs text-slate-400">{{ employee.skillVersion }} · 更新于 {{ employee.skillUpdated }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-4 align-middle">
                    <div class="flex flex-wrap items-center gap-2">
                      <button type="button" class="rounded-md border border-[#deded9] px-2 py-1 text-xs hover:bg-white" @click.stop="openEditEmployeeModal(employee)">
                        编辑
                      </button>
                      <button type="button" class="rounded-md border border-[#deded9] px-2 py-1 text-xs hover:bg-white" @click.stop="openValidationModal(employee)">
                        验证
                      </button>
                      <label class="cursor-pointer rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800" @click.stop>
                        更新 Skill
                        <input class="hidden" type="file" accept=".md,.txt,.yaml,.yml" @change.stop="uploadSkill(employee, $event)" />
                      </label>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside class="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
          <div class="flex h-11 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
            <h2 class="text-sm font-semibold leading-5 text-slate-950">数据映射 Skill</h2>
            <span class="rounded-md border border-[#deded9] bg-[#f7f7f5] px-2 py-0.5 text-xs text-slate-500">{{ selectedEmployee.skillVersion }}</span>
          </div>
          <div class="space-y-3 border-b border-[#e2e2dc] px-4 py-3 text-xs text-slate-500">
            <div class="flex items-center justify-between gap-3">
              <span>当前 Skill</span>
              <span class="font-medium text-slate-800">{{ selectedEmployee.name }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span>Skill 文件</span>
              <span class="truncate font-mono text-slate-700">{{ selectedEmployee.skillFileName }}</span>
            </div>
          </div>
          <pre class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-[#fbfbfa] p-4 text-xs leading-5 text-slate-700">{{ selectedEmployee.skillContent }}</pre>
        </aside>
      </section>

        <section v-else-if="activeTab === 'dataset'" class="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
        <div class="shrink-0 border-b border-[#e2e2dc] px-4 py-3">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold leading-5 text-slate-950">运单标准数据集</h2>
            <span class="text-xs text-slate-500">{{ waybillFields.length }} 个字段</span>
          </div>
          <p class="mt-1 text-xs leading-5 text-slate-500">
            数据员工抓取各 TMS 页面后，先按 Skill 将原始字段映射到该标准数据集。标准字段用于后续在途监控、异常识别、轨迹核验和报表输出。
          </p>
        </div>
        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full border-collapse text-left text-sm">
            <thead class="sticky top-0 z-10 bg-[#f7f7f5]">
              <tr class="text-xs font-semibold text-slate-500">
                <th class="w-[210px] px-4 py-3">字段名称</th>
                <th class="px-4 py-3">语义</th>
                <th class="w-[260px] px-4 py-3">数据示例</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#ededea]">
              <tr v-for="field in waybillFields" :key="field.name" class="hover:bg-[#f7f7f5]">
                <td class="px-4 py-3 align-top font-mono text-xs font-medium text-slate-900">{{ field.name }}</td>
                <td class="px-4 py-3 align-top text-sm leading-5 text-slate-600">{{ field.semantic }}</td>
                <td class="px-4 py-3 align-top font-mono text-xs text-slate-600">{{ field.example }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        </section>

        <section v-else-if="activeTab === 'tmsCustomers'" class="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
          <div class="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4 py-3">
            <div class="min-w-0">
              <h2 class="text-sm font-semibold leading-5 text-slate-950">TMS同步客户列表</h2>
              <p class="mt-1 text-xs leading-4 text-slate-500">记录用户通过“TMS同步员工”提交的系统连接信息。</p>
            </div>
            <div class="flex shrink-0 items-center gap-2 text-xs">
              <span class="rounded-md border border-[#deded9] bg-[#f7f7f5] px-2.5 py-1 text-slate-500">共 {{ store.tmsSyncCustomers.length }} 条</span>
              <span class="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 font-medium text-red-600">未处理 {{ store.unprocessedTmsSyncCustomerCount }} 条</span>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <table class="min-w-[960px] w-full table-fixed border-collapse text-left text-sm">
              <thead class="sticky top-0 z-10 bg-[#f7f7f5]">
                <tr class="text-xs font-semibold text-slate-500">
                  <th class="w-[11%] px-4 py-3">企业 CID</th>
                  <th class="w-[11%] px-3 py-3">用户手机号</th>
                  <th class="w-[20%] px-3 py-3">提交系统地址</th>
                  <th class="w-[10%] px-3 py-3">账号</th>
                  <th class="w-[11%] px-3 py-3">密码</th>
                  <th class="w-[9%] px-3 py-3">状态</th>
                  <th class="w-[13%] px-3 py-3">提交时间</th>
                  <th class="w-[15%] px-3 py-3">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#ededea]">
                <tr v-for="customer in store.tmsSyncCustomers" :key="customer.id" class="bg-white hover:bg-[#f7f7f5]">
                  <td class="px-4 py-3 align-middle font-mono text-xs font-medium text-slate-800">{{ customer.enterpriseCid }}</td>
                  <td class="px-3 py-3 align-middle font-mono text-xs text-slate-600">{{ customer.userPhone }}</td>
                  <td class="px-3 py-3 align-middle">
                    <a
                      :href="customer.systemUrl"
                      target="_blank"
                      rel="noreferrer"
                      class="block truncate font-mono text-xs text-blue-600 hover:text-blue-700 hover:underline"
                      :title="customer.systemUrl"
                    >
                      {{ customer.systemUrl }}
                    </a>
                  </td>
                  <td class="px-3 py-3 align-middle font-mono text-xs text-slate-700">{{ customer.account }}</td>
                  <td class="px-3 py-3 align-middle">
                    <div class="flex items-center gap-1.5">
                      <span class="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">
                        {{ isCustomerPasswordVisible(customer.id) ? customer.password : '••••••••' }}
                      </span>
                      <button
                        type="button"
                        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700"
                        :aria-label="isCustomerPasswordVisible(customer.id) ? '隐藏密码' : '显示密码'"
                        :title="isCustomerPasswordVisible(customer.id) ? '隐藏密码' : '显示密码'"
                        @click="toggleCustomerPassword(customer.id)"
                      >
                        <Icon :svg="strokeIconPaths.eye" :size="14" />
                      </button>
                    </div>
                  </td>
                  <td class="px-3 py-3 align-middle">
                    <span
                      class="inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium"
                      :class="customer.status === '未处理' ? 'border-red-200 bg-red-50 text-red-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700'"
                    >
                      {{ customer.status }}
                    </span>
                  </td>
                  <td class="px-3 py-3 align-middle whitespace-nowrap text-xs text-slate-500">{{ customer.submittedAt }}</td>
                  <td class="px-3 py-3 align-middle">
                    <button
                      v-if="customer.status === '未处理'"
                      type="button"
                      class="h-8 whitespace-nowrap rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"
                      @click="markTmsCustomerProcessed(customer.id)"
                    >
                      标记已处理
                    </button>
                    <div v-else class="text-xs leading-5 text-slate-500">
                      <div>处理人：<span class="font-medium text-slate-700">{{ customer.processedBy }}</span></div>
                      <div v-if="customer.processedAt" class="text-slate-400">{{ customer.processedAt }}</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div v-if="store.tmsSyncCustomers.length === 0" class="flex h-40 items-center justify-center text-sm text-slate-400">暂无 TMS 同步客户提交记录</div>
          </div>
        </section>

        <CustomerAgentManagement v-else-if="activeTab === 'customers'" :initial-target="customerToEdit" @editing-change="updateAgentEditing" />
        <AgentManagement v-else-if="activeTab === 'agents'" @editing-change="updateAgentEditing" @manage-customers="activeTab = 'customers'" />
        <ToolManagement v-else-if="activeTab === 'tools'" @edit-skill="editSkillFromTool" @edit-customer-agent="editCustomerAgentFromTool" />

        <section v-else class="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
          <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
            <div class="flex h-full items-center gap-5">
              <button
                v-for="tab in skillManagementTabs"
                :key="tab.id"
                type="button"
                class="relative h-full text-sm font-medium transition"
                :class="activeSkillManagementTab === tab.id ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'"
                @click="activeSkillManagementTab = tab.id"
              >
                {{ tab.label }}
                <span v-if="activeSkillManagementTab === tab.id" class="absolute inset-x-0 bottom-0 h-0.5 bg-slate-900" />
              </button>
            </div>
            <span class="text-xs text-slate-400">运营配置</span>
          </div>

          <template v-if="activeSkillManagementTab === 'skills'">
            <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#e2e2dc] px-4 py-3">
              <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <label class="relative block w-full max-w-[280px]">
                  <Icon :svg="strokeIconPaths.search" :size="15" svg-class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    v-model.trim="skillSearch"
                    class="h-9 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] pl-8 pr-3 text-xs outline-none focus:border-slate-400"
                    placeholder="搜索 Skill 名称或文件"
                  />
                </label>
                <select
                  v-model="skillCategoryFilter"
                  class="h-9 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-xs text-slate-600 outline-none focus:border-slate-400"
                >
                  <option v-for="category in skillCategoryOptions" :key="category" :value="category">{{ category }}</option>
                </select>
                <span class="shrink-0 text-xs text-slate-500">{{ filteredManagedSkills.length }} / {{ managedSkills.length }} 个</span>
              </div>
              <select v-model="skillGroupFilter" class="ops-input !w-auto" aria-label="筛选 Skill 分组"><option value="全部">全部分组</option><option v-for="group in skillGroups" :key="group">{{ group }}</option></select>
              <button type="button" class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800" @click="openCreateSkillModal">
                <Icon :svg="strokeIconPaths.plus" :size="14" />
                添加 Skill
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-auto">
              <table class="w-full min-w-[1120px] table-fixed border-collapse text-left text-sm">
                <thead class="sticky top-0 z-10 bg-[#f7f7f5]">
                  <tr class="text-xs font-semibold text-slate-500">
                    <th class="w-[18%] px-4 py-3">Skill 名称</th>
                    <th class="w-[10%] px-3 py-3">分类</th>
                    <th class="w-[15%] px-3 py-3">Skill 分组</th>
                    <th class="w-[15%] px-3 py-3">私有工具</th>
                    <th class="w-[15%] px-3 py-3">Skill 文件</th>
                    <th class="w-[12%] px-3 py-3">最后更新</th>
                    <th class="w-[15%] px-3 py-3">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#ededea]">
                  <tr v-for="skill in filteredManagedSkills" :key="skill.id" class="bg-white hover:bg-[#f7f7f5]">
                    <td class="px-4 py-3 align-middle">
                      <div class="flex items-center gap-2">
                        <span class="h-2 w-2 shrink-0 rounded-full" :class="skill.enabled ? 'bg-emerald-500' : 'bg-slate-300'" />
                        <div class="min-w-0">
                          <div class="truncate font-medium text-slate-950">{{ skill.name }}</div>
                          <div class="mt-0.5 truncate text-xs text-slate-500" :title="skill.description">{{ skill.description }}</div>
                          <div class="mt-0.5 text-xs" :class="skill.enabled ? 'text-emerald-600' : 'text-slate-400'">{{ skill.enabled ? '已启用' : '已禁用' }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="px-3 py-3 align-middle">
                      <span class="inline-flex whitespace-nowrap rounded-md bg-[#f2f2ef] px-2 py-1 text-xs text-slate-600">{{ skill.category }}</span>
                    </td>
                    <td class="px-3 py-3 align-middle">
                      <span class="text-xs text-slate-700">{{ skill.group }}</span>
                    </td>
                    <td class="px-3 py-3 align-middle">
                      <button type="button" class="text-xs leading-5 text-slate-700 hover:underline" :aria-label="`配置 ${skill.name} 的私有工具`" @click="openEditSkillModal(skill)">{{ skill.privateToolIds.length }} 个私有工具</button>
                      <p class="mt-1 text-xs leading-5 text-slate-500">{{ skill.privateToolIds.map(toolName).join('、') || '未绑定私有工具' }}</p>
                    </td>
                    <td class="px-3 py-3 align-middle">
                      <button type="button" class="inline-flex w-full items-center gap-1.5 text-left font-mono text-xs text-slate-600 hover:text-slate-950" title="下载 Skill 文件" @click="downloadTextFile(skill.fileName, skill.content)">
                        <Icon :svg="strokeIconPaths.download" :size="14" />
                        <span class="truncate">{{ skill.fileName }}</span>
                      </button>
                    </td>
                    <td class="px-3 py-3 align-middle">
                      <div class="whitespace-nowrap text-xs text-slate-600">{{ skill.updatedAt }}</div>
                      <div class="mt-1 text-xs text-slate-400">{{ skill.updatedBy }}</div>
                    </td>
                    <td class="px-3 py-3 align-middle">
                      <div class="flex items-center gap-1">
                        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border border-[#deded9] text-slate-500 hover:bg-white hover:text-slate-950" aria-label="显示 Skill" title="显示 Skill" @click="showManagedSkill(skill)">
                          <Icon :svg="strokeIconPaths.eye" :size="14" />
                        </button>
                        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md border border-[#deded9] text-slate-500 hover:bg-white hover:text-slate-950" aria-label="配置 Skill" title="配置 Skill" @click="openEditSkillModal(skill)">
                          <Icon :svg="strokeIconPaths.settings" :size="14" />
                        </button>
                        <label class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[#deded9] text-slate-500 hover:bg-white hover:text-slate-950" aria-label="更新上传 Skill" title="更新上传">
                          <Icon :svg="strokeIconPaths.upload" :size="14" />
                          <input class="hidden" type="file" accept=".md,.txt,.yaml,.yml" @change="uploadManagedSkill(skill, $event)" />
                        </label>
                        <button
                          type="button"
                          class="h-7 whitespace-nowrap rounded-md px-2 text-xs font-medium"
                          :class="skill.enabled ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'"
                          @click="toggleManagedSkill(skill)"
                        >
                          {{ skill.enabled ? '禁用' : '启用' }}
                        </button>
                        <button type="button" class="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="删除 Skill" title="删除 Skill" @click="removeManagedSkill(skill)">
                          <Icon :svg="strokeIconPaths.trash" :size="14" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="filteredManagedSkills.length === 0" class="flex h-40 items-center justify-center text-sm text-slate-400">未找到符合条件的 Skill</div>
            </div>
          </template>

          <template v-else>
            <div class="flex shrink-0 items-start justify-between gap-4 border-b border-[#e2e2dc] px-5 py-4">
              <div class="min-w-0">
                <h2 class="text-sm font-semibold leading-5 text-slate-950">当前 System Prompt</h2>
                <div class="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
                  <span>文件：<strong class="font-mono font-medium text-slate-700">{{ systemPrompt.fileName }}</strong></span>
                  <span>最后更新时间：<strong class="font-medium text-slate-700">{{ systemPrompt.updatedAt }}</strong></span>
                  <span>更新用户：<strong class="font-medium text-slate-700">{{ systemPrompt.updatedBy }}</strong></span>
                </div>
              </div>
              <label class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800" aria-label="更新上传 System Prompt">
                <Icon :svg="strokeIconPaths.upload" :size="14" />
                更新上传
                <input class="hidden" type="file" accept=".md,.txt" @change="uploadSystemPrompt" />
              </label>
            </div>
            <div class="min-h-0 flex-1 overflow-auto bg-[#fbfbfa] p-5">
              <pre class="mx-auto max-w-[980px] whitespace-pre-wrap rounded-md border border-[#deded9] bg-white p-5 text-xs leading-6 text-slate-700">{{ systemPrompt.content }}</pre>
            </div>
          </template>
        </section>
      </div>
    </main>

    <ElDialog v-model="isSkillFormModalOpen" :title="skillFormTitle" width="1160px" top="4vh" class="ops-tool-dialog skill-config-dialog" :close-on-click-modal="false" @closed="resetSkillForm">
      <form id="skill-config-form" class="skill-config-grid" @submit.prevent="confirmSkillForm">
        <section class="skill-basics">
          <h3 class="text-sm font-semibold text-slate-950">基本信息</h3>
          <p v-if="isEditingSkill" class="mt-1 text-xs leading-5 text-slate-500">{{ editingSkillId }}</p>
          <div class="mt-5 space-y-5">
            <label class="ops-field">Skill 名称<input v-model.trim="skillForm.name" class="ops-input" placeholder="请输入 Skill 名称" maxlength="80" /></label>
            <label class="ops-field">Skill 分类<select v-model="skillForm.category" class="ops-input"><option v-for="category in skillCategoryOptions.slice(1)" :key="category" :value="category">{{ category }}</option></select></label>
            <label class="ops-field">Skill 分组<select v-model="skillForm.group" class="ops-input"><option v-for="group in skillGroups" :key="group" :value="group">{{ group }}</option></select><span class="text-xs font-normal text-slate-500">用于客户按组批量选择；修改分组不改变已保存的客户授权。</span></label>
            <label class="ops-field">Skill 描述<textarea v-model.trim="skillForm.description" class="ops-input !h-auto py-2" rows="4" placeholder="描述 Skill 的用途与适用场景" /></label>
            <div>
              <h4 class="mb-2 text-xs font-medium text-slate-700">Skill 文件</h4>
              <div class="flex items-start gap-2 rounded-md border border-[#deded9] bg-[#fbfbfa] p-3"><Icon :svg="strokeIconPaths.file" :size="18" svg-class="shrink-0 text-slate-500" /><div class="min-w-0"><p class="break-all font-mono text-xs leading-5 text-slate-700">{{ skillForm.fileName || '尚未上传文件' }}</p><p class="mt-1 text-xs text-slate-500">支持 .md、.txt、.yaml、.yml</p></div></div>
              <label class="mt-3 block text-xs text-slate-600">{{ skillForm.fileName ? '替换 Skill 文件' : '上传 Skill 文件' }}<input class="mt-2 block w-full text-xs file:mr-3 file:rounded-md file:border file:border-[#deded9] file:bg-white file:px-3 file:py-2 file:text-slate-700" type="file" accept=".md,.txt,.yaml,.yml" @change="uploadSkillFormFile" /></label>
              <details v-if="skillForm.fileContent" class="mt-4 text-xs"><summary class="cursor-pointer text-slate-600">预览文件内容</summary><pre class="mt-3 whitespace-pre-wrap break-words border-t border-[#e2e2dc] pt-3 text-xs leading-6 text-slate-600">{{ skillForm.fileContent }}</pre></details>
            </div>
          </div>
        </section>
        <div class="min-w-0 space-y-7">
          <section>
            <div class="flex items-center justify-between gap-2"><h3 class="text-sm font-semibold text-slate-950">私有化加载的 Tool</h3><span class="text-xs text-slate-500">已添加 {{ skillForm.privateToolIds.length }} 个</span></div>
            <p class="mt-2 text-xs leading-5 text-slate-500">添加后，本 Skill 执行时会按需加载这些工具。同一工具可被多个 Skill 私有化加载；每个客户也可为 Agent 独立指定 Tool，实际调用范围由客户 Agent 配置决定。</p>
            <div class="mt-4 overflow-hidden rounded-md border border-[#deded9]">
              <div class="grid grid-cols-[minmax(0,1fr)_90px_auto] gap-2 bg-[#f7f7f5] px-3 py-2 text-xs text-slate-500"><span>工具名称 / Description</span><span>工具类型</span><span>操作</span></div>
              <div v-for="id in skillForm.privateToolIds" :key="id" class="grid grid-cols-[minmax(0,1fr)_90px_auto] items-start gap-2 border-t border-[#ededea] px-3 py-3" data-testid="private-tool-row"><div class="min-w-0"><p class="text-sm font-medium text-slate-700">{{ toolName(id) }}</p><p class="mt-1 break-all font-mono text-xs text-slate-500">{{ id }}</p><p class="mt-1 text-xs leading-5 text-slate-500">{{ toolById(id)?.description }}</p></div><span class="pt-0.5 text-xs text-slate-600">{{ toolById(id)?.kind === 'mcp' ? 'MCP 服务' : '代码工具' }}</span><button type="button" class="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" :aria-label="`移除私有工具 ${toolName(id)}`" @click="skillForm.privateToolIds = skillForm.privateToolIds.filter((item) => item !== id)"><Icon :svg="strokeIconPaths.trash" :size="15" /></button></div>
              <p v-if="!skillForm.privateToolIds.length" class="px-3 py-6 text-center text-xs leading-5 text-slate-500">尚未添加私有工具，请从下方工具目录中选择。</p>
            </div>
            <div class="mt-3 flex items-center gap-2"><ElSelect v-model="pendingPrivateToolId" filterable clearable class="min-w-0 flex-1" aria-label="选择私有工具" placeholder="搜索并选择一个私有工具" :disabled="!availablePrivateTools.length"><ElOption v-for="tool in availablePrivateTools" :key="tool.id" :label="`${tool.name} · ${tool.kind === 'mcp' ? 'MCP' : '代码'}`" :value="tool.id" /></ElSelect><button type="button" class="ops-secondary shrink-0" :disabled="!pendingPrivateToolId" @click="addPrivateTool"><Icon :svg="strokeIconPaths.plus" :size="14" />添加 Tool</button></div>
            <p class="mt-2 text-xs leading-5 text-slate-500">{{ availablePrivateTools.length ? '可选择所有尚未添加的 MCP 服务和代码工具。' : '所有工具均已添加。' }}</p>
          </section>
        </div>
      </form>
      <template #footer><div class="flex flex-wrap items-center justify-between gap-3"><span class="text-xs text-slate-500">保存后同步更新 Tool 管理中的关联 Skill 列表。</span><div class="flex gap-2"><button type="button" class="ops-secondary" @click="closeSkillFormModal">取消</button><button type="submit" form="skill-config-form" class="ops-primary">{{ isEditingSkill ? '保存' : '添加' }}</button></div></div></template>
    </ElDialog>

    <div v-if="isSkillPreviewModalOpen && previewingSkill" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
      <div class="flex max-h-[88vh] w-full max-w-[820px] flex-col overflow-hidden rounded-md border border-[#deded9] bg-white shadow-xl">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div class="min-w-0">
            <h2 class="truncate text-sm font-semibold leading-5 text-slate-950">{{ previewingSkill.name }}</h2>
            <p class="truncate text-xs leading-4 text-slate-500">{{ previewingSkill.fileName }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="inline-flex items-center gap-1 rounded-md border border-[#deded9] px-2.5 py-1.5 text-xs text-slate-600 hover:bg-[#f7f7f5]" @click="downloadTextFile(previewingSkill.fileName, previewingSkill.content)">
              <Icon :svg="strokeIconPaths.download" :size="13" />
              下载
            </button>
            <button type="button" class="rounded-md p-1 text-slate-400 hover:bg-[#f7f7f5] hover:text-slate-700" title="关闭" @click="closeSkillPreviewModal">
              <Icon :svg="strokeIconPaths.x" :size="16" />
            </button>
          </div>
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-1 border-b border-[#e2e2dc] px-4 py-3 text-xs text-slate-500">
          <span>分类：<strong class="font-medium text-slate-700">{{ previewingSkill.category }}</strong></span>
          <span>Skill 分组：<strong class="font-medium text-slate-700">{{ previewingSkill.group }}</strong></span>
          <span>最后更新：<strong class="font-medium text-slate-700">{{ previewingSkill.updatedAt }} · {{ previewingSkill.updatedBy }}</strong></span>
          <span class="w-full">私有工具：<strong class="font-medium text-slate-700">{{ previewingSkill.privateToolIds.map(toolName).join('、') || '未绑定私有工具' }}</strong></span>
          <p class="w-full pt-1 text-sm leading-5 text-slate-600">{{ previewingSkill.description }}</p>
        </div>
        <pre class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap bg-[#fbfbfa] p-5 text-xs leading-6 text-slate-700">{{ previewingSkill.content }}</pre>
      </div>
    </div>

    <div v-if="isValidationModalOpen && validatingEmployee" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
      <div class="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-md border border-[#deded9] bg-white shadow-xl">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div class="flex min-w-0 items-center gap-2.5">
            <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
              <Icon :svg="strokeIconPaths.shield" :size="16" />
            </div>
            <div class="min-w-0">
              <h2 class="truncate text-sm font-semibold leading-5 text-slate-950">验证数据员工</h2>
              <p class="truncate text-xs leading-4 text-slate-500">{{ validatingEmployee.name }} · {{ validatingEmployee.loginType }}</p>
            </div>
          </div>
          <button type="button" class="rounded-md p-1 text-slate-400 hover:bg-[#f7f7f5] hover:text-slate-700" @click="closeValidationModal">
            <Icon :svg="strokeIconPaths.x" :size="16" />
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-auto">
          <div class="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div class="space-y-3">
              <div class="rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-xs leading-5 text-slate-500">
                接入地址：<span class="font-mono text-slate-700">{{ validatingEmployee.loginUrl }}</span>
              </div>

              <template v-if="currentValidationLoginType !== '手机扫码'">
                <label class="block">
                  <span class="mb-1.5 block text-xs font-medium text-slate-600">账号</span>
                  <input
                    v-model.trim="validationForm.username"
                    class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
                    placeholder="请输入目标系统账号"
                  />
                </label>

                <label class="block">
                  <span class="mb-1.5 block text-xs font-medium text-slate-600">密码</span>
                  <input
                    v-model.trim="validationForm.password"
                    type="password"
                    class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
                    placeholder="请输入目标系统密码"
                  />
                </label>
              </template>

              <div v-if="currentValidationLoginType === '无验证'" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                当前登录方式为无验证，填写账号和密码后即可验证。
              </div>

              <label v-else-if="currentValidationLoginType === '图形验证码'" class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-600">图形验证码</span>
                <div class="flex gap-2">
                  <div class="flex h-10 w-24 shrink-0 items-center justify-center rounded-md border border-[#deded9] bg-[#f2f2ef] font-mono text-sm font-semibold tracking-[0.22em] text-slate-700">
                    A7K9
                  </div>
                  <input
                    v-model.trim="validationForm.graphicCode"
                    class="h-10 min-w-0 flex-1 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
                    placeholder="请输入图形验证码"
                  />
                </div>
              </label>

              <label v-else-if="currentValidationLoginType === '短信验证码'" class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-600">短信验证码</span>
                <div class="flex gap-2">
                  <input
                    v-model.trim="validationForm.smsCode"
                    class="h-10 min-w-0 flex-1 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
                    placeholder="请输入短信验证码"
                  />
                  <button type="button" class="h-10 shrink-0 rounded-md border border-[#deded9] px-3 text-xs text-slate-600 hover:bg-[#f7f7f5]" @click="sendSmsCode">
                    获取验证码
                  </button>
                </div>
              </label>

              <div v-else>
                <span class="mb-1.5 block text-xs font-medium text-slate-600">手机扫码</span>
                <div class="flex flex-col items-center justify-center gap-3 rounded-md border border-[#deded9] bg-[#fbfbfa] p-4 text-center">
                  <div class="grid h-28 w-28 shrink-0 grid-cols-5 grid-rows-5 gap-1 rounded bg-white p-1.5 shadow-sm">
                    <span v-for="index in 25" :key="index" class="rounded-sm" :class="[1, 2, 4, 6, 8, 12, 14, 16, 18, 20, 22, 24, 25].includes(index) ? 'bg-slate-900' : 'bg-slate-200'" />
                  </div>
                  <div class="text-xs leading-5 text-slate-500">请使用目标系统移动端扫码确认，确认后点击验证。</div>
                </div>
              </div>

              <button type="button" class="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800" @click="validateEmployee">
                验证
              </button>
            </div>

            <div class="flex min-h-[360px] flex-col overflow-hidden rounded-md border border-[#deded9] bg-[#fbfbfa]">
              <div class="flex h-10 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-3">
                <h3 class="text-sm font-semibold leading-5 text-slate-950">验证结果</h3>
                <span v-if="validationResult" class="text-xs text-slate-500">{{ validationResult.checkedAt }}</span>
              </div>

              <div v-if="validationResult" class="min-h-0 flex-1 overflow-auto p-3">
                <div
                  class="mb-3 rounded-md border px-3 py-2 text-xs leading-5"
                  :class="validationResult.success ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'"
                >
                  登录是否成功：{{ validationResult.success ? '成功' : '失败' }}。{{ validationResult.message }}
                </div>

                <div class="mb-3">
                  <div class="mb-1.5 text-xs font-medium text-slate-600">获取到的运单字段名称</div>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="fieldName in validationResult.fieldNames" :key="fieldName" class="rounded-md bg-white px-2 py-1 font-mono text-xs text-slate-600 shadow-sm">
                      {{ fieldName }}
                    </span>
                  </div>
                </div>

                <div>
                  <div class="mb-1.5 text-xs font-medium text-slate-600">数据实体结果（1条）</div>
                  <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
                    <div v-for="(value, key) in validationResult.entity" :key="key" class="grid grid-cols-[150px_minmax(0,1fr)] border-b border-[#ededea] last:border-b-0">
                      <div class="bg-[#f7f7f5] px-2 py-2 font-mono text-xs text-slate-500">{{ key }}</div>
                      <div class="min-w-0 px-2 py-2 text-xs text-slate-700">{{ value }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="flex flex-1 items-center justify-center px-6 text-center text-xs leading-5 text-slate-400">
                {{
                  currentValidationLoginType === '手机扫码'
                    ? '使用目标系统移动端扫码确认后点击验证，这里会显示登录状态、字段名称和一条运单实体结果。'
                    : '输入账号、密码和对应验证码后点击验证，这里会显示登录状态、字段名称和一条运单实体结果。'
                }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isCreateEmployeeModalOpen" role="dialog" aria-modal="true" :aria-label="employeeFormTitle" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
      <div class="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-md border border-[#deded9] bg-white shadow-xl">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div class="flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
              <Icon :svg="strokeIconPaths.bot" :size="16" />
            </div>
            <h2 class="text-sm font-semibold leading-5 text-slate-950">{{ employeeFormTitle }}</h2>
          </div>
          <button type="button" aria-label="关闭数据员工 Skill 表单" class="rounded-md p-1 text-slate-400 hover:bg-[#f7f7f5] hover:text-slate-700" @click="closeCreateEmployeeModal">
            <Icon :svg="strokeIconPaths.x" :size="16" />
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-600">Skill 名称</span>
            <input
              v-model.trim="newEmployeeForm.name"
              class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
              placeholder="例如：某客户TMS"
            />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-600">描述</span>
            <textarea
              v-model.trim="newEmployeeForm.description"
              class="min-h-[72px] w-full resize-none rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder="请输入该 Skill 负责的目标系统、抓取范围或使用场景"
            />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-600">接入地址</span>
            <input
              v-model.trim="newEmployeeForm.loginUrl"
              class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
              placeholder="请输入 TMS 登录或接入地址"
            />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-600">登录方式</span>
            <select
              v-model="newEmployeeForm.loginType"
              class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
            >
              <option v-for="type in loginTypes" :key="type" :value="type">{{ type }}</option>
            </select>
          </label>

          <label class="ops-field">Skill 分组<select v-model="newEmployeeForm.group" class="ops-input"><option v-for="group in skillGroups" :key="group" :value="group">{{ group }}</option></select></label>
          <div class="border-t border-[#e2e2dc] pt-4">
            <h3 class="text-sm font-semibold">私有化加载的 Tool</h3>
            <p class="mt-2 text-xs leading-5 text-slate-500">随此 Skill 加载，与客户为 Agent 指定的直接工具独立。</p>
            <ElSelect v-model="newEmployeeForm.privateToolIds" multiple filterable class="mt-3 w-full" aria-label="数据员工 Skill 私有工具" placeholder="选择私有 MCP 服务或代码工具"><ElOption v-for="tool in managedTools" :key="tool.id" :value="tool.id" :label="tool.name" /></ElSelect>
            <ul class="mt-3 divide-y divide-[#e2e2dc]"><li v-for="id in newEmployeeForm.privateToolIds" :key="id" class="flex items-start justify-between gap-3 py-2 text-xs"><div><strong>{{ toolName(id) }}</strong><p class="mt-1 leading-5 text-slate-500">{{ toolById(id)?.description }}</p></div><button type="button" :aria-label="`移除私有工具 ${toolName(id)}`" @click="newEmployeeForm.privateToolIds = newEmployeeForm.privateToolIds.filter(item => item !== id)">移除</button></li></ul>
          </div>

          <div>
            <span class="mb-1.5 block text-xs font-medium text-slate-600">数据获取映射 skill 上传</span>
            <label
              class="flex min-h-[76px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#cfcfca] bg-[#fbfbfa] px-3 py-3 text-center hover:bg-[#f7f7f5]"
            >
              <Icon :svg="strokeIconPaths.file" :size="18" svg-class="mb-1 text-slate-500" />
              <span class="text-sm font-medium text-slate-700">
                {{ newEmployeeForm.skillFileName || '选择 skill 文件' }}
              </span>
              <span class="mt-1 text-xs text-slate-400">支持 .md / .txt / .yaml / .yml</span>
              <input class="hidden" type="file" accept=".md,.txt,.yaml,.yml" @change="uploadNewEmployeeSkill" />
            </label>
          </div>
        </div>

        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-[#e2e2dc] px-4 py-3">
          <button type="button" class="rounded-md border border-[#deded9] px-3 py-1.5 text-sm text-slate-600 hover:bg-[#f7f7f5]" @click="closeCreateEmployeeModal">
            取消
          </button>
          <button type="button" class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800" @click="confirmCreateEmployee">
            {{ employeeFormConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
:global(html:has(.ops-catalog-screen)), :global(body:has(.ops-catalog-screen)) { min-width: 0; }
.skill-config-grid { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.25fr); gap: 28px; }
.skill-basics { min-width: 0; padding-right: 28px; border-right: 1px solid #e2e2dc; }
@media (max-width: 760px) {
  .skill-config-grid { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .skill-basics { padding-right: 0; padding-bottom: 24px; border-right: 0; border-bottom: 1px solid #e2e2dc; }
  .ops-catalog-screen .ops-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); padding: 8px; gap: 8px; }
  .ops-catalog-screen .ops-main > aside > div, .ops-catalog-screen .ops-main > aside > nav button > span:first-child, .ops-catalog-screen .ops-main > aside > nav button span.mt-0\.5 { display: none; }
  .ops-catalog-screen .ops-main > aside > nav { display: flex; overflow-x: auto; padding: 6px; gap: 4px; }
  .ops-catalog-screen .ops-main > aside > nav button { width: auto; flex-shrink: 0; padding: 8px; margin: 0; white-space: nowrap; }
}
.ops-catalog-screen .ops-main.is-agent-editor { display: block; padding: 0; }
</style>
