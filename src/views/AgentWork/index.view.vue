<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { usePhase1 } from '@/pinia/phase1';
import { useGuideLedger } from '@/pinia/guideLedger';
import { guideProjectId } from './guideScenarios';

import MenuComp from './component/menu.comp.vue';
import SkillSummonDialog from './component/skillSummon.dialog.vue';
import { useSkillComposer } from '@/pinia/skillComposer';

const route = useRoute();
const composer = useSkillComposer();
function syncSummon(event: StorageEvent) {
  if (event.key !== null && !event.key.startsWith('iovagent-agent-loading-v1:') && event.key !== 'iovagent-skill-versions-v1') return;
  try { composer.refresh(); composer.invalidate(); } catch { /* Opening the picker or sending will surface the read error. */ }
}
onMounted(() => window.addEventListener('storage', syncSummon));
onBeforeUnmount(() => window.removeEventListener('storage', syncSummon));
const isOrderListRoute = computed(() => ['agent-work-orders', 'agent-work-risk'].includes(String(route.name)));
const isFullBleedRoute = computed(() => ['agent-work-agent', 'agent-work-long-tasks', 'agent-work-daily-tasks', 'agent-work-downloads', 'agent-work-detail'].includes(String(route.name)) || isOrderListRoute.value);
const work = agentWorkData();
const tasks = useAgentDailyTasks();
const monitoring = usePhase1();
const guideLedger = useGuideLedger();
watch(() => guideLedger.orders.length, total => {
  const project = work.projects.find(p => p.id === guideProjectId);
  if (project) project.total = total;
}, { immediate: true });
const monitorDetailKey = computed(() => route.name === 'agent-work-detail' && (route.query.projectId === guideProjectId || monitoring.orders.some(order =>
  order.id === route.query.orderId && order.projectId === route.query.projectId))
  ? `${route.query.projectId}:${route.query.orderId}` : undefined);
watch(() => [monitoring.orders.map(order=>`${order.id}:${order.network?.status}`).join('|'), monitoring.anomalies.filter(item => item.status === 'active').length], () => {
  const project = work.projects.find(item => item.id === 'MONITOR-EAST');
  if (project) { project.total = monitoring.orders.filter(item => item.projectId === project.id).length; project.risk = new Set([...monitoring.orders.filter(order=>order.projectId===project.id&&order.network?.status==='unregistered').map(order=>order.id),...monitoring.anomalies.filter(item => item.status === 'active' && monitoring.orders.some(order => order.id === item.orderId && order.projectId === project.id)).map(item => item.orderId)]).size; }
}, { immediate: true });
watch(() => work.projects, (projects) => tasks.syncProjects(projects, work.ordersSeed), { immediate: true, deep: true });
let taskClock: ReturnType<typeof setInterval> | undefined;
onMounted(() => { taskClock = setInterval(() => { tasks.tick(); monitoring.now = Date.now(); monitoring.tick(); }, 1000); });
onBeforeUnmount(() => { if (taskClock) clearInterval(taskClock); });
</script>

<template>
  <div class="grid h-screen grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-[#f7f7f6] text-slate-900" :class="{ 'knowledge-base-layout': ['agent-work-knowledge-base', 'agent-work-knowledge-base-empty'].includes(String(route.name)), 'daily-tasks-layout': route.name === 'agent-work-daily-tasks', 'downloads-layout': route.name === 'agent-work-downloads', 'agent-workbench-layout': route.name === 'agent-work-agent', 'project-create-layout': route.name === 'agent-work-project-create', 'order-detail-layout': route.name === 'agent-work-detail', 'order-list-layout': isOrderListRoute }">
    <MenuComp class="project-navigation" />
    <SkillSummonDialog />

    <main class="h-full overflow-hidden" :class="isFullBleedRoute ? 'bg-[#fcfcfc] p-0' : 'bg-[#f7f7f5] p-3'">
      <RouterView :key="monitorDetailKey" />
    </main>
  </div>
</template>

<style lang="scss" scoped>
:global(html:has(.order-list-layout)), :global(body:has(.order-list-layout)) { min-width: 0; }

@media (max-width: 1000px) {
  :global(html:has(.order-detail-layout)), :global(body:has(.order-detail-layout)) { min-width: 0; }
  .order-detail-layout { grid-template-columns: minmax(0, 1fr); height: 100dvh; }
  .order-detail-layout > .project-navigation { display: none; }
}

@media (max-width: 700px) {
  :global(html:has(.knowledge-base-layout)), :global(body:has(.knowledge-base-layout)), :global(html:has(.downloads-layout)), :global(body:has(.downloads-layout)), :global(html:has(.project-create-layout)), :global(body:has(.project-create-layout)) { min-width: 0; }
  .knowledge-base-layout, .daily-tasks-layout, .downloads-layout, .agent-workbench-layout, .project-create-layout, .order-list-layout { grid-template-columns: minmax(0, 1fr); height: 100dvh; }
  .knowledge-base-layout > .project-navigation, .daily-tasks-layout > .project-navigation, .downloads-layout > .project-navigation, .agent-workbench-layout > .project-navigation, .project-create-layout > .project-navigation, .order-list-layout > .project-navigation { display: none; }
}
</style>
