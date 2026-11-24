<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { ElMessage, ElMessageBox } from 'element-plus';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from './AgentWork/strokeIconPaths';

type ConfigTab = 'dataset' | 'employees' | 'skills' | 'tmsCustomers';
type LoginType = '短信验证码' | '手机扫码' | '图形验证码' | '无验证';
type SkillCategory = '在途专家' | '经营分析参谋' | '运营助手' | '运力与货源';
type SkillManagementTab = 'skills' | 'systemPrompt';
type SkillVisibility = '全部企业' | '指定企业';

interface DataEmployee {
  description: string;
  enterpriseIds: string[];
  id: string;
  loginType: LoginType;
  loginUrl: string;
  name: string;
  skillContent: string;
  skillFileName: string;
  skillUpdated: string;
  skillVersion: string;
  visibility: SkillVisibility;
}

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

interface EnterpriseOption {
  id: string;
  name: string;
}

interface ManagedSkill {
  category: SkillCategory;
  content: string;
  description: string;
  enabled: boolean;
  enterpriseIds: string[];
  fileName: string;
  id: string;
  name: string;
  updatedAt: string;
  updatedBy: string;
  visibility: SkillVisibility;
}

interface SystemPromptConfig {
  content: string;
  fileName: string;
  updatedAt: string;
  updatedBy: string;
}

