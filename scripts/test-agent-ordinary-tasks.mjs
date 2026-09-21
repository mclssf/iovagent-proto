import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const originalNow = Date.now;
let now = Date.parse('2026-09-17T10:00:00+08:00');
Date.now = () => now;
try {
  const { useAgentDailyTasks } = await server.ssrLoadModule('/src/pinia/agentDailyTasks.ts');
  const { resolveAsyncTool, extractTaskPlates, mergeTaskAttachments } = await server.ssrLoadModule('/src/views/AgentWork/ordinaryTasks.ts');
  assert.equal(resolveAsyncTool('查询沪A12345在180天之前的轨迹').execution, 'async');
  assert.equal(resolveAsyncTool('调取鲁B12345半年前的行驶路线').id, 'vehicle.track.archive');
  assert(resolveAsyncTool('导出沪A12345在2026年1月5日的轨迹'));
  for (const prompt of ['查询沪A12345当前位置', '查询运单WB123运输情况', '查询昨天的轨迹', '查询179天前的轨迹', '查询2026-02-31的轨迹', '查询半年内的轨迹', '180天前的经营分析报告']) assert.equal(resolveAsyncTool(prompt), null, prompt);
  assert.deepEqual(extractTaskPlates('查询沪a12345、鲁B12345，沪A12345的轨迹'), ['沪A12345', '鲁B12345']);
  const attachment = { name: '车辆.csv', size: 18, type: 'text/csv', lastModified: 1 };
  assert.equal(mergeTaskAttachments([attachment], [attachment]).length, 1);
  assert.throws(() => mergeTaskAttachments([], [{ ...attachment, size: 0 }]), /空文件/);
  assert.throws(() => mergeTaskAttachments([], [{ ...attachment, size: 21 * 1024 * 1024 }]), /20 MB/);
  assert.throws(() => mergeTaskAttachments([], Array.from({ length: 11 }, (_, index) => ({ ...attachment, name: `${index}.csv` }))), /10/);

  setActivePinia(createPinia());
  const store = useAgentDailyTasks();
  store.syncProjects([{ id: 'P003', status: '授权失效', total: 0, skillIds: [] }], []);
  const draft = { name: '', trigger: 'once', eventType: 'parking', threshold: 30, fenceId: '', time: '18:00', prompt: '查询沪A12345在180天之前的轨迹', confirmBeforeSend: true };
  assert.throws(() => store.saveTask('', { ...draft, prompt: '' }), /指令/);
  assert.throws(() => store.saveTask('', { ...draft, prompt: '查询180天前的轨迹' }), /车牌/);
  const id = store.saveTask('P003', draft);
  const task = store.tasks.find(item => item.id === id);
  assert.equal(task.runs.length, 1);
  assert.equal(task.name, '沪A12345历史轨迹查询');
  assert.equal(store.unavailableReason(task), '', 'uploaded/prompt task does not depend on connected project waybills');
  assert.throws(() => store.testTask(id), /不支持重复测试/);
  assert.throws(() => store.toggleTask(id), /不支持暂停或启动/);
  assert.throws(() => store.saveTask('P003', draft, id), /普通任务/);
  const run = task.runs[0];
  store.receiveOrdinaryResult(id, 'wrong-job', { text: '错误结果', files: [] });
  assert.equal(run.status, 'running');
  for (let i = 0; i < 5; i++) { now += 6100; store.tick(now); }
  assert.equal(run.status, 'complete');
  assert(run.result.includes('沪A12345') && run.result.includes('37 个轨迹点'));
  assert.equal(run.files.length, 1);
  assert.equal(run.files[0].content.trim().split('\r\n').length, 38);
  assert(run.files[0].content.includes('2026-03-21'));
  const result = run.result;
  store.receiveOrdinaryResult(id, run.toolJobId, { text: '重复回调', files: [] });
  assert.equal(run.result, result, 'duplicate completion is ignored');
  now += 86400000;
  store.tick(now);
  assert.equal(task.runs.length, 1, 'ordinary tasks never reschedule');

  const personalId = store.saveTask('', { ...draft, prompt: '根据附件整理报告', attachments: [attachment] }, undefined, { origin: 'workbench', conversationId: 'C001' });
  const personal = store.tasks.find(item => item.id === personalId);
  assert.equal(personal.projectId, '');
  assert.equal(personal.origin, 'workbench');
  assert.equal(personal.conversationId, 'C001');
  attachment.name = '修改后的名称.csv';
  assert.equal(personal.attachments[0].name, '车辆.csv', 'attachments are snapshotted');
  store.syncProjects([], []);
  assert(store.tasks.some(item => item.id === personalId), 'personal tasks survive project changes');
  assert(!store.tasks.some(item => item.id === id), 'deleted projects remove their own tasks');
  store.deleteTask(personalId);
  store.receiveOrdinaryResult(personalId, personal.runs[0].toolJobId, { text: '迟到回调', files: [] });
  now += 10000;
  store.tick(now);
  assert.equal(personal.runs[0].files, undefined);
  store.receiveOrdinaryResult(personalId, personal.runs[0].toolJobId, { text: '已删任务回调', files: [] });
  assert.equal(store.tasks.length, 0);
  const genericId = store.saveTask('', { ...draft, prompt: '整理一份物流风险核验要点' });
  for (let i = 0; i < 5; i++) { now += 6100; store.tick(now); }
  assert.equal(store.tasks.find(item => item.id === genericId).runs[0].status, 'complete');
  console.log('PASS: async tool routing, date/plate preservation, validation, attachment snapshots, one-shot lifecycle, scoped execution, idempotent callbacks, deletion stops execution, downloadable CSV and text-only results.');
} finally {
  Date.now = originalNow;
  await server.close();
}
