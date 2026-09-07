<script lang="ts" setup>
import type { ChatMessage, PageId, Project } from '../interface';

import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';
import { removeToken } from '@/utils/auth';

import { strokeIconPaths } from '../strokeIconPaths';
import { agentWorkRouteName } from '../useAgentWorkNav';
import { badgeToneClass, projectStatusTone } from '../utils';

const store = agentWorkData();
const { projects, recentConversations } = storeToRefs(store);
const route = useRoute();
const router = useRouter();
const isUserMenuOpen = ref(false);
const expandedProjectId = ref(store.currentProjectId);
const editingConversationId = ref('');
const editingConversationTitle = ref('');
const conversationTitleInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const currentUserName = computed(
  () => localStorage.getItem('iovagent_login_user') || import.meta.env.VITE_APP_DEFAULT_LOGIN_USERNAME || '演示用户',
);

const publicNavs: { icon: string; id: PageId; label: string }[] = [
  { id: 'knowledgeBase', label: '我的知识库', icon: strokeIconPaths.book },
  { id: 'knowledgeBaseEmpty', label: '我的知识库', icon: strokeIconPaths.book },
  { id: 'longTasks', label: '长期任务', icon: strokeIconPaths.alarmClock },
  { id: 'downloads', label: '下载', icon: strokeIconPaths.download },
];

interface KnowledgeBaseConversationCase {
  icon: string;
  id: string;
  messages: ChatMessage[];
  title: string;
}

