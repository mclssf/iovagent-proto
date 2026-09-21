<script lang="ts" setup>
import { computed } from 'vue';
import { Icon } from '@packages/icon';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import type { DailyTask } from '../dailyTasks';
import { formatTaskTime, getTaskStatus, monitorDefinitions, triggerLabel, waybillPhases, taskStatusLabels } from '../dailyTasks';
import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import '../dailyTasks.css';

const props = defineProps<{ projectId: string }>();
const tasks = useAgentDailyTasks();
const { goPage } = useAgentWorkNav();
const runtime = computed(() => tasks.projects[props.projectId]);
const monitors = computed(() => monitorDefinitions.map((definition) => {
  const running = runtime.value?.monitors.find((item) => item.id === definition.id);
  const enabled = runtime.value?.skillIds.includes(definition.skillId);
  const status = !enabled ? '未启用' : !runtime.value?.connected ? '待连接' : !runtime.value.orders.length ? '待运单' : definition.id === 'fence' ? runtime.value.fences.length ? '订阅中' : '待围栏' : '运行中';
  return { ...definition, ...running, status, enabled };
}));
const enabledMonitors = computed(() => monitors.value.filter((item) => item.enabled));
const dailyTasks = computed(() => tasks.tasks.filter((task) => task.projectId === props.projectId));
const visibleTasks = computed(() => dailyTasks.value.filter((task) => task.trigger === 'once' ? task.runs[0]?.status === 'running' : task.enabled || task.runs.some((run) => run.status === 'waiting')).slice(0, 4));
const pendingCount = computed(() => dailyTasks.value.reduce((total, task) => total + task.runs.filter((run) => run.status === 'waiting').length, 0));

function dailyStatus(task: DailyTask) {
  return taskStatusLabels[getTaskStatus(task)];
}
</script>

<template>
  <section v-if="runtime" class="dt-surface dt-monitor" aria-label="持续任务">
    <header class="dt-monitor-header">
      <div class="dt-title"><h2>持续任务</h2><span v-if="pendingCount" class="dt-badge warning">{{ pendingCount }} 待确认</span></div>
      <button type="button" class="dt-icon" title="配置判断技能" aria-label="配置判断技能" @click="goPage('projectCreate', { projectId })"><Icon :svg="strokeIconPaths.settings" :size="16" /></button>
    </header>
    <div class="dt-monitor-meta"><span>{{ runtime.total }} 条运单</span><span>演示运行</span></div>
    <section class="dt-monitor-group" aria-label="运单判断任务">
      <h3>运单判断 <span>{{ enabledMonitors.length }}</span></h3>
      <div v-for="item in enabledMonitors" :key="item.id" class="dt-monitor-row" :title="`${item.name} · ${item.events ?? 0} 个事件${item.lastRun ? ` · 最近 ${formatTaskTime(item.lastRun)}` : ''}`">
        <Icon :svg="strokeIconPaths[item.icon]" :size="15" />
        <div class="dt-monitor-name"><strong>{{ item.name }}</strong><small>{{ item.required ? '必选 · ' : '' }}{{ item.seconds ? `每 ${item.seconds / 60} 分钟` : '围栏事件订阅' }}</small></div>
        <span class="dt-state" :class="{ live: item.status === '运行中' || item.status === '订阅中' }">{{ item.status }}</span>
      </div>
      <details class="dt-monitor-phases"><summary>运单状态流转</summary><div class="dt-phase-flow"><template v-for="(phase, index) in waybillPhases" :key="phase"><Icon v-if="index" :svg="strokeIconPaths.chevron" :size="10" /><span>{{ phase }}</span></template></div></details>
    </section>
    <section class="dt-monitor-group" aria-label="做任务摘要">
      <div class="dt-monitor-group-title"><h3>做任务 <span>{{ dailyTasks.length }}</span></h3><button type="button" class="dt-icon" title="管理做任务" aria-label="管理做任务" @click="goPage('dailyTasks')"><Icon :svg="strokeIconPaths.chevron" :size="14" /></button></div>
      <button v-for="task in visibleTasks" :key="task.id" type="button" class="dt-monitor-row dt-monitor-task" :title="task.name" @click="goPage('dailyTasks', { taskId: task.id })">
        <Icon :svg="task.trigger === 'once' ? strokeIconPaths.file : task.trigger === 'schedule' ? strokeIconPaths.alarmClock : strokeIconPaths.zap" :size="15" />
        <div class="dt-monitor-name"><strong>{{ task.name }}</strong><small>{{ triggerLabel(task, runtime.fences) }}</small></div>
        <span class="dt-task-status">{{ dailyStatus(task) }}</span>
      </button>
      <button v-if="!visibleTasks.length" type="button" class="dt-text-button" @click="goPage('dailyTasks')">{{ dailyTasks.length ? '查看全部任务' : '创建任务' }}<Icon :svg="strokeIconPaths.chevron" :size="12" /></button>
      <button v-if="dailyTasks.length > visibleTasks.length && visibleTasks.length" type="button" class="dt-text-button" @click="goPage('dailyTasks')">查看全部 {{ dailyTasks.length }} 项</button>
    </section>
  </section>
</template>
