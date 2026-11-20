import type { P1Anomaly, P1Event, P1Log, P1Order, P1SkillId } from '@/views/AgentWork/interface';
import { eventNames } from './catalog';

const HOUR = 3600000;
const hourStart = (at: number) => Math.floor(at / HOUR) * HOUR;

interface MonitoringSnapshot {
  orders: P1Order[];
  events: P1Event[];
  anomalies: P1Anomaly[];
  logs: P1Log[];
  now: number;
}

export interface MonitoringHour {
  start: number;
  end: number;
  monitoredOrders: number;
  eventCount: number;
  statusUpdates: number;
  highRisk: number;
  lowRisk: number;
  details: { id: string; orderId: string; plate: string; occurredAt: number; source: string; text: string }[];
}

export function monitoringHours(snapshot: MonitoringSnapshot, projectId: string, skillId: P1SkillId, orderId = ''): MonitoringHour[] {
  const orders = snapshot.orders.filter(order => order.projectId === projectId && (!orderId || order.id === orderId));
  if (!orders.length) return [];
  const settledBefore = hourStart(snapshot.now);
  const plates = new Map(orders.map(order => [order.id, order.plate]));
  const ends = new Map(orders.map(order => [order.id, snapshot.logs
    .filter(log => log.projectId === projectId && log.orderId === order.id && log.taskId === skillId && log.kind === '结束')
    .reduce((end, log) => Math.min(end, log.at), order.expiresAt)]));
  const startedAt = (order: P1Order) => skillId === 'p1-weather' ? order.weatherEffectiveAt ?? order.activateAt : order.activateAt;
  const hours = new Set<number>();
  for (const order of orders) {
    if (!order.config.selectedSkills.includes(skillId) || order.subscriptionRevision === 0) continue;
    const end = Math.min(ends.get(order.id)!, order.expiresAt, settledBefore);
    for (let at = hourStart(startedAt(order)); at < end; at += HOUR) hours.add(at);
  }
  const events = snapshot.events.filter(event => event.projectId === projectId && plates.has(event.orderId) && event.taskIds.includes(skillId));
  const anomalies = snapshot.anomalies.filter(anomaly => plates.has(anomaly.orderId) && anomaly.taskId === skillId);
  const results = snapshot.logs.filter(log => log.projectId === projectId && plates.has(log.orderId) && log.taskId === skillId && log.kind === '结果');
  // Delayed events belong to their reception hour, not their original occurrence hour.
  for (const event of events) if (event.receivedAt < settledBefore) hours.add(hourStart(event.receivedAt));
  for (const anomaly of anomalies) if (anomaly.firstAt < settledBefore) hours.add(hourStart(anomaly.firstAt));
  for (const result of results) if (result.at < settledBefore) hours.add(hourStart(result.at));
  return [...hours].sort((a, b) => b - a).flatMap(start => {
    const end = start + HOUR;
    const monitored = orders.filter(order => order.config.selectedSkills.includes(skillId) && order.subscriptionRevision > 0 && startedAt(order) < end && Math.min(ends.get(order.id)!, order.expiresAt) > start);
    const received = events.filter(event => event.receivedAt >= start && event.receivedAt < end);
    const detected = anomalies.filter(anomaly => anomaly.firstAt >= start && anomaly.firstAt < end);
    const recorded = results.some(result => result.at >= start && result.at < end);
    if (!monitored.length && !received.length && !detected.length && !recorded) return [];
    const details = received.map(event => ({
      id: event.id,
      orderId: event.orderId,
      plate: plates.get(event.orderId)!,
      occurredAt: event.occurredAt,
      source: event.assessment ? '位置与环境研判' : eventNames[event.type] + '事件',
      text: skillId === 'p1-status'
        ? `${event.target === 'origin' ? '起始地' : '目的地'}${event.phase === 'enter' ? '进入' : '离开'} · ${event.result}`
        : `${event.address}${event.type === 'deviation' ? ` · 偏离${event.distanceMeters}米` : event.type === 'parking' || event.type === 'offline' ? ` · 持续${event.durationMinutes}分钟` : ''} · ${event.result}${event.assessment ? ` · 研判依据：${event.assessment.reason}` : ''}`,
    }));
    if (skillId !== 'p1-status') details.push(...detected.filter(anomaly => !anomaly.eventId).map(anomaly => ({
      id: anomaly.id, orderId: anomaly.orderId, plate: plates.get(anomaly.orderId)!, occurredAt: anomaly.firstAt,
      source: anomaly.taskId === 'p1-late' ? '运单时效与经过记录检查' : anomaly.kind, text: anomaly.reason,
    })));
    return [{ start, end, monitoredOrders: monitored.length, eventCount: received.length,
      statusUpdates: skillId === 'p1-status' ? received.filter(event => event.result.includes('→')).length : 0,
      highRisk: skillId === 'p1-status' ? 0 : detected.length,
      lowRisk: skillId === 'p1-status' ? 0 : received.filter(event => event.assessment?.verdict === 'reasonable').length,
      details }];
  });
}
