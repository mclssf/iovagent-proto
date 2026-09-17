<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@packages/icon';
import { ElMessage, ElMessageBox } from 'element-plus';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import type { DailyTask, TaskRun } from '../dailyTasks';
import { formatTaskTime, getTaskStatus, hasTaskResult, taskDuration, triggerLabel, taskTypeLabels, taskStatusLabels } from '../dailyTasks';
import { downloadTaskResult } from '../ordinaryTasks';
import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import DailyTaskDialog from '../component/dailyTask.dialog.vue';
import '../dailyTasks.css';

const work = agentWorkData();
const store = useAgentDailyTasks();
const { goPage } = useAgentWorkNav();
const route = useRoute();
const selectedId = ref('');
const editingId = ref('');
const showForm = ref(false);
const search = ref('');
const filter = ref('all');
const typeFilter = ref('all');
const showBackground = ref(false);
const confirmingRemoval = ref(false);
const resultScroll = ref<HTMLElement | null>(null);
const backgroundRef = ref<HTMLElement | null>(null);
const backgroundToggleRef = ref<HTMLButtonElement | null>(null);
const isPersonal = computed(() => route.query.scope === 'personal' || work.workspaceMode === 'conversation');
const projectId = computed(() => isPersonal.value ? '' : work.currentProjectId);
const runtime = computed(() => store.projects[projectId.value]);
const projectTasks = computed(() => store.tasks.filter((task) => task.projectId === projectId.value));
const selected = computed(() => projectTasks.value.find((task) => task.id === selectedId.value));
const editing = computed(() => projectTasks.value.find((task) => task.id === editingId.value));
const filteredTasks = computed(() => projectTasks.value.filter((task) => {
  const matchesSearch = `${task.name} ${task.prompt} ${triggerLabel(task, runtime.value?.fences)}`.includes(search.value.trim());
  return matchesSearch && (typeFilter.value === 'all' || typeFilter.value === task.trigger) && (filter.value === 'all' || getTaskStatus(task) === filter.value);
}));
const results = computed(() => (selected.value?.runs ?? []).filter(hasTaskResult).sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt)));
const activeRuns = computed(() => (selected.value?.runs ?? []).filter((run) => run.status === 'running'));
const sourceLabels: Record<TaskRun['source'], string> = { test: '测试执行', event: '事件触发', schedule: '定时执行', manual: '手动创建', workbench: '智能体工作台' };
watch([projectId, () => route.query.taskId], () => {
  selectedId.value = projectTasks.value.find((task) => task.id === route.query.taskId)?.id ?? projectTasks.value[0]?.id ?? '';
  search.value = ''; filter.value = 'all'; typeFilter.value = 'all'; showForm.value = false;
}, { immediate: true });
watch(selectedId, () => { showBackground.value = false; });
watch(filteredTasks, (tasks) => {
  if (selectedId.value && !tasks.some((task) => task.id === selectedId.value)) selectedId.value = '';
}, { flush: 'post' });

let resultObserver: IntersectionObserver | undefined;
function observeVisibleResults() {
  resultObserver?.disconnect();
  resultObserver = undefined;
  const taskId = selectedId.value;
  const root = resultScroll.value;
  if (!root || !taskId || document.hidden || showForm.value || showBackground.value || confirmingRemoval.value) return;
  // Only acknowledge results actually brought into view, never the whole task history.
  const observer = new IntersectionObserver((entries) => {
    if (resultObserver !== observer || selectedId.value !== taskId || document.hidden || showForm.value || showBackground.value || confirmingRemoval.value) return;
    for (const entry of entries) {
      const runId = (entry.target as HTMLElement).dataset.resultId;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.99 && runId) store.markResultRead(taskId, runId);
    }
  }, { root, threshold: 0.99 });
  resultObserver = observer;
  root.querySelectorAll('[data-result-id]').forEach((element) => observer.observe(element));
}
watch([resultScroll, selectedId, () => results.value.map((run) => run.id).join(','), showForm, showBackground, confirmingRemoval], observeVisibleResults, { flush: 'post' });

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
  document.addEventListener('visibilitychange', observeVisibleResults);
});
onBeforeUnmount(() => {
  resultObserver?.disconnect();
  resultObserver = undefined;
  document.removeEventListener('click', dismissBackground);
  document.removeEventListener('keydown', closeBackgroundOnEscape);
  document.removeEventListener('visibilitychange', observeVisibleResults);
});

