<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePhase1 } from '@/pinia/phase1';
import { currentDispatches, type DispatchScenario } from './dispatchScenarios';
import ScenarioTransportDetail from './ScenarioTransportDetail.vue';

const route = useRoute();
const router = useRouter();
const monitoring = usePhase1();
const keyword = ref('');
const statusFilter = ref('全部');
const riskFilter = ref('全部');
const dispatches = computed(currentDispatches);
const activeDispatch = computed(() => dispatches.value.find(item => item.id === String(route.params.dispatchId || '')));
const showMerge = ref(false);
const mergeId = ref('D-MON-001');
const mergeIds = ref<string[]>([]);
const mergeError = ref('');
const mergeCandidates = computed(() => monitoring.orders.filter(order => order.loadType === '零担' && !order.dispatchId && order.monitoringOwner !== 'dispatch'));
function mergeDemoWaybills() {
  if (!monitoring.mergeWaybills(mergeId.value, mergeIds.value)) { mergeError.value = monitoring.error; return; }
  const id = mergeId.value;
  mergeError.value = '';
  showMerge.value = false;
  mergeIds.value = [];
  router.push({ name: 'agent-work-dispatch-detail', params: { dispatchId: id } });
}
function displayStatus(status: string) { return status; }
const filteredDispatches = computed(() => dispatches.value.filter(dispatch => {
  const query = keyword.value.trim().toLowerCase();
  const text = [dispatch.id, dispatch.customer, dispatch.plate, dispatch.driver, dispatch.carrier, ...dispatch.waybills.map(item => item.id), ...dispatch.stops.map(item => item.name)].join(' ').toLowerCase();
  return (!query || text.includes(query))
    && (statusFilter.value === '全部' || displayStatus(dispatch.status) === statusFilter.value)
    && (riskFilter.value === '全部' || dispatch.risk === riskFilter.value);
}));
const linkedWaybillCount = computed(() => filteredDispatches.value.reduce((total, item) => total + item.waybills.length, 0));
const highRiskCount = computed(() => filteredDispatches.value.filter(item => item.risk === '高风险').length);
const averageCoverage = computed(() => {
  const values = filteredDispatches.value.map(item => item.coverage).filter((value): value is number => value !== null);
  return values.length ? `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)}%` : '—';
});
function openDetail(id: string) { router.push({ name: 'agent-work-dispatch-detail', params: { dispatchId: id } }); }
function backToList() { router.push({ name: 'agent-work-dispatches' }); }
function pickupStops(dispatch: DispatchScenario) { return dispatch.stops.filter(item => item.role === '提货'); }
function deliveryStops(dispatch: DispatchScenario) { return dispatch.stops.filter(item => item.role === '卸货'); }
function routeLabel(dispatch: DispatchScenario) {
  const pickups = [...new Set(pickupStops(dispatch).map(item => item.city))].join('、');
  const deliveries = [...new Set(deliveryStops(dispatch).map(item => item.city))].join('、');
  return `${pickups}（${pickupStops(dispatch).length}处）→ ${deliveries}（${deliveryStops(dispatch).length}处）`;
}
function dispatchTags(dispatch: DispatchScenario) {
  const pickups = pickupStops(dispatch).length;
  const deliveries = deliveryStops(dispatch).length;
  return [
    pickups > 1 && deliveries > 1 ? '多装多卸' : pickups > 1 ? '多地提货' : deliveries > 1 ? '多地卸货' : '',
    dispatch.plate.includes('、') ? '多车运输' : '',
  ].filter(Boolean);
}
function routeAddresses(dispatch: DispatchScenario) {
  const pickups = pickupStops(dispatch).map(item => `${item.city} · ${item.name}`).join('\n');
  const deliveries = deliveryStops(dispatch).map(item => `${item.city} · ${item.name}`).join('\n');
  return `提货地址：\n${pickups}\n\n卸货地址：\n${deliveries}`;
}
</script>

