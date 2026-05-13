import type { Order, RiskLevel } from '@/types/domain';

export function getRiskOrders(list: Order[]) {
  return list.filter((item) => item.risk === '高风险' || item.risk === '低风险');
}

export function riskTone(risk: RiskLevel) {
  if (risk === '高风险') return 'red';
  if (risk === '低风险') return 'orange';
  return 'green';
}

export function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<T, number>>((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

export function rankByField(list: Order[], field: 'carrier' | 'route' | 'factory') {
  const riskList = getRiskOrders(list);
  const map = riskList.reduce<Record<string, number>>((acc, item) => {
    acc[item[field]] = (acc[item[field]] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function summarizeOrders(list: Order[]) {
  const riskList = getRiskOrders(list);
  const loading = list.filter((item) => item.status === '装货中').length;
  const inTransit = list.filter((item) => item.status === '在途').length;
  const arrived = list.filter((item) => item.status === '已到货' || item.status === '已完成').length;
  const delayed = list.filter((item) => item.delayMinutes > 0).length;
  const carriers = rankByField(list, 'carrier').slice(0, 2).map((item) => item.name).join('、') || '暂无集中承运商';

  return `当前结果共 ${list.length} 单，异常 ${riskList.length} 单，装货中 ${loading} 单，在途 ${inTransit} 单，已到货/完成 ${arrived} 单，预计延误 ${delayed} 单。异常主要集中在 ${carriers}。`;
}

export function parseAgentIntent(text: string) {
  if (/下载|导出|excel/i.test(text)) return { intent: 'download', skill: 'export_exception_orders' };
  if (/报告|日报|简报/i.test(text)) return { intent: 'report', skill: 'generate_daily_report' };
  if (/归因|排名|趋势|上升|承运商|线路/i.test(text)) return { intent: 'analytics', skill: 'analyze_warning_trend' };
  if (/阈值|停车时长|调节/i.test(text)) return { intent: 'threshold', skill: 'recommend_threshold' };
  if (/停车|轨迹|gps|沪A12345/i.test(text)) return { intent: 'detail', skill: 'analyze_order_trace' };
  if (/异常|高风险|低风险/i.test(text)) return { intent: 'risk', skill: 'query_exception_orders' };
  return { intent: 'orders', skill: 'query_monitor_orders' };
}
