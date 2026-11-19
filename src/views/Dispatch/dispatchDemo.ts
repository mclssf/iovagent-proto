export type Coordinate = [number, number];
export type DispatchMode = 'sample' | 'transfer';
export type VehicleId = 'A' | 'B';
export type DispatchStatus = '待发车' | '装货中' | '在途' | '卸货中' | '已完成';
export const vehiclePlates: Record<VehicleId, string> = { A: '鲁B·A1234', B: '津A·B5678' };

export interface DispatchStop {
  id: string;
  name: string;
  role: '提货' | '卸货';
  coordinate: Coordinate;
}

export interface DispatchWaybill {
  id: string;
  pickupId: string;
  deliveryId: string;
  pieces: number;
  status: DispatchStatus;
  customer: string;
  upstreamOrderId: string;
  externalSystemId: string;
  cargo: string;
  weightKg: string;
  volumeM3: string;
  customFields: { label: string; value: string }[];
  loadType?: '整车' | '零担';
  dispatchId?: string;
}

export interface DispatchTrack {
  vehicle: VehicleId;
  label: string;
  color: string;
  pointTimes: string[];
  pointSpeeds: number[];
  from: string;
  to: string;
  coveredMinutes: number;
  expectedMinutes: number;
  gaps: number;
}

export interface DispatchEvent {
  id: string;
  stage: 'loading' | 'in_transit' | 'arrived';
  title: string;
  at: string;
  place: string;
  vehicle?: VehicleId;
  coordinate?: Coordinate;
  routePercent?: number;
  plate?: string;
  kind: 'station' | 'fence' | 'parking' | 'transfer' | 'highway' | 'gap' | 'deviation' | 'weather';
  risk?: '高风险' | '低风险' | '无风险';
  detail: string;
  plannedAt?: string;
}

export function sortDispatchEventsByStart<T extends Pick<DispatchEvent, 'at'>>(events: T[]): T[] {
  const start = (event: T) => {
    const match = event.at.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    return match ? Date.UTC(2026, Number(match[1]) - 1, Number(match[2]), Number(match[3]), Number(match[4])) : Number.POSITIVE_INFINITY;
  };
  return [...events].sort((a, b) => start(a) - start(b));
}

export const dispatchId = 'D26102306604';

export const stops: DispatchStop[] = [
  { id: 'P1', name: '平度冰箱 CDC 厂区库', role: '提货', coordinate: [120.131809, 36.533777] },
  { id: 'P2', name: '平度基地仓储中心宜美仓', role: '提货', coordinate: [120.105753, 36.578279] },
  { id: 'U1', name: '赤峰全达家电', role: '卸货', coordinate: [119.013377, 42.350999] },
  { id: 'U2', name: '赤峰海达电器', role: '卸货', coordinate: [118.950431, 42.314530] },
];

// Keep the customer order IDs, quantities, and station pairs; use complete measurements for the prototype record.
const sampleOrders = [
  ['Y0152263194', 'L0152263194', 50, '1750', '32.5'],
  ['Y0152243290', 'L0152243290', 5, '180', '3.2'],
  ['Y0152247206', 'L0152247206', 2, '72', '1.3'],
  ['Y0152249220', 'L0152249220', 2, '74', '1.3'],
  ['Y0152247212', 'L0152247212', 2, '70', '1.2'],
  ['Y0152249216', 'L0152249216', 14, '510', '9.1'],
  ['Y0152247208', 'L0152247208', 14, '504', '9.0'],
  ['Y0152247202', 'L0152247202', 14, '512', '9.2'],
  ['Y0152242115', 'L0152242115', 14, '508', '9.1'],
  ['Y0152247203', 'L0152247203', 14, '506', '9.1'],
] as const;

