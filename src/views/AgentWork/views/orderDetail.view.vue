<script lang="ts" setup>
import type { TimelineEvent } from '../interface';

import { Icon } from '@packages/icon';
import { ElSwitch } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePhase1 } from '@/pinia/phase1';
import MonitoringOrderPanel from '@/views/Phase1/MonitoringOrderPanel.vue';
import { dateText, eventNames } from '@/views/Phase1/catalog';
import { monitorTimeline, monitorEventPoint } from '@/views/Phase1/monitorTimeline';

import { agentWorkData } from '@/pinia/agentWork';
import { convertGpsCoordinates, loadAMap, searchDrivingRoute, type AMapCoordinate } from '@/utils/amap';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass } from '../utils';
import { detailEventConclusion, detailEventDuration, detailEventSupplement, detailRiskTone } from '../orderDetailPresentation';
import { evidenceEnterpriseName } from '../waybillEvidence';
import { mountTransportMapWatermark } from '../transportMapWatermark';
import { guideDate, guideProjectId, guideTrips } from '../guideScenarios';

const store = agentWorkData();
const route = useRoute();
const monitoring = usePhase1();
watch(() => [route.query.projectId, route.query.orderId], ([projectId, orderId]) => {
  const project = store.projects.find(item => item.id === projectId);
  if (project && store.currentProjectId !== project.id) store.switchProject(project);
  const record = store.currentProjectOrders.find(item => item.id === orderId);
  if (record) store.setSelectedOrder(record);
}, { immediate: true });
const monitoredOrder = monitoring.orders.find(item => item.id === store.selectedOrder.id && item.projectId === store.currentProjectId);
const guideTrip = store.currentProjectId === guideProjectId ? guideTrips.find(t => t.id === store.selectedOrder.id) : undefined;
const positionedEvents = monitoredOrder ? monitoring.events.flatMap(event => {
  if (event.projectId !== monitoredOrder.projectId || event.orderId !== monitoredOrder.id) return [];
  const point = monitorEventPoint(monitoredOrder, event);
  return point ? [{ event, point }] : [];
}) : [];
const alarmCounts = computed(() => {
  const counts = new Map<string, { count: number; high: boolean }>();
  const add = (kind: string, high: boolean) => {
    const previous = counts.get(kind);
    counts.set(kind, { count: (previous?.count ?? 0) + 1, high: high || !!previous?.high });
  };
  const alarmEvents = new Set<string>();
  for (const item of monitoring.anomalies) {
    if (item.orderId !== monitoredOrder?.id) continue;
    add(item.kind, true);
    if (item.eventId) alarmEvents.add(item.eventId);
  }
  for (const event of monitoring.events) {
    if (event.projectId === monitoredOrder?.projectId && event.orderId === monitoredOrder?.id &&
        event.assessment?.verdict === 'reasonable' && !alarmEvents.has(event.id)) add(eventNames[event.type], false);
  }
  return counts;
});
const mapRef = ref<HTMLDivElement | null>(null);
const routeDistance = ref('--');
const routeDuration = ref('--');
const watermarkEnabled = ref(false);
type EventKey = string | number;
const selectedEventId = ref<EventKey | null>(guideTrip?.points[Number(route.query.event) - 1] ? Number(route.query.event) : null);
const expandedEvents = ref<EventKey[]>([]);
const eventList = ref<HTMLElement>();
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
const plannedOverlays: AMap.Polyline[] = [];
const actualOverlays: AMap.Polyline[] = [];
const fenceOverlays: AMap.Circle[] = [];
type MonitorLayer = 'fence' | 'parking' | 'offline';
const layerOptions = ([
  { id: 'fence', label: '装卸货围栏' }, { id: 'parking', label: '停车点' }, { id: 'offline', label: '离线点' },
] as const).filter(option => option.id === 'fence' || positionedEvents.some(({ event }) => event.type === option.id));
const layers = ref<Record<MonitorLayer, boolean>>({ fence: true, parking: true, offline: true });

