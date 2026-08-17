export type TransportTimelineState = 'current' | 'done' | 'pending';

export interface TransportTimelineItem {
  description: string;
  place: string;
  state: TransportTimelineState;
  time: string;
  title: string;
}

export interface TransportDemoData {
  actualDeparture: string;
  cargo: string;
  carrier: string;
  currentLocation: string;
  currentPosition: [number, number];
  destination: string;
  destinationPosition: [number, number];
  estimatedArrival: string;
  id: string;
  lastLocatedAt: string;
  orderNo: string;
  origin: string;
  originPosition: [number, number];
  plannedArrival: string;
  plannedDeparture: string;
  plate: string;
  progressPercent: number;
  remainingKm: number;
  speedKph: number;
  status: string;
  timeline: TransportTimelineItem[];
  totalKm: number;
}

interface RouteTemplate {
  baseDistanceKm: number;
  cargo: string[];
  carrier: string[];
  checkpoints: string[];
  destination: string;
  destinationPosition: [number, number];
  origin: string;
  originPosition: [number, number];
  plateProvince: string;
}

const transportDemoStorageKey = 'iovagent:transport-demo:latest';

const routeTemplates: RouteTemplate[] = [
  {
    origin: '上海市嘉定区金隅水泥厂',
    destination: '杭州市临安区青山湖仓',
    originPosition: [31.3748, 121.2619],
    destinationPosition: [30.2339, 119.7247],
    baseDistanceKm: 286,
    cargo: ['P.O 42.5散装水泥 32吨', '袋装水泥 30吨', '矿粉 34吨'],
    carrier: ['安捷物流', '华东联运', '顺达供应链'],
    checkpoints: ['G60沪昆高速嘉兴服务区', 'G60沪昆高速桐乡段', '杭州绕城高速西复线'],
    plateProvince: '沪',
  },
  {
    origin: '青岛市城阳区啤酒物流中心',
    destination: '济南市历城区华山配送仓',
    originPosition: [36.3077, 120.3963],
    destinationPosition: [36.6934, 117.1642],
    baseDistanceKm: 358,
    cargo: ['青岛啤酒经典装 1,260箱', '纯生啤酒 980箱', '易拉罐啤酒 1,420箱'],
    carrier: ['鲁通供应链', '齐鲁快运', '海岸运输'],
    checkpoints: ['G20青银高速潍坊西段', '淄博服务区', '济南东收费站'],
    plateProvince: '鲁',
  },
  {
    origin: '邢台市隆尧县今麦郎物流园',
    destination: '郑州市经开区食品配送中心',
    originPosition: [37.3502, 114.7704],
    destinationPosition: [34.7212, 113.8178],
    baseDistanceKm: 342,
    cargo: ['今麦郎方便面 1,080箱', '桶装方便面 860箱', '饮品组合装 1,240箱'],
    carrier: ['智链顺达物流', '冀豫干线运输', '华北捷运'],
    checkpoints: ['G4京港澳高速邯郸段', '安阳服务区', 'G4京港澳高速新乡段'],
    plateProvince: '冀',
  },
  {
    origin: '苏州市工业园区制造基地',
    destination: '合肥市蜀山区零部件中心仓',
    originPosition: [31.3196, 120.7272],
    destinationPosition: [31.8435, 117.1324],
    baseDistanceKm: 414,
    cargo: ['汽车精密零部件 26托', '工业轴承 18托', '电子控制器 22托'],
    carrier: ['华东联运', '苏皖物流', '长三角供应链'],
    checkpoints: ['沪蓉高速常州段', '南京绕城高速', '滁州全椒服务区'],
    plateProvince: '苏',
  },
  {
    origin: '广州市黄埔区快消品仓',
    destination: '厦门市集美区商贸配送中心',
    originPosition: [23.1145, 113.4509],
    destinationPosition: [24.5752, 118.1007],
    baseDistanceKm: 648,
    cargo: ['常温饮料组合装 1,360箱', '休闲食品 1,120箱', '包装食品 980箱'],
    carrier: ['南粤快运', '粤闽干线物流', '湾区供应链'],
    checkpoints: ['济广高速惠州段', '甬莞高速潮州段', '沈海高速漳州段'],
    plateProvince: '粤',
  },
];