const kbConversationCases: KnowledgeBaseConversationCase[] = [
  {
    id: 'KB-CASE-001',
    title: '货损赔付需要哪些材料',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '货损赔付需要哪些材料，赔付比例是多少？' },
      {
        role: 'agent',
        text: `根据《货损货差赔付标准》第 3.2 条，当运输过程中发生货物损坏、短缺或延误时，承运方需启动赔付流程。赔付申请材料主要包括四部分：一是原始运单及签收凭证，用于证明运输合同关系和货物交付状态；二是货物异常现场照片，需清晰展示受损部位、包装状态及车牌信息；三是货值证明，如发票、采购合同或报价单，用于核定实际损失金额；四是第三方检验报告，当货值较高或责任存在争议时，需由具备资质的检验机构出具。[1]\n\n赔付比例方面，标准规定在承运方全责情况下，可赔付实际损失的 80%–95%，具体比例根据货物类别、保价金额及合同条款综合确定。若托运方已购买足额保价运输，则按保价金额与实际损失较低者赔付；未保价货物通常按运费 3–7 倍或约定限额赔付，但最高不超过实际损失。[2] 对于冷链、危险品等特殊货物，赔付比例和举证要求会在专项条款中进一步细化，建议在发起赔付前仔细核对合同附件。[3]\n\n审批流程上，运营人员需在异常确认后 24 小时内提交初审材料，财务与法务分别在 2 个工作日内完成金额复核和责任认定，最终赔付方案由运营负责人审批后执行。[4] 若承运商对责任认定有异议，可在收到赔付通知后 5 个工作日内提交复议申请，并补充新的证据材料。[5]`,
        sources: [
          { name: '货损货差赔付标准.pdf', summary: '货物损坏、短缺、延误的赔付比例、举证要求和审批流程。', format: 'PDF' },
          { name: '运输合同模板_通用版.docx', summary: '标准运输合同条款，包含责任边界、异常责任和结算规则。', format: 'Word' },
          { name: '冷链到货时效管理规范.docx', summary: '冷链城配线路的时效要求、温控异常处理及到货确认标准。', format: 'Word' },
          { name: '在途异常处理SOP_V3.2.pdf', summary: '定义异常停车、轨迹造假、非计划经停等场景的处理流程、责任人和升级规则。', format: 'PDF' },
          { name: '承运商服务等级协议SLA.pdf', summary: '不同等级承运商的服务承诺、违约责任和赔付上限。', format: 'PDF' },
        ],
      },
    ],
  },
  {
    id: 'KB-CASE-002',
    title: '非目的地物流园长停处置',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '发现车辆在非目的地物流园长停，应该怎么处理？' },
      {
        role: 'agent',
        text: `参考《在途异常处理SOP》第 5 条，当系统识别到车辆在非目的地物流园或货场长时间停靠，且停靠时长超过阈值（默认 60 分钟）时，会自动标记为高风险异常停车。运营人员需在 30 分钟内联系司机核实原因，要求司机提供现场照片、货物封签状态及停靠点 POI 信息，并同步承运商调度进行复核。[1]\n\n处置动作分为三步：第一步，通过智能体或 TMS 确认该停靠点是否为客户授权的中转仓、临时卸货点或维修点；第二步，若未经授权，要求司机说明原因并保留通话录音、微信记录等证据；第三步，根据风险等级决定是否升级至安全部门或客户侧进行人工介入。[2] 对于频繁出现非计划经停的线路或承运商，应纳入重点监控名单，并在月度考核中扣分。[3]\n\n典型案例方面，《皖K55821第三方中转仓经停案例》详细复盘了合肥仓→南京仓线路中，车辆在第三方中转仓非合同经停 73 分钟的处置过程。该案例显示，运营通过 GPS 轨迹、司机电话和现场照片三方交叉验证，最终确认存在倒货风险，并对承运商进行了处罚和整改要求。[4]\n\n此外，《车辆GPS轨迹真实性校验规范》指出，当异常停车伴随 GPS 断点、速度跳变或点火状态不一致时，需高度警惕轨迹造假风险，应启动轨迹真实性复核并保留证据链。[5] 对于危化品、冷链等特殊货物，非计划经停还可能触发温控异常或安全合规风险，需按专项预案处理。[6]\n\n从合同管理角度看，《运输合同模板_通用版》明确了异常责任和费用扣款条款，可作为非计划经停追责的依据。[7] 日常监控中，《华东干线在途监控日报模板》提供了异常运单汇总字段，便于运营每日复核重点车辆。[8]`,
        sources: [
          { name: '在途异常处理SOP_V3.2.pdf', summary: '定义异常停车、轨迹造假、非计划经停等场景的处理流程、责任人和升级规则。', format: 'PDF' },
          { name: '皖K55821第三方中转仓经停案例.pdf', summary: '合肥仓→南京仓线路中，车辆在第三方中转仓非合同经停的处置与复盘。', format: 'PDF' },
          { name: '承运商履约考核办法_2026Q3.docx', summary: '承运商KPI指标、评分规则、奖惩标准及月度考核输出模板。', format: 'Word' },
          { name: '非目的地物流园长停处置细则.pdf', summary: '非计划停靠点的识别规则、处置动作和升级流程。', format: 'PDF' },
          { name: '车辆GPS轨迹真实性校验规范.pdf', summary: 'GPS断点、速度跳变、点火状态不一致等异常识别方法。', format: 'PDF' },
          { name: '冷链到货时效管理规范.docx', summary: '冷链城配线路的时效要求、温控异常处理及到货确认标准。', format: 'Word' },
          { name: '运输合同模板_通用版.docx', summary: '标准运输合同条款，包含责任边界、异常责任和结算规则。', format: 'Word' },
          { name: '华东干线在途监控日报模板.xlsx', summary: '日报字段、统计口径及异常运单汇总模板。', format: 'Excel' },
        ],
      },
    ],
  },
  {
    id: 'KB-CASE-003',
    title: '承运商月度考核指标',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '承运商月度考核主要看哪些指标？' },
      {
        role: 'agent',
        text: `依据《承运商履约考核办法》第 2 章，承运商月度考核采用百分制，核心指标包括五大类：一是到货准时率，权重 30%，按实际到达时间与合同约定的偏差计算；二是异常率，权重 25%，包括异常停车、轨迹造假、货损货差等事件的发生频次；三是轨迹完整率，权重 20%，考核 GPS 在线时长、定位连续性和数据回传及时性；四是客户投诉率，权重 15%，以客户主动投诉次数除以总运单量计算；五是回单及时率，权重 10%，考核签收单据回传速度。[1]\n\n评分规则上，每个指标设置目标值、警戒值和红线值。达到目标值得满分，介于警戒值与目标值之间按比例扣分，低于警戒值不得分，触及红线值则当月考核直接降级。[2] 考核结果与奖惩直接挂钩：月度评分 90 分以上为 A 级，可获得优先派单权和奖励系数；80–89 分为 B 级，正常结算；70–79 分为 C 级，触发整改通知并限制新线路分配；70 分以下为 D 级，暂停合作并启动清退评估。[3]\n\n数据输出方面，系统每月自动生成《承运商月度考核报告》，包含各指标得分、环比变化、异常事件明细及改进建议。报告模板和字段定义可参考《承运商履约考核办法》附件。[4] 对于连续两个月评为 C 级或当月评为 D 级的承运商，运营部门需组织专项复盘会议，并形成书面整改计划。[5]\n\n需要特别说明的是，不同业务类型（如干线、城配、冷链、大件）的指标权重和阈值会有所差异，具体以项目级 SLA 为准。[6]`,
        sources: [
          { name: '承运商履约考核办法_2026Q3.docx', summary: '承运商KPI指标、评分规则、奖惩标准及月度考核输出模板。', format: 'Word' },
          { name: '承运商服务等级协议SLA.pdf', summary: '不同等级承运商的服务承诺、违约责任和赔付上限。', format: 'PDF' },
          { name: '在途异常处理SOP_V3.2.pdf', summary: '定义异常停车、轨迹造假、非计划经停等场景的处理流程、责任人和升级规则。', format: 'PDF' },
          { name: '华东干线在途监控日报模板.xlsx', summary: '日报字段、统计口径及异常运单汇总模板。', format: 'Excel' },
          { name: '在途异常事件分类与编码.xlsx', summary: '异常事件分类、编码规则及关联责任方定义。', format: 'Excel' },
          { name: '运输合同模板_通用版.docx', summary: '标准运输合同条款，包含责任边界、异常责任和结算规则。', format: 'Word' },
        ],
      },
    ],
  },
  {
    id: 'KB-CASE-004',
    title: '@案例库 轨迹造假处罚',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '@案例库 帮我找一下轨迹造假的处罚案例' },
      {
        role: 'agent',
        text: `仅在"案例库"文件夹下检索，找到 3 个轨迹造假相关处罚案例。其中最典型的是《沪A12345轨迹造假复核案例》：该车在执行上海工厂→广州仓运输任务时，GPS 出现多个断点，速度曲线存在异常跳变，且点火状态与定位连续性不一致。系统判定为轨迹可信度异常后，运营启动轨迹真实性复核，收集了行车记录仪片段、高速通行记录和司机通话录音，最终确认存在轨迹补传和设备离车嫌疑。[1]\n\n处罚结果方面，承运商被认定为严重违约，当月考核直接评为 D 级，暂停新线路分配 3 个月；涉事车辆列入黑名单，6 个月内不得承接高价值货物运输；同时依据《承运商服务等级协议SLA》，对本次异常处以 5000 元违约金，并要求承运商提交书面整改报告。[2]\n\n另一个案例涉及皖K55821，虽然其主要风险是非合同经停，但复核过程中同样发现 GPS 轨迹在经停前后存在速度跳变，被作为轨迹造假的关联证据使用，处罚时加重了扣分档次。[3]\n\n从制度依据看，《车辆GPS轨迹真实性校验规范》明确将 GPS 断点、速度跳变、点火状态冲突、定位漂移等列为高风险特征；《在途异常处理SOP》规定了轨迹异常的复核流程和证据链要求；《承运商履约考核办法》则定义了对应的考核扣分和清退标准。[4][5][6]\n\n另外，《非目的地物流园长停处置细则》也对非合同经停场景下的轨迹核查提出了补充要求，可作为同类场景的交叉参考。[7]`,
        sources: [
          { name: '沪A12345轨迹造假复核案例.pdf', summary: 'GPS断点、速度跳变与点火状态冲突的轨迹造假识别和取证过程。', format: 'PDF' },
          { name: '承运商服务等级协议SLA.pdf', summary: '不同等级承运商的服务承诺、违约责任和赔付上限。', format: 'PDF' },
          { name: '皖K55821第三方中转仓经停案例.pdf', summary: '合肥仓→南京仓线路中，车辆在第三方中转仓非合同经停的处置与复盘。', format: 'PDF' },
          { name: '车辆GPS轨迹真实性校验规范.pdf', summary: 'GPS断点、速度跳变、点火状态不一致等异常识别方法。', format: 'PDF' },
          { name: '在途异常处理SOP_V3.2.pdf', summary: '定义异常停车、轨迹造假、非计划经停等场景的处理流程、责任人和升级规则。', format: 'PDF' },
          { name: '承运商履约考核办法_2026Q3.docx', summary: '承运商KPI指标、评分规则、奖惩标准及月度考核输出模板。', format: 'Word' },
          { name: '非目的地物流园长停处置细则.pdf', summary: '非计划停靠点的识别规则、处置动作和升级流程。', format: 'PDF' },
        ],
      },
    ],
  },
  {
    id: 'KB-CASE-005',
    title: '上传附件存入知识库',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '附件：承运商月度考核细则_2026Q3.xlsx\n\n帮我把这份文件存到知识库里，后续考核问题直接引用它。' },
      {
        role: 'agent',
        text: `已收到附件《承运商月度考核细则_2026Q3.xlsx》（大小 1.8 MB，共 6 个工作表）。这条消息下方已展示「1 个附件 · 将文件加入知识库」操作条，点击按钮即可将该附件送入知识库解析队列；按钮变为绿色「已加入知识库」即表示已提交，附件仍保留在对话中供本次问答使用。[1]\n\n加入知识库后，系统将依次执行：文本与表格结构抽取 → 生成 50–80 字 AI 简介 → 向量化入库。解析完成后，该文件会出现在"全部文件"列表中，并展示格式图标、大小、页数与简介；后续你在对话中提问（如"承运商月度考核主要看哪些指标"）时，系统会默认检索该文件并以角标形式引用具体段落。[2]\n\n若附件格式不在支持范围（如图片、压缩包）或单文件超过 100 MB，会在上传阶段直接拦截并提示原因；知识库总容量已达 80% 或 500 MB 上限时，也会在上传前给出明确的预警或拒绝提示。[3]`,
        sources: [
          { name: '承运商月度考核细则_2026Q3.xlsx', summary: '2026Q3 承运商月度考核指标、权重、评分规则及奖惩标准。', format: 'Excel' },
          { name: '知识库功能需求文档.pdf', summary: '个人知识库的上传、解析、检索与引用规则说明。', format: 'PDF' },
          { name: '承运商服务等级协议SLA.pdf', summary: '不同等级承运商的服务承诺、违约责任和赔付上限。', format: 'PDF' },
        ],
      },
    ],
  },
  {
    id: 'KB-CASE-006',
    title: '分析我的线路运量和用车情况',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '分析我的线路运量和用车情况' },
      {
        role: 'agent',
        text: `根据你在大卡数字人中的业务调用，累计沉淀 1,200 辆活跃车辆、86 条常跑线路、340 个业务 POI。高频线路包括上海→杭州（累计 32 趟，食品快消）、苏州→南京（累计 28 趟，汽车零部件）、深圳→广州（累计 35 趟，电子数码）等；车辆以重型厢式货车和仓栅式货车为主，平均活跃天数 25 天，载重集中在 8.5–33 吨之间。[1]\n\n从用车结构看，活跃车辆中 30% 以上为高频线路固定用车，约 45% 车辆跨多条线路运营；POI 以发货地（上海外高桥物流中心、杭州钱塘智造园等）和收货地（苏州工业园区集散点、南京江宁物流园等）为主，经停点占比约 15%，多为途中加油站或服务区。[2]\n\n你可以在"我的知识库 → 平台数据资产"页查看地图可视化与明细列表，也可以继续上传真实运单、对接 TMS，做更细粒度的线路运量、车辆利用率与异常高发区域分析。[3]`,
        sources: [
          { name: '平台数据资产（车辆 / 线路 / POI）', summary: '基于大卡数字人业务调用自动沉淀的车辆、线路与 POI 数据。', format: 'Data' },
          { name: '知识库功能需求文档.pdf', summary: '个人知识库的上传、解析、检索与引用规则说明。', format: 'PDF' },
          { name: '承运商履约考核办法_2026Q3.docx', summary: '承运商KPI指标、评分规则、奖惩标准及月度考核输出模板。', format: 'Word' },
        ],
      },
    ],
  },
  {
    id: 'PDA-CASE-001',
    title: '运单明细查询 · 冀E03166D',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '查一下冀E03166D 的运单详情' },
      {
        role: 'agent',
        text: `该车当前有 1 单待开始的运单：起始地为邢台金隅冀东水泥有限公司，目的地为临城县鑫旺建材有限公司，货物为 P·O42.5 散装水泥，运输形态一装一卸；当前未指派司机，计划出发 / 到达时间未设置，尚未触发任何围栏事件。[1]`,
        sources: [
          { name: '运单主数据', summary: '客户创建 / 导入 / API 推送的运单任务，26 字段。', format: 'Data' },
        ],
      },
      { role: 'user', text: '这单是什么时候创建的？来源是哪里？' },
      {
        role: 'agent',
        text: `该运单创建于 2026-08-27 13:21:58，创建人字段为"api 接口"——即通过开放接口推单生成，而非在平台手工创建。接口推单是客户将自有系统运单同步到大卡数字人的常用方式，推单后即自动沉淀进平台数据资产。[1]`,
        sources: [
          { name: '运单主数据', summary: '客户创建 / 导入 / API 推送的运单任务，26 字段。', format: 'Data' },
        ],
      },
      { role: 'user', text: '今天 API 推单还创建了哪些运单？' },
      {
        role: 'agent',
        text: `今日（2026-08-27）API 推单共创建 15 单，均为金隅水泥体系的一装一卸散装水泥运输。起始地集中在邢台金隅冀东水泥、邯郸涉县金隅水泥、河北金隅鼎鑫水泥等厂区，目的地为各地建材经销商与商砼公司。其中沪A79631D（邯郸市东方日盛商品混凝土）、沪A79692D 两单已登记司机手机号（13831051153、13171778506），其余车辆暂未指派司机，全部状态为待开始。[1][2]`,
        sources: [
          { name: '运单主数据', summary: '客户创建 / 导入 / API 推送的运单任务，26 字段。', format: 'Data' },
          { name: '车辆明细数据', summary: '接口查询 / 传入的车辆档案信息。', format: 'Data' },
        ],
      },
    ],
  },
  {
    id: 'PDA-CASE-002',
    title: '在途异常追踪 · 冀A32286D',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '冀A32286D 最近有什么异常？' },
      {
        role: 'agent',
        text: `该车存在一条持续中的"在途离线"事件，等级轻度。运单 CDX2SQ2026073409（河北金隅鼎鑫水泥有限公司 → 石家庄土石供应链管理有限公司）运输过程中，车辆在石家庄市藁城区机场连接线出口（西向）北 629 米附近 GPS 信号中断，最新记录离线时长 3 小时 31 分钟。建议优先联系司机核实是设备问题还是信号盲区。[1]`,
        sources: [
          { name: '在途事件明细', summary: '在途触发的 19 类事件流水，含等级、内容与位置。', format: 'Data' },
        ],
      },
      { role: 'user', text: '从什么时候开始离线的？现在多久了？' },
      {
        role: 'agent',
        text: `离线自 2026-08-26 夜间开始：事件流水显示首次记录创建于 2026-08-27 00:13:21（离线 3 小时），最近一次更新为 02:07:57（离线 3 小时 31 分钟），时长随时间持续累计。同一离线事件按"单据号 + 事件类型 + 事件地址"归并为一条持续事件，不重复计数。[1]`,
        sources: [
          { name: '在途事件明细', summary: '在途触发的 19 类事件流水，含等级、内容与位置。', format: 'Data' },
        ],
      },
      { role: 'user', text: '除了它，现在还有别的车有异常吗？' },
      {
        role: 'agent',
        text: `当前在途运单中未发现新的超时停车、线路偏离等异常事件。冀E03166D 等 15 辆车为今日新创建的待开始运单，尚未进入在途环节。冀A32286D 是当前唯一存在异常记录的车辆，建议优先处置，并在恢复在线后核对该段轨迹的完整性。[1][2]`,
        sources: [
          { name: '在途事件明细', summary: '在途触发的 19 类事件流水，含等级、内容与位置。', format: 'Data' },
          { name: '在途监控', summary: '运单在途状态、风险等级与异常说明。', format: 'Data' },
        ],
      },
    ],
  },
  {
    id: 'PDA-CASE-003',
    title: '高风险运单 · WB20260509001',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '现在有哪些高风险的在途运单？' },
      {
        role: 'agent',
        text: `当前共 2 单高风险运单：一是 WB20260509001，沪A12345 · 张师傅，上海工厂 → 广州仓（安捷物流），在途状态，异常说明为"异常停车 / GPS 疑似造假"，来源为规则预警 + GPS 分析；二是 WB20260509004，川A66520 · 赵师傅，成都工厂 → 重庆仓（顺达货运），装货中，异常说明为"装车超时"，来源为规则预警。另有浙C77812（宁波港 → 合肥仓）为低风险，存在服务区长停。[1]`,
        sources: [
          { name: '在途监控', summary: '运单在途状态、风险等级与异常说明。', format: 'Data' },
        ],
      },
      { role: 'user', text: 'WB20260509001 具体什么情况？该怎么处理？' },
      {
        role: 'agent',
        text: `该运单 2026-05-15 08:05 起在途，系统先通过规则预警识别到异常停车，再经 GPS 分析发现轨迹存在断点与速度跳变，判定为疑似轨迹造假，两项叠加升级为高风险。建议处置顺序：第一步 30 分钟内联系张师傅核实停车原因并保留通话记录；第二步调取该时段行车记录仪与高速通行记录交叉验证轨迹真实性；第三步若确认造假，按承运商考核办法启动违约处理与黑名单流程。需要的话我可以把该运单的完整事件流水整理成表格导出。[1][2]`,
        sources: [
          { name: '在途监控', summary: '运单在途状态、风险等级与异常说明。', format: 'Data' },
          { name: '在途事件明细', summary: '在途触发的 19 类事件流水，含等级、内容与位置。', format: 'Data' },
        ],
      },
    ],
  },
  {
    id: 'PDA-CASE-004',
    title: '接口调用数据 · 车辆与车天数',
    icon: strokeIconPaths.msg,
    messages: [
      { role: 'user', text: '我们调用过哪些车？' },
      {
        role: 'agent',
        text: `你的账号通过开放接口累计调用 15 辆车的明细数据，其中冀字头 10 辆、沪字头 5 辆。车牌颜色方面，冀E03166D、冀D09809D 等 D 结尾车牌为新能源绿牌，其余为蓝牌。这些车辆档案（车牌号、颜色、车型、载重）在接口调用时已自动沉淀，可随时查询。[1]`,
        sources: [
          { name: '车辆明细数据', summary: '接口查询 / 传入的车辆档案信息。', format: 'Data' },
        ],
      },
      { role: 'user', text: '一共调用了多少车天数？哪些车最多？' },
      {
        role: 'agent',
        text: `账号累计调用 86 车天数，涉及 15 辆车。调用最多的前三位：冀A32286D（12 车天数）、冀E03166D（10 车天数）、沪A79631D（9 车天数），单次调用时长从 1 天到 10 天不等。说明：车天数是接口按车按天调用的计量数据，仅作为可查询的数据资产呈现，不作为计费口径。[1]`,
        sources: [
          { name: '车天数', summary: '接口按车按天调用计量，仅内部可查询，非计费口径。', format: 'Data' },
        ],
      },
      { role: 'user', text: '冀A32286D 既是接口调用的车，也有运单，数据怎么算的？' },
      {
        role: 'agent',
        text: `双渠道数据合并为一辆车：车辆资产侧，冀A32286D 同时出现在接口调用车辆明细和平台运单中，来源标记为"双渠道"；运单数取系统使用侧（运单主数据中的承运记录），车辆档案信息取两个渠道字段的并集。这样无论客户从哪个入口产生数据，资产视图都是完整的一辆车的画像。[1][2]`,
        sources: [
          { name: '车辆明细数据', summary: '接口查询 / 传入的车辆档案信息。', format: 'Data' },
          { name: '运单主数据', summary: '客户创建 / 导入 / API 推送的运单任务，26 字段。', format: 'Data' },
        ],
      },
    ],
  },
];

