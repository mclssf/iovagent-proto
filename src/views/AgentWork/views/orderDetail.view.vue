<script lang="ts" setup>
import type { TimelineEvent } from '../interface';

import { Icon } from '@packages/icon';
import { ElSwitch } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePhase1 } from '@/pinia/phase1';
import MonitoringOrderPanel from '@/views/Phase1/MonitoringOrderPanel.vue';
import { dateText } from '@/views/Phase1/catalog';

import { agentWorkData } from '@/pinia/agentWork';
import { convertGpsCoordinates, loadAMap, searchDrivingRoute, type AMapCoordinate } from '@/utils/amap';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass } from '../utils';
import { detailEventConclusion, detailEventSupplement, detailRiskTone } from '../orderDetailPresentation';
import { evidenceEnterpriseName } from '../waybillEvidence';
import { mountTransportMapWatermark } from '../transportMapWatermark';
import { currentDispatches, stopForWaybill } from '@/views/Dispatch/dispatchScenarios';
import { dispatchInfoContent, dispatchMarkerContent, dispatchTruckContent } from '@/views/Dispatch/dispatchMapVisual';
import { waybillPlanWindow, waybillStops, waybillVehicles } from '../waybillDisplay';

const store = agentWorkData();
const route = useRoute();
const monitoring = usePhase1();
const dispatchContext = computed(() => currentDispatches().find(item => item.id === String(route.query.dispatchId || '')));
const dispatchWaybill = computed(() => dispatchContext.value?.waybills.find(item => item.id === String(route.query.waybillId || route.query.orderId || '')));
function orderFromDispatch() {
  const dispatch = dispatchContext.value;
  const waybill = dispatchWaybill.value;
  if (!dispatch || !waybill) return null;
  const pickup = stopForWaybill(dispatch, waybill.pickupId);
  const delivery = stopForWaybill(dispatch, waybill.deliveryId);
  const sourceOrder = monitoring.orders.find(item => item.id === waybill.id && item.dispatchId === dispatch.id);
  const selectedStops = dispatch.stops.filter(stop => stop.id === waybill.pickupId || stop.id === waybill.deliveryId);
  const dispatchStops = sourceOrder?.stops ?? selectedStops.map((stop, index) => ({
    id: stop.id,
    sequence: index + 1,
    role: stop.role === '提货' ? 'loading' as const : 'unloading' as const,
    place: { name: stop.name, lat: stop.coordinate[1], lon: stop.coordinate[0], radiusMeters: 5000, regionCode: '' },
    plannedAt: (() => { const event = dispatch.events.find(item => item.kind === 'station' && item.place === stop.name); return event?.plannedAt ? Date.parse(`2026-${event.plannedAt.replace(' ', 'T')}:00+08:00`) : undefined; })(),
  }));
  return {
    id: waybill.id,
    plate: dispatch.plate,
    driver: dispatch.driver,
    carrier: dispatch.carrier,
    route: `${pickup?.name ?? '提货地'} → ${delivery?.name ?? '卸货地'}`,
    factory: pickup?.name ?? dispatch.customer,
    status: waybill.status,
    risk: dispatch.risk,
    issue: dispatch.issue,
    source: dispatch.source,
    startTime: sourceOrder ? dateText(sourceOrder.createdAt) : dispatch.createdAt,
    updated: dispatch.plannedStart,
    eta: dispatch.status === '已完成' ? '已完成' : dispatch.plannedEnd,
    loadType: waybill.loadType ?? '零担',
    dispatchId: dispatch.id,
    stops: dispatchStops,
    vehicleSegments: sourceOrder?.vehicleSegments ?? dispatch.plate.split('、').map((plate, index) => ({ plate, sequence: index + 1, source: '调度单演示' })),
    customFields: waybill.customFields,
    monitoringOwner: 'dispatch' as const,
    dispatch: {
      id: dispatch.id,
      customer: dispatch.customer,
      status: dispatch.status,
      risk: dispatch.risk,
      plannedStart: dispatch.plannedStart,
      plannedEnd: dispatch.plannedEnd,
      plate: dispatch.plate,
      driver: dispatch.driver,
      carrier: dispatch.carrier,
      upstreamOrderId: waybill.upstreamOrderId,
      externalSystemId: waybill.externalSystemId,
      cargo: waybill.cargo,
      pieces: waybill.pieces,
      weightKg: waybill.weightKg,
      volumeM3: waybill.volumeM3,
      customFields: waybill.customFields,
    },
  };
}
watch(() => [route.query.projectId, route.query.orderId, route.query.dispatchId, route.query.waybillId], ([projectId, orderId]) => {
  const linkedOrder = orderFromDispatch();
  if (linkedOrder) {
    store.setSelectedOrder(linkedOrder);
    return;
  }
  const project = store.projects.find(item => item.id === projectId);
  if (project && store.currentProjectId !== project.id) store.switchProject(project);
  const record = store.currentProjectOrders.find(item => item.id === orderId);
  if (record) store.setSelectedOrder(record);
}, { immediate: true });
const monitoredOrder = monitoring.orders.find(item => item.id === store.selectedOrder.id);
const monitoredEvents = monitoring.events.filter(item => item.orderId === monitoredOrder?.id);
const positionedEvents = monitoredEvents.filter(event => event.target || event.position);
const mapRef = ref<HTMLDivElement | null>(null);
const routeDistance = ref('--');
const routeDuration = ref('--');
const plannedArrivalByPlace = ref<Record<string, string>>({});
const watermarkEnabled = ref(false);
const selectedEventId = ref<number | null>(null);
const expandedEvents = ref<number[]>([]);
const resolvedVehicleAddress = ref('');
const order = computed(() => store.currentDetailOrder);
const displayStops = computed(() => waybillStops(order.value));
const plannedWindow = computed(() => waybillPlanWindow(order.value));
const orderedVehicles = computed(() => waybillVehicles(order.value));
const currentVehicle = computed(() => {
  const dispatch = dispatchContext.value;
  if (dispatch) return dispatch.currentVehicles?.find(item => item.current) ?? dispatch.currentVehicles?.[dispatch.currentVehicles.length - 1] ?? (dispatch.currentVehicle ? { ...dispatch.currentVehicle, current: true } : undefined);
  const monitored = monitoredOrder;
  const track = monitored?.actualTrack?.filter(point => point.at <= monitoring.now).sort((a, b) => b.at - a.at)[0];
  if (track) return { plate: track.vehiclePlate ?? monitored!.vehicleSegments?.slice().sort((a,b)=>b.sequence-a.sequence)[0]?.plate ?? monitored!.plate.split('、').slice(-1)[0]!, place: resolvedVehicleAddress.value || track.address || `经纬度 ${track.lon.toFixed(4)}, ${track.lat.toFixed(4)}（地址待解析）`, speedKmh: track.speedKmh, at: dateText(track.at), coordinate: [track.lon, track.lat] as [number, number] };
  if (monitored || order.value.id !== 'WB20260509001') return undefined;
  return { plate: order.value.plate, place: '清远市清新区路段', speedKmh: undefined, at: order.value.updated, coordinate: [113.056, 23.6818] as [number, number] };
});
const detailTimelineEvents = computed<TimelineEvent[]>(() => {
  if (!dispatchContext.value) return store.timelineEvents;
  const typeMap: Record<string, TimelineEvent['eventType']> = { station: 'fence', fence: 'fence', parking: 'parking', transfer: 'transfer', highway: 'highway', gap: 'offline', deviation: 'deviation' };
  return dispatchContext.value.events.map((event, index) => ({
    id: index + 1,
    type: event.risk === '高风险' ? 'risk' : event.risk === '低风险' ? 'stop' : 'normal',
    title: event.title,
    time: event.at,
    place: event.place,
    desc: event.detail,
    agentVerdict: event.risk,
    agentTone: event.risk === '高风险' ? 'red' : event.risk === '低风险' ? 'orange' : 'green',
    eventType: typeMap[event.kind],
    riskLevel: event.risk ?? '无风险',
    vehiclePlate: event.plate ?? (event.vehicle === 'A' ? dispatchContext.value!.plate.split('、')[0] : event.vehicle === 'B' ? dispatchContext.value!.plate.split('、')[1] : undefined),
    stage: event.stage,
    mapCoordinate: event.coordinate,
    routePercent: event.routePercent,
    plannedAt: event.plannedAt,
  }));
});
const eventTypeFilter = ref('全部事件');
const riskFilter = ref('全部风险');
const vehicleFilter = ref('全部车辆');
const showPlannedRoute = ref(true);
const showActualRoute = ref(true);
const showFences = ref(true);
const showStations = ref(true);
const showEvents = ref(true);
const eventTypeLabels: Record<string, string> = { parking: '超时停车', offline: '在途离线', deviation: '线路偏离', weather: '恶劣天气', highway: '上下高速', transfer: '换车', fence: '进出围栏' };
const eventTypeOptions = computed(() => [...new Set(detailTimelineEvents.value.map(event => event.eventType).filter(Boolean))] as string[]);
const vehicleOptions = computed(() => [...new Set([...(monitoredOrder?.vehicleSegments?.map(segment => segment.plate) ?? []), ...(dispatchContext.value?.plate.split('、') ?? []), ...detailTimelineEvents.value.map(event => event.vehiclePlate).filter(Boolean) as string[]])]);
const filteredTimelineEvents = computed(() => detailTimelineEvents.value.filter(event =>
  (!store.detailOnlyAbnormal || event.type !== 'normal') &&
  (eventTypeFilter.value === '全部事件' || event.eventType === eventTypeFilter.value) &&
  (riskFilter.value === '全部风险' || (event.riskLevel ?? '无风险') === riskFilter.value) &&
  (vehicleFilter.value === '全部车辆' || event.vehiclePlate === vehicleFilter.value),
));
const eventGroups = computed(() => {
  const events = filteredTimelineEvents.value;
  const stageFor = (event: TimelineEvent) => {
    if (event.stage) return event.stage;
    if (monitoredOrder) {
      const raw = monitoredEvents.find(item => item.id === event.rawEventId);
      if (raw) return monitoredOrder.arrivedAt && raw.occurredAt >= monitoredOrder.arrivedAt ? 'arrived' : monitoredOrder.departedAt && raw.occurredAt >= monitoredOrder.departedAt ? 'in_transit' : 'loading';
    }
    return event.id >= 6 ? 'arrived' : event.id >= 2 ? 'in_transit' : 'loading';
  };
  return [
    { id: 'created', label: '运单创建', at: order.value.startTime, events: [] as TimelineEvent[] },
    { id: 'loading', label: '装货中', at: events.find(event => stageFor(event) === 'loading')?.time ?? '', events: events.filter(event => stageFor(event) === 'loading') },
    { id: 'in_transit', label: '在途', at: events.find(event => stageFor(event) === 'in_transit')?.time ?? '', events: events.filter(event => stageFor(event) === 'in_transit') },
    { id: 'arrived', label: '卸货中', at: events.find(event => stageFor(event) === 'arrived')?.time ?? '', events: events.filter(event => stageFor(event) === 'arrived') },
    { id: 'completed', label: '已完成', at: order.value.status === '已完成' ? order.value.eta : '', events: [] as TimelineEvent[] },
  ];
});
const dispatchFields = computed(() => {
  const linked = order.value.dispatch;
  if (!linked) return [];
  return [
    { label: '调度单号', value: linked.id },
    { label: '调度状态', value: linked.status },
    { label: '所属客户', value: linked.customer },
    { label: '计划时间', value: `${linked.plannedStart} 至 ${linked.plannedEnd}` },
    { label: '上游订单号', value: linked.upstreamOrderId || '—' },
    { label: '外部系统单号', value: linked.externalSystemId || '—' },
    { label: '货物', value: linked.cargo || '—' },
    { label: '数量 / 重量 / 体积', value: `${linked.pieces ?? '—'} 件 / ${linked.weightKg || '—'} kg / ${linked.volumeM3 || '—'} m³` },
    ...(linked.customFields ?? []),
  ];
  });
