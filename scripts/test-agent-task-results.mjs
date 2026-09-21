import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { useAgentDailyTasks } = await server.ssrLoadModule('/src/pinia/agentDailyTasks.ts');
  const { getTaskStatus, hasTaskResult, taskStatusLabels } = await server.ssrLoadModule('/src/views/AgentWork/dailyTasks.ts');
  setActivePinia(createPinia());
  const store = useAgentDailyTasks();
  store.syncProjects(['P001', 'P002'].map(id => ({ id, status: '已连接', total: 6, skillIds: ['parking-event-expert'] })), [{ id: 'WB001', plate: '沪A12345', driver: '司机', route: '上海 → 杭州' }]);
  assert.deepEqual(Object.values(taskStatusLabels), ['已完成', '执行中', '已暂停']);
  assert.equal(store.unreadResultsByProject.P001, 3, 'one unread latest result per seeded task');
  const eventTask = store.tasks[0];
  const scheduleTask = store.tasks[2];
  for (const task of store.tasks) assert.equal(getTaskStatus(task), 'running', 'completed runs and pending actions do not complete continuous tasks');
  store.toggleTask(scheduleTask.id);
  assert.equal(getTaskStatus(scheduleTask), 'paused');
  store.toggleTask(scheduleTask.id);
  assert.equal(getTaskStatus(scheduleTask), 'running');
  store.markResultRead(eventTask.id, 'missing-run');
  assert.equal(store.unreadResultsByTask[eventTask.id], 1);
  const latest = eventTask.runs[0];
  store.markResultRead(eventTask.id, latest.id);
  const readAt = latest.readAt;
  store.markResultRead(eventTask.id, latest.id);
  assert.equal(latest.readAt, readAt, 'reading is idempotent');
  assert.equal(store.unreadResultsByTask[eventTask.id], 0);
  assert.equal(store.unreadResultsByProject.P001, 2);
  store.resolveAction(eventTask.id, latest.id, true);
  assert.equal(store.unreadResultsByTask[eventTask.id], 0, 'confirming an existing result does not create another unread record');
  assert.equal(getTaskStatus(eventTask), 'running');

  store.testTask(eventTask.id);
  const inFlight = eventTask.runs[0];
  assert(!hasTaskResult(inFlight));
  store.markResultRead(eventTask.id, inFlight.id);
  assert.equal(inFlight.readAt, undefined, 'progress is not a readable result');
  let now = Date.now();
  for (let step = 0; step < 5; step++) { now += 3000; store.tick(now); }
  assert.equal(store.unreadResultsByTask[eventTask.id], 1, 'new output becomes unread');
  assert.equal(store.unreadResultsByProject.P001, 3);
  store.resolveAction(eventTask.id, inFlight.id, false);
  assert.equal(getTaskStatus(eventTask), 'running', 'cancelling a notification is not a task status');
  assert.equal(store.unreadResultsByTask[eventTask.id], 1);

  const draft = { name: '普通结果测试', trigger: 'once', eventType: 'parking', threshold: 30, fenceId: '', time: '18:00', prompt: '整理物流风险核验要点', confirmBeforeSend: false };
  const id = store.saveTask('P002', draft);
  const once = store.tasks.find(task => task.id === id);
  const run = once.runs[0];
  assert.equal(getTaskStatus(once), 'running');
  assert.equal(store.unreadResultsByProject.P002, 0);
  store.receiveOrdinaryResult(id, run.toolJobId, { text: ' ', files: [] });
  assert.equal(run.status, 'running', 'empty callbacks are not completion');
  store.receiveOrdinaryResult(id, run.toolJobId, { text: '', files: [{ name: 'result.txt', mimeType: 'text/plain', content: '结果' }] });
  assert.equal(getTaskStatus(once), 'complete', 'file-only output is a result');
  assert.equal(store.unreadResultsByProject.P002, 1);
  assert.equal(store.unreadResultsByProject.P001, 3, 'unread counts are project scoped');
  store.markResultRead(id, run.id);
  store.receiveOrdinaryResult(id, run.toolJobId, { text: 'duplicate', files: [] });
  assert.equal(store.unreadResultsByProject.P002, 0, 'duplicate callbacks do not reset read state');
  const personalId = store.saveTask('', draft);
  const personalRun = store.tasks.find(task => task.id === personalId).runs[0];
  store.receiveOrdinaryResult(personalId, personalRun.toolJobId, { text: '个人结果', files: [] });
  assert.equal(store.unreadResultsByProject[''], 1);
  assert.equal(store.unreadResultsByProject.P001, 3);
  store.deleteTask(eventTask.id);
  assert.equal(store.unreadResultsByProject.P001, 2, 'deleting a task removes its unread records');
  assert.equal(store.unreadResultsByTask[eventTask.id], undefined);
  store.syncProjects([], []);
  assert.equal(store.unreadResultsByProject.P001, undefined);
  assert.equal(store.unreadResultsByProject[''], 1, 'personal results survive project removal');
  console.log('PASS: unified three-state lifecycle, output-only results, per-record read state, idempotent callbacks, project-scoped unread totals, confirmation, deletion and cleanup.');
} finally {
  await server.close();
}
