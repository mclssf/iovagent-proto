<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { usePhase1 } from '@/pinia/phase1';
import { dateText } from '@/views/Phase1/catalog';
import { convertGpsCoordinates, loadAMap, searchDrivingRoute, type AMapCoordinate } from '@/utils/amap';
import { dispatchInfoContent, dispatchMarkerContent, dispatchTruckContent } from './dispatchMapVisual';
import { sortDispatchEventsByStart, type DispatchEvent } from './dispatchDemo';
import { stopForWaybill, type DispatchScenario } from './dispatchScenarios';

const props = defineProps<{ dispatch: DispatchScenario }>();
const emit = defineEmits<{ back: [] }>();
const router = useRouter();
const monitoring = usePhase1();
const generatedOrder = computed(() => monitoring.orders.find(item => item.id === props.dispatch.id && item.monitoringOwner === 'dispatch'));
const vehicleInput = ref(props.dispatch.plate.replace(/、/g, '，'));
const editFeedback = ref('');
const demoStopId = ref('');
watch(() => props.dispatch.id, () => { vehicleInput.value = props.dispatch.plate.replace(/、/g, '，'); editFeedback.value = ''; demoStopId.value = ''; });
function saveVehicles() {
  const plates = vehicleInput.value.split(/[、,，]/).map(item => item.trim()).filter(Boolean);
  editFeedback.value = monitoring.updateDispatchVehicles(props.dispatch.id, plates.map((plate, index) => ({ plate, sequence: index + 1 }))) || '车辆顺序已更新。';
}
function demoFence(phase: 'enter' | 'exit') {
  const stop = generatedOrder.value?.stops?.find(item => item.id === demoStopId.value);
  if (!stop) { editFeedback.value = '请先选择装卸货点。'; return; }
  editFeedback.value = monitoring.receive({ id: monitoring.next('EV'), orderId: props.dispatch.id, type: 'fence', phase, target: stop.role === 'loading' ? 'origin' : 'destination', stopId: stop.id, occurredAt: monitoring.now, address: stop.place.name, durationMinutes: 0, distanceMeters: 0, vehiclePlate: props.dispatch.plate.split('、').slice(-1)[0], position: { lat: stop.place.lat, lon: stop.place.lon } }) || `${stop.place.name}${phase === 'enter' ? '进' : '出'}围栏事件已记录。`;
}
function displayStatus(status: string) { return status; }
function eventVisual(event: DispatchEvent) {
  const icons: Record<DispatchEvent['kind'], [string, string]> = { station: ['站', '#1765a3'], fence: ['栏', '#0b8b78'], parking: ['停', '#b45309'], transfer: ['换', '#d97706'], highway: ['高', '#42526b'], gap: ['缺', '#b45309'], deviation: ['偏', '#c43434'], weather: ['天', '#42526b'] };
  return icons[event.kind];
}
function dispatchTags(dispatch: DispatchScenario) {
  const pickups = dispatch.stops.filter(item => item.role === '提货').length;
  const deliveries = dispatch.stops.filter(item => item.role === '卸货').length;
  return [
    pickups > 1 && deliveries > 1 ? '多装多卸' : pickups > 1 ? '多地提货' : deliveries > 1 ? '多地卸货' : '',
    dispatch.plate.includes('、') ? '多车运输' : '',
  ].filter(Boolean);
}
const mapRef = ref<HTMLDivElement | null>(null);
const mapLoading = ref(true);
const mapError = ref('');
const routeSummary = ref('');
const plannedArrivalByStop = ref<Record<string, string>>({});
const activeTab = ref<'events' | 'waybills' | 'extended'>('events');
const search = ref('');
const mapReady = ref(false);
const selectedEvent = ref('');
const showStations = ref(true);
const showRisks = ref(true);
const showWatermark = ref(false);
const vehicleFilter = ref('全部车辆');
const eventKindFilter = ref('全部事件');
const riskFilter = ref('全部风险');
let map: AMap.Map | null = null;
let revision = 0;
const stationMarkers: AMap.Marker[] = [];
const riskMarkers: AMap.Marker[] = [];
const eventPositions = new Map<string, AMapCoordinate>();
const visibleWaybills = computed(() => props.dispatch.waybills.filter(item => `${item.id} ${stopForWaybill(props.dispatch, item.pickupId)?.name} ${stopForWaybill(props.dispatch, item.deliveryId)?.name}`.toLowerCase().includes(search.value.trim().toLowerCase())));
const pickupStops = computed(() => props.dispatch.stops.filter(item => item.role === '提货'));
const deliveryStops = computed(() => props.dispatch.stops.filter(item => item.role === '卸货'));
const vehiclePositions = computed(() => props.dispatch.currentVehicles ?? (props.dispatch.currentVehicle ? [{ plate: props.dispatch.currentVehicle.plate, place: props.dispatch.currentVehicle.place, speedKmh: props.dispatch.currentVehicle.speedKmh, at: props.dispatch.currentVehicle.at, coordinate: props.dispatch.currentVehicle.coordinate, current: true }] : []));
const currentVehicle = computed(() => vehiclePositions.value.find(item => item.current) ?? vehiclePositions.value[vehiclePositions.value.length - 1]);
const allEvents = computed(() => sortDispatchEventsByStart(props.dispatch.events));
const eventKindLabels: Record<DispatchEvent['kind'], string> = { station: '装卸货点', fence: '围栏', parking: '超时停车', transfer: '换车', highway: '上下高速', gap: '轨迹缺失', deviation: '轨迹偏移', weather: '恶劣天气' };
const eventKindOptions = computed(() => [...new Set(allEvents.value.map(event => event.kind))]);
const vehicleOptions = computed(() => [...new Set([...props.dispatch.plate.split('、'), ...allEvents.value.map(event => event.plate ?? (event.vehicle === 'A' ? props.dispatch.plate.split('、')[0] : event.vehicle === 'B' ? props.dispatch.plate.split('、')[1] : '')).filter(Boolean)])]);
const visibleEvents = computed(() => allEvents.value.filter(event => (vehicleFilter.value === '全部车辆' || eventPlate(event) === vehicleFilter.value) && (eventKindFilter.value === '全部事件' || event.kind === eventKindFilter.value) && (riskFilter.value === '全部风险' || (event.risk ?? '无风险') === riskFilter.value)));
const routeLabel = computed(() => `${[...new Set(pickupStops.value.map(item => item.city))].join('、')}（${pickupStops.value.length}处）→ ${[...new Set(deliveryStops.value.map(item => item.city))].join('、')}（${deliveryStops.value.length}处）`);
const eventGroups = computed(() => [
  { id: 'created', label: '调度单创建', at: props.dispatch.createdAt.slice(5), events: [] },
  { id: 'loading', label: '装货中', at: visibleEvents.value.find(item => item.stage === 'loading')?.at ?? '', events: visibleEvents.value.filter(item => item.stage === 'loading') },
  { id: 'in_transit', label: '在途', at: props.dispatch.departedAt?.slice(5) ?? '', events: visibleEvents.value.filter(item => item.stage === 'in_transit') },
  { id: 'arrived', label: '卸货中', at: visibleEvents.value.find(item => item.stage === 'arrived')?.at ?? '', events: visibleEvents.value.filter(item => item.stage === 'arrived') },
  { id: 'completed', label: '已完成', at: props.dispatch.status === '已完成' ? props.dispatch.plannedEnd.slice(5) : '', events: [] },
]);
const extendedRows = computed(() => [
  { label: '调度单号', value: props.dispatch.id }, { label: '客户', value: props.dispatch.customer },
  { label: '调度状态', value: displayStatus(props.dispatch.status) }, { label: '风险状态', value: props.dispatch.risk },
  { label: '计划开始', value: props.dispatch.plannedStart }, { label: '计划结束', value: props.dispatch.plannedEnd },
  { label: '车辆', value: props.dispatch.plate }, { label: '司机', value: props.dispatch.driver },
  { label: '承运商', value: props.dispatch.carrier }, { label: '轨迹完整率', value: props.dispatch.coverage === null ? '—' : `${props.dispatch.coverage}%` },
  { label: '异常说明', value: props.dispatch.issue }, { label: '数据来源', value: props.dispatch.source },
]);
function openWaybill(id: string) { router.push({ name: 'agent-work-detail', query: { dispatchId: props.dispatch.id, waybillId: id, orderId: id } }); }
function focusEvent(event: DispatchEvent) {
  selectedEvent.value = event.id;
  if (event.kind === 'station') showStations.value = true;
  else showRisks.value = true;
  applyLayers();
  const position = eventPositions.get(event.id);
  if (position && map) map.setZoomAndCenter(event.kind === 'transfer' ? 12 : 11, position);
}
function popup(amap: typeof AMap, position: AMapCoordinate, title: string, rows: [string, string][]) {
  if (!map) return;
  new amap.InfoWindow({ content: dispatchInfoContent(title, rows), offset: new amap.Pixel(0, -30) }).open(map, position);
}
function routeFractions(path: AMapCoordinate[]) {
  const distances = path.map((point, index) => index ? Math.hypot((point[0] - path[index - 1]![0]) * Math.cos(point[1] * Math.PI / 180), point[1] - path[index - 1]![1]) : 0);
  const total = distances.reduce((sum, distance) => sum + distance, 0) || 1;
  let covered = 0;
  return distances.map(distance => (covered += distance) / total);
}
function nearestIndex(path: AMapCoordinate[], target: AMapCoordinate) {
  return path.reduce((best, point, index) => Math.hypot(point[0] - target[0], point[1] - target[1]) < Math.hypot(path[best]![0] - target[0], path[best]![1] - target[1]) ? index : best, 0);
}
function headingDegrees(from: AMapCoordinate, to: AMapCoordinate) {
  return Math.atan2(-(to[1] - from[1]), (to[0] - from[0]) * Math.cos(to[1] * Math.PI / 180)) * 180 / Math.PI;
}
function eventPlate(event: DispatchEvent) { return event.plate ?? (event.vehicle === 'A' ? props.dispatch.plate.split('、')[0] : event.vehicle === 'B' ? props.dispatch.plate.split('、')[1] : undefined); }
function estimatedArrival(event: DispatchEvent) { return event.kind === 'station' && deliveryStops.value.some(stop => stop.name === event.place) ? plannedArrivalByStop.value[event.place] : undefined; }
function applyLayers() {
  stationMarkers.forEach(marker => showStations.value ? marker.show() : marker.hide());
  riskMarkers.forEach(marker => showRisks.value ? marker.show() : marker.hide());
}
async function renderMap() {
  const currentRevision = ++revision;
  map?.destroy();
  map = null;
  stationMarkers.length = 0;
  riskMarkers.length = 0;
  eventPositions.clear();
  await nextTick();
  if (!mapRef.value || props.dispatch.stops.length < 2) return;
  mapLoading.value = true;
  mapError.value = '';
  mapReady.value = false;
  try {
    const amap = await loadAMap(['AMap.Driving', 'AMap.ToolBar']);
    const routeStops = props.dispatch.stops;
    const sourceCoordinates: AMapCoordinate[] = [
      ...routeStops.map(stop => [stop.coordinate[0], stop.coordinate[1]] as AMapCoordinate),
      ...(currentVehicle.value ? [[currentVehicle.value.coordinate[0], currentVehicle.value.coordinate[1]] as AMapCoordinate] : []),
    ];
    const positions = await convertGpsCoordinates(amap, sourceCoordinates);
    if (currentRevision !== revision || !mapRef.value) return;
    map = new amap.Map(mapRef.value, { center: positions[0], zoom: 7, viewMode: '2D', mapStyle: 'amap://styles/whitesmoke' });
    map.addControl(new amap.ToolBar({ position: 'RB' }));
    routeStops.forEach((stop, index) => {
      const position = positions[index]!;
      const event = allEvents.value.find(item => item.kind === 'station' && item.place === stop.name);
      if (event) eventPositions.set(event.id, position);
      const completed = Boolean(event);
      const marker = new amap.Marker({ position, anchor: 'center', content: dispatchMarkerContent(stop.role === '提货' ? '提' : '卸', completed ? stop.role === '提货' ? '#1765a3' : '#0b8b78' : '#94a3b8'), title: `${stop.name}${plannedArrivalByStop.value[stop.name] ? ` · 规划送达 ${plannedArrivalByStop.value[stop.name]}` : ''}` });
      marker.on('click', () => popup(amap, position, stop.name, [['装卸状态', completed ? '已完成' : '未完成'], ['时间', event?.at ?? '尚未到达'], ['位置', stop.name], ...(plannedArrivalByStop.value[stop.name] ? [['规划送达', plannedArrivalByStop.value[stop.name]!] as [string, string]] : [])]));
      map!.add(marker);
      stationMarkers.push(marker);
    });
    const road = await searchDrivingRoute(amap, positions.slice(0, routeStops.length));
    if (currentRevision !== revision || !map || !road.path.length) return;
    const planned = road.path;
    const fractions = routeFractions(planned);
    const indexAtPercent = (percent: number) => fractions.reduce((best, fraction, index) => Math.abs(fraction - percent / 100) < Math.abs(fractions[best]! - percent / 100) ? index : best, 0);
    const vehicle = currentVehicle.value;
    const vehicleSource = vehicle ? positions[routeStops.length] : undefined;
    const currentIndex = vehicle && vehicleSource ? nearestIndex(planned, vehicleSource) : planned.length - 1;
    const latestAt = vehicle?.at ? Date.parse(vehicle.at.replace(' ', 'T') + (vehicle.at.length === 16 ? ':00' : '') + '+08:00') : NaN;
    const etaBase = Number.isFinite(latestAt) ? latestAt : Date.now();
    plannedArrivalByStop.value = Object.fromEntries(deliveryStops.value.map(stop => {
      const stopIndex = nearestIndex(planned, positions[routeStops.findIndex(item => item.id === stop.id)]!);
      const remainingSeconds = Math.max(0, fractions[stopIndex]! - fractions[currentIndex]!) * road.duration;
      const eta = Math.ceil((etaBase + remainingSeconds * 1000) / 3600000) * 3600000;
      return [stop.name, dateText(eta)];
    }));
    routeStops.forEach((stop, index) => { const eta = plannedArrivalByStop.value[stop.name]; if (eta) stationMarkers[index]?.setTitle(`${stop.name} · 规划送达 ${eta}`); });
    const gaps = allEvents.value.filter(item => item.kind === 'gap');
    const deviations = allEvents.value.filter(item => item.kind === 'deviation');
    const transfer = allEvents.value.find(item => item.kind === 'transfer');
    const transferIndex = transfer ? indexAtPercent(transfer.routePercent ?? 63) : planned.length;
    const actual = planned.map((point, index) => {
      const offset = deviations.reduce((largest, event) => Math.max(largest, Math.max(0, 1 - Math.abs(fractions[index]! - (event.routePercent ?? 71) / 100) / 0.025) * 0.011), 0);
      return offset ? [point[0], point[1] + offset] as AMapCoordinate : point;
    });
    const plannedLine = new amap.Polyline({ path: planned, strokeColor: '#7e8b97', strokeWeight: 3, strokeOpacity: 1, strokeStyle: 'dashed', strokeDasharray: [6, 6], zIndex: 10 });
    map.add(plannedLine);
    if (props.dispatch.status !== '待发车' && currentIndex > 0) {
      let part: AMapCoordinate[] = [];
      let previousStyle = '';
      const flush = () => {
        if (part.length < 2) return;
        const [color, gap] = previousStyle.split(':');
        map!.add(new amap.Polyline({ path: part, strokeColor: color, strokeWeight: 6, strokeOpacity: 1, strokeStyle: gap === 'gap' ? 'dashed' : 'solid', strokeDasharray: [10, 8], zIndex: 20 }));
      };
      for (let index = 1; index <= currentIndex; index++) {
        const percent = fractions[index]! * 100;
        const gap = gaps.some(event => Math.abs(percent - (event.routePercent ?? 52)) <= 3);
        const plate = index <= transferIndex ? props.dispatch.plate.split('、')[0] : props.dispatch.plate.split('、')[1] ?? props.dispatch.plate.split('、')[0];
        if (vehicleFilter.value !== '全部车辆' && plate !== vehicleFilter.value) { flush(); part = []; previousStyle = ''; continue; }
        const color = index <= transferIndex ? '#1765a3' : '#0b8b78';
        const style = color + ':' + (gap ? 'gap' : 'solid');
        if (style !== previousStyle) { flush(); part = [actual[index - 1]!]; previousStyle = style; }
        part.push(actual[index]!);
      }
      flush();
      for (const event of deviations.filter(item => vehicleFilter.value === '全部车辆' || eventPlate(item) === vehicleFilter.value)) {
        const center = (event.routePercent ?? 71) / 100;
        const indices = fractions.map((fraction, index) => Math.abs(fraction - center) <= 0.025 ? index : -1).filter(index => index >= 0 && index <= currentIndex);
        if (indices.length > 1) map.add(new amap.Polyline({ path: actual.slice(indices[0]!, indices[indices.length - 1]! + 1), strokeColor: '#c43434', strokeWeight: 7, zIndex: 25 }));
      }
    }
    if (vehicle && vehicleSource) {
      const from = actual[Math.max(0, currentIndex - 4)]!;
      const to = actual[Math.min(actual.length - 1, currentIndex + (currentIndex === 0 ? 4 : 0))]!;
      const marker = new amap.Marker({ position: vehicleSource, anchor: 'center', content: dispatchTruckContent('#1765a3', headingDegrees(from, to), vehicle.plate, vehicle.place), title: `${vehicle.plate} · ${vehicle.place} · ${vehicle.at}`, zIndex: 160 });
      marker.on('click', () => popup(amap, vehicleSource, '当前运输车辆最新位置', [['车牌号', vehicle.plate], ['位置地址', vehicle.place], ['时速', vehicle.speedKmh + ' km/h'], ['定位时间', vehicle.at]]));
      map!.add(marker);
    }
    routeSummary.value = '高德规划 ' + Math.round(road.distance / 1000) + ' 公里';
    const pinCounts = new Map<string, number>();
    for (const event of visibleEvents.value.filter(item => item.kind !== 'station')) {
      const index = indexAtPercent(event.routePercent ?? (25 + riskMarkers.length * 12));
      const position = event.kind === 'deviation' ? actual[index] : planned[index];
      if (!position) continue;
      eventPositions.set(event.id, position);
      const visual = eventVisual(event);
      const pinKey = `${position[0].toFixed(3)},${position[1].toFixed(3)}`;
      const pinIndex = pinCounts.get(pinKey) ?? 0;
      pinCounts.set(pinKey, pinIndex + 1);
      const marker = new amap.Marker({ position, anchor: 'center', content: dispatchMarkerContent(visual[0], visual[1], [-30, 0, 30, -55, 55][pinIndex % 5], -33 - Math.floor(pinIndex / 5) * 25), title: event.title, zIndex: 120 });
      marker.on('click', () => { selectedEvent.value = event.id; popup(amap, position, event.title, [['车牌号', event.plate ?? props.dispatch.plate], ['时间', '2026-' + event.at], ['位置', event.place], ['事件参数', event.detail]]); });
      map.add(marker);
      riskMarkers.push(marker);
    }
    applyLayers();
    map.setFitView([plannedLine, ...stationMarkers, ...riskMarkers], false, [42, 42, 42, 42]);
    mapReady.value = true;
  } catch {
    if (currentRevision !== revision) return;
    mapError.value = '地图暂不可用，请稍后刷新重试';
    routeSummary.value = map ? '道路规划暂不可用' : '';
  } finally {
    if (currentRevision === revision) mapLoading.value = false;
  }
}
watch(() => props.dispatch.id, renderMap);
watch(() => `${props.dispatch.plate}|${props.dispatch.events.map(event => event.id).join(',')}`, renderMap);
watch([showStations, showRisks], applyLayers);
watch([vehicleFilter, eventKindFilter, riskFilter], renderMap);
onMounted(renderMap);
onBeforeUnmount(() => { revision++; map?.destroy(); map = null; });
</script>

