/**
 * Mock 轨迹生成器：基于烘焙好的真实道路几何（routeGeometries.json）派生 N 条车辆轨迹，
 * 喂给 trajectoryAgg.ts 的五步流水线。
 *
 * 设计要点：
 * · **确定性**：以 lineId 做种子，刷新不跳动（项目铁律）
 * · **懒生成**：只在选中某条线路时生成该线路的轨迹池并缓存，40 条线路不一次性铺开
 * · **刻意掺入各类异常**，让五个剔除原因都能在界面上看到真实条数：
 *   点数不足 / 超速 / 直线跳变 / 超时长 / 超 D_max，以及未定位点、漂移点、信号空洞
 * · **主走廊 + 备选走廊**两种走向，让相似度分组能分出 2~3 组
 * · 命中敏感点位的数字**不在这里算**：仍走 lineSensitiveStats（已做跨线路对账），
 *   避免同一指标两处算法导致跨视图对不上（指标铁律 14）
 */
import type { AggLine } from './mockData';
import type { RawTrajectory, TrajPoint } from './trajectoryAgg';
import geometryData from './routeGeometries.json';

/** 烘焙产物：lineId → { c: 扁平 [lng,lat,...] (GCJ-02), d: 米, t: 秒, n: 抽稀前点数 } */
const GEOM = (geometryData as { lines: Record<string, { c: number[]; d: number; t: number; n: number }> }).lines;

export interface RouteGeometry {
  /** GCJ-02 坐标串 */
  coords: Array<[number, number]>;
  /** OSRM 实际道路里程（米） */
  distanceM: number;
  /** OSRM 实际驾驶时长（秒） */
  durationS: number;
  /** 抽稀前的原始轨迹点数 */
  rawPointCount: number;
  /** 是否为兜底生成的折线（true = 该线路没取到真实路网） */
  fallback: boolean;
}

/** mulberry32：与项目其他 mock 一致的确定性伪随机 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const rad = (d: number) => (d * Math.PI) / 180;
function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 无真实路网时的兜底：起终点间插若干途经点的折线（离线也能演示，形状不如真路网） */
function fallbackCoords(line: AggLine, rng: () => number): Array<[number, number]> {
  const n = 40;
  const out: Array<[number, number]> = [];
  const dLat = line.toLat - line.fromLat, dLng = line.toLng - line.fromLng;
  const L = Math.hypot(dLat, dLng) || 1;
  const nx = -dLng / L, ny = dLat / L;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const bend = Math.sin(Math.PI * f) * (0.06 + rng() * 0.05);
    out.push([line.fromLng + dLng * f + nx * bend, line.fromLat + dLat * f + ny * bend]);
  }
  return out;
}

const cache = new Map<string, RouteGeometry>();

/** 取某条线路的真实道路几何（懒加载 + 缓存） */
export function getRouteGeometry(line: AggLine): RouteGeometry {
  const hit = cache.get(line.id);
  if (hit) return hit;
  const baked = GEOM[line.id];
  let g: RouteGeometry;
  if (baked && baked.c.length >= 4) {
    const coords: Array<[number, number]> = [];
    for (let i = 0; i < baked.c.length; i += 2) coords.push([baked.c[i], baked.c[i + 1]]);
    g = { coords, distanceM: baked.d, durationS: baked.t, rawPointCount: baked.n, fallback: false };
  } else {
    const rng = mulberry32(hashStr(line.id));
    const coords = fallbackCoords(line, rng);
    let d = 0;
    for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    g = { coords, distanceM: d, durationS: (d / 1000 / 65) * 3600, rawPointCount: coords.length, fallback: true };
  }
  cache.set(line.id, g);
  return g;
}

/** 沿几何等距重采样为 n 个点（返回 [lng,lat]） */
export function resamplePath(coords: Array<[number, number]>, n: number): Array<[number, number]> {
  if (coords.length < 2) return coords.slice();
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]));
  }
  const total = cum[cum.length - 1] || 1;
  const out: Array<[number, number]> = [];
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (seg < cum.length - 1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1] || 1;
    const t = Math.max(0, Math.min(1, (target - cum[seg - 1]) / span));
    const a = coords[seg - 1], b = coords[seg];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * 给路径叠加横向偏移（模拟走备选国道/省道，或同走廊内的车道级差异）。
 *
 * **随机系数必须每次调用只抽一次，不能在 map 里逐点抽**：
 * 逐点抽会让相邻点的偏移量在 0.75~1.25 倍之间乱跳，路径变成高频锯齿——
 * 偏移 38km 时实测里程从 1891km 暴涨到 19598km，备选走廊的轨迹全被异常过滤剔除，
 * 结果只剩主走廊一个分组、两两相似度恒为 1.00（分组规则形同虚设）。
 *
 * 形状用两个谐波叠加：sin(πf) 主鼓包 + sin(2πf+φ) 次级起伏，两端收敛到 0
 * （起讫是同一个工厂/场站，不可能偏移）。同走廊内的轨迹因此相似度落在 0.9+ 而非恒等 1。
 */
