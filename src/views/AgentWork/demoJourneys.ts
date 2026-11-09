import type { Order, TransportStop, WaybillVerification } from './interface';

type Point = [number, number];
const cities: Record<string, Point> = { 厦门市: [118.0894, 24.4798], 惠州市: [114.4162, 23.1118], 中山市: [113.3926, 22.5159], 郑州市: [113.6254, 34.7466], 茂名市: [110.9255, 21.6627], 重庆市: [106.5516, 29.563], 乌鲁木齐市: [87.6168, 43.8256], 北京市: [116.4074, 39.9042], 天津市: [117.2009, 39.0842], 苏州市: [120.5853, 31.2989] };
export function distanceKm(a: Point, b: Point) {
  const rad = (n: number) => n * Math.PI / 180;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2)));
}
export function journeyStops(orders: Order[]): TransportStop[] {
  const stops = [...new Map(orders.flatMap(o => o.stops || []).map(s => [s.id, s])).values()];
  return [...stops.filter(s => s.kind === '装货'), ...stops.filter(s => s.kind === '卸货')];
}
const format = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
export const demoTimeFields = ['预约提货时间', '签到时间', '计划发车时间', '发车时间', '预约送货时间', '到货确认时间', '签收时间', '最近上报时间'] as const;
const parseTime = (value?: string) => value ? Date.parse(value.replace(' ', 'T') + '+08:00') : NaN;
export function evaluateDemoTimes(times: Record<string, string>) {
  if (parseTime(times['预约送货时间']) < parseTime(times['计划发车时间'])) return { departure: NaN, arrival: NaN, departureRisk: '待核实', arrivalRisk: '待核实', risk: '待核实', issue: '计划时间异常：预约送货时间早于计划发车时间，请调整测试值' };
  const departure = (parseTime(times['发车时间']) - parseTime(times['计划发车时间'])) / 60000;
  const arrival = (parseTime(times['到货确认时间']) - parseTime(times['预约送货时间'])) / 60000;
  const grade = (minutes: number) => !Number.isFinite(minutes) ? '待核实' : minutes <= 0 ? '无风险' : minutes <= 60 ? '低风险' : '高风险';
  const departureRisk = grade(departure), arrivalRisk = grade(arrival);
  const risk = [departureRisk, arrivalRisk].includes('高风险') ? '高风险' : [departureRisk, arrivalRisk].includes('低风险') ? '低风险' : [departureRisk, arrivalRisk].includes('待核实') ? '待核实' : '无风险';
  const issue = [!Number.isFinite(departure) ? '发车时间不足，待核实' : departure > 0 ? `晚发${Math.round(departure)}分钟（${departureRisk}）` : '按时发车', !Number.isFinite(arrival) ? '送达时间不足，待核实' : arrival > 0 ? `晚到${Math.round(arrival)}分钟（${arrivalRisk}）` : '按时送达'].join('；');
  return { departure, arrival, departureRisk, arrivalRisk, risk, issue };
}

function addDemoTimes(order: Order, group: Order[], index: number): Order {
  const begin = Date.parse(order.demoTrip!.startTime), end = Date.parse(order.demoTrip!.endTime);
  const departureDelay = [0, 20, 90, 0, 45, 0, 120, 0][index % 8]!;
  const arrivalDelay = [0, 0, 0, 30, 90, 150, 45, 0][index % 8]!;
  const plannedDeparture = begin - departureDelay * 60000;
  const lastStop = Math.max(...group.map(o => Date.parse(o.demoTrip!.endTime)));
  const demoTimes = {
    '预约提货时间': format(plannedDeparture - 90 * 60000),
    '签到时间': format(begin - 60 * 60000),
    '计划发车时间': format(plannedDeparture),
    '发车时间': format(begin),
    '预约送货时间': format(Math.max(plannedDeparture + 60000, end - arrivalDelay * 60000)),
    '到货确认时间': format(end),
    '签收时间': format(end + (20 + index % 3 * 10) * 60000),
    '最近上报时间': format(lastStop + 60 * 60000),
  };
  const assessment = evaluateDemoTimes(demoTimes);
  return { ...order, demoTimes, risk: assessment.risk, issue: assessment.issue, updated: demoTimes['最近上报时间'], source: '测试时间规则判定' };
}
export function createDemoJourneys(original: Order[], evidence: WaybillVerification[] = []): Order[] {
  const result: Order[] = [];
  for (const id of [...new Set(original.map(o => o.dispatchId))]) {
    const members = original.filter(o => o.dispatchId === id).map(order => {
      const check = evidence.find(v => v.orderId === order.id && v.plate === order.plate);
      return { ...order, verification: check, stops: order.stops?.map(stop => ({ ...stop, coordinate: stop.coordinate || (stop.kind === '装货' ? check?.origin : check?.destination) || undefined })) };
    });
    const stops = journeyStops(members);
    const originalDay = members.map(o => o.startTime.slice(0, 10)).sort()[0]!;
    const groupIndex = [...new Set(original.map(o => o.dispatchId))].indexOf(id);
    const start = Date.parse(originalDay + 'T08:00:00+08:00') + groupIndex * 20 * 60000;
    const times = new Map<string, number>();
    let cursor = start;
    const approximate = (stop: TransportStop): Point => stop.coordinate || (stop.kind === '装货' ? [114.6, 30.5] : cities[members.find(o => o.stops?.some(s => s.id === stop.id))?.route.split(' → ')[1] || ''] || [114.6, 30.5]);
    stops.forEach((stop, index) => {
      if (index) cursor += Math.max(20 * 60000, distanceKm(approximate(stops[index - 1]!), approximate(stop)) * 1.25 / 60 * 3600000);
      times.set(stop.id, Math.round(cursor / 1000) * 1000);
    });
    for (const order of members) {
      const load = order.stops?.find(s => s.kind === '装货');
      const unload = order.stops?.find(s => s.kind === '卸货');
      const begin = times.get(load?.id || '') || start;
      const end = Math.max(begin + 60000, times.get(unload?.id || '') || begin + 3600000);
      result.push({ ...order, startTime: format(begin), eta: format(end), source: '完整运单轨迹演示', demoTrip: { startTime: new Date(begin).toISOString(), endTime: new Date(end).toISOString(), originalStartTime: order.startTime } });
    }
  }
  // Preserve the imported list order.
  return original.map((o, index) => {
    const order = result.find(r => r.id === o.id)!;
    const group = result.filter(r => r.dispatchId === order.dispatchId);
    const stops = journeyStops(group);
    const point = (stop: TransportStop): Point => stop.coordinate || (stop.kind === '装货' ? [114.6, 30.5] : cities[group.find(r => r.stops?.some(s => s.id === stop.id))?.route.split(' → ')[1] || ''] || [114.6, 30.5]);
    const legs = stops.slice(1).map((stop, index) => [point(stops[index]!), point(stop)]);
    return addDemoTimes({ ...order, demoGps: demoOrderSamples(order, group, stops, legs) }, group, index);
  });
}