<template>
  <div v-if="activeDispatch" class="dispatch-v3-detail">
    <ScenarioTransportDetail :dispatch="activeDispatch" @back="backToList" />
  </div>
  <div v-else class="dispatch-v3-page">
    <header class="dispatch-v3-header"><div><h1>调度单</h1><p>查看调度任务、关联运单和运输扩展信息</p></div><button type="button" class="dispatch-v3-create" @click="showMerge = !showMerge">根据运单生成调度单</button></header>
    <section v-if="showMerge" class="dispatch-v3-merge" aria-label="调度单关联演示"><div><strong>关联零担运单</strong><span>演示接口按单号关联；车辆顺序和司机不一致时不能合并。</span></div><label>调度单号<input v-model.trim="mergeId" maxlength="32" /></label><div class="dispatch-v3-merge-options"><label v-for="waybill in mergeCandidates" :key="waybill.id"><input v-model="mergeIds" type="checkbox" :value="waybill.id" />{{ waybill.id }} · {{ waybill.plate }} · {{ waybill.origin.name }} → {{ waybill.destination.name }}</label></div><p v-if="mergeError" role="alert" class="dispatch-v3-merge-error">{{ mergeError }}</p><button type="button" class="dispatch-v3-create" @click="mergeDemoWaybills">生成调度单</button></section>
    <section class="dispatch-v3-summary" aria-label="调度单汇总">
      <div><strong>{{ filteredDispatches.length }}</strong><span>调度单数量</span></div>
      <div><strong>{{ linkedWaybillCount }}</strong><span>关联运单数量</span></div>
      <div><strong>{{ highRiskCount }}</strong><span>高风险</span></div>
      <div><strong>{{ averageCoverage }}</strong><span>平均轨迹完整率</span></div>
    </section>
    <section class="dispatch-v3-panel">
      <div class="dispatch-v3-filters">
        <label class="dispatch-v3-search">关键词<input v-model="keyword" type="search" placeholder="调度单号 / 运单号 / 车牌 / 地点" /></label>
        <label>状态<select v-model="statusFilter"><option>全部</option><option>待发车</option><option>装货中</option><option>在途</option><option>卸货中</option><option>已完成</option></select></label>
        <label>风险<select v-model="riskFilter"><option>全部</option><option>高风险</option><option>低风险</option><option>无风险</option></select></label>
      </div>
      <div class="dispatch-v3-table-wrap">
        <table class="dispatch-v3-table"><thead><tr><th>调度单</th><th>线路</th><th>计划时间</th><th>车辆 / 司机</th><th>状态</th><th>风险</th><th>关联运单</th><th>操作</th></tr></thead>
          <tbody><tr v-for="dispatch in filteredDispatches" :key="dispatch.id"><td><strong>{{ dispatch.id }}</strong><div class="dispatch-v3-tags"><span v-for="tag in dispatchTags(dispatch)" :key="tag" class="dispatch-v3-tag" :class="tag === '多车运输' ? 'warning' : 'muted'">{{ tag }}</span></div><small>{{ dispatch.customer }} · {{ dispatch.carrier }}</small></td><td><div class="dispatch-v3-route-hover" tabindex="0" :title="routeAddresses(dispatch)"><span>{{ routeLabel(dispatch) }}</span><div class="dispatch-v3-route-tooltip"><strong>提货地址</strong><span v-for="stop in pickupStops(dispatch)" :key="stop.id">{{ stop.city }} · {{ stop.name }}</span><strong>卸货地址</strong><span v-for="stop in deliveryStops(dispatch)" :key="stop.id">{{ stop.city }} · {{ stop.name }}</span></div></div></td><td>{{ dispatch.plannedStart }}<small>至 {{ dispatch.plannedEnd }}</small></td><td>{{ dispatch.plate }}<small>{{ dispatch.driver }}</small></td><td><span class="dispatch-v3-tag" :class="displayStatus(dispatch.status) === '已完成' ? 'success' : 'muted'">{{ displayStatus(dispatch.status) }}</span></td><td><span class="dispatch-v3-tag" :class="dispatch.risk === '高风险' ? 'warning' : dispatch.risk === '无风险' ? 'success' : 'muted'">{{ dispatch.risk }}</span></td><td>{{ dispatch.waybills.length }} 条</td><td><button type="button" class="dispatch-v3-link" @click="openDetail(dispatch.id)">查看详情</button></td></tr></tbody>
        </table>
        <p v-if="!filteredDispatches.length" class="dispatch-v3-empty">没有符合条件的调度单</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dispatch-v3-detail { height: 100%; min-height: 0; overflow: hidden; }
