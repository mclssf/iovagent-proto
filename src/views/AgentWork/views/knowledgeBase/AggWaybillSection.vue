<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import * as echarts from 'echarts';

import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../../strokeIconPaths';

import { assetMapState } from './assetMapStore';
import { getAggLines } from './mockData';
import type { AggDimension, AggLine } from './mockData';


const DIMENSION_TABS: Array<{ id: AggDimension; label: string }> = [
  { id: 'province', label: '省 - 省' },
  { id: 'city', label: '市 - 市' },
  { id: 'county', label: '县 - 县' },
];

// 近 12 个月（2025-12 ~ 2026-11）
const MONTH_LABELS = ['25/12', '26/01', '26/02', '26/03', '26/04', '26/05', '26/06', '26/07', '26/08', '26/09', '26/10', '26/11'];

/** 当前激活的聚合维度：与共享地图模式双向同步；地图在其他模式时保留上次维度 */
const lastDimension = ref<AggDimension>('province');
const dimension = computed<AggDimension>({
  get: () => {
    if (assetMapState.mode === 'province' || assetMapState.mode === 'city' || assetMapState.mode === 'county') {
      lastDimension.value = assetMapState.mode;
    }
    return lastDimension.value;
  },
  set: (dim) => {
    assetMapState.selectedLineId = '';
    assetMapState.mode = dim;
  },
});

const lines = computed<AggLine[]>(() => getAggLines(dimension.value));
const selectedLineId = computed(() => assetMapState.selectedLineId);
const drawerOpen = ref(false);

const trendChartRef = ref<HTMLDivElement | null>(null);
let trendChart: echarts.ECharts | null = null;

const selectedLine = computed<AggLine | null>(
  () => lines.value.find((line) => line.id === selectedLineId.value) ?? null,
);

const drawerStats = computed(() => {
  const line = selectedLine.value;
  if (!line) return null;
  const avg = Math.round(line.waybillCount / 12);
  const peakIdx = line.monthlyTrend.indexOf(Math.max(...line.monthlyTrend));
  return {
    avg,
    peakLabel: MONTH_LABELS[peakIdx],
    peakValue: line.monthlyTrend[peakIdx],
  };
});

function formatNumber(num: number) {
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return num.toLocaleString();
}

function renderTrendChart() {
  if (!trendChartRef.value) return;
  if (!trendChart) trendChart = echarts.init(trendChartRef.value);
  const line = selectedLine.value;
  if (!line) return;
  trendChart.setOption({
    grid: { left: 8, right: 10, top: 18, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e2e8f0',
      textStyle: { color: '#0f172a', fontSize: 11 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `${p.name}<br/>发单量：<b>${Number(p.value).toLocaleString()}</b> 单`;
      },
    },
    xAxis: {
      type: 'category',
      data: MONTH_LABELS,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => formatNumber(v) },
    },
    series: [{
      type: 'line',
      data: line.monthlyTrend,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      showSymbol: false,
      lineStyle: { color: '#3b82f6', width: 2 },
      itemStyle: { color: '#3b82f6' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59,130,246,0.18)' },
            { offset: 1, color: 'rgba(59,130,246,0.02)' },
          ],
        },
      },
    }],
  }, true);
  trendChart.resize();
}

function selectLine(line: AggLine) {
  assetMapState.mode = line.dimension;
  assetMapState.selectedLineId = line.id;
}

function closeDrawer() {
  drawerOpen.value = false;
  assetMapState.selectedLineId = '';
}

function hoverLine(line: AggLine | null) {
  // 悬停列表即切换地图到当前维度并高亮对应飞线
  if (line) {
    assetMapState.mode = line.dimension;
    assetMapState.hoverLineId = line.id;
  } else {
    assetMapState.hoverLineId = '';
  }
}

// 地图点击飞线 / 外部选中 → 打开抽屉
watch(selectedLineId, (id) => {
  const exists = lines.value.some((line) => line.id === id);
  if (id && exists) {
    drawerOpen.value = true;
    nextTick(() => renderTrendChart());
  } else {
    drawerOpen.value = false;
  }
});

// 地图模式切走 → 关闭抽屉并清除选中
watch(() => assetMapState.mode, (mode) => {
  if (mode !== dimension.value) {
    drawerOpen.value = false;
    if (assetMapState.selectedLineId) assetMapState.selectedLineId = '';
  }
});

onBeforeUnmount(() => {
  trendChart?.dispose();
  trendChart = null;
});
</script>

