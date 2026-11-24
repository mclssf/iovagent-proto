/**
 * 一次性烘焙脚本（不进产物、不被 UI 引用）：
 * 从 OSRM 公共路由服务取 40 条市到市线路的真实道路几何 →
 * Douglas-Peucker 抽稀 → WGS-84 转 GCJ-02（对齐高德底图）→ 写入 routeGeometries.json
 *
 * 运行时不依赖外部服务：产物是静态 JSON。
 */
import { getAggLines } from './src/views/AgentWork/views/knowledgeBase/mockData';
import { writeFileSync } from 'node:fs';

// ---------- WGS-84 → GCJ-02（火星坐标），对齐高德栅格底图 ----------
const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;
function outOfChina(lng: number, lat: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function tLat(x: number, y: number) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}
function tLng(x: number, y: number) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}
function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = tLat(lng - 105.0, lat - 35.0);
  let dLng = tLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

// ---------- Douglas-Peucker 抽稀 ----------
function perpDist(p: number[], a: number[], b: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function dp(points: number[][], eps: number): number[][] {
  if (points.length <= 2) return points;
  let maxD = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left = dp(points.slice(0, idx + 1), eps);
    const right = dp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}
/** 迭代调 eps，把点数收敛到 target 附近 */
function simplifyTo(points: number[][], target: number): number[][] {
  let lo = 0, hi = 1.0, best = points;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const r = dp(points, mid);
    if (r.length > target) { lo = mid; best = r; } else { hi = mid; best = r; }
    if (Math.abs(r.length - target) <= 6) return r;
  }
  return best;
}

// ---------- 主流程 ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = './src/views/AgentWork/views/knowledgeBase/routeGeometries.json';
const TARGET_POINTS = 220;

async function fetchRoute(lng1: number, lat1: number, lng2: number, lat2: number, attempt = 0): Promise<any | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const d: any = await res.json();
    if (d.code === 'Ok' && d.routes?.[0]) return d.routes[0];
    if (attempt < 2) { await sleep(3000 * (attempt + 1)); return fetchRoute(lng1, lat1, lng2, lat2, attempt + 1); }
    return null;
  } catch {
    if (attempt < 2) { await sleep(3000 * (attempt + 1)); return fetchRoute(lng1, lat1, lng2, lat2, attempt + 1); }
    return null;
  }
}

async function main() {
  const lines = getAggLines('city');
  console.log(`市到市线路 ${lines.length} 条，开始取真实路网几何…`);
  const out: Record<string, { c: number[]; d: number; t: number; n: number }> = {};
  let ok = 0, fail = 0;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const t0 = Date.now();
    const r = await fetchRoute(L.fromLng, L.fromLat, L.toLng, L.toLat);
    if (!r) { fail++; console.log(`  [${i + 1}/${lines.length}] ✗ ${L.from}→${L.to} 取数失败（稍后用种子折线兜底）`); await sleep(800); continue; }
    const raw: number[][] = r.geometry.coordinates;
    // 先转 GCJ-02 再抽稀（抽稀在目标坐标系下做，误差才可控）
    const gcj = raw.map((p) => wgs84ToGcj02(p[0], p[1]));
    const simp = simplifyTo(gcj, TARGET_POINTS);
    // 扁平化 + 5 位小数（约 1m 精度），大幅压缩体积
    const flat: number[] = [];
    for (const p of simp) { flat.push(Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5); }
    out[L.id] = { c: flat, d: Math.round(r.distance), t: Math.round(r.duration), n: raw.length };
    ok++;
    console.log(`  [${i + 1}/${lines.length}] ✓ ${L.from}→${L.to}  ${(r.distance / 1000).toFixed(0)}km  ${raw.length}→${simp.length}点  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await sleep(1200);
  }
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: 'OSRM public router (WGS-84) → GCJ-02, Douglas-Peucker simplified', lines: out }));
  const bytes = JSON.stringify({ lines: out }).length;
  console.log(`\n完成：成功 ${ok} / 失败 ${fail}，写入 ${OUT}（${(bytes / 1024).toFixed(0)} KB）`);
}
main();
