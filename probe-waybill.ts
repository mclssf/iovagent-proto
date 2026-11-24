/* 运单/车辆 Mock 数据层断言（一次性探针，验证后可删） */
import { areaDisplayName, getAggLines } from './src/views/AgentWork/views/knowledgeBase/mockData';
import { generateSensitiveAreas } from './src/views/AgentWork/views/knowledgeBase/mockData';
import { buildLineSensitiveMap } from './src/views/AgentWork/views/knowledgeBase/lineSensitiveStats';
import {
  getWaybillDataset, resetWaybillCache, getWaybillByNo, waybillsOfVehicle,
  buildWaybillPath, waybillsPerLine, formatTs, formatDuration,
} from './src/views/AgentWork/views/knowledgeBase/waybillMock';

let pass = 0; let fail = 0;
function ok(cond: boolean, msg: string, extra = '') {
  if (cond) { pass += 1; console.log(`  ✓ ${msg}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.log(`  ✗ ${msg}${extra ? ' — ' + extra : ''}`); }
}

const areas = generateSensitiveAreas(300);
const ds = getWaybillDataset(areas);
const lines = getAggLines('city');
const lineStats = buildLineSensitiveMap(lines, areas);
const areaById = new Map(areas.map((a) => [a.id, a]));

console.log('\n=== 1. 规模与唯一性 ===');
const expectWb = lines.reduce((s, l) => s + waybillsPerLine(l), 0);
ok(ds.vehicles.length === 160, '车辆池 160 辆', `${ds.vehicles.length}`);
ok(new Set(ds.vehicles.map((v) => v.vehicleNo)).size === ds.vehicles.length, '车牌号全局唯一');
ok(ds.waybills.length === expectWb, '运单总数 = 各线路配额之和', `${ds.waybills.length} / ${expectWb}`);
ok(new Set(ds.waybills.map((w) => w.waybillNo)).size === ds.waybills.length, '运单号全局唯一');
ok(ds.byLine.size === lines.length, '每条市到市线路都有明细', `${ds.byLine.size}/${lines.length}`);

console.log('\n=== 2. 车牌格式 ===');
const plateRe = /^[新甘宁蒙陕晋青冀鲁豫皖苏][A-N][0-9A-HJ-NP-Z]{5}$/;
const badPlate = ds.vehicles.filter((v) => !plateRe.test(v.vehicleNo));
ok(badPlate.length === 0, '车牌符合 省+字母+5位 格式', badPlate.length ? `异常: ${badPlate.slice(0, 3).map((v) => v.vehicleNo).join(',')}` : `样例 ${ds.vehicles.slice(0, 3).map((v) => v.vehicleNo).join(' ')}`);

console.log('\n=== 3. 口径一致性（最关键）：命中点位必须 ⊂ 该线路碰撞命中集合 ===');
let violation = 0; let checked = 0;
ds.waybills.forEach((wb) => {
  const allowed = new Set((lineStats.get(wb.lineId)?.stats ?? []).map((s) => s.area.id));
  wb.hits.forEach((h) => {
    checked += 1;
    if (!allowed.has(h.areaId)) violation += 1;
    // 点位名必须与库里的**显示名**一致，不能自己拼。
    // ⚠️ 契约已从 area.name 改为 areaDisplayName(area)：无名点位（约 11%，一片空地没有 POI 名）
    // 的 areaName 存的是地址回退值，此时 area.name 是空串，直接比 name 会误报越界。
    const srcArea = areaById.get(h.areaId);
    if (!srcArea || areaDisplayName(srcArea) !== h.areaName) violation += 1;
  });
});
ok(violation === 0, `全部 ${checked} 条命中记录都来自碰撞模型`, violation ? `${violation} 条越界` : '0 越界');

console.log('\n=== 4. 异常停靠业务规则 ===');
const abnormal = ds.waybills.filter((w) => w.abnormal);
ok(abnormal.length / ds.waybills.length > 0.4 && abnormal.length / ds.waybills.length < 0.7,
  '异常单占比在设定区间 (~55%)', `${(abnormal.length / ds.waybills.length * 100).toFixed(1)}% (${abnormal.length}/${ds.waybills.length})`);
ok(ds.waybills.every((w) => w.abnormal === (w.hits.length > 0)), 'abnormal 与 hits 严格等价');
const belowThreshold = ds.waybills.flatMap((w) => w.hits)
  .filter((h) => h.stayMin < (areaById.get(h.areaId)?.stayThresholdMin ?? 0));
ok(belowThreshold.length === 0, '停留分钟 ≥ 该点位停留阈值（否则不构成异常停靠）', `${belowThreshold.length} 条违规`);
/*
 * 命中数分布（20261124 规格变更）：原上限写死 3，现放宽为长尾 1~13。
 * 航哥：「不是每个运单都会途经好几个异常点，它有可能会途经十几个异常点…
 *        如果途经的点多，咱不能在列表里都列出来，所以这块最多列三个就行」。
 * ⚠️ 这里不是"把断言改松让它变绿"：规格真的变了，所以断言要改成**验证新规格的形状**，
 *    并且必须新增一条「确实存在 >3 处的运单」——否则列表的截断逻辑永远触发不到，
 *    功能写了也验不出来（旧数据 324 单 100% ≤3，正是这个坑）。
 */
const hitCounts = new Set(ds.waybills.map((w) => w.hits.length));
const maxHits = Math.max(...hitCounts);
ok(hitCounts.has(0) && hitCounts.has(1), '分布有低端：存在未命中与命中 1 处的运单', `实际取值 ${[...hitCounts].sort((a, b) => a - b).join('/')}`);
ok(maxHits > 3, '**存在命中 >3 处的运单**（否则列表"最多列 3 个"的截断永远不触发）', `最大 ${maxHits} 处`);
ok(maxHits <= 13, '命中数不超过设计上限 13', `最大 ${maxHits}`);
const over3 = ds.waybills.filter((w) => w.hits.length > 3).length;
const over3Ratio = over3 / ds.waybills.length;
ok(over3Ratio > 0.1 && over3Ratio < 0.5,
  '命中 >3 处占比在 10%~50%（应是长尾，不能普遍到失去区分度）',
  `${(over3Ratio * 100).toFixed(1)}% (${over3}/${ds.waybills.length})`);
// 同一运单不得重复命中同一点位：列表 chip 用 areaId 做 :key，重复会撞 key 并让"N 处"名不符实
const dupHit = ds.waybills.filter((w) => new Set(w.hits.map((h) => h.areaId)).size !== w.hits.length);
ok(dupHit.length === 0, '同一运单不重复命中同一点位（洗牌取样保证，探测法在大 N 时会静默少取）', dupHit.length ? `${dupHit.length} 单重复` : '0 单');

console.log('\n=== 5. 时间与里程自洽 ===');
const badTime = ds.waybills.filter((w) => w.arriveTs <= w.departTs);
ok(badTime.length === 0, '到达时间晚于发运时间');
const outOfSpan = ds.waybills.flatMap((w) => w.hits).filter((h) => {
  const wb = ds.waybills.find((x) => x.hits.includes(h))!;
  return h.arriveTs < wb.departTs || h.arriveTs > wb.arriveTs;
});
ok(outOfSpan.length === 0, '停靠时刻落在该单运输时间窗内', `${outOfSpan.length} 条越界`);
const hours = ds.waybills.map((w) => (w.arriveTs - w.departTs) / 3600);
ok(Math.min(...hours) > 3 && Math.max(...hours) < 200, '运输时长在合理区间', `${Math.min(...hours).toFixed(1)}~${Math.max(...hours).toFixed(1)} 小时`);
const kmRatio = ds.waybills.map((w) => {
  const line = lines.find((l) => l.id === w.lineId)!;
  return w.distanceKm;
});
ok(Math.min(...kmRatio) > 20 && Math.max(...kmRatio) < 4000, '里程区间合理', `${Math.min(...kmRatio)}~${Math.max(...kmRatio)} km`);
ok(ds.waybills.every((w) => w.loadWeightT >= 30 && w.loadWeightT <= 49), '装载吨位在 30~49 吨（12吨以上重卡口径）');

console.log('\n=== 6. 检索可用性 ===');
const someWb = ds.waybills[0]!;
ok(getWaybillByNo(ds, someWb.waybillNo)?.waybillNo === someWb.waybillNo, '按运单号精确命中', someWb.waybillNo);
ok(getWaybillByNo(ds, `  ${someWb.waybillNo.toLowerCase()}  `)?.waybillNo === someWb.waybillNo, '运单号检索容忍空格与小写');
ok(getWaybillByNo(ds, 'YD99999999-999999') === undefined, '不存在的运单号返回 undefined');
const multiVeh = [...ds.byVehicle.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
ok(waybillsOfVehicle(ds, multiVeh[0]).length === multiVeh[1].length, '按车牌检索命中该车全部运单', `${multiVeh[0]} → ${multiVeh[1].length} 单`);
ok(waybillsOfVehicle(ds, '不存在车牌').length === 0, '未知车牌返回空数组');
const crossLine = [...ds.byVehicle.entries()].filter(([, list]) => new Set(list.map((w) => w.lineId)).size > 1).length;
ok(crossLine > 0, '存在跨线路复用的车辆（符合大宗干线常态）', `${crossLine} 辆`);

console.log('\n=== 7. 轨迹几何 ===');
const line0 = lines.find((l) => l.id === someWb.lineId)!;
const p1 = buildWaybillPath(someWb, line0);
ok(p1.length >= 60 && p1.length <= 220, '轨迹点数在 60~220', `${p1.length} 点`);
ok(p1.every(([lng, lat]) => lng > 73 && lng < 136 && lat > 3 && lat < 54), '全部坐标落在中国境内');
ok(buildWaybillPath(someWb, line0) === p1, '同一运单轨迹走缓存（引用相同）');
const other = ds.byLine.get(line0.id)!.find((w) => w.waybillNo !== someWb.waybillNo)!;
const p2 = buildWaybillPath(other, line0);
const identical = p1.length === p2.length && p1.every((c, i) => c[0] === p2[i]![0] && c[1] === p2[i]![1]);
ok(!identical, '同线路不同运单轨迹不完全重合（有独立偏移）');
const maxDev = Math.max(...p1.map((c, i) => {
  const q = p2[Math.min(i, p2.length - 1)]!;
  return Math.hypot((c[0] - q[0]) * 111, (c[1] - q[1]) * 111);
}));
ok(maxDev < 30, '两单轨迹偏差在走廊内（<30km）', `最大 ${maxDev.toFixed(2)} km`);

console.log('\n=== 8. 确定性（刷新不跳动）===');
resetWaybillCache();
const ds2 = getWaybillDataset(generateSensitiveAreas(300));
ok(ds2.waybills.length === ds.waybills.length, '重建后运单数一致');
const sameAll = ds.waybills.every((w, i) => {
  const x = ds2.waybills[i]!;
  return w.waybillNo === x.waybillNo && w.vehicleNo === x.vehicleNo && w.departTs === x.departTs
    && w.distanceKm === x.distanceKm && w.loadWeightT === x.loadWeightT
    && w.hits.length === x.hits.length
    && w.hits.every((h, j) => h.areaId === x.hits[j]!.areaId && h.stayMin === x.hits[j]!.stayMin && h.arriveTs === x.hits[j]!.arriveTs);
});
ok(sameAll, '重建后每一单的字段与命中点位完全一致');
ok(ds2.vehicles.every((v, i) => v.vehicleNo === ds.vehicles[i]!.vehicleNo && v.driverName === ds.vehicles[i]!.driverName), '重建后车辆池一致');

console.log('\n=== 9. 展示格式 ===');
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(formatTs(someWb.departTs)), 'formatTs 输出 yyyy-MM-dd HH:mm', formatTs(someWb.departTs));
ok(/小时|分钟/.test(formatDuration(someWb.arriveTs - someWb.departTs)), 'formatDuration 输出可读时长', formatDuration(someWb.arriveTs - someWb.departTs));

console.log('\n=== 10. 样例输出 ===');
const sample = ds.waybills.find((w) => w.abnormal && w.hits.length >= 2) ?? abnormal[0]!;
console.log(JSON.stringify({
  运单号: sample.waybillNo, 线路: `${sample.from} → ${sample.to}`,
  发货点: sample.originName, 收货点: sample.destName,
  车牌: sample.vehicleNo, 司机: sample.driverName, 承运: sample.carrier,
  发运: formatTs(sample.departTs), 到达: formatTs(sample.arriveTs),
  里程: `${sample.distanceKm} km`, 吨位: sample.loadWeightT,
  命中点位: sample.hits.map((h) => `${h.areaName}(停 ${h.stayMin} 分 @ ${formatTs(h.arriveTs)})`),
}, null, 2));

console.log(`\n========== 通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) process.exit(1);
