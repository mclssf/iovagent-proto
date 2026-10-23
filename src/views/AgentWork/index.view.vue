<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';

import MenuComp from './component/menu.comp.vue';

const route = useRoute();
const isOrderListRoute = computed(() => ['agent-work-orders', 'agent-work-risk'].includes(String(route.name)));
const isFullBleedRoute = computed(() => ['agent-work-agent', 'agent-work-long-tasks', 'agent-work-daily-tasks', 'agent-work-downloads', 'agent-work-detail'].includes(String(route.name)) || isOrderListRoute.value);
const work = agentWorkData();
const tasks = useAgentDailyTasks();
watch(() => work.projects, (projects) => tasks.syncProjects(projects, work.ordersSeed), { immediate: true, deep: true });
let taskClock: ReturnType<typeof setInterval> | undefined;
onMounted(() => { taskClock = setInterval(() => tasks.tick(), 1000); });
onBeforeUnmount(() => { if (taskClock) clearInterval(taskClock); });
</script>

<template>
  <div class="grid h-screen grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-[#f7f7f6] text-slate-900" :class="{ 'knowledge-base-layout': ['agent-work-knowledge-base', 'agent-work-knowledge-base-empty'].includes(String(route.name)), 'daily-tasks-layout': route.name === 'agent-work-daily-tasks', 'downloads-layout': route.name === 'agent-work-downloads', 'agent-workbench-layout': route.name === 'agent-work-agent', 'project-create-layout': route.name === 'agent-work-project-create', 'order-detail-layout': route.name === 'agent-work-detail', 'order-list-layout': isOrderListRoute }">
    <MenuComp class="project-navigation" />

    <main class="h-full overflow-hidden" :class="isFullBleedRoute ? 'bg-[#fcfcfc] p-0' : 'bg-[#f7f7f5] p-3'">
      <RouterView />
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
