import { dispatchId, stops, trackCoverage, transferEvents, transferStops, vehiclePlates, waybills, type DispatchEvent, type DispatchStop, type DispatchWaybill, type DispatchStatus } from './dispatchDemo';
import { usePhase1 } from '@/pinia/phase1';
import { dateText, stateNames } from '@/views/Phase1/catalog';
import type { P1Order } from '@/views/AgentWork/interface';

export type ScenarioStatus = DispatchStatus;
export type ScenarioRisk = '高风险' | '低风险' | '无风险';
export type ScenarioWaybill = Omit<DispatchWaybill, 'status'> & { status: ScenarioStatus };
export type ScenarioStop = DispatchStop & { city: string };
export interface ScenarioVehiclePosition { plate: string; place: string; speedKmh: number; at: string; coordinate: [number, number]; current?: boolean }

export interface DispatchScenario {
  id: string;
  customer: string;
  stops: ScenarioStop[];
  waybills: ScenarioWaybill[];
  plannedStart: string;
  plannedEnd: string;
  status: ScenarioStatus;
  risk: ScenarioRisk;
  coverage: number | null;
  plate: string;
  driver: string;
  carrier: string;
  issue: string;
  source: string;
  events: DispatchEvent[];
  createdAt: string;
  departedAt?: string;
  currentVehicle?: { plate: string; highway: string; place: string; speedKmh: number; at: string; routePercent: number; coordinate: [number, number] };
  currentVehicles?: ScenarioVehiclePosition[];
}

const sharedStops: ScenarioStop[] = stops.map(stop => ({ ...stop, city: stop.role === '提货' ? '平度' : '赤峰' }));

function scenarioWaybills(prefix: string, status: ScenarioStatus): ScenarioWaybill[] {
  return waybills.map((waybill, index) => ({
    ...waybill,
    id: `${prefix}${String(index + 1).padStart(2, '0')}`,
    status: status === '装货中' && waybill.pickupId === 'P2' ? '待发车' : status === '卸货中' && waybill.deliveryId === 'U2' ? '在途' : status,
    upstreamOrderId: `L${prefix.slice(1)}${String(index + 1).padStart(2, '0')}`,
    externalSystemId: `HX-${prefix}${String(index + 1).padStart(2, '0')}`,
  }));
}

function stationEvent(id: string, stopId: string, at: string, count: number): DispatchEvent {
  const stop = sharedStops.find(item => item.id === stopId)!;
  const role = stop.role === '提货' ? '装货' : '卸货';
  return { id, stage: stop.role === '提货' ? 'loading' : 'arrived', title: `${role}点到达`, at, place: stop.name, coordinate: stop.coordinate, kind: 'station', detail: `关联 ${count} 条运单，${at.slice(6)} 到达${role}地。` };
}

const loadingEvents: DispatchEvent[] = [stationEvent('loading-p1', 'P1', '10-30 08:42', 9)];
const transitEvents: DispatchEvent[] = [
  stationEvent('transit-p1', 'P1', '10-29 08:16', 9),
  stationEvent('transit-p2', 'P2', '10-29 09:42', 1),
  { id: 'transit-highway', stage: 'in_transit', title: '驶入高速', at: '10-29 12:18', place: '青岛西收费站', kind: 'highway', routePercent: 18, detail: '经青岛西收费站驶入 G18 荣乌高速。' },
  { id: 'transit-parking', stage: 'in_transit', title: '超时停车', at: '10-29 19:20—20:08', place: '滨州服务区', kind: 'parking', routePercent: 42, risk: '低风险', detail: '停车 48 分钟，轨迹连续。' },
  { id: 'transit-transfer', stage: 'in_transit', title: '换车事件识别', at: '10-30 01:10—01:41', place: '天津附近交会点', kind: 'transfer', routePercent: 63, detail: '鲁B·C6789 → 津A·B7352；停车点相距 82 米，重合 31 分钟。' },
];
const arrivedEvents: DispatchEvent[] = [
  stationEvent('arrived-p1', 'P1', '10-28 06:12', 9),
  stationEvent('arrived-p2', 'P2', '10-28 07:24', 1),
  { id: 'arrived-deviation', stage: 'in_transit', title: '轨迹偏移', at: '10-29 15:12—15:35', place: 'G16 丹锡高速承德段', kind: 'deviation', routePercent: 71, risk: '高风险', detail: '实际轨迹偏离规划路线最大 1.1 公里，持续 23 分钟，超过 500 米阈值。' },
  { id: 'arrived-highway', stage: 'in_transit', title: '驶离高速', at: '10-29 17:50', place: '赤峰南收费站', kind: 'highway', routePercent: 90, detail: '经赤峰南收费站驶离 G16 丹锡高速。' },
  stationEvent('arrived-u1', 'U1', '10-29 18:36', 2),
];

