import { defineStore } from 'pinia';
import type { Order, Project } from '@/views/AgentWork/interface';
import type { DailyTask, DailyTaskDraft, EventType, MonitorId, ProjectFence, ProjectTaskRuntime, TaskRun, WaybillEvent, WaybillPhase } from '@/views/AgentWork/dailyTasks';
import { createMonitoredOrders, ensureRequiredMonitorSkills, eventDefinitions, eventLabel, hasTaskResult, isThresholdEvent, monitorDefinitions } from '@/views/AgentWork/dailyTasks';
import { extractTaskPlates, makeOrdinaryRun, mergeTaskAttachments, ordinaryStepDelay, ordinaryTaskName, ordinaryTaskResult, resolveAsyncTool } from '@/views/AgentWork/ordinaryTasks';
import { createDataEmployeeSkills } from './dataEmployeeSkills';

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const stepDelay = () => 1600 + Math.round(Math.random() * 1000);
const dataEmployeeNames = Object.fromEntries(createDataEmployeeSkills().map((skill) => [skill.id, skill.name]));

function sampleEvent(runtime: ProjectTaskRuntime, type: EventType, source: WaybillEvent['source'], fenceId?: string): WaybillEvent | null {
  const order = runtime.orders.find((item) => item.phase === '行程在途') ?? runtime.orders[0];
  if (!order) return null;
  const value = type === 'deviation' ? 12.6 : type === 'offline' ? 26 : 47;
  const detail = type === 'parking' ? `车辆在非计划中转仓停车 ${value} 分钟，当前轨迹连续。`
    : type === 'offline' ? `距最后一次有效定位已 ${value} 分钟，设备心跳未恢复。`
      : type === 'deviation' ? `车辆距计划线路 ${value} 公里，已排除短时定位漂移。`
        : type.startsWith('fence-') ? `车辆${type === 'fence-enter' ? '进入' : '离开'}“${runtime.fences.find((fence) => fence.id === fenceId)?.name ?? '自定义区域'}”。`
          : `${order.plate} 已识别${eventLabel(type)}节点，节点信息已写入运单。`;
  return { id: newId('event'), projectId: runtime.projectId, type, occurredAt: Date.now(), source, order: { ...order }, detail, value, fenceId };
}

