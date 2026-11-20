<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElOption, ElSelect } from 'element-plus';
import { Icon } from '@packages/icon';
import { monitoringSkillEnabled, usePhase1 } from '@/pinia/phase1';
import { phaseSkills, dateText, monitorSkillId, monitorTaskCode } from './catalog';
import { monitoringRule } from './presentation';
import { useMonitorHours } from './useMonitorHours';
import type { P1SkillId } from '@/views/AgentWork/interface';
import { strokeIconPaths } from '@/views/AgentWork/strokeIconPaths';
import { useAgentWorkNav } from '@/views/AgentWork/useAgentWorkNav';
import MonitoringConfigDialog from './MonitoringConfigDialog.vue';
const props = defineProps<{ projectId: string }>();
const store = usePhase1();
const route = useRoute();
const { goPage } = useAgentWorkNav();
const search = ref('');
const status = ref('all');
const selectedId = ref<P1SkillId>();
const editing = ref<P1SkillId>();
const showInfo = ref(false);
const orderFilter = ref('');
const config = computed(() => store.config(props.projectId));
const tasks = computed(() => phaseSkills.filter(skill => config.value.selectedSkills.includes(skill.id)));
const selected = computed(() => tasks.value.find(skill => skill.id === selectedId.value));
const orders = computed(() => store.orders.filter(order => order.projectId === props.projectId));
const visible = computed(() => tasks.value.filter(skill =>
  `${monitorTaskCode(skill.id)} ${skill.name} ${monitoringRule(config.value, skill.id)}`.toLowerCase().includes(search.value.trim().toLowerCase())
  && (status.value === 'all' || monitoringSkillEnabled(config.value, skill.id) === (status.value === 'running'))));
