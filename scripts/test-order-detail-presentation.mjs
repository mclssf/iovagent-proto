import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { detailRiskTone, detailEventDuration, detailEventConclusion, detailEventSupplement } = await server.ssrLoadModule('/src/views/AgentWork/orderDetailPresentation.ts');
  assert.equal(detailRiskTone('高风险'), 'danger');
  assert.equal(detailRiskTone('合理', 'green'), 'normal');
  assert.equal(detailRiskTone('待核实'), 'warning');
  assert.equal(detailRiskTone(), 'neutral');
  assert.equal(detailRiskTone('异常停车'), 'neutral', 'event names do not determine risk');
  const event = { id: 3, type: 'stop', title: '异常停车事件', time: '13:42 - 15:21', place: '服务区', desc: '停车 99 分钟。' };
  assert.equal(detailEventDuration(event), '99 分钟');
  assert.equal(detailEventDuration({ ...event, desc: '' }), '99 分钟');
  assert.equal(detailEventDuration({ ...event, desc: '', time: '23:40 - 次日 00:20' }), '40 分钟');
  assert.equal(detailEventDuration({ ...event, desc: '', time: '次日 00:20 - 次日 01:00' }), '40 分钟');
  assert.equal(detailEventDuration({ ...event, desc: '', time: '23:40 - 00:20' }), '', 'cross-day timing must be explicit');
  assert.equal(detailEventDuration({ ...event, desc: '', time: '25:00 - 26:00' }), '');
  assert.equal(detailEventDuration({ ...event, desc: '', time: '19:12' }), '');
  assert.equal(detailEventConclusion({ ...event, agent: '停车点接近服务区，判定为低风险合理休息。' }), '判定为低风险合理休息');
  assert.equal(detailEventSupplement({ ...event, agent: '停车点接近服务区，判定为低风险合理休息。' }), '停车点接近服务区，判定为低风险合理休息。');
  assert.equal(detailEventSupplement(event), '', 'do not create duplicate expandable content');
  assert.equal(detailEventSupplement({ ...event, desc: '车辆进入围栏。等待卸货确认。' }), '车辆进入围栏。等待卸货确认。');
  console.log('Passed: explicit risk colors, no inferred severity, recorded/calculated durations, cross-day safeguards and existing-content disclosure.');
} finally { await server.close(); }
