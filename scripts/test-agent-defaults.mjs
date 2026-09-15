import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
import { computed } from 'vue';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { useAgentOpsStore } = await server.ssrLoadModule('/src/pinia/agentOps.ts');
  const { defaultAgentBinding } = await server.ssrLoadModule('/src/pinia/customerAgents.ts');
  const { agentConfigurationFingerprint, resolveAgentTools } = await server.ssrLoadModule('/src/views/AgentOps/agentConflicts.ts');
  setActivePinia(createPinia());
  const store = useAgentOpsStore();
  const dataId = 'data-employee-agent', generalId = 'general-chat-agent', projectId = 'project-chat-agent';
  const follower = 'ent-demo', custom = 'ent-jinyu';
  const definition = id => store.agents.find(agent => agent.id === id);
  const binding = (customerId, agentId) => store.customerAgentBindings(customerId).find(item => item.agentId === agentId);
  const resolve = (customerId, agentId) => store.resolveCustomerAgent(customerId, agentId);
  const catalog = id => ({ skills: store.availableSkillsForAgent(id), tools: store.tools });
  const privateBefore = JSON.stringify(store.agentCallableSkills.map(skill => [skill.id, skill.privateToolIds]));

  assert(store.customers.every(customer => store.customerAgentBindings(customer.id).length === 3));
  assert(store.customerAgentBindings(follower).every(item => item.mode === 'default'));
  assert(store.customerAgentBindings(custom).every(item => item.mode === 'custom'));
  assert.deepEqual(resolve(custom, dataId).skillIds, ['spreadsheet-waybill', 'jinyu-cement-tms'], 'existing customer selections remain custom');
  store.saveCustomerAgents(custom, []);
  assert.equal(store.customerAgentBindings(custom).length, 3, 'empty input cannot revoke fixed Agents');
  const newCustomer = { ...store.customers[0], id: 'newly-activated', cid: 'DEMO-NEW', name: '新开通验证客户', agentConfigs: [] };
  store.customers.push(newCustomer);
  assert(store.customerAgentBindings(newCustomer.id).every(item => item.mode === 'default'));
  assert.deepEqual(resolve(newCustomer.id, dataId).skillIds, ['spreadsheet-waybill']);

  const live = computed(() => resolve(follower, generalId));
  const originalCustom = resolve(custom, generalId);
  const oldReport = store.detectCustomerAgentConflicts(follower, generalId);
  const oldFingerprint = agentConfigurationFingerprint(live.value, catalog(generalId));
  const defaults = { skillIds: ['operations-license-recognition'], toolIds: ['waybill-validate', 'datetime-format', 'datetime-format'] };
  store.saveAgent(definition(generalId), generalId, defaults);
  defaults.skillIds.push('operations-sms-notification');
  assert.deepEqual(live.value.skillIds, ['operations-license-recognition'], 'followers read the latest defaults reactively and saved arrays detach from drafts');
  assert.deepEqual(live.value.toolIds, ['waybill-validate', 'datetime-format']);
  assert.deepEqual(resolve(custom, generalId), originalCustom, 'custom selections do not track defaults');
  assert.deepEqual(resolve(newCustomer.id, generalId).toolIds, live.value.toolIds, 'new customers use current defaults without manual initialization');
  assert.notEqual(oldFingerprint, agentConfigurationFingerprint(live.value, catalog(generalId)));
  assert.notEqual(oldReport.fingerprint, agentConfigurationFingerprint(live.value, catalog(generalId)), 'default updates invalidate follower reports');
  assert(store.customerAgentsForTool('waybill-validate').some(item => item.customerId === follower && item.mode === 'default'));
  assert(!store.customerAgentsForTool('waybill-validate').some(item => item.customerId === custom));
  assert(store.agentsUsingToolByDefault('waybill-validate').some(agent => agent.id === generalId));
  const copy = store.agentDefaultConfig(generalId);
  copy.skillIds.length = 0;
  assert.equal(store.agentDefaultConfig(generalId).skillIds.length, 1, 'editor copies cannot mutate saved defaults');

  store.saveCustomerAgents(follower, [{ agentId: generalId, mode: 'custom', ...store.resolveAgentCapabilities(generalId, binding(follower, generalId)) }]);
  const frozen = resolve(follower, generalId);
  store.saveAgent(definition(generalId), generalId, { skillIds: [], toolIds: ['datetime-format'] });
  assert.deepEqual(resolve(follower, generalId), frozen, 'switching to custom freezes a snapshot of the current effective configuration');
  store.saveCustomerAgents(follower, [{ agentId: generalId, mode: 'custom', skillIds: [], toolIds: [] }]);
  assert.deepEqual(resolve(follower, generalId).toolIds, [], 'an intentionally empty custom configuration does not fall back to defaults');
  store.saveCustomerAgents(follower, [{ ...defaultAgentBinding(generalId), toolIds: ['ignored-old-custom-tool'] }]);
  assert.deepEqual(binding(follower, generalId), defaultAgentBinding(generalId), 'switching to default discards stale custom overrides');
  assert.deepEqual(resolve(follower, generalId).toolIds, ['datetime-format']);
  store.saveAgent(definition(generalId), generalId, { skillIds: ['operations-license-recognition'], toolIds: [] });
  assert.deepEqual(resolve(follower, generalId).skillIds, ['operations-license-recognition'], 'rejoining defaults restores future propagation');

  const customBeforePrompt = resolve(custom, generalId);
  const oldDefaultPrompt = definition(generalId).systemPrompt;
  const followerReport = store.detectCustomerAgentConflicts(follower, generalId);
  store.saveAgent({ ...definition(generalId), systemPrompt: '更新通用对话默认指令' }, generalId);
  assert.equal(live.value.systemPrompt, '更新通用对话默认指令', 'default followers reactively inherit prompt updates');
  assert.deepEqual(resolve(custom, generalId), customBeforePrompt, 'existing custom customers keep their prompt snapshot');
  assert.equal(binding(custom, generalId).systemPrompt, oldDefaultPrompt);
  assert.notEqual(followerReport.fingerprint, agentConfigurationFingerprint(live.value, catalog(generalId)), 'shared prompt updates invalidate follower reports');

  const otherAgentBeforePrompt = resolve(custom, dataId);
  const customReport = store.detectCustomerAgentConflicts(custom, generalId);
  const promptDraft = { ...binding(custom, generalId), systemPrompt: '  仅为金隅水泥回答物流问题。  ' };
  assert.notEqual(customReport.fingerprint, agentConfigurationFingerprint({ ...customBeforePrompt, systemPrompt: store.resolveAgentSystemPrompt(generalId, promptDraft) }, catalog(generalId)), 'unsaved customer prompt changes mark existing reports stale');
  assert.deepEqual(resolve(custom, generalId), customBeforePrompt, 'editing a detached prompt draft does not mutate saved state');
  store.saveCustomerAgents(custom, [promptDraft]);
  assert.equal(resolve(custom, generalId).systemPrompt, '仅为金隅水泥回答物流问题。');
  assert.equal(binding(custom, generalId).systemPrompt, '仅为金隅水泥回答物流问题。', 'reopening customer configuration restores its saved prompt');
  assert.deepEqual(resolve(custom, generalId).skillIds, customBeforePrompt.skillIds);
  assert.deepEqual(resolve(custom, generalId).toolIds, customBeforePrompt.toolIds);
  assert.deepEqual(resolve(custom, dataId), otherAgentBeforePrompt, 'customer prompt changes stay scoped to one Agent');
  assert.equal(definition(generalId).systemPrompt, '更新通用对话默认指令');
  assert.equal(live.value.systemPrompt, definition(generalId).systemPrompt, 'other customers are unaffected');
  assert.equal(store.detectCustomerAgentConflicts(custom, generalId).fingerprint, agentConfigurationFingerprint(resolve(custom, generalId), catalog(generalId)), 'conflict detection reads the effective custom prompt');
  store.saveAgent({ ...definition(generalId), systemPrompt: '再次更新默认指令' }, generalId);
  assert.equal(resolve(custom, generalId).systemPrompt, '仅为金隅水泥回答物流问题。');
  assert.equal(live.value.systemPrompt, '再次更新默认指令');

  const beforeEmptyPrompt = JSON.stringify(store.customers);
  assert.throws(() => store.saveCustomerAgents(custom, [defaultAgentBinding(dataId), { ...binding(custom, generalId), systemPrompt: '  ' }]), /System Prompt/);
  assert.equal(JSON.stringify(store.customers), beforeEmptyPrompt, 'an empty prompt rejects the whole save without partial changes');
  store.saveCustomerAgents(custom, [{ ...defaultAgentBinding(generalId), systemPrompt: '应清除的自定义指令' }]);
  assert.deepEqual(binding(custom, generalId), defaultAgentBinding(generalId), 'default mode clears custom prompts as well as capabilities');
  assert.equal(resolve(custom, generalId).systemPrompt, '再次更新默认指令');
  store.saveCustomerAgents(custom, [{ agentId: generalId, mode: 'custom', ...store.resolveAgentCapabilities(generalId, binding(custom, generalId)), systemPrompt: store.resolveAgentSystemPrompt(generalId, binding(custom, generalId)) }]);
  store.saveAgent({ ...definition(generalId), systemPrompt: '最新默认指令' }, generalId);
  assert.equal(resolve(custom, generalId).systemPrompt, '再次更新默认指令', 'switching back to custom captures the current effective prompt');

  const beforeInvalid = JSON.stringify([store.agents, store.agentDefaultConfig(generalId), store.customers]);
  assert.throws(() => store.saveAgent({ name: '不应保存', systemPrompt: '不应保存' }, generalId, { skillIds: ['jinyu-cement-tms'], toolIds: [] }), /不适用/);
  assert.throws(() => store.saveAgent(definition(generalId), generalId, { skillIds: ['capacity-cargo-search'], toolIds: [] }), /停用/);
  assert.throws(() => store.saveAgent(definition(generalId), generalId, { skillIds: [], toolIds: ['missing'] }), /失效/);
  assert.throws(() => store.saveCustomerAgents(follower, [{ ...defaultAgentBinding(generalId), mode: 'invalid' }]), /请选择/);
  assert.equal(JSON.stringify([store.agents, store.agentDefaultConfig(generalId), store.customers]), beforeInvalid, 'invalid changes have no partial effects');
  assert.equal(JSON.stringify(store.agentCallableSkills.map(skill => [skill.id, skill.privateToolIds])), privateBefore, 'default and customer assignment never edit Skill private dependencies');
  store.saveAgent(definition(projectId), projectId, { skillIds: ['route-risk-expert'], toolIds: ['risk-evaluate'] });
  const inheritedConflict = store.detectCustomerAgentConflicts(follower, projectId);
  assert(inheritedConflict.findings.some(item => item.id === 'duplicate-risk-evaluate'), 'inherited direct tools still conflict with the independent private path');
  assert(resolveAgentTools(resolve(follower, projectId), catalog(projectId)).some(item => item.id === 'vehicle-mcp'));

  const mcp = store.saveMcp({ name: '默认加载验证 MCP', description: '', transport: 'Streamable HTTP', endpoint: 'https://mcp.example.com/mcp', bearerTokenEnvVar: '', headers: [], envHeaders: [], timeout: 30 });
  store.saveAgent(definition(generalId), generalId, { skillIds: [], toolIds: [mcp.id] });
  store.saveCustomerAgents(custom, [{ agentId: generalId, mode: 'custom', skillIds: [], toolIds: [mcp.id] }]);
  assert(store.mcpUsage(mcp.id).defaults.some(agent => agent.id === generalId));
  assert(store.mcpUsage(mcp.id).agents.some(item => item.customerId === follower));
  store.deleteMcp(mcp.id);
  assert(!store.agentDefaultConfig(generalId).toolIds.includes(mcp.id));
  assert(!resolve(follower, generalId).toolIds.includes(mcp.id));
  assert(!resolve(custom, generalId).toolIds.includes(mcp.id));

  const agentsSource = JSON.parse(await readFile(`${root}src/data/agentOpsAgents.json`, 'utf8'));
  const defaultsBeforeSync = JSON.stringify(store.agentDefaultConfig(projectId));
  const customersBeforeSync = JSON.stringify(store.customers);
  await store.syncAgents(async () => agentsSource);
  assert.equal(JSON.stringify(store.agentDefaultConfig(projectId)), defaultsBeforeSync, 'registry refresh preserves operational defaults');
  assert.equal(JSON.stringify(store.customers), customersBeforeSync, 'registry refresh preserves per-customer modes');
  await assert.rejects(store.syncAgents(async () => { throw new Error('同步失败'); }));
  assert.equal(JSON.stringify(store.agentDefaultConfig(projectId)), defaultsBeforeSync);
  console.log('Passed: fixed Agents, new-customer defaults, live prompt/capability inheritance, isolated custom prompts, switching modes, atomic validation, conflict staleness, reverse Tool usage, MCP cleanup and registry sync preservation.');
} finally {
  await server.close();
}