const { hours, refresh } = useMonitorHours(computed(() => props.projectId), computed(() => tasks.value.map(task => task.id)));
const results = computed(() => selected.value ? hours(selected.value.id, orderFilter.value) : []);
const resultCount = (id: P1SkillId) => hours(id).length;
const relatedOrders = computed(() => orders.value.filter(order => selected.value && order.config.selectedSkills.includes(selected.value.id)).length);
const lastSettlement = computed(() => selected.value && hours(selected.value.id)[0]?.end);
const pageSize = 10;
const page = ref(1);
const pageCount = computed(() => Math.max(1, Math.ceil(results.value.length / pageSize)));
const visibleHours = computed(() => results.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const invalidOrder = computed(() => !!orderFilter.value && !orders.value.some(order => order.id === orderFilter.value));
const requestedTask = computed(() => monitorSkillId(route.query.taskCode ?? route.query.monitorTaskId ?? route.query.taskId));
const requestedOrder = computed(() => route.query.waybillId ?? route.query.orderId);
watch([() => props.projectId, requestedTask, requestedOrder], ([projectId, task, order]) => {
  editing.value = undefined;
  selectedId.value = route.query.projectId && route.query.projectId !== projectId ? undefined : task;
  orderFilter.value = typeof order === 'string' ? order : '';
  page.value = 1;
}, { immediate: true });
watch(() => props.projectId, () => { search.value = ''; status.value = 'all'; });
watch(selectedId, () => { showInfo.value = false; page.value = 1; });
watch(orderFilter, () => { page.value = 1; });
watch(pageCount, count => { if (page.value > count) page.value = count; });
function refreshReport() {
  refresh();
  ElMessage.success('监听数据已刷新');
}
function toggle(id: P1SkillId) {
  const next = store.config(props.projectId);
  if (!monitoringSkillEnabled(next, id) && !(next.pausedSkillIds ?? []).includes(id) && id !== 'p1-weather') { editing.value = id; return; }
  next.pausedSkillIds = monitoringSkillEnabled(next, id) ? [...new Set([...(next.pausedSkillIds ?? []), id])] : (next.pausedSkillIds ?? []).filter(value => value !== id);
  if (id === 'p1-weather' && !next.pausedSkillIds.includes(id)) next.weather.enabled = true;
  if (!store.saveConfig(props.projectId, next, next.version)) ElMessage.error(store.error);
}
</script>
<template>
  <div class="dt-page-body" :class="{ 'has-panel': selected }">
    <div class="dt-task-column">
      <div class="dt-list-toolbar"><div class="dt-list-heading"><span>{{ tasks.length }} 项监听 · {{ tasks.filter(skill => monitoringSkillEnabled(config, skill.id)).length }} 项运行中</span><button type="button" class="dt-icon" title="刷新监听任务" aria-label="刷新监听任务" @click="refreshReport"><Icon :svg="strokeIconPaths.refresh" :size="14" /></button></div><div class="dt-filters"><div class="dt-search"><Icon :svg="strokeIconPaths.search" :size="14" /><input v-model="search" placeholder="搜索监听任务" aria-label="搜索监听任务" /></div><select v-model="status" aria-label="监听任务状态"><option value="all">全部状态</option><option value="running">运行中</option><option value="paused">已暂停</option></select></div></div>
      <section class="dt-task-area" aria-label="系统监听任务"><div v-if="visible.length" class="dt-task-grid">
        <article v-for="skill in visible" :key="skill.id" class="dt-task-card" :class="{ selected: selectedId === skill.id }">
          <button class="dt-task-main" :aria-label="`查看监听 ${skill.name}`" @click="selectedId = skill.id"><div class="dt-task-heading"><span class="dt-task-symbol"><Icon :svg="strokeIconPaths[skill.icon]" :size="17" /></span><h2>{{ skill.name }}</h2><span class="dt-badge" :class="{ blue: monitoringSkillEnabled(config, skill.id) }">{{ monitoringSkillEnabled(config, skill.id) ? '运行中' : '已暂停' }}</span></div><p class="dt-task-description">{{ monitoringRule(config, skill.id) }}</p></button>
          <footer class="dt-task-footer"><div class="dt-task-meta">{{ resultCount(skill.id) }} 条小时结果</div><div class="dt-task-actions"><button class="dt-icon" :aria-label="`编辑监听 ${skill.name}`" title="编辑" @click="editing = skill.id"><Icon :svg="strokeIconPaths.edit" :size="14" /></button><button class="dt-icon" :aria-label="`${monitoringSkillEnabled(config, skill.id) ? '暂停' : '启动'}监听 ${skill.name}`" :title="monitoringSkillEnabled(config, skill.id) ? '暂停' : '启动'" @click="toggle(skill.id)"><Icon :svg="monitoringSkillEnabled(config, skill.id) ? strokeIconPaths.pause : strokeIconPaths.play" :size="14" /></button></div></footer>
        </article>
      </div><div v-else class="dt-empty compact"><Icon :svg="strokeIconPaths.locate" :size="26" /><h2>{{ tasks.length ? '没有匹配的监听任务' : '暂无系统任务' }}</h2></div></section>
    </div>
    <aside v-if="selected" class="dt-run-panel" aria-label="监听任务运行面板">
      <header class="dt-run-header"><div class="dt-title"><h2>{{ selected.name }}</h2></div><div class="dt-actions"><button class="dt-background-toggle" :aria-expanded="showInfo" @click="showInfo = !showInfo">任务信息</button><button class="dt-icon" aria-label="关闭监听结果" title="关闭" @click="selectedId = undefined"><Icon :svg="strokeIconPaths.x" :size="16" /></button></div></header>
      <div class="dt-run-body"><div class="dt-run-main"><div class="dt-run-scroll">
        <div class="dt-run-section-heading"><h3>小时执行结果 <span>{{ results.length }}</span></h3><button type="button" class="dt-icon" title="刷新结果" aria-label="刷新结果" @click="refreshReport"><Icon :svg="strokeIconPaths.refresh" :size="14" /></button></div>
        <ElSelect v-model="orderFilter" class="monitor-order-filter" filterable clearable :value-on-clear="''" aria-label="监听运单范围" placeholder="全部运单，可搜索运单号或车牌" no-match-text="没有匹配的运单">
          <ElOption v-for="order in orders" :key="order.id" :value="order.id" :label="order.id + ' · ' + order.plate" />
        </ElSelect>
        <section v-for="result in visibleHours" :key="result.start" class="dt-result-section">
          <div class="dt-run-section-heading"><strong>{{ dateText(result.start) }}—{{ dateText(result.end) }}</strong><span class="dt-badge">已结算</span></div>
          <p class="dt-run-result">监控运单 {{ result.monitoredOrders }} 单 · 事件 {{ result.eventCount }} 条 <template v-if="selectedId === 'p1-status'">· 状态更新 {{ result.statusUpdates }} 次</template><template v-else>· 高风险 {{ result.highRisk }} 条 · 低风险 {{ result.lowRisk }} 条</template></p>
          <div v-for="detail in result.details" :key="detail.id" class="mt-2 border-t pt-2 text-xs text-slate-700">
            <strong>{{ detail.orderId }} · {{ detail.plate }}</strong><p>{{ detail.text }}</p>
            <p class="dt-progress-counts">{{ dateText(detail.occurredAt) }} · {{ detail.source }}</p>
            <button v-if="detail.orderId" class="dt-text-button" @click="goPage('detail', { orderId: detail.orderId, projectId })">运单详情</button>
          </div>
          <p v-if="!result.details.length" class="dt-progress-counts">本小时无事件</p>
        </section>
        <div v-if="!results.length" class="dt-empty compact"><h2>{{ invalidOrder ? '当前项目没有这条运单' : orderFilter ? '该运单暂无已结算的小时结果' : '暂无已结算的小时结果' }}</h2></div>
        <nav v-if="pageCount > 1" class="monitor-pages" aria-label="小时结果分页">
          <button type="button" class="dt-button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pageCount }}</span><button type="button" class="dt-button" :disabled="page >= pageCount" @click="page++">下一页</button>
        </nav>
      </div></div>
      <aside class="dt-background-rail" :class="{ 'is-open': showInfo }" aria-label="任务信息"><section class="dt-task-summary">
        <div class="dt-summary-title"><h2>任务信息</h2><span class="dt-badge">系统任务</span></div><p>{{ selected.description }}</p>
        <dl class="dt-summary-metrics">
          <div class="dt-summary-trigger"><dt>执行规则</dt><dd>{{ monitoringRule(config, selected.id) }}</dd></div>
          <div><dt>关联运单</dt><dd>{{ relatedOrders }} 单</dd></div><div><dt>监听期限</dt><dd>最长 72 小时</dd></div>
          <div><dt>监听状态</dt><dd>{{ monitoringSkillEnabled(config, selected.id) ? '运行中' : '已暂停' }}</dd></div>
          <div v-if="lastSettlement"><dt>最近结算</dt><dd>{{ dateText(lastSettlement) }}</dd></div>
        </dl><button class="dt-button" @click="editing = selected.id">编辑参数</button>
      </section></aside></div>
    </aside>
    <MonitoringConfigDialog v-if="editing" :project-id="projectId" :skill-id="editing" @close="editing = undefined" />
  </div>
</template>
<style scoped>
.monitor-order-filter { width: min(100%, 320px); margin: 8px 0; }
.monitor-pages { display: flex; align-items: center; justify-content: center; gap: 12px; padding-block: 12px; font-size: 12px; }
</style>
