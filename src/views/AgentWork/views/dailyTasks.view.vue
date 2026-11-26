<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useWorkspace } from '@/pinia/workspace';
import { useFullWorkspace, useBusinessViewState } from '../workspaceVisits';
import { useWorkspaceChat } from '../useWorkspaceChat';
import { useRoute } from 'vue-router';
import { Icon } from '@packages/icon';
import { ElMessage, ElMessageBox } from 'element-plus';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import type { DailyTask } from '../dailyTasks';
import type { EmailOrderScenario } from '../interface';
import { formatTaskTime, getTaskStatus, taskDuration, taskStatusLabels } from '../dailyTasks';
import { downloadTaskResult, formatFileSize, visibleTaskFiles } from '../ordinaryTasks';
import { emailDemoScenarios } from '../emailOrderDemo';
import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import EmailOrderResult from '../component/emailOrderResult.comp.vue';
import { usePhase1, monitoringSkillEnabled } from '@/pinia/phase1';
import { phaseSkills } from '@/views/Phase1/catalog';
import { monitoringRule } from '@/views/Phase1/presentation';
import MonitoringTasks from '@/views/Phase1/MonitoringTasks.vue';
import '../dailyTasks.css';

const ws=useWorkspace(),handoff=useWorkspaceChat(),scope=ref('current'),kind=ref('all');
const full=useFullWorkspace();
function newTask(){if(!ws.data.projectId){ws.picker=true;return;}handoff(work.currentProjectId,[],'',undefined,true);}
function discuss(adjust=false){
 const t=selected.value, r=run.value;
 if(!t)return;
 if(!ws.data.projectId){ws.picker=true;return;}
 const send=(id:string)=>handoff(id,[{kind:'任务结果',id:t.id,runId:r?.id,label:t.name+' · '+(r?formatTaskTime(r.startedAt):'尚未执行'),detail:r?.result||'尚无执行结果'}],adjust?'调整任务：':'请解释这次任务的结果和需要跟进的问题。',t.conversationId);
 if(t.projectId) send(t.projectId);
 else ElMessageBox.confirm('使用「'+work.currentProject.name+'」讨论这份未关联项目的历史结果？任务归属不会改变。','选择工作背景').then(()=>send(work.currentProjectId)).catch(()=>{});
}
function sourceChat(){
 const t=ws.data.threads.find(c=>c.id===selected.value?.conversationId && c.projectId===selected.value?.projectId);
 if(!t){ElMessage.info('来源对话不存在，可通过追问结果开启相关对话。');return;}
 const p=work.projects.find(p=>p.id===t.projectId);if(!p)return;
 full.enter(p.id,()=>ws.open(t),'查看来源对话');
}
const work = agentWorkData();
const store = useAgentDailyTasks();
const { goPage } = useAgentWorkNav();
const route = useRoute();
const selectedId = ref('');
const taskView = ref('ordinary');
watch(() => route.query.monitor, value => { taskView.value = value === '1' ? 'monitor' : 'ordinary'; }, { immediate: true });
const runId = ref('');
const search = ref('');
const filter = ref('all');
const showBackground = ref(false);
const mailScenario = ref<EmailOrderScenario>('both');
const backgroundRef = ref<HTMLElement | null>(null);
const backgroundToggleRef = ref<HTMLButtonElement | null>(null);
const resultScroll = ref<HTMLElement | null>(null);
const isPersonal = computed(() => route.query.scope === 'personal' || work.workspaceMode === 'conversation');
const projectId = computed(() => isPersonal.value ? '' : work.currentProjectId);
const phase = usePhase1();
const listeners = computed(()=> (kind.value==='all' || kind.value==='listener') && scope.value!=='unlinked' && !isPersonal.value
 ? work.projects.filter(p=>scope.value==='all' || p.id===projectId.value).flatMap(p=>{
   const c=phase.config(p.id);
   return phaseSkills.filter(s=>c.selectedSkills.includes(s.id)).map(s=>({project:p,id:s.id,name:s.name,rule:monitoringRule(c,s.id),running:monitoringSkillEnabled(c,s.id)}));
 }) : []);