const summaryFields = computed<{ label: string; value: string; wide?: boolean }[]>(() => [
  { label: '车辆', value: orderedVehicles.value.length ? orderedVehicles.value.map((plate, index) => `${index + 1}. ${plate}`).join(' → ') : '—', wide: true },
  { label: '司机', value: order.value.driver },
  { label: '承运商', value: order.value.carrier, wide: true },
  { label: '计划开始', value: plannedWindow.value.start !== undefined ? dateText(plannedWindow.value.start) : '待补充', wide: true },
  { label: '计划结束', value: plannedWindow.value.end !== undefined ? dateText(plannedWindow.value.end) : '待补充', wide: true },
  { label: '创建时间', value: order.value.startTime, wide: true },
  { label: '配载类型', value: order.value.loadType ?? '—' },
  { label: '调度单号', value: order.value.dispatchId ?? (order.value.loadType === '零担' ? '待关联' : '—') },
  ...(order.value.customFields ?? []),
]);
const mapReady = ref(false);
const mapLoading = ref(true);
const mapError = ref('');
const plannedOverlays: AMap.Polyline[] = [];
const actualOverlays: AMap.Polyline[] = [];
const vehicleRouteOverlays: { line: AMap.Polyline; plate: string }[] = [];
const fenceOverlays: AMap.Circle[] = [];
const stationOverlays: AMap.Marker[] = [];
const eventOverlays: AMap.Marker[] = [];
const typedEventOverlays: { marker: AMap.Marker; type: string; plate?: string }[] = [];

let mapInstance: AMap.Map | null = null;
let watermark: ReturnType<typeof mountTransportMapWatermark> | undefined;
let routeOverlay: AMap.Polyline | undefined;
let currentVehicleMarker: AMap.Marker | undefined;
let currentVehicleHeading = 0;
let markerCoordinates: AMapCoordinate[] = [];
let disposed = false;
let mapResizeObserver: ResizeObserver | undefined;
let resizeFrame = 0;
const mapMarkers: { content: HTMLElement; open: () => void; position: AMapCoordinate; eventIds: number[] }[] = [];

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
      unloading: { poi: mapPoints[mapPoints.length - 1]!.name.replace('卸货地 · ', ''), coordinate: markerCoordinates[mapPoints.length - 1], time: monitoredOrder ? dateText(monitoredOrder.completedAt ?? monitoredOrder.arrivedAt) : '待卸货' },
      distance: routeDistance.value, period: monitoredOrder ? `${dateText(monitoredOrder.enteredAt)} 至 ${monitoredOrder.completedAt ? dateText(monitoredOrder.completedAt) : '今'}` : `${order.startTime} 至今`,
    });
  }
  fitMap();
}