let mapInstance: AMap.Map | null = null;
let watermark: ReturnType<typeof mountTransportMapWatermark> | undefined;
let routeOverlay: AMap.Polyline | undefined;
let markerCoordinates: AMapCoordinate[] = [];
let disposed = false;
let mapResizeObserver: ResizeObserver | undefined;
let resizeFrame = 0;
const mapMarkers: { content: HTMLElement; open: () => void; marker: AMap.Marker; layer?: MonitorLayer }[] = [];
const eventMarkerIndexes = new Map<EventKey, number>(monitoredOrder
  ? positionedEvents.map(({ event }, index): [EventKey, number] => ['event:' + event.id, index + 1])
  : guideTrip ? guideTrip.points.map((_, i): [number, number] => [i + 1, i + 1]) : [[1, 0], [2, 0], [3, 1], [4, 2], [5, 3], [6, 5]]);

function fitMap() {
  if (!disposed && mapInstance && (routeOverlay || fenceOverlays.length)) mapInstance.setFitView([...plannedOverlays, ...actualOverlays, ...fenceOverlays], true, watermark?.padding() ?? (monitoredOrder ? [90, 130, 90, 130] : [60, 60, 60, 60]));
}

function syncWatermark() {
  watermark?.destroy();
  watermark = undefined;
  if (!mapInstance || !mapReady.value) return;
  if (watermarkEnabled.value) {
    const order = store.currentDetailOrder;
    watermark = mountTransportMapWatermark(mapInstance, {
      enterprise: evidenceEnterpriseName(), plate: order.plate, order: order.id,
      loading: { poi: mapPoints[0]!.name.replace('装货地 · ', ''), coordinate: markerCoordinates[0], time: monitoredOrder ? dateText(monitoredOrder.enteredAt) : order.startTime },
      unloading: { poi: mapPoints[mapPoints.length - 1]!.name.replace('卸货地 · ', ''), coordinate: markerCoordinates[mapPoints.length - 1], time: monitoredOrder ? dateText(monitoredOrder.completedAt ?? monitoredOrder.arrivedAt) : guideTrip?.points.at(-1)?.kind === 'unload' ? order.updated : '待卸货' },
      distance: routeDistance.value, period: monitoredOrder ? `${dateText(monitoredOrder.enteredAt)} 至 ${monitoredOrder.completedAt ? dateText(monitoredOrder.completedAt) : '今'}` : `${order.startTime} 至今`,
    });
  }
  fitMap();
}

watch(watermarkEnabled, syncWatermark);
function syncLayers() {
  for (const circle of fenceOverlays) layers.value.fence ? circle.show() : circle.hide();
  for (const { marker, layer } of mapMarkers) {
    if (layer) layers.value[layer] ? marker.show() : marker.hide();
  }
}
watch(layers, syncLayers, { deep: true });

type GpsCoordinate = [number, number];

type MapTone = 'current' | 'end' | 'risk' | 'start' | 'stop' | 'warn';

interface MapPoint {
  coord: GpsCoordinate;
  desc: string;
  name: string;
  tone: MapTone;
  layer?: MonitorLayer;
}

