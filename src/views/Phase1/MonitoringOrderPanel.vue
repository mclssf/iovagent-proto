<script setup lang="ts">
import { computed } from 'vue';
import { usePhase1 } from '@/pinia/phase1';
import { dateText, sessionNames } from './catalog';
import { anomalyStage, transportStages } from './orderStages';
import { useAgentWorkNav } from '@/views/AgentWork/useAgentWorkNav';

const props = defineProps<{ orderId: string }>();
const store = usePhase1();
const { goPage } = useAgentWorkNav();
const order = computed(() => store.orders.find(item => item.id === props.orderId));
function fenceTime(target: 'origin' | 'destination', phase: 'enter' | 'exit') {
  return store.events.filter(event => event.orderId === props.orderId && event.type === 'fence' && event.target === target && event.phase === phase)
    .reduce<number | undefined>((at, event) => at === undefined ? event.occurredAt : Math.min(at, event.occurredAt), undefined);
}
const alerts = computed(() => order.value ? store.anomalies.filter(item => item.orderId === props.orderId)
  .map(item => ({ ...item, stage: anomalyStage(item, order.value!, store.events) }))
  .sort((a, b) => transportStages.indexOf(a.stage) - transportStages.indexOf(b.stage) || a.firstAt - b.firstAt) : []);
const nodes = computed(() => order.value ? [
  { label: '运单创建', time: order.value.createdAt, method: '待发车', planned: undefined, fence: undefined, current: order.value.state === 'pending' },
  { label: '装货中', time: order.value.enteredAt, method: order.value.milestoneMethods?.loading, planned: undefined, fence: fenceTime('origin', 'enter'), current: order.value.state === 'loading' },
  { label: '在途', time: order.value.departedAt, method: order.value.milestoneMethods?.in_transit, planned: order.value.plannedDeparture, fence: fenceTime('origin', 'exit'), current: order.value.state === 'in_transit' },
  { label: '已到达', time: order.value.arrivedAt, method: order.value.milestoneMethods?.arrived, planned: order.value.plannedArrival, fence: fenceTime('destination', 'enter'), current: order.value.state === 'arrived' },
  { label: '已完成', time: order.value.completedAt, method: order.value.milestoneMethods?.completed, planned: undefined, fence: fenceTime('destination', 'exit'), current: order.value.state === 'completed' },
] : []);
</script>

<template>
  <section v-if="order" class="monitor-order">
    <div class="monitor-heading"><h2>运输监控</h2></div>
    <div v-if="order.network?.status === 'unregistered'" class="monitor-alert"><strong>车辆未入网<template v-if="order.billingExempt"> · 免计费</template></strong><p>{{ order.network.reason }} · {{ order.network.source }} · {{ dateText(order.network.checkedAt) }}</p><p>相关监听未生效。本单不自动恢复监听，不计入停车、离线等基础事件。</p></div>
    <div v-if="order.routePlan" class="mb-3 text-xs text-slate-600">线路策略：{{ order.routePlan.strategy }} · {{ order.routePlan.status === 'ready' ? '已规划' : '待规划' }}<p>路线版本：{{ order.routePlan.id }} · {{ dateText(order.routePlan.plannedAt) }}</p></div>
    <dl class="monitor-plan"><div><dt>预计出发</dt><dd>{{ dateText(order.plannedDeparture) }}</dd></div><div><dt>预计到达</dt><dd>{{ dateText(order.plannedArrival) }}</dd></div><div><dt>监听状态</dt><dd>{{ sessionNames[order.session] }}</dd></div><div><dt>监听截止</dt><dd>{{ order.subscriptionRevision ? dateText(order.expiresAt) : '未注册监听' }}</dd></div></dl>
    <ol class="monitor-nodes">
      <li v-for="node in nodes" :key="node.label" :class="{ recorded: node.time }">
        <span>{{ node.label }}<template v-if="node.current"> · 当前状态</template></span>
        <strong>{{ node.time ? dateText(node.time) : '未记录' }}</strong>
        <small v-if="node.time">{{ node.method || '运输事件' }}</small>
        <small v-if="node.planned">计划：{{ dateText(node.planned) }}</small>
        <small v-if="node.fence !== undefined || node.label !== '运单创建'">围栏：{{ node.fence === undefined ? '未发生' : dateText(node.fence) }}</small>
      </li>
    </ol>
    <div class="monitor-actions"><button class="monitor-link" @click="goPage('dailyTasks', { monitor: '1', projectId: order.projectId, orderId })">监听结果</button></div>
    <div v-for="alert in alerts" :key="alert.id" class="monitor-alert" :class="{ resolved: alert.status !== 'active' }">
      <div><strong>{{ alert.stage }} · {{ alert.kind === '未经过起始地' ? '未抵达起点' : alert.kind === '未经过目的地' ? '未抵达终点' : alert.kind }}</strong><span>{{ alert.status === 'active' ? '高风险' : alert.status === 'recovered' ? '已恢复' : '已纠正' }}</span></div>
      <p>{{ alert.reason }}</p><footer><span>{{ dateText(alert.firstAt) }}<template v-if="alert.repeatCount"> · 提醒 {{ alert.repeatCount }} 次</template></span></footer>
    </div>
    <div v-if="order.session === 'cleanup_pending'" class="monitor-actions"><span>监听处理已停止，结束请求待重试</span><button class="monitor-link" @click="store.retryCleanup(order.id)">重试结束</button></div>
  </section>
</template>

<style scoped>
.monitor-order{padding:14px 16px;border-bottom:1px solid #e5eaf2;font-size:12px;color:#334155}.monitor-heading,.monitor-actions{display:flex;align-items:center;gap:10px}.monitor-heading{justify-content:space-between;margin-bottom:12px}.monitor-heading h2{font-size:13px;font-weight:600}.monitor-plan{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.monitor-plan dt{font-size:11px;color:#64748b;margin-bottom:4px}.monitor-plan dd{font-size:12px;overflow-wrap:anywhere}.monitor-nodes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px 0}.monitor-nodes li{border-left:1px solid #dce1e8;padding-left:9px}.monitor-nodes li.recorded{border-color:#2563eb}.monitor-nodes span,.monitor-nodes strong,.monitor-nodes small{display:block}.monitor-nodes strong{font-size:11px;font-weight:400;margin-top:4px}.monitor-nodes small{font-size:11px;color:#64748b;margin-top:3px}.monitor-link{color:#1d4ed8;cursor:pointer}.monitor-actions{flex-wrap:wrap;font-size:11px}.monitor-alert{border:1px solid #f0dab0;border-radius:6px;background:#fffbeb;color:#78350f;padding:10px;margin-top:12px}.monitor-alert>div,.monitor-alert footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.monitor-alert strong{min-width:0;overflow-wrap:anywhere}.monitor-alert>div>span{flex-shrink:0}.monitor-alert p{color:#78350f;line-height:1.8;margin:7px 0}.monitor-alert footer{font-size:10px}.monitor-alert.resolved{background:#f8fafc;border-color:#e2e8f0;color:#475569}.monitor-alert.resolved p{color:#475569}
</style>
