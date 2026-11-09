import type { Order, VehicleTelemetry } from './interface';

function timestamp(value?: string) {
  return value ? Date.parse(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + '+08:00') : NaN;
}

/** A vehicle track is a source; it is not automatically evidence for every waybill on that vehicle. */
export function associateOrderTrajectory(order: Order, source?: VehicleTelemetry) {
  const fields = order.customerRecord?.fields || {};
  const actualStart = timestamp(fields['发车时间'] || fields['签到时间']);
  const plannedStart = timestamp(fields['预约提货时间'] || fields['要求提货时间']);
  const actualEnd = timestamp(fields['到货确认时间'] || fields['签收时间']);
  const plannedEnd = timestamp(fields['预约送货时间'] || fields['要求送达时间']);
  const start = Number.isFinite(actualStart) ? actualStart : plannedStart;
  const end = Math.min(Date.now(), Number.isFinite(actualEnd) ? actualEnd : plannedEnd);
  const confirmed = Number.isFinite(actualStart) && Number.isFinite(actualEnd);
  const empty = (reason: string) => ({ telemetry: undefined, confirmed: false, reason, start: '', end: '', count: 0 });
  if (!source || source.plate !== order.plate) return empty('没有与本运单车牌一致的定位数据');
  if (!Number.isFinite(start) || !Number.isFinite(end)) return empty('缺少起止时间，无法把车辆历史轨迹可靠关联到本运单');
  if (end <= start) return empty('本运单起止时间异常，暂不关联车辆轨迹');
  const track = source.track.filter(p => {
    const time = timestamp(p.timestamp);
    return time >= start && time <= end;
  });
  const locationTime = timestamp(source.location?.timestamp || '');
  const location = locationTime >= start && locationTime <= end ? source.location : null;
  return { confirmed, start: new Date(start).toISOString(), end: new Date(end).toISOString(), count: track.length,
    reason: !track.length ? '本运单运输区间内暂无定位轨迹' : confirmed ? '按实际运输起止时间匹配' : '按计划时间补齐区间匹配，关联待核实；计划区间外轨迹未计入',
    telemetry: { ...source, start: new Date(start).toISOString(), end: new Date(end).toISOString(), location, track } as VehicleTelemetry,
  };
}
