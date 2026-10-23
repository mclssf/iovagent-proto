<script lang="ts" setup>
import type { TimelineEvent } from '../interface';

import { Icon } from '@packages/icon';
import { ElSwitch } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { agentWorkData } from '@/pinia/agentWork';
import { convertGpsCoordinates, loadAMap, searchDrivingRoute, type AMapCoordinate } from '@/utils/amap';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass } from '../utils';
import { detailEventConclusion, detailEventDuration, detailEventSupplement, detailRiskTone } from '../orderDetailPresentation';
import { evidenceEnterpriseName } from '../waybillEvidence';
import { mountTransportMapWatermark } from '../transportMapWatermark';

const store = agentWorkData();
const mapRef = ref<HTMLDivElement | null>(null);
const routeDistance = ref('--');
const routeDuration = ref('--');
const watermarkEnabled = ref(false);
const selectedEventId = ref<number | null>(null);
const expandedEvents = ref<number[]>([]);
const order = computed(() => store.currentDetailOrder);
const summaryFields = computed(() => [
  { label: '车牌', value: order.value.plate },
  { label: '司机', value: order.value.driver },
  { label: '承运商', value: order.value.carrier, wide: true },
  { label: '开始时间', value: order.value.startTime, wide: true },
]);
const mapReady = ref(false);
const mapLoading = ref(true);
const mapError = ref('');

let mapInstance: AMap.Map | null = null;
let watermark: ReturnType<typeof mountTransportMapWatermark> | undefined;
let routeOverlay: AMap.Polyline | undefined;
let markerCoordinates: AMapCoordinate[] = [];
let disposed = false;
let mapResizeObserver: ResizeObserver | undefined;
let resizeFrame = 0;
const mapMarkers: { content: HTMLElement; open: () => void }[] = [];
const eventMarkerIndexes: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 3, 6: 5 };

function fitMap() {
  if (!disposed && mapInstance && routeOverlay) mapInstance.setFitView([routeOverlay], true, watermark?.padding() ?? [60, 60, 60, 60]);
}

function syncWatermark() {
  watermark?.destroy();
  watermark = undefined;
  if (!mapInstance || !mapReady.value) return;
  if (watermarkEnabled.value) {
    const order = store.currentDetailOrder;
    watermark = mountTransportMapWatermark(mapInstance, {
      enterprise: evidenceEnterpriseName(), plate: order.plate, order: order.id,
      loading: { poi: mapPoints[0]!.name.replace('装货地 · ', ''), coordinate: markerCoordinates[0], time: order.startTime },
      unloading: { poi: mapPoints[mapPoints.length - 1]!.name.replace('卸货地 · ', ''), coordinate: markerCoordinates[mapPoints.length - 1], time: '待卸货' },
      distance: routeDistance.value, period: `${order.startTime} 至今`,
    });
  }
  fitMap();
}

watch(watermarkEnabled, syncWatermark);

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

function eventTone(event: TimelineEvent) {
  return `tone-${detailRiskTone(event.agentVerdict, event.agentTone)}`;
}

function eventIcon(event: TimelineEvent) {
  if (event.type === 'stop') return strokeIconPaths.pause;
  if (event.type === 'risk') return strokeIconPaths.route;
  if (event.id === 2) return strokeIconPaths.truck;
  if (event.id === 6) return strokeIconPaths.locate;
  return strokeIconPaths.waypoints;
}

function toggleEventDetails(event: TimelineEvent) {
  expandedEvents.value = expandedEvents.value.includes(event.id)
    ? expandedEvents.value.filter(id => id !== event.id)
    : [...expandedEvents.value, event.id];
}

function highlightMarker(index: number) {
  mapMarkers.forEach((entry, markerIndex) => entry.content.classList.toggle('is-selected', markerIndex === index));
}

