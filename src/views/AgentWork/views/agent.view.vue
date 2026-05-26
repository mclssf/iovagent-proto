<script lang="ts" setup>
import type { TimelineEvent } from '../interface';
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

const store = agentWorkData();
const { agentMessages, agentInput } = storeToRefs(store);
const { goPage, createDownload, sendAgent } = useAgentWorkNav();
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

function setRightPanel(key: string) {
  store.rightPanel = key;
}

const isOrderEventPanel = computed(() => store.visibleRightPanel === 'orderEvent');
const isDefaultOverview = computed(() => store.visibleRightPanel === 'overview');

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
  return 'border-slate-200 bg-white';
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
  if (!import.meta.env.DEV) return;
  const { ordersSeed } = store;
  const riskOrders = getRiskOrders(ordersSeed);
  console.assert(ordersSeed.length === 6, '运单列表应展示全部运单');
  console.assert(riskOrders.length === 4, '异常运单列表应展示高风险和低风险运单');
  console.assert(riskOrders.every((item) => item.risk !== '无风险'), '异常运单列表不得包含无风险运单');
});

watch(
  () => store.visibleRightPanel,
  (panel) => {
    if (panel === 'orderEvent') {
      initEventPanelMap();
      return;
    }
    clearEventPanelMap();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearEventPanelMap();
});
</script>