const router = useRouter();
const store = agentWorkData();
const activeTab = ref<ConfigTab>('employees');
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
  enterpriseIds: [] as string[],
  loginType: '无验证' as LoginType,
  loginUrl: '',
  name: '',
  skillContent: '',
  skillFileName: '',
  visibility: '全部企业' as SkillVisibility,
});
const validationForm = reactive({
  graphicCode: '',
  password: '',
  smsCode: '',
  username: '',
});
const validationResult = ref<ValidationResult | null>(null);
const skillSearch = ref('');
const skillCategoryFilter = ref<'全部' | SkillCategory>('全部');
const enterpriseSearch = ref('');
const employeeEnterpriseSearch = ref('');
const skillForm = reactive({
  category: '在途专家' as SkillCategory,
  description: '',
  enterpriseIds: [] as string[],
  fileContent: '',
  fileName: '',
  name: '',
  visibility: '全部企业' as SkillVisibility,
});
const dataEmployees = ref<DataEmployee[]>([
  {
    id: 'jinyu-cement-tms',
    visibility: '指定企业',
    enterpriseIds: ['ent-jinyu'],
    name: '金隅水泥TMS',
    description: '面向金隅水泥运输业务的TMS抓取数据员工。',
    loginUrl: 'https://tms.jinyu.demo/login',
    loginType: '图形验证码',
    skillVersion: 'v1.3',
    skillUpdated: '今天 09:40',
    skillFileName: 'jinyu-waybill-mapping.skill.md',
    skillContent: `# 金隅水泥TMS 运单映射 Skill

目标：进入“运输管理 / 在途运单”页面，抓取今日在途运单明细。

页面导航：
1. 登录后进入【运输管理】。
2. 打开【运单查询】并筛选状态=在途。
3. 展开列表字段：运单号、车牌、承运商、起运地、目的地、发车时间、预计到达时间。

语义映射：
- 运单编号 -> waybill_no
- 车牌号码 -> vehicle_plate
- 承运单位 -> carrier_name
- 起运工厂 -> origin_name
- 收货仓库 -> destination_name
- 运输状态 -> order_status`,
  },
  {
    id: 'zhilian-shunda-tms',
    visibility: '指定企业',
    enterpriseIds: ['ent-zhilian'],
    name: '智链顺达TMS',
    description: '负责从智链顺达调度中心抓取执行中运输任务。',
    loginUrl: 'https://tms.zhilian-shunda.demo/login',
    loginType: '短信验证码',
    skillVersion: 'v1.1',
    skillUpdated: '昨天 18:20',
    skillFileName: 'zhilian-waybill-mapping.skill.md',
    skillContent: `# 智链顺达TMS 运单映射 Skill

目标：从“调度中心 / 执行中任务”抓取执行中运单。

页面导航：
1. 使用账号和短信验证码登录。
2. 进入【调度中心】。
3. 打开【执行中任务】，按更新时间倒序抓取。

语义映射：
- 任务单号 -> waybill_no
- 司机车辆 -> vehicle_plate
- 物流商 -> carrier_name
- 装货点 -> origin_name
- 卸货点 -> destination_name
- 最新定位 -> current_location`,
  },
  {
    id: 'jinmailang-logistics',
    visibility: '指定企业',
    enterpriseIds: ['ent-jinmailang'],
    name: '今麦郎物流管理',
    description: '面向今麦郎发运看板和运单列表的数据接入员工。',
    loginUrl: 'https://logistics.jinmailang.demo/login',
    loginType: '无验证',
    skillVersion: 'v1.0',
    skillUpdated: '06-24 15:12',
    skillFileName: 'jinmailang-waybill-mapping.skill.md',
    skillContent: `# 今麦郎物流管理 运单映射 Skill

目标：从“发运看板 / 运单列表”抓取发运和在途数据。

页面导航：
1. 登录后进入【发运看板】。
2. 切换到【运单列表】。
3. 抓取列表和详情弹窗中的线路、货品、状态、异常标记。

语义映射：
- 发运单号 -> waybill_no
- 线路名称 -> route_name
- 货品名称 -> cargo_name
- 当前节点 -> order_status
- 异常标签 -> abnormal_type`,
  },
  {
    id: 'spreadsheet-waybill',
    visibility: '全部企业',
    enterpriseIds: [],
    name: '表格运单',
    description: '用于上传表格运单并映射为标准运单数据集。',
    loginUrl: '本地表格导入',
    loginType: '无验证',
    skillVersion: 'v1.2',
    skillUpdated: '06-23 11:08',
    skillFileName: 'spreadsheet-waybill-mapping.skill.md',
    skillContent: `# 表格运单映射 Skill

目标：将客户上传的 Excel / CSV 运单表映射为标准运单数据集。

读取规则：
1. 第一行默认为表头。
2. 自动识别运单号、车牌、司机、承运商、线路、起止点、时间字段。
3. 若存在多个候选字段，优先选择包含“运单”“车牌”“起运”“目的”“状态”的中文表头。

语义映射：
- 运单号 / 单号 / 任务号 -> waybill_no
- 车牌 / 车辆 -> vehicle_plate
- 司机 / 驾驶员 -> driver_name
- 承运商 / 物流商 -> carrier_name`,
  },
  {
    id: 'scan-login-tms',
    visibility: '全部企业',
    enterpriseIds: [],
    name: '扫码登录TMS',
    description: '用于演示手机扫码登录场景的数据员工，抓取在途运单列表。',
    loginUrl: 'https://tms.scan-login.demo/login',
    loginType: '手机扫码',
    skillVersion: 'v1.0',
    skillUpdated: '刚刚',
    skillFileName: 'scan-login-waybill-mapping.skill.md',
    skillContent: `# 扫码登录TMS 运单映射 Skill

目标：使用手机扫码登录目标 TMS，进入在途运单页面并抓取运单明细。

页面导航：
1. 打开登录页，等待二维码渲染完成。
2. 用户使用手机端扫码确认登录。
3. 登录成功后进入【在途监控 / 运单列表】。
4. 抓取第一屏运单字段并进入详情页补充轨迹和状态字段。

语义映射：
- 运单号 -> waybill_no
- 车牌 -> vehicle_plate
- 司机 -> driver_name
- 承运商 -> carrier_name
- 当前位置 -> current_location
- 运单状态 -> order_status`,
  },
]);