function makeRun(task: DailyTask, runtime: ProjectTaskRuntime | undefined, source: TaskRun['source'], event?: WaybillEvent): TaskRun {
  if (task.taskTemplate === 'smart-order-entry') {
    const sourceNames = (task.sourceDataEmployeeIds ?? []).map((id) => dataEmployeeNames[id] ?? id);
    const targetName = dataEmployeeNames[task.targetDataEmployeeId ?? ''] ?? task.targetDataEmployeeId ?? '目标系统';
    return {
      id: newId('run'), startedAt: Date.now(), source, status: 'running', prompt: task.prompt,
      activeStep: 0, nextStepAt: Date.now() + stepDelay(), result: '',
      steps: [
        { title: '轮询来源系统', text: `通过数据员工连接 ${sourceNames.join('、')}，检查新增和变更订单。`, tool: '数据员工' },
        { title: '提取订单数据', text: '识别 18 条新增记录和 4 条变更记录，保留源系统单号与原始字段引用。', tool: '浏览器' },
        { title: '统一字段语义', text: '将各系统的订单号、车辆、承运商、装卸货地和计划时间映射为标准运单字段。', tool: '运单数据映射' },
        { title: '去重与冲突校验', text: '按源系统、订单号和业务时间去重，识别 2 条重复记录与 1 条地址冲突。', tool: '运单纠错' },
        { title: '录入目标系统', text: `将 19 条校验通过的运单写入 ${targetName}，失败记录进入待处理队列。`, tool: '数据员工' },
        { title: '核验录单回执', text: '读取目标系统回执，核对成功数、目标运单号和失败原因，形成本轮结果。' },
      ],
    };
  }
  const subject = event ? `${event.order.id} · ${event.order.plate}` : runtime ? `本项目 ${runtime.total} 条运单` : '个人定时任务';
  const context = event ? event.detail : runtime ? `已汇总本项目在途运单与 ${runtime.events.length} 条近期事件。` : '当前任务未绑定项目，不读取项目运单、事件或企业私有数据。';
  const channel = /短信/.test(task.prompt) ? '短信' : /邮件|邮箱/.test(task.prompt) ? '邮件' : null;
  const recipient = channel === '邮件' ? task.prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '项目物流负责人'
    : /负责人|调度/.test(task.prompt) ? '项目物流负责人 · 139****8000' : `${event?.order.driver ?? '项目值班司机'} · ${event?.order.phone ?? '138****6200'}`;
  const content = `【物流运营】${subject}。${context}${task.eventType === 'parking' ? '请确认停靠原因及预计恢复时间，注意运输安全。' : '请核实现场情况并及时反馈处理进度。'}`;
  return {
    id: newId('run'), startedAt: Date.now(), source, status: 'running', event, prompt: task.prompt,
    activeStep: 0, nextStepAt: Date.now() + stepDelay(), result: '',
    steps: [
      { title: '接收触发上下文', text: `${source === 'test' ? runtime ? '使用本项目样例事件测试' : '按当前个人任务配置测试执行' : source === 'schedule' ? '到达计划执行时间' : '收到运单事件'}：${subject}。` },
      { title: '理解指令并规划', text: `任务要求：${task.prompt}` },
      { title: runtime ? '读取运单与核验证据' : '读取可用上下文', text: context, tool: runtime ? event?.type === 'offline' ? '车辆定位查询' : event?.type.startsWith('fence-') ? '围栏事件查询、轨迹查询' : '运单查询、轨迹查询' : '个人知识库、通用工具' },
      { title: channel ? `生成${channel}内容` : '整理执行结果', text: channel ? `已取得通知对象：${recipient}，正在结合事件生成正文。` : `按指令整理${subject}的事件事实、影响范围和处置建议。`, tool: channel ? `${channel}草稿生成` : '经营分析参谋' },
      { title: '校验并提交结果', text: channel && task.confirmBeforeSend ? '核对通知对象与内容，提交待确认操作。' : '核对运单标识、事件时间与返回内容，记录执行结果。' },
    ],
    action: channel ? { channel, recipient, content, status: 'pending' } : undefined,
  };
}

