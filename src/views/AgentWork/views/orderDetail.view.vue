<script lang="ts" setup>
import type { TimelineEvent } from '../interface';
import type { LatLngExpression, LatLngTuple } from 'leaflet';

import { Icon } from '@packages/icon';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass } from '../utils';

const store = agentWorkData();
const mapRef = ref<HTMLDivElement | null>(null);
const routeDistance = ref('--');
const routeDuration = ref('--');

let mapInstance: L.Map | null = null;

type MapTone = 'current' | 'end' | 'risk' | 'start' | 'stop' | 'warn';

interface MapPoint {
  coord: LatLngTuple;
  desc: string;
  name: string;
  tone: MapTone;
}

const routeWaypoints: LatLngTuple[] = [
  [31.2304, 121.4737],
  [30.743, 120.758],
  [29.1157, 119.6483],
  [28.455, 117.96],
  [28.6829, 115.8582],
  [27.6229, 113.8546],
  [28.2282, 112.9388],
  [23.6818, 113.056],
  [23.158, 113.48],
];

const fallbackRoute: LatLngTuple[] = [
  [31.2304, 121.4737],
  [30.86, 121.05],
  [30.743, 120.758],
  [30.2741, 120.1551],
  [29.8683, 120.0748],
  [29.1157, 119.6483],
  [28.455, 117.96],
  [28.6829, 115.8582],
  [27.6229, 113.8546],
  [27.8273, 113.1338],
  [28.2282, 112.9388],
  [26.893, 112.572],
  [25.797, 113.031],
  [24.81, 113.597],
  [23.6818, 113.056],
  [23.158, 113.48],
];

const mapPoints: MapPoint[] = [
  {
    name: '装货地 · 上海一厂',
    coord: [31.2304, 121.4737],
    desc: '车辆进入装货地围栏，开始执行运输任务。',
    tone: 'start',
  },
  {
    name: '异常停车 · G60嘉兴服务区附近',
    coord: [30.743, 120.758],
    desc: '13:42 - 15:21，服务区附近停车 99 分钟，智能体判定为低风险合理休息。',
    tone: 'warn',
  },
  {
    name: '异常停车 · 萍乡物流园',
    coord: [27.6229, 113.8546],
    desc: '17:06 - 18:40，非目的地物流园停车 94 分钟，建议人工复核。',
    tone: 'stop',
  },
  {
    name: 'GPS轨迹高风险段',
    coord: [27.8273, 113.1338],
    desc: '沪昆高速湖南段出现轨迹断点和速度异常，外部算法输出高风险。',
    tone: 'risk',
  },
  {
    name: '当前位置 · 清远段',
    coord: [23.6818, 113.056],
    desc: '车辆已进入粤北清远段，继续向广州仓行驶。',
    tone: 'current',
  },
  {
    name: '卸货地 · 广州仓',
    coord: [23.158, 113.48],
    desc: '广州黄埔仓附近卸货地围栏。',
    tone: 'end',
  },
];

