import { defineStore } from 'pinia';
import type { EmailOrderScenario, Order, Project } from '@/views/AgentWork/interface';
import type { DailyTask, DailyTaskDraft, EventType, MonitorId, ProjectFence, ProjectTaskRuntime, TaskAgentDecision, TaskRun, WaybillEvent, WaybillPhase } from '@/views/AgentWork/dailyTasks';
import { createMonitoredOrders, ensureRequiredMonitorSkills, eventDefinitions, eventLabel, monitorDefinitions } from '@/views/AgentWork/dailyTasks';
import { extractTaskPlates, makeOrdinaryRun, mergeTaskAttachments, ordinaryStepDelay, ordinaryTaskName, ordinaryTaskResult, taskRecords, updateOrdinaryProgress, visibleTaskFiles } from '@/views/AgentWork/ordinaryTasks';
import { completeEmailRun, createEmailDemoTask, createEmailRun, emailDemoStepDelay } from '@/views/AgentWork/emailOrderDemo';
import { hasHistoryTaskIntent, ordinaryTaskLimits } from '@/views/AgentWork/ordinaryTaskSkills';
import { ordinaryTasksStorageKey as storageKey, restoreOrdinaryTasks } from './ordinaryTaskPersistence';

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const active = (run: TaskRun) => ['ready', 'running', 'stopping'].includes(run.status);

function sampleEvent(runtime: ProjectTaskRuntime, type: EventType, source: WaybillEvent['source'], fenceId?: string): WaybillEvent | null {
  const order = runtime.orders.find(item => item.phase === '行程在途') ?? runtime.orders[0];
  if (!order) return null;
  const value = type === 'deviation' ? 12.6 : type === 'offline' ? 26 : 47;
  return { id: newId('event'), projectId: runtime.projectId, type, occurredAt: Date.now(), source, order: { ...order }, detail: `${order.plate}：${eventLabel(type)}，已保存节点证据。`, value, fenceId };
}