export const waybills: DispatchWaybill[] = sampleOrders.map(([id, upstreamOrderId, pieces, weightKg, volumeM3], index) => ({
  id,
  pickupId: index === 1 ? 'P2' : 'P1',
  deliveryId: index < 2 ? 'U1' : 'U2',
  pieces,
  status: '已完成',
  customer: '冰箱平度基地',
  upstreamOrderId,
  externalSystemId: `HX-${upstreamOrderId}`,
  cargo: index < 2 ? '海信冷柜' : '容声冰箱',
  weightKg,
  volumeM3,
  customFields: [
    { label: 'CIS 订单类型', value: '常规订单' },
    { label: '订单来源', value: 'CIS订单' },
    { label: '调度模式', value: index < 2 ? '调度中心调度' : '承运商调度' },
    { label: '订单区域标识', value: '跨区' },
  ],
  loadType: '零担',
}));

const transferA: Coordinate = [117.3137, 39.7189];
const transferB: Coordinate = [117.3145, 39.7192];

export const transferStops = {
  A: { start: '2026-10-25 20:10', end: '2026-10-25 20:52', coordinate: transferA },
  B: { start: '2026-10-25 20:21', end: '2026-10-25 21:01', coordinate: transferB },
};

export const tracks: DispatchTrack[] = [
  {
    vehicle: 'A', label: '车辆 A', color: '#1765a3', from: '平度提货点', to: '天津附近交会点',
    pointTimes: ['10-25 14:03', '10-25 14:18', '10-25 15:45', '10-25 17:35', '10-25 18:35', '10-25 20:10'],
    pointSpeeds: [0, 12, 82, 76, 68, 0],
    coveredMinutes: 337, expectedMinutes: 367, gaps: 1,
  },
  {
    vehicle: 'B', label: '车辆 B', color: '#0b8b78', from: '天津附近交会点', to: '赤峰卸货点',
    pointTimes: ['10-25 20:21', '10-25 21:25', '10-26 00:10', '10-26 03:45', '10-26 08:26', '10-26 11:28'],
    pointSpeeds: [0, 74, 80, 72, 28, 0],
    coveredMinutes: 857, expectedMinutes: 907, gaps: 1,
  },
];

export function sampleRouteCoordinates(path: Coordinate[], count: number): Coordinate[] {
  if (!path.length || count <= 0) return [];
  if (path.length === 1 || count === 1) return [path[0]!];
  const lengths = path.slice(1).map((point, index) => {
    const previous = path[index]!;
    const latitude = (point[1] + previous[1]) / 2 * Math.PI / 180;
    return Math.hypot((point[0] - previous[0]) * Math.cos(latitude), point[1] - previous[1]);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return Array.from({ length: count }, () => path[0]!);
  return Array.from({ length: count }, (_, index) => {
    const target = total * index / (count - 1);
    let covered = 0;
    for (let segment = 0; segment < lengths.length; segment++) {
      const length = lengths[segment]!;
      if (covered + length >= target || segment === lengths.length - 1) {
        const ratio = length ? Math.min(1, Math.max(0, (target - covered) / length)) : 0;
        const start = path[segment]!;
        const end = path[segment + 1]!;
        return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio] as Coordinate;
      }
      covered += length;
    }
    return path[path.length - 1]!;
  });
}

export function simulateActualTrack(path: Coordinate[], withDeviation: boolean) {
  const planned = sampleRouteCoordinates(path, 101);
  if (!withDeviation || planned.length < 47) return { actual: planned, plannedDeviation: [] as Coordinate[], deviation: [] as Coordinate[], anchor: undefined as Coordinate | undefined };
  const start = planned[30]!;
  const end = planned[46]!;
  const latitude = (start[1] + end[1]) / 2 * Math.PI / 180;
  const directionX = (end[0] - start[0]) * Math.cos(latitude);
  const directionY = end[1] - start[1];
  const length = Math.hypot(directionX, directionY) || 1;
  const normalX = -directionY / length;
  const normalY = directionX / length;
  const actual = planned.map((point, index): Coordinate => {
    if (index < 30 || index > 46) return point;
    const meters = 1200 * Math.sin(Math.PI * (index - 30) / 16);
    return [point[0] + normalX * meters / (111320 * Math.cos(latitude)), point[1] + normalY * meters / 110540];
  });
  return { actual, plannedDeviation: planned.slice(30, 47), deviation: actual.slice(33, 44), anchor: actual[38] };
}

function routeDistance(a: Coordinate, b: Coordinate) {
  const latitude = (a[1] + b[1]) / 2 * Math.PI / 180;
  return Math.hypot((a[0] - b[0]) * Math.cos(latitude), a[1] - b[1]);
}

export function nearestRoutePoint(path: Coordinate[], target: Coordinate): Coordinate | undefined {
  if (!path.length) return undefined;
  if (path.length === 1) return path[0];
  let nearest = path[0]!;
  let best = Infinity;
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1]!;
    const end = path[index]!;
    const cosine = Math.cos((start[1] + end[1]) / 2 * Math.PI / 180);
    const dx = (end[0] - start[0]) * cosine;
    const dy = end[1] - start[1];
    const denominator = dx * dx + dy * dy;
    const ratio = denominator ? Math.max(0, Math.min(1, ((target[0] - start[0]) * cosine * dx + (target[1] - start[1]) * dy) / denominator)) : 0;
    const point: Coordinate = [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
    const distance = routeDistance(point, target);
    if (distance < best) { best = distance; nearest = point; }
  }
  return nearest;
}