const baseWaypoints: GpsCoordinate[] = [
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

const baseFallback: GpsCoordinate[] = [
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

const baseMapPoints: MapPoint[] = [
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

const routeWaypoints: GpsCoordinate[] = monitoredOrder ? [[monitoredOrder.origin.lat, monitoredOrder.origin.lon], [monitoredOrder.destination.lat, monitoredOrder.destination.lon]] : guideTrip ? [[guideTrip.origin.lat, guideTrip.origin.lon], [guideTrip.destination.lat, guideTrip.destination.lon]] : baseWaypoints;
const actualTrack = monitoredOrder?.network?.status === 'unregistered' ? [] : (monitoredOrder?.actualTrack ?? [])
  .filter(point => point.at <= monitoring.now).sort((a, b) => a.at - b.at);
const lastPoint = actualTrack[actualTrack.length - 1];
const mapPoints: MapPoint[] = monitoredOrder ? [
  { name: `装货地 · ${monitoredOrder.origin.name}`, coord: routeWaypoints[0]!, desc: '运单装货地点', tone: 'start' },
  ...positionedEvents.map(({ event, point }): MapPoint => ({
    name: event.address, coord: [point.lat, point.lon], desc: !event.position && event.type === 'fence' ? event.result + '（围栏中心）' : event.result,
    tone: event.type === 'fence' ? 'start' : 'warn',
    layer: event.type === 'parking' || event.type === 'offline' || event.type === 'fence' ? event.type : undefined,
  })),
  ...(lastPoint ? [{ name: '当前位置', coord: [lastPoint.lat, lastPoint.lon] as GpsCoordinate, desc: `定位时间：${dateText(lastPoint.at)}`, tone: 'current' as const }] : []),
  { name: `卸货地 · ${monitoredOrder.destination.name}`, coord: routeWaypoints[routeWaypoints.length - 1]!, desc: '运单卸货地点', tone: 'end' },
] : guideTrip ? [
  { name: '装货地 · ' + guideTrip.origin.name, coord: routeWaypoints[0]!, desc: guideTrip.id, tone: 'start' },
  ...guideTrip.points.map((p): MapPoint => ({ name: p.site.name, coord: [p.site.lat, p.site.lon], desc: guideDate + ' ' + p.from + ' ' + p.text, tone: ['jump','stop','offline'].includes(p.kind) ? 'warn' : 'current' })),
  { name: '卸货地 · ' + guideTrip.destination.name, coord: routeWaypoints[1]!, desc: '计划收货地点', tone: 'end' },
] : baseMapPoints;

function eventTone(event: Pick<TimelineEvent, 'agentVerdict' | 'agentTone'>) {
  return `tone-${detailRiskTone(event.agentVerdict, event.agentTone)}`;
}

function eventIcon(event: TimelineEvent) {
  if (event.type === 'stop') return strokeIconPaths.pause;
  if (event.type === 'risk') return strokeIconPaths.route;
  if (event.id === 2) return strokeIconPaths.truck;
  if (event.id === 6) return strokeIconPaths.locate;
  return strokeIconPaths.waypoints;
}

const timeline = computed(() => monitoredOrder
  ? monitorTimeline(monitoredOrder, monitoring.events, monitoring.anomalies)
      .filter(row => !store.detailOnlyAbnormal || row.abnormal)
      .map(row => ({ ...row, icon: strokeIconPaths[row.iconKey], description: '' }))
  : store.timelineEvents.map(event => ({
      ...event, abnormal: event.type !== 'normal', icon: eventIcon(event), place: event.place || event.stopPlace,
      duration: event.type === 'stop' ? detailEventDuration(event) : '', conclusion: detailEventConclusion(event),
      supplement: detailEventSupplement(event), analysis: !!event.agent, description: event.agent ? event.desc : '',
    })));

function toggleEventDetails(event: { id: EventKey }) {
  expandedEvents.value = expandedEvents.value.includes(event.id)
    ? expandedEvents.value.filter(id => id !== event.id)
    : [...expandedEvents.value, event.id];
}

function highlightMarker(index: number) {
  mapMarkers.forEach((entry, markerIndex) => entry.content.classList.toggle('is-selected', markerIndex === index));
}

function selectEvent(event: { id: EventKey }) {
  selectedEventId.value = event.id;
  const index = eventMarkerIndexes.get(event.id);
  if (index === undefined) {
    if (monitoredOrder) { highlightMarker(-1); mapInstance?.clearInfoWindow(); }
    return;
  }
  highlightMarker(index);
  const layer = mapMarkers[index]?.layer;
  if (layer) layers.value[layer] = true;
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

function drawRoute(amap: typeof AMap, path: AMapCoordinate[], actual = false) {
  if (!mapInstance || path.length < 2) return;
  const line = new amap.Polyline({
    path, strokeColor: actual ? '#059669' : '#2563eb',
    strokeWeight: actual ? 5 : 4, strokeOpacity: 0.9,
    strokeStyle: actual ? 'solid' : 'dashed', strokeDasharray: [10, 7],
    zIndex: actual ? 60 : 50,
  });
  mapInstance.add(line);
  (actual ? actualOverlays : plannedOverlays).push(line);
  routeOverlay ??= line;
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
    mapMarkers.push({ content, open, marker, layer: point.layer });
    marker.on('click', () => {
      const eventId = [...eventMarkerIndexes].find(([, marker]) => marker === index)?.[0];
      selectedEventId.value = eventId ?? null;
      if (monitoredOrder && eventId !== undefined) {
        if (!timeline.value.some(row => row.id === eventId)) store.detailOnlyAbnormal = false;
        void nextTick(() => eventList.value?.querySelector(`[data-event-id="${CSS.escape(String(eventId))}"]`)?.scrollIntoView({ block: 'nearest' }));
      }
      highlightMarker(index);
      open();
    });
    mapInstance!.add(marker);
  });
  if (selectedEventId.value !== null) {
    const index = eventMarkerIndexes.get(selectedEventId.value);
    if (index !== undefined) { highlightMarker(index); mapMarkers[index]?.open(); }
  }
}

async function initMap() {
  await nextTick();
  if (!mapRef.value || mapInstance) return;

  try {
    const amap = await loadAMap(['AMap.Driving', 'AMap.ToolBar']);
    const convert = (coordinates: AMapCoordinate[]) => guideTrip || monitoredOrder?.origin.coordinateSystem === 'gcj02' ? Promise.resolve(coordinates) : convertGpsCoordinates(amap, coordinates);
    const convertedWaypoints = await convert([routeWaypoints[0]!, routeWaypoints[routeWaypoints.length - 1]!].map(([lat, lng]) => [lng, lat]));
    const actualCoordinates: AMapCoordinate[] = monitoredOrder
      ? actualTrack.map(point => [point.lon, point.lat])
      : guideTrip ? [] : baseFallback.slice(0, -1).map(([lat, lng]) => [lng, lat]);
    const convertedActual = actualCoordinates.length > 1 ? await convert(actualCoordinates) : [];
    const convertedMarkers = await convert(mapPoints.map(({ coord: [lat, lng] }) => [lng, lat]));
    if (disposed || !mapRef.value) return;
    markerCoordinates = convertedMarkers;

    mapInstance = new amap.Map(mapRef.value, {
      center: monitoredOrder || guideTrip ? convertedWaypoints[0] : [117.15, 27.35],
      mapStyle: 'amap://styles/macaron',
      viewMode: '2D',
      zoom: 6,
      WebGLParams: { preserveDrawingBuffer: true },
    });
    mapInstance.addControl(new amap.ToolBar({ position: 'RB' }));
    if (monitoredOrder) {
      for (const [index, place] of [monitoredOrder.origin, monitoredOrder.destination].entries()) {
        const circle = new amap.Circle({ center: convertedWaypoints[index], radius: place.radiusMeters,
          strokeColor: index === 0 ? '#2563eb' : '#059669', strokeOpacity: 0.85, strokeWeight: 2,
          fillColor: index === 0 ? '#2563eb' : '#059669', fillOpacity: 0.08, zIndex: 20 });
        mapInstance.add(circle);
        fenceOverlays.push(circle);
      }
    }

    try {
      const roadRoute = await searchDrivingRoute(amap, convertedWaypoints);
      if (disposed) return;
      routeDistance.value = `${Math.round(roadRoute.distance / 1000).toLocaleString()} km`;
      routeDuration.value = formatDuration(roadRoute.duration);
      drawRoute(amap, roadRoute.path);
      mapReady.value = true;
    } catch {
      if (disposed) return;
      routeDistance.value = monitoredOrder || guideTrip ? '--' : '约 1,650 km';
      routeDuration.value = monitoredOrder || guideTrip ? '--' : '约 22h';
      mapError.value = '道路路线暂不可用，请刷新页面重试';

    }
    if (convertedActual.length > 1) {
      drawRoute(amap, convertedActual, true);
      mapReady.value = true;
    }
    drawMarkers(amap, convertedMarkers);
    if (monitoredOrder) syncLayers();
    if (fenceOverlays.length) fitMap();
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
        <div v-if="monitoredOrder" class="detail-map-badges monitor-badges" aria-label="异常事件统计"><span v-if="monitoredOrder.network?.status === 'unregistered'" :class="badgeToneClass('orange')">车辆未入网</span><span v-for="[kind, group] in alarmCounts" :key="kind" :title="`运输期间累计：${kind} ${group.count} 条`" :class="badgeToneClass(group.high ? 'red' : 'orange')">{{ kind }} {{ group.count }}</span></div>
        <div v-else class="detail-map-badges"><span :class="badgeToneClass('red')">异常停车 2</span><span :class="badgeToneClass('purple')">轨迹风险 1</span></div>
      </header>
      <div class="detail-map-stage">
        <div ref="mapRef" class="detail-map-canvas" style="color:#253440;background-color:#eef3f6;font-family:sans-serif"></div>
        <div class="detail-map-tools" aria-label="地图操作">
          <details v-if="monitoredOrder" class="monitor-layers"><summary>图层</summary><div>
            <label v-for="option in layerOptions" :key="option.id"><input v-model="layers[option.id]" type="checkbox" />{{ option.label }}</label>
          </div></details>
          <div class="detail-watermark-toggle"><span>水印</span><ElSwitch v-model="watermarkEnabled" :disabled="!!monitoredOrder && !mapReady" size="small" aria-label="显示地图水印" /></div>
        </div>
        <div v-if="!watermarkEnabled || !mapReady" class="detail-route-summary">
          <strong>{{ monitoredOrder ? `${monitoredOrder.origin.name} → ${monitoredOrder.destination.name}` : '上海一厂 → 广州仓' }}</strong><div><span>{{ routeDistance }}</span><span>{{ routeDuration }}</span></div>
          <div v-if="monitoredOrder && actualTrack.length < 2 && positionedEvents.length">仅有事件定位，暂无有效行车轨迹</div>
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
          <span v-if="order.riskTags?.includes('车辆未入网')" class="detail-badge tone-orange">车辆未入网</span><span v-if="order.billingExempt" class="detail-badge tone-green">免计费</span><span v-if="order.risk!=='无风险'||!order.riskTags?.length" class="detail-badge" :class="`tone-${detailRiskTone(order.risk)}`" aria-label="风险等级">{{ order.risk || '—' }}</span>
        </div>
        <dl class="detail-facts">
          <div v-for="field in summaryFields" :key="field.label" :class="{ 'is-wide': field.wide }">
            <dt>{{ field.label }}</dt><dd>{{ field.value || '—' }}</dd>
          </div>
        </dl>
        <details v-if="order.sourceFields?.length" class="mt-3 text-xs text-slate-600">
          <summary class="cursor-pointer text-blue-700">原始运单字段</summary>
          <dl class="detail-facts mt-2"><div v-for="field in order.sourceFields" :key="field.label" class="is-wide"><dt>{{ field.label }}</dt><dd>{{ field.value || '—' }}</dd></div></dl>
        </details>
        <div class="detail-order-eta"><Icon :svg="strokeIconPaths.alarmClock" :size="15" /><span>预计到达</span><strong>{{ order.eta || '—' }}</strong></div>
      </section>
      <section class="detail-events" aria-label="运输事件流">
        <header class="detail-events-header">
          <h2>运输事件<span>{{ timeline.length }}</span></h2>
          <button type="button" class="detail-filter" :class="{ 'is-active': store.detailOnlyAbnormal }" :aria-pressed="store.detailOnlyAbnormal" title="只看异常事件" @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal"><Icon :svg="strokeIconPaths.filter" :size="13" />只看异常</button>
        </header>
        <div ref="eventList" class="detail-event-list">
          <details v-if="monitoredOrder" class="monitor-facts"><summary>监听信息</summary><MonitoringOrderPanel :order-id="monitoredOrder.id" /></details>
          <article v-for="event in timeline" :key="event.id" class="detail-event" :class="[eventTone(event), { 'is-abnormal': event.abnormal, 'is-selected': selectedEventId === event.id }]" :data-event-id="event.id">
            <div class="detail-event-track" aria-hidden="true"><span><Icon :svg="event.icon" :size="13" /></span></div>
            <div class="detail-event-content">
              <button type="button" class="detail-event-select" :aria-pressed="selectedEventId === event.id" :aria-label="[event.title, event.time, eventMarkerIndexes.has(event.id) ? '定位地图' : ''].filter(Boolean).join('，')" @click="selectEvent(event)">
                <span class="detail-event-heading"><span class="detail-event-title">{{ event.title }}</span><span v-if="event.agentVerdict" class="detail-badge detail-event-verdict">{{ event.agentVerdict }}</span><Icon v-if="!monitoredOrder || eventMarkerIndexes.has(event.id)" class="detail-event-locate" :svg="strokeIconPaths.locate" :size="13" /></span>
                <span class="detail-event-timing"><time>{{ event.time || '—' }}</time><span v-if="event.duration" class="detail-event-duration">{{ event.duration }}</span></span>
                <span v-if="event.place || !monitoredOrder" class="detail-event-place"><Icon :svg="strokeIconPaths.locate" :size="12" /><span>{{ event.place || '—' }}</span></span>
                <span class="detail-event-conclusion">{{ event.conclusion }}</span>
              </button>
              <template v-if="event.supplement">
                <button type="button" class="detail-event-expand" :aria-expanded="expandedEvents.includes(event.id)" :aria-controls="`event-details-${event.id}`" @click="toggleEventDetails(event)">
                  <span v-if="event.analysis" class="detail-ai-label"><Icon :svg="strokeIconPaths.zap" :size="11" />AI 分析</span>
                  {{ expandedEvents.includes(event.id) ? '收起说明' : '查看说明' }}<Icon :svg="strokeIconPaths.chevron" :size="12" :class="{ 'is-expanded': expandedEvents.includes(event.id) }" />
                </button>
                <div v-if="expandedEvents.includes(event.id)" :id="`event-details-${event.id}`" class="detail-event-supplement">
                  <p v-if="event.description">{{ event.description }}</p><p>{{ event.supplement }}</p>
                </div>
              </template>
            </div>
          </article>
          <p v-if="!timeline.length" class="detail-events-empty">暂无{{ store.detailOnlyAbnormal ? '异常' : '' }}事件</p>
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
.monitor-badges { flex-wrap: wrap; justify-content: flex-end; }
.monitor-facts { margin-bottom: 8px; border-bottom: 1px solid #e5eaf2; }
.monitor-facts summary { padding-block: 8px; cursor: pointer; color: #345891; font-size: 12px; }
.detail-map-badges > span { padding: 2px 6px; border: 1px solid; border-radius: 4px; font-size: 11px; line-height: 17px; white-space: nowrap; }
.detail-map-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.detail-map-canvas { width: 100%; height: 100%; min-height: 100%; }
.detail-map-tools { position: absolute; top: 12px; right: 12px; z-index: 1000; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border: 1px solid #dfe3e6; border-radius: 6px; background: #fff; box-shadow: 0 2px 6px rgb(25 39 51 / 8%); }
.detail-watermark-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #3d4c5c; }
.monitor-layers { position: relative; font-size: 12px; color: #3d4c5c; }
.monitor-layers summary, .monitor-layers label { cursor: pointer; }
.monitor-layers > div { position: absolute; top: calc(100% + 9px); right: 0; min-width: 112px; padding: 6px 10px; border: 1px solid #dfe3e6; border-radius: 6px; background: #fff; }
.monitor-layers label { display: flex; align-items: center; gap: 6px; padding-block: 4px; }
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
