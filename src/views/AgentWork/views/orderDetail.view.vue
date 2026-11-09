<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { agentWorkData } from '@/pinia/agentWork';
import { convertGpsCoordinates, loadAMap, resolveWarehouseCoordinates, searchDrivingRoute } from '@/utils/amap';
import type { Order, TimelineEvent, TransportStop } from '../interface';
import { demoOrderSamples, demoRoadPath, journeyStops, demoTimeFields, evaluateDemoTimes } from '../demoJourneys';
import { associateOrderTrajectory } from '../orderTrajectory';
import { formatTelemetryTime } from '../companyTelemetry';
import { drawTelemetry, prepareTelemetryMap } from '../companyTelemetryMap';
import { badgeToneClass, tableRiskPillClass, waybillColor } from '../utils';

const store = agentWorkData();
const route = useRoute();
const isDispatch = computed(() => typeof route.query.dispatch === 'string');
const members = computed(() => {
  if (isDispatch.value) return store.ordersSeed.filter(o => o.dispatchId === route.query.dispatch);
  const order = store.ordersSeed.find(o => o.id === route.query.order) ?? store.currentDetailOrder;
  return order ? [order] : [];
});
const title = computed(() => String(isDispatch.value ? route.query.dispatch : members.value[0]?.id ?? ''));
const stops = computed(() => {
  const all = members.value.flatMap(o => o.stops ?? []);
  const unique = [...new Map(all.map(stop => [stop.id, stop])).values()];
  return [...unique.filter(s => s.kind === '装货'), ...unique.filter(s => s.kind === '卸货')];
});
const risks = computed(() => members.value.filter(o => o.risk !== '无风险'));
const selectedWaybill = ref('');
const detailScrollRef = ref<HTMLElement>();
const editingDemoTimes = ref('');
const orderTracks = computed(() => new Map(members.value.map(order => [order.id, associateOrderTrajectory(order, order.telemetry)])));
const stopLayers: { marker: AMap.Marker; orderIds: string[] }[] = [];
function fitAllStops() { map?.setFitView(undefined, false, [90, 110, 90, 110]); }
const orderColors = computed(() => new Map(members.value.map((order, index) => [order.id, waybillColor(order.risk, index)])));
function timelinessChecks(order: Order) {
  if (order.demoTimes) {
    const result = evaluateDemoTimes(order.demoTimes);
    return [
      { name: '晚发', risk: result.departureRisk, minutes: result.departure, planned: order.demoTimes['计划发车时间'], actual: order.demoTimes['发车时间'] },
      { name: '晚到', risk: result.arrivalRisk, minutes: result.arrival, planned: order.demoTimes['预约送货时间'], actual: order.demoTimes['到货确认时间'] },
    ].map(check => ({ ...check, status: !Number.isFinite(check.minutes) ? '待核实' : check.minutes > 0 ? `延误${Math.round(check.minutes)}分钟` : '准时', evidence: !Number.isFinite(check.minutes) ? result.issue : '' }));
  }
  return ['晚发', '晚到'].map(name => {
    const check = order.verification?.items.find(item => item.name === name);
    return { name, risk: check?.risk || '待核实', status: check?.status || '待核实', planned: '', actual: '', evidence: check?.evidence || '暂无时效核验结果' };
  });
}
function primaryChecks(order: Order) {
  const timing = timelinessChecks(order);
  const original = order.demoTrip ? [] : order.verification?.items || [];
  const parking = original.find(check => ['超时停车', '停车超时'].includes(check.name));
  const deviation = original.find(check => ['线路偏离', '线路偏移'].includes(check.name));
  const wait = order.simulation?.stayMinutes;
  const common = { planned: '', actual: '' };
  const parkingCheck = parking ? { ...common, ...parking } : wait != null ? {
    ...common, name: '超时停车', status: wait > 120 ? `停留${wait}分钟` : '未超时', risk: wait > 180 ? '高风险' : wait > 120 ? '低风险' : '无风险', evidence: '模拟监控停留时长，阈值120分钟。',
  } : { ...common, name: '超时停车', status: '待核实', risk: '待核实', evidence: '暂无独立停车时段证据；签到至发车包含装卸作业，不能直接等同停车等待。' };
  const routeCheck = deviation ? { ...common, ...deviation, name: '线路偏移' } : { ...common, name: '线路偏移', status: '待核实', risk: '待核实', evidence: order.demoTrip ? '当前为完整演示轨迹，尚未配置独立线路偏移判定结果。' : '缺少已确认的线路基准，暂无法判定是否偏移。' };
  return [...timing, parkingCheck, routeCheck];
}
function colorFor(order: Order) { return orderColors.value.get(order.id) ?? '#15803d'; }
const routeSegments: { line: AMap.Polyline; orderIds: string[]; color: string; weight?: number }[] = [];
function focusWaybill(id: string, toggle = true) {
  selectedWaybill.value = toggle && selectedWaybill.value === id ? '' : id;
  routeSegments.forEach(({ line, orderIds, color, weight }) => {
    const active = orderIds.includes(selectedWaybill.value);
    line.setOptions({
      strokeColor: active ? orderColors.value.get(selectedWaybill.value) : color,
      strokeOpacity: !selectedWaybill.value || active ? 0.95 : 0.15,
      strokeWeight: active ? 8 : weight ?? 5,
      zIndex: active ? 90 : 50,
    });
  });
  stopLayers.forEach(({ marker, orderIds }) => selectedWaybill.value && !orderIds.includes(selectedWaybill.value) ? marker.hide() : marker.show());
  const lines = routeSegments.filter(s => !selectedWaybill.value || s.orderIds.includes(selectedWaybill.value)).map(s => s.line);
  if (map && lines.length) map.setFitView([...lines, ...stopLayers.filter(s => !selectedWaybill.value || s.orderIds.includes(selectedWaybill.value)).map(s => s.marker)], false, [90, 110, 90, 110]);
}
async function quickSelectWaybill(id: string) {
  focusWaybill(id, false);
  await nextTick();
  const container = detailScrollRef.value;
  if (!container) return;
  const target = id ? container.querySelector<HTMLElement>(`[data-waybill-id="${CSS.escape(id)}"]`) : undefined;
  const top = target ? container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 12 : 0;
  container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// Even a single waybill follows the vehicle's shared dispatch route through intermediate stops.
const vehicleStops = computed(() => {
  const dispatchId = members.value[0]?.dispatchId;
  const orders = dispatchId ? store.ordersSeed.filter(o => o.dispatchId === dispatchId) : members.value;
  const unique = [...new Map(orders.flatMap(o => o.stops ?? []).map(stop => [stop.id, stop])).values()];
  return [...unique.filter(s => s.kind === '装货'), ...unique.filter(s => s.kind === '卸货')];
});
const routeFailures = ref<string[]>([]);
const mapRef = ref<HTMLDivElement>();
const mapError = ref('');
const routeInfo = ref('正在加载路线');
let map: AMap.Map | undefined;
let disposed = false;
let generation = 0;
function eventCardClass(event: TimelineEvent) {
  if (event.type === 'risk') return 'border-purple-200 bg-purple-50';
  if (event.type === 'stop' && store.detailView === 'agent' && event.agentTone === 'green') return 'border-emerald-200 bg-emerald-50';
  if (event.type === 'stop') return 'border-red-200 bg-red-50';
  return 'border-[#deded9] bg-white';
}


function infoContent(stop: TransportStop) {
  const el = document.createElement('div');
  el.textContent = `${stop.kind}地：${stop.address || stop.name}`;
  return el;
}
function addTelemetryStop(amap: typeof AMap, instance: AMap.Map, stop: TransportStop, coordinate: [number, number]) {
  const related = members.value.map((order, index) => ({ order, index })).filter(({ order }) => order.stops?.some(s => s.id === stop.id));
  const index = stops.value.findIndex(s => s.id === stop.id);
  const numbers = related.map(item => item.index + 1).join('/');
  const colors = related.map(({ order }) => colorFor(order));
  const el = document.createElement('div');
  el.textContent = `${numbers}${stop.kind === '装货' ? '装' : '卸'}`;
  Object.assign(el.style, { fontSize: '11px', lineHeight: '16px', padding: '2px 4px', borderRadius: '4px', border: '2px solid white', background: colors.length > 1 ? `linear-gradient(90deg, ${colors.join(',')})` : colors[0] || '#475569', color: 'white', whiteSpace: 'nowrap', boxShadow: '0 1px 4px #0003' });
  const marker = new amap.Marker({ position: coordinate, content: el, anchor: 'center', title: stop.address || stop.name, zIndex: 180 + index, offset: new amap.Pixel(0, index % 2 ? 10 : -10) });
  const label = document.createElement('div');
  label.textContent = `${stop.kind === '装货' ? '提货' : '送货'}：${stop.name}`;
  label.title = stop.address || stop.name;
  Object.assign(label.style, { maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '11px', lineHeight: '18px' });
  marker.setLabel({ content: label.outerHTML, direction: index % 2 ? 'bottom' : 'top', offset: new amap.Pixel(0, index % 2 ? 4 : -4) });
  marker.on('click', () => {
    const popup = infoContent(stop);
    const text = document.createElement('p'); text.textContent = `关联运单：${related.map(({ order }) => order.id).join('、')}`;
    popup.append(text);
    new amap.InfoWindow({ content: popup }).open(instance, coordinate);
  });
  instance.add(marker);
  stopLayers.push({ marker, orderIds: related.map(item => item.order.id) });
}

async function initMap() {
  const token = ++generation;
  map?.destroy(); map = undefined; routeSegments.splice(0); stopLayers.splice(0); selectedWaybill.value = ''; mapError.value = '';
  routeInfo.value = '正在加载路线'; routeFailures.value = [];
  if (store.demoJourneysEnabled) await store.ensureDemoJourneys();
  await nextTick();
  if (!stops.value.length) { mapError.value = '未找到关联站点'; return; }
  try {
    if (store.demoJourneysEnabled && members.value[0]?.demoTrip) {
      const amap = await loadAMap(['AMap.ToolBar', 'AMap.Geocoder', 'AMap.Driving']);
      const dispatch = members.value[0]?.dispatchId;
      const group = store.ordersSeed.filter(o => o.dispatchId === dispatch);
      const stations = journeyStops(group);
      const coordinates = await resolveWarehouseCoordinates(amap, stations);
      if (disposed || token !== generation || !mapRef.value) return;
      const instance = new amap.Map(mapRef.value, { center: coordinates[0], zoom: 7, mapStyle: 'amap://styles/whitesmoke' });
      map = instance;
      instance.addControl(new amap.ToolBar({ position: 'RB' }));
      const paths: [number, number][][] = [];
      let approximate = false;
      for (let i = 0; i < coordinates.length - 1; i++) {
        if (disposed || token !== generation) return;
        const endpoints = [coordinates[i]!, coordinates[i + 1]!];
        routeInfo.value = `正在生成完整演示轨迹 ${i + 1}/${coordinates.length - 1}段`;
        const road = await demoRoadPath(endpoints[0]!, endpoints[1]!, () => searchDrivingRoute(amap, endpoints));
        paths.push(road.path);
        approximate ||= road.approximate;
      }
      if (disposed || token !== generation) return;
      members.value.forEach((order, index) => {
        const samples = demoOrderSamples(order, group, stations, paths);
        const path = samples.map(p => p.coordinate);
        const stored = store.ordersSeed.find(o => o.id === order.id);
        if (stored) stored.demoGps = samples;
        const color = colorFor(order);
        const weight = 4 + (members.value.length - index - 1) * 3;
        const line = new amap.Polyline({ path, strokeColor: color, strokeWeight: weight, strokeOpacity: 0.95, zIndex: 50 + index, isOutline: true, outlineColor: '#fff', borderWeight: 1, showDir: true });
        instance.add(line);
        line.on('click', () => focusWaybill(order.id));
        routeSegments.push({ line, orderIds: [order.id], color, weight });
      });
      for (const stop of stops.value) addTelemetryStop(amap, instance, stop, coordinates[stations.findIndex(s => s.id === stop.id)]!);
      instance.setFitView(undefined, false, [90, 110, 90, 110]);
      routeInfo.value = `完整演示轨迹 · ${members.value.length}张运单均覆盖各自提货至送货区段${approximate ? ' · 部分道路服务不可用，使用模拟连线' : ''}`;
      return;
    }
    const telemetry = members.value[0]?.telemetry;
    if (store.realTelemetryEnabled && telemetry) {
      const amap = await loadAMap(['AMap.ToolBar', 'AMap.Geocoder']);
      if (disposed || token !== generation || !mapRef.value) return;
      const instance = new amap.Map(mapRef.value, { zoom: 7, mapStyle: 'amap://styles/whitesmoke' });
      map = instance;
      instance.addControl(new amap.ToolBar({ position: 'RB' }));
      for (const [index, order] of members.value.entries()) {
        const associated = orderTracks.value.get(order.id)!;
        if (!associated.telemetry || !associated.count) continue;
        const prepared = await prepareTelemetryMap(amap, associated.telemetry, () => disposed || token !== generation);
        if (disposed || token !== generation) return;
        const weight = 4 + (members.value.length - index - 1) * 3;
        const color = colorFor(order);
        const lines = drawTelemetry(amap, instance, associated.telemetry, prepared, color, { weight, zIndex: 50 + index });
        lines.forEach(line => {
          routeSegments.push({ line, orderIds: [order.id], color, weight });
          line.on('click', () => focusWaybill(order.id));
        });
      }
      routeInfo.value = `已按运单车牌、运输时间分别匹配轨迹；${members.value.filter(o => orderTracks.value.get(o.id)?.count).length}/${members.value.length}张运单匹配到定位点。缺少实际起止时间的关联待核实。`;
      const plannedStops = new Map<string, [number, number]>();
      // Resolve independently and include every successfully located stop in the final viewport.
      for (const stop of stops.value) {
        try {
          const coordinates = await resolveWarehouseCoordinates(amap, [stop]);
          if (disposed || token !== generation) return;
          addTelemetryStop(amap, instance, stop, coordinates[0]!);
          plannedStops.set(stop.id, coordinates[0]!);
          instance.setFitView(undefined, false, [90, 110, 90, 110]);
        } catch {
          if (disposed || token !== generation) return;
          routeFailures.value.push(`${stop.kind}地地址未能定位：${stop.address || stop.name}`);
        }
      }
      // Use the addresses already resolved for this map to run company fence checks.
      for (const order of members.value) {
        const originStop = order.stops?.find(s => s.kind === '装货');
        const destinationStop = order.stops?.find(s => s.kind === '卸货');
        const origin = originStop && plannedStops.get(originStop.id);
        const destination = destinationStop && plannedStops.get(destinationStop.id);
        if (origin || destination) void store.verifyOrderRisk(order.id, { origin, destination }).catch(() => {});
      }
      instance.setFitView(undefined, false, [90, 110, 90, 110]);
      return;
    }
    const simulated = members.value[0]?.simulation;
    const amap = await loadAMap(simulated ? ['AMap.ToolBar'] : ['AMap.ToolBar', 'AMap.Geocoder']);
    const points = simulated ? vehicleStops.value.map(s => s.coordinate!) : members.value.some(o => o.customerRecord)
      ? await resolveWarehouseCoordinates(amap, vehicleStops.value)
      : await convertGpsCoordinates(amap, vehicleStops.value.map(s => s.coordinate!));
    if (disposed || token !== generation || !mapRef.value) return;
    map = new amap.Map(mapRef.value, { center: points[0], zoom: 7, mapStyle: 'amap://styles/whitesmoke' });
    map.addControl(new amap.ToolBar({ position: 'RB' }));
    const pointLookup = new Map(vehicleStops.value.map((stop, index) => [stop.id, points[index]!]));
    const shownStops = new Set<string>();
    members.value.forEach((order, orderIndex) => {
      const color = colorFor(order);
      order.stops?.forEach((stop) => {
        if (shownStops.has(stop.id)) return;
        shownStops.add(stop.id);
        const content = document.createElement('div');
        content.textContent = `${orderIndex + 1}${stop.kind === '装货' ? '装' : '卸'}`;
        Object.assign(content.style, { whiteSpace: 'nowrap', width: '28px', fontSize: '11px', lineHeight: '16px', textAlign: 'center', background: color, color: '#fff', border: '2px solid white', borderRadius: '4px', padding: '2px 3px', fontWeight: 'bold', boxShadow: '0 2px 6px #0004' });
        const marker = new amap.Marker({ position: pointLookup.get(stop.id), content, title: `${order.id} · ${stop.name}`, anchor: 'center' });
        // Full warehouse addresses stay in the click popup to avoid covering adjacent stops.
        marker.setLabel({ content: stop.kind === '装货' ? '提货点' : `送货点${orderIndex + 1}`, direction: stop.kind === '装货' ? 'top' : 'bottom', offset: new amap.Pixel(0, stop.kind === '装货' ? -5 : 5) });
        marker.on('click', () => {
          focusWaybill(order.id);
          const popup = infoContent(stop);
          const summary = document.createElement('p');
          summary.textContent = `${order.id} · ${order.risk} · ${order.issue}`;
          popup.append(summary);
          new amap.InfoWindow({ content: popup }).open(map!, pointLookup.get(stop.id)!);
        });
        map!.add(marker);
      });
    });
    if (simulated) {
      // These coordinates and GPS samples are generated locally, never customer telemetry.
      const color = members.value.some(o => o.risk === '高风险') ? '#dc2626' : members.value.some(o => o.risk === '中风险') ? '#ea580c' : '#15803d';
      map.add(new amap.Polyline({ path: simulated.track, strokeColor: color, strokeWeight: 6, showDir: true, isOutline: true, outlineColor: '#ffffff', borderWeight: 1 }));
      map.setFitView(undefined, false, [60, 60, 60, 60]);
      routeInfo.value = '模拟GPS轨迹 · 仓库坐标为模拟位置';
      return;
    }
    map.setFitView(undefined, false, [70, 70, 70, 70]);
    routeInfo.value = '暂无可关联的实际GPS轨迹，仅展示装卸货点';

  } catch (error) { if (disposed || token !== generation) return; routeInfo.value = '地图未就绪'; mapError.value = error instanceof Error ? error.message : '地图加载失败，请检查网络与高德配置'; }
}
let simulationTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  if (store.demoJourneysEnabled) void store.ensureDemoJourneys();
  else if (store.realTelemetryEnabled && !store.telemetryCheckedAt) void store.refreshRealTelemetry();
  initMap();
  simulationTimer = setInterval(() => {
    if (store.realTelemetryEnabled && Date.now() - Date.parse(store.telemetryCheckedAt || '1970-01-01') >= 300000) void store.refreshRealTelemetry();
    else if (store.simulationEnabled) store.refreshSimulatedLocations();
  }, 30000);
});
watch(() => route.fullPath, initMap);
watch(() => members.value[0]?.demoTrip?.endTime, initMap);
watch(() => members.value[0]?.simulation?.timestamp, initMap);
watch(() => members.value[0]?.telemetry?.queriedAt, initMap);
watch(() => members.value.map(o => o.risk).join(','), initMap);
onBeforeUnmount(() => { if (simulationTimer) clearInterval(simulationTimer); disposed = true; map?.destroy(); map = undefined; });
</script>