function eventCardClass(event: TimelineEvent) {
  if (event.type === 'risk') return 'border-purple-200 bg-purple-50';
  if (event.type === 'stop' && store.detailView === 'agent' && event.agentTone === 'green') return 'border-emerald-200 bg-emerald-50';
  if (event.type === 'stop') return 'border-red-200 bg-red-50';
  return 'border-slate-200 bg-white';
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
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

function nearestRouteIndex(route: LatLngTuple[], target: LatLngTuple) {
  let nearest = 0;
  let minDistance = Number.POSITIVE_INFINITY;

  route.forEach((coord, index) => {
    const distance = (coord[0] - target[0]) ** 2 + (coord[1] - target[1]) ** 2;
    if (distance < minDistance) {
      nearest = index;
      minDistance = distance;
    }
  });

  return nearest;
}

async function fetchRoadRoute() {
  const coordText = routeWaypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordText}?overview=full&geometries=geojson`);
  if (!response.ok) throw new Error('OSRM request failed');
  const data = await response.json();
  const route = data.routes?.[0];
  const coordinates = route?.geometry?.coordinates as [number, number][] | undefined;
  if (!coordinates?.length) throw new Error('OSRM route is empty');

  routeDistance.value = `${Math.round(route.distance / 1000).toLocaleString()} km`;
  routeDuration.value = formatDuration(route.duration);
  return coordinates.map(([lng, lat]) => [lat, lng] as LatLngTuple);
}

function drawRoute(route: LatLngTuple[]) {
  if (!mapInstance) return;

  const routeShadow = L.polyline(route as LatLngExpression[], {
    color: '#ffffff',
    opacity: 0.9,
    weight: 9,
  }).addTo(mapInstance);

  const routeLine = L.polyline(route as LatLngExpression[], {
    color: '#0f172a',
    opacity: 0.9,
    weight: 5,
  }).addTo(mapInstance);

  const riskStart = nearestRouteIndex(route, [28.2282, 112.9388]);
  const riskEnd = nearestRouteIndex(route, [27.6229, 113.8546]);
  const [from, to] = riskStart < riskEnd ? [riskStart, riskEnd] : [riskEnd, riskStart];
  const riskSegment = route.slice(from, to + 1);

  if (riskSegment.length > 1) {
    L.polyline(riskSegment as LatLngExpression[], {
      color: '#7c3aed',
      dashArray: '10 8',
      opacity: 0.95,
      weight: 7,
    }).addTo(mapInstance);
  }

  routeLine.bringToFront();
  mapInstance.fitBounds(routeShadow.getBounds(), { padding: [34, 34] });
}

function drawMarkers() {
  if (!mapInstance) return;

  mapPoints.forEach((point) => {
    const marker = L.marker(point.coord, { icon: markerIcon(point.tone) }).addTo(mapInstance!);
    marker.bindPopup(popupHtml(point), { closeButton: false, offset: [0, -6] });

    if (['start', 'current', 'end', 'stop', 'warn'].includes(point.tone)) {
      marker.bindTooltip(point.name, {
        className: 'agent-map-tooltip',
        direction: 'top',
        offset: [0, -10],
        permanent: true,
      });
    }
  });
}

async function initMap() {
  await nextTick();
  if (!mapRef.value || mapInstance) return;

  mapInstance = L.map(mapRef.value, {
    attributionControl: false,
    center: [27.35, 117.15],
    zoom: 6,
    zoomControl: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
  L.control
    .attribution({ position: 'bottomleft', prefix: false })
    .addAttribution('&copy; OpenStreetMap contributors')
    .addTo(mapInstance);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(mapInstance);

  try {
    const roadRoute = await fetchRoadRoute();
    drawRoute(roadRoute);
  } catch {
    routeDistance.value = '约 1,650 km';
    routeDuration.value = '约 22h';
    drawRoute(fallbackRoute);
  }

  drawMarkers();
  setTimeout(() => mapInstance?.invalidateSize(), 80);
}

onMounted(() => {
  store.detailView = 'agent';
  initMap();
});

onBeforeUnmount(() => {
  mapInstance?.remove();
  mapInstance = null;
});
</script>

<template>
  <div class="flex h-full flex-col space-y-4">
    <div class="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Icon :svg="strokeIconPaths.map" :size="18" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-slate-900">运单详情与地图轨迹</h1>
            <p class="mt-1 text-sm text-slate-500">{{ store.currentDetailOrder.id }} · {{ store.currentDetailOrder.plate }}</p>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-6 gap-3 text-sm">
        <div v-for="row in store.detailInfoRows" :key="row.label" class="rounded-md bg-slate-50 p-3">
          <div class="text-xs text-slate-500">
            {{ row.label }}
          </div>
          <div class="mt-1 truncate text-sm font-semibold" :class="row.danger ? 'text-red-600' : 'text-slate-900'">
            {{ row.value }}
          </div>
        </div>
      </div>
    </div>
    <div class="grid h-0 flex-1 grid-cols-[1.15fr_0.85fr] gap-4">
      <div class="flex h-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-200 p-4">
          <div class="font-semibold">地图轨迹</div>
          <div class="flex gap-2">
            <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('red')">异常停车点 2</span>
            <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('purple')">轨迹造假高风险段 1</span>
          </div>
        </div>
        <div class="relative min-h-[590px] flex-1 overflow-hidden">
          <div ref="mapRef" class="h-full min-h-[590px] w-full"></div>
          <div class="pointer-events-none absolute top-4 left-4 z-[1000] rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow">
            <div class="font-semibold text-slate-900">上海一厂 → 广州仓</div>
            <div class="mt-1 flex gap-3 text-slate-500">
              <span>{{ routeDistance }}</span>
              <span>{{ routeDuration }}</span>
              <span>WGS84</span>
            </div>
          </div>
        </div>
      </div>
      <div class="flex h-full flex-col rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-4 flex items-center justify-between gap-2">
          <div class="font-semibold">事件 Timeline</div>
          <button
            type="button"
            class="rounded-md px-3 py-2 text-xs font-medium"
            :class="store.detailOnlyAbnormal ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'"
            @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal"
          >
            <Icon :svg="strokeIconPaths.filter" :size="14" svg-class="mr-1 inline" /> 只看异常事件
          </button>
        </div>
        <div class="mb-4 flex rounded-md bg-slate-100 p-1 text-xs">
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
        <div class="max-h-[530px] space-y-3 overflow-auto pr-1">
          <div
            v-for="e in store.timelineEvents"
            :key="e.id"
            class="rounded-md border p-3"
            :class="eventCardClass(e)"
          >
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">
                {{ e.title }}
              </div>
              <div class="text-xs text-slate-500">
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
