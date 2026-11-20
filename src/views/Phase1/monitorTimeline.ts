import type { P1Anomaly, P1Event, P1Order, P1State, Tone } from '@/views/AgentWork/interface';
import { dateText, eventNames, stateNames } from './catalog';

interface MonitorRow {
  id: string;
  at: number;
  title: string;
  place: string;
  conclusion: string;
  supplement: string;
  duration: string;
  abnormal: boolean;
  iconKey: 'waypoints' | 'truck' | 'locate' | 'pause' | 'route' | 'alarmClock' | 'alert';
  agentVerdict?: string;
  agentTone?: Tone;
  analysis?: boolean;
}

export function monitorEventPoint(order: P1Order, event: P1Event) {
  const point = event.position ?? (event.type === 'fence' && event.target ? order[event.target] : undefined);
  return point && Number.isFinite(point.lon) && Math.abs(point.lon) <= 180 && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 ? point : undefined;
}

const fenceStages = { origin: { enter: 'loading', exit: 'in_transit' }, destination: { enter: 'arrived', exit: 'completed' } } as const;
const fenceTitles = { origin: { enter: '车辆进入装货地', exit: '发车离场' }, destination: { enter: '到达卸货地', exit: '离开卸货地' } };
const alarmStatus = { active: '未恢复', recovered: '已恢复', corrected: '已纠正' };

export function monitorTimeline(order: P1Order, events: P1Event[], anomalies: P1Anomaly[]) {
  const alerts = anomalies.filter(item => item.orderId === order.id);
  const linked = new Set<string>();
  const milestones = new Set<string>();
  const rows: MonitorRow[] = [];
  for (const event of events) {
    if (event.projectId !== order.projectId || event.orderId !== order.id) continue;
    const alarm = alerts.find(item => item.eventId === event.id);
    if (alarm) linked.add(alarm.id);
    const fence = event.type === 'fence' && event.target && (event.phase === 'enter' || event.phase === 'exit');
    const row: MonitorRow = {
      id: 'event:' + event.id, at: event.occurredAt, title: eventNames[event.type], place: event.address,
      conclusion: event.result, supplement: '', duration: '', abnormal: !!alarm || !!event.assessment || event.phase === 'recovered', iconKey: 'alert',
    };
    if (fence && event.target && (event.phase === 'enter' || event.phase === 'exit')) {
      row.title = fenceTitles[event.target][event.phase];
      row.iconKey = event.target === 'destination' ? 'locate' : event.phase === 'exit' ? 'truck' : 'waypoints';
      milestones.add(fenceStages[event.target][event.phase] + ':' + event.occurredAt);
    } else {
      row.iconKey = event.type === 'parking' ? 'pause' : event.type === 'deviation' ? 'route' : 'alert';
      if (event.phase === 'recovered') {
        row.title += '解除';
        row.agentVerdict = '已恢复';
        row.agentTone = 'green';
      }
      if (alarm) {
        row.agentVerdict = '高风险';
        row.agentTone = 'red';
        row.supplement = [alarmStatus[alarm.status], alarm.reason].filter(Boolean).join(' · ');
      } else if (event.assessment?.verdict === 'reasonable') {
        row.agentVerdict = '低风险';
        row.agentTone = 'green';
      }
      if (event.assessment?.reason) {
        row.analysis = true;
        row.supplement = [...new Set([row.supplement, event.assessment.reason].filter(Boolean))].join('；');
      }
      if (event.type === 'parking' && Number.isFinite(event.durationMinutes) && event.durationMinutes >= 0) row.duration = event.durationMinutes + ' 分钟';
    }
    rows.push(row);
  }
  // A recorded fence transition may already represent the same milestone. Plans are never actuals.
  const actuals: [P1State, number | undefined][] = [
    ['pending', order.createdAt], ['loading', order.enteredAt], ['in_transit', order.departedAt],
    ['arrived', order.arrivedAt], ['completed', order.completedAt],
  ];
  for (const [state, at] of actuals) {
    if (at === undefined || milestones.has(state + ':' + at)) continue;
    rows.push({ id: 'node:' + state, at, title: state === 'pending' ? '运单创建' : stateNames[state], place: '',
      conclusion: state === 'pending' ? '运单已创建' : order.milestoneMethods?.[state] ?? '已记录运输节点',
      iconKey: 'waypoints', abnormal: false, duration: '', supplement: '' });
  }
  for (const alarm of alerts) {
    if (linked.has(alarm.id)) continue;
    rows.push({ id: 'alarm:' + alarm.id, at: alarm.firstAt, title: alarm.kind, place: '', conclusion: alarm.reason,
      supplement: alarmStatus[alarm.status], duration: '', abnormal: true, iconKey: alarm.taskId === 'p1-late' ? 'alarmClock' : 'alert',
      agentVerdict: '高风险', agentTone: 'red' });
  }
  return rows.filter(row => Number.isFinite(row.at)).sort((a, b) => a.at - b.at).map(row => ({ ...row, time: dateText(row.at) }));
}