export function createTransportDemo(query: string, now = new Date()): TransportDemoData {
  const route = pick(routeTemplates);
  const totalKm = Math.max(180, route.baseDistanceKm + randomInteger(-12, 18));
  const progressPercent = randomInteger(28, 82);
  const remainingKm = Math.max(35, Math.round(totalKm * (1 - progressPercent / 100)));
  const traveledKm = totalKm - remainingKm;
  const completedAverageSpeed = randomInteger(50, 63);
  const elapsedMinutes = Math.round((traveledKm / completedAverageSpeed) * 60 + randomInteger(18, 72));
  const actualDeparture = addMinutes(now, -elapsedMinutes);
  const departureDelayMinutes = randomInteger(-12, 58);
  const plannedDeparture = addMinutes(actualDeparture, -departureDelayMinutes);
  const speedKph = randomInteger(48, 86);
  const remainingMinutes = Math.round((remainingKm / randomInteger(52, 68)) * 60 + randomInteger(16, totalKm > 500 ? 68 : 42));
  const estimatedArrival = addMinutes(now, remainingMinutes);
  const plannedArrival = addMinutes(plannedDeparture, Math.round((totalKm / 58) * 60 + (totalKm > 500 ? 82 : 38)));
  const arrivalDeltaMinutes = Math.round((estimatedArrival.getTime() - plannedArrival.getTime()) / 60_000);
  const currentLocation = route.checkpoints[Math.min(route.checkpoints.length - 1, Math.floor((progressPercent / 100) * route.checkpoints.length))]!;
  const currentPosition = interpolatePosition(route.originPosition, route.destinationPosition, progressPercent / 100);
  const lastLocatedAt = addMinutes(now, -randomInteger(1, 7));
  const orderNo = extractOrderNo(query) || generateOrderNo(now);
  const plate = extractPlate(query) || generatePlate(route.plateProvince);
  const checkpointTime = addMinutes(actualDeparture, Math.max(35, Math.round(elapsedMinutes * 0.48)));

  return {
    id: createDemoId(),
    orderNo,
    plate,
    carrier: pick(route.carrier),
    cargo: pick(route.cargo),
    origin: route.origin,
    destination: route.destination,
    originPosition: route.originPosition,
    destinationPosition: route.destinationPosition,
    currentPosition,
    currentLocation,
    totalKm,
    remainingKm,
    progressPercent,
    speedKph,
    plannedDeparture: plannedDeparture.toISOString(),
    actualDeparture: actualDeparture.toISOString(),
    plannedArrival: plannedArrival.toISOString(),
    estimatedArrival: estimatedArrival.toISOString(),
    lastLocatedAt: lastLocatedAt.toISOString(),
    status: resolveStatus(arrivalDeltaMinutes),
    timeline: [
      {
        title: '装货完成',
        time: addMinutes(actualDeparture, -randomInteger(22, 46)).toISOString(),
        place: route.origin,
        description: '装货数量与运输任务核验完成，车辆等待出场。',
        state: 'done',
      },
      {
        title: '车辆发车',
        time: actualDeparture.toISOString(),
        place: route.origin,
        description: departureDelayMinutes > 15 ? `较计划晚 ${departureDelayMinutes} 分钟发车。` : '车辆按计划驶离装货地电子围栏。',
        state: 'done',
      },
      {
        title: '通过线路节点',
        time: checkpointTime.toISOString(),
        place: route.checkpoints[0]!,
        description: `轨迹连续，累计行驶约 ${Math.round(traveledKm * 0.48)} km。`,
        state: 'done',
      },
      {
        title: '车辆运输中',
        time: lastLocatedAt.toISOString(),
        place: currentLocation,
        description: `当前车速约 ${speedKph} km/h，剩余里程约 ${remainingKm} km。`,
        state: 'current',
      },
      {
        title: '预计到达卸货地',
        time: estimatedArrival.toISOString(),
        place: route.destination,
        description: '预计进入卸货地围栏，等待到货与签收确认。',
        state: 'pending',
      },
    ],
  };
}

export function saveTransportDemo(data: TransportDemoData) {
  try {
    localStorage.setItem(transportDemoStorageKey, JSON.stringify(data));
  } catch {
    // Storage can be unavailable in privacy mode; the H5 route regenerates a fallback.
  }
}

export function loadTransportDemo(id: string): TransportDemoData | null {
  try {
    const raw = localStorage.getItem(transportDemoStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TransportDemoData;
    return parsed.id === id ? parsed : null;
  } catch {
    return null;
  }
}

export function createTransportDemoPageUrl(data: TransportDemoData, query: string) {
  const base = import.meta.env.VITE_BASE.replace(/\/$/, '');
  return `${base}/transport-demo?id=${encodeURIComponent(data.id)}&q=${encodeURIComponent(query)}`;
}

function resolveStatus(deltaMinutes: number) {
  if (deltaMinutes > 55) return `运输中 · 预计晚点 ${Math.min(deltaMinutes, 150)} 分钟`;
  if (deltaMinutes < -30) return `运输中 · 预计提前 ${Math.min(Math.abs(deltaMinutes), 90)} 分钟`;
  return '运输中 · 时效正常';
}

function extractOrderNo(query: string) {
  const normalized = query.toUpperCase();
  return normalized.match(/(?:订单|运单|货单|货运单|托运单)(?:号|编号)?[：:#\s-]*([A-Z0-9][A-Z0-9-]{4,})/)?.[1] ?? '';
}

function extractPlate(query: string) {
  return query.toUpperCase().match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/)?.[0] ?? '';
}

function generateOrderNo(now: Date) {
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `WB${date}${randomInteger(1000, 9999)}`;
}

function generatePlate(province: string) {
  const cityLetters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const suffixCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let index = 0; index < 5; index += 1) suffix += suffixCharacters[randomInteger(0, suffixCharacters.length - 1)];
  return `${province}${cityLetters[randomInteger(0, cityLetters.length - 1)]}${suffix}`;
}

function interpolatePosition(start: [number, number], end: [number, number], ratio: number): [number, number] {
  const curvedLatitudeOffset = Math.sin(ratio * Math.PI) * 0.13;
  return [start[0] + (end[0] - start[0]) * ratio + curvedLatitudeOffset, start[1] + (end[1] - start[1]) * ratio];
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function randomInteger(minimum: number, maximum: number) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function pick<T>(values: readonly T[]) {
  return values[randomInteger(0, values.length - 1)]!;
}

function createDemoId() {
  return globalThis.crypto?.randomUUID?.() ?? `transport-${Date.now()}-${randomInteger(1000, 9999)}`;
}