export function offsetPath(path: Array<[number, number]>, km: number, rng: () => number): Array<[number, number]> {
  if (km === 0 || path.length < 8) return path;
  const degPerKm = 1 / 111;
  const n = path.length;
  const a1 = km * (0.75 + rng() * 0.5);
  const a2 = km * (0.08 + rng() * 0.22);
  const phase = rng() * Math.PI * 2;

  const normals = smoothNormals(path);

  /**
   * 偏移只作用在中段 [RAMP, 1-RAMP]，两端用升余弦锥形淡入淡出。
   *
   * 必须限定区段：像「杭州→大连」这种绕渤海湾的线路本身有地理级 U 形转弯，
   * 全程垂直偏移 55km 在转弯处必然自交，实测产生 114km 的相邻跳变，
   * 整条轨迹被规则②.3 误杀，40 条线路因此塌成 1 个分组。
   * 收敛到中段 + 锥形过渡后，相邻点位移被摊平到公里级。
   */
  const RAMP = 0.18;
  const raw = path.map((p, i) => {
    const f = i / (n - 1);
    const taper = f < RAMP ? 0.5 - 0.5 * Math.cos((Math.PI * f) / RAMP)
      : f > 1 - RAMP ? 0.5 - 0.5 * Math.cos((Math.PI * (1 - f)) / RAMP)
      : 1;
    const g = (f - RAMP) / (1 - 2 * RAMP);
    const shape = taper * (Math.sin(Math.PI * Math.max(0, Math.min(1, g))) * a1
      + Math.sin(2 * Math.PI * Math.max(0, Math.min(1, g)) + phase) * a2);
    return [p[0] + normals[i][0] * shape * degPerKm, p[1] + normals[i][1] * shape * degPerKm] as [number, number];
  });

  // 结果再平滑一遍：兜住任何残留的方向突变（端点保持不动，起讫点必须精确）
  const SW = 4;
  return raw.map((p, i) => {
    if (i < SW || i >= n - SW) return p;
    let sx = 0, sy = 0, c = 0;
    for (let k = i - SW; k <= i + SW; k++) { sx += raw[k][0]; sy += raw[k][1]; c++; }
    return [sx / c, sy / c] as [number, number];
  });
}

/**
 * 平滑法向：窗口内首尾连线求切向再取法向。
 * 真实路网在路口掉头/环形交叉/轮渡段有尖点与近重复点，用相邻两点求切向时分母趋零
 * → 法向爆炸翻转 → 大偏移量下产生百公里级跳变，轨迹被规则②.3 误杀。
 * 窗口取 n/60（约 30km 路段）能压掉尖点，又不至于把弯道抹平。退化段沿用上一个法向。
 */
function smoothNormals(path: Array<[number, number]>): Array<[number, number]> {
  const n = path.length;
  const W = Math.max(3, Math.floor(n / 60));
  const out: Array<[number, number]> = [];
  let last: [number, number] = [0, 0];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - W), hi = Math.min(n - 1, i + W);
    const dLng = path[hi][0] - path[lo][0], dLat = path[hi][1] - path[lo][1];
    const L = Math.hypot(dLng, dLat);
    if (L < 1e-9) { out.push(last); continue; }
    last = [-dLat / L, dLng / L];
    out.push(last);
  }
  return out;
}

/**
 * 叠加高频锯齿噪声，让里程增加 extraRatio 但**不产生大跳变**。
 * 用于构造规则④「较长轨迹」的异常样本——真实场景就是中途私自绕路 / 多点装卸。
 *
 * 为什么不用大鼓包：平滑鼓包加的里程 ≈ 0.5π²A²/S，要让 1891km 的线路增加 20%
 * 需要 A≈295km 的横向偏移，地理上荒谬且会在 U 形转弯处自交。
 * 高频噪声则用「斜率」换里程：每点横向位移 = k × 点间距，k=1.118 时里程 ×1.5，
 * 而单点位移只有几公里，相邻跳变仍在 5km 量级。
 */
