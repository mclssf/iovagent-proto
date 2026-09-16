import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const originalNow = Date.now;
let now = Date.parse('2026-09-08T10:00:00+08:00');
Date.now = () => now;

try {
  const { useAgentDailyTasks } = await server.ssrLoadModule('/src/pinia/agentDailyTasks.ts');
  const { monitorDefinitions, waybillPhases } = await server.ssrLoadModule('/src/views/AgentWork/dailyTasks.ts');
  setActivePinia(createPinia());
  const store = useAgentDailyTasks();
  const projects = ['P001', 'P003'].map(id => ({ id, status: '已连接', total: 6, skillIds: monitorDefinitions.map(item => item.skillId) }));
  const orders = waybillPhases.map((_, index) => ({ id: `WB${index}`, plate: `沪A1000${index}`, driver: `司机${index}`, route: '上海 → 杭州' }));
  store.syncProjects(projects, orders);
  store.tasks = [];
  const runtime = store.projects.P001;
  assert(runtime.skillIds.includes('loading-event-expert') && runtime.skillIds.includes('unloading-event-expert'));
  const draft = { name: '停车通知', trigger: 'event', eventType: 'parking', threshold: 30, fenceId: '', time: '18:00', prompt: '核验停车事件并生成短信发送给司机', confirmBeforeSend: true };
  assert.throws(() => store.saveTask('P001', { ...draft, prompt: ' ' }), /指令/);
  assert.throws(() => store.saveTask('P001', { ...draft, threshold: 0 }), /阈值/);
  const id = store.saveTask('P001', draft);
  const task = store.tasks.find(item => item.id === id);
  const event = { id: 'event-1', projectId: 'P001', type: 'parking', source: 'poll', occurredAt: now, order: { ...runtime.orders[3] }, detail: '非计划地点停车 47 分钟', value: 47 };
  store.receiveEvent(event);
  store.receiveEvent(event);
  assert.equal(task.runs.length, 1, 'same event is processed once');
  store.receiveEvent({ ...event, id: 'below-threshold', value: 20 });
  store.receiveEvent({ ...event, id: 'other-project', projectId: 'P003' });
  assert.equal(task.runs.length, 1, 'threshold and project scope are enforced');
  store.toggleTask(id);
  store.receiveEvent({ ...event, id: 'paused-event' });
  assert.equal(task.runs.length, 1, 'paused task ignores new events');
  assert.throws(() => store.saveTask('P001', { ...draft, name: '修改' }, id), /执行结束/);
  for (let i = 0; i < 5; i++) { now += 3000; store.tick(now); }
  assert.equal(task.runs[0].status, 'waiting', 'in-flight task finishes even when paused');
  store.resolveAction(id, task.runs[0].id, true);
  const receipt = task.runs[0].result;
  store.resolveAction(id, task.runs[0].id, true);
  assert.equal(task.runs[0].result, receipt, 'confirmation is idempotent');
  assert.equal(task.runs[0].status, 'complete');
  assert(receipt.includes('演示回执'));
  store.saveTask('P001', { ...draft, name: '停车短信确认' }, id);
  assert.equal(task.name, '停车短信确认');
  const phases = runtime.orders.map(order => order.phase);
  store.testTask(id);
  assert.throws(() => store.testTask(id), /正在执行/);
  assert.deepEqual(runtime.orders.map(order => order.phase), phases, 'test does not advance waybill lifecycle');
  for (let i = 0; i < 5; i++) { now += 3000; store.tick(now); }
  store.resolveAction(id, task.runs[0].id, false);
  assert.equal(task.runs[0].status, 'cancelled');

  const fence = store.saveFence('P001', { name: '嘉定装货区', latitude: 31.2857, longitude: 121.1668, radius: 1500 });
  const fenceTaskId = store.saveTask('P001', { ...draft, name: '围栏通知', eventType: 'fence-enter', fenceId: fence.id });
  const fenceTask = store.tasks.find(item => item.id === fenceTaskId);
  store.simulateFenceCallback('P001', fence.id, 'fence-exit');
  assert.equal(fenceTask.runs.length, 0);
  store.simulateFenceCallback('P001', fence.id, 'fence-enter');
  assert.equal(fenceTask.runs.length, 1);
  assert.equal(fenceTask.runs[0].event.source, 'callback');
  store.deleteFence('P001', fence.id);
  assert.equal(store.unavailableReason(fenceTask), '等待配置有效围栏');

  const scheduleId = store.saveTask('P001', { ...draft, name: '定时报告', trigger: 'schedule', prompt: '汇总今日在途风险' });
  const scheduled = store.tasks.find(item => item.id === scheduleId);
  now = Date.parse('2026-09-08T18:00:00+08:00');
  store.tick(now);
  store.tick(now + 1000);
  assert.equal(scheduled.runs.length, 1, 'schedule fires once per Beijing calendar day');
  store.toggleTask(scheduleId);
  now += 86400000;
  store.tick(now);
  assert.equal(scheduled.runs.length, 1, 'paused schedule does not fire');
  store.toggleTask(scheduleId);
  now += 86400000;
  store.tick(now);
  assert.equal(scheduled.runs.length, 2);

  runtime.orders = [{ ...orders[0], phone: '138****0000', phase: '装货前', phaseChangedAt: now }];
  const actualPhases = [runtime.orders[0].phase];
  for (let i = 0; i < 3; i++) { now += 60000; store.now = now; store.runMonitor(runtime, 'loading'); actualPhases.push(runtime.orders[0].phase); }
  store.runMonitor(runtime, 'unloading');
  assert.equal(runtime.orders[0].phase, '行程在途', 'unloading respects transit dwell');
  const before = runtime.events.length;
  store.runMonitor(runtime, 'parking');
  store.runMonitor(runtime, 'offline');
  store.runMonitor(runtime, 'deviation');
  assert.equal(runtime.events.length, before + 3, 'independent anomaly jobs can emit during transit');
  now += 10 * 60000;
  store.now = now;
  store.runMonitor(runtime, 'unloading');
  actualPhases.push(runtime.orders[0].phase);
  now += 60000;
  store.now = now;
  store.runMonitor(runtime, 'unloading');
  actualPhases.push(runtime.orders[0].phase);
  assert.deepEqual(actualPhases, waybillPhases);
  projects[0].status = '授权失效';
  store.syncProjects(projects, orders);
  assert.throws(() => store.testTask(id), /数据源连接/);
  store.deleteTask(id);
  assert(!store.tasks.some(item => item.id === id));
  store.syncProjects([projects[1]], orders);
  assert(!store.projects.P001 && store.tasks.every(item => item.projectId !== 'P001'));
  console.log('PASS: mandatory skills, validation, matching, deduplication, project isolation, pause/resume, test runs, confirmations, geofence callbacks, scheduling, lifecycle and cleanup');
} finally {
  Date.now = originalNow;
  await server.close();
}
