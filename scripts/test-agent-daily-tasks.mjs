import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { useAgentDailyTasks } = await server.ssrLoadModule('/src/pinia/agentDailyTasks.ts');
  const { monitorDefinitions } = await server.ssrLoadModule('/src/views/AgentWork/dailyTasks.ts');
  setActivePinia(createPinia()); const store = useAgentDailyTasks();
  store.syncProjects([{ id: 'P1', status: '已连接', total: 1, skillIds: monitorDefinitions.map(item => item.skillId) }], [{ id: 'WB1', plate: '沪A12345', driver: '司机', route: '上海 → 杭州' }]);
  const runtime = store.projects.P1;
  assert(runtime.skillIds.includes('loading-event-expert') && runtime.skillIds.includes('unloading-event-expert'));
  for (const expected of ['装货开始', '装货结束', '行程在途']) { store.runMonitor(runtime, 'loading'); assert.equal(runtime.orders[0].phase, expected); }
  const event = { id: 'E1', projectId: 'P1', type: 'parking', occurredAt: Date.now(), source: 'poll', order: { ...runtime.orders[0] }, detail: '非计划停车', value: 47 };
  store.receiveEvent(event); store.receiveEvent(event);
  assert.equal(runtime.events.filter(item => item.id === 'E1').length, 1);
  assert.equal(store.tasks.length, 0, 'waybill events no longer create conditional tasks');
  store.now += 600000; store.runMonitor(runtime, 'unloading'); assert.equal(runtime.orders[0].phase, '卸货开始');
  store.runMonitor(runtime, 'unloading'); assert.equal(runtime.orders[0].phase, '卸货结束');
  assert.throws(() => store.saveTask('P1', { name: '事件任务', prompt: '发送短信', trigger: 'event' }), /仅支持/);
  console.log('PASS: project waybill state monitors remain independent; events deduplicate without creating task triggers.');
} finally { await server.close(); }