export const useAgentDailyTasks = defineStore('agentDailyTasks', {
  state: () => ({
    projects: {} as Record<string, ProjectTaskRuntime>,
    tasks: [] as DailyTask[],
    now: Date.now(),
  }),
  getters: {
    unreadResultsByTask: (state): Record<string, number> => Object.fromEntries(state.tasks.map((task) => [task.id, task.runs.filter((run) => hasTaskResult(run) && run.readAt === undefined).length])),
    unreadResultsByProject(state): Record<string, number> {
      return state.tasks.reduce<Record<string, number>>((counts, task) => {
        counts[task.projectId] = (counts[task.projectId] ?? 0) + (this.unreadResultsByTask[task.id] ?? 0);
        return counts;
      }, {});
    },
  },
  actions: {
    markResultRead(taskId: string, runId: string) {
      const run = this.tasks.find((task) => task.id === taskId)?.runs.find((item) => item.id === runId);
      if (run && hasTaskResult(run) && run.readAt === undefined) run.readAt = Date.now();
    },
    syncProjects(projects: Project[], orders: Order[]) {
      for (const project of projects) {
        let runtime = this.projects[project.id];
        if (!runtime) {
          runtime = {
            projectId: project.id, connected: project.status === '已连接', total: project.total,
            skillIds: ensureRequiredMonitorSkills(project.skillIds), startedAt: Date.now(),
            monitors: monitorDefinitions.map((definition, index) => ({ id: definition.id, runs: 0, events: 0, lastRun: null, nextRun: Date.now() + (definition.seconds + index * 3) * 1000 })),
            fences: [], orders: project.total > 0 ? createMonitoredOrders(orders) : [], events: [], processedEventIds: [],
          };
          this.projects[project.id] = runtime;
          if (project.id === 'P001') this.seedTasks(runtime);
        }
        const resumed = !runtime.connected && project.status === '已连接';
        const previousSkills = runtime.skillIds;
        runtime.connected = project.status === '已连接';
        runtime.total = project.total;
        runtime.skillIds = ensureRequiredMonitorSkills(project.skillIds);
        if (runtime.orders.length === 0 && project.total > 0) runtime.orders = createMonitoredOrders(orders);
        for (const monitor of runtime.monitors) {
          const definition = monitorDefinitions.find((item) => item.id === monitor.id)!;
          if (resumed || !previousSkills.includes(definition.skillId)) monitor.nextRun = Date.now() + definition.seconds * 1000;
        }
      }
      const ids = new Set(projects.map((project) => project.id));
      for (const id of Object.keys(this.projects)) if (!ids.has(id)) delete this.projects[id];
      this.tasks = this.tasks.filter((task) => !task.projectId || ids.has(task.projectId));
    },
    seedTasks(runtime: ProjectTaskRuntime) {
      const base: DailyTaskDraft = { name: '', trigger: 'event', taskTemplate: 'general', eventType: 'parking', threshold: 30, fenceId: '', time: '18:00', intervalMinutes: 10, sourceDataEmployeeIds: [], targetDataEmployeeId: '', prompt: '', confirmBeforeSend: true };
      const presets: DailyTaskDraft[] = [
        { ...base, name: '异常停车通知司机', prompt: '当发生停车异常时，核验停车地点与轨迹，生成一条短信发送给司机，询问停靠原因和预计恢复时间。' },
        { ...base, name: '卸货完成同步', eventType: 'unloading-end', prompt: '核验卸货完成事件，整理运单履约结果和卸货时间，汇总给物流负责人。' },
        { ...base, name: '每日在途风险简报', trigger: 'schedule', prompt: '汇总今天的在途运单和异常事件，输出高风险清单、处置进展与明日重点。' },
      ];
      for (const [index, draft] of presets.entries()) {
        const task: DailyTask = { ...draft, id: newId('task'), projectId: runtime.projectId, enabled: true, createdAt: Date.now() - 2 * 86400000, lastScheduledDay: '', lastScheduledAt: 0, runs: [] };
        for (let day = 2; day >= 1; day--) {
          const event = task.trigger === 'event' ? sampleEvent(runtime, task.eventType, 'poll') ?? undefined : undefined;
          const run = makeRun(task, runtime, task.trigger === 'event' ? 'event' : 'schedule', event);
          run.startedAt = Date.now() - day * 86400000 - index * 3600000;
          if (task.trigger === 'schedule') {
            const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(run.startedAt);
            run.startedAt = new Date(`${date}T${task.time}:00+08:00`).getTime();
          }
          if (event) event.occurredAt = run.startedAt;
          run.finishedAt = run.startedAt + 11000;
          if (day === 2) run.readAt = run.finishedAt;
          run.activeStep = run.steps.length;
          run.status = index === 0 && day === 1 ? 'waiting' : 'complete';
          if (run.action) run.action.status = run.status === 'waiting' ? 'pending' : 'sent';
          run.result = run.action ? `${event?.order.plate}：已核验停车风险，通知草稿已生成。${run.status === 'complete' ? '短信已发送（演示回执）。' : '等待确认发送。'}`
            : index === 1 ? '已核验卸货结束事件，运单履约节点已汇总，无缺失时间字段。'
              : `已完成在途简报：本项目 ${runtime.total} 单，重点关注非计划停车，建议优先联系相关司机核实。`;
          task.runs.unshift(run);
        }
        this.tasks.push(task);
      }
    },
    unavailableReason(task: DailyTaskDraft & { projectId: string }) {
      if (!task.projectId) return task.trigger === 'event' ? '条件触发任务需要项目运单事件' : '';
      if (task.trigger === 'once') return !this.projects[task.projectId] ? '项目不存在' : '';
      const runtime = this.projects[task.projectId];
      if (!runtime) return '项目不存在';
      if (!runtime.connected) return '等待数据源连接';
      if (!runtime.orders.length) return '等待接入运单';
      if (task.trigger === 'schedule') return '';
      const monitor = monitorDefinitions.find((item) => item.id === eventDefinitions.find((event) => event.id === task.eventType)?.monitor);
      if (!monitor || !runtime.skillIds.includes(monitor.skillId)) return '对应判断技能未启用';
      if (task.eventType.startsWith('fence-') && !runtime.fences.some((fence) => fence.id === task.fenceId)) return '等待配置有效围栏';
      return '';
    },
    saveTask(projectId: string, draft: DailyTaskDraft, taskId?: string, source?: { origin: 'workbench'; conversationId?: string }) {
      if (projectId && !this.projects[projectId]) throw new Error('项目不存在');
      if (!projectId && draft.trigger === 'event') throw new Error('条件触发任务需要在项目中创建');
      if (!draft.prompt.trim() || (draft.trigger !== 'once' && !draft.name.trim())) throw new Error('请填写任务名称和执行指令');
      if (draft.name.trim().length > 40 || draft.prompt.trim().length > 2000) throw new Error('任务名称最多 40 字，执行指令最多 2000 字');
      const attachments = mergeTaskAttachments([], draft.attachments ?? []);
      if (draft.trigger === 'once' && resolveAsyncTool(draft.prompt) && !extractTaskPlates(draft.prompt).length && !attachments.length) throw new Error('请补充需要查询的车牌号，或上传包含车牌号的文件');
      if (draft.trigger === 'schedule' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) throw new Error('请选择有效执行时间');
      if (draft.taskTemplate === 'smart-order-entry') {
        if (!projectId || draft.trigger !== 'schedule') throw new Error('智能录单需要在项目中创建为定时 / 持续任务');
        if (draft.sourceDataEmployeeIds?.length !== 3) throw new Error('请选择 3 个数据员工系统作为数据源');
        if (!draft.targetDataEmployeeId) throw new Error('请选择 1 个录单目标系统');
        if (draft.sourceDataEmployeeIds.includes(draft.targetDataEmployeeId)) throw new Error('目标系统不能同时作为数据源');
        if (![5, 10, 30, 60].includes(draft.intervalMinutes ?? 0)) throw new Error('请选择有效检查频率');
      }
      if (draft.trigger === 'event' && isThresholdEvent(draft.eventType) && (!Number.isFinite(draft.threshold) || draft.threshold <= 0)) throw new Error('阈值必须大于 0');
      if (draft.trigger === 'event' && draft.eventType.startsWith('fence-') && !this.projects[projectId]!.fences.some((fence) => fence.id === draft.fenceId)) throw new Error('请选择一个有效围栏');
      const existing = this.tasks.find((task) => task.id === taskId && task.projectId === projectId);
      if (taskId && !existing) throw new Error('任务已删除');
      if (existing && (existing.trigger === 'once' || draft.trigger === 'once')) throw new Error('已提交的任务不能改为或编辑为普通任务，请新建任务');
      if (existing?.runs.some((run) => run.status === 'running')) throw new Error('请等待本轮执行结束后再编辑');
      if (existing) {
        Object.assign(existing, draft, { name: draft.name.trim(), prompt: draft.prompt.trim(), attachments, sourceDataEmployeeIds: [...(draft.sourceDataEmployeeIds ?? [])] });
        return existing.id;
      }
      const task: DailyTask = { ...draft, name: draft.name.trim() || ordinaryTaskName(draft.prompt), prompt: draft.prompt.trim(), attachments, sourceDataEmployeeIds: [...(draft.sourceDataEmployeeIds ?? [])], id: newId('task'), projectId, enabled: draft.trigger !== 'once', createdAt: Date.now(), lastScheduledDay: '', lastScheduledAt: 0, runs: [], origin: source?.origin ?? 'manual', conversationId: source?.conversationId };
      if (task.trigger === 'once') task.runs.push(makeOrdinaryRun(task));
      if (task.taskTemplate === 'smart-order-entry') {
        task.lastScheduledAt = Date.now();
        task.runs.push(makeRun(task, this.projects[projectId], 'schedule'));
      }
      this.tasks.unshift(task);
      return task.id;
    },
    deleteTask(taskId: string) {
      this.tasks = this.tasks.filter((task) => task.id !== taskId);
    },
    toggleTask(taskId: string) {
      const task = this.tasks.find((item) => item.id === taskId);
      if (task?.trigger === 'once') throw new Error('普通任务仅执行一次，不支持暂停或启动');
      if (task) task.enabled = !task.enabled;
    },
    receiveOrdinaryResult(taskId: string, jobId: string, result: { text: string; files: NonNullable<TaskRun['files']> }) {
      const task = this.tasks.find((item) => item.id === taskId);
      const run = task?.runs[0];
      if (task?.trigger !== 'once' || !run || run.status !== 'running' || run.toolJobId !== jobId) return;
      if (!result.text.trim() && !result.files.length) return;
      run.status = 'complete';
      run.activeStep = run.steps.length;
      run.finishedAt = this.now;
      run.result = result.text;
      run.files = result.files;
    },
    saveFence(projectId: string, fence: Omit<ProjectFence, 'id'>) {
      const runtime = this.projects[projectId];
      if (!runtime) throw new Error('项目不存在');
      if (!fence.name.trim()) throw new Error('请输入围栏名称');
      if (runtime.fences.some((item) => item.name === fence.name.trim())) throw new Error('围栏名称已存在');
      if (!Number.isFinite(fence.latitude) || Math.abs(fence.latitude) > 90 || !Number.isFinite(fence.longitude) || Math.abs(fence.longitude) > 180 || !Number.isFinite(fence.radius) || fence.radius < 100 || fence.radius > 50000) throw new Error('请检查经纬度与围栏半径（100–50000 米）');
      const saved = { ...fence, name: fence.name.trim(), id: newId('fence') };
      runtime.fences.push(saved);
      return saved;
    },
    deleteFence(projectId: string, fenceId: string) {
      const runtime = this.projects[projectId];
      if (runtime) runtime.fences = runtime.fences.filter((fence) => fence.id !== fenceId);
    },
    // Polling judgments and geofence callbacks share project-scoped event matching and deduplication.
    receiveEvent(event: WaybillEvent) {
      const runtime = this.projects[event.projectId];
      const monitorId = eventDefinitions.find((definition) => definition.id === event.type)?.monitor;
      const definition = monitorDefinitions.find((item) => item.id === monitorId);
      if (!runtime?.connected || !definition || !runtime.skillIds.includes(definition.skillId) || runtime.processedEventIds.includes(event.id)) return;
      if (event.type.startsWith('fence-') && !runtime.fences.some((fence) => fence.id === event.fenceId)) return;
      runtime.processedEventIds.push(event.id);
      runtime.events.unshift(event);
      runtime.events = runtime.events.slice(0, 100);
      const monitor = runtime.monitors.find((item) => item.id === monitorId)!;
      monitor.events++;
      if (event.source === 'callback') { monitor.runs++; monitor.lastRun = Date.now(); }
      for (const task of this.tasks) {
        if (task.projectId !== event.projectId || !task.enabled || task.trigger !== 'event' || task.eventType !== event.type) continue;
        if (isThresholdEvent(task.eventType) && event.value < task.threshold) continue;
        if (task.eventType.startsWith('fence-') && task.fenceId !== event.fenceId) continue;
        task.runs.unshift(makeRun(task, runtime, 'event', event));
      }
    },
    simulateFenceCallback(projectId: string, fenceId: string, type: 'fence-enter' | 'fence-exit') {
      const runtime = this.projects[projectId];
      if (!runtime) return;
      const event = sampleEvent(runtime, type, 'callback', fenceId);
      if (event) this.receiveEvent(event);
    },
    testTask(taskId: string) {
      const task = this.tasks.find((item) => item.id === taskId);
      if (!task) return;
      if (task.trigger === 'once') throw new Error('普通任务提交后只执行一次，不支持重复测试');
      const reason = this.unavailableReason(task);
      if (reason) throw new Error(reason);
      if (task.runs.some((run) => run.status === 'running')) throw new Error('本轮正在执行，请稍后再试');
      const runtime = this.projects[task.projectId];
      const event = task.trigger === 'event' ? sampleEvent(runtime!, task.eventType, 'test', task.fenceId) ?? undefined : undefined;
      if (event && isThresholdEvent(task.eventType)) {
        event.value = Math.max(event.value, task.threshold);
        event.detail = `${eventLabel(task.eventType)}已达到测试阈值：${event.value} ${task.eventType === 'deviation' ? '公里' : '分钟'}。`;
      }
      task.runs.unshift(makeRun(task, runtime, 'test', event));
    },
    resolveAction(taskId: string, runId: string, send: boolean) {
      const run = this.tasks.find((task) => task.id === taskId)?.runs.find((item) => item.id === runId);
      if (!run?.action || run.status !== 'waiting' || run.action.status !== 'pending') return;
      run.action.status = send ? 'sent' : 'cancelled';
      run.status = send ? 'complete' : 'cancelled';
      run.result += send ? `\n${run.action.channel}发送成功（演示回执），通知对象：${run.action.recipient}。` : '\n已取消本次通知，后续触发规则保持不变。';
    },
    runMonitor(runtime: ProjectTaskRuntime, monitorId: MonitorId) {
      const monitor = runtime.monitors.find((item) => item.id === monitorId)!;
      monitor.runs++;
      monitor.lastRun = this.now;
      if (monitorId === 'loading' || monitorId === 'unloading') {
        const transitions: Partial<Record<WaybillPhase, { phase: WaybillPhase; type?: EventType }>> = monitorId === 'loading'
          ? { 装货前: { phase: '装货开始', type: 'loading-start' }, 装货开始: { phase: '装货结束', type: 'loading-end' }, 装货结束: { phase: '行程在途' } }
          : { 行程在途: { phase: '卸货开始', type: 'unloading-start' }, 卸货开始: { phase: '卸货结束', type: 'unloading-end' } };
        for (const order of runtime.orders) {
          const transition = transitions[order.phase];
          if (!transition) continue;
          // Leave a transport window for the independent anomaly judgments before unloading.
          if (order.phase === '行程在途' && this.now - order.phaseChangedAt < 10 * 60000) continue;
          order.phase = transition.phase;
          order.phaseChangedAt = this.now;
          if (transition.type) this.receiveEvent({ id: newId('event'), projectId: runtime.projectId, type: transition.type, occurredAt: this.now, source: 'poll', order: { ...order }, detail: `${order.plate} 节点已核验，运单状态流转为“${transition.phase}”。`, value: 0 });
        }
      } else if (monitorId !== 'fence' && runtime.orders.some((order) => order.phase === '行程在途')) {
        const event = sampleEvent(runtime, monitorId, 'poll');
        if (event) this.receiveEvent(event);
      }
    },
    tick(now = Date.now()) {
      this.now = now;
      for (const runtime of Object.values(this.projects as Record<string, ProjectTaskRuntime>)) {
        if (!runtime.connected || !runtime.orders.length) continue;
        for (const monitor of runtime.monitors) {
          const definition = monitorDefinitions.find((item) => item.id === monitor.id)!;
          if (!definition.seconds || !runtime.skillIds.includes(definition.skillId) || now < monitor.nextRun) continue;
          this.runMonitor(runtime, definition.id);
          monitor.nextRun = now + definition.seconds * 1000;
        }
      }
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
      const value = (type: string) => parts.find((part) => part.type === type)!.value;
      const day = `${value('year')}-${value('month')}-${value('day')}`;
      const time = `${value('hour')}:${value('minute')}`;
      for (const task of this.tasks) {
        const runtime = this.projects[task.projectId];
        if (!runtime && task.trigger === 'event') continue;
        const intervalDue = task.taskTemplate === 'smart-order-entry' && now - (task.lastScheduledAt ?? 0) >= (task.intervalMinutes ?? 10) * 60000;
        const dailyDue = task.taskTemplate !== 'smart-order-entry' && task.time === time && task.lastScheduledDay !== day;
        if (task.enabled && task.trigger === 'schedule' && (intervalDue || dailyDue) && !this.unavailableReason(task) && !task.runs.some((run) => run.status === 'running')) {
          task.lastScheduledDay = day;
          task.lastScheduledAt = now;
          task.runs.unshift(makeRun(task, runtime, 'schedule'));
        }
        for (const run of task.runs) {
          if (run.status !== 'running' || now < run.nextStepAt) continue;
          run.activeStep++;
          run.nextStepAt = now + (task.trigger === 'once' ? ordinaryStepDelay() : stepDelay());
          if (run.activeStep < run.steps.length) continue;
          if (task.trigger === 'once') {
            this.receiveOrdinaryResult(task.id, run.toolJobId!, ordinaryTaskResult(task, run));
            continue;
          }
          run.finishedAt = now;
          if (run.action) {
            run.status = task.confirmBeforeSend ? 'waiting' : 'complete';
            run.action.status = task.confirmBeforeSend ? 'pending' : 'sent';
            run.result = `${run.event?.order.id ?? '项目运单'}：已完成事件核验与${run.action.channel}内容生成。${task.confirmBeforeSend ? '等待确认发送。' : '发送成功（演示回执）。'}`;
          } else {
            run.status = 'complete';
            if (task.taskTemplate === 'smart-order-entry') {
              const sourceNames = (task.sourceDataEmployeeIds ?? []).map((id) => dataEmployeeNames[id] ?? id).join('、');
              const targetName = dataEmployeeNames[task.targetDataEmployeeId ?? ''] ?? task.targetDataEmployeeId ?? '目标系统';
              run.result = `本轮智能录单已完成。\n数据源：${sourceNames}\n目标系统：${targetName}\n发现 22 条记录：新增 18 条、变更 4 条。\n录入成功 19 条；重复跳过 2 条；地址冲突 1 条进入待处理队列。\n目标系统回执已核验，未发生重复录单。`;
            } else {
              const summary = run.event ? `${run.event.order.id} · ${run.event.order.plate}\n${run.event.detail}` : runtime ? `本项目 ${runtime.total} 条运单已完成汇总，近期产生 ${runtime.events.length} 条运单事件。` : '个人定时任务已按计划执行，本次未读取任何项目运单或条件事件数据。';
              run.result = `${summary}\n已按指令“${run.prompt}”完成处理。${run.event?.type === 'unloading-end' ? '卸货结束节点已归档。' : runtime ? '建议优先复核未闭环异常，并持续关注在途状态变化。' : '结果已写入本任务，可继续在会话中处理。'}`;
            }
          }
        }
      }
    },
  },
});