function addDetourNoise(
  path: Array<[number, number]>,
  rng: () => number,
  extraRatio: number,
  noisyFrac = 0.5,
): Array<[number, number]> {
  const n = path.length;
  if (n < 20) return path;
  // 只在中间 noisyFrac 区段加噪，两端保持精确起讫
  const lo = Math.floor(n * (1 - noisyFrac) / 2), hi = n - lo;
  const seg = hi - lo;
  // 需要的斜率 k：(1-φ) + φ·√(1+k²) = 1+extraRatio
  const k = Math.sqrt(Math.max(0.01, ((extraRatio + noisyFrac) / noisyFrac) ** 2 - 1));
  const wave = 10 + Math.floor(rng() * 6);       // 波长（点数）
  const phase = rng() * Math.PI * 2;
  const normals = smoothNormals(path);
  // 点间距（度）——用区段内平均
  let stepDeg = 0;
  for (let i = lo + 1; i < hi; i++) stepDeg += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  stepDeg /= Math.max(1, seg - 1);
  const ampDeg = (k * stepDeg * wave) / (2 * Math.PI);   // 振幅 = k·λ/2π
  return path.map((p, i) => {
    if (i <= lo || i >= hi) return p;
    const local = (i - lo) / seg;
    const taper = 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, local * 4 > 1 ? (local < 0.5 ? local * 2 : (1 - local) * 2) : 1) / 2);
    const off = Math.sin((2 * Math.PI * (i - lo)) / wave + phase) * ampDeg * Math.min(1, taper * 1.6);
    return [p[0] + normals[i][0] * off, p[1] + normals[i][1] * off] as [number, number];
  });
}

/** 异常类型：决定这条轨迹会被哪条规则剔除（或降级完整率） */
type Flaw =
  | 'none'          // 干净轨迹
  | 'few_points'    // ②.1 点数不足
  | 'overspeed'     // ②.2 均速过高
  | 'gps_jump'      // ②.3 中段缺点造成 ≥50km 跨度
  | 'over_duration' // ③ 超折算时长
  | 'over_detour'   // ④ 绕行超 D_max
  | 'hole'          // 信号空洞 → 完整率下降（不被剔除）
  | 'unlocated'     // 含未定位点 → 清洗掉（不被剔除）
  | 'drift';        // 含漂移点 → 清洗掉（不被剔除）

const FLAW_PLAN: Flaw[] = [
  'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none',
  'hole', 'hole', 'unlocated', 'drift',
  'few_points', 'overspeed', 'gps_jump', 'over_duration', 'over_detour',
];

export interface TrajectoryPoolMeta {
  lineId: string;
  from: string;
  to: string;
  /** 原始轨迹条数（① 初步选取结果） */
  rawCount: number;
  trajectories: RawTrajectory[];
}

const poolCache = new Map<string, TrajectoryPoolMeta>();

/**
 * 生成某条线路的原始轨迹池。
 * 条数随运单量伸缩：运单多的线路跑车次多，轨迹样本也多（8~26 条）。
 */
/**
 * 每条轨迹的采样点数按里程缩放，目标约 **1 点 / 3km**（夹在 60~900）。
 *
 * 不能写死 120 点：3478km 的线路 120 点 = 每点间隔 29km，随便掉一个点（未定位/漂移清洗）
 * 就产生 58km 的相邻跨度，被规则②.3「拉直线距离 ≥ 50km」误判成信号跳变——
 * 实测写死 120 点时 gps_jump 剔除 213 条（真实异常只有 53 条），存活率被压到 60%。
 * 真实车载终端 10~30 秒一个点，长途线路点数本就是几千量级；这里按 3km/点 折中，
 * 单条线路懒生成，26 条 × ≤900 点 ≈ 2.3 万点，聚合耗时仍是毫秒级。
 */
export function pointsForDistance(distanceM: number): number {
  return Math.max(60, Math.min(900, Math.round(distanceM / 3000)));
}

