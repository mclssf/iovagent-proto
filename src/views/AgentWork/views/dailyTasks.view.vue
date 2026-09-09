<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@packages/icon';
import { ElMessage, ElMessageBox } from 'element-plus';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import type { DailyTask, TaskRun } from '../dailyTasks';
import { formatTaskTime, taskDuration, triggerLabel } from '../dailyTasks';
import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import DailyTaskDialog from '../component/dailyTask.dialog.vue';
import GeofenceDialog from '../component/geofence.dialog.vue';
import '../dailyTasks.css';

const work = agentWorkData();
const store = useAgentDailyTasks();
const { goPage } = useAgentWorkNav();
const route = useRoute();
const selectedId = ref('');
const editingId = ref('');
const showForm = ref(false);
const showFences = ref(false);
const search = ref('');
const filter = ref('all');
const showBackground = ref(false);
const backgroundRef = ref<HTMLElement | null>(null);
const backgroundToggleRef = ref<HTMLButtonElement | null>(null);
const projectId = computed(() => work.currentProjectId);
const runtime = computed(() => store.projects[projectId.value]);
const projectTasks = computed(() => store.tasks.filter((task) => task.projectId === projectId.value));
const selected = computed(() => projectTasks.value.find((task) => task.id === selectedId.value));
const editing = computed(() => projectTasks.value.find((task) => task.id === editingId.value));
const pendingCount = computed(() => projectTasks.value.reduce((count, task) => count + task.runs.filter((run) => run.status === 'waiting').length, 0));
const filteredTasks = computed(() => projectTasks.value.filter((task) => {
  const matchesSearch = `${task.name} ${task.prompt} ${triggerLabel(task, runtime.value?.fences)}`.includes(search.value.trim());
  return matchesSearch && (filter.value === 'all' || (filter.value === 'active' && task.enabled) || (filter.value === 'paused' && !task.enabled) || (filter.value === 'pending' && task.runs.some((run) => run.status === 'waiting')));
}));
const runLabels: Record<TaskRun['status'], string> = { running: '执行中', waiting: '待确认', complete: '已完成', cancelled: '已取消' };
watch([projectId, () => route.query.taskId], () => {
  selectedId.value = projectTasks.value.find((task) => task.id === route.query.taskId)?.id ?? projectTasks.value[0]?.id ?? '';
  search.value = ''; filter.value = 'all'; showForm.value = false;
}, { immediate: true });
watch(selectedId, () => { showBackground.value = false; });

function dismissBackground(event: MouseEvent) {
  if (!backgroundRef.value?.contains(event.target as Node) && !backgroundToggleRef.value?.contains(event.target as Node)) showBackground.value = false;
}
function closeBackgroundOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !showBackground.value) return;
  showBackground.value = false;
  backgroundToggleRef.value?.focus();
}
onMounted(() => {
  document.addEventListener('click', dismissBackground);
  document.addEventListener('keydown', closeBackgroundOnEscape);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', dismissBackground);
  document.removeEventListener('keydown', closeBackgroundOnEscape);
});

