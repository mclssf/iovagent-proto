/**
 * 探明：单条异常运单命中多少个敏感区域（决定"最多列 3 个"是否必要、+N 会不会常见）
 * 以及同一运单是否会对同一区域产生多条 hit（决定要不要去重）
 */
import { generateSensitiveAreas } from './src/views/AgentWork/views/knowledgeBase/mockData';
import { getWaybillDataset } from './src/views/AgentWork/views/knowledgeBase/waybillMock';

const areas = generateSensitiveAreas();
const ds = getWaybillDataset(areas);
const abnormal = ds.waybills.filter((w) => w.hits.length > 0);

const counts = abnormal.map((w) => w.hits.length).sort((a, b) => a - b);
const dist = new Map<number, number>();
counts.forEach((c) => dist.set(c, (dist.get(c) ?? 0) + 1));

console.log('异常运单总数:', abnormal.length);
console.log('命中点位数 min/中位/max:', counts[0], counts[Math.floor(counts.length / 2)], counts[counts.length - 1]);
console.log('均值:', (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2));
console.log('\n分布（命中N处 → 运单数）:');
[...dist.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, v]) => {
  console.log(`  ${String(k).padStart(2)} 处: ${String(v).padStart(3)} 单  ${(v / abnormal.length * 100).toFixed(1)}%`);
});

const over3 = counts.filter((c) => c > 3).length;
console.log(`\n>3 处的运单: ${over3} 单 (${(over3 / abnormal.length * 100).toFixed(1)}%) ← 这些会被截断，需要 +N`);
console.log(`≤3 处的运单: ${counts.length - over3} 单 (${((counts.length - over3) / abnormal.length * 100).toFixed(1)}%) ← 不受影响`);

// 同一运单是否重复命中同一区域（若有，chip 用 areaId 做 key 会撞）
let dupWaybills = 0;
let dupTotal = 0;
abnormal.forEach((w) => {
  const ids = w.hits.map((h) => h.areaId);
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) { dupWaybills++; dupTotal += ids.length - uniq.size; }
});
console.log(`\n同一运单重复命中同一区域的单数: ${dupWaybills}（多余 hit ${dupTotal} 条）`);
console.log(dupWaybills === 0
  ? '→ 无重复：chip 用 areaId 做 :key 安全，「停靠 N 处」= hits.length 也准确'
  : '→ 有重复：chip 必须按 areaId 去重，否则 :key 冲突且"N 处"名不符实');

// hits 是否已按 arriveTs 升序（决定"前三个"是哪三个）
let unsorted = 0;
abnormal.forEach((w) => {
  for (let i = 1; i < w.hits.length; i++) {
    if (w.hits[i].arriveTs < w.hits[i - 1].arriveTs) { unsorted++; break; }
  }
});
console.log(`\nhits 未按 arriveTs 升序的运单: ${unsorted} → ${unsorted === 0 ? '上游已排序，但取前三仍应显式排序不依赖隐式顺序' : '必须显式排序'}`);
