<script setup lang="ts">
import { computed } from 'vue';
import { usePhase1 } from '@/pinia/phase1';
import type { P1Anomaly, P1Order } from '@/views/AgentWork/interface';
import { dateText, sessionNames } from './catalog';
import { useAgentWorkNav } from '@/views/AgentWork/useAgentWorkNav';
const props = defineProps<{ orderId: string }>();
const store = usePhase1();
const { goPage } = useAgentWorkNav();
const order = computed(() => store.orders.find(item => item.id === props.orderId));
const fenceTime = (target: 'origin' | 'destination', phase: 'enter' | 'exit', stopId?: string) => store.events
  .filter(event => event.orderId === props.orderId && event.type === 'fence' && (stopId ? event.stopId === stopId : event.target === target) && event.phase === phase)
  .reduce<number | undefined>((first, event) => first === undefined ? event.occurredAt : Math.min(first, event.occurredAt), undefined);
function alertPhase(alert: P1Anomaly, current: P1Order) {
  if (alert.kind === '未经过起始地') return '运单创建';
  if (alert.kind === '晚发') return '装货中';
  if (alert.kind === '晚到' || alert.kind === '未经过目的地') return '卸货中';
  const at = store.events.find(event => event.id === alert.eventId)?.occurredAt ?? alert.firstAt;
  if (current.completedAt !== undefined && at >= current.completedAt) return '已完成';
  if (current.arrivedAt !== undefined && at >= current.arrivedAt) return '卸货中';
  if (current.departedAt !== undefined && at >= current.departedAt) return '在途';
  if (current.enteredAt !== undefined && at >= current.enteredAt) return '装货中';
  if (current.initialization?.state === 'in_transit') return '在途';
  return '运单创建';
}
const phaseOrder = ['运单创建', '装货中', '在途', '卸货中', '已完成'];
const alerts = computed(() => {
  if (!order.value) return [];
  return store.anomalies.filter(item => item.orderId === props.orderId)
    .map(item => ({ ...item, phase: alertPhase(item, order.value!) }))
    .sort((a, b) => phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase) || a.firstAt - b.firstAt);
});
const nodes = computed(() => order.value ? [
  { label: '运单创建', time: order.value.createdAt, method: '待发车', planned: undefined, fence: undefined, current: order.value.state === 'pending' },
  ...(order.value.stops?.length ? order.value.stops.map(stop => ({ label: `${stop.role === 'loading' ? '装货' : '卸货'}点${stop.sequence} · ${stop.place.name}`, time: stop.enteredAt ?? stop.exitedAt, method: stop.enteredAt ? '围栏事件' : undefined, planned: stop.plannedAt, fence: fenceTime(stop.role === 'loading' ? 'origin' : 'destination', 'enter', stop.id), current: order.value?.state === (stop.role === 'loading' ? 'loading' : 'arrived') })) : []),
  { label: '装货中', time: order.value.enteredAt, method: order.value.milestoneMethods?.loading, planned: undefined, fence: fenceTime('origin', 'enter'), current: order.value.state === 'loading' },
  { label: '在途', time: order.value.departedAt, method: order.value.milestoneMethods?.in_transit, planned: order.value.plannedDeparture, fence: fenceTime('origin', 'exit'), current: order.value.state === 'in_transit' },
  { label: '卸货中', time: order.value.arrivedAt, method: order.value.milestoneMethods?.arrived, planned: order.value.plannedArrival, fence: fenceTime('destination', 'enter'), current: order.value.state === 'arrived' },
  { label: '已完成', time: order.value.completedAt, method: order.value.milestoneMethods?.completed, planned: undefined, fence: fenceTime('destination', 'exit'), current: order.value.state === 'completed' },
] : []);
</script>
<template>
  <section v-if="order" class="monitor-order">
    <div class="monitor-heading"><h2>运输监控</h2></div>
    <div v-if="order.network?.status==='unregistered'" class="monitor-alert"><strong>车辆未入网 · 免计费</strong><p>{{ order.network.reason }} · {{ order.network.source }} · {{ dateText(order.network.checkedAt) }}</p><p>相关监听未生效。本单不自动恢复监听，不计入停车、离线等基础事件。</p></div>
    <div v-if="order.routePlan" class="mb-3 text-xs text-slate-600">线路策略：{{ order.routePlan.strategy }} · {{ order.routePlan.status==='ready'?'已规划':'待规划' }}<p>路线版本：{{ order.routePlan.id }} · {{ dateText(order.routePlan.plannedAt) }}</p></div>
    <dl class="monitor-plan"><div><dt>计划开始</dt><dd>{{ dateText(order.plannedDeparture) }}</dd></div><div><dt>计划结束</dt><dd>{{ dateText(order.plannedArrival) }}</dd></div><div><dt>监听状态</dt><dd>{{ sessionNames[order.session] }}</dd></div><div><dt>监控开始</dt><dd>{{ order.monitorStartAt ? dateText(order.monitorStartAt) : '待计算' }}</dd></div><div><dt>最晚监控结束</dt><dd>{{ order.subscriptionRevision ? dateText(order.expiresAt) : '未注册监听' }}</dd></div></dl>
    <ol class="monitor-nodes"><li v-for="node in nodes" :key="node.label" :class="{ recorded: node.time }"><span>{{ node.label }}<template v-if="node.current"> · 当前状态</template></span><strong>{{ node.time ? dateText(node.time) : '未记录' }}</strong><small v-if="node.time">{{ node.method || '运输事件' }}</small><small v-if="node.planned">计划：{{ dateText(node.planned) }}</small><small v-if="node.fence !== undefined || node.label !== '运单创建'">围栏：{{ node.fence === undefined ? '未发生' : dateText(node.fence) }}</small></li></ol>
    <div class="monitor-actions"><button class="monitor-link" @click="goPage('dailyTasks', { monitor: '1', projectId: order.projectId, orderId })">监听结果</button><button class="monitor-link" @click="goPage('dailyTasks', { monitor: '1', projectId: order.projectId, taskId: 'p1-transfer', configure: '1', orderId })">换车检测配置</button><span>换车：{{ order.config.transfer.enabled ? `停车点距离 ≤ ${order.config.transfer.distanceMeters} 米，重合 ≥ ${order.config.transfer.overlapMinutes} 分钟` : '已关闭' }}</span></div>
    <div v-for="alert in alerts" :key="alert.id" class="monitor-alert" :class="{ resolved: alert.status !== 'active' }"><div><strong>{{ alert.phase }} · {{ alert.kind === '未经过起始地' ? '未抵达起点' : alert.kind === '未经过目的地' ? '未抵达终点' : alert.kind }}</strong><span>{{ alert.status === 'active' ? '高风险' : alert.status === 'recovered' ? '已恢复' : '已纠正' }}</span></div><p>{{ alert.reason }}</p><footer><span>{{ dateText(alert.firstAt) }}<template v-if="alert.repeatCount"> · 提醒 {{ alert.repeatCount }} 次</template></span></footer></div>
    <div v-if="order.session === 'cleanup_pending'" class="monitor-actions"><span>监听处理已停止，结束请求待重试</span><button class="monitor-link" @click="store.retryCleanup(order.id)">重试结束</button></div>
  </section>
