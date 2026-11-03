<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElDatePicker, ElForm, ElFormItem, ElMessage } from 'element-plus';
import { Icon } from '@packages/icon';
import AppDialog from '@/components/AppDialog.vue';
import { usePhase1 } from '@/pinia/phase1';
import { dateText, sessionNames, stateNames } from './catalog';
import type { P1State } from '@/views/AgentWork/interface';
import { strokeIconPaths } from '@/views/AgentWork/strokeIconPaths';
import { useAgentWorkNav } from '@/views/AgentWork/useAgentWorkNav';
import CorrectionDialog from './CorrectionDialog.vue';
const props = defineProps<{ orderId: string }>();
const store = usePhase1();
const { goPage } = useAgentWorkNav();
const order = computed(() => store.orders.find(item => item.id === props.orderId));
const stateCorrection = ref(false);
const correcting = ref('');
const editingPlan = ref(false);
const departure = ref<Date | null>(null);
const arrival = ref<Date | null>(null);
const alerts = computed(() => store.anomalies.filter(item => item.orderId === props.orderId));
const nodes = computed(() => order.value ? [
  { label: '装货', time: order.value.enteredAt, method: order.value.milestoneMethods?.loading },
  { label: '发车', time: order.value.departedAt, method: order.value.milestoneMethods?.in_transit },
  { label: '到达', time: order.value.arrivedAt, method: order.value.milestoneMethods?.arrived },
  { label: '完成', time: order.value.completedAt, method: order.value.milestoneMethods?.completed },
] : []);
const next = computed(() => ({ pending: { state: 'loading', label: '开始装货' }, loading: { state: 'in_transit', label: '确认发车' }, in_transit: { state: 'arrived', label: '确认到达' }, arrived: { state: 'completed', label: '确认完成' } }[order.value?.state ?? 'pending']));
function progress() { if (next.value) { const error = store.progress(props.orderId, next.value.state as P1State); if (error) ElMessage.warning(error); } }
function editPlan() { departure.value = order.value?.plannedDeparture ? new Date(order.value.plannedDeparture) : null; arrival.value = order.value?.plannedArrival ? new Date(order.value.plannedArrival) : null; editingPlan.value = true; }
function savePlan() {
  if (!order.value) return;
  const start = departure.value?.getTime() ?? null, end = arrival.value?.getTime() ?? null;
  if (start !== null && end !== null && end < start) { ElMessage.warning('预计到达不能早于预计出发'); return; }
  order.value.plannedDeparture = start; order.value.plannedArrival = end;
  store.allLog(order.value, '配置', '计划时间已更新，原监听截止时间不变。');
  store.correctLate(order.value); store.tick(); editingPlan.value = false;
}
</script>
<template>
  <section v-if="order" class="monitor-order">
    <div class="monitor-heading"><h2>运输监控</h2><div><button title="修改计划" aria-label="修改运输计划" @click="editPlan"><Icon :svg="strokeIconPaths.alarmClock" :size="14" /></button><button title="纠正运输状态" aria-label="纠正运输状态" @click="stateCorrection = true"><Icon :svg="strokeIconPaths.edit" :size="14" /></button></div></div>
    <dl class="monitor-plan"><div><dt>预计出发</dt><dd>{{ dateText(order.plannedDeparture) }}</dd></div><div><dt>预计到达</dt><dd>{{ dateText(order.plannedArrival) }}</dd></div><div><dt>监听状态</dt><dd>{{ sessionNames[order.session] }}</dd></div><div><dt>监听截止</dt><dd>{{ order.subscriptionRevision ? dateText(order.expiresAt) : '未注册监听' }}</dd></div></dl>
    <details v-if="order.initialization" class="monitor-disclosure"><summary>状态初始化依据</summary><p>{{ order.initialization.basis }}</p></details>
    <ol class="monitor-nodes"><li v-for="node in nodes" :key="node.label" :class="{ recorded: node.time }"><span>{{ node.label }}</span><strong>{{ node.time ? dateText(node.time) : '未记录' }}</strong><small v-if="node.time">{{ node.method || '运输事件' }}</small></li></ol>
    <div class="monitor-actions"><button v-if="next && !['stopped', 'cleanup_pending'].includes(order.session)" class="dialog-button" @click="progress">{{ next.label }}</button><button class="monitor-link" @click="goPage('dailyTasks', { monitor: '1', projectId: order.projectId, orderId })">监听结果</button></div>
    <details v-if="order.corrections?.length" class="monitor-disclosure"><summary>状态纠正记录</summary><p v-for="(record, index) in order.corrections" :key="index">{{ dateText(record.at) }} · {{ record.before }} → {{ record.after }}；{{ record.reason }}</p></details>
    <div v-for="alert in alerts" :key="alert.id" class="monitor-alert" :class="{ resolved: alert.status !== 'active' }"><div><strong>{{ alert.kind }}</strong><span>{{ alert.status === 'active' ? '待核实' : alert.status === 'corrected' ? '已纠正' : '已恢复' }}</span></div><p>{{ alert.reason }}</p><footer><span>{{ dateText(alert.firstAt) }}<template v-if="alert.repeatCount"> · 提醒 {{ alert.repeatCount }} 次</template></span><button @click="correcting = alert.id">纠正</button></footer></div>
    <div v-if="order.session === 'cleanup_pending'" class="monitor-actions"><span>监听处理已停止，结束请求待重试</span><button class="monitor-link" @click="store.retryCleanup(order.id)">重试结束</button></div>
    <details v-else-if="!['stopped'].includes(order.session)" class="monitor-disclosure"><summary>监听管理</summary><div class="monitor-actions"><span>结束后保留历史事件，不改变运输状态</span><button class="monitor-link" @click="store.stop(order.id)">结束监听</button></div></details>
    <CorrectionDialog v-if="stateCorrection" :id="order.id" :state="order.state" @close="stateCorrection = false" />
    <CorrectionDialog v-if="correcting" :id="correcting" @close="correcting = ''" />
    <AppDialog v-model="editingPlan" title="运输计划" width="460px"><ElForm label-position="top"><ElFormItem label="预计出发"><ElDatePicker v-model="departure" type="datetime" placeholder="选择出发时间" /></ElFormItem><ElFormItem label="预计到达"><ElDatePicker v-model="arrival" type="datetime" placeholder="选择到达时间" /></ElFormItem></ElForm><template #footer><div class="dialog-actions"><button class="dialog-button" @click="editingPlan = false">取消</button><button class="dialog-button dialog-primary" @click="savePlan">保存</button></div></template></AppDialog>
  </section>