function applyMapLayers() {
  plannedOverlays.forEach(line => showPlannedRoute.value ? line.show() : line.hide());
  actualOverlays.forEach(line => {
    const vehicle = vehicleRouteOverlays.find(item => item.line === line);
    showActualRoute.value && (!vehicle || vehicleFilter.value === '全部车辆' || vehicle.plate === vehicleFilter.value) ? line.show() : line.hide();
  });
  fenceOverlays.forEach(circle => showFences.value ? circle.show() : circle.hide());
  stationOverlays.forEach(marker => showStations.value ? marker.show() : marker.hide());
  eventOverlays.forEach(marker => {
    const event = typedEventOverlays.find(item => item.marker === marker);
    const matches = !event || (eventTypeFilter.value === '全部事件' || event.type === eventTypeFilter.value) && (vehicleFilter.value === '全部车辆' || !event.plate || event.plate === vehicleFilter.value);
    showEvents.value && matches ? marker.show() : marker.hide();
  });
}

watch(watermarkEnabled, syncWatermark);
watch([showPlannedRoute, showActualRoute, showFences, showStations, showEvents, vehicleFilter, eventTypeFilter], applyMapLayers);

type GpsCoordinate = [number, number];

type MapTone = 'current' | 'end' | 'risk' | 'start' | 'stop' | 'warn';