function create() { editingId.value = ''; showForm.value = true; }
function edit(task: DailyTask) { editingId.value = task.id; showForm.value = true; }
function saved(id: string) { selectedId.value = id; search.value = ''; filter.value = 'all'; ElMessage.success(editingId.value ? '任务已更新' : '日常任务已创建'); }
function test(task: DailyTask) {
  selectedId.value = task.id;
  try { store.testTask(task.id); } catch (error) { ElMessage.warning((error as Error).message); }
}
function status(task: DailyTask) {
  if (!task.enabled) return '已暂停';
  if (task.runs.some((run) => run.status === 'running')) return '执行中';
  return store.unavailableReason(task) || (task.trigger === 'schedule' ? '已计划' : '监听中');
}
async function remove(task: DailyTask) {
  try {
    await ElMessageBox.confirm(`删除“${task.name}”将停止后续触发，并移除该任务的运行记录。`, '删除日常任务', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' });
    store.deleteTask(task.id);
    if (selectedId.value === task.id) selectedId.value = projectTasks.value[0]?.id ?? '';
    ElMessage.success('任务已删除');
  } catch { /* Dialog cancellation preserves task and history. */ }
}
</script>

<template>
  <div v-if="work.workspaceMode === 'project' && runtime" class="dt-surface dt-page">
    <header class="dt-page-header">
      <div class="dt-title"><Icon :svg="strokeIconPaths.alarmClock" :size="16" /><h1>日常任务</h1><span class="dt-project-name">{{ work.currentProject.name }}</span></div>
      <div class="dt-actions"><button class="dt-icon" type="button" title="返回智能体工作台" aria-label="返回智能体工作台" @click="goPage('agent')"><Icon :svg="strokeIconPaths.msg" :size="16" /></button><button class="dt-button primary" type="button" @click="create"><Icon :svg="strokeIconPaths.plus" :size="15" />新建任务</button></div>
    </header>
    <div class="dt-page-body" :class="{ 'has-panel': selected }">
      <section class="dt-task-area" aria-label="项目日常任务列表">
        <div class="dt-list-heading"><span>{{ projectTasks.length }} 项任务 <span class="dt-secondary">· {{ projectTasks.filter(task => task.enabled).length }} 项已启用</span></span><span v-if="pendingCount" class="dt-badge warning">{{ pendingCount }} 项待确认</span></div>
        <div class="dt-filters"><div class="dt-search"><Icon :svg="strokeIconPaths.search" :size="14" /><input v-model="search" aria-label="搜索日常任务" placeholder="搜索任务" /></div><select v-model="filter" aria-label="任务状态筛选"><option value="all">全部状态</option><option value="active">已启用</option><option value="paused">已暂停</option><option value="pending">待确认</option></select></div>
        <div v-if="filteredTasks.length" class="dt-task-grid">
          <article v-for="task in filteredTasks" :key="task.id" class="dt-task-card" :class="{ selected: selectedId === task.id }">
            <button type="button" class="dt-task-main" :aria-label="`查看任务 ${task.name}`" :aria-pressed="selectedId === task.id" @click="selectedId = task.id">
              <div class="dt-task-heading"><span class="dt-task-symbol"><Icon :svg="task.trigger === 'event' ? strokeIconPaths.zap : strokeIconPaths.alarmClock" :size="17" /></span><h2>{{ task.name }}</h2><span class="dt-badge" :class="{ success: task.enabled && !store.unavailableReason(task), blue: status(task) === '执行中' }">{{ status(task) }}</span></div>
              <p class="dt-trigger">{{ triggerLabel(task, runtime.fences) }}</p>
              <p class="dt-task-description" :title="task.prompt">{{ task.prompt }}</p>
            </button>
            <footer class="dt-task-footer">
              <div class="dt-task-meta"><span>{{ task.runs.length }} 次执行</span><span v-if="task.runs.some(run => run.status === 'waiting')" class="dt-pending">{{ task.runs.filter(run => run.status === 'waiting').length }} 项待确认</span></div>
              <div class="dt-task-actions">
              <button type="button" class="dt-icon" :aria-label="`编辑 ${task.name}`" title="编辑" :disabled="task.runs.some(run => run.status === 'running')" @click="edit(task)"><Icon :svg="strokeIconPaths.edit" :size="15" /></button>
              <button type="button" class="dt-icon" :aria-label="`测试执行一次 ${task.name}`" title="测试执行一次" :disabled="task.runs.some(run => run.status === 'running')" @click="test(task)"><Icon :svg="strokeIconPaths.refresh" :size="15" /></button>
              <button type="button" class="dt-icon" :aria-label="`${task.enabled ? '暂停' : '启动'} ${task.name}`" :title="task.enabled ? '暂停后续触发' : '启动任务'" @click="store.toggleTask(task.id)"><Icon :svg="task.enabled ? strokeIconPaths.pause : strokeIconPaths.play" :size="15" /></button>
              <button type="button" class="dt-icon danger" :aria-label="`删除 ${task.name}`" title="删除" @click="remove(task)"><Icon :svg="strokeIconPaths.trash" :size="15" /></button>
              </div>
            </footer>
          </article>
        </div>
        <div v-else class="dt-empty"><Icon :svg="strokeIconPaths.alarmClock" :size="30" /><h2>{{ projectTasks.length ? '没有匹配的任务' : '暂无日常任务' }}</h2><button type="button" class="dt-button" @click="projectTasks.length ? (search = '', filter = 'all') : create()">{{ projectTasks.length ? '清除筛选' : '新建任务' }}</button></div>
        <div class="dt-list-footer"><button type="button" class="dt-text-button" @click="showFences = true"><Icon :svg="strokeIconPaths.locate" :size="14" />项目区域围栏 <span>{{ runtime.fences.length }}</span></button><span>演示运行</span></div>
      </section>

      <aside v-if="selected" class="dt-run-panel" aria-label="任务运行面板">
        <header class="dt-run-header">
          <div class="dt-title"><Icon :svg="strokeIconPaths.bot" :size="16" /><h2>任务运行面板</h2></div>
          <div class="dt-actions">
            <button ref="backgroundToggleRef" class="dt-background-toggle" type="button" title="任务背景" aria-label="任务背景" aria-controls="daily-task-background" :aria-expanded="showBackground" @click="showBackground = !showBackground"><Icon :svg="strokeIconPaths.alarmClock" :size="15" /><span>任务背景</span></button>
            <button class="dt-icon" type="button" title="关闭运行面板" aria-label="关闭运行面板" @click="selectedId = ''"><Icon :svg="strokeIconPaths.x" :size="16" /></button>
          </div>
        </header>
        <div class="dt-run-body">
          <div class="dt-run-scroll" :key="selected.id">
            <div class="dt-run-section-heading"><h3>运行记录</h3><button type="button" class="dt-text-button" :disabled="selected.runs.some(run => run.status === 'running')" @click="test(selected)"><Icon :svg="strokeIconPaths.refresh" :size="13" />测试执行一次</button></div>
            <div v-if="!selected.runs.length" class="dt-empty compact"><Icon :svg="strokeIconPaths.alarmClock" :size="24" /><h2>等待首次执行</h2><p>{{ triggerLabel(selected, runtime.fences) }}</p></div>
            <section v-for="(run, index) in selected.runs" :key="run.id" class="dt-run" :aria-label="`第 ${selected.runs.length - index} 次执行`">
              <header><div><strong>第 {{ selected.runs.length - index }} 次执行</strong><small>{{ formatTaskTime(run.startedAt) }} · {{ run.source === 'test' ? '测试执行' : run.source === 'event' ? '事件触发' : '定时执行' }}</small></div><span class="dt-badge" :class="run.status === 'waiting' ? 'warning' : run.status === 'running' ? 'blue' : run.status === 'complete' ? 'success' : ''">{{ runLabels[run.status] }}</span></header>
              <p v-if="run.event" class="dt-run-context">{{ run.event.order.id }} · {{ run.event.order.plate }}<br />{{ run.event.detail }}</p>
              <details :open="run.status === 'running'" class="dt-run-steps"><summary>Agent 执行过程 <span>{{ Math.min(run.activeStep, run.steps.length) }}/{{ run.steps.length }}</span></summary><ol><template v-for="(step, stepIndex) in run.steps" :key="step.title"><li v-if="stepIndex <= run.activeStep"><Icon :svg="stepIndex === run.activeStep && run.status === 'running' ? strokeIconPaths.refresh : strokeIconPaths.check" :size="13" :svg-class="stepIndex === run.activeStep && run.status === 'running' ? 'animate-spin' : ''" /><div><strong>{{ step.title }}</strong><p>{{ step.text }}</p><span v-if="step.tool" class="dt-tool">{{ step.tool }}</span></div></li></template></ol></details>
              <p v-if="run.result" class="dt-run-result">{{ run.result }}</p>
              <div v-if="run.action && run.activeStep >= 4" class="dt-action-preview" :class="{ pending: run.action.status === 'pending' }">
                <div class="dt-title"><Icon :svg="strokeIconPaths.messageText" :size="15" /><strong>{{ run.action.channel }}{{ run.action.status === 'pending' ? '草稿' : run.action.status === 'sent' ? '回执' : '已取消' }}</strong></div>
                <p class="dt-recipient">{{ run.action.recipient }}</p><p>{{ run.action.content }}</p>
                <div v-if="run.status === 'waiting'" class="dt-actions"><button class="dt-button primary" type="button" @click="store.resolveAction(selected.id, run.id, true)">确认发送</button><button class="dt-button" type="button" @click="store.resolveAction(selected.id, run.id, false)">取消发送</button></div>
              </div>
              <footer v-if="run.finishedAt">本轮耗时 {{ taskDuration(run.finishedAt - run.startedAt) }}</footer>
            </section>
          </div>
          <aside id="daily-task-background" ref="backgroundRef" class="dt-background-rail" :class="{ 'is-open': showBackground }" aria-label="任务背景">
            <section class="dt-task-summary">
              <div class="dt-summary-title"><h2>{{ selected.name }}</h2><span class="dt-badge" :class="selected.enabled ? 'success' : ''">{{ status(selected) }}</span></div>
              <dl class="dt-summary-metrics">
                <div class="dt-summary-trigger"><dt>触发条件</dt><dd>{{ triggerLabel(selected, runtime.fences) }}</dd></div>
                <div><dt>执行轮次</dt><dd>{{ selected.runs.length }} 次</dd></div>
                <div><dt>持续时间</dt><dd>{{ taskDuration(store.now - selected.createdAt) }}</dd></div>
                <div class="dt-summary-trigger"><dt>通知确认</dt><dd>{{ selected.confirmBeforeSend ? '发送前确认' : '自动发送' }}</dd></div>
              </dl>
              <div class="dt-summary-description"><h3>任务描述</h3><p>{{ selected.prompt }}</p></div>
            </section>
          </aside>
        </div>
      </aside>
    </div>
    <DailyTaskDialog v-model="showForm" :project-id="projectId" :task="editing" @saved="saved" />
    <GeofenceDialog v-model="showFences" :project-id="projectId" />
  </div>
  <div v-else class="dt-surface dt-empty"><Icon :svg="strokeIconPaths.alarmClock" :size="30" /><h1>请先选择项目</h1><button class="dt-button" @click="goPage('projects')">前往项目管理</button></div>
</template>