const projectNavs: { icon: string; id: PageId; label: string }[] = [
  { id: 'agent', label: '智能体工作台', icon: strokeIconPaths.bot },
  { id: 'orders', label: '运单列表', icon: strokeIconPaths.list },
  { id: 'risk', label: '异常运单列表', icon: strokeIconPaths.shield },
  { id: 'detail', label: '运单详情与地图', icon: strokeIconPaths.map },
];

function goNav(page: PageId) {
  if (page === 'projectCreate') {
    router.push({ name: agentWorkRouteName[page], query: { from: route.fullPath } });
    return;
  }
  router.push({ name: agentWorkRouteName[page] });
}

function isNavActive(page: PageId) {
  if (page === 'projects' && route.name === agentWorkRouteName.projectCreate) return true;
  return route.name === agentWorkRouteName[page];
}

function startNewConversation() {
  store.startNewConversation();
  expandedProjectId.value = '';
  goNav('agent');
}

function openConversation(conversationId: string) {
  store.openConversation(conversationId);
  expandedProjectId.value = '';
  goNav('agent');
}

function openKnowledgeBaseConversation(item: KnowledgeBaseConversationCase) {
  store.startNewConversation();
  store.agentMessages = item.messages.map((message) => ({ ...message }));
  store.currentConversationId = item.id;
  expandedProjectId.value = '';
  goNav('agent');
}

