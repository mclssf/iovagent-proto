import type { OrderRoutePlan, P1Order, P1Stop, RouteStrategy } from '@/views/AgentWork/interface';

export const routeStrategies: RouteStrategy[] = ['更多人选择', '时间优先', '距离最短'];
function stopDistance(order: P1Order, stop: P1Stop) {
  const current = order.actualTrack?.slice().sort((a, b) => b.at - a.at)[0];
  if (!current) return Number.POSITIVE_INFINITY;
  const dx = (stop.place.lon - current.lon) * Math.cos(current.lat * Math.PI / 180);
  const dy = stop.place.lat - current.lat;
  return Math.hypot(dx, dy);
}
export function orderedStops(order: P1Order): P1Stop[] {
  const stops = [...(order.stops ?? [
    { id: `${order.id}-loading-1`, sequence: 1, role: 'loading' as const, place: order.origin, plannedAt: order.plannedDeparture ?? undefined },
    { id: `${order.id}-unloading-1`, sequence: 2, role: 'unloading' as const, place: order.destination, plannedAt: order.plannedArrival ?? undefined },
  ])];
  const sortGroup = (group: P1Stop[]) => group.sort((a, b) => {
    const aTouched = a.enteredAt ?? a.exitedAt;
    const bTouched = b.enteredAt ?? b.exitedAt;
    if ((aTouched !== undefined) !== (bTouched !== undefined)) return aTouched !== undefined ? -1 : 1;
    if (aTouched !== undefined && bTouched !== undefined && aTouched !== bTouched) return aTouched - bTouched;
    if ((a.plannedAt ?? Number.POSITIVE_INFINITY) !== (b.plannedAt ?? Number.POSITIVE_INFINITY)) return (a.plannedAt ?? Number.POSITIVE_INFINITY) - (b.plannedAt ?? Number.POSITIVE_INFINITY);
    const distance = stopDistance(order, a) - stopDistance(order, b);
    return Number.isFinite(distance) && distance !== 0 ? distance : a.sequence - b.sequence;
  });
  return [...sortGroup(stops.filter(stop => stop.role === 'loading')), ...sortGroup(stops.filter(stop => stop.role === 'unloading'))];
}
// 本地适配器承载规划回执样例；生产接入需用基础路线服务替换，不生成虚假实际轨迹。
export function planNewOrderRoute(order: P1Order, at: number): OrderRoutePlan {
  const strategy = order.config.deviation.routeStrategy ?? '更多人选择';
  const sorted = orderedStops(order);
  const valid = sorted.length >= 2 && sorted.every(stop => Number.isFinite(stop.place.lat) && Number.isFinite(stop.place.lon));
  const previousVersion = order.routePlan?.version ?? 0;
  return { id: `RP-${order.id}-${previousVersion + 1}`, strategy, plannedAt: at, status: valid ? 'ready' : 'failed', reason: valid ? `按装货点→卸货点顺序规划 ${sorted.length} 个节点；偏离监听使用本单路线版本` : '缺少有效装卸货点坐标', version: previousVersion + 1, source: 'mock', stopIds: sorted.map(stop => stop.id) };
}
