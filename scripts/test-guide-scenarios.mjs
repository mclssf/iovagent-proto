import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { read, utils } from 'xlsx';
import { unzipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({ configFile: false, root, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@': root + 'src' } }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const load = path => vite.ssrLoadModule('/src/views/AgentWork/' + path + '.ts');
  const { guideSkills, guideTrips, guideSubjects, lookupGuide, inspectTrip } = await load('guideScenarios');
  const { guideExchange } = await load('guideExchange');
  const { ordinaryTaskResult, readTaskAttachments, resultFileBytes, visibleTaskFiles, excelResult } = await load('ordinaryTasks');
  const { createWaybillEvidenceResult } = await load('waybillEvidenceResult');
  const { useAgentDailyTasks } = await vite.ssrLoadModule('/src/pinia/agentDailyTasks.ts');
  setActivePinia(createPinia());
  const tasks = useAgentDailyTasks();
  const excel = new File([await readFile(root + 'public/demo/east-dispatch-input.xlsx')], '输入.xlsx');
  const attachments = await readTaskAttachments([excel]);
  assert.equal(attachments[0].rowCount, 4);
  assert.equal(guideSkills.length, 8);
  assert(!guideSkills.some(s => s.id === 'guide-transit'));
  assert.equal(lookupGuide({ 运单号: 'YD261002', 车牌号: '沪A56101' }).length, 0);
  for (const s of guideSkills) {
    const skill = { id: s.id, name: s.name, customerId: 'ent-east', agentId: 'general-chat-agent' };
    const input = { skill, text: s.recommendedPrompt, current: () => true, projectId: '', files: [], attachments: [] };
    assert(guideSubjects(input.text).length);
    const single = await guideExchange(input);
    assert(s.id === 'guide-photo' ? single.guideContext.waiting : single.result?.includes(' · '), s.id);
    if (s.id === 'guide-photo') {
      const malicious = [{ ...attachments[0], records: [{ 运单号: 'YD261001', 图片检查: '已签收' }] }];
      assert((await guideExchange({ ...input, files: [excel], attachments: malicious })).guideContext.waiting);
      continue;
    }
    const batch = await guideExchange({ ...input, files: [excel], attachments });
    const task = tasks.tasks.find(t => t.id === batch.dailyTaskId);
    assert.equal(task.guideSkillId, s.id);
    if (s.id === 'guide-evidence') {
      // An unavailable SDK is not evidence; do not archive a placeholder JPEG.
      const output = await createWaybillEvidenceResult(task, task.runs[0], new AbortController().signal, () => {}, async () => {throw new Error('地图不可用');}, rows => excelResult('结果.xlsx', rows.map(r => r.values)));
      assert.equal(output.progress.failed, 4);
      const entries = unzipSync(resultFileBytes(output.files[0]));
      assert.equal(Object.keys(entries).filter(k => k.endsWith('.jpg')).length, 0);
      assert(Object.keys(entries).some(k => k.endsWith('.xlsx')));
    } else {
      const output = ordinaryTaskResult(task, task.runs[0]);
      assert.equal(visibleTaskFiles(output.files)[0].standalone, true);
      const book = read(resultFileBytes(output.files[0]), { type: 'array' });
      const rows = utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
      assert.equal(rows.length, 6);
      assert.equal(rows.filter(r => r.执行状态 === '失败').length, 1);
      assert.equal(rows.at(-1).运单号, 'YD269999');
      assert(rows[0].业务结论 && rows[0].依据 && rows[0].建议);
    }
  }
  assert(inspectTrip('guide-gate', guideTrips[1], {}, '是否到过苏州市').conclusion.includes('有苏州市'));
  assert(inspectTrip('guide-gate', guideTrips[1], {}, '是否到过山东省').conclusion.includes('未查到'));
  console.log('PASS: eight scenario prompts, order/plate validation, Excel expansion, partial failures, regional evidence, task files and evidence ZIP failure handling.');
} finally { await vite.close(); }
