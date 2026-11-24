import type { Order, Tone } from '../interface';

export function badgeToneClass(tone: Tone) {
  const map: Record<Tone, string> = {
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-slate-50 text-slate-600 border-slate-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return map[tone];
}

export function projectStatusTone(status: string): Tone {
  if (status === '已连接') return 'green';
  if (status === '授权失效') return 'orange';
  return 'blue';
}

export function getRiskOrders(list: Order[]) {
  return list.filter((item) => item.risk === '高风险' || item.risk === '低风险');
}

export function rankByField(list: Order[], field: 'carrier' | 'factory' | 'route') {
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
  const high = riskList.filter((item) => item.risk === '高风险').length;
  const low = riskList.filter((item) => item.risk === '低风险').length;
  const loading = list.filter((item) => item.status === '装货中').length;
  const inTransit = list.filter((item) => item.status === '在途').length;
  const arrived = list.filter((item) => item.status === '已到货' || item.status === '已完成').length;
  const carriers = rankByField(list, 'carrier')
    .slice(0, 2)
    .map((item) => item.name)
    .join('、') || '暂无集中承运商';
  const issues = Object.entries(
    riskList.reduce<Record<string, number>>((acc, item) => {
      acc[item.issue] = (acc[item.issue] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name)
    .join('、') || '暂无集中异常类型';

  return `当前筛选结果共 ${list.length} 单，异常 ${riskList.length} 单，高风险 ${high} 单、低风险 ${low} 单；装货中 ${loading} 单，在途 ${inTransit} 单，已到货/完成 ${arrived} 单。异常主要集中在 ${carriers}，类型以 ${issues} 为主。`;
}

/** 运单表格「状态」列 */
export function tableStatusPillClass() {
  return 'inline-flex items-center rounded-md px-3 py-1 text-xs font-medium bg-blue-50 text-blue-600';
}

/** 运单表格「风险」列 */
export function tableRiskPillClass(risk: string) {
  const base = 'inline-flex items-center rounded-md px-3 py-1 text-xs font-medium';
  if (risk === '高风险') return `${base} bg-red-50 text-red-600`;
  if (risk === '低风险') return `${base} bg-orange-50 text-orange-600`;
  return `${base} bg-emerald-50 text-emerald-600`;
}

export function metricToneCls(tone: 'gray' | Tone) {
  const map: Record<string, string> = {
    red: 'text-red-600',
    orange: 'text-orange-600',
    green: 'text-emerald-600',
    gray: 'text-slate-900',
  };
  return map[tone] ?? map.gray;
}
