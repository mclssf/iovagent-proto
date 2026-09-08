<script lang="ts" setup>
import type { AgentResultLink, ChatMessage, TimelineEvent } from '../interface';
import type { LatLngExpression, LatLngTuple } from 'leaflet';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { Icon } from '@packages/icon';

import { agentWorkData, quickPrompts, rightPanelTabs } from '@/pinia/agentWork';

import { getRiskOrders, badgeToneClass } from '../utils';
import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import WaybillImportDialog from '../component/waybillImport.dialog.vue';
import AnalysisReportView from './analysisReport.view.vue';

const store = agentWorkData();
const { agentMessages, agentInput } = storeToRefs(store);
const { goPage, createDownload, sendAgent } = useAgentWorkNav();
const agentMessageListRef = ref<HTMLDivElement | null>(null);
const panelMapRef = ref<HTMLDivElement | null>(null);
const panelRouteDistance = ref('约 175 km');
const panelRouteDuration = ref('约 2h 40m');

let panelMapInstance: L.Map | null = null;

type MapTone = 'current' | 'end' | 'risk' | 'start' | 'stop' | 'warn';

interface MapPoint {
  coord: LatLngTuple;
  desc: string;
  name: string;
  tone: MapTone;
}

interface AgentModelOption {
  icon?: string;
  iconClass: string;
  label: string;
  logoUrl?: string;
  value: string;
}

interface NewConversationGuide {
  action?: 'projectCreate';
  description: string;
  icon: string;
  iconClass: string;
  prompt: string;
  title: string;
  upload?: boolean;
  uploadPurpose?: 'regular' | 'waybill';
}

interface PendingWaybillImport {
  files: File[];
  importedCount: number;
  source: 'regular' | 'waybill';
}

const waybillImportPrompt = '导入运单并开始监控车辆在途状态和异常风险';

const agentModelOptions: AgentModelOption[] = [
  { value: 'auto', label: '自动', icon: strokeIconPaths.zap, iconClass: 'bg-slate-100 text-slate-700' },
  {
    value: 'qwen-3.7',
    label: 'Qwen-3.7',
    logoUrl: 'https://img.alicdn.com/imgextra/i1/O1CN013ltlI61OTOnTStXfj_!!6000000001706-55-tps-330-327.svg',
    iconClass: 'bg-white',
  },
  {
    value: 'deepseek-v4-flash',
    label: 'Deepseek-V4-Flash',
    logoUrl: 'https://www.deepseek.com/favicon.ico',
    iconClass: 'bg-white',
  },
  {
    value: 'minimax-m3',
    label: 'MiniMax-M3',
    logoUrl: 'https://filecdn.minimax.chat/public/58eca777-e31f-448a-9823-e2220e49b426.png',
    iconClass: 'bg-white',
  },
];

const newConversationGuides: NewConversationGuide[] = [
  {
    title: '查询车辆',
    description: '实时位置 · 航向 · 速度',
    prompt: '查询车辆沪A12345的实时位置和定位信息',
    icon: strokeIconPaths.locate,
    iconClass: 'bg-blue-50 text-blue-600',
  },
  {
    title: '导入运单监控在途',
    description: '批量导入 · 自动监控',
    prompt: waybillImportPrompt,
    icon: strokeIconPaths.upload,
    iconClass: 'bg-violet-50 text-violet-600',
    upload: true,
    uploadPurpose: 'waybill',
  },
  {
    title: '连接系统分析业务',
    action: 'projectCreate',
    description: '连接 TMS · 经营分析',
    prompt: '连接业务系统并分析当前物流运营情况',
    icon: strokeIconPaths.panels,
    iconClass: 'bg-emerald-50 text-emerald-600',
  },
  {
    title: '填写表格或制作表格',
    description: '补全数据 · 自动制表',
    prompt: '根据上传的业务资料填写表格或制作新的物流表格',
    icon: strokeIconPaths.fileSpreadsheet,
    iconClass: 'bg-orange-50 text-orange-600',
    upload: true,
  },
];

const selectedAgentModel = ref(agentModelOptions[0]!);
const isModelSelectOpen = ref(false);
const modelSelectRef = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const composerTextareaRef = ref<HTMLTextAreaElement | null>(null);
const uploadedFiles = ref<File[]>([]);
const isFileDragActive = ref(false);
const isRightPanelVisible = ref(store.workspaceMode === 'project');
const filePickerPurpose = ref<'regular' | 'waybill'>('regular');
const pendingWaybillImport = ref<PendingWaybillImport | null>(null);
let fileDragDepth = 0;

function setRightPanel(key: string) {
  store.rightPanel = key;
}

function toggleRightPanelVisibility() {
  isRightPanelVisible.value = !isRightPanelVisible.value;
}

function closeRightPanelContent() {
  if (store.visibleRightPanel === 'externalH5' || store.visibleRightPanel === 'analysisReport') {
    if (store.workspaceMode === 'project') {
      store.showDefaultRightPanel();
      isRightPanelVisible.value = true;
      return;
    }
    store.showDefaultRightPanel();
  }
  isRightPanelVisible.value = false;
}

function openAgentResultLink(link: AgentResultLink) {
  if (link.kind === 'analysisReport') {
    store.openAnalysisReport(link.title, link.topic ?? link.title, link.prompt ?? link.label);
  } else {
    store.openExternalH5(link.url, link.title);
  }
  isRightPanelVisible.value = true;
}

function selectAgentModel(option: AgentModelOption) {
  selectedAgentModel.value = option;
  isModelSelectOpen.value = false;
}

function closeComposerMenusOnOutside(event: MouseEvent) {
  if (!modelSelectRef.value?.contains(event.target as Node)) {
    isModelSelectOpen.value = false;
  }
}

