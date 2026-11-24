/* 重定基线 + 关键不变量（点位池换全国后必跑） */
import {
  generateSensitiveAreas, getAggLines, getTop20Lines, countDistinctAbnormal,
  RISK_COLOR, MANUAL_AREA_COLOR, MAP_SEMANTIC_COLOR, AREA_MARKER_STYLE, areaPointColor, deriveRiskLevel, RISK_THRESHOLD,
} from './src/views/AgentWork/views/knowledgeBase/mockData';
import { buildLineSensitiveMap, buildAreaLineIndex } from './src/views/AgentWork/views/knowledgeBase/lineSensitiveStats';
import { hasRealGeometry, getRouteGeometry } from './src/views/AgentWork/views/knowledgeBase/trajectoryMock';
import { getWaybillDataset } from './src/views/AgentWork/views/knowledgeBase/waybillMock';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string, x = '') => { c ? (pass++, console.log(`  ✓ ${m}${x ? ' — ' + x : ''}`)) : (fail++, console.log(`  ✗ ${m}${x ? ' — ' + x : ''}`)); };

const areas = generateSensitiveAreas(300);

console.log('\n=== A. 最关键不变量：线路端点与烘焙路网未被点位池改动波及 ===');
const cityLines = getAggLines('city');
ok(cityLines.length === 40, '市到市线路仍 40 条', String(cityLines.length));
const withGeom = cityLines.filter((l) => hasRealGeometry(l.id));
ok(withGeom.length === 40, '**40/40 线路仍命中已烘焙的 OSRM 真实路网**（若 <40 说明 CITIES 被误改，真实轨迹会退化成直线）', `${withGeom.length}/40`);
ok(!getRouteGeometry(cityLines[0]!).fallback, '首条线路几何非兜底');
ok(cityLines.find((l) => l.id === 'city-013')?.from === '杭州' && cityLines.find((l) => l.id === 'city-013')?.to === '大连', 'city-013 仍是 杭州→大连（与烘焙时一致）');
ok(getAggLines('province').length === 20 && getAggLines('county').length === 60 && getTop20Lines().length === 20, '省20/县60/Top20 条数不变');

console.log('\n=== B. 新基线：点位规模与全国分布 ===');
const manual = areas.filter((a) => a.source === 'manual').length;
const ai = areas.filter((a) => a.source === 'ai').length;
ok(areas.length === 300 && manual === 134 && ai === 166, '**300 / 人工134 / AI166 零漂移**（rng 消耗节奏保住了）', `${areas.length}/${manual}/${ai}`);
const lngs = areas.map((a) => a.lng), lats = areas.map((a) => a.lat);
const lngSpan = Math.max(...lngs) - Math.min(...lngs);
ok(lngSpan > 45, '经度跨度 > 45°（旧池只有 23.8°）', `${lngSpan.toFixed(1)}° (${Math.min(...lngs).toFixed(1)}~${Math.max(...lngs).toFixed(1)})`);
ok(Math.min(...lngs) < 80, '最西点位进入新疆', `最西 ${Math.min(...lngs).toFixed(2)}`);
ok(Math.min(...lats) < 21 && Math.max(...lats) > 45, '纬度覆盖 20~46', `${Math.min(...lats).toFixed(1)}~${Math.max(...lats).toFixed(1)}`);
const westCount = lngs.filter((v) => v < 100).length;
ok(westCount >= 20, '经度 <100°（西北/新疆/西藏）的点位 ≥ 20', `${westCount} 个`);
const citySet = new Set(areas.map((a) => a.region.split(' · ')[0]));
ok(citySet.size >= 70, '覆盖城市数 ≥ 70', `${citySet.size} 城`);
for (const c of ['喀什', '拉萨', '西宁', '酒泉', '鄂尔多斯']) ok(citySet.has(c), `含 ${c}`);
// 聚集度：同一 1°×1° 网格里最多多少个点（旧池会挤成坨）
const grid = new Map<string, number>();
areas.forEach((a) => { const k = `${Math.floor(a.lat)},${Math.floor(a.lng)}`; grid.set(k, (grid.get(k) ?? 0) + 1); });
const maxCell = Math.max(...grid.values());
ok(maxCell <= 25, '最密的 1°×1° 网格 ≤ 25 个点（分散度达标）', `${maxCell} 个 / 共 ${grid.size} 个网格`);