function create() { editingId.value = ''; showForm.value = true; }
function edit(task: DailyTask) { editingId.value = task.id; showForm.value = true; }
function selectTask(id: string) { selectedId.value = id; resultScroll.value?.scrollTo({ top: 0 }); }
function saved(id: string) { selectedId.value = id; search.value = ''; filter.value = 'all'; typeFilter.value = 'all'; ElMessage.success(editingId.value ? '任务已更新' : selected.value?.trigger === 'once' ? '普通任务已提交，正在执行' : '任务已创建'); }
function test(task: DailyTask) {
  selectedId.value = task.id;
  try { store.testTask(task.id); } catch (error) { ElMessage.warning((error as Error).message); }
}
function status(task: DailyTask) {
  return taskStatusLabels[getTaskStatus(task)];
}
async function remove(task: DailyTask) {
  confirmingRemoval.value = true;
  try {
    await ElMessageBox.confirm(task.trigger === 'once' ? `删除“${task.name}”将取消尚未完成的执行，并移除结果与下载文件。` : `删除“${task.name}”将停止后续触发，并移除该任务的执行结果。`, '删除任务', { confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'dialog-danger', type: 'warning' });
    store.deleteTask(task.id);
    if (selectedId.value === task.id) selectedId.value = '';
    ElMessage.success('任务已删除');
  } catch { /* Dialog cancellation preserves task and history. */ }
  finally { confirmingRemoval.value = false; }
}
</script>