<template>
  <div class="dispatch-v3-detail-page">
    <section class="dispatch-v3-map-panel" aria-label="调度单地图轨迹">
      <header class="dispatch-v3-panel-head dispatch-v3-detail-head">
        <div>
          <button type="button" class="dispatch-v3-back" @click="emit('back')">← 返回调度单</button>
          <div class="dispatch-v3-title-line">
            <h1>{{ dispatch.id }}</h1>
            <span class="dispatch-v3-tag success">{{ displayStatus(dispatch.status) }}</span>
            <span class="dispatch-v3-tag" :class="dispatch.risk === '高风险' ? 'warning' : 'muted'">{{ dispatch.risk }}</span>
            <span v-for="tag in dispatchTags(dispatch)" :key="tag" class="dispatch-v3-tag" :class="tag === '多车运输' ? 'warning' : 'muted'">{{ tag }}</span>
          </div>
          <p>{{ dispatch.customer }} · {{ routeLabel }}</p>
        </div>
      </header>
      <div class="dispatch-v3-map-stage">
        <div ref="mapRef" class="dispatch-v3-map"></div>
        <div v-if="showWatermark" class="dispatch-v3-map-watermark" aria-hidden="true">中交兴路</div>
        <div v-if="mapLoading || mapError" class="dispatch-v3-map-status" :role="mapError ? 'alert' : 'status'">{{ mapError || '正在加载地图与运输轨迹…' }}</div>
      </div>
      <div v-if="currentVehicle" class="dispatch-v3-current-vehicle"><strong>{{ currentVehicle.plate }}</strong><span>{{ currentVehicle.place }}</span><span>{{ currentVehicle.speedKmh }} km/h</span><time>{{ currentVehicle.at }}</time></div>
      <div class="dispatch-v3-map-legend">
        <span><i class="dispatch-v3-legend-route"></i>规划路径</span>
        <span><i class="dispatch-v3-legend-actual"></i>实际轨迹</span>
        <span><i class="dispatch-v3-legend-stop"></i>装卸货站点</span>
        <span><i class="dispatch-v3-legend-event"></i>运输事件</span>
        <template v-if="dispatch.status !== '待发车'"><span v-for="(plate, index) in dispatch.plate.split('、')" :key="plate"><i :class="index ? 'dispatch-v3-legend-vehicle-b' : 'dispatch-v3-legend-vehicle-a'"></i>{{ plate }} 实际轨迹</span></template>
        <label><input v-model="showStations" type="checkbox" />装卸货站点</label>
        <label v-if="visibleEvents.some(event => event.kind !== 'station')"><input v-model="showRisks" type="checkbox" />运输事件</label>
        <label><input v-model="showWatermark" type="checkbox" />显示水印</label>
        <label>车辆<select v-model="vehicleFilter"><option>全部车辆</option><option v-for="vehicle in vehicleOptions" :key="vehicle">{{ vehicle }}</option></select></label>
        <label>事件<select v-model="eventKindFilter"><option value="全部事件">全部事件</option><option v-for="kind in eventKindOptions" :key="kind" :value="kind">{{ eventKindLabels[kind] }}</option></select></label>
        <label>风险<select v-model="riskFilter"><option>全部风险</option><option>高风险</option><option>低风险</option><option>无风险</option></select></label>
        <span v-if="mapReady">地图已加载</span>
      </div>
    </section>

    <aside class="dispatch-v3-events-panel" aria-label="调度单详情与运输事件">
      <header class="dispatch-v3-sidebar-header"><h2>调度单详情</h2></header>
      <section class="dispatch-v3-order-summary" aria-label="调度单摘要">
        <h3>{{ routeLabel }}</h3>
        <p><span>调度单号</span><strong>{{ dispatch.id }}</strong></p>
        <div class="dispatch-v3-statuses">
          <span class="dispatch-v3-tag success">{{ displayStatus(dispatch.status) }}</span>
          <span class="dispatch-v3-tag" :class="dispatch.risk === '高风险' ? 'warning' : 'muted'">{{ dispatch.risk }}</span>
          <span v-for="tag in dispatchTags(dispatch)" :key="tag" class="dispatch-v3-tag" :class="tag === '多车运输' ? 'warning' : 'muted'">{{ tag }}</span>
        </div>
        <dl class="dispatch-v3-facts">
          <div><dt>客户</dt><dd>{{ dispatch.customer }}</dd></div>
          <div><dt>关联运单</dt><dd>{{ dispatch.waybills.length }} 条</dd></div>
          <div class="is-wide"><dt>计划时间</dt><dd>{{ dispatch.plannedStart }} 至 {{ dispatch.plannedEnd }}</dd></div>
          <div class="is-wide"><dt>车辆 / 司机</dt><dd>{{ dispatch.plate }} · {{ dispatch.driver }}</dd></div>
          <div class="is-wide"><dt>承运商</dt><dd>{{ dispatch.carrier }}</dd></div>
        </dl>
        <div class="dispatch-v3-eta"><span>轨迹完整率</span><strong>{{ dispatch.coverage === null ? '—' : dispatch.coverage + '%' }}</strong><small>{{ dispatch.issue }}</small></div>
        <p class="dispatch-v3-readonly-note">调度单生成后可更新车辆信息，不支持拆分或修改其他业务信息。</p>
        <div v-if="generatedOrder" class="dispatch-v3-demo-actions"><strong>调度单接口演示</strong><label>顺序车辆<input v-model="vehicleInput" aria-label="顺序车辆" placeholder="车牌1，车牌2" /></label><button type="button" @click="saveVehicles">更新车辆</button><label>装卸货点<select v-model="demoStopId" aria-label="模拟上报装卸货点"><option value="">请选择</option><option v-for="stop in generatedOrder.stops" :key="stop.id" :value="stop.id">{{ stop.place.name }}</option></select></label><button type="button" @click="demoFence('enter')">模拟进围栏</button><button type="button" @click="demoFence('exit')">模拟出围栏</button><p v-if="editFeedback" role="status">{{ editFeedback }}</p></div>
      </section>
      <section class="dispatch-v3-events-section">
        <nav class="dispatch-v3-tabs">
          <button type="button" :class="{ active: activeTab === 'events' }" @click="activeTab = 'events'">运输事件 <span>{{ dispatch.events.length }}</span></button>
          <button type="button" :class="{ active: activeTab === 'waybills' }" @click="activeTab = 'waybills'">关联运单 <span>{{ dispatch.waybills.length }}</span></button>
          <button type="button" :class="{ active: activeTab === 'extended' }" @click="activeTab = 'extended'">扩展信息</button>
        </nav>
        <div v-if="activeTab === 'events'" class="dispatch-v3-event-filters"><label>事件类型<select v-model="eventKindFilter"><option value="全部事件">全部事件</option><option v-for="kind in eventKindOptions" :key="kind" :value="kind">{{ eventKindLabels[kind] }}</option></select></label><label>风险等级<select v-model="riskFilter"><option>全部风险</option><option>高风险</option><option>低风险</option><option>无风险</option></select></label></div>
        <div v-if="activeTab === 'events'" class="dispatch-v3-event-scroll">
          <article v-for="group in eventGroups" :key="group.id" class="dispatch-v3-event-group">
            <div class="dispatch-v3-event-heading"><strong>{{ group.label }}</strong><time>{{ group.at || '未发生' }}</time></div>
            <article v-for="event in group.events" :key="event.id" class="dispatch-v3-event-card" :class="[event.risk === '高风险' ? 'risk-high' : event.risk === '低风险' ? 'risk-low' : '', { 'is-selected': selectedEvent === event.id }]" role="button" tabindex="0" @click="focusEvent(event)" @keydown.enter="focusEvent(event)">
              <div><strong>{{ event.title }}</strong><time>{{ event.at }}</time></div>
              <p>{{ event.place }}</p>
              <small v-if="estimatedArrival(event)">规划送达 {{ estimatedArrival(event) }}</small><small>{{ event.detail }}</small>
            </article>
          </article>
        </div>
        <div v-else-if="activeTab === 'waybills'" class="dispatch-v3-waybill-panel">
          <label>搜索运单<input v-model="search" type="search" placeholder="运单号 / 地点" /></label>
          <div class="dispatch-v3-waybill-list">
            <article v-for="item in visibleWaybills" :key="item.id">
              <div><strong>{{ item.id }}</strong><span>{{ displayStatus(item.status) }} · {{ item.loadType ?? '零担' }} · 调度单 {{ dispatch.id }}</span><p>{{ stopForWaybill(dispatch, item.pickupId)?.name }} → {{ stopForWaybill(dispatch, item.deliveryId)?.name }}</p></div>
              <button type="button" @click="openWaybill(item.id)">查看运单</button>
            </article>
          </div>
        </div>
        <dl v-else class="dispatch-v3-extended"><div v-for="row in extendedRows" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.dispatch-v3-detail-page { display: grid; grid-template-columns: minmax(0, 1fr) 440px; height: 100%; min-height: 0; overflow: hidden; background: #fff; color: #172b4d; }
.dispatch-v3-map-panel, .dispatch-v3-events-panel { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.dispatch-v3-events-panel { overflow: hidden; border-left: 1px solid #deded9; }
.dispatch-v3-panel-head { display: flex; align-items: center; min-height: 48px; padding: 0 16px; border-bottom: 1px solid #e2e2dc; }
.dispatch-v3-detail-head { align-items: flex-start; min-height: 68px; padding-top: 9px; padding-bottom: 9px; }
.dispatch-v3-back { padding: 0; border: 0; color: #2563eb; background: transparent; font-size: 12px; cursor: pointer; }
.dispatch-v3-title-line { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.dispatch-v3-title-line h1 { margin: 0 3px 0 0; font-size: 15px; line-height: 20px; }
.dispatch-v3-detail-head p { margin: 3px 0 0; color: #64748b; font-size: 12px; }
.dispatch-v3-map-stage { position: relative; flex: 1; min-height: 0; }
.dispatch-v3-map { width: 100%; height: 100%; min-height: 100%; background: #eef3f6; }
.dispatch-v3-map-watermark { position: absolute; top: 50%; left: 50%; z-index: 2; transform: translate(-50%, -50%) rotate(-18deg); pointer-events: none; white-space: nowrap; color: #35536b; opacity: .22; font-size: 28px; font-weight: 700; letter-spacing: .24em; text-shadow: 0 1px 0 #fff; }
.dispatch-v3-map-status { position: absolute; left: 16px; bottom: 18px; padding: 7px 10px; border: 1px solid #dfe3e6; border-radius: 4px; background: #fff; color: #465663; font-size: 12px; }
.dispatch-v3-current-vehicle { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 16px; border-top: 1px solid #e2e2dc; color: #64748b; font-size: 11px; }
.dispatch-v3-current-vehicle strong { color: #172b4d; font-size: 12px; }
.dispatch-v3-current-vehicle time { margin-left: auto; font-variant-numeric: tabular-nums; }
.dispatch-v3-map-legend { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 9px 16px; border-top: 1px solid #e2e2dc; color: #64748b; font-size: 11px; }
.dispatch-v3-map-legend i { display: inline-block; width: 18px; height: 3px; margin-right: 5px; vertical-align: middle; }
.dispatch-v3-legend-route { background: #2563eb; }
.dispatch-v3-legend-actual { background: #1765a3; }
.dispatch-v3-legend-stop { width: 10px !important; height: 10px !important; border-radius: 50%; background: #0f766e; }
.dispatch-v3-legend-event { width: 10px !important; height: 10px !important; border-radius: 50%; background: #d97706; }
.dispatch-v3-legend-vehicle-a, .dispatch-v3-legend-vehicle-b { width: 17px !important; border-radius: 2px; }
.dispatch-v3-legend-vehicle-a { background: #1765a3; }
.dispatch-v3-legend-vehicle-b { background: #0b8b78; }
.dispatch-v3-map-legend > label { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; cursor: pointer; }
.dispatch-v3-map-legend input { accent-color: #1765a3; }
.dispatch-v3-map-legend select, .dispatch-v3-event-filters select { height: 26px; margin-left: 4px; padding: 2px 5px; border: 1px solid #cfd9dc; border-radius: 4px; background: #fff; color: #334155; font-size: 11px; }
.dispatch-v3-sidebar-header { display: flex; align-items: center; min-height: 48px; flex-shrink: 0; padding: 0 16px; border-bottom: 1px solid #e5eaf2; }
.dispatch-v3-sidebar-header h2 { margin: 0; color: #172b4d; font-size: 13px; font-weight: 600; }
.dispatch-v3-order-summary { flex-shrink: 0; padding: 14px 16px 16px; background: linear-gradient(180deg, #eef4ff, #fff); }
.dispatch-v3-order-summary h3 { margin: 0; color: #172b4d; font-size: 14px; font-weight: 600; line-height: 22px; overflow-wrap: anywhere; }
.dispatch-v3-order-summary > p { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 0; color: #425a7e; font-size: 12px; }
.dispatch-v3-order-summary > p strong { color: #172b4d; font-weight: 500; overflow-wrap: anywhere; }
.dispatch-v3-statuses { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.dispatch-v3-tag { display: inline-flex; align-items: center; width: fit-content; padding: 2px 7px; border-radius: 4px; font-size: 11px; line-height: 18px; }
.dispatch-v3-tag.success { color: #15803d; background: #f0fdf4; }
.dispatch-v3-tag.warning { color: #b45309; background: #fffbeb; }
.dispatch-v3-tag.muted { color: #475569; background: #f1f5f9; }
.dispatch-v3-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 14px; margin: 12px 0; font-size: 12px; line-height: 19px; }
.dispatch-v3-facts > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dispatch-v3-facts > .is-wide { grid-column: 1 / -1; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; align-items: baseline; }
.dispatch-v3-facts dt { color: #526887; font-size: 11px; }
.dispatch-v3-facts dd { margin: 0; color: #172b4d; font-weight: 500; overflow-wrap: anywhere; }
.dispatch-v3-eta { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-radius: 6px; color: #345891; background: #eff6ff; font-size: 12px; line-height: 20px; }
.dispatch-v3-eta strong { margin-left: auto; color: #172b4d; font-size: 13px; }
.dispatch-v3-eta small { width: 100%; color: #64748b; font-size: 11px; }
.dispatch-v3-readonly-note { margin: 10px 0 0; color: #64748b; font-size: 11px; line-height: 18px; }
.dispatch-v3-events-section { display: flex; flex: 1 1 0; flex-direction: column; min-height: 0; overflow: hidden; border-top: 1px solid #e5eaf2; }
.dispatch-v3-demo-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 10px; padding: 9px; border: 1px solid #dbe7f8; border-radius: 6px; background: #f8fbff; font-size: 11px; }.dispatch-v3-demo-actions strong { width: 100%; }.dispatch-v3-demo-actions label { display: inline-flex; align-items: center; gap: 5px; }.dispatch-v3-demo-actions input,.dispatch-v3-demo-actions select { min-width: 105px; max-width: 180px; border: 1px solid #cfd9dc; border-radius: 4px; padding: 4px; background: #fff; }.dispatch-v3-demo-actions button { border: 1px solid #bfcee2; border-radius: 4px; padding: 4px 7px; background: #fff; color: #1d4ed8; }.dispatch-v3-demo-actions p { width: 100%; color: #526887; }
.dispatch-v3-tabs { display: flex; align-items: center; min-height: 48px; flex-shrink: 0; padding: 0 12px; border-bottom: 1px solid #e2e2dc; }
.dispatch-v3-tabs button { height: 48px; padding: 0 10px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #64748b; font-size: 12px; cursor: pointer; }
.dispatch-v3-tabs button.active { border-bottom-color: #2563eb; color: #172b4d; font-weight: 600; }
.dispatch-v3-tabs span { margin-left: 3px; color: #94a3b8; }
.dispatch-v3-event-filters { display: flex; gap: 12px; flex-shrink: 0; padding: 9px 16px; border-bottom: 1px solid #edf0f0; color: #64748b; font-size: 11px; }
.dispatch-v3-event-filters label { display: inline-flex; align-items: center; white-space: nowrap; }
.dispatch-v3-event-scroll, .dispatch-v3-waybill-panel, .dispatch-v3-extended { min-height: 0; height: 0; flex: 1 1 0; overflow-y: auto; overflow-x: hidden; padding: 12px 16px 16px; overscroll-behavior: contain; }
.dispatch-v3-event-group { padding-bottom: 10px; }
.dispatch-v3-event-heading { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; color: #172b4d; font-size: 12px; }
.dispatch-v3-event-heading time { color: #64748b; font-size: 11px; }
.dispatch-v3-event-card { margin: 6px 0 0; padding: 9px 10px; border: 1px solid #e5eaf2; border-radius: 7px; background: #fff; }
.dispatch-v3-event-card { cursor: pointer; }
.dispatch-v3-event-card:hover, .dispatch-v3-event-card.is-selected { border-color: #2563eb; background: #eff6ff; }
.dispatch-v3-event-card > div { display: flex; justify-content: space-between; gap: 6px; }
.dispatch-v3-event-card strong { font-size: 12px; }
.dispatch-v3-event-card time, .dispatch-v3-event-card p, .dispatch-v3-event-card small { color: #64748b; font-size: 11px; }
.dispatch-v3-event-card p { margin: 5px 0 3px; }
.dispatch-v3-event-card small { line-height: 18px; }
.dispatch-v3-event-card.risk-high { border-color: #f4cece; background: #fffafa; }
.dispatch-v3-event-card.risk-low { border-color: #f4e0b9; background: #fffdf7; }
.dispatch-v3-waybill-panel label { display: flex; flex-direction: column; gap: 5px; color: #64748b; font-size: 11px; }
.dispatch-v3-waybill-panel input { height: 34px; padding: 5px 8px; border: 1px solid #cfd9dc; border-radius: 4px; }
.dispatch-v3-waybill-list article { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 0; border-bottom: 1px solid #edf0f0; }
.dispatch-v3-waybill-list strong { display: block; font-size: 12px; }
.dispatch-v3-waybill-list span { color: #64748b; font-size: 11px; }
.dispatch-v3-waybill-list p { margin: 4px 0 0; color: #64748b; font-size: 11px; }
.dispatch-v3-waybill-list button { flex-shrink: 0; padding: 0; border: 0; color: #2563eb; background: transparent; cursor: pointer; }
.dispatch-v3-extended { display: grid; grid-template-columns: 1fr 1fr; align-content: start; gap: 12px 16px; }
.dispatch-v3-extended div { min-width: 0; }
.dispatch-v3-extended dt { color: #64748b; font-size: 11px; }
.dispatch-v3-extended dd { margin: 3px 0 0; overflow-wrap: anywhere; color: #172b4d; font-size: 12px; font-weight: 500; }
@media (max-width: 900px) {
  .dispatch-v3-detail-page { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(420px, 1fr) 460px; overflow: auto; }
  .dispatch-v3-events-panel { border-top: 1px solid #deded9; border-left: 0; }
  .dispatch-v3-map-stage { min-height: 0; }
}

:deep(.dispatch-map-callout) { position: relative; width: 80px; height: 80px; pointer-events: none; }
:deep(.dispatch-map-anchor) { position: absolute; left: 36px; top: 36px; width: 8px; height: 8px; border: 2px solid #fff; border-radius: 50%; background: #253649; box-shadow: 0 0 0 1px #253649; }
:deep(.dispatch-map-leader) { position: absolute; height: 1.5px; background: #344a5b; transform-origin: left center; box-shadow: 0 1px 2px #fff; }
:deep(.dispatch-map-callout .dispatch-map-pin) { position: absolute; display: block; width: 26px; height: 26px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 2px 8px #152c3b55; color: #fff; text-align: center; font-size: 12px; font-weight: 700; line-height: 22px; pointer-events: auto; }
:deep(.dispatch-truck-marker) { position: relative; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border: 2px solid; border-radius: 8px; background: #fff; box-shadow: 0 2px 8px #152c3b55; pointer-events: auto; }
:deep(.dispatch-vehicle-address) { position: absolute; top: -7px; left: 44px; display: flex; flex-direction: column; gap: 1px; width: max-content; max-width: 190px; padding: 5px 7px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; box-shadow: 0 2px 7px #152c3b33; color: #334155; font-size: 11px; line-height: 15px; }
:deep(.dispatch-vehicle-address strong) { color: #1765a3; font-size: 11px; }
:deep(.dispatch-vehicle-address span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.dispatch-map-info) { min-width: 190px; max-width: 285px; color: #203648; font-size: 12px; }
:deep(.dispatch-map-info strong) { display: block; margin-bottom: 6px; color: #203648; font-size: 13px; }
:deep(.dispatch-map-info p) { margin: 4px 0; overflow-wrap: anywhere; color: #5f6d7c; line-height: 1.5; }
</style>
