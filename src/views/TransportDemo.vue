<script lang="ts" setup>
import type { LatLngTuple } from 'leaflet';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { createTransportDemo, loadTransportDemo } from './transportDemo';

const route = useRoute();
const mapRef = ref<HTMLDivElement | null>(null);
const routeSource = ref<'fallback' | 'loading' | 'road'>('loading');
const query = typeof route.query.q === 'string' ? route.query.q : '查询订单运输情况';
const demoId = typeof route.query.id === 'string' ? route.query.id : '';
const data = ref(loadTransportDemo(demoId) ?? createTransportDemo(query));

let mapInstance: L.Map | null = null;

const formattedPlannedDeparture = computed(() => formatDateTime(data.value.plannedDeparture));
const formattedActualDeparture = computed(() => formatDateTime(data.value.actualDeparture));
const formattedPlannedArrival = computed(() => formatDateTime(data.value.plannedArrival));
const formattedEstimatedArrival = computed(() => formatDateTime(data.value.estimatedArrival));
const formattedLastLocatedAt = computed(() => formatDateTime(data.value.lastLocatedAt));
const traveledKm = computed(() => data.value.totalKm - data.value.remainingKm);

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace('/', '-');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);
}

function markerIcon(tone: 'current' | 'destination' | 'origin', label: string) {
  return L.divIcon({
    className: 'transport-map-marker',
    html: `<span class="transport-map-pin transport-map-pin--${tone}"></span><span class="transport-map-label">${escapeHtml(label)}</span>`,
    iconAnchor: [9, 9],
    iconSize: [18, 18],
  });
}

async function getRoadRoute(): Promise<LatLngTuple[]> {
  const [originLat, originLng] = data.value.originPosition;
  const [destinationLat, destinationLng] = data.value.destinationPosition;
  const endpoint = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destinationLng},${destinationLat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Road route request failed');
    const payload = await response.json();
    const coordinates = payload?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) throw new Error('Road route is empty');
    routeSource.value = 'road';
    return coordinates.map(([longitude, latitude]: [number, number]) => [latitude, longitude]);
  } catch {
    routeSource.value = 'fallback';
    return [data.value.originPosition, data.value.currentPosition, data.value.destinationPosition];
  }
}

