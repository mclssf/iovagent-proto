<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Icon } from '@packages/icon';
import { monitoringSkillEnabled, usePhase1 } from '@/pinia/phase1';
import { phaseSkills, dateText } from './catalog';
import { monitoringRule } from './presentation';
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
const selectedId = ref('');
const editing = ref<P1SkillId>();
const showInfo = ref(false);
const orderFilter = ref('');
const config = computed(() => store.config(props.projectId));
const tasks = computed(() => phaseSkills.filter(skill => config.value.selectedSkills.includes(skill.id)));
const selected = computed(() => tasks.value.find(skill => skill.id === selectedId.value));
const orders = computed(() => store.orders.filter(order => order.projectId === props.projectId));
const visible = computed(() => tasks.value.filter(skill => `${skill.name} ${monitoringRule(config.value, skill.id)}`.includes(search.value.trim()) && (status.value === 'all' || monitoringSkillEnabled(config.value, skill.id) === (status.value === 'running'))));
const results = computed(() => store.logs.filter(log => log.projectId === props.projectId && log.taskId === selectedId.value && !['基础事件', '配置', '开始'].includes(log.kind) && (!orderFilter.value || log.orderId === orderFilter.value)).slice().reverse());
function contextFor(id: string) {
  const index = store.logs.findIndex(log => log.id === id);
  const result = store.logs[index];
  return store.logs.slice(0, index).filter(log => log.projectId === props.projectId && log.orderId === result?.orderId && log.taskId === result.taskId && log.kind === '基础事件').at(-1)?.text;
}
watch([() => props.projectId, () => route.query.taskId], () => { selectedId.value = typeof route.query.taskId === 'string' ? route.query.taskId : ''; orderFilter.value = typeof route.query.orderId === 'string' ? route.query.orderId : ''; }, { immediate: true });
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
      <div class="dt-list-toolbar"><div class="dt-list-heading"><span>{{ tasks.length }} 项监听 · {{ tasks.filter(skill => monitoringSkillEnabled(config, skill.id)).length }} 项运行中</span><button class="dt-icon" title="配置项目技能" aria-label="配置项目技能" @click="goPage('projectCreate', { projectId })"><Icon :svg="strokeIconPaths.settings" :size="16" /></button></div><div class="dt-filters"><div class="dt-search"><Icon :svg="strokeIconPaths.search" :size="14" /><input v-model="search" placeholder="搜索监听任务" aria-label="搜索监听任务" /></div><select v-model="status" aria-label="监听任务状态"><option value="all">全部状态</option><option value="running">运行中</option><option value="paused">已暂停</option></select></div></div>
      <section class="dt-task-area" aria-label="系统监听任务"><div v-if="visible.length" class="dt-task-grid">
        <article v-for="skill in visible" :key="skill.id" class="dt-task-card" :class="{ selected: selectedId === skill.id }">
          <button class="dt-task-main" :aria-label="`查看监听 ${skill.name}`" @click="selectedId = skill.id"><div class="dt-task-heading"><span class="dt-task-symbol"><Icon :svg="strokeIconPaths[skill.icon]" :size="17" /></span><h2>{{ skill.name }}</h2><span class="dt-badge" :class="{ blue: monitoringSkillEnabled(config, skill.id) }">{{ monitoringSkillEnabled(config, skill.id) ? '运行中' : '已暂停' }}</span></div><p class="dt-task-description">{{ monitoringRule(config, skill.id) }}</p></button>
          <footer class="dt-task-footer"><div class="dt-task-meta">{{ store.logs.filter(log => log.projectId === projectId && log.taskId === skill.id && log.kind === '结果').length }} 条结果</div><div class="dt-task-actions"><button class="dt-icon" :aria-label="`编辑监听 ${skill.name}`" title="编辑" @click="editing = skill.id"><Icon :svg="strokeIconPaths.edit" :size="14" /></button><button class="dt-icon" :aria-label="`${monitoringSkillEnabled(config, skill.id) ? '暂停' : '启动'}监听 ${skill.name}`" :title="monitoringSkillEnabled(config, skill.id) ? '暂停' : '启动'" @click="toggle(skill.id)"><Icon :svg="monitoringSkillEnabled(config, skill.id) ? strokeIconPaths.pause : strokeIconPaths.play" :size="14" /></button></div></footer>
        </article>
      </div><div v-else class="dt-empty compact"><Icon :svg="strokeIconPaths.locate" :size="26" /><h2>{{ tasks.length ? '没有匹配的监听任务' : '尚未配置监听技能' }}</h2><button class="dt-button" @click="goPage('projectCreate', { projectId })">配置项目技能</button></div></section>
    </div>
    <aside v-if="selected" class="dt-run-panel" aria-label="监听任务运行面板">
      <header class="dt-run-header"><div class="dt-title"><h2>{{ selected.name }}</h2></div><div class="dt-actions"><button class="dt-background-toggle" :aria-expanded="showInfo" @click="showInfo = !showInfo">任务信息</button><button class="dt-icon" aria-label="关闭监听结果" title="关闭" @click="selectedId = ''"><Icon :svg="strokeIconPaths.x" :size="16" /></button></div></header>
      <div class="dt-run-body"><div class="dt-run-main"><div class="dt-run-scroll"><div class="dt-run-section-heading"><h3>执行结果 <span>{{ results.length }}</span></h3><select v-model="orderFilter" aria-label="监听运单范围"><option value="">全部运单</option><option v-for="order in orders" :key="order.id" :value="order.id">{{ order.id }}</option></select></div><section v-for="result in results" :key="result.id" class="dt-result-section"><div class="dt-run-section-heading"><strong>{{ result.orderId }}</strong><span class="dt-badge" :class="{ warning: result.kind === '失败' }">{{ result.kind }}</span></div><p class="dt-run-result">{{ result.text }}</p><p class="dt-progress-counts">{{ dateText(result.at) }}</p><details v-if="contextFor(result.id)" class="dt-run-steps"><summary>执行详情</summary><p>{{ contextFor(result.id) }}</p><p>{{ result.text }}</p></details><button class="dt-text-button" @click="goPage('detail', { orderId: result.orderId, projectId })">运单详情</button></section><div v-if="!results.length" class="dt-empty compact"><h2>暂无执行结果</h2></div></div></div>
      <aside class="dt-background-rail" :class="{ 'is-open': showInfo }"><section class="dt-task-summary"><div class="dt-summary-title"><h2>任务信息</h2><span class="dt-badge">系统任务</span></div><p>{{ selected.description }}</p><dl class="dt-summary-metrics"><div class="dt-summary-trigger"><dt>执行规则</dt><dd>{{ monitoringRule(config, selected.id) }}</dd></div><div><dt>关联运单</dt><dd>{{ orders.length }} 单</dd></div><div><dt>监听期限</dt><dd>最长 72 小时</dd></div></dl><button class="dt-button" @click="editing = selected.id">编辑参数</button></section></aside></div>
    </aside>
    <MonitoringConfigDialog v-if="editing" :project-id="projectId" :skill-id="editing" @close="editing = undefined" />
  </div>
</template>