<template>
  <div class="grid grid-cols-2 gap-6">
    <div class="flex h-[calc(100vh-112px)] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-200 px-5 py-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Icon :svg="strokeIconPaths.msg" :size="18" />
            </div>
            <div>
              <h1 class="text-lg font-semibold text-slate-900">智能体工作台</h1>
              <p class="mt-0.5 text-xs text-slate-500">查询、筛选、分析和下载</p>
            </div>
          </div>
        </div>
      </div>
      <div class="flex-1 space-y-4 overflow-auto bg-slate-50 p-5">
        <div v-for="(m, i) in agentMessages" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
          <div
            class="rounded-md px-4 py-3 text-sm leading-6"
            :class="[
              m.role === 'user' ? 'max-w-[72%] bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700',
              m.title ? 'max-w-[86%]' : 'max-w-[72%]',
            ]"
          >
            <template v-if="m.role === 'agent' && m.title">
              <div class="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                <div>
                  <div class="text-sm font-semibold text-slate-900">{{ m.title }}</div>
                  <div class="mt-0.5 text-xs text-slate-400">任务执行记录</div>
                </div>
                <span class="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{{ m.status }}</span>
              </div>
              <div v-if="m.text" class="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                {{ m.text }}
              </div>
              <div v-if="m.steps?.length" class="divide-y divide-slate-100 rounded-md border border-slate-100 bg-white">
                <div v-for="(step, stepIndex) in m.steps" :key="step.title" class="grid grid-cols-[82px_1fr] gap-2 px-3 py-1.5">
                  <div class="text-[11px] font-semibold leading-5 text-slate-900">0{{ stepIndex + 1 }} · {{ step.title }}</div>
                  <div class="min-w-0 text-xs leading-5 text-slate-500">
                    {{ step.text }}
                  </div>
                </div>
              </div>
              <div v-if="m.result" class="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs font-medium leading-5 text-blue-700">
                {{ m.result }}
              </div>
            </template>
            <template v-else>
              {{ m.text }}
            </template>
          </div>
        </div>
      </div>
      <div class="border-t border-slate-200 bg-white p-4">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <span class="mr-1 text-xs font-medium text-slate-500">推荐指令</span>
          <button
            v-for="s in quickPrompts"
            :key="s"
            type="button"
            class="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-400 hover:text-slate-900"
            @click="sendAgent(s)"
          >
            {{ s }}
          </button>
        </div>
        <div class="rounded-md border border-[#dbe3ee] bg-white px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
          <textarea
            v-model="agentInput"
            class="min-h-[64px] w-full resize-none bg-transparent text-sm leading-7 text-slate-800 outline-none"
            placeholder="输入查询，例如：今天有哪些异常运单"
            @keydown.enter.exact.prevent="sendAgent()"
          />
          <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <div class="text-xs text-slate-400">Enter 发送，Shift Enter 换行</div>
            <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" @click="sendAgent()">发送</button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex h-[calc(100vh-112px)] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-200" :class="isDefaultOverview ? 'p-5' : 'px-5 py-3'">
        <div class="flex items-start justify-between gap-4" :class="isDefaultOverview ? 'mb-4' : 'mb-3'">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">
              {{ isOrderEventPanel ? '只看皖K55821异常停车事件' : isDefaultOverview ? '今日在途情况' : '今日在途预警处理结果' }}
            </h2>
            <p class="mt-0.5 text-xs text-slate-500">
              {{ isOrderEventPanel ? 'WB20260509018 · 合肥仓 → 南京仓' : isDefaultOverview ? '预警汇总、运单结果、分析结论' : '高风险异常运单、判定理由、低风险过滤说明' }}
            </p>
          </div>
          <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('green')">实时同步</span>
        </div>
        <div v-if="isDefaultOverview" class="grid grid-cols-4 gap-3">
          <div class="rounded-md bg-slate-50 p-4">
            <div class="text-xs text-slate-500">监控运单</div>
            <div class="mt-1 text-2xl font-semibold text-slate-900">128</div>
          </div>
          <div class="rounded-md bg-slate-50 p-4">
            <div class="text-xs text-slate-500">异常运单</div>
            <div class="mt-1 text-2xl font-semibold text-red-600">17</div>
          </div>
          <div class="rounded-md bg-slate-50 p-4">
            <div class="text-xs text-slate-500">高风险</div>
            <div class="mt-1 text-2xl font-semibold text-red-600">6</div>
          </div>
          <div class="rounded-md bg-slate-50 p-4">
            <div class="text-xs text-slate-500">低风险</div>
            <div class="mt-1 text-2xl font-semibold text-orange-600">11</div>
          </div>
        </div>
        <div v-else-if="!isOrderEventPanel" class="grid grid-cols-4 gap-2">
          <div class="rounded-md bg-slate-50 px-3 py-2">
            <div class="text-[11px] text-slate-500">处理预警</div>
            <div class="mt-0.5 text-xl font-semibold text-slate-900">17</div>
          </div>
          <div class="rounded-md bg-slate-50 px-3 py-2">
            <div class="text-[11px] text-slate-500">真实高风险</div>
            <div class="mt-0.5 text-xl font-semibold text-red-600">5</div>
          </div>
          <div class="rounded-md bg-slate-50 px-3 py-2">
            <div class="text-[11px] text-slate-500">合理低风险</div>
            <div class="mt-0.5 text-xl font-semibold text-emerald-600">11</div>
          </div>
          <div class="rounded-md bg-slate-50 px-3 py-2">
            <div class="text-[11px] text-slate-500">轨迹造假</div>
            <div class="mt-0.5 text-xl font-semibold text-red-600">1</div>
          </div>
        </div>
      </div>
      <div v-if="!isOrderEventPanel" class="border-b border-slate-200 bg-white px-5" :class="isDefaultOverview ? 'py-3' : 'py-2'">
        <div class="flex rounded-md bg-slate-100 p-1 text-sm">
          <button
            v-for="[key, label] in rightPanelTabs"
            :key="key"
            type="button"
            class="flex-1 rounded-lg px-3"
            :class="[isDefaultOverview ? 'py-2' : 'py-1.5', store.visibleRightPanel === key ? 'bg-white font-medium shadow-sm' : 'text-slate-500']"
            @click="setRightPanel(key)"
          >
            {{ label }}
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto bg-slate-50 p-5">
        <div v-if="store.visibleRightPanel === 'orderEvent'" class="space-y-4">
          <div class="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div class="relative h-[260px] overflow-hidden">
              <div ref="panelMapRef" class="h-full w-full"></div>
              <div class="pointer-events-none absolute top-3 left-3 z-[1000] rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow">
                <div class="font-semibold text-slate-900">合肥仓 → 南京仓</div>
                <div class="mt-1 flex gap-3 text-slate-500">
                  <span>{{ panelRouteDistance }}</span>
                  <span>{{ panelRouteDuration }}</span>
                  <span>WGS84</span>
                </div>
              </div>
              <div class="pointer-events-none absolute top-3 right-3 z-[1000] flex gap-2">
                <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shadow-sm" :class="badgeToneClass('green')">低风险停车 1</span>
                <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium shadow-sm" :class="badgeToneClass('red')">高风险停车 1</span>
              </div>
            </div>
          </div>

          <div class="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-2">
              <div class="text-sm font-semibold">事件 Timeline</div>
              <button
                type="button"
                class="rounded-md px-3 py-2 text-xs font-medium"
                :class="store.detailOnlyAbnormal ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'"
                @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal"
              >
                <Icon :svg="strokeIconPaths.filter" :size="14" svg-class="mr-1 inline" /> 只看异常停车
              </button>
            </div>
            <div class="mb-3 flex rounded-md bg-slate-100 p-1 text-xs">
              <button
                type="button"
                class="flex-1 rounded-lg px-3 py-2"
                :class="store.detailView === 'agent' ? 'bg-white shadow-sm' : 'text-slate-500'"
                @click="store.detailView = 'agent'"
              >
                智能体判断
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg px-3 py-2"
                :class="store.detailView === 'rule' ? 'bg-white shadow-sm' : 'text-slate-500'"
                @click="store.detailView = 'rule'"
              >
                规则判断
              </button>
            </div>
            <div class="space-y-3">
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
            <div class="rounded-md border border-slate-200 bg-white p-4">
              <div class="mb-3 flex items-center justify-between">
                <div class="text-sm font-semibold">近 7 天异常趋势</div>
                <span class="text-xs text-slate-400">单位：单</span>
              </div>
              <div class="h-40 rounded-md bg-slate-50 px-3 pb-3 pt-5">
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
            <div class="rounded-md border border-slate-200 bg-white p-4">
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
          <div class="rounded-md border border-slate-200 bg-white p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-semibold">智能体结论</div>
              <button type="button" class="text-xs font-medium text-slate-900" @click="goPage('analytics')">查看统计归因</button>
            </div>
            <div class="space-y-3 text-sm text-slate-700">
              <div class="rounded-md bg-red-50 p-3 text-red-700">今日异常率 13.3%，较昨日上升 2.1 个百分点。</div>
              <div class="rounded-md bg-orange-50 p-3 text-orange-700">异常主要集中在安捷物流和上海工厂 → 广州仓线路。</div>
              <div class="rounded-md bg-slate-50 p-3">建议优先复核非目的地物流园长停，以及 GPS 高风险轨迹段。</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <button type="button" class="rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white" @click="goPage('risk')">查看异常运单</button>
            <button type="button" class="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700" @click="goPage('orders')">
              查看全部运单
            </button>
          </div>
        </div>

        <div v-else-if="store.visibleRightPanel === 'risk'" class="space-y-4">
          <div class="rounded-md border border-slate-200 bg-white p-3">
            <div class="mb-2 flex items-center justify-between">
              <div class="text-sm font-semibold">高风险异常运单</div>
              <button type="button" class="text-xs font-medium text-slate-900" @click="goPage('risk')">进入列表</button>
            </div>
            <div class="space-y-2 text-sm">
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
                  <span class="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">停靠点：{{ o.stopPoint }}</span>
                  <span class="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{{ o.type }}</span>
                </div>
                <div class="mt-2 rounded-md bg-slate-50 px-3 py-2 leading-6 text-slate-600">
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
    </div>
  </div>
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
