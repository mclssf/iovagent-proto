import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { createDataEmployeeSkills, filterDataEmployeeSkillsForEnterprise, currentWechatEnterpriseId } = await server.ssrLoadModule('/src/pinia/dataEmployeeSkills.ts');
  const { useAgentOpsStore } = await server.ssrLoadModule('/src/pinia/agentOps.ts');
  const catalog = createDataEmployeeSkills();
  const directory = catalog.filter(skill => skill.sourceType === 'wechat');
  const visible = filterDataEmployeeSkillsForEnterprise(catalog);
  const employees = visible.filter(skill => skill.sourceType === 'wechat');
  assert.equal(directory.length, 4);
  assert.equal(employees.length, 3);
  assert(employees.every(skill => skill.name === '群消息录单员' && skill.wechatSource.enterpriseId === currentWechatEnterpriseId));
  assert.equal(new Set(directory.map(skill => skill.id)).size, directory.length);
  assert.equal(new Set(directory.map(skill => `${skill.wechatSource.enterpriseId}:${skill.wechatSource.accountId}:${skill.wechatSource.groupId}`)).size, directory.length, 'one employee represents one enterprise-account-group binding');
  assert(directory.every(skill => skill.loginType === '无验证' && skill.loginUrl === '微信群消息'), 'WeChat bindings never request TMS login');
  assert(directory.every(skill => skill.wechatSource.groupId && skill.wechatSource.groupName && skill.wechatSource.acquisitionMethod === '微信消息' && skill.wechatSource.recognitionDescription));
  const sharedAccount = employees.filter(skill => skill.wechatSource.accountId === employees[0].wechatSource.accountId);
  assert.equal(sharedAccount.length, 2, 'the same account can serve independent groups');
  assert.notEqual(sharedAccount[0].wechatSource.groupId, sharedAccount[1].wechatSource.groupId);
  assert.equal(sharedAccount[0].wechatSource.wechatId, sharedAccount[1].wechatSource.wechatId);
  assert.equal(sharedAccount[0].wechatSource.onlineStatus, sharedAccount[1].wechatSource.onlineStatus, 'the status belongs to the WeChat account');
  assert(employees.some(skill => skill.wechatSource.onlineStatus === 'offline'), 'offline accounts retain their binding and remain visible');
  const southwest = filterDataEmployeeSkillsForEnterprise(catalog, 'ent-southwest').filter(skill => skill.sourceType === 'wechat');
  assert.equal(southwest.length, 1);
  assert(!employees.some(skill => skill.id === southwest[0].id), 'another enterprise cannot leak into the current project picker');
  const legacyIds = catalog.filter(skill => !skill.sourceType).map(skill => skill.id);
  assert.deepEqual(filterDataEmployeeSkillsForEnterprise(catalog, 'unknown').map(skill => skill.id), legacyIds, 'enterprise filtering preserves existing non-WeChat sources');
  assert.deepEqual(visible.filter(skill => !skill.sourceType).map(skill => skill.id), legacyIds);

  setActivePinia(createPinia());
  const ops = useAgentOpsStore();
  assert.deepEqual(ops.visibleDataEmployeeSkills.map(skill => skill.id), visible.map(skill => skill.id));
  const employee = ops.dataEmployeeSkills.find(skill => skill.id === employees[0].id);
  const callable = ops.agentCallableSkills.find(skill => skill.id === employee.id);
  assert.equal(callable.source, 'data-employee');
  assert.equal(callable.category, '数据员工');
  assert.equal(callable.sourceConfig.sourceType, 'wechat');
  assert.deepEqual(callable.sourceConfig.wechatSource, employee.wechatSource, 'Agent loading and the project picker share the binding definition');
  assert(ops.skills.every(skill => !directory.some(source => source.id === skill.id)), 'WeChat employees are not generic Skills');
  const saved = { ...employee, wechatSource: { ...employee.wechatSource, accountName: '华东业务调度' } };
  ops.saveDataEmployeeSkill(saved);
  saved.wechatSource.accountName = '外部草稿修改';
  assert.equal(ops.dataEmployeeSkills.find(skill => skill.id === employee.id).wechatSource.accountName, '华东业务调度', 'saving detaches nested bindings from the editor draft');
  assert.equal(ops.agentCallableSkills.find(skill => skill.id === employee.id).sourceConfig.wechatSource.accountName, '华东业务调度');
  console.log('Passed: WeChat employee binding identity, enterprise isolation, shared-account groups, offline visibility and shared Agent loading metadata.');
} finally {
  await server.close();
}
