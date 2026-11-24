<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Icon } from '@packages/icon';

import { agentWorkData } from '@/pinia/agentWork';

import { agentWorkRouteName } from '../useAgentWorkNav';
import { strokeIconPaths } from '../strokeIconPaths';
import SharedAssetMap from './knowledgeBase/SharedAssetMap.vue';
import { KB_SECTION_TABS, assetMapState, setSection } from './knowledgeBase/assetMapStore';
import { sensitiveAreaState } from './knowledgeBase/sensitiveAreaStore';
import { buildLineSensitiveMap } from './knowledgeBase/lineSensitiveStats';
import { countDistinctAbnormal, getAggLines, getTop20Lines } from './knowledgeBase/mockData';
import type { AggLine } from './knowledgeBase/mockData';


/** 当前二级导航分区是否为「总览」 */
const isOverview = computed(() => assetMapState.section === 'overview');

// 「敏感区域」页签红点提醒已下线（航哥 20261123）：确认机制取消后不存在待确认计数

/**
 * 敏感区域分析指标
 * 异常点个数 = 生效中的点位（不含已忽略）
 * 异常运单数 / 涉及车辆 = 各点位命中运单的**去重**结果（同一运单可在多个点位停靠，不能直接加总）
 */
const sensitiveAnalysis = computed(() => {
  const countable = sensitiveAreaState.areas;
  // 运单/车辆必须去重：同一运单可在多个点位停靠，直接把各点位相加会重复计数
  const distinct = countDistinctAbnormal(countable);
  return {
    areaCount: countable.length,
    // 异常点个数 = 人工发现 + AI识别（确认机制下线后只有来源二分，两者之和恒等于总数）
    manualCount: countable.filter((area) => area.source === 'manual').length,
    aiCount: countable.filter((area) => area.source === 'ai').length,
    waybillCount: distinct.waybills,
    vehicleCount: distinct.vehicles,
  };
});

const DIM_LABELS: Record<string, string> = { province: '省 - 省', city: '市 - 市', county: '县 - 县' };

/** 路线分区 KPI：随当前维度（省/市/县）实时变化 */
const routeKpi = computed(() => {
  if (assetMapState.section !== 'route') return null;
  const dim = assetMapState.routeMode;
  const lines = getAggLines(dim);
  const countable = sensitiveAreaState.areas.filter((area) => area.status !== 'ignored');
  const statsMap = buildLineSensitiveMap(lines, countable);

  let waybills = 0;
  let vehicles = 0;
  let sensitiveWaybills = 0;
  const touchedAreas = new Set<string>();
  lines.forEach((line) => {
    waybills += line.waybillCount;
    vehicles += line.carrierVehicleCount;
    const stats = statsMap.get(line.id);
    if (!stats) return;
    sensitiveWaybills += stats.waybills;
    stats.stats.forEach((item) => touchedAreas.add(item.area.id));
  });

  return {
    dimLabel: DIM_LABELS[dim] ?? dim,
    lineCount: lines.length,
    waybills,
    vehicles,
    sensitiveWaybills,
    ratio: waybills > 0 ? sensitiveWaybills / waybills : 0,
    areaCount: touchedAreas.size,
  };
});

/** 路线 / 敏感区域 分区顶部的 KPI 条（总览分区用自己的大 KPI 卡） */
interface KpiCard { label: string; value: string; hint: string; tone?: 'danger' }

const sectionKpiCards = computed<KpiCard[]>(() => {
  if (assetMapState.section === 'route') {
    const kpi = routeKpi.value;
    if (!kpi) return [];
    return [
      { label: '覆盖线路', value: String(kpi.lineCount), hint: `${kpi.dimLabel} 聚合 · 全量累计` },
      { label: '运单总量', value: formatNumber(kpi.waybills), hint: '各线路运单累计' },
      { label: '承运车辆', value: formatNumber(kpi.vehicles), hint: '按线路累计（含跨线复用）' },
      {
        label: '敏感停靠运单',
        value: formatNumber(kpi.sensitiveWaybills),
        hint: `占 ${(kpi.ratio * 100).toFixed(1)}% · ${kpi.areaCount} 个点位`,
        tone: 'danger',
      },
    ];
  }
  if (assetMapState.section === 'poi') {
    const s = sensitiveAnalysis.value;
    return [
      { label: '敏感区域点位', value: String(s.areaCount), hint: `人工发现 ${s.manualCount} / AI识别 ${s.aiCount}` },
      { label: '异常运单数', value: formatNumber(s.waybillCount), hint: '在点位范围内异常停靠 · 已去重', tone: 'danger' },
      { label: '涉及车辆数', value: formatNumber(s.vehicleCount), hint: '产生异常停靠的车辆 · 已去重' },
    ];
  }
  return [];
});

