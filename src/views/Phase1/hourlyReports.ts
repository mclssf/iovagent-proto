import type { P1Anomaly, P1Event, P1Log, P1Order, P1SkillId } from '@/views/AgentWork/interface';

const eventLabel: Record<P1Event['type'], string> = { fence: '围栏经过', parking: '超时停车', offline: '在途离线', deviation: '线路偏离', weather: '恶劣天气', highway: '上下高速', transfer: '换车' };

const HOUR = 3600000;
const hourStart = (at: number) => Math.floor(at / HOUR) * HOUR;

export interface MonitoringHourReport {
  start: number;
  end: number;
  monitoredOrders: number;
  eventCount: number;
  statusUpdates: number;
  highRisk: number;
  lowRisk: number;
  details: { id: string; orderId: string; text: string }[];
}

export function hourlyReports(input: { orders: P1Order[]; events: P1Event[]; anomalies: P1Anomaly[]; logs: P1Log[]; now: number }, projectId: string, taskId: P1SkillId, orderId = ''): MonitoringHourReport[] {
  const orders = input.orders.filter(order => order.projectId === projectId && (!orderId || order.id === orderId));
  if (!orders.length) return [];
  const completedEnd = hourStart(input.now);
  const orderIds = new Set(orders.map(order => order.id));
  const stoppedAt = (order: P1Order) => input.logs.filter(log => log.orderId === order.id && log.taskId === taskId && log.kind === '结束').map(log => log.at).sort((a, b) => a - b)[0] ?? order.expiresAt;
  const candidateHours = new Set<number>();
  for (const order of orders) {
    if (!order.config.selectedSkills.includes(taskId) || order.subscriptionRevision === 0) continue;
    const effective = taskId === 'p1-weather' ? order.weatherEffectiveAt ?? order.activateAt : order.activateAt;
    const last = Math.min(stoppedAt(order), order.expiresAt, completedEnd);
    for (let start = hourStart(effective); start < last; start += HOUR) candidateHours.add(start);
  }
  for (const event of input.events) if (orderIds.has(event.orderId) && event.taskIds.includes(taskId) && event.receivedAt < completedEnd) candidateHours.add(hourStart(event.receivedAt));
  for (const anomaly of input.anomalies) if (orderIds.has(anomaly.orderId) && anomaly.taskId === taskId && anomaly.firstAt < completedEnd) candidateHours.add(hourStart(anomaly.firstAt));
  for (const log of input.logs) if (orderIds.has(log.orderId) && log.taskId === taskId && log.kind === '结果' && log.at < completedEnd) candidateHours.add(hourStart(log.at));
  const reports: MonitoringHourReport[] = [];
  for (const start of [...candidateHours].sort((a, b) => b - a)) {
    const end = start + HOUR;
    const covered = orders.filter(order => {
      if (!order.config.selectedSkills.includes(taskId) || order.subscriptionRevision === 0) return false;
      const effective = taskId === 'p1-weather' ? order.weatherEffectiveAt ?? order.activateAt : order.activateAt;
      return effective < end && Math.min(stoppedAt(order), order.expiresAt) > start;
    });
    const events = input.events.filter(event => orderIds.has(event.orderId) && event.taskIds.includes(taskId) && event.receivedAt >= start && event.receivedAt < end);
    const anomalies = input.anomalies.filter(item => orderIds.has(item.orderId) && item.taskId === taskId && item.firstAt >= start && item.firstAt < end);
    const low = events.filter(event => event.assessment?.verdict === 'reasonable');
    const independent = anomalies.filter(item => !item.eventId);
    const details = taskId === 'p1-status'
      ? events.map(event => ({ id: event.id, orderId: event.orderId, text: `${event.target === 'origin' ? '起始地' : '目的地'}${event.phase === 'enter' ? '进入' : '离开'} · ${event.result} · ${new Date(event.occurredAt).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })}` }))
      : [
          ...events.map(event => ({ id: event.id, orderId: event.orderId, text: `${eventLabel[event.type]} · ${event.address} · 发生于${new Date(event.occurredAt).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })}${event.type === 'deviation' ? ` · 偏离${event.distanceMeters}米` : event.type === 'parking' || event.type === 'offline' ? ` · 持续${event.durationMinutes}分钟` : event.type === 'transfer' ? ` · ${event.fromPlate} → ${event.toPlate}，停车点相距${event.distanceMeters}米，重合${event.durationMinutes}分钟` : ''} · ${event.result}${event.assessment ? ` · 研判依据：${event.assessment.reason}` : ''}` })),
          ...independent.map(item => ({ id: item.id, orderId: item.orderId, text: `${item.kind} · 高风险 · ${item.reason}` })),
        ];
    const taskLogs = input.logs.some(log => orderIds.has(log.orderId) && log.taskId === taskId && log.kind === '结果' && log.at >= start && log.at < end);
    if (!covered.length && !events.length && !anomalies.length && !taskLogs) continue;
    reports.push({ start, end, monitoredOrders: covered.length, eventCount: events.length, statusUpdates: taskId === 'p1-status' ? events.filter(event => event.result.includes('→')).length : 0, highRisk: taskId === 'p1-status' ? 0 : anomalies.length, lowRisk: taskId === 'p1-status' ? 0 : low.length, details });
  }
  return reports;
}