console.log('\n=== C. 碰撞结果重算后的自洽性（部分不得 > 整体）===');
const distinct = countDistinctAbnormal(areas);
console.log(`  新基线：异常运单去重 ${distinct.waybills} 单 / 涉及车辆 ${distinct.vehicles} 辆`);
ok(distinct.waybills > 0 && distinct.vehicles > 0 && distinct.vehicles <= distinct.waybills, '去重后 车辆 ≤ 运单');
const sumDetail = areas.reduce((s, a) => s + a.discovery.waybillCount, 0);
ok(distinct.waybills <= sumDetail, '去重运单 ≤ 各点位明细加总（有重叠才正常）', `${distinct.waybills} ≤ ${sumDetail}`);
const dw = areas.filter((a) => a.discovery.waybillCount > a.waybillCount);
ok(dw.length === 0, '每个点位：异常停靠 ≤ 途经总量', dw.length ? `${dw.length} 个越界` : '0 越界');
const dv = areas.filter((a) => a.discovery.vehicleCount > a.discovery.waybillCount);
ok(dv.length === 0, '每个点位：涉及车辆 ≤ 异常停靠运单', dv.length ? `${dv.length} 个越界` : '0 越界');
const abnormal = areas.map((a) => a.discovery.waybillCount);
console.log(`  异常停靠：均值 ${(abnormal.reduce((s, v) => s + v, 0) / abnormal.length).toFixed(1)} / 最小 ${Math.min(...abnormal)} / 最大 ${Math.max(...abnormal)} / 合计 ${sumDetail}`);

console.log('\n=== D. 线路↔点位对账仍成立 ===');
const stats = buildLineSensitiveMap(cityLines, areas);
let badLine = 0, badArea = 0, zeroHit = 0;
stats.forEach((st, lineId) => {
  const line = cityLines.find((l) => l.id === lineId)!;
  if (st.waybills > line.waybillCount) badLine++;
  if (st.areaCount === 0) zeroHit++;
  st.stats.forEach((s) => { if (s.waybills > s.area.discovery.waybillCount) badArea++; });
});
ok(badLine === 0, '每条线路：敏感停靠运单 ≤ 该线运单总量', badLine ? `${badLine} 条越界` : '0 越界');
ok(badArea === 0, '每个(线路,点位)对：本线运单 ≤ 点位异常停靠总量', badArea ? `${badArea} 对越界` : '0 越界');
ok(zeroHit === 0, '40 条线路全部有命中点位（不会出现点开一条线什么都没有）', `${zeroHit} 条零命中`);
const kpi = { province: 0, city: 0, county: 0 } as Record<string, number>;
(['province', 'city', 'county'] as const).forEach((dim) => {
  const ls = getAggLines(dim);
  const m = buildLineSensitiveMap(ls, areas);
  m.forEach((st) => { kpi[dim] += st.waybills; });
});
console.log(`  新基线：路线 KPI 敏感停靠 省 ${kpi.province} / 市 ${kpi.city} / 县 ${kpi.county}`);
ok(kpi.city > 0 && kpi.province > 0 && kpi.county > 0, '三个维度 KPI 均非零');
// 反向索引与正向对账一致
const rev = buildAreaLineIndex(areas);
let mismatch = 0, pairs = 0;
rev.forEach((refs, areaId) => {
  refs.filter((r) => r.mode === 'city').forEach((r) => {
    pairs++;
    const fwd = stats.get(r.line.id)?.stats.find((s) => s.area.id === areaId);
    if (!fwd || fwd.stops !== r.stops) mismatch++;
  });
});
ok(mismatch === 0, `反向索引与正向对账逐项一致`, `${pairs - mismatch}/${pairs}`);

console.log('\n=== E. 运单层跟随重算且口径仍一致 ===');
const ds = getWaybillDataset(areas);
let viol = 0, hits = 0;
ds.waybills.forEach((wb) => {
  const allowed = new Set((stats.get(wb.lineId)?.stats ?? []).map((s) => s.area.id));
  wb.hits.forEach((h) => { hits++; if (!allowed.has(h.areaId)) viol++; });
});
ok(viol === 0, `运单命中点位仍 100% ⊂ 新碰撞结果`, `${hits} 条命中 / ${viol} 越界`);
ok(ds.waybills.filter((w) => w.abnormal).length > 0, '重算后仍有异常运单', `${ds.waybills.filter((w) => w.abnormal).length}/${ds.waybills.length}`);