interface MapPoint {
  coord: GpsCoordinate;
  desc: string;
  name: string;
  tone: MapTone;
  eventIds?: number[];
  eventType?: string;
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

const dispatchStopPoints: MapPoint[] = dispatchContext.value ? dispatchContext.value.stops.map((stop, index) => ({ name: `${stop.role === '提货' ? '装货' : '卸货'}地 · ${stop.name}`, coord: [stop.coordinate[1], stop.coordinate[0]], desc: `${stop.role}点围栏半径 5,000 米`, tone: stop.role === '提货' ? 'start' : 'end', })) : [];
const routeWaypoints: GpsCoordinate[] = monitoredOrder
  ? (monitoredOrder.stops?.length ? monitoredOrder.stops.map(stop => [stop.place.lat, stop.place.lon] as GpsCoordinate) : [[monitoredOrder.origin.lat, monitoredOrder.origin.lon], [monitoredOrder.destination.lat, monitoredOrder.destination.lon]])
  : dispatchStopPoints.length ? dispatchStopPoints.map(point => point.coord) : baseWaypoints;
const mapPoints: MapPoint[] = monitoredOrder ? [
  ...(monitoredOrder.stops?.length ? monitoredOrder.stops.map((stop): MapPoint => ({ name: `${stop.role === 'loading' ? '装货' : '卸货'}地 · ${stop.place.name}`, coord: [stop.place.lat, stop.place.lon], desc: `围栏半径 ${stop.place.radiusMeters.toLocaleString()} 米`, tone: stop.role === 'loading' ? 'start' : 'end' })) : [{ name: `装货地 · ${monitoredOrder.origin.name}`, coord: routeWaypoints[0]!, desc: `围栏半径 ${monitoredOrder.origin.radiusMeters.toLocaleString()} 米`, tone: 'start' as const }]),
  ...positionedEvents.map((event): MapPoint => { const place = event.target === 'destination' ? monitoredOrder.destination : event.target === 'origin' ? monitoredOrder.origin : event.position!; return { name: event.address, coord: [place.lat, 'lon' in place ? place.lon : 0], desc: event.result, tone: event.type === 'fence' ? 'start' : 'warn', eventType: event.type, eventIds: detailTimelineEvents.value.filter(item => item.rawEventId === event.id).map(item => item.id) }; }),
  ...(monitoredOrder.stops?.length ? [] : [{ name: `卸货地 · ${monitoredOrder.destination.name}`, coord: routeWaypoints[routeWaypoints.length - 1]!, desc: `围栏半径 ${monitoredOrder.destination.radiusMeters.toLocaleString()} 米`, tone: 'end' as const }]),
] : dispatchStopPoints.length ? dispatchStopPoints : baseMapPoints;

function eventTone(event: TimelineEvent) {
  return `tone-${detailRiskTone(event.agentVerdict, event.agentTone)}`;
}

function toggleEventDetails(event: TimelineEvent) {
  expandedEvents.value = expandedEvents.value.includes(event.id)
    ? expandedEvents.value.filter(id => id !== event.id)
    : [...expandedEvents.value, event.id];
}

function highlightMarker(eventId: number) {
  mapMarkers.forEach(entry => entry.content.classList.toggle('is-selected', entry.eventIds.includes(eventId)));
}

function selectEvent(event: TimelineEvent) {
  selectedEventId.value = event.id;
  const marker = mapMarkers.find(entry => entry.eventIds.includes(event.id));
  if (!marker) return;
  highlightMarker(event.id);
  if (mapInstance) mapInstance.setZoomAndCenter(11, marker.position);
  marker.open();
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function markerVisual(point: MapPoint) {
  if (point.eventType) {
    const visuals: Record<string, [string, string]> = { fence: ['栏', '#0b8b78'], transfer: ['换', '#d97706'], highway: ['高', '#42526b'], parking: ['停', '#b45309'], offline: ['缺', '#b45309'], deviation: ['偏', '#c43434'], weather: ['天', '#42526b'] };
    return visuals[point.eventType] ?? ['事', '#d97706'];
  }
  if (point.tone === 'start') return ['提', '#1765a3'] as const;
  if (point.tone === 'end') return ['卸', '#0b8b78'] as const;
  if (point.tone === 'risk') return ['险', '#c43434'] as const;
  if (point.tone === 'stop') return ['停', '#b45309'] as const;
  return ['事', '#d97706'] as const;
}

function popupContent(point: MapPoint) {
  const [lat, lng] = point.coord;
  const name = point.name.replace(/^(装货地|卸货地) · /, '');
  return dispatchInfoContent(point.name, [['位置', name], ['说明', point.desc], ...(point.tone === 'end' && plannedArrivalByPlace.value[name] ? [['规划送达', plannedArrivalByPlace.value[name]!] as [string, string]] : []), ['坐标', `${lat.toFixed(4)}, ${lng.toFixed(4)}`]]);
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

function drawMonitoredActualRoutes(amap: typeof AMap, track: NonNullable<typeof monitoredOrder>['actualTrack'], coordinates: AMapCoordinate[]) {
  if (!mapInstance || !monitoredOrder || !track?.length) return;
  const plates = monitoredOrder.vehicleSegments?.slice().sort((a, b) => a.sequence - b.sequence).map(item => item.plate) ?? monitoredOrder.plate.split('、').filter(Boolean);
  const transfers = monitoredEvents.filter(event => event.type === 'transfer').sort((a, b) => a.occurredAt - b.occurredAt);
  const firstFenceAt = monitoredEvents.filter(event => event.type === 'fence').sort((a, b) => a.occurredAt - b.occurredAt)[0]?.occurredAt;
  plates.forEach((plate, index) => {
    const transferIn = transfers.find(event => event.toPlate === plate);
    const transferOut = transfers.find(event => event.fromPlate === plate);
    const start = transferIn?.occurredAt ?? firstFenceAt ?? monitoredOrder.monitorStartAt ?? monitoredOrder.createdAt;
    const end = transferOut?.occurredAt ?? monitoredOrder.completedAt ?? monitoredOrder.expiresAt;
    const path = track.flatMap((point, pointIndex) => point.at >= start && point.at <= end && (point.vehiclePlate ?? plates[0]) === plate ? [coordinates[pointIndex]!] : []);
    if (path.length < 2) return;
    const line = new amap.Polyline({ path, strokeColor: ['#1765a3', '#0b8b78', '#9a5baf', '#b7791f'][index % 4], strokeWeight: 5, strokeOpacity: 0.95, zIndex: 60 });
    mapInstance!.add(line);
    actualOverlays.push(line);
    vehicleRouteOverlays.push({ line, plate });
  });
}

function drawMarkers(amap: typeof AMap, coordinates: AMapCoordinate[]) {
  if (!mapInstance) return;
  const pinCounts = new Map<string, number>();

  mapPoints.forEach((point, index) => {
    if (point.tone === 'current') return;
    const [label, color] = markerVisual(point);
    const pinKey = `${coordinates[index]![0].toFixed(3)},${coordinates[index]![1].toFixed(3)}`;
    const pinIndex = pinCounts.get(pinKey) ?? 0;
    pinCounts.set(pinKey, pinIndex + 1);
    const content = dispatchMarkerContent(label, color, [-30, 0, 30, -55, 55][pinIndex % 5], -33 - Math.floor(pinIndex / 5) * 25);
    const marker = new amap.Marker({
      anchor: 'center',
      content,
      position: coordinates[index],
      title: `${point.name}${point.tone === 'end' && plannedArrivalByPlace.value[point.name.replace(/^卸货地 · /, '')] ? ` · 规划送达 ${plannedArrivalByPlace.value[point.name.replace(/^卸货地 · /, '')]}` : ''}`,
      zIndex: 100,
    });
    const eventIds = point.eventIds ?? (dispatchContext.value ? detailTimelineEvents.value.filter(event => event.eventType === 'fence' && point.name.includes(event.place)).map(event => event.id) : monitoredOrder ? [] : ({ 0: [1, 2], 1: [3], 2: [4], 3: [5], 5: [6] } as Record<number, number[]>)[index] ?? []);
    const open = () => {
      if (!mapInstance) return;
      new amap.InfoWindow({
        anchor: 'bottom-center',
        content: popupContent(point),
        offset: new amap.Pixel(0, -30),
      }).open(mapInstance!, coordinates[index]!);
    };
    mapMarkers.push({ content, open, position: coordinates[index]!, eventIds });
    marker.on('click', () => {
      selectedEventId.value = eventIds[0] ?? null;
      if (selectedEventId.value !== null) highlightMarker(selectedEventId.value);
      open();
    });
    mapInstance!.add(marker);
    (point.eventIds?.length ? eventOverlays : point.tone === 'start' || point.tone === 'end' ? stationOverlays : eventOverlays).push(marker);
    if (point.eventIds?.length || point.tone !== 'start' && point.tone !== 'end') {
      const event = detailTimelineEvents.value.find(item => eventIds.includes(item.id));
      typedEventOverlays.push({ marker, type: event?.eventType ?? '', plate: event?.vehiclePlate });
    }
  });
  if (selectedEventId.value !== null) {
    const entry = mapMarkers.find(marker => marker.eventIds.includes(selectedEventId.value!));
    if (entry) { highlightMarker(selectedEventId.value); entry.open(); }
  }
}

function headingDegrees(from: AMapCoordinate, to: AMapCoordinate) {
  return Math.atan2(-(to[1] - from[1]), (to[0] - from[0]) * Math.cos(to[1] * Math.PI / 180)) * 180 / Math.PI;
}

function drawCurrentVehicle(amap: typeof AMap, position: AMapCoordinate | undefined, routePath: AMapCoordinate[]) {
  const vehicle = currentVehicle.value;
  if (!mapInstance || !vehicle || !position) return;
  const nearest = routePath.length ? routePath.reduce((best, point, index) => Math.hypot(point[0] - position[0], point[1] - position[1]) < Math.hypot(routePath[best]![0] - position[0], routePath[best]![1] - position[1]) ? index : best, 0) : 0;
  const from = routePath[Math.max(0, nearest - 2)] ?? position;
  const to = routePath[Math.min(routePath.length - 1, nearest + 2)] ?? position;
  currentVehicleHeading = headingDegrees(from, to);
  const marker = new amap.Marker({ position, anchor: 'center', content: dispatchTruckContent('#1765a3', currentVehicleHeading, vehicle.plate, vehicle.place), title: `${vehicle.plate} · ${vehicle.place} · ${vehicle.at}`, zIndex: 160 });
  marker.on('click', () => {
    if (!mapInstance) return;
    const latest = currentVehicle.value ?? vehicle;
    new amap.InfoWindow({ content: dispatchInfoContent('当前运输车辆最新位置', [['车牌号', latest.plate], ['位置地址', latest.place], ['定位时间', latest.at], ...('speedKmh' in latest && latest.speedKmh !== undefined ? [['时速', `${latest.speedKmh} km/h`] as [string, string]] : [])]), offset: new amap.Pixel(0, -30) }).open(mapInstance, position);
  });
  mapInstance.add(marker);
  currentVehicleMarker = marker;
}

function resolveCurrentVehicleAddress(amap: typeof AMap, position: AMapCoordinate | undefined) {
  if (!monitoredOrder || !position) return;
  type ReverseGeocoder = { getAddress: (coordinate: AMapCoordinate, callback: (status: string, result: { regeocode?: { formattedAddress?: string } }) => void) => void };
  const geocodingMap = amap as typeof AMap & { Geocoder: new (options: { city: string }) => ReverseGeocoder };
  new geocodingMap.Geocoder({ city: '全国' }).getAddress(position, (status, result) => {
    const address = status === 'complete' ? result.regeocode?.formattedAddress?.trim() : '';
    if (!address || disposed) return;
    resolvedVehicleAddress.value = address;
    const vehicle = currentVehicle.value;
    if (vehicle && currentVehicleMarker) {
      currentVehicleMarker.setContent(dispatchTruckContent('#1765a3', currentVehicleHeading, vehicle.plate, address));
      currentVehicleMarker.setTitle(`${vehicle.plate} · ${address} · ${vehicle.at}`);
    }
  });
}

function drawDispatchEventMarkers(amap: typeof AMap, plannedPath: AMapCoordinate[], convertedEventCoordinates: Map<number, AMapCoordinate>) {
  if (!mapInstance || !dispatchContext.value || !plannedPath.length) return;
  const labels: Record<string, [string, string]> = { parking: ['停', '#b45309'], transfer: ['换', '#d97706'], highway: ['高', '#42526b'], offline: ['缺', '#b45309'], deviation: ['偏', '#c43434'], fence: ['栏', '#0b8b78'] };
  const pinCounts = new Map<string, number>();
  for (const event of detailTimelineEvents.value.filter(item => item.eventType !== 'fence')) {
    const routeIndex = Math.min(plannedPath.length - 1, Math.max(0, Math.round((event.routePercent ?? 50) / 100 * (plannedPath.length - 1))));
    const position = convertedEventCoordinates.get(event.id) ?? plannedPath[routeIndex]!;
    const [label, color] = labels[event.eventType ?? 'fence'] ?? ['事', '#d97706'];
    const pinKey = `${position[0].toFixed(3)},${position[1].toFixed(3)}`;
    const pinIndex = pinCounts.get(pinKey) ?? 0;
    pinCounts.set(pinKey, pinIndex + 1);
    const content = dispatchMarkerContent(label, color, [-30, 0, 30, -55, 55][pinIndex % 5], -33 - Math.floor(pinIndex / 5) * 25);
    const marker = new amap.Marker({ position, anchor: 'center', content, title: event.title, zIndex: 120 });
    const open = () => new amap.InfoWindow({ content: dispatchInfoContent(event.title, [['时间', event.time], ['位置', event.place], ['说明', event.desc]]), offset: new amap.Pixel(0, -30) }).open(mapInstance!, position);
    marker.on('click', () => { selectedEventId.value = event.id; highlightMarker(event.id); open(); });
    mapInstance.add(marker);
    eventOverlays.push(marker);
    typedEventOverlays.push({ marker, type: event.eventType ?? '', plate: event.vehiclePlate });
    mapMarkers.push({ content, open, position, eventIds: [event.id] });
  }
}

function drawDispatchActualRoute(amap: typeof AMap, path: AMapCoordinate[], vehiclePosition?: AMapCoordinate) {
  const dispatch = dispatchContext.value;
  if (!mapInstance || !dispatch || dispatch.status === '待发车' || path.length < 2) return;
  const progress = dispatch.status === '已完成' ? path.length - 1 : vehiclePosition ? path.reduce((best, point, index) => Math.hypot(point[0] - vehiclePosition[0], point[1] - vehiclePosition[1]) < Math.hypot(path[best]![0] - vehiclePosition[0], path[best]![1] - vehiclePosition[1]) ? index : best, 0) : path.length - 1;
  const transfer = dispatch.events.find(event => event.kind === 'transfer');
  const transferIndex = transfer ? Math.round((transfer.routePercent ?? 63) / 100 * (path.length - 1)) : path.length;
  const gaps = dispatch.events.filter(event => event.kind === 'gap').map(event => Math.round((event.routePercent ?? 50) / 100 * (path.length - 1)));
  const deviations = dispatch.events.filter(event => event.kind === 'deviation').map(event => Math.round((event.routePercent ?? 70) / 100 * (path.length - 1)));
  for (let index = 1; index <= progress; index++) {
    const gap = gaps.some(center => Math.abs(center - index) <= Math.max(1, Math.round(path.length * 0.02)));
    const deviation = deviations.some(center => Math.abs(center - index) <= Math.max(1, Math.round(path.length * 0.02)));
    const line = new amap.Polyline({ path: [path[index - 1]!, path[index]!], strokeColor: deviation ? '#c43434' : index <= transferIndex ? '#1765a3' : '#0b8b78', strokeWeight: deviation ? 7 : 5, strokeOpacity: 1, strokeStyle: gap ? 'dashed' : 'solid', strokeDasharray: [8, 6], zIndex: deviation ? 65 : 60 });
    mapInstance.add(line);
    actualOverlays.push(line);
    vehicleRouteOverlays.push({ line, plate: index <= transferIndex ? dispatch.plate.split('、')[0]! : dispatch.plate.split('、')[1] ?? dispatch.plate.split('、')[0]! });
  }
}

async function initMap() {
  await nextTick();
  if (!mapRef.value || mapInstance) return;

  try {
    const amap = await loadAMap(['AMap.Driving', 'AMap.ToolBar', 'AMap.Geocoder']);
    const convert = (coordinates: AMapCoordinate[]) => monitoredOrder?.origin.coordinateSystem === 'gcj02' ? Promise.resolve(coordinates) : convertGpsCoordinates(amap, coordinates);
    const convertedWaypoints = await convert(routeWaypoints.map(([lat, lng]) => [lng, lat]));
    const actualTrack = monitoredOrder?.network?.status === 'unregistered' ? [] : (monitoredOrder?.actualTrack ?? []).filter(point => point.at <= monitoring.now).sort((a,b) => a.at-b.at);
    const actualCoordinates: AMapCoordinate[] = monitoredOrder
      ? actualTrack.map(point => [point.lon, point.lat])
      : dispatchContext.value ? [] : baseFallback.slice(0, -1).map(([lat, lng]) => [lng, lat]);
    const convertedActual = actualCoordinates.length > 1 ? await convert(actualCoordinates) : [];
    const convertedMarkers = await convert(mapPoints.map(({ coord: [lat, lng] }) => [lng, lat]));
    const convertedVehicle = currentVehicle.value ? (await convert([currentVehicle.value.coordinate]))[0] : undefined;
    const eventCoordinateSources = detailTimelineEvents.value.filter(event => event.mapCoordinate);
    const convertedEventPoints = await convert(eventCoordinateSources.map(event => event.mapCoordinate!));
    const convertedEventCoordinates = new Map(eventCoordinateSources.map((event, index) => [event.id, convertedEventPoints[index]!]));
    if (disposed || !mapRef.value) return;
    markerCoordinates = convertedMarkers;

    mapInstance = new amap.Map(mapRef.value, {
      center: monitoredOrder ? convertedWaypoints[0] : [117.15, 27.35],
      mapStyle: 'amap://styles/whitesmoke',
      viewMode: '2D',
      zoom: 6,
      WebGLParams: { preserveDrawingBuffer: true },
    });
    mapInstance.addControl(new amap.ToolBar({ position: 'RB' }));
    if (monitoredOrder || dispatchStopPoints.length) {
      const places = monitoredOrder?.stops?.map(stop => stop.place) ?? (monitoredOrder ? [monitoredOrder.origin, monitoredOrder.destination] : dispatchStopPoints.map(point => ({ name: point.name, lat: point.coord[0], lon: point.coord[1], radiusMeters: 5000 })));
      const fenceCoordinates = monitoredOrder?.stops?.length ? await convert(places.map(place => [place.lon, place.lat])) : convertedWaypoints;
      for (const [index, place] of places.entries()) {
        const circle = new amap.Circle({
          center: fenceCoordinates[index]!,
          radius: place.radiusMeters,
          strokeColor: index === 0 ? '#2563eb' : '#059669',
          strokeOpacity: 0.85,
          strokeWeight: 2,
          fillColor: index === 0 ? '#2563eb' : '#059669',
          fillOpacity: 0.08,
          zIndex: 20,
        });
        mapInstance.add(circle);
        fenceOverlays.push(circle);
      }
    }

    let plannedPath: AMapCoordinate[] = [];
    try {
      const roadRoute = await searchDrivingRoute(amap, convertedWaypoints);
      if (disposed) return;
      routeDistance.value = `${Math.round(roadRoute.distance / 1000).toLocaleString()} km`;
      routeDuration.value = formatDuration(roadRoute.duration);
      drawRoute(amap, roadRoute.path);
      plannedPath = roadRoute.path;
      const path = roadRoute.path;
      const distances = path.map((point, index) => index ? Math.hypot((point[0] - path[index - 1]![0]) * Math.cos(point[1] * Math.PI / 180), point[1] - path[index - 1]![1]) : 0);
      const total = distances.reduce((sum, value) => sum + value, 0) || 1;
      let covered = 0;
      const fractions = distances.map(value => (covered += value) / total);
      const nearest = (target: AMapCoordinate) => path.reduce((best, point, index) => Math.hypot(point[0] - target[0], point[1] - target[1]) < Math.hypot(path[best]![0] - target[0], path[best]![1] - target[1]) ? index : best, 0);
      const currentIndex = convertedVehicle ? nearest(convertedVehicle) : 0;
      const latestTime = currentVehicle.value?.at ? Date.parse(currentVehicle.value.at.replace(' ', 'T') + (currentVehicle.value.at.length === 16 ? ':00' : '') + '+08:00') : NaN;
      const etaBase = Number.isFinite(latestTime) ? latestTime : monitoring.now;
      plannedArrivalByPlace.value = Object.fromEntries(mapPoints.filter(point => point.tone === 'end').map(point => {
        const stopIndex = nearest(convertedMarkers[mapPoints.indexOf(point)]!);
        const eta = Math.ceil((etaBase + Math.max(0, fractions[stopIndex]! - fractions[currentIndex]!) * roadRoute.duration * 1000) / 3600000) * 3600000;
        return [point.name.replace(/^卸货地 · /, ''), dateText(eta)];
      }));
      drawDispatchActualRoute(amap, roadRoute.path, convertedVehicle);
      mapReady.value = true;
    } catch {
      if (disposed) return;
      routeDistance.value = monitoredOrder ? '--' : '约 1,650 km';
      routeDuration.value = monitoredOrder ? '--' : '约 22h';
      mapError.value = '道路路线暂不可用，请刷新页面重试';

    }
    if (convertedActual.length > 1) {
      if (monitoredOrder) drawMonitoredActualRoutes(amap, actualTrack, convertedActual);
      else drawRoute(amap, convertedActual, true);
      mapReady.value = true;
    }
    drawMarkers(amap, convertedMarkers);
    drawDispatchEventMarkers(amap, plannedPath, convertedEventCoordinates);
    const currentTrackPath = monitoredOrder && currentVehicle.value ? actualTrack.flatMap((point, index) => point.vehiclePlate === currentVehicle.value?.plate ? [convertedActual[index]!] : []) : [];
    drawCurrentVehicle(amap, convertedVehicle, currentTrackPath.length > 1 ? currentTrackPath : convertedActual.length > 1 && !monitoredOrder ? convertedActual : plannedPath);
    resolveCurrentVehicleAddress(amap, convertedVehicle);
    applyMapLayers();
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
        <div v-if="monitoredOrder" class="detail-map-badges"><span v-if="monitoredOrder.network?.status === 'unregistered'" :class="badgeToneClass('orange')">车辆未入网</span><span v-if="monitoring.anomalies.some(item => item.orderId === monitoredOrder.id && item.status === 'active')" :class="badgeToneClass('red')">高风险 {{ monitoring.anomalies.filter(item => item.orderId === monitoredOrder.id && item.status === 'active').length }}</span></div>
        <div v-else class="detail-map-badges"><span :class="badgeToneClass('red')">异常停车 2</span><span :class="badgeToneClass('purple')">轨迹风险 1</span></div>
      </header>
      <div class="detail-map-stage">
        <div ref="mapRef" class="detail-map-canvas" style="color:#253440;background-color:#eef3f6;font-family:sans-serif"></div>
        <div class="detail-map-tools" aria-label="地图操作">
          <div class="detail-watermark-toggle"><span>水印</span><ElSwitch v-model="watermarkEnabled" size="small" aria-label="显示地图水印" /></div>
        </div>
        <div v-if="!watermarkEnabled || !mapReady" class="detail-route-summary">
          <strong>{{ monitoredOrder ? `${monitoredOrder.origin.name} → ${monitoredOrder.destination.name}` : order.route || '上海一厂 → 广州仓' }}</strong><div><span>{{ routeDistance }}</span><span>{{ routeDuration }}</span></div>
        </div>
        <div v-if="mapLoading || mapError" class="detail-map-status" :role="mapError ? 'alert' : 'status'">{{ mapError || '正在加载地图与运输轨迹…' }}</div>
      </div>
      <div v-if="currentVehicle" class="detail-current-vehicle"><strong>{{ currentVehicle.plate }}</strong><span>{{ currentVehicle.place }}</span><span v-if="currentVehicle.speedKmh !== undefined">{{ currentVehicle.speedKmh }} km/h</span><time>{{ currentVehicle.at }}</time></div>
      <div class="detail-map-legend" aria-label="地图图例">
        <span><i class="legend-line legend-planned"></i>规划路径</span><span><i class="legend-line legend-actual"></i>实际轨迹</span><span><i class="legend-dot legend-start"></i>装卸货点</span><span><i class="legend-dot legend-event"></i>运输事件</span>
        <label><input v-model="showPlannedRoute" type="checkbox" />规划路径</label>
        <label><input v-model="showActualRoute" type="checkbox" />实际轨迹</label>
        <label><input v-model="showFences" type="checkbox" />围栏</label>
        <label><input v-model="showStations" type="checkbox" />装卸货站点</label>
        <label><input v-model="showEvents" type="checkbox" />运输事件</label>
        <label v-if="vehicleOptions.length">车辆<select v-model="vehicleFilter"><option>全部车辆</option><option v-for="vehicle in vehicleOptions" :key="vehicle">{{ vehicle }}</option></select></label>
        <label v-if="eventTypeOptions.length">事件类型<select v-model="eventTypeFilter"><option>全部事件</option><option v-for="kind in eventTypeOptions" :key="kind" :value="kind">{{ eventTypeLabels[kind] ?? kind }}</option></select></label>
      </div>
    </section>

    <aside class="detail-sidebar" aria-label="运单详情与运输事件">
      <header class="detail-panel-header detail-summary-header"><h2><Icon :svg="strokeIconPaths.fileText" :size="16" />运单详情</h2></header>
      <section class="detail-order-summary" :class="{ 'has-stops': order.stops?.length }" aria-label="运单摘要">
        <h3 class="detail-order-route">{{ order.route || '—' }}</h3>
        <p class="detail-order-number"><span>运单号</span><span>{{ order.id || '—' }}</span></p>
        <div class="detail-order-statuses">
          <span class="detail-badge detail-transport-status" aria-label="运输状态">{{ order.status || '—' }}</span>
          <span v-if="order.loadType" class="detail-badge tone-neutral">{{ order.loadType }}</span><span v-if="order.dispatchId" class="detail-badge tone-neutral">调度单 {{ order.dispatchId }}</span>
          <span v-if="order.riskTags?.includes('车辆未入网')" class="detail-badge tone-orange">车辆未入网</span><span v-if="order.billingExempt" class="detail-badge tone-green">免计费</span><span v-if="order.risk!=='无风险'||!order.riskTags?.length" class="detail-badge" :class="`tone-${detailRiskTone(order.risk)}`" aria-label="风险等级">{{ order.risk || '—' }}</span>
        </div>
        <dl class="detail-facts">
          <div v-for="field in summaryFields" :key="field.label" :class="{ 'is-wide': field.wide }">
            <dt>{{ field.label }}</dt><dd>{{ field.value || '—' }}</dd>
          </div>
        </dl>
        <div v-if="order.stops?.length" class="detail-waybill-stops" aria-label="运单装卸计划">
          <strong>装卸计划</strong>
          <div v-for="(stop, index) in displayStops.loading" :key="stop.id" class="detail-waybill-stop"><span>装货点{{ index + 1 }}</span><b>{{ stop.place.name }}</b><time>计划装货 {{ stop.plannedAt !== undefined ? dateText(stop.plannedAt) : '待补充' }}</time></div>
          <div v-for="(stop, index) in displayStops.unloading" :key="stop.id" class="detail-waybill-stop"><span>卸货点{{ index + 1 }}</span><b>{{ stop.place.name }}</b><time>计划卸货 {{ stop.plannedAt !== undefined ? dateText(stop.plannedAt) : '待补充' }}</time></div>
        </div>
        <details v-if="order.sourceFields?.length" class="mt-3 text-xs text-slate-600">
          <summary class="cursor-pointer text-blue-700">原始运单字段</summary>
          <dl class="detail-facts mt-2"><div v-for="field in order.sourceFields" :key="field.label" class="is-wide"><dt>{{ field.label }}</dt><dd>{{ field.value || '—' }}</dd></div></dl>
        </details>
        <details v-if="dispatchFields.length" class="detail-dispatch-context">
          <summary>调度单与扩展信息</summary>
          <dl class="detail-facts"><div v-for="field in dispatchFields" :key="field.label" class="is-wide"><dt>{{ field.label }}</dt><dd>{{ field.value || '—' }}</dd></div></dl>
        </details>
        <div class="detail-order-eta"><Icon :svg="strokeIconPaths.alarmClock" :size="15" /><span>预计到达</span><strong>{{ order.eta || '—' }}</strong></div>
      </section>
      <section class="detail-events" aria-label="运输事件流">
        <header class="detail-events-header">
          <h2>运输事件<span>{{ detailTimelineEvents.length }}</span></h2>
          <button type="button" class="detail-filter" :class="{ 'is-active': store.detailOnlyAbnormal }" :aria-pressed="store.detailOnlyAbnormal" title="只看异常事件" @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal"><Icon :svg="strokeIconPaths.filter" :size="13" />只看异常</button>
        </header>
        <div class="detail-event-filters" aria-label="事件筛选">
          <label>车辆<select v-model="vehicleFilter"><option>全部车辆</option><option v-for="vehicle in vehicleOptions" :key="vehicle">{{ vehicle }}</option></select></label>
          <label>事件<select v-model="eventTypeFilter"><option>全部事件</option><option v-for="type in eventTypeOptions" :key="type" :value="type">{{ eventTypeLabels[type] ?? type }}</option></select></label>
          <label>风险<select v-model="riskFilter"><option>全部风险</option><option>高风险</option><option>低风险</option><option>无风险</option></select></label>
        </div>
        <div class="detail-event-list">
          <MonitoringOrderPanel v-if="monitoredOrder" :order-id="monitoredOrder.id" />
          <article v-for="group in eventGroups" :key="group.id" class="detail-event-group">
            <div class="detail-event-group-heading"><strong>{{ group.label }}</strong><time>{{ group.at || '未发生' }}</time></div>
            <div v-for="event in group.events" :key="event.id" class="detail-event-card" :class="[eventTone(event), { 'is-selected': selectedEventId === event.id }]">
              <button type="button" class="detail-event-card-main" :aria-pressed="selectedEventId === event.id" :aria-label="`${event.title}，${event.time}，定位地图`" @click="selectEvent(event)">
                <span class="detail-event-card-title"><strong>{{ event.title }}</strong><span v-if="event.agentVerdict" class="detail-badge">{{ event.agentVerdict }}</span><time>{{ event.time || '—' }}</time></span>
                <span class="detail-event-card-place">{{ event.place || event.stopPlace || '—' }}<template v-if="event.vehiclePlate"> · {{ event.vehiclePlate }}</template></span>
                <small v-if="event.plannedAt">规划送达 {{ event.plannedAt }}</small>
                <span class="detail-event-card-result">{{ detailEventConclusion(event) }}</span>
              </button>
              <template v-if="detailEventSupplement(event)">
                <button type="button" class="detail-event-expand" :aria-expanded="expandedEvents.includes(event.id)" :aria-controls="`event-details-${event.id}`" @click="toggleEventDetails(event)">{{ expandedEvents.includes(event.id) ? '收起说明' : '查看说明' }}</button>
                <div v-if="expandedEvents.includes(event.id)" :id="`event-details-${event.id}`" class="detail-event-supplement">{{ detailEventSupplement(event) }}</div>
              </template>
            </div>
          </article>
          <p v-if="!filteredTimelineEvents.length" class="detail-events-empty">暂无{{ store.detailOnlyAbnormal ? '异常' : '' }}事件</p>
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
.detail-map-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; flex-shrink: 0; padding: 9px 16px; border-top: 1px solid #e2e2dc; background: #fff; color: #475569; font-size: 11px; }
.detail-map-legend label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.detail-map-legend input { accent-color: #2563eb; }
.detail-map-legend select { max-width: 128px; height: 25px; margin-left: 4px; padding: 2px 5px; border: 1px solid #cfd9dc; border-radius: 4px; background: #fff; color: #334155; font-size: 11px; }
.legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.legend-start { background: #0b8b78; }.legend-end { background: #059669; }.legend-event { background: #d97706; }
.legend-line { display: inline-block; width: 16px; border-top: 2px solid; }.legend-planned { border-color: #7e8b97; border-style: dashed; }.legend-actual { border-color: #1765a3; }
.detail-current-vehicle { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; flex-shrink: 0; padding: 8px 16px; border-top: 1px solid #e2e2dc; color: #526887; font-size: 11px; }
.detail-current-vehicle strong { color: #172b4d; font-size: 12px; }.detail-current-vehicle span { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-map-status { position: absolute; bottom: 42px; left: 16px; right: 16px; z-index: 1000; width: fit-content; max-width: calc(100% - 32px); padding: 7px 10px; background: #fff; border: 1px solid #dfe3e6; border-radius: 4px; font-size: 12px; color: #465663; }
.detail-sidebar { border-left: 1px solid #deded9; background: #fff; color: #334155; }
.detail-sidebar ::selection { color: #172b4d; background: #dbeafe; }
.detail-summary-header { flex-shrink: 0; padding-inline: 16px; border-bottom-color: #e5eaf2; }
.detail-summary-header h2 { color: #172b4d; font-size: 13px; }
.detail-summary-header :deep(svg) { color: #2563eb; }
.detail-order-summary { flex-shrink: 0; padding: 14px 16px 16px; background: linear-gradient(180deg, #eef4ff, #fff); }
.detail-order-summary.has-stops { max-height: 58%; overflow-y: auto; scrollbar-width: thin; }
.detail-waybill-stops { display: grid; gap: 6px; margin: 10px 0 12px; padding-top: 10px; border-top: 1px solid #dbe7f8; }
.detail-waybill-stops > strong { color: #172b4d; font-size: 12px; }
.detail-waybill-stop { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 2px 8px; align-items: baseline; font-size: 11px; line-height: 17px; }
.detail-waybill-stop > span { color: #526887; }.detail-waybill-stop > b { min-width: 0; color: #172b4d; font-weight: 500; overflow-wrap: anywhere; }.detail-waybill-stop > time { grid-column: 2; color: #526887; font-variant-numeric: tabular-nums; }
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
.detail-dispatch-context { margin: 12px 0; border: 1px solid #dbe7f8; border-radius: 6px; background: #f8fbff; }
.detail-dispatch-context summary { padding: 8px 10px; color: #2563eb; font-size: 12px; cursor: pointer; }
.detail-dispatch-context .detail-facts { margin: 0; padding: 0 10px 10px; }
.detail-order-eta :deep(svg) { flex-shrink: 0; color: #2563eb; }
.detail-order-eta strong { margin-left: auto; color: #172b4d; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.detail-events { display: flex; flex: 1 1 0; flex-direction: column; min-height: 0; overflow: hidden; border-top: 1px solid #e5eaf2; }
.detail-events-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; min-height: 48px; flex-shrink: 0; padding: 8px 16px; }
.detail-events-header h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; font-weight: 600; color: #172b4d; line-height: 20px; }
.detail-events-header h2 span { font-size: 12px; font-weight: 500; color: #64748b; font-variant-numeric: tabular-nums; }
.detail-event-filters { display: flex; flex-wrap: wrap; gap: 6px 8px; padding: 7px 16px; border-bottom: 1px solid #edf0f0; color: #64748b; font-size: 11px; }
.detail-event-filters label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }.detail-event-filters select { max-width: 120px; height: 26px; padding: 0 20px 0 5px; border: 1px solid #dbe2ea; border-radius: 4px; color: #334155; background: #fff; font-size: 11px; }
.detail-filter { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 7px; border: 1px solid #e5eaf2; border-radius: 5px; color: #475569; font-size: 12px; white-space: nowrap; cursor: pointer; }
.detail-filter:hover { color: #1d4ed8; border-color: #c3d6f5; background: #f8fbff; }
.detail-filter.is-active { color: #1d4ed8; border-color: #c3d6f5; background: #eff6ff; }
.detail-filter:focus-visible, .detail-event-select:focus-visible, .detail-event-expand:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.detail-event-list { flex: 1 1 0; height: 0; min-height: 0; padding: 12px 16px 16px; overflow: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; overscroll-behavior: contain; }
.detail-event-group { padding-bottom: 10px; }.detail-event-group-heading { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; color: #172b4d; font-size: 12px; }.detail-event-group-heading time { color: #64748b; font-size: 11px; }
.detail-event-card { margin: 6px 0 0; border: 1px solid #e5eaf2; border-radius: 7px; background: #fff; }.detail-event-card.tone-danger { border-color: #f4cece; background: #fffafa; }.detail-event-card.tone-warning { border-color: #f4e0b9; background: #fffdf7; }.detail-event-card:hover,.detail-event-card.is-selected { border-color: #2563eb; background: #eff6ff; }
.detail-event-card-main { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 9px 10px; text-align: left; cursor: pointer; }.detail-event-card-main:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }.detail-event-card-title { display: flex; align-items: center; gap: 6px; width: 100%; }.detail-event-card-title strong { flex: 1; color: #172b4d; font-size: 12px; }.detail-event-card-title time { color: #64748b; font-size: 11px; white-space: nowrap; }.detail-event-card-place,.detail-event-card small { color: #64748b; font-size: 11px; line-height: 18px; }.detail-event-card-result { color: #475569; font-size: 11px; line-height: 18px; }
.detail-event-card .detail-event-expand { margin: 0 10px 8px; }.detail-event-card .detail-event-supplement { margin: 0 10px 10px; }
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
  .detail-order-summary.has-stops { max-height: none; overflow: visible; }
  .detail-events { flex: none; height: auto; overflow: visible; }
  .detail-event-list { flex: none; height: auto; overflow: visible; }
  .detail-summary-header { padding-inline: 16px; }
}

:deep(.amap-container) {
  background: #e2e8f0;
  color: #0f172a;
  font-family: inherit;
}

:deep(.dispatch-map-callout) { position: relative; width: 80px; height: 80px; pointer-events: none; }
:deep(.dispatch-map-anchor) { position: absolute; left: 36px; top: 36px; width: 8px; height: 8px; border: 2px solid #fff; border-radius: 50%; background: #253649; box-shadow: 0 0 0 1px #253649; }
:deep(.dispatch-map-leader) { position: absolute; height: 1.5px; background: #344a5b; transform-origin: left center; box-shadow: 0 1px 2px #fff; }
:deep(.dispatch-map-pin) { position: absolute; display: block; width: 26px; height: 26px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 2px 8px #152c3b55; color: #fff; text-align: center; font-size: 12px; font-weight: 700; line-height: 22px; pointer-events: auto; }
:deep(.dispatch-map-callout.is-selected .dispatch-map-pin) { outline: 2px solid #2563eb; outline-offset: 2px; }
:deep(.dispatch-truck-marker) { position: relative; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border: 2px solid; border-radius: 8px; background: #fff; box-shadow: 0 2px 8px #152c3b55; pointer-events: auto; }
:deep(.dispatch-vehicle-address) { position: absolute; top: -7px; left: 44px; display: flex; flex-direction: column; gap: 1px; width: max-content; max-width: 190px; padding: 5px 7px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; box-shadow: 0 2px 7px #152c3b33; color: #334155; font-size: 11px; line-height: 15px; }
:deep(.dispatch-vehicle-address strong) { color: #1765a3; font-size: 11px; }
:deep(.dispatch-vehicle-address span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.dispatch-map-info) { min-width: 190px; max-width: 285px; color: #203648; font-size: 12px; }
:deep(.dispatch-map-info strong) { display: block; margin-bottom: 6px; color: #203648; font-size: 13px; }
:deep(.dispatch-map-info p) { margin: 4px 0; overflow-wrap: anywhere; color: #5f6d7c; line-height: 1.5; }

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

<style scoped>
</style>
