import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { usePhase1, monitoringSkillEnabled } = await server.ssrLoadModule('/src/pinia/phase1.ts');
  const { simulateAssessment, defaultAssessments } = await server.ssrLoadModule('/src/views/Phase1/eventAssessment.ts');
  const { nextWeatherMidnight } = await server.ssrLoadModule('/src/views/Phase1/catalog.ts');
  const { getRiskOrders } = await server.ssrLoadModule('/src/views/AgentWork/utils/index.ts');
  assert.deepEqual(getRiskOrders([{ id: 'HIGH', risk: '高风险' }, { id: 'LOW', risk: '低风险' }, { id: 'TRACKED', monitoringId: 'TRACKED', risk: '待核实' }, { id: 'CLEAR', monitoringId: 'CLEAR', risk: '无风险' }, { id: 'LEGACY', risk: '待核实' }]).map(order => order.id), ['HIGH', 'LOW', 'TRACKED'], 'monitored review cases appear in abnormal orders without changing legacy risk classification');
  const fresh = () => { setActivePinia(createPinia()); return usePhase1(); };
  const place = { name: '上海装货地', lat: 31.3, lon: 121.3, radiusMeters: 500, regionCode: '310114' };
  const create = (s, options = {}) => s.createOrder({ id: 'WB-TEST', projectId: 'P-TEST', plate: '沪A12345', plateColor: 2, driver: '张师傅', source: '手动录入', origin: place, destination: { ...place, name: '南京卸货地', lon: 118.84, lat: 31.95 }, plannedDeparture: s.now + 3600000, plannedArrival: s.now + 10800000, ...options });
  for (const [departure, arrival, state] of [[60,180,'pending'],[-60,180,'in_transit'],[-180,-60,'completed'],[null,null,'pending']]) {
    const s = fresh(); assert(create(s, { plannedDeparture: departure === null ? null : s.now + departure * 60000, plannedArrival: arrival === null ? null : s.now + arrival * 60000 }));
    assert.equal(s.orders[0].state, state); assert.equal(s.orders[0].departedAt, undefined); assert.equal(s.orders[0].completedAt, undefined);
    if (state === 'completed') { assert.equal(s.orders[0].session, 'stopped'); assert.equal(s.orders[0].subscriptionRevision, 0); }
  }
  let s = fresh(); assert(create(s)); assert.equal(create(s), false); assert.equal(create(s, { id: 'OTHER', origin: { ...place, lat: 100 } }), false);
  assert.match(s.event('WB-TEST', 'parking'), /未生效/); s.advance(10);
  assert.equal(s.event('WB-TEST', 'fence', 'exit', 'origin'), '');
  for (const type of ['parking', 'offline', 'deviation']) assert.equal(s.event('WB-TEST', type), '');
  assert.equal(s.anomalies.length, 3); assert.match(s.event('WB-TEST', 'parking'), /重复/);
  s.advance(15); assert.equal(s.anomalies.find(a => a.kind === '超时停车').repeatCount, 1);
  s.event('WB-TEST', 'parking', 'recovered'); assert.equal(s.anomalies.find(a => a.kind === '超时停车').status, 'recovered');
  const offline = s.anomalies.find(a => a.kind === '在途离线'); const fact = s.events.find(e => e.id === offline.eventId);
  const original = fact.result; assert.equal(s.correctResult(offline.id, '已核实', '隧道信号遮挡，轨迹已恢复'), ''); assert.equal(fact.originalResult, original); assert.equal(offline.status, 'corrected');
  const expiry = s.orders[0].expiresAt, config = s.config('P-TEST'); config.parking.thresholdMinutes = 45;
  assert(s.saveConfig('P-TEST', config, 1)); assert.equal(s.orders[0].expiresAt, expiry); assert.equal(s.saveConfig('P-TEST', config, 1), false);
  s.orders[0].cleanupWillFail = true; s.stop('WB-TEST'); assert.equal(s.orders[0].session, 'cleanup_pending'); assert.match(s.event('WB-TEST', 'offline'), /停止/); s.retryCleanup('WB-TEST'); assert.equal(s.orders[0].session, 'stopped');
  s = fresh(); let c = s.config('P-TEST'); c.missingPass = { origin: true, destination: true }; s.configs['P-TEST'] = c;
  assert(create(s, { plannedDeparture: s.now - 60000 })); s.advance(72 * 60); assert(!s.anomalies.some(a => a.kind.startsWith('未经过')), 'expiry alone cannot create missing-pass anomalies');
  s = fresh(); c = s.config('P-TEST'); c.missingPass = { origin: true, destination: true }; c.lateDeparture.enabled = false; c.lateArrival.enabled = false; c.pausedSkillIds = ['p1-late']; s.configs['P-TEST'] = c;
  assert(create(s)); s.progress('WB-TEST','loading'); assert(!s.anomalies.some(a=>a.kind.startsWith('未经过')), 'paused task includes missing-pass rules');
  c = s.config('P-TEST'); c.pausedSkillIds = []; assert(s.saveConfig('P-TEST',c,c.version)); assert(monitoringSkillEnabled(c,'p1-late'), 'missing-pass-only task is enabled');
  s.progress('WB-TEST','in_transit'); assert.equal(s.anomalies.filter(a=>a.kind==='未经过起始地').length,1); s.progress('WB-TEST','arrived'); assert.equal(s.anomalies.filter(a=>a.kind==='未经过目的地').length,1);
  s = fresh(); c = s.config('P-TEST'); c.selectedSkills = ['p1-parking']; c.pausedSkillIds = ['p1-parking']; s.configs['P-TEST'] = c; assert(create(s)); assert.equal(s.orders[0].session,'paused'); c.pausedSkillIds=[]; assert(s.saveConfig('P-TEST',c,c.version)); s.advance(10); assert.equal(s.orders[0].session,'active','resume restarts paused session');
  s = fresh(); c = s.config('P-TEST'); c.missingPass = { origin: true, destination: true }; s.configs['P-TEST'] = c; assert(create(s)); s.advance(10); s.event('WB-TEST','fence','enter','destination'); assert(s.anomalies.some(a=>a.kind==='未经过起始地'),'automatic state transition checks missing origin');
  s = fresh(); assert(create(s)); c = s.config('P-TEST'); c.weather.enabled=true; assert(s.saveConfig('P-TEST',c,c.version)); assert.equal(s.orders[0].weatherEffectiveAt,nextWeatherMidnight(s.now)); assert.match(s.weatherSample('WB-TEST'),/待生效/); s.advance((s.orders[0].weatherEffectiveAt-s.now)/60000); assert.equal(s.weatherSample('WB-TEST','暴雨','前方暴雨','WX-TEST'),''); assert.match(s.weatherSample('WB-TEST','暴雨','前方暴雨','WX-TEST'),/重复/);
  const event = { type:'parking', poiEvidence:{source:'mock',pois:[{name:'服务区',category:'服务区',distanceMeters:100,inside:true}],normalActivityConfirmed:true,durationMatches:true} };
  const assessment=defaultAssessments().parking; assert.equal(simulateAssessment(event,assessment).verdict,'reasonable'); assert.equal(simulateAssessment({...event,poiEvidence:{...event.poiEvidence,dangerousLocation:true}},assessment).verdict,'review'); assert.equal(simulateAssessment(event,{...assessment,filterRule:'客户指定规则'}).verdict,'review');
  const { restoreMonitoringProjects, persistMonitoringProjects } = await server.ssrLoadModule('/src/views/Phase1/persistence.ts');
  const storage = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  try {
    const base = { id: 'P-MAIN', name: '既有项目', status: '已连接', sync: '刚刚', total: 2, risk: 0, tmsUrl: 'sensitive-url', tmsUser: 'sensitive-user', keyword: '', statusFilter: '', skillIds: ['p1-parking'], mailbox: { address: 'orders@example.com', status: 'bound', boundAt: 1 }, quickPrompts: ['既有快捷问题'] };
    const added = { ...base, id: 'P-NEW', name: '新建监听项目', mailbox: undefined, authorizedDataSkillIds: [] };
    assert(persistMonitoringProjects([base, added]));
    assert.doesNotMatch(storage.get('iovagent-monitoring-projects'), /sensitive|orders@example/);
    let restored = restoreMonitoringProjects([base]);
    assert.equal(restored.length, 2); assert.deepEqual(restored[0].mailbox, base.mailbox); assert.deepEqual(restored[0].quickPrompts, base.quickPrompts); assert.equal(restored[1].tmsUrl, '');
    assert.deepEqual(restored[1].authorizedDataSkillIds, [], 'available skills are not automatically authorized after reload');
    const noSkills = { ...added, skillIds: [] };
    assert(persistMonitoringProjects([base, noSkills]));
    assert.deepEqual(restoreMonitoringProjects([base])[1].skillIds, [], 'removing monitoring skills does not lose the project');
    assert(persistMonitoringProjects([noSkills]));
    restored = restoreMonitoringProjects([base]);
    assert.equal(restored.length, 1); assert.equal(restored[0].id, 'P-NEW', 'deleted seed project is not resurrected');
    storage.set('iovagent-monitoring-projects', '{bad'); assert.deepEqual(restoreMonitoringProjects([base]), [base]);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
  for (const file of ['MonitoringConfigDialog.vue','MonitoringTasks.vue','MonitoringOrderPanel.vue','NewMonitoredOrderDialog.vue','CorrectionDialog.vue']) {
    const source=await readFile(`${root}src/views/Phase1/${file}`,'utf8'); assert.doesNotMatch(source,/RuleAssistant|parseRuleRequest|本地模拟|演示|V1\.1|V262|推进时间|恢复样例/);
  }
  for (const file of ['src/router/index.ts', 'src/views/AgentWork/useAgentWorkNav.ts', 'src/views/AgentWork/component/menu.comp.vue', 'src/views/Phase1/MonitoringOrderPanel.vue']) {
    assert.doesNotMatch(await readFile(`${root}${file}`, 'utf8'), /agent-work-events|MonitoringEvents|goPage\('events'|id: 'events'/);
  }
  const projectForm = await readFile(`${root}src/views/AgentWork/views/projectCreate.view.vue`, 'utf8');
  assert.doesNotMatch(projectForm, /toggleSkill|isSkillSelected|已选择|未选择|请选择项目技能|selectedSkills\.length|:aria-pressed/);
  assert.match(projectForm, /const skillIds = skills\.value\.map/);
  assert.match(projectForm, /projectNameInput\.value\?\.focus\(\)/);
  console.log('PASS: monitoring intake, initialized/actual separation, lifecycle, thresholds, duplicate/recovery, corrections, expiry-only guard, paused missing-pass rules, resume, automatic checks, weather, POI review, safe project persistence and formal UI.');
} finally { await server.close(); }
