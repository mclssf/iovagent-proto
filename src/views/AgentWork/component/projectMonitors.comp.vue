<script lang="ts" setup>
import { computed } from 'vue';
import {useRouter} from 'vue-router';
import {usePhase1} from '@/pinia/phase1';
import {phaseSkills} from '@/views/Phase1/catalog';
const phase=usePhase1();const router=useRouter();
import { Icon } from '@packages/icon';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import type { DailyTask } from '../dailyTasks';
import { getTaskStatus, triggerLabel, taskStatusLabels } from '../dailyTasks';
import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import '../dailyTasks.css';

const props = defineProps<{ projectId: string }>();
const tasks = useAgentDailyTasks();
const { goPage } = useAgentWorkNav();
const phaseTasks=computed(()=>phaseSkills.filter(t=>phase.config(props.projectId).selectedSkills.includes(t.id)));
const phaseOrders=computed(()=>phase.orders.filter(o=>o.projectId===props.projectId));
const runtime = computed(() => tasks.projects[props.projectId]);
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
      <button type="button" class="dt-icon" title="配置判断技能" aria-label="配置判断技能" @click="router.push({path:'/index/projects/detail',query:{projectId,tab:'config'}})"><Icon :svg="strokeIconPaths.settings" :size="16" /></button>
    </header>
    <div class="dt-monitor-meta"><span>{{ phaseOrders.length }} 条运单</span><span>演示运行</span></div>
    <section class="dt-monitor-group" aria-label="一期业务任务"><h3>一期业务任务 <span>{{phaseTasks.length}}</span></h3><button v-for="task in phaseTasks" :key="task.id" class="dt-monitor-row dt-monitor-task" @click="goPage('dailyTasks', {projectId,taskId:task.id})"><Icon :svg="strokeIconPaths.zap" :size="15"/><div class="dt-monitor-name"><strong>{{task.name}}</strong><small>{{phase.logs.filter(l=>l.projectId===projectId&&l.taskId===task.id&&l.kind==='结果').length}}条业务结果</small></div></button></section>
    <section class="dt-monitor-group" aria-label="做任务摘要">
      <div class="dt-monitor-group-title"><h3>其他V1任务 <span>{{ dailyTasks.length }}</span></h3><button type="button" class="dt-icon" title="管理做任务" aria-label="管理做任务" @click="goPage('dailyTasks', {scope:'legacy',projectId})"><Icon :svg="strokeIconPaths.chevron" :size="14" /></button></div>
      <button v-for="task in visibleTasks" :key="task.id" type="button" class="dt-monitor-row dt-monitor-task" :title="task.name" @click="goPage('dailyTasks', { taskId: task.id,scope:'legacy',projectId })">
        <Icon :svg="task.trigger === 'once' ? strokeIconPaths.file : task.trigger === 'schedule' ? strokeIconPaths.alarmClock : strokeIconPaths.zap" :size="15" />
        <div class="dt-monitor-name"><strong>{{ task.name }}</strong><small>{{ triggerLabel(task, runtime.fences) }}</small></div>
        <span class="dt-task-status">{{ dailyStatus(task) }}</span>
      </button>
      <button v-if="!visibleTasks.length" type="button" class="dt-text-button" @click="goPage('dailyTasks', {scope:'legacy',projectId})">{{ dailyTasks.length ? '查看全部任务' : '创建任务' }}<Icon :svg="strokeIconPaths.chevron" :size="12" /></button>
      <button v-if="dailyTasks.length > visibleTasks.length && visibleTasks.length" type="button" class="dt-text-button" @click="goPage('dailyTasks', {scope:'legacy',projectId})">查看全部 {{ dailyTasks.length }} 项</button>
    </section>
  </section>
</template>