</template>
<style scoped>
.monitor-order{padding:14px 16px;border-bottom:1px solid #e5eaf2;font-size:12px;color:#334155}.monitor-heading,.monitor-heading>div,.monitor-actions{display:flex;align-items:center;gap:10px}.monitor-heading{justify-content:space-between;margin-bottom:12px}.monitor-heading h2{font-size:13px;font-weight:600}.monitor-heading button{padding:4px;border-radius:4px}.monitor-heading button:hover{background:#eff6ff;color:#2563eb}.monitor-plan{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.monitor-plan dt{font-size:11px;color:#64748b;margin-bottom:4px}.monitor-plan dd{font-size:12px;overflow-wrap:anywhere}.monitor-nodes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:12px 0}.monitor-nodes li{border-left:1px solid #dce1e8;padding-left:9px}.monitor-nodes li.recorded{border-color:#2563eb}.monitor-nodes span,.monitor-nodes strong,.monitor-nodes small{display:block}.monitor-nodes strong{font-size:11px;font-weight:400;margin-top:4px}.monitor-nodes small{font-size:11px;color:#64748b;margin-top:3px}.monitor-disclosure{margin:10px 0;font-size:11px;line-height:1.8}.monitor-disclosure summary,.monitor-link{color:#1d4ed8;cursor:pointer}.monitor-disclosure p{margin-top:8px}.monitor-actions{flex-wrap:wrap;font-size:11px}.monitor-actions .dialog-button{font-size:12px;min-height:28px}.monitor-alert{border:1px solid #f0dab0;border-radius:6px;background:#fffbeb;color:#78350f;padding:10px;margin-top:12px}.monitor-alert>div,.monitor-alert footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.monitor-alert p{color:#78350f;line-height:1.8;margin:7px 0}.monitor-alert footer{font-size:10px}.monitor-alert footer button{color:#1d4ed8}.monitor-alert.resolved{background:#f8fafc;border-color:#e2e8f0;color:#475569}.monitor-alert.resolved p{color:#475569}
</style>