async function initMap() {
  await nextTick();
  if (!mapRef.value || mapInstance) return;

  mapInstance = L.map(mapRef.value, {
    attributionControl: false,
    center: data.value.currentPosition,
    zoom: 7,
    zoomControl: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addAttribution('&copy; OpenStreetMap contributors').addTo(mapInstance);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapInstance);

  const coordinates = await getRoadRoute();
  const currentIndex = Math.max(1, Math.min(coordinates.length - 2, Math.round((coordinates.length - 1) * data.value.progressPercent / 100)));
  const currentPosition = coordinates[currentIndex]!;
  data.value.currentPosition = currentPosition;

  const routeShadow = L.polyline(coordinates, { color: '#ffffff', opacity: 0.88, weight: 9 }).addTo(mapInstance);
  L.polyline(coordinates, { color: '#9aa6b2', opacity: 0.78, weight: 5 }).addTo(mapInstance);
  L.polyline(coordinates.slice(0, currentIndex + 1), { color: '#1677ff', opacity: 0.96, weight: 5 }).addTo(mapInstance);

  L.marker(data.value.originPosition, { icon: markerIcon('origin', '装货地') }).addTo(mapInstance);
  L.marker(currentPosition, { icon: markerIcon('current', '当前位置'), zIndexOffset: 200 }).addTo(mapInstance);
  L.marker(data.value.destinationPosition, { icon: markerIcon('destination', '卸货地') }).addTo(mapInstance);

  mapInstance.fitBounds(routeShadow.getBounds(), { padding: [38, 38] });
  setTimeout(() => mapInstance?.invalidateSize(), 80);
}

onMounted(() => {
  document.body.classList.add('transport-demo-body');
  initMap();
});
onBeforeUnmount(() => {
  document.body.classList.remove('transport-demo-body');
  mapInstance?.remove();
  mapInstance = null;
});
</script>

<template>
  <div class="min-h-screen bg-[#f6f7f8] text-slate-900">
    <header class="flex h-12 items-center justify-between border-b border-[#e4e7ea] bg-white px-4">
      <div class="flex min-w-0 items-center gap-2.5">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[11px] font-semibold text-white">DK</span>
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-slate-950">运输详情</div>
          <div class="truncate text-[11px] text-slate-400">{{ data.orderNo }}</div>
        </div>
      </div>
      <span class="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">{{ data.status }}</span>
    </header>

    <main class="mx-auto w-full max-w-[980px] bg-white pb-10">
      <section class="px-4 pt-5 pb-4 sm:px-6">
        <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div class="min-w-0">
            <div class="truncate text-base font-semibold text-slate-950">{{ data.origin.split('市')[0] }}</div>
            <div class="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{{ data.origin }}</div>
          </div>
          <div class="flex w-28 items-center gap-2 text-[10px] text-slate-400 sm:w-40">
            <span class="h-2 w-2 rounded-full bg-slate-900"></span>
            <span class="h-px flex-1 bg-slate-300"></span>
            <span class="text-blue-600">{{ data.progressPercent }}%</span>
            <span class="h-px flex-1 bg-slate-300"></span>
            <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
          </div>
          <div class="min-w-0 text-right">
            <div class="truncate text-base font-semibold text-slate-950">{{ data.destination.split('市')[0] }}</div>
            <div class="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{{ data.destination }}</div>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-3 border-y border-[#e8eaed] bg-[#fafbfb]">
        <div class="px-3 py-3.5 text-center">
          <div class="text-[11px] text-slate-500">预计到达</div>
          <div class="mt-1 text-sm font-semibold tabular-nums text-slate-950">{{ formattedEstimatedArrival }}</div>
        </div>
        <div class="border-x border-[#e8eaed] px-3 py-3.5 text-center">
          <div class="text-[11px] text-slate-500">总里程</div>
          <div class="mt-1 text-sm font-semibold tabular-nums text-slate-950">{{ data.totalKm }} km</div>
        </div>
        <div class="px-3 py-3.5 text-center">
          <div class="text-[11px] text-slate-500">剩余里程</div>
          <div class="mt-1 text-sm font-semibold tabular-nums text-blue-700">{{ data.remainingKm }} km</div>
        </div>
      </section>

      <section class="relative border-b border-[#e8eaed]">
        <div ref="mapRef" class="h-[360px] w-full bg-slate-100 sm:h-[430px]"></div>
        <div class="absolute top-3 left-3 z-[500] max-w-[calc(100%-24px)] rounded-md bg-white/95 px-3 py-2 shadow-[0_8px_22px_rgba(15,23,42,0.16)] backdrop-blur-sm">
          <div class="truncate text-xs font-semibold text-slate-900">{{ data.currentLocation }}</div>
          <div class="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
            <span>{{ data.plate }}</span>
            <span>·</span>
            <span>{{ data.speedKph }} km/h</span>
            <span>·</span>
            <span>{{ formattedLastLocatedAt }}</span>
          </div>
        </div>
        <span class="absolute right-3 bottom-3 z-[500] rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-500 shadow-sm">
          {{ routeSource === 'road' ? '道路路线已拟合' : routeSource === 'loading' ? '路线加载中' : '模拟路线' }}
        </span>
      </section>

      <section class="grid gap-0 border-b border-[#e8eaed] sm:grid-cols-2">
        <div class="px-4 py-4 sm:px-6">
          <div class="text-xs text-slate-500">运单与货物</div>
          <div class="mt-2 text-sm font-medium text-slate-900">{{ data.cargo }}</div>
          <div class="mt-1 text-xs text-slate-500">{{ data.carrier }} · {{ data.plate }}</div>
        </div>
        <div class="border-t border-[#e8eaed] px-4 py-4 sm:border-t-0 sm:border-l sm:px-6">
          <div class="text-xs text-slate-500">计划与实际发车</div>
          <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-700">
            <span>计划 {{ formattedPlannedDeparture }}</span>
            <span>实际 {{ formattedActualDeparture }}</span>
          </div>
          <div class="mt-1 text-xs text-slate-500">计划到达 {{ formattedPlannedArrival }}</div>
        </div>
      </section>

      <section class="px-4 pt-6 sm:px-6">
        <div class="mb-5 flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold text-slate-950">车辆运输节点</h2>
          <span class="text-[11px] tabular-nums text-slate-400">已行驶 {{ traveledKm }} km</span>
        </div>
        <ol class="relative ml-1 border-l border-slate-200 pl-5">
          <li v-for="item in data.timeline" :key="`${item.title}-${item.time}`" class="relative pb-6 last:pb-0">
            <span
              class="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ring-1"
              :class="item.state === 'current' ? 'bg-blue-600 ring-blue-200' : item.state === 'done' ? 'bg-slate-700 ring-slate-200' : 'bg-white ring-slate-300'"
            ></span>
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="text-xs font-semibold" :class="item.state === 'pending' ? 'text-slate-400' : 'text-slate-900'">{{ item.title }}</div>
                <div class="mt-1 text-xs leading-5 text-slate-500">{{ item.place }}</div>
                <div class="text-xs leading-5 text-slate-400">{{ item.description }}</div>
              </div>
              <time class="shrink-0 text-[11px] tabular-nums text-slate-400">{{ formatDateTime(item.time) }}</time>
            </div>
          </li>
        </ol>
      </section>

      <p class="mx-4 mt-8 border-t border-[#eceef0] pt-4 text-[11px] leading-5 text-slate-400 sm:mx-6">本页面用于产品演示，运输数据与定位结果为合理范围内的仿真数据。</p>
    </main>
  </div>
</template>

<style lang="scss" scoped>
:global(body.transport-demo-body) {
  min-width: 0;
  overflow-x: hidden;
  background: #f6f7f8;
}

:global(body.transport-demo-body #app) {
  min-width: 0;
}

:deep(.leaflet-container) {
  color: #0f172a;
  font-family: inherit;
}

:deep(.leaflet-control-attribution) {
  border-radius: 4px;
  color: #64748b;
  font-size: 9px;
}

:deep(.transport-map-marker) {
  background: transparent;
  border: 0;
}

:deep(.transport-map-pin) {
  display: block;
  height: 18px;
  width: 18px;
  border: 3px solid #fff;
  border-radius: 999px;
  box-shadow: 0 7px 18px rgb(15 23 42 / 24%);
}

:deep(.transport-map-pin--origin) { background: #0f172a; }
:deep(.transport-map-pin--current) { background: #1677ff; box-shadow: 0 7px 18px rgb(22 119 255 / 36%), 0 0 0 5px rgb(22 119 255 / 16%); }
:deep(.transport-map-pin--destination) { background: #10b981; }

:deep(.transport-map-label) {
  position: absolute;
  top: 24px;
  left: 50%;
  padding: 3px 7px;
  transform: translateX(-50%);
  border: 1px solid rgb(226 232 240 / 92%);
  border-radius: 5px;
  background: rgb(255 255 255 / 94%);
  color: #334155;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgb(15 23 42 / 10%);
}

:deep(.leaflet-control-zoom a) {
  color: #334155;
}
</style>
