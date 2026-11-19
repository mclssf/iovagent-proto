import assert from 'node:assert/strict';
import { detectHighwayTransitions, detectVehicleTransfers } from '../src/views/Phase1/trackDetection.ts';

const minute = 60000;
const base = Date.parse('2026-10-25T20:00:00+08:00');
const point = (minutes, plate, lon, lat = 39.7189, extra = {}) => ({ at: base + minutes * minute, vehiclePlate: plate, lon, lat, speedKmh: 0, ...extra });
const points = [
  point(0, 'A', 117.3137), point(40, 'A', 117.3137),
  point(10, 'B', 117.3141), point(50, 'B', 117.3141),
  point(70, 'A', 117.3200), point(115, 'A', 117.3200),
  point(80, 'B', 117.3204), point(120, 'B', 117.3204),
];
const segments = [{ plate: 'A', sequence: 1 }, { plate: 'B', sequence: 2 }];
const detected = detectVehicleTransfers(points, segments, { distanceMeters: 100, overlapMinutes: 30 }, base, base + 130 * minute);
assert.equal(detected.length, 1);
assert.equal(detected[0].at, base + 115 * minute, 'multiple matches choose the last overlap');
assert.equal(detectVehicleTransfers(points, segments, { distanceMeters: 10, overlapMinutes: 30 }, base, base + 130 * minute).length, 0);
assert.equal(detectVehicleTransfers(points, segments, { distanceMeters: 100, overlapMinutes: 40 }, base, base + 130 * minute).length, 0);

const highway = detectHighwayTransitions([
  point(0, 'A', 117.3, 39.7, { onHighway: false }),
  point(5, 'A', 117.4, 39.7, { onHighway: true }),
  point(10, 'A', 117.5, 39.7, { onHighway: false }),
  point(6, 'B', 117.4, 39.7, { onHighway: false }),
], base, base + 20 * minute);
assert.deepEqual(highway.map(item => item.phase), ['驶入高速', '驶离高速']);
console.log('track detection: passed');