function selectEvent(event: TimelineEvent) {
  selectedEventId.value = event.id;
  const index = eventMarkerIndexes[event.id];
  if (index === undefined) return;
  highlightMarker(index);
  mapMarkers[index]?.open();
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
  routeOverlay = routeShadow;
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
    const content = markerContent(point.tone);
    const marker = new amap.Marker({
      anchor: 'center',
      content,
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
    const open = () => {
      if (!mapInstance) return;
      new amap.InfoWindow({
        anchor: 'bottom-center',
        content: popupContent(point),
        offset: new amap.Pixel(0, -14),
      }).open(mapInstance!, coordinates[index]!);
    };
    mapMarkers.push({ content, open });
    marker.on('click', () => {
      const eventId = Object.keys(eventMarkerIndexes).map(Number).find(id => eventMarkerIndexes[id] === index);
      selectedEventId.value = eventId ?? null;
      highlightMarker(index);
      open();
    });
    mapInstance!.add(marker);
  });
  if (selectedEventId.value !== null) {
    const index = eventMarkerIndexes[selectedEventId.value];
    if (index !== undefined) { highlightMarker(index); mapMarkers[index]?.open(); }
  }
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
    if (disposed || !mapRef.value) return;
    markerCoordinates = convertedMarkers;

    mapInstance = new amap.Map(mapRef.value, {
      center: [117.15, 27.35],
      mapStyle: 'amap://styles/macaron',
      viewMode: '2D',
      zoom: 6,
      WebGLParams: { preserveDrawingBuffer: true },
    });
    mapInstance.addControl(new amap.ToolBar({ position: 'RB' }));

    try {
      const roadRoute = await searchDrivingRoute(amap, convertedWaypoints);
      if (disposed) return;
      routeDistance.value = `${Math.round(roadRoute.distance / 1000).toLocaleString()} km`;
      routeDuration.value = formatDuration(roadRoute.duration);
      drawRoute(amap, roadRoute.path, riskPoints);
      mapReady.value = true;
    } catch {
      if (disposed) return;
      routeDistance.value = '约 1,650 km';
      routeDuration.value = '约 22h';
      mapError.value = '道路路线暂不可用，请刷新页面重试';
      drawRoute(amap, convertedFallback, riskPoints);
    }
    drawMarkers(amap, convertedMarkers);
    syncWatermark();
  } catch {
    if (disposed) return;
    routeDistance.value = '地图加载失败';
    routeDuration.value = '请稍后重试';
    mapError.value = '地图加载失败，请检查网络后刷新页面';
  } finally { if (!disposed) mapLoading.value = false; }
}

onMounted(() => {
  store.detailView = 'agent';
  void initMap();
  if (mapRef.value) {
    mapResizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(fitMap);
    });
    mapResizeObserver.observe(mapRef.value);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  mapResizeObserver?.disconnect();
  cancelAnimationFrame(resizeFrame);
  watermark?.destroy();
  mapInstance?.destroy();
  mapMarkers.length = 0;
  mapInstance = null;
});
</script>