<template>
  <div class="order-map-detail flex h-full min-w-0 flex-col gap-3 overflow-auto">
    <section class="rounded-md border border-[#deded9] bg-white p-4">
      <h1 class="text-sm font-semibold">{{ isDispatch ? '排线单详情 · 多装多卸' : '运单详情 · 单装单卸' }}</h1>
      <div class="mt-3 flex flex-wrap gap-5 text-sm">
        <span>{{ isDispatch ? '排线单' : '运单' }}：{{ title }}</span>
        <span>车辆：{{ [...new Set(members.map(o => o.plate))].join('、') }}</span>
        <span>运输方式：{{ [...new Set(members.map(o => o.transportMode))].join('、') }}</span>
        <span>{{ members.length }} 张运单 · {{ stops.filter(s => s.kind === '装货').length }} 装 {{ stops.filter(s => s.kind === '卸货').length }} 卸</span>
        <span class="text-orange-700">{{ risks.length }} 张预警运单</span>
      </div>
    </section>
    <div class="grid min-h-[600px] min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section class="relative flex min-w-0 min-h-[460px] flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
        <h2 class="border-b p-3 text-sm font-semibold">{{ isDispatch ? '排线单多装多卸线路' : '运单装卸线路' }}</h2>
        <div class="p-3 text-xs text-slate-600">{{ stops.map(s => s.name).join(' → ') }}<div class="mt-1">{{ routeInfo }}</div></div>
        <div v-if="mapError" role="alert" class="m-3 rounded-md bg-orange-50 p-3 text-sm text-orange-800">{{ mapError }}</div>
        <div v-if="routeFailures.length" role="alert" class="m-3 rounded-md bg-orange-50 p-3 text-xs text-orange-800"><div v-for="failure in routeFailures" :key="failure">{{ failure }}</div><button class="mt-2 rounded border px-3 py-1" @click="initMap">重新加载线路</button></div>
        <div class="flex flex-wrap gap-2 border-y p-3" role="group" aria-label="运单线路图例">
          <button v-for="(order, index) in members" :key="order.id" class="max-w-full break-all rounded-md border px-3 py-2 text-left text-xs" :style="{ borderColor: colorFor(order), opacity: selectedWaybill && selectedWaybill !== order.id ? 0.45 : 1 }" :aria-pressed="selectedWaybill === order.id" @click="focusWaybill(order.id)">
            <span class="mr-1 inline-block h-2.5 w-5 rounded-sm" :style="{ background: colorFor(order) }"></span>{{ index + 1 }} · {{ order.id }} · {{ order.risk }}
          </button>
          <span class="w-full text-xs text-slate-500">{{ members[0]?.simulation ? '模拟GPS按排线车辆生成，同排线单共用位置。红色为高风险、橘色为其他风险、绿色为无风险/低风险。' : '轨迹按运单分别匹配，点击图例仅查看该运单的装卸点与运输区段。红色为高风险、橘色为其他风险、绿色为无风险/低风险，灰色为待核实。' }}</span>
        </div>
        <div v-if="members[0]?.telemetry" class="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs text-slate-600">
          <span>{{ store.demoJourneysEnabled ? '实线：本运单完整模拟行驶轨迹' : '仅展示本运单运输区间内的实际GPS轨迹，关联状态见右侧' }}</span>
          <button class="rounded border px-2 py-1" @click="fitAllStops">查看全部站点</button>
        </div>
        <div ref="mapRef" class="min-h-[400px] flex-1"></div>
      </section>
      <section class="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
        <div v-if="isDispatch" class="shrink-0 border-b border-[#deded9] bg-white px-4 py-3" role="group" aria-label="运单快速定位">
          <div class="mb-2 flex items-center justify-between gap-2 text-xs"><span class="font-semibold text-slate-700">运单快速定位</span><button class="rounded border px-2 py-1" :class="!selectedWaybill ? 'border-slate-900 bg-slate-900 text-white' : 'text-slate-600'" :aria-pressed="!selectedWaybill" @click="quickSelectWaybill('')">全部运单</button></div>
          <div class="flex flex-wrap gap-2">
            <button v-for="(order, index) in members" :key="order.id" type="button" class="flex min-w-0 max-w-full items-center gap-1.5 rounded border px-2 py-1.5 text-xs transition-colors" :class="selectedWaybill === order.id ? 'bg-slate-100 font-semibold ring-1' : 'bg-white hover:bg-slate-50'" :style="{ borderColor: colorFor(order), '--tw-ring-color': colorFor(order) }" :aria-label="`定位运单 ${order.id}`" :aria-pressed="selectedWaybill === order.id" :title="`${order.id} · ${order.route} · ${order.risk}`" @click="quickSelectWaybill(order.id)">
              <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: colorFor(order) }"></span><span class="truncate">{{ index + 1 }} · {{ order.id }}</span>
            </button>
          </div>
        </div>
        <div ref="detailScrollRef" class="min-h-0 flex-1 overflow-auto p-4">
        <h2 class="text-sm font-semibold">装卸站点</h2>
        <ol class="my-3 space-y-2"><li v-for="(stop, i) in stops" :key="stop.id" class="border-l-2 border-slate-300 pl-3 text-sm"><span class="text-slate-500">{{ i + 1 }} · {{ stop.kind }}地</span><div class="break-words">{{ stop.name }}</div><div v-if="stop.address && stop.address !== stop.name" class="mt-1 break-words text-xs leading-5 text-slate-600">{{ stop.address }}</div></li></ol>
        <div v-if="members.some(o => o.customerRecord)" class="mt-3 rounded border bg-blue-50 p-3 text-xs leading-6">{{ store.demoJourneysEnabled ? '完整轨迹演示：起止时间、行驶轨迹为模拟生成；同排线单沿同一车辆线路展示各自装卸区段。客户原始字段与历史核验结果保留。' : store.realTelemetryEnabled ? '地图按每张运单的车牌、运输区间及装卸货点关联展示。缺少实际起止时间时，按计划区间匹配并标注待核实。' : members[0]?.simulation ? '模拟监控预览：定位、轨迹、仓库坐标与异常均为本地生成，原始单据保留。' : '客户快照：未接入实时定位；地图仅展示装卸货点。' }}</div>
        <h2 class="mt-5 text-sm font-semibold">{{ isDispatch ? '关联运单与预警' : '运单预警' }}</h2>
        <div v-for="order in members" :key="order.id" :data-waybill-id="order.id" class="mt-3 border-t border-l-4 pl-3 pt-3 text-sm" :class="selectedWaybill === order.id ? 'bg-slate-50 ring-1 ring-slate-200' : ''" :style="{ borderLeftColor: colorFor(order) }">
          <div class="flex flex-wrap items-center justify-between gap-2"><span class="font-semibold">{{ order.id }}</span><span :class="tableRiskPillClass(order.risk)">{{ order.risk }}</span></div>
          <div class="mt-2">{{ order.route }}</div><div class="mt-1 text-slate-500">{{ order.status }} · {{ order.transportMode }} · {{ order.carrier }}</div>
          <div class="mt-3" role="group" :aria-label="`${order.id}-时效监控`">
            <div class="mb-2 flex items-center justify-between text-sm font-semibold"><span>运输异常重点监控</span><span class="text-xs font-normal text-slate-500">{{ order.demoTimes ? '测试时间判定' : '运输时效核验' }}</span></div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div v-for="check in primaryChecks(order)" :key="check.name" class="rounded border p-3" :class="check.risk === '高风险' ? 'border-red-300 bg-red-50' : check.risk === '低风险' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'">
                <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold">{{ check.name }}</span><span :class="tableRiskPillClass(check.risk)">{{ check.risk }}</span></div>
                <div class="my-2 text-lg font-bold" :class="check.risk === '高风险' ? 'text-red-700' : check.risk === '低风险' ? 'text-emerald-700' : 'text-slate-800'">{{ check.status }}</div>
                <div v-if="check.planned" class="text-xs leading-6 text-slate-600">计划：{{ check.planned }}<br />实际：{{ check.actual }}</div>
                <div v-if="check.evidence" class="text-xs leading-6 text-slate-600">{{ check.evidence }}</div>
              </div>
            </div>
          </div>
          <div v-if="order.demoTrip" class="mt-3 border-y py-2 text-xs leading-6">
            <div class="font-semibold">演示运输时间与轨迹</div>
            <div>模拟起运：{{ formatTelemetryTime(order.demoTrip.startTime) }}</div>
            <div>模拟送达：{{ formatTelemetryTime(order.demoTrip.endTime) }}</div>
            <div>轨迹范围：本单提货点至送货点，全程连续；同排线单共享车辆线路。</div><div>模拟定位点：{{ order.demoGps?.length || 0 }}个</div>
            <div class="text-slate-500">原始起运字段：{{ order.demoTrip.originalStartTime }}；其余原表时间见下方。</div>
          </div>
          <details v-if="order.verification" class="mt-3 border-y py-2 text-xs leading-6 text-slate-500">
            <summary class="cursor-pointer">{{ order.demoTrip ? '客户原始核验（查看历史结果）' : '其他核验信息' }}</summary>
            <div class="mt-2">{{ order.demoTrip ? '以下为客户原始单据核验，不用于模拟时段。' : '' }} 核验时间：{{ formatTelemetryTime(order.verification.checkedAt) }}</div>
            <div v-for="check in order.verification.items.filter(item => order.demoTrip || !['晚发','晚到','超时停车','停车超时','线路偏离','线路偏移'].includes(item.name))" :key="check.name" class="mt-2">
              <span>{{ check.name }}：{{ check.status }}</span>
              <div>{{ check.evidence }}</div>
              <div class="text-slate-400">判定口径：{{ check.rule }}</div>
            </div>
          </details>
          <div v-if="order.telemetry" class="mt-2 rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-6">
            <div class="font-semibold">本运单轨迹：{{ order.id }}</div>
            <div>{{ orderTracks.get(order.id)?.reason }}</div>
            <div v-if="orderTracks.get(order.id)?.start">关联区间：{{ formatTelemetryTime(orderTracks.get(order.id)?.start) }} 至 {{ formatTelemetryTime(orderTracks.get(order.id)?.end) }}</div>
            <div>本单匹配定位点：{{ orderTracks.get(order.id)?.count || 0 }} · 装卸货点使用本运单数据</div>
            <div>车辆数据查询区间：{{ formatTelemetryTime(order.telemetry.start) }} 至 {{ formatTelemetryTime(order.telemetry.end) }}</div>
            <div>车辆数据：{{ order.telemetry.track.length }}点 <span v-if="order.telemetry.trackError" class="text-orange-700">{{ order.telemetry.trackError }}</span></div>
            <div>轨迹仅用于本单运输区间复核，不据单个轨迹点自动判定到离场。</div>
          </div>
          <div v-if="order.simulation" class="mt-2 rounded border border-orange-100 bg-orange-50 p-3 text-xs leading-6"><div class="font-semibold">模拟监控：{{ order.simulation.state }}</div><div>定位时间：{{ order.simulation.timestamp }}</div><div>速度：{{ order.simulation.speed }} km/h · 模拟GPS点：{{ order.simulation.track.length }}</div><div>当前位置：{{ order.simulation.coordinate.map(v => v.toFixed(5)).join(', ') }}</div><div v-if="order.simulation.arrivedAt">模拟到场：{{ order.simulation.arrivedAt }} · 在场{{ order.simulation.stayMinutes }}分钟</div></div>
          <div v-if="order.customerRecord" class="mt-2 text-xs leading-6 text-slate-600">
            <div>原表行号：{{ order.customerRecord.sourceRow }} · 需求单：{{ order.customerRecord.fields['需求单号'] }}</div>
            <div>ASN：{{ order.customerRecord.fields['ASN单号'] || '未提供' }} · 商品数：{{ order.customerRecord.fields['商品总数'] }}</div>
            <div>提货地址：{{ order.customerRecord.fields['发货地址'] }}</div><div>送货地址：{{ order.customerRecord.fields['收货地址'] }}</div>
            <div v-if="order.demoTimes" class="my-2 border-y py-2">
              <div class="mb-1 flex items-center justify-between gap-2 font-semibold"><span>测试时间数据</span><button class="rounded border px-2 py-1 font-normal" @click="editingDemoTimes = editingDemoTimes === order.id ? '' : order.id">{{ editingDemoTimes === order.id ? '收起编辑' : '调整计划时间' }}</button></div>
              <div v-for="field in demoTimeFields" :key="field" class="leading-7">
                <span>{{ field }}：</span>
                <input v-if="editingDemoTimes === order.id && ['计划发车时间','预约送货时间'].includes(field)" type="datetime-local" :aria-label="`${order.id}-${field}`" :value="order.demoTimes[field]?.replace(' ', 'T').slice(0,16)" class="rounded border px-1 text-xs" @change="store.updateDemoPlanTime(order.id, field, ($event.target as HTMLInputElement).value)" />
                <span v-else>{{ order.demoTimes[field] }}</span>
              </div>
              <div class="mt-2 text-slate-500">晚发＝发车时间－计划发车时间；晚到＝到货确认时间－预约送货时间。≤0分钟无风险，1～60分钟低风险，超过60分钟高风险，取较高等级。</div>
            </div>
            <details v-if="order.demoTimes" class="mt-2 text-slate-500"><summary class="cursor-pointer">客户原始时间（保留）</summary><div v-for="field in demoTimeFields" :key="field">{{ field }}：{{ order.customerRecord.fields[field] || '未提供' }}</div></details>
            <template v-else><div v-for="field in demoTimeFields" :key="field">{{ field }}：{{ order.customerRecord.fields[field] || '未提供' }}</div></template>
          </div>
          <div class="mt-2">{{ order.issue }}</div><div class="mt-1 text-xs text-slate-500">{{ order.source }} · {{ order.updated }}</div>
        </div>
        <template v-if="members.some(o => o.id === 'WB20260509001')">
          <div class="mt-5 flex items-center justify-between text-sm font-semibold">事件 Timeline<button class="rounded-md border p-2 text-xs" @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal">{{ store.detailOnlyAbnormal ? '显示全部事件' : '只看异常事件' }}</button></div>
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
        </div>        </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
:global(html:has(.order-map-detail)), :global(body:has(.order-map-detail)) { min-width: 0; }

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
