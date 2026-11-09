import type { Order, SimulatedLocation } from './interface';

// Synthetic warehouse coordinates are used only for this project's monitoring preview.
const cities: Record<string, [number, number]> = {
  厦门市: [118.0894, 24.4798], 惠州市: [114.4162, 23.1118], 中山市: [113.3926, 22.5159], 郑州市: [113.6254, 34.7466],
  茂名市: [110.9255, 21.6627], 重庆市: [106.5516, 29.563], 乌鲁木齐市: [87.6168, 43.8256], 北京市: [116.4074, 39.9042], 天津市: [117.2009, 39.0842], 苏州市: [120.5853, 31.2989],
};
const format = (time: number) => new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export function simulateCustomerOrders(orders: Order[], now = Date.now()): Order[] {
  const ids = [...new Set(orders.map(o => o.dispatchId))];
  return orders.map(order => {
    const group = orders.filter(o => o.dispatchId === order.dispatchId);
    const index = ids.indexOf(order.dispatchId);
    const addresses = [...new Set(group.map(o => o.customerRecord?.fields['收货地址'] ?? ''))];
    const destinations = addresses.map((address, i): [number, number] => {
      const member = group.find(o => o.customerRecord?.fields['收货地址'] === address)!;
      const city = member.route.split(' → ')[1]!;
      const base = cities[city] ?? [114.3, 30.6];
      return [base[0] + i * 0.025, base[1] + i * 0.018];
    });
    const stations: [number, number][] = [[114.6, 30.5], ...destinations];
    const scenario = index % 4;
    const destinationIndex = addresses.indexOf(order.customerRecord?.fields['收货地址'] ?? '');
    const atOwnStop = scenario === 1 && destinationIndex === 0;
    const state = scenario === 1 && !atOwnStop ? '前站等待影响后续送货' : ['正常在途', '送货点等待超时', '预计晚到', '定位中断'][scenario]!;
    const progress = scenario === 1 ? 1 / (stations.length - 1) : 0.35 + ((Math.floor(now / 30000) % 20) / 100);
    const fullTrack: [number, number][] = [];
    for (let leg = 0; leg < stations.length - 1; leg++) {
      const start = stations[leg]!; const end = stations[leg + 1]!;
      for (let j = 0; j <= 30; j++) {
        const t = j / 30;
        fullTrack.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
      }
    }
    const last = Math.max(1, Math.round((fullTrack.length - 1) * progress));
    const track = fullTrack.slice(0, last + 1);
    const simulation: SimulatedLocation = { scenario: state, state, coordinate: track[track.length - 1]!, track,
      speed: scenario === 1 || scenario === 3 ? 0 : 62, timestamp: format(now - (scenario === 3 ? 45 : 0) * 60000),
      arrivedAt: atOwnStop ? format(now - 180 * 60000) : '', stayMinutes: atOwnStop ? 180 : 0 };
    const risk = scenario === 0 ? '无风险' : scenario === 3 || scenario === 1 ? '高风险' : '低风险';
    const issue = scenario === 1 && !atOwnStop ? '模拟车辆在前站停留180分钟，后续送货受影响' : ['暂无模拟异常', '模拟送货点停留180分钟，需协调卸货', '模拟预计晚到45分钟，建议联系收货仓', '模拟定位45分钟未更新，建议联系承运商'][scenario]!;
    return { ...order, simulation, risk, issue, source: '模拟定位监控', updated: simulation.timestamp,
      stops: order.stops?.map(stop => ({ ...stop, coordinate: stop.kind === '装货' ? stations[0]! : destinations[addresses.indexOf(order.customerRecord?.fields['收货地址'] ?? '')]! })) };
  });
}