console.log('\n=== F. 配色：点位色族与线路三档色两两不同 ===');
// 线路三档色不在此处 import：mapShared 以值方式引了 leaflet，node 里会炸（window undefined）。
// 三档色是文档钉死的常量，改色检查放在 Python 侧直接读源码做。
const routeColors: string[] = [];
const pointColors = [MANUAL_AREA_COLOR, ...Object.values(RISK_COLOR)];
// 风险分级自洽性
const aiAreas = areas.filter((a) => a.source === 'ai');
const manAreas = areas.filter((a) => a.source === 'manual');
ok(manAreas.every((a) => a.riskLevel === null), '人工发现点位一律不定级（riskLevel = null）');
ok(aiAreas.every((a) => a.riskLevel !== null), 'AI 点位一律有等级');
const rc = { high: 0, mid: 0, low: 0 } as Record<string, number>;
aiAreas.forEach((a) => { rc[a.riskLevel!]++; });
console.log(`  风险分布: 高 ${rc.high} / 中 ${rc.mid} / 低 ${rc.low}（阈值 高≥${RISK_THRESHOLD.high} 中≥${RISK_THRESHOLD.mid}）`);
ok(rc.high > 0 && rc.mid > 0 && rc.low > 0, '三档都有点位（不会出现某一档空掉）');
ok(rc.low > rc.mid && rc.mid >= rc.high * 0.8, '呈金字塔分布（低 > 中，高不异常膨胀）');
ok(aiAreas.every((a) => (a.riskLevel === 'high') === (a.discovery.waybillCount >= RISK_THRESHOLD.high)), '分级严格由异常停靠单数决定，无越级');
ok(aiAreas.every((a) => areaPointColor(a) === RISK_COLOR[a.riskLevel!]), 'AI 点位色严格等于其风险色');
ok(manAreas.every((a) => areaPointColor(a) === MANUAL_AREA_COLOR), '人工点位色恒为 violet');
ok(pointColors.length === new Set(pointColors).size, '四个点位色彼此不同', pointColors.join(' '));
console.log('  线路三档:', routeColors.join(' '));
console.log('  点位二色:', pointColors.join(' '));
console.log('  （点位色与线路三档色的撞色检查在 Python 侧做，见输出末尾）');
const semantic = Object.values(MAP_SEMANTIC_COLOR);
const clash2 = semantic.filter((c) => pointColors.includes(c));
ok(clash2.length === 0, '语义色（起点/终点/停靠/轨迹）与点位色零重合', clash2.length ? `撞色 ${clash2}` : '');
// 起点与终点**刻意同色**（航哥：「起点和终点用两个黑色圆圈表示」），靠实心/空心环区分，不是撞色
ok(MAP_SEMANTIC_COLOR.origin === MAP_SEMANTIC_COLOR.destination && MAP_SEMANTIC_COLOR.origin === '#0f172a',
   '起终点同为黑（刻意，靠实心/空心环区分）', `${MAP_SEMANTIC_COLOR.origin}/${MAP_SEMANTIC_COLOR.destination}`);
ok(MAP_SEMANTIC_COLOR.trajectory !== MAP_SEMANTIC_COLOR.origin, '轨迹色与端点色不同');
ok(!Object.values(RISK_COLOR).includes(MAP_SEMANTIC_COLOR.origin) && MANUAL_AREA_COLOR !== MAP_SEMANTIC_COLOR.origin,
   '端点黑与四个点位色都不同');
ok(AREA_MARKER_STYLE.fillOpacity < 0.9 && AREA_MARKER_STYLE.fillOpacity > 0.6, '主点填充已调淡（0.95 → 0.75）', String(AREA_MARKER_STYLE.fillOpacity));
ok(AREA_MARKER_STYLE.haloOpacity === 0.13, '光晕已调淡（0.18 → 0.13）', String(AREA_MARKER_STYLE.haloOpacity));
ok(AREA_MARKER_STYLE.radius.base === 8, '尺寸未回退（仍是上一轮加大的 8）', String(AREA_MARKER_STYLE.radius.base));

console.log(`\n========== 通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) process.exit(1);
