import type { Order, VehicleTelemetry } from './interface';

export function telemetryWindow(orders: Order[], recent: boolean) {
  const now = Date.now();
  if (recent) return { start: new Date(now - 24 * 3600000).toISOString(), end: new Date(now).toISOString() };
  const startTimes = orders.map(order => {
    const f = order.customerRecord?.fields;
    return Date.parse((f?.['发车时间'] || f?.['签到时间'] || f?.['预约提货时间'] || order.startTime).replace(' ', 'T') + '+08:00');
  }).filter(Number.isFinite);
  const start = Math.min(...startTimes, now);
  const endTimes = orders.map(order => {
    const f = order.customerRecord?.fields;
    return Date.parse((f?.['签收时间'] || f?.['到货确认时间'] || '').replace(' ', 'T') + '+08:00');
  }).filter(t => Number.isFinite(t) && t > start);
  const end = Math.min(now, start + 31 * 24 * 3600000, endTimes.length === orders.length ? Math.max(...endTimes) : now);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export async function fetchTelemetry(plate: string, orders: Order[], color: string, recent: boolean): Promise<VehicleTelemetry> {
  const window = telemetryWindow(orders, recent);
  const response = await fetch('/api/company-openapi/telemetry', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plate, color, ...window }), signal: AbortSignal.timeout(180000),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || '车辆数据查询失败');
  return data;
}

export function attachTelemetry(order: Order, telemetry: VehicleTelemetry): Order {
  const { simulation: _simulation, ...original } = order;
  const issue = original.issue === '缺少实时定位或履约依据，待核实' && telemetry.track.length
    ? '已获取关联轨迹，履约状态及到离场仍需核实' : original.issue;
  return { ...original, telemetry, source: '客户单据与车辆监控', updated: telemetry.queriedAt,
    issue: [issue, telemetry.trackError ? `轨迹：${telemetry.trackError}` : ''].filter(Boolean).join('；') };
}

export function formatTelemetryTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未返回';
}