interface PlatformVehicle {
  id: string;
  plate: string;
  lineCount: number;
  usageCount: number;
  lat: number;
  lng: number;
}

interface PlatformPoi {
  id: string;
  name: string;
  type: 'shipper' | 'consignee';
  industry: string;
  count: number;
  lat: number;
  lng: number;
}


const props = withDefaults(defineProps<{ emptyMode?: boolean }>(), { emptyMode: false });

const assetDetailTab = ref<'vehicle' | 'line' | 'poi'>('vehicle');


const platformAssets = {
  vehicleCount: 1200,
  waybillTotal: 130000,
  poiCount: 340,
  platformVehicleCount: 7300000,
  platformPoiCount: 10000000,
  platformMonthlyWaybillCount: 120000000,
};

const operationAnalysis = {
  highRiskWaybillCount: 23,
  lowRiskWaybillCount: 156,
  abnormalEvents: [
    { type: '超速', count: 12 },
    { type: '疲劳驾驶', count: 5 },
    { type: '异常停车', count: 8 },
  ],
};

const platformVehicles = ref<PlatformVehicle[]>([
  { id: 'V003', plate: '浙B34567', lineCount: 6, usageCount: 112, lat: 29.8683, lng: 121.544 },
  { id: 'V006', plate: '粤B24680', lineCount: 4, usageCount: 103, lat: 22.5431, lng: 114.0579 },
  { id: 'V005', plate: '鲁Q98765', lineCount: 5, usageCount: 95, lat: 34.3416, lng: 118.3255 },
  { id: 'V001', plate: '沪A12345', lineCount: 5, usageCount: 86, lat: 31.2304, lng: 121.4737 },
  { id: 'V008', plate: '豫N24680', lineCount: 5, usageCount: 81, lat: 34.4156, lng: 115.65 },
  { id: 'V002', plate: '苏E56789', lineCount: 4, usageCount: 74, lat: 31.5497, lng: 120.2953 },
  { id: 'V007', plate: '京A13579', lineCount: 3, usageCount: 67, lat: 39.9042, lng: 116.4074 },
  { id: 'V004', plate: '皖K55821', lineCount: 3, usageCount: 58, lat: 31.8206, lng: 117.2272 },
  { id: 'V009', plate: '苏A88888', lineCount: 4, usageCount: 72, lat: 32.0603, lng: 118.7969 },
  { id: 'V010', plate: '浙C66666', lineCount: 3, usageCount: 55, lat: 28.0005, lng: 120.7023 },
]);
// 与「按运单覆盖排序」一致：使用次数降序
platformVehicles.value.sort((a, b) => b.usageCount - a.usageCount);

// 地市间运单量 Top 20 线路（确定性 Mock，视觉由共享地图渲染）
const platformLines = ref<AggLine[]>(getTop20Lines());

const platformPois = ref<PlatformPoi[]>([
  { id: 'P003', name: '苏州工业园区集散点', type: 'consignee', industry: '制造业', count: 74, lat: 31.316, lng: 120.7488 },
  { id: 'P001', name: '上海外高桥物流中心', type: 'shipper', industry: '仓储物流', count: 86, lat: 31.3226, lng: 121.601 },
  { id: 'P004', name: '南京江宁物流园', type: 'consignee', industry: '仓储物流', count: 58, lat: 31.9533, lng: 118.7975 },
  { id: 'P008', name: '深圳盐田物流园', type: 'consignee', industry: '仓储物流', count: 52, lat: 22.5944, lng: 114.2363 },
  { id: 'P005', name: '宁波北仑港', type: 'shipper', industry: '港口航运', count: 45, lat: 29.9194, lng: 121.8458 },
  { id: 'P002', name: '杭州钱塘智造园', type: 'shipper', industry: '制造业', count: 62, lat: 30.2828, lng: 120.3748 },
  { id: 'P006', name: '合肥经开产业区', type: 'shipper', industry: '制造业', count: 38, lat: 31.7988, lng: 117.2108 },
  { id: 'P007', name: '广州白云物流园', type: 'shipper', industry: '仓储物流', count: 35, lat: 23.1291, lng: 113.2644 },
  { id: 'P009', name: '天津港保税区', type: 'consignee', industry: '港口航运', count: 32, lat: 39.0842, lng: 117.2009 },
  { id: 'P010', name: '成都双流物流园', type: 'consignee', industry: '仓储物流', count: 30, lat: 30.5728, lng: 104.0668 },
]);