function toggleProject(project: Project) {
  if (expandedProjectId.value === project.id) {
    expandedProjectId.value = '';
    return;
  }
  expandedProjectId.value = project.id;
  store.switchProject(project);
  goNav('agent');
}

function openProjectPage(page: PageId) {
  goNav(page);
}

function startConversationTitleEdit(conversationId: string, title: string) {
  editingConversationId.value = conversationId;
  editingConversationTitle.value = title;
  nextTick(() => {
    const inputRef = Array.isArray(conversationTitleInputRef.value)
      ? conversationTitleInputRef.value[0]
      : conversationTitleInputRef.value;
    inputRef?.focus();
    inputRef?.select();
  });
}

function commitConversationTitleEdit() {
  if (!editingConversationId.value) return;
  store.renameConversation(editingConversationId.value, editingConversationTitle.value);
  editingConversationId.value = '';
  editingConversationTitle.value = '';
}

function cancelConversationTitleEdit() {
  editingConversationId.value = '';
  editingConversationTitle.value = '';
}

function logout() {
  removeToken();
  localStorage.removeItem('token');
  localStorage.removeItem('iovagent_login_user');
  isUserMenuOpen.value = false;
  router.replace('/login');
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col overflow-hidden border-r border-[#e7e7e4] bg-[#f5f5f3]">
    <div class="shrink-0 px-4 pt-4 pb-3">
      <div class="flex h-9 items-center gap-2.5">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#deded9] bg-white text-slate-700">
          <Icon :svg="strokeIconPaths.truck" :size="18" />
        </span>
        <span class="truncate text-sm font-semibold text-slate-950">物流通用智能体</span>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-3">
      <button
        type="button"
        class="flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm font-medium transition"
        :class="
          store.workspaceMode === 'conversation' && !store.currentConversationId && isNavActive('agent')
            ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.05)]'
            : 'text-slate-700 hover:bg-white/80 hover:text-slate-950'
        "
        @click="startNewConversation"
      >
        <Icon :svg="strokeIconPaths.plus" :size="17" />
        新对话
      </button>
    </div>

    <div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <nav class="space-y-1 border-b border-[#e3e3df] pb-4">
        <button
          v-for="item in publicNavs"
          :key="item.id"
          type="button"
          class="flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm transition"
          :class="isNavActive(item.id) ? 'bg-white font-medium text-slate-950' : 'text-slate-600 hover:bg-white/75 hover:text-slate-900'"
          @click="goNav(item.id)"
        >
          <Icon :svg="item.icon" :size="16" />
          {{ item.label }}
        </button>
      </nav>

      <section class="pt-4">
        <div class="mb-1 flex h-7 items-center px-2">
          <h2 class="text-xs font-medium text-slate-500">最近对话</h2>
        </div>
        <div class="space-y-0.5">
          <div
            v-for="conversation in recentConversations"
            :key="conversation.id"
            class="group flex min-h-9 items-center rounded-md transition"
            :class="
              store.workspaceMode === 'conversation' && store.currentConversationId === conversation.id && isNavActive('agent')
                ? 'bg-white'
                : 'hover:bg-white/75'
            "
          >
            <template v-if="editingConversationId === conversation.id">
              <input
                ref="conversationTitleInputRef"
                v-model="editingConversationTitle"
                type="text"
                maxlength="40"
                class="mx-1 h-8 min-w-0 flex-1 rounded-md border border-blue-400 bg-white px-2 text-xs text-slate-900 outline-none ring-2 ring-blue-100"
                aria-label="编辑对话标题"
                @blur="commitConversationTitleEdit"
                @keydown.enter.prevent="commitConversationTitleEdit"
                @keydown.esc.prevent="cancelConversationTitleEdit"
              />
            </template>
            <template v-else>
              <button
                type="button"
                class="flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-xs text-slate-700"
                @click="openConversation(conversation.id)"
              >
                <Icon :svg="strokeIconPaths.msg" :size="14" svg-class="shrink-0 text-slate-400" />
                <span class="min-w-0 flex-1 truncate">{{ conversation.title }}</span>
              </button>
              <button
                type="button"
                class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-[#eeeeeb] hover:text-slate-800 focus:opacity-100 group-hover:opacity-100"
                :aria-label="`修改对话标题：${conversation.title}`"
                title="修改标题"
                @click="startConversationTitleEdit(conversation.id, conversation.title)"
              >
                <Icon :svg="strokeIconPaths.edit" :size="13" />
              </button>
            </template>
          </div>

          <button
            v-for="item in kbConversationCases"
            :key="item.id"
            type="button"
            class="group flex h-9 w-full items-center rounded-md px-2.5 text-left text-xs text-slate-700 transition hover:bg-white/75"
            @click="openKnowledgeBaseConversation(item)"
          >
            <Icon :svg="item.icon" :size="14" svg-class="shrink-0 text-slate-400" />
            <span class="ml-2 min-w-0 flex-1 truncate">{{ item.title }}</span>
          </button>
        </div>
      </section>

      <section class="pt-5">
        <div class="mb-1 flex h-8 items-center justify-between gap-2 px-2">
          <h2 class="text-xs font-medium text-slate-500">项目</h2>
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-slate-500 transition hover:bg-white hover:text-slate-900"
              :class="isNavActive('projectCreate') ? 'bg-white font-medium text-slate-950' : ''"
              @click="goNav('projectCreate')"
            >
              <Icon :svg="strokeIconPaths.plus" :size="13" />
              新建
            </button>
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-slate-500 transition hover:bg-white hover:text-slate-900"
              :class="isNavActive('projects') ? 'bg-white font-medium text-slate-950' : ''"
              @click="goNav('projects')"
            >
              <Icon :svg="strokeIconPaths.settings" :size="13" />
              管理
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <div v-for="project in projects" :key="project.id">
            <button
              type="button"
              class="w-full rounded-md px-2.5 py-2 text-left transition hover:bg-white/75"
              :class="expandedProjectId === project.id ? 'bg-white' : ''"
              :aria-expanded="expandedProjectId === project.id"
              @click="toggleProject(project)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="min-w-0 truncate text-xs font-medium text-slate-800">{{ project.name }}</span>
                <Icon
                  :svg="strokeIconPaths.chevron"
                  :size="13"
                  :svg-class="expandedProjectId === project.id ? 'shrink-0 rotate-90 text-slate-500' : 'shrink-0 text-slate-400'"
                />
              </div>
              <div class="mt-1 flex items-center justify-between gap-2">
                <span class="truncate text-[11px] leading-4 text-slate-400">今日 {{ project.total }} 单 · {{ project.risk }} 异常</span>
                <span
                  class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-3.5"
                  :class="badgeToneClass(projectStatusTone(project.status))"
                >
                  {{ project.status }}
                </span>
              </div>
            </button>

            <div v-if="expandedProjectId === project.id" class="relative ml-3 mt-1 space-y-0.5 pl-3 before:absolute before:top-1 before:bottom-1 before:left-0 before:w-px before:bg-[#d9d9d4]">
              <button
                v-for="item in projectNavs"
                :key="item.id"
                type="button"
                class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs transition"
                :class="
                  store.workspaceMode === 'project' && store.currentProjectId === project.id && isNavActive(item.id)
                    ? 'bg-white font-medium text-slate-950'
                    : 'text-slate-500 hover:bg-white/75 hover:text-slate-900'
                "
                @click="openProjectPage(item.id)"
              >
                <Icon :svg="item.icon" :size="14" />
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="relative shrink-0 border-t border-[#e3e3df] bg-[#f5f5f3] p-3">
      <div
        v-if="isUserMenuOpen"
        class="absolute right-3 bottom-full left-3 z-20 mb-2 overflow-hidden rounded-md border border-[#deded9] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
      >
        <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#f7f7f5]" @click="logout">
          <Icon :svg="strokeIconPaths.x" :size="15" />
          退出登录
        </button>
      </div>
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 transition hover:bg-white"
        @click="isUserMenuOpen = !isUserMenuOpen"
      >
        <span class="flex min-w-0 items-center gap-2">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#deded9] bg-white text-slate-600">
            <Icon :svg="strokeIconPaths.user" :size="15" />
          </span>
          <span class="min-w-0">
            <span class="block text-[11px] leading-4 text-slate-400">当前用户</span>
            <span class="block truncate text-xs font-medium leading-4 text-slate-800">{{ currentUserName }}</span>
          </span>
        </span>
        <Icon :svg="strokeIconPaths.chevron" :size="14" :svg-class="isUserMenuOpen ? '-rotate-90 text-slate-500' : 'rotate-90 text-slate-400'" />
      </button>
    </div>
  </aside>
</template>

<style lang="scss">
.sidebar-scroll {
  scrollbar-color: #d4d4cf transparent;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.sidebar-scroll::-webkit-scrollbar {
  width: 6px;
}

.sidebar-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #d4d4cf;
}
</style>