/** One vehicle journey, then slice the same samples at each waybill's load/unload stops. Coordinates are GCJ-02. */
export function demoOrderPath(order: Order, stops: TransportStop[], legs: Point[][]) {
  const begin = stops.findIndex(s => s.id === order.stops?.find(p => p.kind === '装货')?.id);
  const end = stops.findIndex(s => s.id === order.stops?.find(p => p.kind === '卸货')?.id);
  if (begin < 0 || end <= begin || !order.demoTrip) return [];
  const path = legs.slice(begin, end).flatMap((leg, index) => index ? leg.slice(1) : leg);
  return densify(path);
}

function densify(path: Point[]) {
  // Road vertices are expanded into continuous demo GPS samples.
  const points: Point[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const steps = Math.max(1, Math.ceil(distanceKm(a, b)));
    if (!points.length) points.push(a);
    for (let j = 1; j <= steps; j++) points.push(j === steps ? b : [a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps]);
  }
  return points;
}

export function demoOrderSamples(order: Order, group: Order[], stops: TransportStop[], legs: Point[][]) {
  const begin = stops.findIndex(s => s.id === order.stops?.find(p => p.kind === '装货')?.id);
  const end = stops.findIndex(s => s.id === order.stops?.find(p => p.kind === '卸货')?.id);
  const timeAt = (stop: TransportStop) => {
    const member = group.find(o => o.stops?.some(s => s.id === stop.id))!;
    return Date.parse(stop.kind === '装货' ? member.demoTrip!.startTime : member.demoTrip!.endTime);
  };
  const samples: { coordinate: Point; timestamp: string }[] = [];
  for (let i = begin; i >= 0 && i < end; i++) {
    // This leg is shared verbatim by all onboard orders, including its timestamps.
    const path = densify(legs[i] || []);
    const start = timeAt(stops[i]!), finish = timeAt(stops[i + 1]!);
    path.forEach((coordinate, index) => {
      if (samples.length && index === 0) return;
      samples.push({ coordinate, timestamp: new Date(start + (finish - start) * index / Math.max(1, path.length - 1)).toISOString() });
    });
  }
  return samples;
}

const roadCache = new Map<string, Promise<{ path: Point[]; approximate: boolean }>>();
let roadQueue: Promise<unknown> = Promise.resolve();
export function demoRoadPath(start: Point, end: Point, plan: () => Promise<{ path: Point[] }>) {
  const key = `${start.join(',')}:${end.join(',')}`;
  const previous = roadCache.get(key);
  if (previous) return previous;
  const job = roadQueue.then(async () => {
    await new Promise(resolve => setTimeout(resolve, 650));
    try { const road = await plan(); return { path: [start, ...road.path, end], approximate: false }; }
    catch { roadCache.delete(key); return { path: [start, end], approximate: true }; }
  });
  roadQueue = job.catch(() => {});
  roadCache.set(key, job);
  return job;
}

let evidencePromise: Promise<WaybillVerification[]> | undefined;
export function loadDemoEvidence() {
  return evidencePromise ||= fetch('/api/company-openapi/risk-check').then(r => r.json()).then(data => Array.isArray(data) ? data : []).catch(() => []);
}