<template>
  <div class="mb-5">
    <!-- 标题区 -->
    <div class="mb-3 flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-violet-50 text-violet-600">
            <Icon :svg="strokeIconPaths.route" :size="15" />
          </span>
          <h3 class="text-sm font-semibold text-slate-900">聚合运单线路</h3>
        </div>
        <p class="mt-1 pl-9 text-xs text-slate-500">
          按行政区划聚合的运单流向 · 上方地图随维度切换联动呈现全部飞线
        </p>
      </div>
      <div class="flex items-center gap-1 rounded-lg border border-[#e3e3df] bg-white p-1">
        <button
          v-for="tab in DIMENSION_TABS"
          :key="tab.id"
          type="button"
          class="rounded-md px-3 py-1 text-xs font-medium transition"
          :class="dimension === tab.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-[#f7f7f5] hover:text-slate-900'"
          @click="dimension = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="relative">
      <!-- 列表 -->
      <div class="overflow-hidden rounded-xl border border-[#e4e4e0] bg-white">
        <div class="border-b border-[#eeeeec] px-4 py-2.5">
          <p class="text-xs font-semibold text-slate-900">
            线路列表 · 按运单量排序 · 共 {{ lines.length }} 条
          </p>
          <p class="text-[11px] text-slate-400">悬停高亮地图飞线，点击查看发单趋势与 TOP10 流向</p>
        </div>
        <div class="grid grid-cols-2 gap-2 p-2">
          <div
            v-for="(line, idx) in lines"
            :key="line.id"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition"
            :class="selectedLineId === line.id ? 'bg-violet-50' : 'hover:bg-[#f7f7f5]'"
            @click="selectLine(line)"
            @mouseenter="hoverLine(line)"
            @mouseleave="hoverLine(null)"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold"
                :class="idx < 3 ? 'bg-violet-600 text-white' : 'bg-[#f0f0ed] text-slate-500'"
              >{{ idx + 1 }}</span>
              <div class="min-w-0">
                <p class="truncate text-[13px] font-medium text-slate-900">{{ line.from }} → {{ line.to }}</p>
                <p class="mt-0.5 text-[11px] text-slate-400">承运车辆 {{ line.carrierVehicleCount.toLocaleString() }} 辆</p>
              </div>
            </div>
            <span class="shrink-0 text-xs font-semibold text-slate-700">{{ formatNumber(line.waybillCount) }} 单</span>
          </div>
        </div>
      </div>

      <!-- 抽屉详情 -->
      <transition name="agg-drawer">
        <div
          v-if="drawerOpen && selectedLine"
          class="absolute inset-y-0 right-0 z-[500] flex w-[400px] flex-col border-l border-[#e3e3df] bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.08)]"
        >
          <div class="flex items-start justify-between gap-3 border-b border-[#eeeeec] px-5 py-4">
            <div>
              <p class="text-[15px] font-semibold text-slate-900">{{ selectedLine.from }} → {{ selectedLine.to }}</p>
              <p class="mt-0.5 text-xs text-slate-500">
                {{ DIMENSION_TABS.find((t) => t.id === dimension)?.label }} 聚合 · 统计周期近 12 个月
              </p>
            </div>
            <button
              type="button"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#f2f2ef] hover:text-slate-700"
              @click="closeDrawer"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <!-- KPI -->
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-3">
                <p class="text-[11px] text-slate-500">运单总数</p>
                <p class="mt-1 text-lg font-semibold text-slate-900">{{ selectedLine.waybillCount.toLocaleString() }}</p>
              </div>
              <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-3">
                <p class="text-[11px] text-slate-500">承运车辆数</p>
                <p class="mt-1 text-lg font-semibold text-slate-900">{{ selectedLine.carrierVehicleCount.toLocaleString() }}</p>
              </div>
              <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-3">
                <p class="text-[11px] text-slate-500">月均发单</p>
                <p class="mt-1 text-lg font-semibold text-slate-900">{{ drawerStats?.avg.toLocaleString() }}</p>
              </div>
              <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-3">
                <p class="text-[11px] text-slate-500">峰值月</p>
                <p class="mt-1 text-lg font-semibold text-slate-900">
                  {{ drawerStats?.peakLabel }}
                  <span class="ml-1 text-xs font-normal text-slate-500">{{ drawerStats?.peakValue.toLocaleString() }} 单</span>
                </p>
              </div>
            </div>

            <!-- 发单趋势 -->
            <div class="mt-4">
              <p class="mb-2 text-xs font-semibold text-slate-900">发单趋势 · 近 12 个月</p>
              <div ref="trendChartRef" class="h-[180px] w-full"></div>
            </div>

            <!-- TOP10 流向 -->
            <div class="mt-4">
              <p class="mb-2 text-xs font-semibold text-slate-900">TOP 10 起讫流向</p>
              <div class="overflow-hidden rounded-lg border border-[#e3e3df]">
                <div
                  v-for="(flow, idx) in selectedLine.topFlows"
                  :key="`${flow.from}-${flow.to}`"
                  class="flex items-center gap-2.5 border-b border-[#f1f1ee] px-3 py-2 last:border-b-0"
                >
                  <span
                    class="flex shrink-0 items-center justify-center rounded text-[10px] font-semibold"
                    :class="idx < 3 ? 'bg-violet-600 text-white' : 'bg-[#f0f0ed] text-slate-500'"
                    style="width: 18px; height: 18px;"
                  >{{ idx + 1 }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium text-slate-800">{{ flow.from }} → {{ flow.to }}</p>
                    <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#f1f1ee]">
                      <div
                        class="h-full rounded-full bg-violet-500"
                        :style="{ width: `${Math.min(100, (flow.waybillCount / (selectedLine.topFlows[0]?.waybillCount || 1)) * 100)}%` }"
                      ></div>
                    </div>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-xs font-semibold text-slate-800">{{ flow.waybillCount.toLocaleString() }}</p>
                    <p class="text-[10px] text-slate-400">{{ ((flow.waybillCount / selectedLine.waybillCount) * 100).toFixed(1) }}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.agg-drawer-enter-active,
.agg-drawer-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.agg-drawer-enter-from,
.agg-drawer-leave-to {
  transform: translateX(24px);
  opacity: 0;
}
</style>