export const scenarioDispatches: DispatchScenario[] = [
  {
    id: 'D26103007101', customer: '青岛海信', stops: sharedStops, waybills: scenarioWaybills('Y01522671', '待发车'),
    plannedStart: '2026-10-30 16:30', plannedEnd: '2026-11-01 11:00', createdAt: '2026-10-29 16:18',
    status: '待发车', risk: '无风险', coverage: null, plate: '鲁B·G6235', driver: '李德全', carrier: '海信物流承运',
    currentVehicle: { plate: '鲁B·G6235', highway: '未上高速', place: '平度冰箱 CDC 厂区库', speedKmh: 0, at: '2026-10-30 15:42', routePercent: 2, coordinate: [120.131809, 36.533777] },
    issue: '无异常', source: '无', events: [],
  },
  {
    id: 'D26103007102', customer: '青岛海信', stops: sharedStops, waybills: scenarioWaybills('Y01522672', '装货中'),
    plannedStart: '2026-10-30 08:30', plannedEnd: '2026-11-01 08:00', createdAt: '2026-10-29 17:45',
    status: '装货中', risk: '无风险', coverage: null, plate: '鲁B·E5298', driver: '孙明', carrier: '海信物流承运',
    currentVehicle: { plate: '鲁B·E5298', highway: '未上高速', place: '平度基地仓储中心宜美仓附近', speedKmh: 18, at: '2026-10-30 09:12', routePercent: 6, coordinate: [120.105753, 36.578279] },
    issue: '无异常', source: '无', events: loadingEvents,
  },
  {
    id: 'D26102907103', customer: '青岛海信', stops: sharedStops, waybills: scenarioWaybills('Y01522673', '在途'),
    plannedStart: '2026-10-29 08:00', plannedEnd: '2026-10-31 11:00', createdAt: '2026-10-28 17:32', departedAt: '2026-10-29 10:10',
    status: '在途', risk: '低风险', coverage: 97.2, plate: '鲁B·C6789、津A·B7352', driver: '王志强、张海涛', carrier: '海信物流承运',
    currentVehicle: { plate: '津A·B7352', highway: 'G16 丹锡高速', place: '承德双滦区高速段', speedKmh: 76, at: '2026-10-30 09:36', routePercent: 78, coordinate: [117.879, 40.998] },
    issue: '滨州服务区超时停车 1 次', source: '规则预警', events: transitEvents,
  },
  {
    id: 'D26102807104', customer: '青岛海信', stops: sharedStops, waybills: scenarioWaybills('Y01522674', '卸货中'),
    plannedStart: '2026-10-28 06:00', plannedEnd: '2026-10-30 11:30', createdAt: '2026-10-27 18:24', departedAt: '2026-10-28 07:40',
    status: '卸货中', risk: '高风险', coverage: 99.1, plate: '鲁B·D2186', driver: '赵海峰', carrier: '海信物流承运',
    currentVehicle: { plate: '鲁B·D2186', highway: '未上高速', place: '赤峰全达家电附近', speedKmh: 0, at: '2026-10-30 08:20', routePercent: 95, coordinate: [119.013377, 42.350999] },
    issue: '轨迹偏移 1 处', source: 'GPS分析', events: arrivedEvents,
  },
];

export const primaryDispatch = {
  id: dispatchId, customer: '青岛海信', stops: sharedStops,
  waybills, plannedStart: '2026-10-25 13:30', plannedEnd: '2026-10-26 11:00', createdAt: '2026-10-23 09:18',
  status: '已完成' as ScenarioStatus, risk: '高风险' as ScenarioRisk, coverage: trackCoverage().percent,
  plate: `${vehiclePlates.A}、${vehiclePlates.B}`, driver: '刘建国、张海涛', carrier: '海信物流承运',
  issue: '轨迹缺失 2 处、轨迹偏移 1 处', source: 'GPS分析', events: transferEvents,
  currentVehicles: [
    { plate: vehiclePlates.A, place: '天津附近交会点（已换车）', speedKmh: 0, at: '2026-10-25 20:10', coordinate: transferStops.A.coordinate },
    { plate: vehiclePlates.B, place: '赤峰海达电器附近', speedKmh: 0, at: '2026-10-26 11:28', coordinate: stops[3]!.coordinate, current: true },
  ],
};