export function splitRouteGap(path: Coordinate[], startFraction: number, endFraction: number) {
  if (path.length < 2) return { before: path, missing: [] as Coordinate[], after: [] as Coordinate[] };
  const lengths = path.slice(1).map((point, index) => routeDistance(path[index]!, point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return { before: path, missing: [] as Coordinate[], after: [] as Coordinate[] };
  const startDistance = total * Math.max(0, Math.min(1, startFraction));
  const endDistance = total * Math.max(0, Math.min(1, endFraction));
  const sliceAt = (distance: number) => {
    let covered = 0;
    for (let index = 0; index < lengths.length; index++) {
      const length = lengths[index]!;
      if (covered + length >= distance || index === lengths.length - 1) {
        const ratio = length ? (distance - covered) / length : 0;
        const a = path[index]!; const b = path[index + 1]!;
        return { index, point: [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio] as Coordinate };
      }
      covered += length;
    }
    return { index: lengths.length - 1, point: path[path.length - 1]! };
  };
  const start = sliceAt(startDistance);
  const end = sliceAt(Math.max(startDistance, endDistance));
  return {
    before: [...path.slice(0, start.index + 1), start.point],
    missing: [start.point, ...path.slice(start.index + 1, end.index + 1), end.point],
    after: [end.point, ...path.slice(end.index + 1)],
  };
}

export const transferEvents: DispatchEvent[] = [
  { id: 'pickup-1', stage: 'loading', title: '装货点到达', at: '10-25 13:42', plannedAt: '10-25 13:30', place: stops[0]!.name, vehicle: 'A', coordinate: stops[0]!.coordinate, kind: 'station', detail: '关联 9 条运单，13:42 到达装货地。' },
  { id: 'pickup-2', stage: 'loading', title: '装货点到达', at: '10-25 14:03', plannedAt: '10-25 14:00', place: stops[1]!.name, vehicle: 'A', coordinate: stops[1]!.coordinate, kind: 'station', detail: '关联 1 条运单，14:03 到达装货地。' },
  { id: 'highway-in', stage: 'in_transit', title: '驶入高速', at: '10-25 14:38', place: '平度南收费站', vehicle: 'A', kind: 'highway', detail: 'G18 荣乌高速，平度南收费站驶入。' },
  { id: 'deviation-a', stage: 'in_transit', title: '轨迹偏移', at: '10-25 16:22—16:45', place: 'G18 荣乌高速滨州段', vehicle: 'A', kind: 'deviation', risk: '高风险', detail: '实际轨迹偏离规划路线最大 1.2 公里，持续 23 分钟，超过 500 米阈值。' },
  { id: 'gap-a', stage: 'in_transit', title: '轨迹缺失', at: '10-25 18:05—18:35', place: '车辆 A 承运段', vehicle: 'A', kind: 'gap', risk: '高风险', detail: '轨迹缺失 30 分钟，已触发轨迹完整率预警。' },
  { id: 'gap-b', stage: 'in_transit', title: '轨迹缺失', at: '10-26 02:50—03:40', place: '车辆 B 承运段', vehicle: 'B', kind: 'gap', risk: '高风险', detail: '轨迹缺失 50 分钟，已触发轨迹完整率预警。' },
  { id: 'highway-out', stage: 'in_transit', title: '驶离高速', at: '10-26 07:50', place: '赤峰南收费站', vehicle: 'B', kind: 'highway', detail: 'G16 丹锡高速，赤峰南收费站驶离。' },
  { id: 'delivery-1', stage: 'arrived', title: '卸货点到达', at: '10-26 08:26', plannedAt: '10-26 08:00', place: stops[2]!.name, vehicle: 'B', coordinate: stops[2]!.coordinate, kind: 'station', detail: '关联 2 条运单，08:26 到达卸货地。' },
  { id: 'delivery-2', stage: 'arrived', title: '卸货点到达', at: '10-26 11:28', plannedAt: '10-26 11:00', place: stops[3]!.name, vehicle: 'B', coordinate: stops[3]!.coordinate, kind: 'station', detail: '关联 8 条运单，11:28 到达卸货地。' },
];

function minutes(value: string) { return new Date(value.replace(' ', 'T') + ':00+08:00').getTime() / 60000; }

function distanceMeters(a: Coordinate, b: Coordinate) {
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  const dx = (a[0] - b[0]) * 111320 * Math.cos(lat);
  const dy = (a[1] - b[1]) * 110540;
  return Math.round(Math.hypot(dx, dy));
}

export interface ParkingEvent { id: string; vehicle: VehicleId; start: string; end: string; coordinate: Coordinate; dispatchId: string }
export interface TransferDetectionConfig { enabled: boolean; distanceMeters: number; overlapMinutes: number }
export interface TransferRecord { id: string; vehicleFrom: VehicleId; vehicleTo: VehicleId; start: string; end: string; coordinate: Coordinate; distance: number; overlapMinutes: number; sourceEventIds: [string, string]; configVersion: number }

export const parkingEvents: ParkingEvent[] = [
  { id: 'stop-a', vehicle: 'A', dispatchId, ...transferStops.A },
  { id: 'stop-b', vehicle: 'B', dispatchId, ...transferStops.B },
];

export function detectTransfers(events: ParkingEvent[], config: TransferDetectionConfig, configVersion: number, parkingThresholdMinutes = 30): TransferRecord[] {
  if (!config.enabled || !Number.isFinite(config.distanceMeters) || !Number.isFinite(config.overlapMinutes)) return [];
  const records: TransferRecord[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) {
    const a = events[i]!;
    const b = events[j]!;
    if (a.vehicle === b.vehicle || a.dispatchId !== b.dispatchId || minutes(a.end) - minutes(a.start) < parkingThresholdMinutes || minutes(b.end) - minutes(b.start) < parkingThresholdMinutes) continue;
    const ids = [a.id, b.id].sort() as [string, string];
    const key = `${a.dispatchId}:${ids.join(':')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distance = distanceMeters(a.coordinate, b.coordinate);
    const overlapMinutes = Math.max(0, Math.min(minutes(a.end), minutes(b.end)) - Math.max(minutes(a.start), minutes(b.start)));
    if (distance > config.distanceMeters || overlapMinutes < config.overlapMinutes) continue;
    const first = minutes(a.start) <= minutes(b.start) ? a : b;
    const second = first === a ? b : a;
    records.push({ id: `transfer:${key}`, vehicleFrom: first.vehicle, vehicleTo: second.vehicle,
      start: minutes(a.start) >= minutes(b.start) ? a.start : b.start,
      end: minutes(a.end) <= minutes(b.end) ? a.end : b.end,
      coordinate: first.coordinate, distance, overlapMinutes, sourceEventIds: ids, configVersion });
  }
  return records;
}

export function trackCoverage() {
  const covered = tracks.reduce((sum, track) => sum + track.coveredMinutes, 0);
  const expected = tracks.reduce((sum, track) => sum + track.expectedMinutes, 0);
  return { percent: Math.round(covered / expected * 1000) / 10, gaps: tracks.reduce((sum, track) => sum + track.gaps, 0), covered, expected };
}