<template>
  <div class="order-detail-page">
    <section class="detail-map-section" :class="{ 'has-watermark': watermarkEnabled }" aria-label="运单地图轨迹">
      <header class="detail-panel-header">
        <h1><Icon :svg="strokeIconPaths.map" :size="16" />地图轨迹</h1>
        <div class="detail-map-badges"><span :class="badgeToneClass('red')">异常停车 2</span><span :class="badgeToneClass('purple')">轨迹风险 1</span></div>
      </header>
      <div class="detail-map-stage">
        <div ref="mapRef" class="detail-map-canvas" style="color:#253440;background-color:#eef3f6;font-family:sans-serif"></div>
        <div class="detail-map-tools" aria-label="地图操作">
          <div class="detail-watermark-toggle"><span>水印</span><ElSwitch v-model="watermarkEnabled" size="small" aria-label="显示地图水印" /></div>
        </div>
        <div v-if="!watermarkEnabled || !mapReady" class="detail-route-summary">
          <strong>上海一厂 → 广州仓</strong><div><span>{{ routeDistance }}</span><span>{{ routeDuration }}</span></div>
        </div>
        <div v-if="mapLoading || mapError" class="detail-map-status" :role="mapError ? 'alert' : 'status'">{{ mapError || '正在加载地图与运输轨迹…' }}</div>
      </div>
    </section>

    <aside class="detail-sidebar" aria-label="运单详情与运输事件">
      <header class="detail-panel-header detail-summary-header"><h2><Icon :svg="strokeIconPaths.fileText" :size="16" />运单详情</h2></header>
      <section class="detail-order-summary" aria-label="运单摘要">
        <h3 class="detail-order-route">{{ order.route || '—' }}</h3>
        <p class="detail-order-number"><span>运单号</span><span>{{ order.id || '—' }}</span></p>
        <div class="detail-order-statuses">
          <span class="detail-badge detail-transport-status" aria-label="运输状态">{{ order.status || '—' }}</span>
          <span class="detail-badge" :class="`tone-${detailRiskTone(order.risk)}`" aria-label="风险等级">{{ order.risk || '—' }}</span>
        </div>
        <dl class="detail-facts">
          <div v-for="field in summaryFields" :key="field.label" :class="{ 'is-wide': field.wide }">
            <dt>{{ field.label }}</dt><dd>{{ field.value || '—' }}</dd>
          </div>
        </dl>
        <div class="detail-order-eta"><Icon :svg="strokeIconPaths.alarmClock" :size="15" /><span>预计到达</span><strong>{{ order.eta || '—' }}</strong></div>
      </section>
      <section class="detail-events" aria-label="运输事件流">
        <header class="detail-events-header">
          <h2>运输事件<span>{{ store.timelineEvents.length }}</span></h2>
          <button type="button" class="detail-filter" :class="{ 'is-active': store.detailOnlyAbnormal }" :aria-pressed="store.detailOnlyAbnormal" title="只看异常事件" @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal"><Icon :svg="strokeIconPaths.filter" :size="13" />只看异常</button>
        </header>
        <div class="detail-event-list">
          <article v-for="event in store.timelineEvents" :key="event.id" class="detail-event" :class="[eventTone(event), { 'is-abnormal': event.type !== 'normal', 'is-selected': selectedEventId === event.id }]" :data-event-id="event.id">
            <div class="detail-event-track" aria-hidden="true"><span><Icon :svg="eventIcon(event)" :size="13" /></span></div>
            <div class="detail-event-content">
              <button type="button" class="detail-event-select" :aria-pressed="selectedEventId === event.id" :aria-label="`${event.title}，${event.time}，定位地图`" @click="selectEvent(event)">
                <span class="detail-event-heading"><span class="detail-event-title">{{ event.title }}</span><span v-if="event.agentVerdict" class="detail-badge detail-event-verdict">{{ event.agentVerdict }}</span><Icon class="detail-event-locate" :svg="strokeIconPaths.locate" :size="13" /></span>
                <span class="detail-event-timing"><time>{{ event.time || '—' }}</time><span v-if="event.type === 'stop' && detailEventDuration(event)" class="detail-event-duration">{{ detailEventDuration(event) }}</span></span>
                <span class="detail-event-place"><Icon :svg="strokeIconPaths.locate" :size="12" /><span>{{ event.place || event.stopPlace || '—' }}</span></span>
                <span class="detail-event-conclusion">{{ detailEventConclusion(event) }}</span>
              </button>
              <template v-if="detailEventSupplement(event)">
                <button type="button" class="detail-event-expand" :aria-expanded="expandedEvents.includes(event.id)" :aria-controls="`event-details-${event.id}`" @click="toggleEventDetails(event)">
                  <span v-if="event.agent" class="detail-ai-label"><Icon :svg="strokeIconPaths.zap" :size="11" />AI 分析</span>
                  {{ expandedEvents.includes(event.id) ? '收起说明' : '查看说明' }}<Icon :svg="strokeIconPaths.chevron" :size="12" :class="{ 'is-expanded': expandedEvents.includes(event.id) }" />
                </button>
                <div v-if="expandedEvents.includes(event.id)" :id="`event-details-${event.id}`" class="detail-event-supplement">
                  <p v-if="event.agent && event.desc">{{ event.desc }}</p><p>{{ detailEventSupplement(event) }}</p>
                </div>
              </template>
            </div>
          </article>
          <p v-if="!store.timelineEvents.length" class="detail-events-empty">暂无{{ store.detailOnlyAbnormal ? '异常' : '' }}事件</p>
        </div>
      </section>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.order-detail-page { display: grid; grid-template-columns: minmax(0, 1fr) 440px; height: 100%; min-height: 0; overflow: hidden; background: #fff; }
.detail-map-section, .detail-sidebar { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.detail-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 0 14px; border-bottom: 1px solid #e2e2dc; }
.detail-panel-header h1, .detail-panel-header h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; font-weight: 600; line-height: 20px; color: #202a37; }
.detail-map-badges { display: flex; gap: 6px; }
.detail-map-badges > span { padding: 2px 6px; border: 1px solid; border-radius: 4px; font-size: 11px; line-height: 17px; white-space: nowrap; }
.detail-map-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.detail-map-canvas { width: 100%; height: 100%; min-height: 100%; }
.detail-map-tools { position: absolute; top: 12px; right: 12px; z-index: 1000; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border: 1px solid #dfe3e6; border-radius: 6px; background: #fff; box-shadow: 0 2px 6px rgb(25 39 51 / 8%); }
.detail-watermark-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #3d4c5c; }
.detail-route-summary { position: absolute; top: 16px; left: 16px; z-index: 500; max-width: calc(100% - 210px); pointer-events: none; font-size: 12px; color: #314556; text-shadow: 0 1px 2px #fff, 1px 0 2px #fff; }
.detail-route-summary strong { font-weight: 600; }
.detail-route-summary > div { display: flex; flex-wrap: wrap; gap: 3px 12px; margin-top: 4px; font-size: 11px; }
.detail-map-status { position: absolute; bottom: 42px; left: 16px; right: 16px; z-index: 1000; width: fit-content; max-width: calc(100% - 32px); padding: 7px 10px; background: #fff; border: 1px solid #dfe3e6; border-radius: 4px; font-size: 12px; color: #465663; }
.detail-sidebar { border-left: 1px solid #deded9; background: #fff; color: #334155; }
.detail-sidebar ::selection { color: #172b4d; background: #dbeafe; }
.detail-summary-header { flex-shrink: 0; padding-inline: 16px; border-bottom-color: #e5eaf2; }
.detail-summary-header h2 { color: #172b4d; font-size: 13px; }
.detail-summary-header :deep(svg) { color: #2563eb; }
.detail-order-summary { flex-shrink: 0; padding: 14px 16px 16px; background: linear-gradient(180deg, #eef4ff, #fff); }
.detail-order-route { margin: 0; color: #172b4d; font-size: 14px; font-weight: 600; line-height: 22px; overflow-wrap: anywhere; }
.detail-order-number { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 0; color: #425a7e; font-size: 12px; line-height: 18px; }
.detail-order-number > span:first-child { flex-shrink: 0; }
.detail-order-number > span:last-child { min-width: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.detail-order-statuses { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.detail-badge { display: inline-flex; align-items: center; width: fit-content; padding: 2px 7px; border-radius: 4px; background: var(--event-soft, #f1f5f9); color: var(--event-color, #475569); font-size: 12px; font-weight: 500; line-height: 18px; }
.tone-danger { --event-color: #dc2626; --event-soft: #fef2f2; --event-border: #f4cece; --event-surface: #fffafa; }
.tone-warning { --event-color: #b45309; --event-soft: #fffbeb; --event-border: #f4e0b9; --event-surface: #fffdf7; }
.tone-normal { --event-color: #15803d; --event-soft: #f0fdf4; --event-border: #cfe7d7; --event-surface: #fbfefc; }
.tone-neutral { --event-color: #64748b; --event-soft: #f8fafc; --event-border: #e5eaf2; --event-surface: #fff; }
.detail-transport-status { color: #1d4ed8; background: #e4eeff; }
.detail-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 14px; margin: 12px 0; font-size: 13px; line-height: 20px; }
.detail-facts > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.detail-facts > .is-wide { grid-column: 1 / -1; display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 8px; align-items: baseline; }
.detail-facts dt { color: #526887; font-size: 12px; line-height: 20px; }
.detail-facts dd { margin: 0; color: #172b4d; font-weight: 500; overflow-wrap: anywhere; }
.detail-order-eta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-radius: 6px; color: #345891; background: #eff6ff; font-size: 12px; line-height: 20px; }
.detail-order-eta :deep(svg) { flex-shrink: 0; color: #2563eb; }
.detail-order-eta strong { margin-left: auto; color: #172b4d; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.detail-events { display: flex; flex: 1; flex-direction: column; min-height: 0; border-top: 1px solid #e5eaf2; }
.detail-events-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; min-height: 48px; flex-shrink: 0; padding: 8px 16px; }
.detail-events-header h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; font-weight: 600; color: #172b4d; line-height: 20px; }
.detail-events-header h2 span { font-size: 12px; font-weight: 500; color: #64748b; font-variant-numeric: tabular-nums; }
.detail-filter { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 7px; border: 1px solid #e5eaf2; border-radius: 5px; color: #475569; font-size: 12px; white-space: nowrap; cursor: pointer; }
.detail-filter:hover { color: #1d4ed8; border-color: #c3d6f5; background: #f8fbff; }
.detail-filter.is-active { color: #1d4ed8; border-color: #c3d6f5; background: #eff6ff; }
.detail-filter:focus-visible, .detail-event-select:focus-visible, .detail-event-expand:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.detail-event-list { flex: 1; min-height: 0; padding: 0 16px 16px; overflow: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; overscroll-behavior: contain; }
.detail-event { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 8px; padding-bottom: 12px; }
.detail-event-track { position: relative; padding-top: 9px; }
.detail-event-track > span { position: relative; z-index: 1; display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid #e5eaf2; border-radius: 50%; color: var(--event-color); background: #fff; }
.detail-event.is-abnormal .detail-event-track > span { border-color: var(--event-border); background: var(--event-soft); }
.detail-event:not(:last-child) .detail-event-track::after { content: ''; position: absolute; top: 33px; bottom: -9px; left: 11.5px; width: 1px; background: #e5eaf2; }
.detail-event-content { min-width: 0; border: 1px solid transparent; border-radius: 8px; background: #fff; transition: border-color .15s ease, background-color .15s ease; }
.detail-event.is-abnormal .detail-event-content { border-color: var(--event-border); background: var(--event-surface); }
.detail-event-content:hover { border-color: #c3d6f5; background: #f8fbff; }
.detail-event.is-selected .detail-event-content { border-color: #2563eb; background: #eff6ff; box-shadow: 0 2px 4px rgb(23 43 77 / 5%); }
.detail-event.is-selected .detail-event-track > span { border-color: #2563eb; color: #2563eb; }
.detail-event-select { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 9px 10px; border-radius: 7px; text-align: left; cursor: pointer; }
.detail-event:not(.is-abnormal) .detail-event-select { gap: 4px; padding-block: 8px; }
.detail-event-heading { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px 7px; width: 100%; }
.detail-event-title { flex: 1 1 100px; min-width: 0; color: #172b4d; font-size: 13px; font-weight: 600; line-height: 20px; overflow-wrap: anywhere; }
.detail-event-locate { flex-shrink: 0; margin-top: 4px; color: #64748b; }
.detail-event-select:hover .detail-event-locate, .detail-event.is-selected .detail-event-locate { color: #2563eb; }
.detail-event-verdict { flex-shrink: 0; font-size: 12px; }
.detail-event-timing { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 8px; color: #64748b; font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
.detail-event-duration { color: #334155; font-weight: 500; }
.detail-event-place { display: flex; align-items: flex-start; gap: 4px; color: #64748b; font-size: 12px; line-height: 19px; }
.detail-event-place :deep(svg) { flex-shrink: 0; margin-top: 3px; }
.detail-event-place > span { min-width: 0; overflow-wrap: anywhere; }
.detail-event.is-selected .detail-event-timing, .detail-event.is-selected .detail-event-place { color: #526887; }
.detail-event-conclusion { color: #334155; font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.detail-event-expand { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin: 0 10px 9px; padding: 2px 0; color: #3460a4; font-size: 12px; line-height: 18px; cursor: pointer; }
.detail-event-expand > :deep(svg:last-child) { transition: transform .15s ease; }
.detail-event-expand .is-expanded { transform: rotate(90deg); }
.detail-ai-label { display: inline-flex; align-items: center; gap: 3px; margin-right: 2px; color: #7e3faf; font-size: 11px; font-weight: 500; }
.detail-event-supplement { margin: 0 10px 10px; padding-top: 8px; border-top: 1px solid #e5eaf2; color: #334155; font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.detail-event-supplement p { margin: 0; }
.detail-event-supplement p + p { margin-top: 6px; }
.detail-events-empty { padding: 24px 0; color: #64748b; font-size: 13px; text-align: center; }
@media (prefers-reduced-motion: reduce) { .detail-event-content, .detail-event-expand > :deep(svg) { transition: none; } }
@media (max-width: 1100px) { .order-detail-page { grid-template-columns: minmax(0, 1fr) 400px; } }
@media (max-width: 700px) {
  .order-detail-page { display: flex; flex-direction: column; overflow: auto; }
  .detail-map-section { height: 620px; flex-shrink: 0; }
  .detail-map-section.has-watermark { height: 800px; }
  .detail-panel-header { padding: 0 10px; gap: 6px; }
  .detail-map-badges { gap: 4px; }
  .detail-map-badges > span { padding: 2px 4px; }
  .detail-sidebar { flex-shrink: 0; border-top: 1px solid #deded9; border-left: 0; }
  .detail-summary-header { padding-inline: 16px; }
  .detail-event-list { overflow: visible; }
}

:deep(.amap-container) {
  background: #e2e8f0;
  color: #0f172a;
  font-family: inherit;
}

:deep(.agent-map-marker) {
  background: transparent;
  border: 0;
}

:deep(.agent-map-marker.is-selected .agent-map-pin) {
  outline: 2px solid #2563eb;
  outline-offset: 4px;
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