<template>
  <div v-if="isPersonal || runtime" class="dt-surface dt-page">
    <header class="dt-page-header">
      <div class="dt-title"><Icon :svg="strokeIconPaths.alarmClock" :size="16" /><h1>做任务</h1><span class="dt-project-name">{{ isPersonal ? '个人任务' : work.currentProject.name }}</span></div>
      <div class="dt-actions"><button class="dt-icon" type="button" title="返回智能体工作台" aria-label="返回智能体工作台" @click="goPage('agent')"><Icon :svg="strokeIconPaths.msg" :size="16" /></button></div>
    </header>
    <div class="dt-page-body" :class="{ 'has-panel': selected }">
      <div class="dt-task-column">
        <div class="dt-list-toolbar">
          <div class="dt-list-heading"><span>{{ projectTasks.length }} 项任务 <span class="dt-secondary">· {{ projectTasks.filter(task => getTaskStatus(task) === 'running').length }} 项执行中</span></span><button class="dt-button primary" type="button" @click="create"><Icon :svg="strokeIconPaths.plus" :size="15" />新建任务</button></div>
          <div class="dt-type-filter" role="group" aria-label="任务类型筛选"><button type="button" :aria-pressed="typeFilter === 'all'" @click="typeFilter = 'all'">全部</button><button v-for="(label, type) in taskTypeLabels" :key="type" type="button" :aria-pressed="typeFilter === type" @click="typeFilter = type">{{ label }}</button></div>
          <div class="dt-filters"><div class="dt-search"><Icon :svg="strokeIconPaths.search" :size="14" /><input v-model="search" aria-label="搜索任务" placeholder="搜索任务" /></div><select v-model="filter" aria-label="任务状态筛选"><option value="all">全部状态</option><option v-for="(label, value) in taskStatusLabels" :key="value" :value="value">{{ label }}</option></select></div>
        </div>
        <section class="dt-task-area" aria-label="项目做任务列表">
          <div v-if="filteredTasks.length" class="dt-task-grid">
            <article v-for="task in filteredTasks" :key="task.id" class="dt-task-card" :class="{ selected: selectedId === task.id }">
              <button type="button" class="dt-task-main" :aria-label="`查看任务 ${task.name}`" :aria-pressed="selectedId === task.id" @click="selectTask(task.id)">
                <div class="dt-task-heading"><span class="dt-task-symbol"><Icon :svg="task.trigger === 'once' ? strokeIconPaths.file : task.trigger === 'event' ? strokeIconPaths.zap : strokeIconPaths.alarmClock" :size="17" /></span><h2>{{ task.name }}</h2><span v-if="store.unreadResultsByTask[task.id]" class="dt-unread-badge" :aria-label="`${store.unreadResultsByTask[task.id]} 条未读结果`">{{ store.unreadResultsByTask[task.id] }}</span><span class="dt-badge" :class="{ success: getTaskStatus(task) === 'complete', blue: getTaskStatus(task) === 'running' }">{{ status(task) }}</span></div>
                <p class="dt-trigger">{{ triggerLabel(task, runtime?.fences) }}</p>
                <p class="dt-task-description" :title="task.prompt">{{ task.prompt }}</p>
              </button>
              <footer class="dt-task-footer">
                <div class="dt-task-meta"><span>{{ task.runs.filter(hasTaskResult).length }} 条结果</span><span v-if="task.runs.some(run => run.status === 'waiting')" class="dt-pending">{{ task.runs.filter(run => run.status === 'waiting').length }} 项待确认</span></div>
                <div class="dt-task-actions">
                <template v-if="task.trigger === 'once'">
                  <button type="button" class="dt-icon" :aria-label="`查看结果 ${task.name}`" title="查看执行结果" @click="selectTask(task.id)"><Icon :svg="strokeIconPaths.list" :size="15" /></button>
                </template>
                <template v-else>
                <button type="button" class="dt-icon" :aria-label="`编辑 ${task.name}`" title="编辑" :disabled="task.runs.some(run => run.status === 'running')" @click="edit(task)"><Icon :svg="strokeIconPaths.edit" :size="15" /></button>
                <button type="button" class="dt-icon" :aria-label="`测试执行一次 ${task.name}`" title="测试执行一次" :disabled="task.runs.some(run => run.status === 'running')" @click="test(task)"><Icon :svg="strokeIconPaths.refresh" :size="15" /></button>
                <button type="button" class="dt-icon" :aria-label="`${task.enabled ? '暂停' : '启动'} ${task.name}`" :title="task.enabled ? '暂停后续触发' : '启动任务'" @click="store.toggleTask(task.id)"><Icon :svg="task.enabled ? strokeIconPaths.pause : strokeIconPaths.play" :size="15" /></button>
                </template>
                <button type="button" class="dt-icon danger" :aria-label="`删除 ${task.name}`" title="删除" @click="remove(task)"><Icon :svg="strokeIconPaths.trash" :size="15" /></button>
                </div>
              </footer>
            </article>
          </div>
          <div v-else class="dt-empty"><Icon :svg="strokeIconPaths.alarmClock" :size="30" /><h2>{{ projectTasks.length ? '没有匹配的任务' : '暂无任务' }}</h2><button v-if="projectTasks.length" type="button" class="dt-button" @click="search = ''; filter = 'all'; typeFilter = 'all'">清除筛选</button></div>
        </section>
      </div>

      <aside v-if="selected" class="dt-run-panel" aria-label="任务运行面板">
        <header class="dt-run-header">
          <div class="dt-title"><Icon :svg="strokeIconPaths.bot" :size="16" /><h2 :title="selected.name">{{ selected.name }}</h2></div>
          <div class="dt-actions">
            <button ref="backgroundToggleRef" class="dt-background-toggle" type="button" title="任务背景" aria-label="任务背景" aria-controls="daily-task-background" :aria-expanded="showBackground" @click="showBackground = !showBackground"><Icon :svg="strokeIconPaths.alarmClock" :size="15" /><span>任务背景</span></button>
            <button class="dt-icon" type="button" title="关闭运行面板" aria-label="关闭运行面板" @click="selectedId = ''"><Icon :svg="strokeIconPaths.x" :size="16" /></button>
          </div>
        </header>
        <div class="dt-run-body">
          <div ref="resultScroll" class="dt-run-scroll" :key="selected.id">
            <div class="dt-run-section-heading"><h3>执行结果 <span class="dt-secondary">{{ results.length }}</span></h3><button v-if="selected.trigger !== 'once'" type="button" class="dt-text-button" :disabled="activeRuns.length > 0" @click="test(selected)"><Icon :svg="strokeIconPaths.refresh" :size="13" />测试执行一次</button></div>
            <div v-for="run in activeRuns" :key="run.id" class="dt-active-run" role="status"><Icon :svg="strokeIconPaths.refresh" :size="15" svg-class="animate-spin" /><div><strong>{{ run.steps[run.activeStep]?.title ?? '正在接收结果' }}</strong><p>{{ run.steps[run.activeStep]?.text }}</p><small>{{ sourceLabels[run.source] }} · {{ Math.min(run.activeStep + 1, run.steps.length) }}/{{ run.steps.length }}</small></div></div>
            <div v-if="!results.length" class="dt-empty compact"><Icon :svg="strokeIconPaths.fileText" :size="24" /><h2>{{ activeRuns.length ? '执行结果生成中' : '暂无执行结果' }}</h2><p>{{ activeRuns.length ? '结果返回后将在此展示' : getTaskStatus(selected) === 'paused' ? '任务已暂停，启动后等待下次触发' : triggerLabel(selected, runtime?.fences) }}</p></div>
            <section v-for="(run, index) in results" :key="run.id" class="dt-run" :aria-label="`执行结果 ${results.length - index}`">
              <header :data-result-id="run.id"><div><strong>{{ run.event ? `${run.event.order.id} · ${run.event.order.plate}` : selected.trigger === 'once' ? '任务结果' : `执行结果 ${results.length - index}` }}</strong><small>{{ formatTaskTime(run.finishedAt ?? run.startedAt) }} · {{ sourceLabels[run.source] }}</small></div><span v-if="run.action?.status === 'pending'" class="dt-badge warning">待确认</span></header>
              <p v-if="run.result" class="dt-run-result">{{ run.result }}</p>
              <div v-if="run.files?.length" class="dt-result-files" aria-label="任务结果文件">
                <button v-for="file in run.files" :key="file.name" type="button" class="dt-result-file" :aria-label="`下载 ${file.name}`" @click="downloadTaskResult(file)"><Icon :svg="file.name.endsWith('.csv') ? strokeIconPaths.fileSpreadsheet : strokeIconPaths.fileText" :size="20" /><span><strong>{{ file.name }}</strong><small>{{ file.name.endsWith('.csv') ? 'CSV 表格' : '文本文件' }}</small></span><Icon :svg="strokeIconPaths.download" :size="17" /></button>
              </div>
              <div v-if="run.action && run.activeStep >= 4" class="dt-action-preview" :class="{ pending: run.action.status === 'pending' }">
                <div class="dt-title"><Icon :svg="strokeIconPaths.messageText" :size="15" /><strong>{{ run.action.channel }}{{ run.action.status === 'pending' ? '草稿' : run.action.status === 'sent' ? '回执' : '已取消' }}</strong></div>
                <p class="dt-recipient">{{ run.action.recipient }}</p><p>{{ run.action.content }}</p>
                <div v-if="run.status === 'waiting'" class="dt-actions"><button class="dt-button primary" type="button" @click="store.resolveAction(selected.id, run.id, true)">确认发送</button><button class="dt-button" type="button" @click="store.resolveAction(selected.id, run.id, false)">取消发送</button></div>
              </div>
              <details class="dt-run-steps"><summary>执行详情</summary><p v-if="run.event" class="dt-run-context">{{ run.event.detail }}</p><p v-if="run.toolJobId" class="dt-run-context">{{ run.toolJobId }}</p><ol><li v-for="step in run.steps" :key="step.title"><Icon :svg="strokeIconPaths.check" :size="13" /><div><strong>{{ step.title }}</strong><p>{{ step.text }}</p><span v-if="step.tool" class="dt-tool">{{ step.tool }}</span></div></li></ol></details>
              <footer v-if="run.finishedAt">耗时 {{ taskDuration(run.finishedAt - run.startedAt) }}</footer>
            </section>
          </div>
          <aside id="daily-task-background" ref="backgroundRef" class="dt-background-rail" :class="{ 'is-open': showBackground }" aria-label="任务背景">
            <section class="dt-task-summary">
              <div class="dt-summary-title"><h2>{{ selected.name }}</h2><span class="dt-badge" :class="{ success: getTaskStatus(selected) === 'complete', blue: getTaskStatus(selected) === 'running' }">{{ status(selected) }}</span></div>
              <dl class="dt-summary-metrics">
                <div class="dt-summary-trigger"><dt>{{ selected.trigger === 'once' ? '执行方式' : '触发条件' }}</dt><dd>{{ triggerLabel(selected, runtime?.fences) }}</dd></div>
                <div><dt>执行轮次</dt><dd>{{ selected.runs.length }} 次</dd></div>
                <div><dt>{{ selected.trigger === 'once' ? '执行耗时' : '持续时间' }}</dt><dd>{{ taskDuration((selected.trigger === 'once' ? selected.runs[0]?.finishedAt ?? store.now : store.now) - selected.createdAt) }}</dd></div>
                <div v-if="selected.trigger !== 'once'" class="dt-summary-trigger"><dt>通知确认</dt><dd>{{ selected.confirmBeforeSend ? '发送前确认' : '自动发送' }}</dd></div>
                <div v-else class="dt-summary-trigger"><dt>任务来源</dt><dd>{{ selected.origin === 'workbench' ? '智能体工作台' : '手动创建' }}</dd></div>
              </dl>
              <div class="dt-summary-description"><h3>任务描述</h3><p>{{ selected.prompt }}</p></div>
              <div v-if="selected.attachments?.length" class="dt-summary-description dt-summary-attachments"><h3>输入附件 · {{ selected.attachments.length }}</h3><p v-for="(file, index) in selected.attachments" :key="index">{{ file.name }}</p></div>
            </section>
          </aside>
        </div>
      </aside>
    </div>
    <DailyTaskDialog v-model="showForm" :project-id="projectId" :task="editing" @saved="saved" />
  </div>
  <div v-else class="dt-surface dt-empty"><Icon :svg="strokeIconPaths.alarmClock" :size="30" /><h1>请先选择项目</h1><button class="dt-button" @click="goPage('projects')">前往项目管理</button></div>
</template>
