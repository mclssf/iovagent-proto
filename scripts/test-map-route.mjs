import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { searchDrivingRoute } from '../src/utils/amap.ts';

const coordinates = [[121, 31], [113, 23]];
const fake = (run) => ({ Driving: class { search(...args) { run(args.at(-1)); } } });
const road = await searchDrivingRoute(fake(cb => cb('complete', { routes: [{ distance: 10, time: 5, steps: [{ path: [{ toArray: () => coordinates[0] }, { toArray: () => coordinates[1] }] }] }] })), coordinates);
assert.deepEqual(road.path, coordinates);
await assert.rejects(searchDrivingRoute(fake(cb => cb('error', 'INVALID_USER_DOMAIN')), coordinates), /INVALID_USER_DOMAIN/);
await assert.rejects(searchDrivingRoute(fake(cb => cb('complete', { routes: [{ steps: [{ path: [{}] }] }] })), coordinates), /toArray/);
await assert.rejects(searchDrivingRoute(fake(() => {}), coordinates, 0, 20), /超时/);
// Check every fixture order has uninterrupted membership from its load to unload.
const { default: ts } = await import('typescript');
const source = readFileSync(new URL('../src/pinia/agentWork.ts', import.meta.url), 'utf8');
const fixture = source.slice(source.indexOf('const ordersSeedData:'), source.indexOf('const timelineSeed:'));
const js = ts.transpile(fixture + '\n globalThis.orders = ordersSeedData;', { target: ts.ScriptTarget.ES2022 });
const context = vm.createContext({});
vm.runInContext(js, context);
const orders = context.orders;
for (const order of orders) {
  const group = orders.filter(o => o.dispatchId === order.dispatchId);
  const all = group.flatMap(o => o.stops);
  const stops = [...all.filter(s => s.kind === '装货'), ...all.filter(s => s.kind === '卸货')];
  const start = stops.findIndex(s => s.id === order.stops[0].id);
  const end = stops.findIndex(s => s.id === order.stops[1].id);
  assert.ok(start >= 0 && end > start, order.id);
  assert.equal(end - start, 2, order.id);
  assert.ok(order.stops.every(s => s.coordinate.every(Number.isFinite)), order.id);
}
console.log(`PASS: route success, service error, malformed data, timeout; ${orders.length} waybills have complete contiguous segment membership.`);