.dispatch-v3-page { height: 100%; overflow: auto; padding: 16px; color: #172b4d; background: #fcfcfc; }
.dispatch-v3-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; border-bottom: 1px solid #e2e2dc; }
.dispatch-v3-create { border: 1px solid #1d4ed8; border-radius: 5px; padding: 7px 12px; background: #2563eb; color: #fff; font-size: 12px; cursor: pointer; }
.dispatch-v3-merge { display: grid; gap: 10px; margin-top: 14px; padding: 14px; border: 1px solid #dbe7f8; border-radius: 6px; background: #fff; font-size: 12px; }
.dispatch-v3-merge > div:first-child { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; }.dispatch-v3-merge > div:first-child span { color: #64748b; }
.dispatch-v3-merge > label { display: flex; align-items: center; gap: 8px; }.dispatch-v3-merge > label input { border: 1px solid #cfd9dc; border-radius: 4px; padding: 6px 8px; }
.dispatch-v3-merge-options { display: grid; gap: 7px; }.dispatch-v3-merge-options label { display: flex; align-items: center; gap: 7px; }
.dispatch-v3-merge-error { color: #b91c1c; }.dispatch-v3-merge > button { justify-self: start; }
.dispatch-v3-header h1 { margin: 0; font-size: 15px; font-weight: 650; }
.dispatch-v3-header p { margin: 3px 0 0; color: #64748b; font-size: 12px; }
.dispatch-v3-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 16px 0; }
.dispatch-v3-summary > div { display: flex; flex-direction: column-reverse; gap: 3px; padding: 12px; border: 1px solid #e2e2dc; border-radius: 6px; background: #fff; }
.dispatch-v3-summary strong { font-size: 20px; line-height: 26px; }
.dispatch-v3-summary span, .dispatch-v3-table small { color: #64748b; font-size: 11px; }
.dispatch-v3-panel { border: 1px solid #e2e2dc; border-radius: 6px; background: #fff; }
.dispatch-v3-filters { display: flex; align-items: end; gap: 12px; flex-wrap: wrap; padding: 14px 16px; border-bottom: 1px solid #e2e2dc; color: #64748b; font-size: 11px; }
.dispatch-v3-filters label { display: flex; flex-direction: column; gap: 5px; }
.dispatch-v3-filters input, .dispatch-v3-filters select { height: 34px; min-width: 120px; padding: 5px 8px; border: 1px solid #cfd9dc; border-radius: 4px; background: #fff; color: #334155; font-size: 12px; }
.dispatch-v3-search { flex: 1; min-width: 240px; }
.dispatch-v3-search input { width: 100%; }
.dispatch-v3-table-wrap { overflow-x: auto; }
.dispatch-v3-table { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 12px; }
.dispatch-v3-table th, .dispatch-v3-table td { padding: 13px 14px; border-bottom: 1px solid #edf0f0; text-align: left; vertical-align: middle; }
.dispatch-v3-table th { background: #f7f8f7; color: #64748b; font-weight: 500; }
.dispatch-v3-table td strong, .dispatch-v3-table td small { display: block; }
.dispatch-v3-table td small { margin-top: 3px; }
.dispatch-v3-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.dispatch-v3-tags + small { margin-top: 5px; }
.dispatch-v3-tag { display: inline-flex; padding: 2px 7px; border-radius: 4px; font-size: 11px; line-height: 18px; }
.dispatch-v3-tag.success { color: #15803d; background: #f0fdf4; }
.dispatch-v3-tag.warning { color: #b45309; background: #fffbeb; }
.dispatch-v3-tag.muted { color: #475569; background: #f1f5f9; }
.dispatch-v3-link { padding: 0; border: 0; color: #2563eb; background: transparent; cursor: pointer; }
.dispatch-v3-route-hover { position: relative; display: inline-block; max-width: 100%; color: #334155; cursor: help; outline: none; }
.dispatch-v3-route-hover > span { border-bottom: 1px dashed #94a3b8; }
.dispatch-v3-route-tooltip { position: absolute; z-index: 20; top: calc(100% + 8px); left: 0; display: none; width: 300px; padding: 10px 12px; border: 1px solid #dbe3ea; border-radius: 6px; background: #fff; box-shadow: 0 8px 24px rgb(15 23 42 / 14%); }
.dispatch-v3-route-hover:hover .dispatch-v3-route-tooltip, .dispatch-v3-route-hover:focus .dispatch-v3-route-tooltip, .dispatch-v3-route-hover:focus-within .dispatch-v3-route-tooltip { display: flex; flex-direction: column; gap: 4px; }
.dispatch-v3-route-tooltip strong { margin-top: 3px; color: #526887; font-size: 11px; font-weight: 600; }
.dispatch-v3-route-tooltip strong:first-child { margin-top: 0; }
.dispatch-v3-route-tooltip span { color: #172b4d; font-size: 12px; line-height: 18px; }
.dispatch-v3-empty { padding: 35px; color: #64748b; text-align: center; }
@media (max-width: 700px) { .dispatch-v3-page { padding: 10px; } .dispatch-v3-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } }
</style>
