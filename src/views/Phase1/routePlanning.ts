import type { OrderRoutePlan, P1Order, RouteStrategy } from '@/views/AgentWork/interface';

export const routeStrategies: RouteStrategy[] = ['更多人选择', '时间优先', '距离最短'];
// 本地适配器承载规划回执样例；生产接入需用基础路线服务替换，不生成虚假实际轨迹。
export function planNewOrderRoute(order: P1Order, at: number): OrderRoutePlan {
  const strategy = order.config.deviation.routeStrategy ?? '更多人选择';
  const valid = [order.origin, order.destination].every(place => Number.isFinite(place.lat) && Number.isFinite(place.lon));
  return { id: `RP-${order.id}-1`, strategy, plannedAt: at, status: valid ? 'ready' : 'failed', reason: valid ? '规划完成，偏离监听使用本单路线版本' : '缺少有效起终点坐标', version: 1, source: 'mock' };
}
