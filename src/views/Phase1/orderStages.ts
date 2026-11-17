import type { P1Anomaly, P1Event, P1Order } from '@/views/AgentWork/interface';

export const transportStages = ['运单创建', '装货中', '在途', '已到达', '已完成'] as const;

export function anomalyStage(anomaly: P1Anomaly, order: P1Order, events: P1Event[]): typeof transportStages[number] {
  if (anomaly.kind === '未经过起始地') return '运单创建';
  if (anomaly.kind === '晚发') return '装货中';
  if (anomaly.kind === '晚到' || anomaly.kind === '未经过目的地') return '已到达';
  const at = events.find(event => event.id === anomaly.eventId)?.occurredAt ?? anomaly.firstAt;
  if (order.completedAt !== undefined && at >= order.completedAt) return '已完成';
  if (order.arrivedAt !== undefined && at >= order.arrivedAt) return '已到达';
  if (order.departedAt !== undefined && at >= order.departedAt) return '在途';
  if (order.enteredAt !== undefined && at >= order.enteredAt) return '装货中';
  return order.initialization?.state === 'in_transit' ? '在途' : '运单创建';
}
