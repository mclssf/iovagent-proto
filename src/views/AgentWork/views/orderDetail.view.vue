<script lang="ts" setup>
import type { TimelineEvent } from '../interface';

import { Icon } from '@packages/icon';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { agentWorkData } from '@/pinia/agentWork';
import { convertGpsCoordinates, loadAMap, searchDrivingRoute, type AMapCoordinate } from '@/utils/amap';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass } from '../utils';

const store = agentWorkData();
const mapRef = ref<HTMLDivElement | null>(null);
const routeDistance = ref('--');
const routeDuration = ref('--');

let mapInstance: AMap.Map | null = null;

type GpsCoordinate = [number, number];

type MapTone = 'current' | 'end' | 'risk' | 'start' | 'stop' | 'warn';

interface MapPoint {
  coord: GpsCoordinate;
  desc: string;
  name: string;
  tone: MapTone;
}

const routeWaypoints: GpsCoordinate[] = [
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

const fallbackRoute: GpsCoordinate[] = [
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
  return 'border-[#deded9] bg-white';
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function markerContent(tone: MapTone) {
  const root = document.createElement('div');
  root.className = 'agent-map-marker';
  const pin = document.createElement('div');
  pin.className = `agent-map-pin agent-map-pin--${tone}`;
  root.append(pin);
  return root;
}

function popupContent(point: MapPoint) {
  const [lat, lng] = point.coord;
  const root = document.createElement('div');
  root.className = 'agent-map-popup';
  const title = document.createElement('b');
  const desc = document.createElement('p');
  const coordinate = document.createElement('span');
  title.textContent = point.name;
  desc.textContent = point.desc;
  coordinate.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  root.append(title, desc, coordinate);
  return root;
}

function nearestRouteIndex(route: AMapCoordinate[], target: AMapCoordinate) {
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

function drawRoute(amap: typeof AMap, route: AMapCoordinate[], riskPoints: AMapCoordinate[]) {
  if (!mapInstance) return;

  const routeShadow = new amap.Polyline({ path: route, strokeColor: '#ffffff', strokeOpacity: 0.9, strokeWeight: 9 });
  const routeLine = new amap.Polyline({ path: route, strokeColor: '#0f172a', strokeOpacity: 0.9, strokeWeight: 5 });
  mapInstance.add([routeShadow, routeLine]);

  const riskStart = nearestRouteIndex(route, riskPoints[0]!);
  const riskEnd = nearestRouteIndex(route, riskPoints[1]!);
  const [from, to] = riskStart < riskEnd ? [riskStart, riskEnd] : [riskEnd, riskStart];
  const riskSegment = route.slice(from, to + 1);

  if (riskSegment.length > 1) {
    mapInstance.add(new amap.Polyline({
      path: riskSegment,
      strokeColor: '#7c3aed',
      strokeDasharray: [10, 8],
      strokeOpacity: 0.95,
      strokeStyle: 'dashed',
      strokeWeight: 7,
    }));
  }

  mapInstance.setFitView([routeShadow], false, [34, 34, 34, 34]);
}

function drawMarkers(amap: typeof AMap, coordinates: AMapCoordinate[]) {
  if (!mapInstance) return;

  mapPoints.forEach((point, index) => {
    const marker = new amap.Marker({
      anchor: 'center',
      content: markerContent(point.tone),
      position: coordinates[index],
      title: point.name,
      zIndex: point.tone === 'current' ? 120 : 100,
    });
    if (['start', 'current', 'end', 'stop', 'warn'].includes(point.tone)) {
      marker.setLabel({
        content: point.name,
        direction: 'top',
        offset: new amap.Pixel(0, -8),
      });
    }
    marker.on('click', () => {
      new amap.InfoWindow({
        anchor: 'bottom-center',
        content: popupContent(point),
        offset: new amap.Pixel(0, -14),
      }).open(mapInstance!, coordinates[index]!);
    });
    mapInstance!.add(marker);
  });
}

async function initMap() {
  await nextTick();
  if (!mapRef.value || mapInstance) return;

  try {
    const amap = await loadAMap(['AMap.Driving', 'AMap.ToolBar']);
    const convertedWaypoints = await convertGpsCoordinates(amap, routeWaypoints.map(([lat, lng]) => [lng, lat]));
    const convertedFallback = await convertGpsCoordinates(amap, fallbackRoute.map(([lat, lng]) => [lng, lat]));
    const convertedMarkers = await convertGpsCoordinates(amap, mapPoints.map(({ coord: [lat, lng] }) => [lng, lat]));
    const riskPoints = await convertGpsCoordinates(amap, [[112.9388, 28.2282], [113.8546, 27.6229]]);

    mapInstance = new amap.Map(mapRef.value, {
      center: [117.15, 27.35],
      mapStyle: 'amap://styles/whitesmoke',
      viewMode: '2D',
      zoom: 6,
    });
    mapInstance.addControl(new amap.ToolBar({ position: 'RB' }));

    try {
      const roadRoute = await searchDrivingRoute(amap, convertedWaypoints);
      routeDistance.value = `${Math.round(roadRoute.distance / 1000).toLocaleString()} km`;
      routeDuration.value = formatDuration(roadRoute.duration);
      drawRoute(amap, roadRoute.path, riskPoints);
    } catch {
      routeDistance.value = '约 1,650 km';
      routeDuration.value = '约 22h';
      drawRoute(amap, convertedFallback, riskPoints);
    }
    drawMarkers(amap, convertedMarkers);
  } catch {
    routeDistance.value = '地图加载失败';
    routeDuration.value = '请稍后重试';
  }
}

onMounted(() => {
  store.detailView = 'agent';
  initMap();
});

onBeforeUnmount(() => {
  mapInstance?.destroy();
  mapInstance = null;
});
</script>

<template>
  <div class="flex h-full flex-col space-y-3">
    <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex h-12 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.map" :size="16" />
          </div>
          <div>
            <h1 class="text-sm font-semibold leading-5 text-slate-950">运单详情与地图轨迹</h1>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-6 gap-3 p-4 text-sm">
        <div v-for="row in store.detailInfoRows" :key="row.label" class="rounded-md bg-[#f7f7f5] p-3">
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
      <div class="flex h-full flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
        <div class="flex h-12 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div class="text-sm font-semibold leading-5">地图轨迹</div>
          <div class="flex gap-2">
            <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('red')">异常停车点 2</span>
            <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('purple')">轨迹造假高风险段 1</span>
          </div>
        </div>
        <div class="relative min-h-[590px] flex-1 overflow-hidden">
          <div ref="mapRef" class="h-full min-h-[590px] w-full"></div>
          <div class="pointer-events-none absolute top-4 left-4 z-[1000] rounded-md border border-[#deded9] bg-white/95 px-3 py-2 text-xs text-slate-700">
            <div class="font-semibold text-slate-900">上海一厂 → 广州仓</div>
            <div class="mt-1 flex gap-3 text-slate-500">
              <span>{{ routeDistance }}</span>
              <span>{{ routeDuration }}</span>
              <span>高德坐标</span>
            </div>
          </div>
        </div>
      </div>
      <div class="flex h-full flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
        <div class="flex h-12 items-center justify-between gap-2 border-b border-[#e2e2dc] px-3">
          <div class="text-sm font-semibold leading-5">事件 Timeline</div>
          <button
            type="button"
            class="rounded-md px-3 py-2 text-xs font-medium"
            :class="store.detailOnlyAbnormal ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'"
            @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal"
          >
            <Icon :svg="strokeIconPaths.filter" :size="14" svg-class="mr-1 inline" /> 只看异常事件
          </button>
        </div>
        <div class="m-3 flex rounded-md bg-[#f2f2ef] p-1 text-xs">
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
        <div class="max-h-[530px] space-y-3 overflow-auto px-3 pb-3">
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
:deep(.amap-container) {
  background: #e2e8f0;
  color: #0f172a;
  font-family: inherit;
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

:deep(.amap-marker-label) {
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