export const allDispatches: DispatchScenario[] = [primaryDispatch, ...scenarioDispatches];
export const allDispatchWaybills = allDispatches.flatMap(dispatch => dispatch.waybills.map(waybill => ({ dispatch, waybill })));
function generatedDispatch(order: P1Order): DispatchScenario {
  const monitoring = usePhase1();
  const stops = (order.stops ?? []).map(stop => ({ id: stop.id, name: stop.place.name, role: stop.role === 'loading' ? '提货' as const : '卸货' as const, coordinate: [stop.place.lon, stop.place.lat] as [number, number], city: ({ '320571': '苏州', '320214': '无锡', '320115': '南京', '320117': '南京' } as Record<string,string>)[stop.place.regionCode] ?? stop.place.name }));
  const linked = monitoring.orders.filter(item => item.dispatchId === order.id);
  const stopId = (item: P1Order, role: '提货' | '卸货') => stops.find(stop => stop.role === role && item.stops?.some(source => source.role === (role === '提货' ? 'loading' : 'unloading') && source.place.name === stop.name))?.id ?? stops.find(stop => stop.role === role)?.id ?? '';
  const waybills: ScenarioWaybill[] = linked.map(item => ({ id: item.id, pickupId: stopId(item,'提货'), deliveryId: stopId(item,'卸货'), pieces: 0, status: stateNames[order.state] as ScenarioStatus, customer: '接口关联运单', upstreamOrderId: item.sourceKey ?? item.id, externalSystemId: item.sourceKey ?? item.id, cargo: '未提供', weightKg: '—', volumeM3: '—', customFields: item.customFields ?? [], loadType: item.loadType, dispatchId: order.id }));
  const activeAnomalies = monitoring.anomalies.filter(item => item.orderId === order.id && item.status === 'active');
  const risk: ScenarioRisk = activeAnomalies.length ? '高风险' : monitoring.events.some(event => event.orderId === order.id && event.assessment?.verdict === 'reasonable') ? '低风险' : '无风险';
  const events: DispatchEvent[] = monitoring.events.filter(event => event.orderId === order.id).map(event => {
    const stop = order.stops?.find(item => item.id === event.stopId);
    const kind: DispatchEvent['kind'] = event.type === 'offline' ? 'gap' : event.type === 'fence' ? 'station' : event.type;
    return { id: event.id, stage: stop?.role === 'loading' ? 'loading' : stop?.role === 'unloading' ? 'arrived' : 'in_transit', title: event.type === 'fence' ? `${stop?.role === 'unloading' ? '卸货' : '装货'}点${event.phase === 'enter' ? '到达' : '离开'}` : event.type === 'transfer' ? '换车事件' : event.type === 'highway' ? event.message ?? '上下高速' : event.type === 'deviation' ? '线路偏离' : event.type === 'offline' ? '在途离线' : '超时停车', at: dateText(event.occurredAt).slice(5), place: event.address, plate: event.vehiclePlate, coordinate: event.position ? [event.position.lon,event.position.lat] : stop ? [stop.place.lon,stop.place.lat] : undefined, kind, risk: activeAnomalies.some(anomaly => anomaly.eventId === event.id) ? '高风险' : event.assessment?.verdict === 'reasonable' ? '低风险' : '无风险', detail: event.result, plannedAt: stop?.plannedAt ? dateText(stop.plannedAt).slice(5) : undefined };
  });
  const latest=order.actualTrack?.filter(point=>point.at<=monitoring.now).sort((a,b)=>b.at-a.at)[0];
  const currentVehicle=latest ? {plate:latest.vehiclePlate??order.vehicleSegments?.[order.vehicleSegments.length-1]?.plate??order.plate,highway:latest.roadName??'',place:latest.address??`经纬度 ${latest.lon.toFixed(4)}, ${latest.lat.toFixed(4)}（地址待解析）`,speedKmh:latest.speedKmh??0,at:dateText(latest.at),routePercent:50,coordinate:[latest.lon,latest.lat] as [number,number]} : undefined;
  return {id:order.id,customer:'演示调度单',stops,waybills,plannedStart:dateText(order.plannedDeparture),plannedEnd:dateText(order.plannedArrival),status:stateNames[order.state] as ScenarioStatus,risk,coverage:null,plate:order.plate,driver:order.driver,carrier:'未提供',issue:activeAnomalies.map(item=>item.kind).join('、')||'无异常',source:'调度单关联演示',events,createdAt:dateText(order.createdAt),departedAt:order.departedAt?dateText(order.departedAt):undefined,currentVehicle};
}
export function currentDispatches(): DispatchScenario[] { return [...allDispatches,...usePhase1().orders.filter(order=>order.monitoringOwner==='dispatch'&&!order.dispatchId).map(generatedDispatch)]; }
export function dispatchForWaybill(waybillId: string) { return currentDispatches().find(dispatch => dispatch.waybills.some(waybill => waybill.id === waybillId)); }
export function stopForWaybill(dispatch: DispatchScenario, stopId: string): ScenarioStop | undefined { return dispatch.stops.find(stop => stop.id === stopId); }
export function validateDispatchVehicleConsistency(waybillVehicles: Array<{ plate?: string; driver?: string; carrier?: string }>) {
  if (waybillVehicles.length < 2) return { valid: true, conflicts: [] as string[] };
  const first = waybillVehicles[0]!;
  const conflicts = ['plate', 'driver', 'carrier'].filter(field => waybillVehicles.some(item => item[field as keyof typeof item] !== first[field as keyof typeof first]));
  return { valid: conflicts.length === 0, conflicts };
}
