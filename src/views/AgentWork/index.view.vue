<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';

import MenuComp from './component/menu.comp.vue';

const route = useRoute();
const isFullBleedRoute = computed(() => ['agent-work-agent', 'agent-work-long-tasks', 'agent-work-daily-tasks'].includes(String(route.name)));
const work = agentWorkData();
const tasks = useAgentDailyTasks();
watch(() => work.projects, (projects) => tasks.syncProjects(projects, work.ordersSeed), { immediate: true, deep: true });
let taskClock: ReturnType<typeof setInterval> | undefined;
onMounted(() => { taskClock = setInterval(() => tasks.tick(), 1000); });
onBeforeUnmount(() => { if (taskClock) clearInterval(taskClock); });
</script>

<template>
  <div class="grid h-screen grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-[#f7f7f6] text-slate-900" :class="{ 'daily-tasks-layout': route.name === 'agent-work-daily-tasks', 'agent-workbench-layout': route.name === 'agent-work-agent' }">
    <MenuComp class="project-navigation" />

    <main class="h-full overflow-hidden" :class="isFullBleedRoute ? 'bg-[#fcfcfc] p-0' : 'bg-[#f7f7f5] p-3'">
      <RouterView />
    </main>
  </div>
</template>

<style lang="scss" scoped>
@media (max-width: 700px) {
  .daily-tasks-layout, .agent-workbench-layout { grid-template-columns: minmax(0, 1fr); height: 100dvh; }
  .daily-tasks-layout > .project-navigation, .agent-workbench-layout > .project-navigation { display: none; }
}
</style>
