// Local deterministic fixtures: these do not call a production tracking service.
export const stopRiskRules = {
  normal: '没有异常停靠，停靠均为合理休息、交通等待或装卸节点等待。',
  low: '公共停车区主要用于临时停车和休息，单独命中不直接代表装卸货；可结合停靠时长和多车聚集情况升级复核。',
  high: '生产制造类地点通常具备收发货和装卸作业条件，在途车辆中途停靠存在偷卸、串货或异常交付风险，需结合运输授权核实。',
};

export type StopRiskInput = { index: number; startMs: number; endMs: number; distanceKm: number; region: string };

export function createStopRiskFixture(input: StopRiskInput) {
  const category = input.index % 3;
  const tripMinutes = (input.endMs - input.startMs) / 60000;
  if (!Number.isFinite(tripMinutes) || tripMinutes < 1 || !Number.isFinite(input.distanceKm) || input.distanceKm <= 0) throw new Error('运输时间或里程无效');
  const longest = Math.min([15, 35, 75][category]!, Math.max(0.01, Math.floor(tripMinutes * 0.3 * 100) / 100));
  const short = Math.min(8, longest / 2);
  const stops = category === 0
    ? [{ place: `${input.region}沿线服务区`, minutes: longest, risk: '正常', note: '计划内休息，没有异常停靠' }, { place: `${input.region}沿线交通等待区`, minutes: short, risk: '正常', note: '短时交通等待，没有异常停靠' }]
    : [{ place: `${input.region}沿线服务区`, minutes: short, risk: '正常', note: '正常休息' }, { place: `${input.region}${category === 1 ? '公共停车区' : '沿线生产制造园区'}`, minutes: longest, risk: category === 1 ? '低风险' : '高风险', note: category === 1 ? stopRiskRules.low : stopRiskRules.high }, { place: `${input.region}沿线交通等待区`, minutes: short, risk: '正常', note: '短时交通等待' }];
  const totalStopMinutes = stops.reduce((sum, stop) => sum + stop.minutes, 0);
  const travelGap = (tripMinutes - totalStopMinutes) / (stops.length + 1);
  let cursor = input.startMs + travelGap * 60000;
  const timedStops = stops.map((stop) => {
    const startMs = cursor;
    const endMs = startMs + stop.minutes * 60000;
    cursor = endMs + travelGap * 60000;
    return { ...stop, startMs, endMs };
  });
  const speed = Math.ceil(input.distanceKm / ((tripMinutes - totalStopMinutes) / 60) * 1.2);
  return {
    stops: timedStops, longest, abnormalCount: category === 0 ? 0 : 1,
    risk: ['无风险', '低风险', '高风险'][category]!,
    category: ['正常停靠-无风险', '异常停靠-低风险', '异常停靠-高风险'][category]!,
    explanation: [stopRiskRules.normal, stopRiskRules.low, stopRiskRules.high][category]!,
    speed: Math.max(60, speed),
  };
}