function addUploadedFiles(files: File[]) {
  const existingKeys = new Set(uploadedFiles.value.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
  const newFiles = files.filter((file) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  uploadedFiles.value = [...uploadedFiles.value, ...newFiles];
  return newFiles;
}

function openFilePicker(purpose: 'regular' | 'waybill' = 'regular') {
  filePickerPurpose.value = purpose;
  fileInputRef.value?.click();
}

function isSpreadsheetFile(file: File) {
  return /\.(?:csv|xls|xlsx)$/i.test(file.name);
}

function isWaybillListFile(file: File, purpose: 'regular' | 'waybill') {
  if (!isSpreadsheetFile(file)) return false;
  if (purpose === 'waybill') return true;
  const waybillSignal = `${file.name} ${agentInput.value}`;
  return /(?:运单|订单|货单|发运|运输|在途|车辆|物流|tms|waybill|order|shipment)/i.test(waybillSignal);
}

function isRegionVisitQuery(value: string) {
  return /(?:是否|有没有|有无)(?:曾经)?(?:到过|到达过|去过|经过|途经|路过|驶入过|进入过)[\u4e00-\u9fa5]{2,12}(?:省|市|区|县|自治州|地区)/.test(value);
}

function openWaybillImportGuide(files: File[], purpose: 'regular' | 'waybill') {
  const isRegionVisitFlow = isRegionVisitQuery(agentInput.value);
  const waybillFiles = files.filter(
    (file) => !isRegionVisitFlow && !/(?:历史到访|地区到访|区域到访)/.test(file.name) && isWaybillListFile(file, purpose),
  );
  if (waybillFiles.length === 0) return;
  pendingWaybillImport.value = {
    files: waybillFiles,
    importedCount: 128,
    source: purpose,
  };
}

function selectNewConversationGuide(guide: NewConversationGuide) {
  if (guide.action === 'projectCreate') {
    goPage('projectCreate');
    return;
  }
  agentInput.value = guide.prompt;
  if (guide.upload) openFilePicker(guide.uploadPurpose ?? 'regular');
  nextTick(() => composerTextareaRef.value?.focus());
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const purpose = filePickerPurpose.value;
  const newFiles = addUploadedFiles(Array.from(input.files ?? []));
  openWaybillImportGuide(newFiles, purpose);
  filePickerPurpose.value = 'regular';
  input.value = '';
}

function removeUploadedFile(index: number) {
  uploadedFiles.value = uploadedFiles.value.filter((_, fileIndex) => fileIndex !== index);
}

function handleComposerDragEnter() {
  fileDragDepth += 1;
  isFileDragActive.value = true;
}

function handleComposerDragLeave() {
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (fileDragDepth === 0) isFileDragActive.value = false;
}

function handleComposerDrop(event: DragEvent) {
  fileDragDepth = 0;
  isFileDragActive.value = false;
  const newFiles = addUploadedFiles(Array.from(event.dataTransfer?.files ?? []));
  openWaybillImportGuide(newFiles, 'regular');
}

function cancelWaybillImport() {
  pendingWaybillImport.value = null;
}

function confirmWaybillImport(payload: { mode: 'create' | 'merge'; projectId: string; projectName: string }) {
  const pendingImport = pendingWaybillImport.value;
  if (!pendingImport) return;
  const sourceFileNames = pendingImport.files.map((file) => file.name);
  if (payload.mode === 'create') {
    store.createImportedWaybillProject(payload.projectName, pendingImport.importedCount, sourceFileNames);
  } else {
    store.mergeImportedWaybills(payload.projectId, pendingImport.importedCount);
  }

  const importedFileKeys = new Set(pendingImport.files.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
  uploadedFiles.value = uploadedFiles.value.filter((file) => !importedFileKeys.has(`${file.name}-${file.size}-${file.lastModified}`));
  if (pendingImport.source === 'waybill' && agentInput.value === waybillImportPrompt) agentInput.value = '';
  pendingWaybillImport.value = null;
}

function sendComposerMessage() {
  const text = agentInput.value.trim();
  if (!text && uploadedFiles.value.length === 0) return;

  if (uploadedFiles.value.length > 0) {
    const attachmentText = `附件：${uploadedFiles.value.map((file) => file.name).join('、')}`;
    sendAgent(text ? `${text}\n${attachmentText}` : attachmentText);
    uploadedFiles.value = [];
    agentInput.value = '';
    return;
  }

  sendAgent();
}

function formatStepNumber(index: number) {
  return String(index + 1).padStart(2, '0');
}

function progressStepState(message: ChatMessage, stepIndex: number) {
  if (!message.progressMode) return 'complete';
  const activeStepIndex = message.activeStepIndex ?? 0;
  if (message.status === '已完成' || stepIndex < activeStepIndex) return 'complete';
  if (stepIndex === activeStepIndex) return 'running';
  return 'pending';
}

function scrollAgentMessagesToBottom() {
  nextTick(() => {
    if (!agentMessageListRef.value) return;
    agentMessageListRef.value.scrollTop = agentMessageListRef.value.scrollHeight;
  });
}

const isOrderEventPanel = computed(() => store.visibleRightPanel === 'orderEvent');
const isDefaultOverview = computed(() => store.visibleRightPanel === 'overview');
const isExternalH5Panel = computed(() => store.visibleRightPanel === 'externalH5');
const isAnalysisReportPanel = computed(() => store.visibleRightPanel === 'analysisReport');
const rightPanelTitle = computed(() => {
  if (isAnalysisReportPanel.value) return store.analysisReportTitle || '经营分析报告';
  if (isExternalH5Panel.value) return store.externalH5Title || '外部 H5 页面';
  if (isOrderEventPanel.value) return '只看皖K55821异常停车事件';
  if (isDefaultOverview.value) return '今日在途情况';
  return '今日在途预警处理结果';
});
const workspaceTitle = computed(() => {
  if (store.workspaceMode === 'conversation') return store.currentConversation?.title || '新对话';
  return '智能体工作台';
});
const isDynamicRightPanel = computed(() => isExternalH5Panel.value || isAnalysisReportPanel.value);
const isRightPanelRendered = computed(
  () => isRightPanelVisible.value && (store.workspaceMode === 'project' || isDynamicRightPanel.value),
);
const agentGridClass = computed(() => (isRightPanelRendered.value ? 'grid-cols-[minmax(0,1fr)_minmax(380px,0.96fr)]' : 'grid-cols-1'));
const conversationRailClass = computed(() => (isRightPanelRendered.value ? 'max-w-[800px]' : 'max-w-[1000px]'));
const visibleQuickPrompts = computed(() => quickPrompts.slice(0, 3));

const trendData = [
  { date: '05-09', count: 8 },
  { date: '05-10', count: 12 },
  { date: '05-11', count: 9 },
  { date: '05-12', count: 15 },
  { date: '05-13', count: 17 },
  { date: '05-14', count: 13 },
  { date: '05-15', count: 20 },
];

const maxTrendCount = Math.max(...trendData.map((item) => item.count));

const highRiskWarningResults = [
  {
    id: 'WB20260509001',
    plate: '沪A12345',
    route: '上海工厂 → 广州仓',
    type: '异常停车 / 轨迹造假',
    stopPoint: '非目的地物流园',
    reason: '停靠 94 分钟，距离广州仓 184km；GPS 出现断点和速度跳变，轨迹可信度低。',
  },
  {
    id: 'WB20260509007',
    plate: '冀F21680',
    route: '北京仓 → 石家庄仓',
    type: '疑似非计划卸货',
    stopPoint: '建材交易市场',
    reason: '偏离计划线路 32km，停靠 126 分钟；停靠点不在合同节点和常用休息点范围内。',
  },
  {
    id: 'WB20260509018',
    plate: '皖K55821',
    route: '合肥仓 → 南京仓',
    type: '非合同经停',
    stopPoint: '第三方中转仓',
    reason: '经停仓未在运输计划内，停靠 73 分钟；承运商同类线路曾出现异常倒货记录。',
  },
  {
    id: 'WB20260509023',
    plate: '豫P67019',
    route: '郑州厂 → 武汉仓',
    type: '轨迹可信度异常',
    stopPoint: '服务区外停车带',
    reason: '停车 112 分钟但点火状态与定位连续性不一致；疑似设备离车或轨迹补传。',
  },
  {
    id: 'WB20260509031',
    plate: '浙A91766',
    route: '宁波港 → 苏州仓',
    type: '疑似换车倒货',
    stopPoint: '第三方物流园',
    reason: '距离目的地 79km 非计划长停 101 分钟；轨迹恢复后车辆方向与计划路径不一致。',
  },
];

const clearedLowRiskWarnings = [
  { id: 'WB20260509005', plate: '浙C77812', reason: '服务区长停 52 分钟，匹配司机休息和同线路历史停靠。' },
  { id: 'WB20260509014', plate: '苏B88231', reason: '目的仓排队等待卸车，已命中到仓围栏，风险降级。' },
  { id: 'WB20260509020', plate: '粤B90877', reason: '收费站拥堵导致低速滞留，轨迹连续且未偏离主线路。' },
];

const eventPanelRoute: LatLngTuple[] = [
  [31.8206, 117.2272],
  [31.92, 117.72],
  [32.02, 118.12],
  [32.075, 118.29],
  [32.103, 118.52],
  [32.071, 118.68],
  [32.0603, 118.7969],
];

const eventPanelMapPoints: MapPoint[] = [
  {
    name: '装货地 · 合肥仓',
    coord: [31.8206, 117.2272],
    desc: '车辆进入合肥仓围栏，开始执行合肥仓 → 南京仓运输任务。',
    tone: 'start',
  },
  {
    name: '低风险停车 · 滁州高速服务区',
    coord: [32.075, 118.29],
    desc: '11:05 - 11:48，高速服务区停车 43 分钟，智能体判定为合理休息。',
    tone: 'warn',
  },
  {
    name: '高风险停车 · 第三方中转仓',
    coord: [32.071, 118.68],
    desc: '14:32 - 15:45，非合同经停第三方中转仓，存在倒货或换车风险。',
    tone: 'stop',
  },
  {
    name: '当前位置 · 南京绕城附近',
    coord: [32.103, 118.52],
    desc: '车辆轨迹已恢复，继续向南京仓方向行驶。',
    tone: 'current',
  },
  {
    name: '卸货地 · 南京仓',
    coord: [32.0603, 118.7969],
    desc: '南京仓卸货地围栏。',
    tone: 'end',
  },
];

const eventPanelTimeline: TimelineEvent[] = [
  { id: 1, type: 'normal', title: '运单开始-车辆进入装货地', time: '09:18', place: '合肥仓', desc: '车辆进入合肥仓围栏，开始执行运输任务。' },
  { id: 2, type: 'normal', title: '发车离场', time: '09:46', place: '合肥仓', desc: '车辆离开装货地围栏，进入在途阶段。' },
  {
    id: 3,
    type: 'stop',
    title: '异常停车事件',
    time: '11:05 - 11:48',
    place: '滁州高速服务区',
    desc: '停车 43 分钟。',
    rule: '停车时长 43 分钟，未超过 60 分钟阈值；按规则侧记录为低优先级停车提醒。',
    agent: '停车点为高速服务区，轨迹连续，停靠时长符合司机休息场景，判定为低风险合理停车。',
    stopPlace: '高速服务区',
    agentVerdict: '低风险合理停车',
    agentTone: 'green',
  },
  {
    id: 4,
    type: 'stop',
    title: '高风险异常停车事件',
    time: '14:32 - 15:45',
    place: '第三方中转仓',
    desc: '停车 73 分钟，非计划停靠点。',
    rule: '停车时长 73 分钟 > 阈值 60 分钟，且停靠点不在合同节点内，命中异常停车。',
    agent: '停靠点为第三方中转仓，非合同经停，距离南京仓约 18km，存在倒货、换车或非计划中转风险。',
    stopPlace: '第三方中转仓',
    agentVerdict: '高风险',
    agentTone: 'red',
  },
  { id: 5, type: 'normal', title: '轨迹恢复并继续行驶', time: '15:52', place: '南京绕城附近', desc: '车辆离开第三方中转仓，继续向南京仓方向行驶。' },
];

const eventPanelVisibleTimeline = computed(() => {
  if (store.detailOnlyAbnormal) return eventPanelTimeline.filter((event) => event.type !== 'normal');
  return eventPanelTimeline;
});

function eventCardClass(event: TimelineEvent) {
  if (event.type === 'risk') return 'border-purple-200 bg-purple-50';
  if (event.type === 'stop' && store.detailView === 'agent' && event.agentTone === 'green') return 'border-emerald-200 bg-emerald-50';
  if (event.type === 'stop') return 'border-red-200 bg-red-50';
  return 'border-[#deded9] bg-white';
}

function markerIcon(tone: MapTone) {
  return L.divIcon({
    className: 'agent-map-marker',
    html: `<div class="agent-map-pin agent-map-pin--${tone}"></div>`,
    iconAnchor: [11, 11],
    iconSize: [22, 22],
  });
}

function popupHtml(point: MapPoint) {
  const [lat, lng] = point.coord;
  return `<div class="agent-map-popup"><b>${point.name}</b><p>${point.desc}</p><span>${lat.toFixed(4)}, ${lng.toFixed(4)}</span></div>`;
}

function drawEventPanelRoute() {
  if (!panelMapInstance) return;

  const routeShadow = L.polyline(eventPanelRoute as LatLngExpression[], {
    color: '#ffffff',
    opacity: 0.9,
    weight: 8,
  }).addTo(panelMapInstance);

  const routeLine = L.polyline(eventPanelRoute as LatLngExpression[], {
    color: '#0f172a',
    opacity: 0.9,
    weight: 4,
  }).addTo(panelMapInstance);

  L.polyline(eventPanelRoute.slice(4, 6) as LatLngExpression[], {
    color: '#dc2626',
    dashArray: '8 7',
    opacity: 0.95,
    weight: 6,
  }).addTo(panelMapInstance);

  routeLine.bringToFront();
  panelMapInstance.fitBounds(routeShadow.getBounds(), { padding: [28, 28] });
}

function drawEventPanelMarkers() {
  if (!panelMapInstance) return;

  eventPanelMapPoints.forEach((point) => {
    const marker = L.marker(point.coord, { icon: markerIcon(point.tone) }).addTo(panelMapInstance!);
    marker.bindPopup(popupHtml(point), { closeButton: false, offset: [0, -6] });
    marker.bindTooltip(point.name, {
      className: 'agent-map-tooltip',
      direction: 'top',
      offset: [0, -10],
      permanent: ['start', 'end', 'warn', 'stop'].includes(point.tone),
    });
  });
}

async function initEventPanelMap() {
  await nextTick();
  if (!panelMapRef.value || panelMapInstance) return;

  panelMapInstance = L.map(panelMapRef.value, {
    attributionControl: false,
    center: [32.02, 118.2],
    zoom: 9,
    zoomControl: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(panelMapInstance);
  L.control
    .attribution({ position: 'bottomleft', prefix: false })
    .addAttribution('&copy; OpenStreetMap contributors')
    .addTo(panelMapInstance);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(panelMapInstance);

  drawEventPanelRoute();
  drawEventPanelMarkers();
  setTimeout(() => panelMapInstance?.invalidateSize(), 80);
}

function clearEventPanelMap() {
  panelMapInstance?.remove();
  panelMapInstance = null;
}

onMounted(() => {
  document.addEventListener('click', closeComposerMenusOnOutside);
  if (!import.meta.env.DEV) return;
  const { ordersSeed } = store;
  const riskOrders = getRiskOrders(ordersSeed);
  console.assert(ordersSeed.length === 6, '运单列表应展示全部运单');
  console.assert(riskOrders.length === 4, '异常运单列表应展示高风险和低风险运单');
  console.assert(riskOrders.every((item) => item.risk !== '无风险'), '异常运单列表不得包含无风险运单');
});

watch(
  agentMessages,
  () => {
    scrollAgentMessagesToBottom();
    store.persistActiveConversationMessages();
  },
  { deep: true },
);

watch(
  [() => store.workspaceMode, () => store.currentConversationId, () => store.currentProjectId],
  ([workspaceMode]) => {
    isRightPanelVisible.value = workspaceMode === 'project';
    clearEventPanelMap();
  },
  { immediate: true },
);

watch(
  [() => store.visibleRightPanel, () => store.workspaceMode],
  ([panel, workspaceMode]) => {
    if (panel === 'externalH5' || panel === 'analysisReport') {
      isRightPanelVisible.value = true;
      clearEventPanelMap();
      return;
    }
    if (workspaceMode === 'conversation') {
      isRightPanelVisible.value = false;
      clearEventPanelMap();
      return;
    }
    if (panel === 'orderEvent') {
      isRightPanelVisible.value = true;
      initEventPanelMap();
      return;
    }
    clearEventPanelMap();
  },
  { immediate: true },
);

watch(isRightPanelVisible, (visible) => {
  if (visible && store.workspaceMode === 'project' && store.visibleRightPanel === 'orderEvent') {
    initEventPanelMap();
    return;
  }
  if (!visible) clearEventPanelMap();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeComposerMenusOnOutside);
  clearEventPanelMap();
});
</script>

<template>
  <div class="grid h-full overflow-hidden bg-[#fcfcfc]" :class="agentGridClass">
    <div class="relative flex h-full flex-col overflow-hidden bg-[#fcfcfc]">
      <div class="flex h-12 items-center justify-between gap-4 border-b border-[#eeeeec] bg-[#fcfcfc] px-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.msg" :size="16" />
          </div>
          <div>
            <h1 class="max-w-[420px] truncate text-sm font-semibold leading-5 text-slate-950">{{ workspaceTitle }}</h1>
          </div>
        </div>
        <button
          v-if="store.workspaceMode === 'project' || isRightPanelRendered"
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-[#deded9] bg-[#f7f7f5] px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-950"
          @click="toggleRightPanelVisibility"
        >
          <Icon :svg="strokeIconPaths.chevron" :size="13" :svg-class="isRightPanelRendered ? 'rotate-180' : ''" />
          {{ isRightPanelRendered ? '隐藏右栏' : '显示右栏' }}
        </button>
      </div>
      <div ref="agentMessageListRef" class="flex-1 overflow-auto bg-[#fcfcfc] px-5 pt-4 pb-52">
        <div class="mx-auto w-full space-y-4" :class="conversationRailClass">
          <div v-if="agentMessages.length === 0" class="flex min-h-[calc(100vh-330px)] flex-col items-center justify-center pt-20 text-center">
            <span class="flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfdfda] bg-white text-slate-500">
              <Icon :svg="strokeIconPaths.bot" :size="18" />
            </span>
            <h2 class="mt-4 text-[22px] font-semibold leading-8 text-slate-900">今天有什么工作需要处理？</h2>
            <div class="mt-5 grid w-full max-w-[920px] grid-cols-2 gap-2.5 xl:grid-cols-4">
              <button
                v-for="guide in newConversationGuides"
                :key="guide.title"
                type="button"
                class="group flex min-h-[104px] flex-col items-start justify-between rounded-lg border border-[#deded9] bg-white p-3.5 text-left transition hover:border-[#c8c8c2] hover:bg-[#fafaf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                @click="selectNewConversationGuide(guide)"
              >
                <span class="flex h-7 w-7 items-center justify-center rounded-md" :class="guide.iconClass">
                  <Icon :svg="guide.icon" :size="15" />
                </span>
                <span class="mt-4 flex w-full items-end justify-between gap-2">
                  <span class="min-w-0">
                    <span class="block truncate text-[13px] font-semibold leading-5 text-slate-800 group-hover:text-slate-950">{{ guide.title }}</span>
                    <span class="mt-0.5 block truncate text-[11px] leading-4 text-slate-500">{{ guide.description }}</span>
                  </span>
                  <Icon :svg="strokeIconPaths.chevron" :size="13" svg-class="mb-0.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                </span>
              </button>
            </div>
          </div>
          <div v-for="(m, i) in agentMessages" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
            <div
              class="rounded-md px-4 py-3 text-sm leading-6"
              :class="[
                m.role === 'user' ? 'max-w-[72%] bg-slate-900 text-white' : 'border border-[#deded9] bg-white text-slate-700',
                m.title ? 'max-w-[86%]' : 'max-w-[72%]',
              ]"
            >
            <template v-if="m.role === 'agent' && m.title">
              <div class="mb-3 flex items-center justify-between gap-3 border-b border-[#ededea] pb-2">
                <div>
                  <div class="text-sm font-semibold text-slate-900">{{ m.title }}</div>
                </div>
                <span
                  class="shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium"
                  :class="
                    m.status === '已完成'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-blue-200 bg-blue-50 text-blue-700'
                  "
                >
                  {{ m.status }}
                </span>
              </div>
              <div v-if="m.text" class="mb-3 rounded-md bg-[#f7f7f5] px-3 py-2 text-xs leading-5 text-slate-500">
                {{ m.text }}
              </div>
              <div v-if="m.steps?.length" class="divide-y divide-[#ededea] rounded-md border border-[#deded9] bg-white">
                <template v-for="(step, stepIndex) in m.steps" :key="step.title">
                  <div
                    v-if="!m.progressMode || progressStepState(m, stepIndex) !== 'pending'"
                    class="grid gap-3 px-3"
                    :class="m.progressMode ? 'grid-cols-[132px_1fr] py-2.5' : 'grid-cols-[82px_1fr] py-1.5'"
                  >
                    <div class="flex min-w-0 items-start gap-2 text-[11px] font-semibold leading-5 text-slate-900">
                      <span
                        v-if="m.progressMode"
                        class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"
                      >
                        <Icon
                          v-if="progressStepState(m, stepIndex) === 'running'"
                          :svg="strokeIconPaths.refresh"
                          :size="11"
                          svg-class="animate-spin"
                        />
                        <Icon v-else :svg="strokeIconPaths.check" :size="11" />
                      </span>
                      <span>
                        {{ formatStepNumber(stepIndex) }} · {{ step.title }}
                      </span>
                    </div>
                    <div class="min-w-0 text-xs leading-5 text-slate-500">
                      <div class="text-slate-600">{{ step.text }}</div>
                      <div v-if="step.skill" class="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span class="rounded-md bg-[#f1f1ef] px-2 py-0.5 text-[11px] font-medium text-slate-700">调用技能：{{ step.skill }}</span>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
              <div v-if="m.result" class="mt-3 whitespace-pre-line rounded-md bg-blue-50 px-3 py-2 text-xs font-medium leading-5 text-blue-700">
                {{ m.result }}
              </div>
              <a
                v-if="m.link"
                :href="m.link.url"
                class="mt-3 flex w-full items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-100/70"
                @click.prevent="openAgentResultLink(m.link)"
              >
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-blue-700 shadow-sm">
                  <Icon :svg="m.link.kind === 'analysisReport' ? strokeIconPaths.gauge : strokeIconPaths.locate" :size="18" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-slate-900">{{ m.link.label }}</span>
                  <span class="mt-0.5 block truncate text-xs text-slate-500">{{ m.link.description ?? m.link.url }}</span>
                </span>
                <Icon :svg="strokeIconPaths.chevron" :size="16" svg-class="shrink-0 text-blue-700" />
              </a>
              <a
                v-if="m.file"
                class="mt-3 flex w-full items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-100/70"
                :download="m.file.name"
                :href="m.file.url"
                :aria-label="`下载 ${m.file.name}`"
              >
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-emerald-700 shadow-sm">
                  <Icon :svg="strokeIconPaths.fileSpreadsheet" :size="18" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-slate-900">{{ m.file.name }}</span>
                  <span class="mt-0.5 block text-xs text-slate-500">{{ m.file.description ?? 'Excel 工作簿 · 已完成补全与复检' }}</span>
                </span>
                <Icon :svg="strokeIconPaths.download" :size="17" svg-class="shrink-0 text-emerald-700" />
              </a>
            </template>
            <template v-else>
              <span class="whitespace-pre-line">{{ m.text }}</span>
            </template>
            </div>
          </div>
        </div>
      </div>
      <div class="pointer-events-none absolute right-0 bottom-4 left-0 z-20 px-5">
        <div class="mx-auto w-full space-y-2.5" :class="conversationRailClass">
          <div
            class="pointer-events-auto flex h-9 items-center gap-2 overflow-hidden rounded-[14px] border border-[#deded9] bg-white px-2.5 shadow-[0_10px_26px_rgba(15,23,42,0.08),0_2px_6px_rgba(15,23,42,0.04)]"
          >
            <div class="shrink-0 text-xs font-medium text-slate-500">推荐指令</div>
            <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <button
                v-for="s in visibleQuickPrompts"
                :key="s"
                type="button"
                class="h-6 min-w-0 flex-1 rounded-full border border-[#e6e6e2] bg-[#f7f7f5] px-3 text-xs text-slate-600 transition hover:border-[#d8d8d2] hover:bg-white hover:text-slate-950"
                @click="sendAgent(s)"
              >
                <span class="block truncate">{{ s }}</span>
              </button>
            </div>
          </div>
          <div
            class="pointer-events-auto relative rounded-[18px] border bg-white px-3.5 py-2.5 shadow-[0_14px_36px_rgba(15,23,42,0.11),0_2px_7px_rgba(15,23,42,0.04)] transition focus-within:border-[#4c8dff] focus-within:shadow-[0_14px_36px_rgba(15,23,42,0.11),0_0_0_3px_rgba(59,130,246,0.16)]"
            :class="isFileDragActive ? 'border-[#4c8dff] bg-blue-50/70 shadow-[0_14px_36px_rgba(15,23,42,0.11),0_0_0_3px_rgba(59,130,246,0.16)]' : 'border-[#deded9]'"
            @dragenter.prevent.stop="handleComposerDragEnter"
            @dragover.prevent.stop
            @dragleave.prevent.stop="handleComposerDragLeave"
            @drop.prevent.stop="handleComposerDrop"
          >
            <div
              v-if="isFileDragActive"
              class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[17px] bg-blue-50/95 text-sm font-medium text-blue-700"
            >
              松开以上传文件
            </div>
            <div v-if="uploadedFiles.length" class="mb-2 flex flex-wrap gap-2 px-1 pt-1">
              <div
                v-for="(file, index) in uploadedFiles"
                :key="`${file.name}-${file.size}-${file.lastModified}`"
                class="relative flex h-8 max-w-[240px] items-center gap-1.5 rounded-md border border-[#e1e1dd] bg-[#f7f7f5] px-2.5 pr-4 text-xs text-slate-600"
              >
                <Icon :svg="strokeIconPaths.file" :size="14" svg-class="shrink-0 text-slate-500" />
                <span class="truncate">{{ file.name }}</span>
                <button
                  type="button"
                  class="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white shadow-sm transition hover:bg-slate-900"
                  :aria-label="`删除文件 ${file.name}`"
                  @click="removeUploadedFile(index)"
                >
                  <Icon :svg="strokeIconPaths.x" :size="9" />
                </button>
              </div>
            </div>
            <textarea
              ref="composerTextareaRef"
              v-model="agentInput"
              class="min-h-[40px] w-full resize-none bg-transparent px-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
              placeholder="发消息..."
              rows="1"
              @keydown.enter.exact.prevent="sendComposerMessage"
            />
            <div class="mt-1 flex items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-1.5">
                <input ref="fileInputRef" type="file" class="hidden" multiple @change="handleFileSelect" />
                <button
                  type="button"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-[#f3f3f1] hover:text-slate-900"
                  aria-label="上传文件"
                  title="上传文件"
                  @click="openFilePicker"
                >
                  <Icon :svg="strokeIconPaths.paperclip" :size="17" />
                </button>
                <div ref="modelSelectRef" class="relative min-w-0 shrink">
                  <button
                    type="button"
                    role="combobox"
                    aria-haspopup="listbox"
                    :aria-expanded="isModelSelectOpen"
                    class="flex h-8 max-w-[190px] items-center justify-between gap-2 rounded-full px-2.5 text-sm text-slate-800 transition hover:bg-[#f3f3f1]"
                    @click.stop="isModelSelectOpen = !isModelSelectOpen"
                  >
                    <span class="flex min-w-0 items-center gap-2">
                      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" :class="selectedAgentModel.iconClass">
                        <img
                          v-if="selectedAgentModel.logoUrl"
                          :src="selectedAgentModel.logoUrl"
                          :alt="`${selectedAgentModel.label} logo`"
                          class="h-4 w-4 object-contain"
                        />
                        <Icon v-else :svg="selectedAgentModel.icon" :size="13" />
                      </span>
                      <span class="truncate">{{ selectedAgentModel.label }}</span>
                    </span>
                    <Icon :svg="strokeIconPaths.chevron" :size="13" svg-class="shrink-0 text-slate-400 rotate-90" />
                  </button>
                  <div v-if="isModelSelectOpen" class="absolute bottom-full left-0 z-30 mb-3 w-64 rounded-2xl border border-[#deded9] bg-white p-1.5 shadow-xl" role="listbox">
                    <div class="px-2 py-1.5 text-xs font-medium text-slate-500">内置模型</div>
                    <button
                      v-for="option in agentModelOptions"
                      :key="option.value"
                      type="button"
                      role="option"
                      :aria-selected="selectedAgentModel.value === option.value"
                      class="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-[#f7f7f5]"
                      :class="selectedAgentModel.value === option.value ? 'text-slate-900' : 'text-slate-600'"
                      @click="selectAgentModel(option)"
                    >
                      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" :class="option.iconClass">
                        <img v-if="option.logoUrl" :src="option.logoUrl" :alt="`${option.label} logo`" class="h-5 w-5 object-contain" />
                        <Icon v-else :svg="option.icon" :size="15" />
                      </span>
                      <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
                      <Icon v-if="selectedAgentModel.value === option.value" :svg="strokeIconPaths.check" :size="15" svg-class="text-slate-900" />
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-800"
                aria-label="发送"
                @click="sendComposerMessage"
              >
                <Icon :svg="strokeIconPaths.arrowUp" :size="18" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="isRightPanelRendered"
      class="flex h-full flex-col overflow-hidden border-l border-[#eeeeec] bg-white"
      :class="isExternalH5Panel ? 'relative z-10 shadow-[-14px_0_28px_-20px_rgba(15,23,42,0.35)]' : ''"
    >
      <div class="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[#eeeeec] bg-white px-4">
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold leading-5 text-slate-950">{{ rightPanelTitle }}</h2>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span
            v-if="!isDynamicRightPanel"
            class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
            :class="badgeToneClass('green')"
          >实时同步</span>
          <a
            v-if="isExternalH5Panel"
            :href="store.externalH5Url"
            target="_blank"
            rel="noreferrer"
            class="inline-flex h-7 items-center rounded-md border border-[#deded9] bg-[#f7f7f5] px-2.5 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
          >
            新窗口打开
          </a>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#f2f2ef] hover:text-slate-800"
            :aria-label="isDynamicRightPanel ? '关闭当前右侧页面' : '关闭右侧栏'"
            :title="isDynamicRightPanel && store.workspaceMode === 'project' ? '关闭页面并返回默认看板' : '隐藏右侧栏'"
            @click="closeRightPanelContent"
          >
            <Icon :svg="strokeIconPaths.x" :size="15" />
          </button>
        </div>
      </div>
      <AnalysisReportView
        v-if="isAnalysisReportPanel"
        class="min-h-0 flex-1"
        :prompt="store.analysisReportPrompt"
        :title="store.analysisReportTitle"
        :topic="store.analysisReportTopic"
      />
      <div v-else-if="isExternalH5Panel" class="flex min-h-0 flex-1 flex-col bg-white">
        <iframe
          :key="store.externalH5Url"
          :src="store.externalH5Url"
          :title="store.externalH5Title || '外部 H5 页面'"
          class="min-h-0 w-full flex-1 border-0 bg-white"
          referrerpolicy="no-referrer-when-downgrade"
        />
      </div>
      <template v-else>
      <div v-if="isDefaultOverview" class="border-b border-[#e2e2dc] p-4">
        <div class="grid grid-cols-4 gap-3">
          <div class="rounded-md bg-[#f7f7f5] p-3">
            <div class="text-xs text-slate-500">监控运单</div>
            <div class="mt-1 text-xl font-semibold text-slate-900">128</div>
          </div>
          <div class="rounded-md bg-[#f7f7f5] p-3">
            <div class="text-xs text-slate-500">异常运单</div>
            <div class="mt-1 text-xl font-semibold text-red-600">17</div>
          </div>
          <div class="rounded-md bg-[#f7f7f5] p-3">
            <div class="text-xs text-slate-500">高风险</div>
            <div class="mt-1 text-xl font-semibold text-red-600">6</div>
          </div>
          <div class="rounded-md bg-[#f7f7f5] p-3">
            <div class="text-xs text-slate-500">低风险</div>
            <div class="mt-1 text-xl font-semibold text-orange-600">11</div>
          </div>
        </div>
      </div>
      <div v-else-if="!isOrderEventPanel" class="border-b border-[#e2e2dc] p-4">
        <div class="grid grid-cols-4 gap-3">
          <div class="rounded-md bg-[#f7f7f5] p-3">
            <div class="text-xs text-slate-500">处理预警</div>
            <div class="mt-1 text-xl font-semibold text-slate-900">17</div>
          </div>
          <div class="rounded-md bg-[#f7f7f5] p-3">
            <div class="text-xs text-slate-500">真实高风险</div>
            <div class="mt-1 text-xl font-semibold text-red-600">5</div>
          </div>
          <div class="rounded-md bg-[#f7f7f5] p-3">
            <div class="text-xs text-slate-500">合理低风险</div>
            <div class="mt-1 text-xl font-semibold text-emerald-600">11</div>
          </div>
          <div class="rounded-md bg-[#f7f7f5] p-3">
            <div class="text-xs text-slate-500">轨迹造假</div>
            <div class="mt-1 text-xl font-semibold text-red-600">1</div>
          </div>
        </div>
      </div>
      <div v-if="!isOrderEventPanel" class="border-b border-[#eeeeec] bg-white px-4 py-3">
        <div class="flex rounded-md bg-[#f2f2ef] p-1 text-sm">
          <button
            v-for="[key, label] in rightPanelTabs"
            :key="key"
            type="button"
            class="flex-1 rounded-md px-3 py-2"
            :class="store.visibleRightPanel === key ? 'bg-white font-medium' : 'text-slate-500'"
            @click="setRightPanel(key)"
          >
            {{ label }}
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto bg-white p-4">
        <div v-if="store.visibleRightPanel === 'orderEvent'" class="space-y-4">
          <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
            <div class="relative h-[260px] overflow-hidden">
              <div ref="panelMapRef" class="h-full w-full"></div>
              <div class="pointer-events-none absolute top-3 left-3 z-[1000] rounded-md border border-[#deded9] bg-white/95 px-3 py-2 text-xs text-slate-700">
                <div class="font-semibold text-slate-900">合肥仓 → 南京仓</div>
                <div class="mt-1 flex gap-3 text-slate-500">
                  <span>{{ panelRouteDistance }}</span>
                  <span>{{ panelRouteDuration }}</span>
                  <span>WGS84</span>
                </div>
              </div>
              <div class="pointer-events-none absolute top-3 right-3 z-[1000] flex gap-2">
                <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('green')">低风险停车 1</span>
                <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('red')">高风险停车 1</span>
              </div>
            </div>
          </div>

          <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
            <div class="flex h-12 items-center justify-between gap-2 border-b border-[#e2e2dc] px-4">
              <div class="text-sm font-semibold leading-5">事件 Timeline</div>
              <button
                type="button"
                class="rounded-md px-3 py-2 text-xs font-medium"
                :class="store.detailOnlyAbnormal ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'"
                @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal"
              >
                <Icon :svg="strokeIconPaths.filter" :size="14" svg-class="mr-1 inline" /> 只看异常停车
              </button>
            </div>
            <div class="m-4 flex rounded-md bg-[#f2f2ef] p-1 text-xs">
              <button
                type="button"
                class="flex-1 rounded-md px-3 py-2"
                :class="store.detailView === 'agent' ? 'bg-white' : 'text-slate-500'"
                @click="store.detailView = 'agent'"
              >
                智能体判断
              </button>
              <button
                type="button"
                class="flex-1 rounded-md px-3 py-2"
                :class="store.detailView === 'rule' ? 'bg-white' : 'text-slate-500'"
                @click="store.detailView = 'rule'"
              >
                规则判断
              </button>
            </div>
            <div class="space-y-3 px-4 pb-4">
              <div v-for="e in eventPanelVisibleTimeline" :key="e.id" class="rounded-md border p-3" :class="eventCardClass(e)">
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm font-medium">
                    {{ e.title }}
                  </div>
                  <div class="shrink-0 text-xs text-slate-500">
                    {{ e.time }}
                  </div>
                </div>
                <div v-if="e.type !== 'stop' || store.detailView === 'rule'" class="mt-1 text-xs text-slate-500">
                  {{ e.place }}
                </div>
                <div v-if="e.type !== 'stop'" class="mt-2 text-sm text-slate-600">
                  {{ e.desc }}
                </div>
                <div v-if="e.type === 'stop' && store.detailView === 'agent'" class="mt-3 flex flex-wrap gap-2">
                  <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('blue')">
                    停靠地点：{{ e.stopPlace }}
                  </span>
                  <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass(e.agentTone ?? 'gray')">
                    {{ e.agentVerdict }}
                  </span>
                </div>
                <div v-if="e.type === 'stop' && e.rule && e.agent" class="mt-3 rounded-md bg-white p-3 text-xs leading-5 text-slate-700">
                  {{ store.detailView === 'rule' ? e.rule : e.agent }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="store.visibleRightPanel === 'overview'" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="rounded-md border border-[#deded9] bg-white p-4">
              <div class="mb-3 flex items-center justify-between">
                <div class="text-sm font-semibold">近 7 天异常趋势</div>
                <span class="text-xs text-slate-400">单位：单</span>
              </div>
              <div class="h-40 rounded-md bg-[#f7f7f5] px-3 pb-3 pt-5">
                <div class="grid h-full grid-rows-[1fr_12px] gap-1">
                  <div class="flex items-end gap-2">
                    <div v-for="item in trendData" :key="`bar-${item.date}`" class="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span class="text-[11px] font-medium leading-4 text-slate-600">{{ item.count }}</span>
                      <div class="w-full rounded-t bg-slate-700 transition" :style="{ height: `${Math.max(18, (item.count / maxTrendCount) * 88)}px` }"></div>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <span v-for="item in trendData" :key="`date-${item.date}`" class="flex-1 text-center text-[10px] text-slate-400">{{ item.date }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="rounded-md border border-[#deded9] bg-white p-4">
              <div class="mb-3 text-sm font-semibold">今日风险TOP3</div>
              <div class="space-y-3 text-sm">
                <div>
                  <div class="mb-1 flex items-center justify-between text-xs text-slate-500"><span>规则预警</span><span>9 单</span></div>
                  <div class="h-2 rounded-full bg-slate-100">
                    <div class="h-2 rounded-full bg-slate-900" style="width: 72%"></div>
                  </div>
                </div>
                <div>
                  <div class="mb-1 flex items-center justify-between text-xs text-slate-500"><span>智能轨迹分析</span><span>5 单</span></div>
                  <div class="h-2 rounded-full bg-slate-100">
                    <div class="h-2 rounded-full bg-slate-900" style="width: 48%"></div>
                  </div>
                </div>
                <div>
                  <div class="mb-1 flex items-center justify-between text-xs text-slate-500"><span>GPS 造假分析</span><span>3 单</span></div>
                  <div class="h-2 rounded-full bg-slate-100">
                    <div class="h-2 rounded-full bg-slate-900" style="width: 32%"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="rounded-md border border-[#deded9] bg-white p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-semibold">智能体结论</div>
              <button type="button" class="text-xs font-medium text-slate-900" @click="goPage('analytics')">查看统计归因</button>
            </div>
            <div class="space-y-3 text-sm text-slate-700">
              <div class="rounded-md bg-red-50 p-3 text-red-700">今日异常率 13.3%，较昨日上升 2.1 个百分点。</div>
              <div class="rounded-md bg-orange-50 p-3 text-orange-700">异常主要集中在安捷物流和上海工厂 → 广州仓线路。</div>
              <div class="rounded-md bg-[#f7f7f5] p-3">建议优先复核非目的地物流园长停，以及 GPS 高风险轨迹段。</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <button type="button" class="rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white" @click="goPage('risk')">查看异常运单</button>
            <button type="button" class="rounded-md border border-[#deded9] bg-white px-4 py-3 text-sm font-medium text-slate-700" @click="goPage('orders')">
              查看全部运单
            </button>
          </div>
        </div>

        <div v-else-if="store.visibleRightPanel === 'risk'" class="space-y-4">
          <div class="rounded-md border border-[#deded9] bg-white p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-semibold">高风险异常运单</div>
              <button type="button" class="text-xs font-medium text-slate-900" @click="goPage('risk')">进入列表</button>
            </div>
            <div class="space-y-3 text-sm">
              <div v-for="o in highRiskWarningResults" :key="o.id" class="w-full rounded-md border border-red-100 bg-white p-3 text-left">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="break-all font-medium text-slate-900">{{ o.plate }} · {{ o.id }}</div>
                    <div class="mt-1 leading-5 text-slate-500">
                      {{ o.route }}
                    </div>
                  </div>
                  <span class="shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">高风险</span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span class="rounded-md bg-[#f7f7f5] px-2 py-1 text-xs text-slate-600">停靠点：{{ o.stopPoint }}</span>
                  <span class="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{{ o.type }}</span>
                </div>
                <div class="mt-2 rounded-md bg-[#f7f7f5] px-3 py-2 leading-6 text-slate-600">
                  {{ o.reason }}
                </div>
              </div>
            </div>
          </div>
          <div class="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div class="mb-3 text-sm font-semibold text-emerald-900">已识别为合理低风险</div>
            <div class="space-y-2">
              <div v-for="o in clearedLowRiskWarnings" :key="o.id" class="rounded-md bg-white/70 p-3 text-sm leading-6 text-emerald-800">
                <span class="font-medium">{{ o.plate }} · {{ o.id }}</span>
                <span class="mx-1 text-emerald-500">/</span>
                {{ o.reason }}
              </div>
            </div>
            <div class="mt-3 text-xs text-emerald-700">其余 8 单同类低风险预警已按相同口径折叠。</div>
          </div>
          <button type="button" class="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white" @click="createDownload('今日高风险异常运单')">
            下载今日高风险清单
          </button>
        </div>

      </div>
      </template>
    </div>
  </div>
  <WaybillImportDialog
    :file-names="pendingWaybillImport?.files.map((file) => file.name) ?? []"
    :imported-count="pendingWaybillImport?.importedCount ?? 0"
    :open="Boolean(pendingWaybillImport)"
    :projects="store.projects"
    @cancel="cancelWaybillImport"
    @confirm="confirmWaybillImport"
  />
</template>

<style lang="scss" scoped>
:deep(.leaflet-container) {
  background: #e2e8f0;
  color: #0f172a;
  font-family: inherit;
}

:deep(.leaflet-control-attribution) {
  border-radius: 4px;
  color: #64748b;
  font-size: 10px;
}

:deep(.agent-map-marker) {
  background: transparent;
  border: 0;
}

:deep(.agent-map-pin) {
  height: 22px;
  width: 22px;
  border: 3px solid #fff;
  border-radius: 999px;
  box-shadow:
    0 10px 22px rgb(15 23 42 / 28%),
    0 0 0 4px rgb(255 255 255 / 62%);
}

:deep(.agent-map-pin--start) {
  background: #0f172a;
}

:deep(.agent-map-pin--end) {
  background: #16a34a;
}

:deep(.agent-map-pin--warn) {
  background: #f97316;
}

:deep(.agent-map-pin--stop) {
  background: #dc2626;
}

:deep(.agent-map-pin--risk) {
  background: #7c3aed;
}

:deep(.agent-map-pin--current) {
  background: #0284c7;
  animation: mapPulse 1.8s ease-out infinite;
}

:deep(.agent-map-tooltip) {
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  box-shadow: 0 10px 24px rgb(15 23 42 / 12%);
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 8px;
}

:deep(.agent-map-popup) {
  min-width: 190px;
}

:deep(.agent-map-popup b) {
  color: #0f172a;
  display: block;
  font-size: 13px;
  margin-bottom: 6px;
}

:deep(.agent-map-popup p) {
  color: #475569;
  font-size: 12px;
  line-height: 1.55;
  margin: 0 0 6px;
}

:deep(.agent-map-popup span) {
  color: #64748b;
  font-size: 11px;
}

@keyframes mapPulse {
  0% {
    box-shadow:
      0 10px 22px rgb(15 23 42 / 28%),
      0 0 0 0 rgb(2 132 199 / 42%);
  }

  100% {
    box-shadow:
      0 10px 22px rgb(15 23 42 / 28%),
      0 0 0 16px rgb(2 132 199 / 0%);
  }
}
</style>