</template>
<style scoped>
.monitor-order{padding:14px 16px;border-bottom:1px solid #e5eaf2;font-size:12px;color:#334155}.monitor-heading,.monitor-heading>div,.monitor-actions{display:flex;align-items:center;gap:10px}.monitor-heading{justify-content:space-between;margin-bottom:12px}.monitor-heading h2{font-size:13px;font-weight:600}.monitor-heading button{padding:4px;border-radius:4px}.monitor-heading button:hover{background:#eff6ff;color:#2563eb}.monitor-plan{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.monitor-plan dt{font-size:11px;color:#64748b;margin-bottom:4px}.monitor-plan dd{font-size:12px;overflow-wrap:anywhere}.monitor-nodes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px 0}.monitor-nodes li{border-left:1px solid #dce1e8;padding-left:9px}.monitor-nodes li.recorded{border-color:#2563eb}.monitor-nodes span,.monitor-nodes strong,.monitor-nodes small{display:block}.monitor-nodes strong{font-size:11px;font-weight:400;margin-top:4px}.monitor-nodes small{font-size:11px;color:#64748b;margin-top:3px}.monitor-disclosure{margin:10px 0;font-size:11px;line-height:1.8}.monitor-disclosure summary,.monitor-link{color:#1d4ed8;cursor:pointer}.monitor-disclosure p{margin-top:8px}.monitor-actions{flex-wrap:wrap;font-size:11px}.monitor-actions .dialog-button{font-size:12px;min-height:28px}.monitor-alert{border:1px solid #f0dab0;border-radius:6px;background:#fffbeb;color:#78350f;padding:10px;margin-top:12px}.monitor-alert>div,.monitor-alert footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.monitor-alert p{color:#78350f;line-height:1.8;margin:7px 0}.monitor-alert footer{font-size:10px}.monitor-alert footer button{color:#1d4ed8}.monitor-alert.resolved{background:#f8fafc;border-color:#e2e8f0;color:#475569}.monitor-alert.resolved p{color:#475569}
</style>