export function generateTrajectoryPool(line: AggLine, pointsPerTraj?: number): TrajectoryPoolMeta {
  const cached = poolCache.get(line.id);
  if (cached) return cached;

  const rng = mulberry32(hashStr('traj:' + line.id));
  const geom = getRouteGeometry(line);
  const nPoints = pointsPerTraj ?? pointsForDistance(geom.distanceM);
  const rawCount = Math.max(8, Math.min(26, Math.round(8 + (line.waybillCount / 4000) * 18)));

  // 主走廊与备选走廊（备选偏移量按里程区间取，保证落在相似度阈值之外成为独立分组）
  const d0Km = geom.distanceM / 1000;
  // 备选走廊偏移量：必须**显著超过**相似度容差（300/800/2000/4000m），否则分不出第二组
  const altOffsetKm = d0Km < 50 ? 3 : d0Km < 200 ? 8 : d0Km < 500 ? 20 : 34;
  const basePath = resamplePath(geom.coords, nPoints);
  const altPath = offsetPath(basePath, altOffsetKm, rng);

  // 实际运输时长：均速 55~75km/h + 途中休息
  const baseHours = geom.distanceM / 1000 / (55 + rng() * 20) + (d0Km > 400 ? 2 + rng() * 2 : 0.5);

  const trajectories: RawTrajectory[] = [];
  for (let i = 0; i < rawCount; i++) {
    const flaw = FLAW_PLAN[i % FLAW_PLAN.length];
    // 约 1/3 走备选走廊，形成第二个分组
    const useAlt = rng() < 0.33;
    const path = useAlt ? altPath : basePath;
    // 每条轨迹叠加 60~250m 的 GPS 抖动，避免完全重合导致相似度恒为 1
    const jitterKm = 0.06 + rng() * 0.19;
    const jittered = offsetPath(path, jitterKm, rng);

    let hours = baseHours * (0.9 + rng() * 0.2);
    let n = nPoints;
    let pts = jittered;
    let tStart = T0_BASE + Math.floor(rng() * 86400 * 20);

    switch (flaw) {
      case 'few_points': n = 6 + Math.floor(rng() * 3); pts = resamplePath(jittered, n); break;
      case 'overspeed': hours = geom.distanceM / 1000 / (170 + rng() * 90); break;
      case 'over_duration': hours = (geom.distanceM / 1000 / KM_PER_DAY_H) * 24 * (1.35 + rng() * 0.4); break;
      case 'over_detour': pts = addDetourNoise(path, rng, detourKFor(geom.distanceM / 1000) - 1 + 0.12 + rng() * 0.18); break;
      default: break;
    }

    const points: TrajPoint[] = [];
    for (let k = 0; k < pts.length; k++) {
      const f = pts.length > 1 ? k / (pts.length - 1) : 0;
      points.push({ lng: pts[k][0], lat: pts[k][1], ts: tStart + Math.round(f * hours * 3600), located: true });
    }

    // ②.3 直线跳变：挖掉中段若干点，使相邻保留点跨度 ≥50km
    if (flaw === 'gps_jump' && points.length > 20) {
      const cut = Math.max(4, Math.floor(points.length * 0.3));
      const at = Math.floor(points.length * 0.35);
      points.splice(at, cut);
    }
    // 信号空洞：把某点之后的时间戳整体后移，制造覆盖缺口（不触发剔除，只降完整率）
    if (points.length > 20) {
      const medianGap = (hours * 3600) / (points.length - 1);
      // 明显空洞（flaw==='hole'）：完整率掉到 70~90%
      // 轻度空洞（其余轨迹**几乎都有**）：真实车载 GPS 在隧道/山区/地库必然丢点，
      //   完整率 100% 是假的；留 8% 的轨迹不注空洞，让"取完整率最高"仍有区分度
      const heavy = flaw === 'hole';
      if (heavy || rng() < 0.92) {
        const at = Math.floor(points.length * (0.25 + rng() * 0.5));
        const shift = Math.round(medianGap * (heavy ? 8 + rng() * 14 : 2.2 + rng() * 6));
        for (let k = at; k < points.length; k++) points[k].ts += shift;
      }
    }
    // 未定位点：随机 3~6 个
    if (flaw === 'unlocated') {
      const cnt = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < cnt; k++) {
        const at = 1 + Math.floor(rng() * (points.length - 2));
        points[at].located = false;
      }
    }
    // 漂移点：插入 1~2 个瞬移点
    if (flaw === 'drift' && points.length > 10) {
      const cnt = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < cnt; k++) {
        const at = 2 + Math.floor(rng() * (points.length - 4));
        points.splice(at, 0, {
          lng: points[at].lng + 0.6 + rng() * 0.6,
          lat: points[at].lat + 0.6 + rng() * 0.6,
          ts: points[at].ts + 1,
          located: true,
        });
      }
    }

    trajectories.push({
      id: `${line.id}-T${String(i + 1).padStart(2, '0')}`,
      vehicleId: `V${String(hashStr(line.id + i) % 90000 + 10000)}`,
      from: line.from,
      to: line.to,
      points,
    });
  }

  const meta: TrajectoryPoolMeta = { lineId: line.id, from: line.from, to: line.to, rawCount, trajectories };
  poolCache.set(line.id, meta);
  return meta;
}

const T0_BASE = 1_760_000_000; // 2025-10-09 前后
const KM_PER_DAY_H = 800;

/** 与 trajectoryAgg.detourK 同口径（此处内联避免循环依赖） */
function detourKFor(d0Km: number): number {
  if (d0Km < 50) return 1.8;
  if (d0Km < 200) return 1.5;
  if (d0Km < 500) return 1.3;
  return 1.2;
}

/** 该线路是否取到了真实路网几何（界面可标注数据来源） */
export function hasRealGeometry(lineId: string): boolean {
  return !!GEOM[lineId];
}

export const GEOMETRY_LINE_IDS = Object.keys(GEOM);
