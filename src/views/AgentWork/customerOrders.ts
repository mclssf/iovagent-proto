import type { Order } from './interface';
import records from './customerOrders.json';

export const customerOrders: Order[] = records.map((record) => {
  const fields = record.customerRecord.fields;
  const addressId = (kind: string, address: string) => `${record.dispatchId}:${kind}:${address}`;
  return { ...record, transportMode: record.transportMode as Order['transportMode'], stops: [
    { id: addressId('装货', fields['发货地址']!), name: `${record.factory}（提货点）`, address: fields['发货地址'], kind: '装货' },
    { id: addressId('卸货', fields['收货地址']!), name: fields['收货地址']!, address: fields['收货地址'], kind: '卸货' },
  ] };
});
export function reviewCustomerOrder(order: Order, stayThreshold: number): Order {
  const fields = order.customerRecord?.fields;
  if (!fields) return order;
  const parse = (key: string) => fields[key] ? Date.parse(fields[key]!.replace(' ', 'T')) : NaN;
  const stay = Math.round((parse('发车时间') - parse('签到时间')) / 60000);
  const arrival = parse('到货确认时间');
  const due = parse('预约送货时间');
  const issues: string[] = [];
  if (Number.isFinite(stay) && stay > stayThreshold) issues.push(`提货在场${stay}分钟，超过${stayThreshold}分钟复核阈值（含作业时间）`);
  if (Number.isFinite(arrival) && Number.isFinite(due) && arrival > due) issues.push(`到货晚于预约${Math.round((arrival - due) / 60000)}分钟`);
  return { ...order, risk: issues.length ? '低风险' : '待核实', issue: issues.length ? issues.join('；') : '缺少实时定位或履约依据，待核实', source: '客户快照规则复核' };
}