const visibleListeners = computed(()=>listeners.value.filter(l=>(l.name+l.rule).includes(search.value.trim()) && (filter.value==='all' || filter.value===(l.running?'running':'paused'))));
const projectTasks=computed(()=>store.tasks.filter(t=>(scope.value==='all'?(!t.projectId || work.projects.some(p=>p.id===t.projectId)):t.projectId===(scope.value==='unlinked'?'':projectId.value)) && (kind.value==='all' || kind.value===(t.archive?.kind ?? (t.schedule?'scheduled':t.trigger==='email'?'listener':'once')))));
const selected = computed(() => projectTasks.value.find(task => task.id === selectedId.value));
const run = computed(() => selected.value?.runs.find(item => item.id === runId.value) ?? selected.value?.runs[0]);
const isActive = computed(() => run.value && ['ready', 'running', 'stopping'].includes(run.value.status));
const latestActive = (task: DailyTask) => task.schedule || task.trigger === 'email' ? task.enabled : task.runs[0] && ['ready', 'running', 'stopping'].includes(task.runs[0].status);
const filteredTasks = computed(() => projectTasks.value.filter(task => `${task.name} ${task.prompt}`.includes(search.value.trim()) && (filter.value === 'all' || getTaskStatus(task) === filter.value)));
const primaryFiles = computed(() => visibleTaskFiles(run.value?.files));
const availableStatuses = computed(() => Object.entries(taskStatusLabels).filter(([value]) => value !== 'paused' || listeners.value.length || projectTasks.value.some(task => task.archive || task.schedule || task.trigger === 'email')));
const progress = computed(() => run.value?.progress);
const progressPercent = computed(() => progress.value?.total ? Math.round(progress.value.processed / progress.value.total * 100) : 0);
const skillStatusLabels = { loading: '待加载', running: '执行中', success: '执行成功', failed: '执行失败', stopped: '已停止' };
const resultHtml = computed(() => DOMPurify.sanitize(marked.parse(run.value?.result ?? '', { async: false, breaks: true }) as string, { FORBID_TAGS: ['img', 'iframe'] }));

watch([projectId, () => route.query.taskId], () => {
  selectedId.value = route.query.view==='list'?'':projectTasks.value.find(task => task.id === route.query.taskId)?.id ?? projectTasks.value[0]?.id ?? '';
  filter.value = 'all'; search.value = ''; if(route.query.scope==='personal')scope.value='unlinked';
}, { immediate: true });
watch(selectedId, () => { runId.value = String(route.query.runId || ''); showBackground.value = false; resultScroll.value?.scrollTo({ top: 0 }); });
watch(() => [selectedId.value,route.query.runId], () => { runId.value = route.query.runId===selected.value?.runs[0]?.id?'':String(route.query.runId || ''); }, {immediate:true});
watch(filteredTasks, tasks => { if (selectedId.value && !tasks.some(task => task.id === selectedId.value)) selectedId.value = ''; });
function dismissBackground(event: MouseEvent) { if (!backgroundRef.value?.contains(event.target as Node) && !backgroundToggleRef.value?.contains(event.target as Node)) showBackground.value = false; }
function closeBackground(event: KeyboardEvent) { if (event.key === 'Escape') showBackground.value = false; }
onMounted(() => { document.addEventListener('click', dismissBackground); document.addEventListener('keydown', closeBackground); });
onBeforeUnmount(() => { document.removeEventListener('click', dismissBackground); document.removeEventListener('keydown', closeBackground); });
function rerun(task: DailyTask) { try { store.rerunTask(task.id); selectedId.value = task.id; } catch (error) { ElMessage.warning((error as Error).message); } }
function start(task: DailyTask) { try { store.startTask(task.id); } catch (error) { ElMessage.info((error as Error).message); } }
async function rename(task: DailyTask) {
  try { const response = await ElMessageBox.prompt('任务标题', '修改任务标题', { inputValue: task.name, inputValidator: value => value.trim().length > 0 && value.trim().length <= 40 || '请输入 1–40 字', confirmButtonText: '保存', cancelButtonText: '取消' }); store.renameTask(task.id, response.value); } catch { /* Cancel leaves the title unchanged. */ }
}
async function remove(task: DailyTask) {
  try { await ElMessageBox.confirm(`删除“${task.name}”将终止执行并移除任务结果和下载归档。`, '删除任务', { confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'dialog-danger', type: 'warning' }); store.deleteTask(task.id); } catch { /* Cancel keeps the task. */ }
}
function receiveMail(task: DailyTask) {
  try { store.receiveDemoEmail(task.id, mailScenario.value); runId.value = ''; } catch (error) { ElMessage.warning((error as Error).message); }
}
useBusinessViewState('tasks',()=>({scope:scope.value,kind:kind.value,search:search.value,status:filter.value,selected:selectedId.value,run:run.value?.id,info:showBackground.value,mail:mailScenario.value}),async v=>{
  scope.value=v.scope;kind.value=v.kind;search.value=v.search;filter.value=v.status;mailScenario.value=v.mail;
  selectedId.value=projectTasks.value.some(t=>t.id===v.selected)?v.selected:'';
  const visitPath=route.fullPath;
  await nextTick();if(route.fullPath!==visitPath)return;
  if(v.run && selected.value && !selected.value.runs.some(r=>r.id===v.run))ElMessage.info('原执行记录已不可用，已恢复任务的其余信息。');
  runId.value=selected.value?.runs.some(r=>r.id===v.run)&&v.run!==selected.value?.runs[0]?.id?v.run!:'';
  showBackground.value=v.info;
});
</script>

