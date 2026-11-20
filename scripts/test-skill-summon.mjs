import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': root + 'src' } },
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const data = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
  } });
  const { agentWorkData } = await server.ssrLoadModule('/src/pinia/agentWork.ts');
  const { useAgentOpsStore } = await server.ssrLoadModule('/src/pinia/agentOps.ts');
  const { useSkillComposer, unavailableNotice } = await server.ssrLoadModule('/src/pinia/skillComposer.ts');
  setActivePinia(createPinia());
  const ops = useAgentOpsStore(), work = agentWorkData(), c = useSkillComposer();
  const agent = 'general-chat-agent', sheet = 'operations-logistics-sheet', license = 'operations-license-recognition';
  work.startNewConversation();
  c.bind(sheet);
  const key = c.key, rev = c.draft.revision, submitted = c.validate(sheet);
  assert.equal(work.recentConversations.length, 0);
  c.edit('下一份输入'); // typing while the submitted file snapshot is being read
  await work.appendAgentExchange('整理这份委托', () => {}, [], [], { summonedSkill: submitted, files: [], accepted: () => c.accepted(key, rev) });
  const first = work.currentConversationId;
  assert.equal(c.draft.text, '下一份输入');
  assert.equal(work.agentMessages[0].summonedSkill.id, sheet);
  c.attach([new File(['test'], '货单.txt')]);
  work.startNewConversation('data-employee-agent');
  assert.equal(c.draft.text, '');
  assert.throws(() => c.bind(sheet));
  c.bind('spreadsheet-waybill'); assert.equal(c.draft.template, '');
  work.openConversation(first);
  assert.equal(c.draft.text, '下一份输入'); assert.equal(c.draft.files[0].name, '货单.txt');
  ops.skills.find(s => s.id === license).recommendedPrompt = '';
  c.bind(license); assert.equal(c.draft.text, '下一份输入');
  c.cancel(); c.edit(''); c.bind(sheet); c.bind(license);
  assert.equal(c.draft.text, '', 'a missing template clears only previous automatic text');
  c.cancel(); c.edit('自己填写'); c.bind(sheet);

  const other = 'ent-jinyu';
  ops.saveCustomerAgents(other, [{ agentId: agent, mode: 'custom', skillIds: [], toolIds: [] }]);
  assert.equal(ops.summonSkills(other, agent).length, 0);
  assert(c.validate(sheet));
  c.customerId = other;
  assert.equal(c.draft.text, ''); assert.throws(() => c.bind(sheet));
  c.customerId = 'ent-east'; assert.equal(c.draft.text, '自己填写');
  const beforeMessages = work.agentMessages.length;
  const storageKey = 'iovagent-agent-loading-v1:customer:ent-east';
  data.set(storageKey, '{');
  assert.throws(() => c.validate(sheet)); assert.equal(c.draft.skillId, sheet);
  assert.equal(c.draft.text, '自己填写'); assert.equal(c.draft.files.length, 1);
  data.set(storageKey, JSON.stringify([{ agentId: agent, mode: 'custom', skillIds: [], toolIds: [] }]));
  assert.throws(() => c.validate(sheet), /该技能已不可用/);
  assert.equal(c.draft.notice, unavailableNotice);
  assert.equal(c.draft.skillId, ''); assert.equal(work.agentMessages.length, beforeMessages);
  assert.equal(c.draft.files.length, 1);
  ops.skills.find(s => s.id === license).enabled = false; await nextTick();
  setActivePinia(createPinia());
  const restored = useAgentOpsStore();
  assert.equal(restored.summonSkills('ent-east', agent).length, 0);
  assert.equal(restored.skills.find(s => s.id === license).enabled, false);
  console.log('PASS: per-tenant/Agent/chat drafts, first-send promotion, editable text and attachments, template-free skills, persisted configuration, failed checks and revoked grants.');
} finally { await server.close(); }
