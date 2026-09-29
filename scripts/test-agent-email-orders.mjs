import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const originalNow = Date.now;
let now = Date.parse('2026-09-29T10:00:00+08:00');
Date.now = () => now;

try {
  const { useAgentDailyTasks } = await server.ssrLoadModule('/src/pinia/agentDailyTasks.ts');
  const { hasTaskResult, getTaskStatus, triggerLabel } = await server.ssrLoadModule('/src/views/AgentWork/dailyTasks.ts');
  const { createEmailOrder } = await server.ssrLoadModule('/src/views/AgentWork/emailOrderDemo.ts');
  setActivePinia(createPinia());
  const store = useAgentDailyTasks();
  const projects = ['P001', 'P002'].map(id => ({ id, status: '未连接', total: 0, skillIds: [] }));
  store.syncProjects(projects, []);
  store.syncProjects(projects, []);
  const mailTasks = store.tasks.filter(task => task.taskTemplate === 'email-order');
  assert.equal(mailTasks.length, 1, 'the fixed project demo is seeded once');
  const task = mailTasks[0];
  assert.equal(task.projectId, 'P001');
  assert.equal(task.mailbox.status, 'bound');
  assert.equal(task.runs.length, 3);
  assert(task.runs.every(run => hasTaskResult(run) && run.emailOrder.reply.sentAt && !run.action));
  assert.equal(store.unreadResultsByTask[task.id], 0, 'sample history starts read');
  assert.match(triggerLabel(task), /持续监听邮箱/);
  assert.equal(store.unavailableReason(task), '', 'mail processing does not require TMS orders');

  const arrival = createEmailOrder('arrival', now, 1);
  assert.equal(arrival.order.loadingTime, undefined);
  assert.equal(arrival.dispatch.count, 2);
  assert.equal(arrival.dispatch.totalWeight, 24);
  assert.equal(arrival.dispatch.totalVolume, 80);
  assert.equal(arrival.timing.loadingStart, Date.parse('2026-09-30T07:00:00+08:00'));
  assert.equal(arrival.timing.latestLoadingAt, Date.parse('2026-09-30T08:00:00+08:00'));
  assert.equal(arrival.timing.arrivalEnd, Date.parse('2026-09-30T20:00:00+08:00'));
  assert.match(arrival.reply.body, /最晚请于/);
  const loading = createEmailOrder('loading', now, 2);
  assert.equal(loading.order.number, undefined, 'missing customer order numbers are not synthesized');
  assert.equal(loading.order.arrivalRequirement, undefined);
  assert.equal(loading.timing.arrivalStart, Date.parse('2026-09-30T15:00:00+08:00'));
  assert.equal(loading.timing.arrivalEnd, Date.parse('2026-09-30T16:00:00+08:00'));
  assert.equal(loading.dispatch.count, 1);
  const both = createEmailOrder('both', now, 3);
  assert.equal(both.dispatch.totalWeight, 10);
  assert.equal(both.dispatch.totalVolume, 40);
  assert(both.reply.body.includes(both.order.loadingTime));
  assert(both.reply.body.includes(both.order.arrivalRequirement));
  assert.match(both.reply.body, /车牌号、司机姓名、联系电话及预计到场时间/);
  const flexible = createEmailOrder('flexible', now, 4);
  assert.equal(flexible.timing.loadingSource, '预计安排');
  assert.equal(flexible.timing.arrivalSource, '预计安排');
  const lateNight = createEmailOrder('loading', Date.parse('2026-09-30T00:15:00+08:00'), 5);
  assert.equal(lateNight.timing.loadingStart, Date.parse('2026-10-01T09:00:00+08:00'), 'relative dates follow the mailbox timezone');

  for (const scenario of ['both', 'arrival', 'loading', 'flexible']) {
    const before = task.runs.length;
    store.receiveDemoEmail(task.id, scenario);
    const run = task.runs[0];
    assert.equal(task.runs.length, before + 1);
    assert.equal(hasTaskResult(run), false, 'progress is not a reply result');
    assert.equal(run.emailOrder.reply.sentAt, undefined);
    assert.equal(run.source, 'email');
    assert.throws(() => store.receiveDemoEmail(task.id, scenario), /正在处理/);
    store.toggleTask(task.id);
    for (let step = 0; step < run.steps.length; step++) { now += 2000; store.tick(now); }
    assert.equal(run.status, 'complete', 'in-flight mail finishes after pausing');
    assert.equal(run.emailOrder.reply.sentAt, now);
    assert(hasTaskResult(run));
    assert.equal(store.unreadResultsByTask[task.id], 1);
    assert.equal(task.runs.length, before + 1, 'one incoming mail and reply produces exactly one result');
    assert.equal(getTaskStatus(task), 'paused');
    assert.equal(task.mailbox.status, 'bound', 'pausing keeps the mailbox bound');
    assert.throws(() => store.receiveDemoEmail(task.id, scenario), /先启动/);
    store.markResultRead(task.id, run.id);
    assert.equal(store.unreadResultsByTask[task.id], 0);
    store.toggleTask(task.id);
    assert.equal(getTaskStatus(task), 'running');
  }
  assert.equal(store.unreadResultsByProject.P002, undefined, 'mail results stay in their project');
  assert(!store.tasks.some(item => !item.projectId && item.taskTemplate === 'email-order'), 'personal tasks do not inherit project mail');
  store.deleteTask(task.id);
  assert(store.tasks.some(item => item.id === task.id), 'the fixed demo cannot be deleted');
  store.syncProjects([projects[1]], []);
  assert(!store.tasks.some(item => item.id === task.id), 'removing its project removes the demo');
  console.log('PASS: mailbox binding, scoped seed, four time cases, timezone rollover, cargo totals, vehicle counts, mail pipeline, pause/resume and per-reply results.');
} finally {
  Date.now = originalNow;
  await server.close();
}