<template>
  <div class="dt-surface dt-page">
    <header class="dt-page-header">
      <div class="dt-title"><Icon :svg="strokeIconPaths.file" :size="16" /><h1>任务</h1><span class="dt-project-name">{{ isPersonal ? '未关联项目' : work.currentProject.name }}</span></div>
      <button class="dt-icon" type="button" title="返回智能体工作台" aria-label="返回智能体工作台" @click="full.enter()"><Icon :svg="strokeIconPaths.msg" :size="16" /></button>
    </header>
    <div v-if="taskView==='monitor'" class="flex h-10 items-center border-b px-4 text-xs"><button class="dt-text-button" @click="goPage('dailyTasks',{projectId})">返回任务列表</button></div>
    <MonitoringTasks v-if="!isPersonal && taskView === 'monitor'" :project-id="projectId" />
    <div v-else class="dt-page-body" :class="{ 'has-panel': selected }">
      <div class="dt-task-column">
        <div class="dt-list-toolbar">
          <div class="dt-list-heading"><span>{{ projectTasks.length + listeners.length }} 项任务 <span class="dt-secondary">· {{ projectTasks.filter(latestActive).length + listeners.filter(l=>l.running).length }} 项处理中</span></span><button class="dt-button primary" type="button" @click="newTask"><Icon :svg="strokeIconPaths.plus" :size="15" />新建任务</button></div>
          <div class="dt-filters"><select v-model="scope" aria-label="任务查看范围"><option value="current">当前项目</option><option value="all">全部项目</option><option value="unlinked">未关联项目</option></select><select v-model="kind" aria-label="任务类型"><option value="all">全部类型</option><option value="once">普通任务</option><option value="listener">监听任务</option><option value="scheduled">定时任务</option></select></div>
          <div class="dt-filters"><div class="dt-search"><Icon :svg="strokeIconPaths.search" :size="14" /><input v-model="search" aria-label="搜索任务" placeholder="搜索任务" /></div><select v-model="filter" aria-label="任务状态筛选"><option value="all">全部状态</option><option v-for="[value, label] in availableStatuses" :key="value" :value="value">{{ label }}</option></select></div>
        </div>
        <section data-view-scroll="tasks" class="dt-task-area" aria-label="任务列表">
          <div v-if="filteredTasks.length || visibleListeners.length" class="dt-task-grid">
            <article v-for="l in visibleListeners" :key="l.project.id+':'+l.id" class="dt-task-card">
              <button class="dt-task-main" @click="goPage('dailyTasks',{projectId:l.project.id,monitor:'1',taskId:l.id})"><div class="dt-task-heading"><span class="dt-task-symbol"><Icon :svg="strokeIconPaths.locate" :size="17"/></span><h2>{{l.name}}</h2><span class="dt-badge" :class="{blue:l.running}">{{l.running?'运行中':'已暂停'}}</span></div><p class="dt-trigger">在途监听 · {{l.project.name}}</p><p class="dt-task-description">{{l.rule}}</p></button>
            </article>
            <article v-for="task in filteredTasks" :key="task.id" class="dt-task-card" :class="{ selected: selectedId === task.id }">
              <button type="button" class="dt-task-main" :aria-label="`查看任务 ${task.name}`" :aria-pressed="selectedId === task.id" @click="selectedId = task.id">
                <div class="dt-task-heading"><span class="dt-task-symbol"><Icon :svg="task.trigger === 'email' ? strokeIconPaths.messageText : strokeIconPaths.file" :size="17" /></span><h2>{{ task.name }}</h2><span class="dt-badge" :class="{ success: getTaskStatus(task) === 'complete', blue: getTaskStatus(task) === 'running', warning: ['partial', 'failed'].includes(getTaskStatus(task)) }">{{ taskStatusLabels[getTaskStatus(task)] }}</span></div>
                <p class="dt-trigger">{{ scope==='current'?'':(task.projectContext?.name || '未关联项目')+' · ' }}{{ task.archive?.triggerLabel || (task.schedule?'每日 '+task.schedule.time : task.trigger === 'email' ? '持续监听邮箱' : task.origin === 'workbench' ? '工作台创建' : '手动创建') }} · {{ formatTaskTime(task.createdAt) }}</p>
                <p v-if="task.mailbox" class="dt-email-address">{{ task.mailbox.address }}<span>已绑定</span></p>
                <p class="dt-task-description" :title="task.prompt">{{ task.prompt }}</p>
                <p v-if="task.runs[0]?.status === 'running'" class="dt-trigger">{{ task.runs[0].steps[task.runs[0].activeStep]?.title }}<span v-if="task.runs[0].progress"> · {{ task.runs[0].progress.processed }}/{{ task.runs[0].progress.total }}</span></p>
              </button>
              <footer class="dt-task-footer"><div class="dt-task-meta"><span>{{ task.archive?.executions ?? task.runs.length }} 次执行</span><span v-if="task.trigger !== 'email'">{{ task.attachments?.length ?? 0 }} 个附件</span></div><div v-if="!task.archive" class="dt-task-actions"><template v-if="task.trigger === 'email' || task.schedule"><button type="button" class="dt-icon" :title="task.enabled ? '暂停任务' : '恢复任务'" :aria-label="task.enabled ? '暂停任务' : '恢复任务'" @click="store.toggleTask(task.id)"><Icon :svg="task.enabled ? strokeIconPaths.pause : strokeIconPaths.play" :size="14" /></button></template><template v-else><button type="button" class="dt-icon" title="修改标题" aria-label="修改任务标题" @click="rename(task)"><Icon :svg="strokeIconPaths.edit" :size="14" /></button><button v-if="latestActive(task)" type="button" class="dt-icon" title="停止任务" aria-label="停止任务" :disabled="getTaskStatus(task) === 'stopping'" @click="store.stopTask(task.id)"><Icon :svg="strokeIconPaths.x" :size="14" /></button><button v-else type="button" class="dt-icon" title="重新执行" aria-label="重新执行任务" @click="rerun(task)"><Icon :svg="strokeIconPaths.refresh" :size="14" /></button><button type="button" class="dt-icon danger" title="删除任务" aria-label="删除任务" @click="remove(task)"><Icon :svg="strokeIconPaths.trash" :size="14" /></button></template></div></footer>
            </article>
          </div>
          <div v-else class="dt-empty compact"><Icon :svg="strokeIconPaths.file" :size="26" /><h2>{{ search || filter !== 'all' ? '没有匹配的任务' : '暂无任务' }}</h2><button v-if="!search && filter === 'all'" class="dt-button" @click="newTask">新建任务</button></div>
        </section>
      </div>
      <aside v-if="selected" class="dt-run-panel" aria-label="任务运行面板">
        <header class="dt-run-header"><div class="dt-title"><h2>{{ selected.name }}</h2><button v-if="selected.trigger !== 'email'" type="button" class="dt-icon" title="修改标题" aria-label="修改当前任务标题" @click="rename(selected)"><Icon :svg="strokeIconPaths.edit" :size="13" /></button></div><div class="dt-actions"><button ref="backgroundToggleRef" type="button" class="dt-background-toggle" :aria-expanded="showBackground" aria-controls="ordinary-task-background" @click="showBackground = !showBackground"><Icon :svg="strokeIconPaths.info" :size="14" />任务信息</button><button class="dt-icon" type="button" title="关闭面板" aria-label="关闭任务面板" @click="selectedId = ''"><Icon :svg="strokeIconPaths.x" :size="16" /></button></div></header>
        <div class="flex flex-wrap items-center gap-4 border-b px-4 py-2 text-xs"><button v-if="selected.conversationId" @click="sourceChat">查看来源对话</button><button v-if="run" @click="discuss()">追问结果</button><button v-if="selected.trigger==='once' && selected.projectId" @click="discuss(true)">调整任务</button></div>
        <div class="dt-run-body">
          <div class="dt-run-main">
            <div ref="resultScroll" data-view-scroll="results" class="dt-run-scroll">
              <p v-if="store.storageError" class="dt-error" role="alert">{{ store.storageError }}</p>
              <div v-if="selected.trigger === 'email'" class="dt-mail-toolbar"><select v-model="mailScenario" aria-label="订单邮件类型"><option v-for="scenario in emailDemoScenarios" :key="scenario.id" :value="scenario.id">{{ scenario.label }}</option></select><button type="button" class="dt-button" :disabled="!selected.enabled || isActive" @click="receiveMail(selected)"><Icon :svg="strokeIconPaths.plus" :size="14" />读取订单邮件</button></div>
              <template v-if="run">
              <div class="dt-execution-toolbar"><label>执行记录<select v-model="runId" aria-label="选择执行记录"><option value="">最新执行 · {{ formatTaskTime(selected.runs[0]!.startedAt) }}</option><option v-for="item in selected.runs.slice(1)" :key="item.id" :value="item.id">{{ formatTaskTime(item.startedAt) }} · {{ taskStatusLabels[item.status] }}</option></select></label><span class="dt-badge" :class="{ success: run.status === 'complete', blue: run.status === 'running', warning: run.status === 'failed' || run.status === 'partial' }">{{ taskStatusLabels[run.status] }}</span></div>
              <section v-if="progress" class="dt-result-section"><div class="dt-run-section-heading"><h3>处理进度</h3><span>{{ progress.processed }}/{{ progress.total }}</span></div><div class="dt-progress-track" role="progressbar" :aria-valuenow="progress.processed" :aria-valuemin="0" :aria-valuemax="progress.total" aria-label="数据处理进度"><span :style="{ transform: `scaleX(${progressPercent / 100})` }"></span></div><p class="dt-progress-counts">成功 {{ progress.success }} · 失败 {{ progress.failed }} · {{ run.status === 'stopped' ? '未执行' : '待处理' }} {{ progress.total - progress.processed }}</p></section>
              <div v-if="isActive" class="dt-active-run"><Icon :svg="strokeIconPaths.refresh" :size="16" :svg-class="run.status === 'running' ? 'animate-spin' : ''" /><div><strong>{{ run.status === 'ready' ? '等待执行资源' : run.status === 'stopping' ? '正在终止本次执行' : run.steps[run.activeStep]?.title }}</strong><p>{{ run.status === 'stopping' ? '停止后保存已完成部分，不继续处理剩余记录。' : run.steps[run.activeStep]?.text }}</p><button v-if="run.status === 'ready'" type="button" class="dt-button" @click="start(selected)"><Icon :svg="strokeIconPaths.play" :size="14" />开始执行</button></div></div>
              <details class="dt-run-steps" :open="isActive"><summary>执行过程</summary><ol><li v-for="(step, index) in run.steps" :key="step.title" :class="{ 'dt-step-future': index > run.activeStep }"><Icon :svg="index < run.activeStep ? strokeIconPaths.check : index === run.activeStep && run.status === 'running' ? strokeIconPaths.refresh : strokeIconPaths.file" :size="13" :svg-class="index === run.activeStep && run.status === 'running' ? 'animate-spin' : ''" /><div><strong>{{ step.title }}</strong><p>{{ step.text }}</p><span v-if="step.tool" class="dt-tool">{{ step.tool }}</span></div></li></ol></details>
              <section v-if="selected.trigger !== 'email'" class="dt-result-section"><h3>加载的 Skill</h3><p v-if="!run.skills?.length" class="dt-progress-counts">本次未加载 Skill</p><div v-for="skill in run.skills" :key="skill.id" class="dt-skill-line"><strong>{{ skill.name }} <span>v{{ skill.version }}</span></strong><span>{{ skillStatusLabels[skill.status] }}</span><p>{{ skill.description }}</p></div></section>
              <section v-if="run.result" class="dt-result-section"><h3>任务结果</h3><div class="dt-run-result dt-result-markdown" v-html="resultHtml"></div><p v-if="run.finishedAt" class="dt-progress-counts">完成 {{ formatTaskTime(run.finishedAt) }} · 耗时 {{ taskDuration(run.finishedAt - run.startedAt) }}</p></section>
              <EmailOrderResult v-if="run.emailOrder && run.status === 'complete'" :email="run.emailOrder" />
              <section v-if="primaryFiles.length" class="dt-result-section"><div class="dt-run-section-heading"><h3>结果文件 <span>{{ primaryFiles.length }}</span></h3><button type="button" class="dt-text-button" @click="goPage('downloads')">下载归档<Icon :svg="strokeIconPaths.chevron" :size="12" /></button></div><div class="dt-result-files"><button v-for="file in primaryFiles" :key="file.name" type="button" class="dt-result-file" :aria-label="`下载 ${file.name}`" @click="downloadTaskResult(file)"><Icon :svg="file.name.endsWith('.zip') ? strokeIconPaths.folder : strokeIconPaths.fileSpreadsheet" :size="20" /><span><strong>{{ file.name }}</strong><small>{{ file.name.split('.').pop()?.toUpperCase() }} · {{ formatFileSize(file.size ?? 0) }}</small></span><Icon :svg="strokeIconPaths.download" :size="17" /></button></div></section>
              </template>
              <div v-else class="dt-empty compact"><Icon :svg="strokeIconPaths.messageText" :size="26" /><h2>{{ selected.schedule ? "等待下一次定时执行" : "等待新的订单邮件" }}</h2></div>
            </div>
          </div>
          <aside id="ordinary-task-background" ref="backgroundRef" class="dt-background-rail" :class="{ 'is-open': showBackground }" aria-label="任务背景">
            <section class="dt-task-summary"><div class="dt-summary-title"><h2>任务信息</h2><span class="dt-badge">{{ selected.archive?.kind==='listener'?'监听任务':selected.archive?.kind==='scheduled'||selected.schedule?'定时任务':selected.trigger === 'email' ? '邮件任务' : '普通任务' }}</span></div><dl class="dt-summary-metrics"><div class="dt-summary-trigger"><dt>任务来源</dt><dd>{{ selected.trigger === 'email' ? '项目邮箱绑定' : selected.origin === 'workbench' ? '智能体工作台' : '手动创建' }} · {{ selected.projectContext?.name || '未关联项目' }}</dd></div><div><dt>创建时间</dt><dd>{{ formatTaskTime(selected.createdAt) }}</dd></div><div><dt>执行次数</dt><dd>{{ selected.archive?.executions ?? selected.runs.length }} 次</dd></div><div><dt>开始时间</dt><dd>{{ run ? run.status === 'ready' ? '待开始' : formatTaskTime(run.startedAt) : selected.schedule ? '等待下次执行' : '等待收件' }}</dd></div><div><dt>结束时间</dt><dd>{{ run?.finishedAt ? formatTaskTime(run.finishedAt) : '—' }}</dd></div><div class="dt-summary-trigger"><dt>执行方式</dt><dd>{{ selected.trigger === 'email' ? '收件后处理与回复' : run?.executionMode === 'skill' ? 'Skill 执行' : '提示词执行' }}</dd></div></dl><div v-if="selected.trigger==='once' && !selected.archive" class="dt-summary-description"><h3>处理范围</h3><p>{{selected.scopeRecords?.length ? '已选 '+selected.scopeRecords.length+' 条业务记录（提交时保存）' : selected.attachments?.length ? '提交时上传的文件' : '本次任务提示词'}}{{selected.schedule?' · 每日 '+selected.schedule.time+'（北京时间）':''}}</p></div><div class="dt-summary-description"><h3>原始任务描述</h3><p>{{ selected.prompt }}</p></div><div v-if="selected.attachments?.length" class="dt-summary-description dt-summary-attachments"><h3>输入 Excel · {{ selected.attachments.length }}</h3><p v-for="file in selected.attachments" :key="file.name">{{ file.name }} · {{ file.rowCount }} 行</p></div><div v-if="!selected.archive" class="dt-summary-controls"><button v-if="selected.trigger === 'email'" class="dt-button" type="button" @click="store.toggleTask(selected.id)"><Icon :svg="selected.enabled ? strokeIconPaths.pause : strokeIconPaths.play" :size="14" />{{ selected.enabled ? '暂停后续收件' : '启动邮件任务' }}</button><button v-else-if="latestActive(selected)" class="dt-button" type="button" :disabled="getTaskStatus(selected) === 'stopping'" @click="store.stopTask(selected.id)"><Icon :svg="strokeIconPaths.x" :size="14" />停止任务</button><button v-else class="dt-button" type="button" @click="rerun(selected)"><Icon :svg="strokeIconPaths.refresh" :size="14" />重新执行</button></div></section>
          </aside>
        </div>
      </aside>
    </div>
  </div>
</template>
