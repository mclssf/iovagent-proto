import assert from 'node:assert/strict';
import { createStopRiskFixture } from '../src/views/AgentWork/stopRiskAnalysis.ts';

const startMs = Date.parse('2026-08-01T10:00:00+08:00');
const input = { startMs, endMs: startMs + 4 * 3600000, distanceKm: 160, region: '左权县' };
const results = Array.from({ length: 6 }, (_, index) => createStopRiskFixture({ ...input, index }));
assert.deepEqual(results.map((item) => item.risk), ['无风险', '低风险', '高风险', '无风险', '低风险', '高风险']);
for (const result of results) {
  assert.equal(result.stops.filter((stop) => stop.risk !== '正常').length, result.abnormalCount);
  let previousEnd = input.startMs;
  for (const stop of result.stops) {
    assert.ok(stop.startMs >= previousEnd && stop.endMs <= input.endMs && stop.endMs > stop.startMs);
    assert.ok(Math.abs((stop.endMs - stop.startMs) / 60000 - stop.minutes) < 0.001);
    previousEnd = stop.endMs;
  }
  assert.equal(result.longest, Math.max(...result.stops.map((stop) => stop.minutes)));
}
assert.ok(results[1].stops.some((stop) => stop.place.includes('公共停车区') && stop.risk === '低风险'));
assert.ok(results[2].stops.some((stop) => stop.place.includes('生产制造') && stop.risk === '高风险'));
assert.equal(results[0].abnormalCount, 0);
const short = createStopRiskFixture({ ...input, index: 2, endMs: startMs + 60000 });
assert.ok(short.stops.at(-1).endMs < startMs + 60000);
assert.throws(() => createStopRiskFixture({ ...input, index: 0, endMs: startMs }));
assert.throws(() => createStopRiskFixture({ ...input, index: 0, distanceKm: 0 }));
console.log('Stop risk fixtures: three classifications, abnormal counts, timing boundaries and input validation passed.');