export const useAgentDailyTasks = defineStore('agentDailyTasks', {
  state: () => ({ projects: {} as Record<string, ProjectTaskRuntime>, tasks: restoreOrdinaryTasks(), now: Date.now(), storageError: '' }),
  getters: {
    resultDownloads: state => state.tasks.flatMap(task => task.runs.flatMap(run => visibleTaskFiles(run.files).map((file, index) => ({
      id: `${task.id}:${run.id}:${index}`, taskId: task.id, taskTitle: task.name, projectId: task.projectId, runId: run.id, finishedAt: run.finishedAt ?? run.startedAt, file,
    })))).sort((a, b) => b.finishedAt - a.finishedAt),
  },
  actions: {
    persistTasks() {
      if (typeof window === 'undefined') return;
      try { window.localStorage.setItem(storageKey, JSON.stringify(this.tasks)); this.storageError = ''; }
      catch { this.storageError = '浏览器存储空间不足，当前任务仍可执行和下载，刷新前请下载所需结果。'; }
    },
    syncProjects(projects: Project[], orders: Order[]) {
      for (const project of projects) {
        let runtime = this.projects[project.id];
        if (!runtime) {
          runtime = { projectId: project.id, connected: project.status === '已连接', total: project.total, skillIds: ensureRequiredMonitorSkills(project.skillIds), startedAt: Date.now(), monitors: monitorDefinitions.map((definition, index) => ({ id: definition.id, runs: 0, events: 0, lastRun: null, nextRun: Date.now() + (definition.seconds + index * 3) * 1000 })), fences: [], orders: project.total > 0 ? createMonitoredOrders(orders) : [], events: [], processedEventIds: [] };
          this.projects[project.id] = runtime;
        }
        runtime.connected = project.status === '已连接'; runtime.total = project.total;
        runtime.projectContext = { id: project.id, name: project.name, status: project.status, sync: project.sync, total: project.total, risk: project.risk, keyword: project.keyword, statusFilter: project.statusFilter, skillIds: [...(project.skillIds ?? [])] };
        runtime.skillIds = ensureRequiredMonitorSkills(project.skillIds);
        if (!runtime.orders.length && project.total > 0) runtime.orders = createMonitoredOrders(orders);
        if (project.mailbox?.status === 'bound') {
          let task = this.tasks.find(item => item.projectId === project.id && item.trigger === 'email');
          if (!task) { task = createEmailDemoTask(project.id, Date.now(), project.id === 'P001'); this.tasks.unshift(task); }
          task.mailbox = { ...project.mailbox };
          task.projectContext = runtime.projectContext;
        }
      }
      const ids = new Set(projects.map(project => project.id));
      for (const task of this.tasks) if (task.projectId && this.projects[task.projectId]) task.projectContext = this.projects[task.projectId].projectContext;
      for (const id of Object.keys(this.projects)) if (!ids.has(id)) delete this.projects[id];
      this.tasks = this.tasks.filter(task => (task.trigger === 'once' || task.trigger === 'email' && projects.some(project => project.id === task.projectId && project.mailbox?.status === 'bound')) && (!task.projectId || ids.has(task.projectId)));
      if (typeof window !== 'undefined' && !window.localStorage.getItem(storageKey)) {
        this.seedTasks('');
        if (ids.has('P001')) this.seedTasks('P001');
      }
      this.persistTasks();
    },
    seedTasks(projectId: string) {
      if (this.tasks.some(task => task.projectId === projectId && task.trigger === 'once')) return;
      const drafts = [
        { name: '运单历史轨迹核验', prompt: '查询表格中所有运单的历史轨迹，生成执行报告及结果包。', records: Array.from({ length: 6 }, (_, index) => ({ 运单号: `YD-DEMO-${index + 1}`, 车牌号: index === 5 ? '' : `沪A${12345 + index}` })) },
        { name: '运输数据质量复盘', prompt: '分析运输数据的质量问题，生成复盘报告。', records: [] },
      ];
      for (const draft of drafts) {
        const task: DailyTask = { name: draft.name, prompt: draft.prompt, trigger: 'once', attachments: draft.records.length ? [{ name: '历史运单.xlsx', size: 8192, type: '', lastModified: Date.now(), rowCount: draft.records.length, records: draft.records }] : [], id: newId('task'), projectId, projectContext: this.projects[projectId]?.projectContext, createdAt: Date.now() - DAY, runs: [], origin: 'manual' };
        const run = makeOrdinaryRun(task); run.startedAt = task.createdAt; run.activeStep = run.steps.length;
        updateOrdinaryProgress(task, run, taskRecords(task).length);
        const result = ordinaryTaskResult(task, run);
        Object.assign(run, { status: run.progress?.failed ? 'partial' : 'complete', finishedAt: task.createdAt + 60000, result: result.text, files: result.files });
        run.skills?.forEach(skill => { skill.status = 'success'; }); task.runs.push(run); this.tasks.push(task);
      }
    },
    unavailableReason(task: { projectId: string }) { return task.projectId && !this.projects[task.projectId] ? '项目不存在' : ''; },
    saveTask(projectId: string, draft: DailyTaskDraft, taskId?: string, source?: { origin: 'workbench'; conversationId?: string; agentDecision?: TaskAgentDecision }) {
      if (projectId && !this.projects[projectId]) throw new Error('项目不存在');
      if (draft.trigger !== 'once') throw new Error('做任务仅支持一次性普通任务');
      if (!draft.prompt.trim()) throw new Error('请填写要做的事情');
      if (draft.name.trim().length > 40 || draft.prompt.trim().length > 2000) throw new Error('任务标题最多 40 字，任务描述最多 2000 字');
      const attachments = mergeTaskAttachments([], draft.attachments ?? []);
      const invalid = attachments.find(file => file.parseError || !file.records?.length);
      if (invalid) throw new Error(`“${invalid.name}”：${invalid.parseError || '尚未读取有效数据，请重新上传'}`);
      if (hasHistoryTaskIntent(draft.prompt) && !extractTaskPlates(draft.prompt).length && !attachments.length) throw new Error('请补充车牌号，或上传包含车牌号的 Excel');
      if (taskId) throw new Error('原始输入已保存，请通过重新执行创建新的执行记录');
      const task: DailyTask = { ...draft, trigger: 'once', name: draft.name.trim() || ordinaryTaskName(draft.prompt), prompt: draft.prompt.trim(), attachments, id: newId('task'), projectId, projectContext: this.projects[projectId]?.projectContext, createdAt: Date.now(), runs: [], origin: source?.origin ?? 'manual', conversationId: source?.conversationId, agentDecision: source?.agentDecision ? { ...source.agentDecision, historicalIndexes: [...source.agentDecision.historicalIndexes] } : undefined };
      task.runs.push(makeOrdinaryRun(task)); this.tasks.unshift(task); this.persistTasks(); this.tick(); return task.id;
    },
    renameTask(taskId: string, name: string) {
      if (!name.trim() || name.trim().length > 40) throw new Error('任务标题需为 1–40 字');
      const task = this.tasks.find(item => item.id === taskId);
      if (task && task.trigger !== 'email') { task.name = name.trim(); this.persistTasks(); }
    },
    deleteTask(taskId: string) { if (this.tasks.find(task => task.id === taskId)?.trigger === 'email') return; this.tasks = this.tasks.filter(task => task.id !== taskId); this.persistTasks(); },
    toggleTask(taskId: string) {
      const task = this.tasks.find(item => item.id === taskId);
      if (!task || task.trigger !== 'email') throw new Error('普通任务不支持暂停或启动');
      task.enabled = !task.enabled; this.persistTasks();
    },
    receiveDemoEmail(taskId: string, scenario: EmailOrderScenario) {
      const task = this.tasks.find(item => item.id === taskId && item.trigger === 'email');
      if (!task) return;
      if (!task.enabled) throw new Error('请先启动邮件处理任务');
      if (task.runs.some(run => run.status === 'running')) throw new Error('本封邮件正在处理，请稍后再试');
      task.runs.unshift(createEmailRun(task, scenario)); this.persistTasks();
    },
    startTask(taskId: string) {
      const task = this.tasks.find(item => item.id === taskId);
      if (task?.runs[0]?.status !== 'ready') return;
      this.tick();
      if (task.runs[0].status === 'ready') throw new Error('执行资源已满，任务将在有空闲资源时自动开始');
    },
    stopTask(taskId: string) {
      const run = this.tasks.find(task => task.id === taskId && task.trigger === 'once')?.runs[0];
      if (!run || !['ready', 'running'].includes(run.status)) return;
      run.status = 'stopping'; run.stoppedAt = Date.now(); run.nextStepAt = Date.now() + 1500; this.persistTasks();
    },
    rerunTask(taskId: string) {
      const task = this.tasks.find(item => item.id === taskId);
      if (!task) throw new Error('任务已删除');
      if (task.trigger !== 'once') throw new Error('邮件任务请通过模拟收件执行');
      if (task.runs.some(active)) throw new Error('当前执行尚未结束');
      task.runs.unshift(makeOrdinaryRun(task)); this.persistTasks(); this.tick(); return task.runs[0]!.id;
    },
    receiveOrdinaryResult(taskId: string, jobId: string, result: { text: string; files: NonNullable<TaskRun['files']> }) {
      const task = this.tasks.find(item => item.id === taskId); const run = task?.runs.find(item => item.toolJobId === jobId);
      if (!run || run.status !== 'running' || !result.text.trim() && !result.files.length) return;
      run.status = run.progress?.failed ? run.progress.success ? 'partial' : 'failed' : 'complete';
      run.activeStep = run.steps.length; run.finishedAt = this.now; run.result = result.text; run.files = result.files;
      this.persistTasks();
    },
    saveFence(projectId: string, fence: Omit<ProjectFence, 'id'>) {
      const runtime = this.projects[projectId]; if (!runtime) throw new Error('项目不存在');
      if (!fence.name.trim() || runtime.fences.some(item => item.name === fence.name.trim())) throw new Error('围栏名称为空或已存在');
      if (!Number.isFinite(fence.latitude) || Math.abs(fence.latitude) > 90 || !Number.isFinite(fence.longitude) || Math.abs(fence.longitude) > 180 || !Number.isFinite(fence.radius) || fence.radius < 100 || fence.radius > 50000) throw new Error('请检查经纬度与围栏半径');
      const saved = { ...fence, name: fence.name.trim(), id: newId('fence') }; runtime.fences.push(saved); return saved;
    },
    deleteFence(projectId: string, fenceId: string) { const runtime = this.projects[projectId]; if (runtime) runtime.fences = runtime.fences.filter(fence => fence.id !== fenceId); },
    receiveEvent(event: WaybillEvent) {
      const runtime = this.projects[event.projectId]; const definition = monitorDefinitions.find(item => item.id === eventDefinitions.find(item => item.id === event.type)?.monitor);
      if (!runtime?.connected || !definition || !runtime.skillIds.includes(definition.skillId) || runtime.processedEventIds.includes(event.id)) return;
      if (event.type.startsWith('fence-') && !runtime.fences.some(fence => fence.id === event.fenceId)) return;
      runtime.processedEventIds.push(event.id); runtime.events.unshift(event); runtime.events = runtime.events.slice(0, 100);
      const monitor = runtime.monitors.find(item => item.id === definition.id)!; monitor.events++;
    },
    simulateFenceCallback(projectId: string, fenceId: string, type: 'fence-enter' | 'fence-exit') { const runtime = this.projects[projectId]; if (runtime) { const event = sampleEvent(runtime, type, 'callback', fenceId); if (event) this.receiveEvent(event); } },
    runMonitor(runtime: ProjectTaskRuntime, monitorId: MonitorId) {
      const monitor = runtime.monitors.find(item => item.id === monitorId)!; monitor.runs++; monitor.lastRun = this.now;
      if (monitorId === 'loading' || monitorId === 'unloading') {
        const transitions: Partial<Record<WaybillPhase, { phase: WaybillPhase; type?: EventType }>> = monitorId === 'loading'
          ? { 装货前: { phase: '装货开始', type: 'loading-start' }, 装货开始: { phase: '装货结束', type: 'loading-end' }, 装货结束: { phase: '行程在途' } }
          : { 行程在途: { phase: '卸货开始', type: 'unloading-start' }, 卸货开始: { phase: '卸货结束', type: 'unloading-end' } };
        for (const order of runtime.orders) {
          const transition = transitions[order.phase]; if (!transition || order.phase === '行程在途' && this.now - order.phaseChangedAt < 600000) continue;
          order.phase = transition.phase; order.phaseChangedAt = this.now;
          if (transition.type) this.receiveEvent({ id: newId('event'), projectId: runtime.projectId, type: transition.type, occurredAt: this.now, source: 'poll', order: { ...order }, detail: `${order.plate} 状态流转为“${transition.phase}”。`, value: 0 });
        }
      } else if (monitorId !== 'fence' && runtime.orders.some(order => order.phase === '行程在途')) { const event = sampleEvent(runtime, monitorId, 'poll'); if (event) this.receiveEvent(event); }
    },
    tick(now = Date.now()) {
      this.now = now; let changed = false;
      for (const runtime of Object.values(this.projects as Record<string, ProjectTaskRuntime>)) {
        if (!runtime.connected || !runtime.orders.length) continue;
        for (const monitor of runtime.monitors) { const definition = monitorDefinitions.find(item => item.id === monitor.id)!; if (definition.seconds && runtime.skillIds.includes(definition.skillId) && now >= monitor.nextRun) { this.runMonitor(runtime, definition.id); monitor.nextRun = now + definition.seconds * 1000; } }
      }
      let running = this.tasks.filter(task => task.trigger === 'once' && task.runs.some(run => ['running', 'stopping'].includes(run.status))).length;
      for (const task of [...this.tasks].reverse()) {
        if (task.trigger === 'email') {
          for (const mailRun of task.runs) {
            while (mailRun.status === 'running' && now >= mailRun.nextStepAt) {
              changed = true; mailRun.activeStep++; mailRun.nextStepAt += emailDemoStepDelay;
              if (mailRun.activeStep >= mailRun.steps.length) completeEmailRun(mailRun, now);
            }
          }
          continue;
        }
        const run = task.runs[0]; if (!run) continue;
        if (run.status === 'ready' && running < ordinaryTaskLimits.maxConcurrentRuns) { run.status = 'running'; run.startedAt = now; run.nextStepAt = now + ordinaryStepDelay(); running++; changed = true; }
        if (run.status === 'stopping' && now >= run.nextStepAt) {
          const result = ordinaryTaskResult(task, run, true); Object.assign(run, { status: 'stopped', finishedAt: now, result: result.text, files: result.files }); run.skills?.forEach(skill => { if (skill.status !== 'success') skill.status = 'stopped'; }); changed = true; continue;
        }
        // Advance from recorded deadlines so a restored run catches up after a refresh.
        while (run.status === 'running' && now >= run.nextStepAt) {
          changed = true;
          if (run.activeStep === 3 && run.progress && run.progress.processed < run.progress.total) {
            updateOrdinaryProgress(task, run, run.progress.processed + ordinaryTaskLimits.batchSize);
            if (run.progress.processed < run.progress.total) { run.nextStepAt += ordinaryStepDelay(); continue; }
          }
          run.activeStep++;
          if (run.activeStep >= 3) run.skills?.forEach(skill => { skill.status = run.activeStep >= run.steps.length ? 'success' : 'running'; });
          run.nextStepAt += ordinaryStepDelay();
          if (run.activeStep < run.steps.length) continue;
          try { this.receiveOrdinaryResult(task.id, run.toolJobId!, ordinaryTaskResult(task, run)); }
          catch (error) { run.status = 'failed'; run.finishedAt = now; run.error = (error as Error).message; run.result = `结果生成失败：${run.error}。可重新执行。`; run.skills?.forEach(skill => { skill.status = 'failed'; }); }
        }
      }
      if (changed) this.persistTasks();
    },
  },
});

const DAY = 86400000;
