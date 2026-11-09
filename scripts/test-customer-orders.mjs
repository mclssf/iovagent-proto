import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const records = JSON.parse(readFileSync(new URL('../src/views/AgentWork/customerOrders.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../src/views/AgentWork/customerOrders.ts', import.meta.url), 'utf8');
const sandbox = { exports: {}, require: () => ({ default: records }) };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
const { customerOrders, reviewCustomerOrder } = sandbox.exports;
assert.equal(customerOrders.length, 20);
assert.equal(new Set(customerOrders.map(o => o.id)).size, 20);
assert.equal(customerOrders.filter(o => o.transportMode === '大件整车').length, 10);
assert.equal(customerOrders.filter(o => o.transportMode === '零担').length, 10);
assert.equal(new Set(customerOrders.map(o => o.dispatchId)).size, 9);
for (const order of customerOrders) {
  assert.equal(order.stops.length, 2);
  assert.ok(order.stops.every(s => s.address && !s.coordinate));
  assert.ok(order.customerRecord.sourceRow > 1);
  assert.ok(['低风险', '待核实'].includes(reviewCustomerOrder(order, 120).risk));
}
const sample = { ...customerOrders[0], customerRecord: { fields: { '签到时间': '2026-10-28 08:00:00', '发车时间': '2026-10-28 11:00:00' } } };
assert.equal(reviewCustomerOrder(sample, 120).risk, '低风险');
assert.equal(reviewCustomerOrder(sample, 240).risk, '待核实');
assert.equal(reviewCustomerOrder({ ...sample, customerRecord: { fields: {} } }, 120).risk, '待核实');
console.log('PASS 20 real orders, 10 per mode, 9 dispatches, complete load/unload links, missing coordinates never fabricated, stay threshold and missing-data rules.');
const simulationModule = { exports: {} };
const simulationSource = readFileSync(new URL('../src/views/AgentWork/simulatedLocations.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(simulationSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, simulationModule);
const before = JSON.stringify(customerOrders);
const simulated = simulationModule.exports.simulateCustomerOrders(customerOrders, Date.parse('2026-11-04T10:00:00+08:00'));
assert.equal(JSON.stringify(customerOrders), before);
assert.equal(simulated.length, 20);
assert.deepEqual([...new Set(simulated.map(o => o.risk))].sort(), ['低风险','无风险','高风险'].sort());
for (const order of simulated) {
  const sibling = simulated.find(o => o.dispatchId === order.dispatchId);
  assert.equal(JSON.stringify(order.simulation.coordinate), JSON.stringify(sibling.simulation.coordinate));
  assert.equal(order.simulation.timestamp, sibling.simulation.timestamp);
  assert.ok(order.simulation.track.length >= 2);
  assert.ok(order.simulation.coordinate.every(Number.isFinite));
  assert.equal(order.customerRecord.fields['ASN单号'], customerOrders.find(o => o.id === order.id).customerRecord.fields['ASN单号']);
}
console.log('PASS simulation: 20 records, 9 shared vehicle locations, 3 risk levels, GPS tracks, original data unchanged.');