const enterpriseOptions: EnterpriseOption[] = [
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

const managedSkills = ref<ManagedSkill[]>(
  skillSeed.map((skill, index) => ({
    ...skill,
    content: `# ${skill.name}\n\n## 适用范围\n${skill.category}\n\n## 执行指引\n根据用户任务识别所需数据和业务约束，调用 ${skill.name} 完成处理，并返回结构化结果与必要的执行说明。`,
    description: skillDescriptions[skill.id] ?? '',
    enabled: index !== 18,
    enterpriseIds: skill.enterpriseIds ?? [],
    fileName: `${skill.id}.skill.md`,
    updatedAt: index < 9 ? '2026-07-25 11:20' : '2026-07-23 09:15',
    updatedBy: index % 3 === 0 ? '王运营' : index % 3 === 1 ? '李产品' : '系统管理员',
    visibility: skill.visibility ?? '全部企业',
  })),
);

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
  { id: 'employees', label: '数据员工配置', desc: '抓取账号、登录方式、映射 Skill', icon: strokeIconPaths.bot },
  { id: 'tmsCustomers', label: 'TMS同步客户', desc: '客户提交、连接处理', icon: strokeIconPaths.usersRound, badge: store.unprocessedTmsSyncCustomerCount },
  { id: 'dataset', label: '标准数据集', desc: '运单字段、语义、数据示例', icon: strokeIconPaths.list },
  { id: 'skills', label: 'Skill 管理', desc: '通用技能、可见范围、系统提示词', icon: strokeIconPaths.settings },
]);
const skillManagementTabs: { id: SkillManagementTab; label: string }[] = [
  { id: 'skills', label: 'Skill 列表' },
  { id: 'systemPrompt', label: 'System Prompt 管理' },
];
const skillCategoryOptions: Array<'全部' | SkillCategory> = ['全部', '在途专家', '经营分析参谋', '运营助手', '运力与货源'];
const skillVisibilityOptions: SkillVisibility[] = ['全部企业', '指定企业'];

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
const employeeFormTitle = computed(() => (isEditingEmployee.value ? '编辑数据员工（TMS）' : '增加数据员工（TMS）'));
const employeeFormConfirmText = computed(() => (isEditingEmployee.value ? '保存' : '确认'));
const skillFormTitle = computed(() => (isEditingSkill.value ? '配置 Skill' : '添加 Skill'));
const filteredManagedSkills = computed(() => {
  const search = skillSearch.value.trim().toLowerCase();
  return managedSkills.value.filter((skill) => {
    const matchesCategory = skillCategoryFilter.value === '全部' || skill.category === skillCategoryFilter.value;
    const matchesSearch = !search || `${skill.name} ${skill.description} ${skill.fileName} ${skill.category}`.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
});
const filteredEnterpriseOptions = computed(() => {
  const search = enterpriseSearch.value.trim().toLowerCase();
  return enterpriseOptions.filter((enterprise) => !search || enterprise.name.toLowerCase().includes(search));
});
const filteredEmployeeEnterpriseOptions = computed(() => {
  const search = employeeEnterpriseSearch.value.trim().toLowerCase();
  return enterpriseOptions.filter((enterprise) => !search || enterprise.name.toLowerCase().includes(search));
});

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

function formatEmployeeVisibility(employee: DataEmployee) {
  if (employee.visibility === '全部企业') return '全部企业';
  const names = employee.enterpriseIds
    .map((id) => enterpriseOptions.find((enterprise) => enterprise.id === id)?.name)
    .filter(Boolean);
  return names.length ? names.join('、') : '未指定企业';
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
  employeeEnterpriseSearch.value = '';
  newEmployeeForm.name = '';
  newEmployeeForm.description = '';
  newEmployeeForm.loginUrl = '';
  newEmployeeForm.loginType = '无验证';
  newEmployeeForm.visibility = '全部企业';
  newEmployeeForm.enterpriseIds = [];
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
  newEmployeeForm.visibility = employee.visibility;
  newEmployeeForm.enterpriseIds = [...employee.enterpriseIds];
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

function toggleEmployeeEnterprise(enterpriseId: string) {
  newEmployeeForm.enterpriseIds = newEmployeeForm.enterpriseIds.includes(enterpriseId)
    ? newEmployeeForm.enterpriseIds.filter((id) => id !== enterpriseId)
    : [...newEmployeeForm.enterpriseIds, enterpriseId];
}

function confirmCreateEmployee() {
  const name = newEmployeeForm.name.trim();
  const description = newEmployeeForm.description.trim();
  const loginUrl = newEmployeeForm.loginUrl.trim();
  if (!name) {
    ElMessage.warning('请输入数据员工名称');
    return;
  }
  if (!description) {
    ElMessage.warning('请输入数据员工描述');
    return;
  }
  if (!loginUrl) {
    ElMessage.warning('请输入接入地址');
    return;
  }
  if (newEmployeeForm.visibility === '指定企业' && newEmployeeForm.enterpriseIds.length === 0) {
    ElMessage.warning('请至少选择一个可见企业');
    return;
  }
  if (!newEmployeeForm.skillFileName || !newEmployeeForm.skillContent) {
    ElMessage.warning('请上传数据获取映射 skill 文件');
    return;
  }

  const enterpriseIds = newEmployeeForm.visibility === '全部企业' ? [] : [...newEmployeeForm.enterpriseIds];
  if (isEditingEmployee.value) {
    const employee = dataEmployees.value.find((item) => item.id === editingEmployeeId.value);
    if (!employee) {
      ElMessage.warning('未找到需要编辑的数据员工');
      return;
    }
    const isSkillChanged = newEmployeeForm.skillFileName !== employee.skillFileName || newEmployeeForm.skillContent !== employee.skillContent;
    dataEmployees.value = dataEmployees.value.map((item) =>
      item.id === employee.id
        ? {
            ...item,
            name,
            description,
            loginUrl,
            loginType: newEmployeeForm.loginType,
            visibility: newEmployeeForm.visibility,
            enterpriseIds,
            skillContent: newEmployeeForm.skillContent,
            skillFileName: newEmployeeForm.skillFileName,
            skillUpdated: isSkillChanged ? '刚刚' : item.skillUpdated,
            skillVersion: isSkillChanged ? bumpVersion(item.skillVersion) : item.skillVersion,
          }
        : item,
    );
    selectedEmployeeId.value = employee.id;
    isCreateEmployeeModalOpen.value = false;
    resetNewEmployeeForm();
    ElMessage.success('数据员工已保存');
    return;
  }

  const employee: DataEmployee = {
    id: `custom-tms-${Date.now()}`,
    name,
    description,
    loginUrl,
    loginType: newEmployeeForm.loginType,
    visibility: newEmployeeForm.visibility,
    enterpriseIds,
    skillVersion: 'v1.0',
    skillUpdated: '刚刚',
    skillFileName: newEmployeeForm.skillFileName,
    skillContent: newEmployeeForm.skillContent,
  };
  dataEmployees.value = [employee, ...dataEmployees.value];
  selectedEmployeeId.value = employee.id;
  isCreateEmployeeModalOpen.value = false;
  resetNewEmployeeForm();
  ElMessage.success('数据员工已增加');
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
  dataEmployees.value = dataEmployees.value.map((item) =>
    item.id === employee.id
      ? {
          ...item,
          skillContent: content || item.skillContent,
          skillFileName: file.name,
          skillUpdated: '刚刚',
          skillVersion: bumpVersion(item.skillVersion),
        }
      : item,
  );
  selectedEmployeeId.value = employee.id;
  input.value = '';
  ElMessage.success(`${employee.name} 的数据映射 skill 已更新`);
}

function formatSkillVisibility(skill: ManagedSkill) {
  if (skill.visibility === '全部企业') return '全部企业';
  const names = skill.enterpriseIds
    .map((id) => enterpriseOptions.find((enterprise) => enterprise.id === id)?.name)
    .filter(Boolean);
  return names.length ? names.join('、') : '未指定企业';
}

function resetSkillForm() {
  editingSkillId.value = '';
  enterpriseSearch.value = '';
  skillForm.name = '';
  skillForm.description = '';
  skillForm.category = '在途专家';
  skillForm.visibility = '全部企业';
  skillForm.enterpriseIds = [];
  skillForm.fileName = '';
  skillForm.fileContent = '';
}

function openCreateSkillModal() {
  resetSkillForm();
  isSkillFormModalOpen.value = true;
}

function openEditSkillModal(skill: ManagedSkill) {
  editingSkillId.value = skill.id;
  enterpriseSearch.value = '';
  skillForm.name = skill.name;
  skillForm.description = skill.description;
  skillForm.category = skill.category;
  skillForm.visibility = skill.visibility;
  skillForm.enterpriseIds = [...skill.enterpriseIds];
  skillForm.fileName = skill.fileName;
  skillForm.fileContent = skill.content;
  isSkillFormModalOpen.value = true;
}

function closeSkillFormModal() {
  isSkillFormModalOpen.value = false;
  resetSkillForm();
}

function toggleSkillEnterprise(enterpriseId: string) {
  skillForm.enterpriseIds = skillForm.enterpriseIds.includes(enterpriseId)
    ? skillForm.enterpriseIds.filter((id) => id !== enterpriseId)
    : [...skillForm.enterpriseIds, enterpriseId];
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
  if (skillForm.visibility === '指定企业' && skillForm.enterpriseIds.length === 0) {
    ElMessage.warning('请至少选择一个企业');
    return;
  }
  if (!skillForm.fileName || !skillForm.fileContent) {
    ElMessage.warning('请上传 Skill 文件');
    return;
  }

  const enterpriseIds = skillForm.visibility === '全部企业' ? [] : [...skillForm.enterpriseIds];
  if (isEditingSkill.value) {
    managedSkills.value = managedSkills.value.map((skill) =>
      skill.id === editingSkillId.value
        ? {
            ...skill,
            name,
            description,
            category: skillForm.category,
            visibility: skillForm.visibility,
            enterpriseIds,
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
        visibility: skillForm.visibility,
        enterpriseIds,
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
  <div class="flex h-screen flex-col overflow-hidden bg-[#f7f7f5] text-slate-900">
    <header class="flex h-14 shrink-0 items-center justify-between border-b border-[#deded9] bg-white px-5">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#deded9] bg-[#f7f7f5] text-slate-700">
          <Icon :svg="strokeIconPaths.bot" :size="18" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-sm font-semibold leading-5 text-slate-950">智能体运营配置</h1>
          <p class="truncate text-xs leading-4 text-slate-500">数据员工、标准数据集、Skill 与系统提示词管理</p>
        </div>
      </div>
      <button type="button" class="rounded-md border border-[#deded9] px-3 py-1.5 text-xs text-slate-600 hover:bg-[#f7f7f5]" @click="router.push('/index')">
        返回工作台
      </button>
    </header>

    <main class="grid min-h-0 flex-1 grid-cols-[230px_minmax(0,1fr)] gap-3 p-4">
      <aside class="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
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

      <div class="min-h-0 overflow-hidden">
        <section v-if="activeTab === 'employees'" class="grid h-full min-h-0 grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)] gap-3">
        <div class="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
          <div class="flex h-11 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
            <h2 class="text-sm font-semibold leading-5 text-slate-950">数据员工列表</h2>
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-500">{{ dataEmployees.length }} 个数据员工</span>
              <button type="button" class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800" @click="openCreateEmployeeModal">
                增加数据员工（TMS）
              </button>
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-auto">
            <table class="w-full table-fixed border-collapse text-left text-sm">
              <thead class="sticky top-0 z-10 bg-[#f7f7f5]">
                <tr class="text-xs font-semibold text-slate-500">
                  <th class="px-4 py-3">数据员工</th>
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
                      <span class="inline-flex max-w-[230px] truncate rounded-md border border-[#deded9] bg-white px-2 py-0.5 text-xs text-slate-600" :title="formatEmployeeVisibility(employee)">
                        {{ employee.visibility === '全部企业' ? '全部企业可见' : `指定企业：${formatEmployeeVisibility(employee)}` }}
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
              <span>当前数据员工</span>
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
            <div class="flex shrink-0 items-center justify-between gap-3 border-b border-[#e2e2dc] px-4 py-3">
              <div class="flex min-w-0 flex-1 items-center gap-2">
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
              <button type="button" class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800" @click="openCreateSkillModal">
                <Icon :svg="strokeIconPaths.plus" :size="14" />
                添加 Skill
              </button>
            </div>

            <div class="min-h-0 flex-1 overflow-auto">
              <table class="w-full table-fixed border-collapse text-left text-sm">
                <thead class="sticky top-0 z-10 bg-[#f7f7f5]">
                  <tr class="text-xs font-semibold text-slate-500">
                    <th class="w-[20%] px-4 py-3">Skill 名称</th>
                    <th class="w-[11%] px-3 py-3">分类</th>
                    <th class="w-[17%] px-3 py-3">可见范围</th>
                    <th class="w-[23%] px-3 py-3">Skill 文件</th>
                    <th class="w-[15%] px-3 py-3">最后更新</th>
                    <th class="w-[14%] px-3 py-3">操作</th>
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
                      <div class="text-xs font-medium text-slate-700">{{ skill.visibility }}</div>
                      <div v-if="skill.visibility === '指定企业'" class="mt-1 max-w-[260px] truncate text-xs text-slate-400" :title="formatSkillVisibility(skill)">
                        {{ formatSkillVisibility(skill) }}
                      </div>
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

    <div v-if="isSkillFormModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
      <div class="flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-md border border-[#deded9] bg-white shadow-xl">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div class="flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
              <Icon :svg="strokeIconPaths.settings" :size="16" />
            </div>
            <h2 class="text-sm font-semibold leading-5 text-slate-950">{{ skillFormTitle }}</h2>
          </div>
          <button type="button" class="rounded-md p-1 text-slate-400 hover:bg-[#f7f7f5] hover:text-slate-700" title="关闭" @click="closeSkillFormModal">
            <Icon :svg="strokeIconPaths.x" :size="16" />
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">Skill 名称</span>
              <input
                v-model.trim="skillForm.name"
                class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400"
                placeholder="请输入 Skill 名称"
              />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">Skill 分类</span>
              <select v-model="skillForm.category" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-slate-400">
                <option v-for="category in skillCategoryOptions.slice(1)" :key="category" :value="category">{{ category }}</option>
              </select>
            </label>
          </div>

          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-600">Skill 描述</span>
            <textarea
              v-model.trim="skillForm.description"
              class="min-h-[82px] w-full resize-none rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm leading-5 outline-none focus:border-slate-400"
              placeholder="请输入用户侧技能卡片展示的功能描述"
            />
          </label>

          <div>
            <span class="mb-1.5 block text-xs font-medium text-slate-600">Skill 可见范围</span>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="visibility in skillVisibilityOptions"
                :key="visibility"
                type="button"
                class="h-10 rounded-md border text-sm font-medium transition"
                :class="skillForm.visibility === visibility ? 'border-slate-900 bg-slate-900 text-white' : 'border-[#deded9] bg-[#fbfbfa] text-slate-600 hover:bg-[#f7f7f5]'"
                @click="skillForm.visibility = visibility"
              >
                {{ visibility }}
              </button>
            </div>
          </div>

          <div v-if="skillForm.visibility === '指定企业'" class="overflow-hidden rounded-md border border-[#deded9]">
            <label class="relative block border-b border-[#e2e2dc] bg-[#fbfbfa] p-2">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                v-model.trim="enterpriseSearch"
                class="h-9 w-full rounded-md border border-[#deded9] bg-white pl-8 pr-3 text-xs outline-none focus:border-slate-400"
                placeholder="搜索企业名称"
              />
            </label>
            <div class="max-h-[190px] overflow-auto p-2">
              <button
                v-for="enterprise in filteredEnterpriseOptions"
                :key="enterprise.id"
                type="button"
                class="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-slate-600 hover:bg-[#f7f7f5]"
                @click="toggleSkillEnterprise(enterprise.id)"
              >
                <span>{{ enterprise.name }}</span>
                <span
                  class="flex h-4 w-4 items-center justify-center rounded border"
                  :class="skillForm.enterpriseIds.includes(enterprise.id) ? 'border-slate-900 bg-slate-900 text-white' : 'border-[#cfcfca] bg-white text-transparent'"
                >
                  <Icon :svg="strokeIconPaths.check" :size="11" />
                </span>
              </button>
              <div v-if="filteredEnterpriseOptions.length === 0" class="py-5 text-center text-xs text-slate-400">未找到企业</div>
            </div>
            <div class="border-t border-[#e2e2dc] bg-[#fbfbfa] px-3 py-2 text-xs text-slate-500">已选择 {{ skillForm.enterpriseIds.length }} 家企业</div>
          </div>

          <div>
            <span class="mb-1.5 block text-xs font-medium text-slate-600">Skill 文件</span>
            <label class="flex min-h-[82px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-[#cfcfca] bg-[#fbfbfa] px-3 py-3 text-center hover:bg-[#f7f7f5]">
              <Icon :svg="strokeIconPaths.upload" :size="18" svg-class="mb-1 text-slate-500" />
              <span class="text-sm font-medium text-slate-700">{{ skillForm.fileName || '选择 Skill 文件' }}</span>
              <span class="mt-1 text-xs text-slate-400">支持 .md / .txt / .yaml / .yml</span>
              <input class="hidden" type="file" accept=".md,.txt,.yaml,.yml" @change="uploadSkillFormFile" />
            </label>
          </div>
        </div>

        <div class="flex shrink-0 items-center justify-end gap-2 border-t border-[#e2e2dc] px-4 py-3">
          <button type="button" class="rounded-md border border-[#deded9] px-3 py-1.5 text-sm text-slate-600 hover:bg-[#f7f7f5]" @click="closeSkillFormModal">取消</button>
          <button type="button" class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800" @click="confirmSkillForm">
            {{ isEditingSkill ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>

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
          <span>可见范围：<strong class="font-medium text-slate-700">{{ formatSkillVisibility(previewingSkill) }}</strong></span>
          <span>最后更新：<strong class="font-medium text-slate-700">{{ previewingSkill.updatedAt }} · {{ previewingSkill.updatedBy }}</strong></span>
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

    <div v-if="isCreateEmployeeModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
      <div class="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-md border border-[#deded9] bg-white shadow-xl">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div class="flex items-center gap-2.5">
            <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
              <Icon :svg="strokeIconPaths.bot" :size="16" />
            </div>
            <h2 class="text-sm font-semibold leading-5 text-slate-950">{{ employeeFormTitle }}</h2>
          </div>
          <button type="button" class="rounded-md p-1 text-slate-400 hover:bg-[#f7f7f5] hover:text-slate-700" @click="closeCreateEmployeeModal">
            <Icon :svg="strokeIconPaths.x" :size="16" />
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
          <label class="block">
            <span class="mb-1.5 block text-xs font-medium text-slate-600">数据员工名称</span>
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
              placeholder="请输入该数据员工负责的目标系统、抓取范围或使用场景"
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

          <div>
            <span class="mb-1.5 block text-xs font-medium text-slate-600">可见范围</span>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="visibility in skillVisibilityOptions"
                :key="visibility"
                type="button"
                class="h-10 rounded-md border text-sm font-medium transition"
                :class="newEmployeeForm.visibility === visibility ? 'border-slate-900 bg-slate-900 text-white' : 'border-[#deded9] bg-[#fbfbfa] text-slate-600 hover:bg-[#f7f7f5]'"
                @click="newEmployeeForm.visibility = visibility"
              >
                {{ visibility }}
              </button>
            </div>
          </div>

          <div v-if="newEmployeeForm.visibility === '指定企业'" class="overflow-hidden rounded-md border border-[#deded9]">
            <label class="relative block border-b border-[#e2e2dc] bg-[#fbfbfa] p-2">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                v-model.trim="employeeEnterpriseSearch"
                class="h-9 w-full rounded-md border border-[#deded9] bg-white pl-8 pr-3 text-xs outline-none focus:border-slate-400"
                placeholder="搜索可见企业"
              />
            </label>
            <div class="max-h-[180px] overflow-auto p-2">
              <button
                v-for="enterprise in filteredEmployeeEnterpriseOptions"
                :key="enterprise.id"
                type="button"
                class="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-slate-600 hover:bg-[#f7f7f5]"
                @click="toggleEmployeeEnterprise(enterprise.id)"
              >
                <span>{{ enterprise.name }}</span>
                <span
                  class="flex h-4 w-4 items-center justify-center rounded border"
                  :class="newEmployeeForm.enterpriseIds.includes(enterprise.id) ? 'border-slate-900 bg-slate-900 text-white' : 'border-[#cfcfca] bg-white text-transparent'"
                >
                  <Icon :svg="strokeIconPaths.check" :size="11" />
                </span>
              </button>
              <div v-if="filteredEmployeeEnterpriseOptions.length === 0" class="py-5 text-center text-xs text-slate-400">未找到企业</div>
            </div>
            <div class="border-t border-[#e2e2dc] bg-[#fbfbfa] px-3 py-2 text-xs text-slate-500">已选择 {{ newEmployeeForm.enterpriseIds.length }} 家企业</div>
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

<style lang="scss" scoped></style>
