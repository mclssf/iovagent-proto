import assert from 'node:assert/strict';
import { waybillPlanWindow, waybillStops, waybillVehicles } from '../src/views/AgentWork/waybillDisplay.ts';

const order = {
  plate: '甲车、乙车',
  vehicleSegments: [{ plate: '乙车', sequence: 2 }, { plate: '甲车', sequence: 1 }],
  stops: [
    { id: 'u2', role: 'unloading', sequence: 4, plannedAt: 900 },
    { id: 'l2', role: 'loading', sequence: 2, plannedAt: 200 },
    { id: 'u1', role: 'unloading', sequence: 3, plannedAt: 700 },
    { id: 'l1', role: 'loading', sequence: 1, plannedAt: 100 },
  ],
};

assert.deepEqual(waybillStops(order).loading.map(stop => stop.id), ['l1', 'l2']);
assert.deepEqual(waybillStops(order).unloading.map(stop => stop.id), ['u1', 'u2']);
assert.deepEqual(waybillPlanWindow(order), { start: 100, end: 900 });
assert.deepEqual(waybillVehicles(order), ['甲车', '乙车']);
assert.deepEqual(waybillPlanWindow({ stops: [{ id: 'l', role: 'loading', sequence: 1, plannedAt: undefined }] }), { start: undefined, end: undefined });
console.log('waybill display: passed');
