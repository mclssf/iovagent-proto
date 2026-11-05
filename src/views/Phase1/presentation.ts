import type { Order, P1Config, P1Order, P1SkillId } from '@/views/AgentWork/interface';
import { dateText, stateNames } from './catalog';
import { monitoringSkillEnabled } from '@/pinia/phase1';

export const monitoringProjectId = 'MONITOR-EAST';
export const monitoringProject = { id: monitoringProjectId, name: '华东运输履约监控', status: '已连接', sync: '持续更新', total: 7, risk: 3, tmsUrl: '', tmsUser: '', keyword: '', statusFilter: '全部', skillIds: ['p1-status', 'p1-parking', 'p1-offline', 'p1-deviation', 'p1-late'], quickPrompts: ['查询 WB-MON-001 的监听结果', '查看 WB-MON-003 未恢复异常', '查询 WB-MON-006 监控状态'] };
export const monitoringStateText = (order: P1Order) => stateNames[order.state];
export function monitoringOrder(order: P1Order, issues: string[]): Order {
  return { riskTags: order.network?.status==='unregistered'?['车辆未入网']:[],billingExempt:!!order.billingExempt,monitoringId: order.id, id: order.id, plate: order.plate, driver: order.driver, carrier: '未提供', route: `${order.origin.name} → ${order.destination.name}`, factory: order.origin.name, status: stateNames[order.state], risk: issues.length ? '待核实' : '无风险', issue: issues.join('、') || (order.network?.status==='unregistered'?'车辆未入网，相关监听未生效':'暂无未恢复异常'), source: order.source, startTime: dateText(order.createdAt), updated: dateText(order.initialization?.at ?? order.createdAt), eta: order.plannedArrival ? dateText(order.plannedArrival) : '待补充' };
}
export function monitoringRule(c: P1Config, id: P1SkillId) {
  if (id === 'p1-parking' || id === 'p1-offline') {
    const type = id === 'p1-parking' ? 'parking' : 'offline';
    return `持续 ${c[type].thresholdMinutes} 分钟 · 每 ${c[type].repeatMinutes} 分钟提醒${c.assessments[type].enabled ? ' · 环境辅助研判' : ''}`;
  }
  if (id === 'p1-deviation') return `线路策略：${c.deviation.routeStrategy??'更多人选择'} · 偏离 ${c.deviation.radiusMeters} 米 · 每 ${c.deviation.repeatMinutes} 分钟提醒`;
  if (id === 'p1-late') return `晚发 ${c.lateDeparture.enabled ? c.lateDeparture.graceMinutes + ' 分钟' : '关闭'} · 晚到 ${c.lateArrival.enabled ? c.lateArrival.graceMinutes + ' 分钟' : '关闭'}${c.missingPass?.origin || c.missingPass?.destination ? ' · 检查经过记录' : ''}`;
  if (id === 'p1-weather') return '次日生效 · 有效天气预警触发';
  return '起终点进出围栏 · 自动记录运输节点';
}
export const monitoringTaskStatus = (c: P1Config, id: P1SkillId) => monitoringSkillEnabled(c, id) ? '运行中' : '已暂停';