const store = agentWorkData();
const router = useRouter();
const activeFolderId = ref('platformAssets');

const highlightedAssetId = ref<string>('');





function selectAssetTab(tab: 'vehicle' | 'line' | 'poi') {
  assetDetailTab.value = tab;
}

function formatNumber(num: number) {
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`;
  if (num >= 10000) return `${(num / 10000).toFixed(0)}万`;
  return num.toLocaleString();
}

function maskPlate(plate: string) {
  if (plate.length <= 4) return plate;
  return `${plate.slice(0, 3)}${'*'.repeat(Math.max(1, plate.length - 4))}${plate.slice(-1)}`;
}

function highlightAsset(id: string) {
  highlightedAssetId.value = id;
  // 与上方共享地图联动：路线 Tab 悬停时切回 Top20 视图并高亮对应飞线
  if (assetDetailTab.value === 'line') {
    assetMapState.mode = 'top20';
    assetMapState.hoverLineId = id;
  }
}

function clearHighlightAsset() {
  highlightedAssetId.value = '';
  assetMapState.hoverLineId = '';
}

function goToAgentConversation() {
  store.startNewConversation();
  router.push({ name: agentWorkRouteName.agent });
}
</script>

<template>
  <div
    class="relative flex h-full flex-col overflow-hidden bg-[#fcfcfc]"
  >
    <div class="flex h-12 items-center justify-between gap-4 border-b border-[#eeeeec] bg-[#fcfcfc] px-4">
      <div class="flex items-center gap-2.5">
        <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
          <Icon :svg="strokeIconPaths.book" :size="16" />
        </div>
        <h1 class="text-sm font-semibold leading-5 text-slate-950">我的知识库</h1>
      </div>
    </div>

    <div class="flex min-h-0 flex-1">

      <main class="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#fcfcfc]">
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <!-- 平台数据资产 -->
          <template v-if="activeFolderId === 'platformAssets'">
            <!-- 标题区 -->
            <div class="mb-4">
              <div class="flex items-center gap-2">
                <span class="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <Icon :svg="strokeIconPaths.map" :size="15" />
                </span>
                <h2 class="text-base font-semibold text-slate-900">平台数据资产</h2>
              </div>
              <p class="mt-1 pl-9 text-xs text-slate-500">
                来自你在大卡数字人中的业务调用，已自动沉淀为可检索知识
              </p>
            </div>

            <!-- 二级导航：总览 / 路线 / 敏感区域（下划线式，选中项深色文字 + 2px 底边） -->
            <div v-if="!props.emptyMode" class="mb-4 flex items-center gap-7 border-b border-[#e6e6e2]">
              <button
                v-for="tab in KB_SECTION_TABS"
                :key="tab.id"
                type="button"
                class="relative -mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[13px] font-medium transition-colors"
                :class="
                  assetMapState.section === tab.id
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                "
                @click="setSection(tab.id)"
              >
                {{ tab.label }}
              </button>
            </div>

            <!-- 路线 / 敏感区域 分区：紧凑 KPI 条 -->
            <div
              v-if="!props.emptyMode && sectionKpiCards.length > 0"
              class="mb-4 grid gap-3"
              :class="sectionKpiCards.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'"
            >
              <div
                v-for="card in sectionKpiCards"
                :key="card.label"
                class="rounded-xl border border-[#e3e3df] bg-white px-4 py-3"
              >
                <p class="text-[11px] text-slate-500">{{ card.label }}</p>
                <p class="mt-1 text-2xl font-bold tracking-tight" :class="card.tone === 'danger' ? 'text-red-600' : 'text-slate-900'">
                  {{ card.value }}
                </p>
                <p class="mt-0.5 truncate text-[11px] text-slate-400" :title="card.hint">{{ card.hint }}</p>
              </div>
            </div>

            <!-- KPI 卡片（仅总览分区，位于地图上方） -->
            <div v-if="isOverview" class="grid grid-cols-3 gap-4" :class="props.emptyMode ? 'mb-6' : 'mb-4'">
              <div class="rounded-xl border border-[#e3e3df] bg-white p-4">
                <div class="flex items-center gap-2">
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon :svg="strokeIconPaths.truck" :size="15" />
                  </span>
                  <span class="text-xs text-slate-500">车辆使用</span>
                </div>
                <p class="mt-2 text-3xl font-bold tracking-tight text-slate-900">{{ props.emptyMode ? 0 : formatNumber(platformAssets.vehicleCount) }}</p>
                <p class="mt-0.5 text-[11px] text-slate-400">累计使用车辆数</p>
              </div>
              <div class="rounded-xl border border-[#e3e3df] bg-white p-4">
                <div class="flex items-center gap-2">
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Icon :svg="strokeIconPaths.fileText" :size="15" />
                  </span>
                  <span class="text-xs text-slate-500">运单量</span>
                </div>
                <p class="mt-2 text-3xl font-bold tracking-tight text-slate-900">{{ props.emptyMode ? 0 : formatNumber(platformAssets.waybillTotal) }}</p>
                <p class="mt-0.5 text-[11px] text-slate-400">累计运单数</p>
              </div>
              <div class="rounded-xl border border-[#e3e3df] bg-white p-4">
                <div class="flex items-center gap-2">
                  <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Icon :svg="strokeIconPaths.locate" :size="15" />
                  </span>
                  <span class="text-xs text-slate-500">运单起终点企业</span>
                </div>
                <p class="mt-2 text-3xl font-bold tracking-tight text-slate-900">{{ props.emptyMode ? 0 : formatNumber(platformAssets.poiCount) }}</p>
                <p class="mt-0.5 text-[11px] text-slate-400">累计装货 / 卸货企业点位</p>
              </div>
            </div>

            <!-- 共享地图（吸顶）：单一地图，随下方板块与模式 pills 联动切换 -->
            <SharedAssetMap v-if="!props.emptyMode" />
            <div v-else class="mb-6 flex h-[300px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[#d5d5d0] bg-[#fafaf8]">
              <span class="flex h-11 w-11 items-center justify-center rounded-full bg-[#f0f0ed] text-slate-400">
                <Icon :svg="strokeIconPaths.map" :size="20" />
              </span>
              <p class="text-sm font-medium text-slate-500">暂无可视化数据</p>
              <p class="text-xs text-slate-400">产生业务调用后，车辆、路线与起终点企业将在此呈现</p>
            </div>

            <!-- 以下板块（在途运营分析 / 资产明细 Top10 / 更多数据能力）仅在「总览」分区展示 -->
            <template v-if="isOverview">
            <!-- 在途运营分析 -->
            <div v-if="!props.emptyMode" class="mb-5 rounded-xl border border-[#e3e3df] bg-white p-5">
              <div class="mb-4 flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-semibold text-slate-900">在途运营分析</h3>
                  <p class="mt-0.5 text-xs text-slate-500">基于已采购服务生成的在途监控与运营指标</p>
                </div>
                <button
                  type="button"
                  class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-slate-700"
                  @click="goToAgentConversation()"
                >
                  <Icon :svg="strokeIconPaths.msg" :size="13" />
                  在对话中分析
                </button>
              </div>
              <div class="grid grid-cols-3 gap-4">
                <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-4">
                  <p class="text-xs text-slate-500">高风险运单数</p>
                  <p class="mt-1 text-xl font-semibold text-red-500">{{ operationAnalysis.highRiskWaybillCount }}</p>
                </div>
                <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-4">
                  <p class="text-xs text-slate-500">低风险运单数</p>
                  <p class="mt-1 text-xl font-semibold text-emerald-600">{{ operationAnalysis.lowRiskWaybillCount }}</p>
                </div>
                <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-4">
                  <p class="text-xs text-slate-500">在途异常事件</p>
                  <p class="mt-1 text-xl font-semibold text-amber-600">
                    {{ operationAnalysis.abnormalEvents.reduce((sum, item) => sum + item.count, 0) }} 次
                  </p>
                </div>
              </div>
            </div>


            <!-- 敏感区域分析 -->
            <div v-if="!props.emptyMode" class="mb-5 rounded-xl border border-[#e3e3df] bg-white p-5">
              <div class="mb-4 flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-semibold text-slate-900">敏感区域分析</h3>
                  <p class="mt-0.5 text-xs text-slate-500">基于敏感区域库与运单停靠命中情况生成</p>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-4">
                  <p class="text-xs text-slate-500">异常点个数</p>
                  <p class="mt-1 text-xl font-semibold text-slate-900">{{ sensitiveAnalysis.areaCount }}</p>
                  <p class="mt-0.5 text-[11px] text-slate-400">
                    人工发现 {{ sensitiveAnalysis.manualCount }} 个 / AI识别 {{ sensitiveAnalysis.aiCount }} 个
                  </p>
                </div>
                <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-4">
                  <p class="text-xs text-slate-500">异常运单数</p>
                  <p class="mt-1 text-xl font-semibold text-red-500">{{ formatNumber(sensitiveAnalysis.waybillCount) }}</p>
                  <p class="mt-0.5 text-[11px] text-slate-400">
                    命中停留规则的运单（已去重）· 涉及 {{ formatNumber(sensitiveAnalysis.vehicleCount) }} 辆车
                  </p>
                </div>
              </div>
            </div>

            <!-- 客户常用资产明细 -->
            <div class="mb-3 flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-slate-900">
                  {{ assetDetailTab === 'vehicle' ? '车辆使用 · Top 10' : assetDetailTab === 'line' ? '路线覆盖 · Top 10' : '运单起终点企业' }}
                </h3>
                <p class="mt-0.5 text-xs text-slate-500">{{ props.emptyMode ? '数据沉淀后将按运单覆盖排序' : '按运单覆盖排序' }}</p>
              </div>
              <div class="flex items-center gap-1 rounded-lg border border-[#e3e3df] bg-white p-1">
                <button
                  v-for="tab in [
                    { id: 'vehicle', label: '车辆' },
                    { id: 'line', label: '路线' },
                    { id: 'poi', label: 'POI' },
                  ]"
                  :key="tab.id"
                  type="button"
                  class="rounded-md px-3 py-1 text-xs font-medium transition"
                  :class="assetDetailTab === tab.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-[#f7f7f5] hover:text-slate-900'"
                  @click="selectAssetTab(tab.id as 'vehicle' | 'line' | 'poi')"
                >
                  {{ tab.label }}
                </button>
              </div>
            </div>

            <div v-if="!props.emptyMode" class="mb-4 space-y-2">
              <div
                v-if="assetDetailTab === 'vehicle'"
                v-for="vehicle in platformVehicles"
                :key="vehicle.id"
                class="asset-list-item flex cursor-pointer items-center justify-between rounded-lg border border-[#deded9] bg-white px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50/30"
                :class="highlightedAssetId === vehicle.id ? 'border-blue-400 bg-blue-50/60' : ''"
                @mouseenter="highlightAsset(vehicle.id)"
                @mouseleave="clearHighlightAsset"
              >
                <div class="flex items-center gap-3">
                  <span class="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                    <Icon :svg="strokeIconPaths.truck" :size="16" />
                  </span>
                  <div>
                    <p class="text-sm font-medium text-slate-900">{{ maskPlate(vehicle.plate) }}</p>
                  </div>
                </div>
                <div class="flex gap-6 text-xs text-slate-500">
                  <span>车辆使用次数 {{ vehicle.usageCount }} 次</span>
                </div>
              </div>

              <div
                v-if="assetDetailTab === 'line'"
                v-for="line in platformLines.slice(0, 10)"
                :key="line.id"
                class="asset-list-item flex cursor-pointer items-center justify-between rounded-lg border border-[#deded9] bg-white px-4 py-3 transition hover:border-emerald-300 hover:bg-emerald-50/30"
                :class="highlightedAssetId === line.id ? 'border-emerald-400 bg-emerald-50/60' : ''"
                @mouseenter="highlightAsset(line.id)"
                @mouseleave="clearHighlightAsset"
              >
                <div class="flex items-center gap-3">
                  <span class="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                    <Icon :svg="strokeIconPaths.route" :size="16" />
                  </span>
                  <div>
                    <p class="text-sm font-medium text-slate-900">{{ line.from }} → {{ line.to }}</p>
                  </div>
                </div>
                <div class="flex gap-6 text-xs text-slate-500">
                  <span>运单覆盖 {{ line.waybillCount }} 单</span>
                </div>
              </div>

              <template v-if="assetDetailTab === 'poi'">
                <div>
                  <p class="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
                    装货地 POI · Top 5
                  </p>
                  <div class="space-y-2">
                    <div
                      v-for="poi in platformPois.filter((item) => item.type === 'shipper').slice(0, 5)"
                      :key="poi.id"
                      class="asset-list-item flex cursor-pointer items-center justify-between rounded-lg border border-[#deded9] bg-white px-4 py-3 transition hover:border-emerald-300 hover:bg-emerald-50/30"
                      :class="highlightedAssetId === poi.id ? 'border-emerald-400 bg-emerald-50/60' : ''"
                      @mouseenter="highlightAsset(poi.id)"
                      @mouseleave="clearHighlightAsset"
                    >
                      <div class="flex items-center gap-3">
                        <span class="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                          <Icon :svg="strokeIconPaths.locate" :size="16" />
                        </span>
                        <div>
                          <p class="text-sm font-medium text-slate-900">{{ poi.name }}</p>
                        </div>
                      </div>
                      <span class="text-xs text-slate-500">累计运单覆盖 {{ poi.count }} 次</span>
                    </div>
                  </div>
                </div>

                <div class="pt-2">
                  <p class="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <span class="h-2 w-2 rounded-full bg-orange-500"></span>
                    卸货地 POI · Top 5
                  </p>
                  <div class="space-y-2">
                    <div
                      v-for="poi in platformPois.filter((item) => item.type === 'consignee').slice(0, 5)"
                      :key="poi.id"
                      class="asset-list-item flex cursor-pointer items-center justify-between rounded-lg border border-[#deded9] bg-white px-4 py-3 transition hover:border-orange-300 hover:bg-orange-50/30"
                      :class="highlightedAssetId === poi.id ? 'border-orange-400 bg-orange-50/60' : ''"
                      @mouseenter="highlightAsset(poi.id)"
                      @mouseleave="clearHighlightAsset"
                    >
                      <div class="flex items-center gap-3">
                        <span class="flex h-9 w-9 items-center justify-center rounded-md bg-orange-50 text-orange-600">
                          <Icon :svg="strokeIconPaths.locate" :size="16" />
                        </span>
                        <div>
                          <p class="text-sm font-medium text-slate-900">{{ poi.name }}</p>
                        </div>
                      </div>
                      <span class="text-xs text-slate-500">累计运单覆盖 {{ poi.count }} 次</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <div v-else class="mb-4 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#d5d5d0] bg-[#fafaf8] py-16">
              <span class="flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f0ed] text-slate-400">
                <Icon :svg="assetDetailTab === 'vehicle' ? strokeIconPaths.truck : assetDetailTab === 'line' ? strokeIconPaths.route : strokeIconPaths.locate" :size="18" />
              </span>
              <p class="text-sm font-medium text-slate-500">
                {{ assetDetailTab === 'vehicle' ? '暂无使用车辆' : assetDetailTab === 'line' ? '暂无覆盖路线' : '暂无起终点企业' }}
              </p>
              <p class="text-xs text-slate-400">产生业务调用后，数据将自动沉淀至此</p>
            </div>

            <!-- 平台可扩展数据能力（需采购） -->
            <div class="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
              <div class="mb-3 flex items-center gap-2">
                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <Icon :svg="strokeIconPaths.info" :size="14" />
                </span>
                <h3 class="text-sm font-semibold text-slate-900">更多数据能力</h3>
              </div>

              <div class="mb-4 rounded-lg bg-gradient-to-r from-slate-800 to-slate-900 p-4 text-white shadow-sm">
                <p class="text-xs font-medium text-slate-200">大卡数字人数据底座</p>
                <p class="mt-2 text-sm">
                  {{ formatNumber(platformAssets.platformVehicleCount) }} 辆在网重卡 ·
                  {{ formatNumber(platformAssets.platformPoiCount) }} 个行业 POI ·
                  月均 {{ formatNumber(platformAssets.platformMonthlyWaybillCount) }} 单虚拟运单
                </p>
              </div>

              <p class="mb-3 text-xs text-slate-600">
                以下数据分析能力可基于平台扩展数据提供，如需开通请联系销售经理。
              </p>
              <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-600">
                <div class="flex items-center gap-1.5">
                  <span class="h-1 w-1 rounded-full bg-blue-400"></span>
                  车辆静态档案信息
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="h-1 w-1 rounded-full bg-blue-400"></span>
                  路线其他发货方、收货方、运量、用车情况
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="h-1 w-1 rounded-full bg-blue-400"></span>
                  同路线其他承运商及承运车辆信息
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="h-1 w-1 rounded-full bg-blue-400"></span>
                  POI 档案信息（名称、经营范围、地点、围栏）
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="h-1 w-1 rounded-full bg-blue-400"></span>
                  常跑路线行业洞察（运量、货类、承运商分布）
                </div>
              </div>
            </div>

            <div
              v-if="!props.emptyMode"
              class="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-[#deded9] bg-white px-4 py-3 transition hover:border-slate-400 hover:bg-[#f7f7f5]"
              @click="goToAgentConversation()"
            >
              <div class="flex items-center gap-3">
                <span class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
                  <Icon :svg="strokeIconPaths.msg" :size="15" />
                </span>
                <div>
                  <p class="text-sm font-medium text-slate-900">在对话中分析</p>
                  <p class="text-xs text-slate-500">基于当前平台数据资产继续提问</p>
                </div>
              </div>
              <Icon :svg="strokeIconPaths.chevron" :size="14" svg-class="text-slate-400" />
            </div>
            </template>
          </template>
        </div>
      </main>

    </div>


  </div>
</template>

<style lang="scss" scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// 地图内发光描边：让边界更有质感，不再是单一线条
.platform-map-frame {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    inset 0 -12px 24px rgba(15, 23, 42, 0.04),
    0 1px 2px rgba(15, 23, 42, 0.04);
}
</style>

<style lang="scss">
// ===== 底图滤镜：去灰提清透 =====
// 高德 style=8 默认偏灰，加一层非常轻的处理让蓝色海面更干净、陆地更暖
.platform-map-tiles {
  filter: saturate(1.08) contrast(1.03) brightness(1.01);
  transition: opacity 0.4s ease;
}
.platform-map-tiles:not(.tiles-loaded) {
  opacity: 0;
}

// ===== 缩放控件 =====
.platform-map .leaflet-control-zoom {
  border: none !important;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.08) !important;
  border-radius: 10px !important;
  overflow: hidden;
  margin-right: 14px !important;
  margin-bottom: 14px !important;

  a {
    width: 30px !important;
    height: 30px !important;
    line-height: 30px !important;
    border: none !important;
    background: rgba(255, 255, 255, 0.95) !important;
    color: #334155 !important;
    font-weight: 600;
    transition: all 0.15s ease;
    backdrop-filter: blur(6px);

    &:hover {
      background: #ffffff !important;
      color: #0f172a !important;
    }
    &:first-child {
      border-bottom: 1px solid #f1f5f9 !important;
      border-radius: 0 !important;
    }
    &:last-child {
      border-radius: 0 !important;
    }
  }
}

// ===== 鼠标悬停时飞线加粗过渡 =====
.platform-map .leaflet-overlay-pane path {
  transition: stroke-width 0.18s ease, opacity 0.18s ease;
}

// ===== Tooltip（悬停提示，className 落在 .leaflet-tooltip 上） =====
.leaflet-tooltip.line-tooltip {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.06);
  padding: 10px 12px;
  color: #0f172a;
  backdrop-filter: blur(8px);

  &::before {
    display: none;
  }
}

// ===== Popup（点击弹出层，className 落在 .leaflet-popup 外层） =====
// 外层只保留定位，卡片样式放到 content-wrapper 上，避免「两层卡片」
.leaflet-popup.line-tooltip {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  backdrop-filter: none;

  .leaflet-popup-content-wrapper {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(226, 232, 240, 0.9);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.06);
    backdrop-filter: blur(8px);
  }

  .leaflet-popup-content {
    margin: 10px 12px;
    line-height: normal;
  }

  .leaflet-popup-tip {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(226, 232, 240, 0.9);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  }
}

.line-tooltip-content {
  min-width: 168px;
}

.line-tooltip-title {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f1f5f9;
}

.line-tooltip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 11px;
  line-height: 20px;

  span {
    color: #64748b;
  }

  b {
    font-weight: 600;
    color: #0f172a;
  }
}
</style>
