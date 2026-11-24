/**
 * 车辆轨迹聚合算法（航哥 20261120 口述规则，1:1 实现）
 *
 * 纯函数模块，无 Vue 依赖，可用 esbuild 打包后在 node 里跑断言。
 *
 * 五步流水线：
 *   ① 初步选取   取相同起点→相同终点的全部轨迹
 *   ② 异常过滤   点数 / 均速 / 直线跳变 / 未定位点 / 漂移点
 *   ③ 超长时长   按 24h 跑 800km 折算上限
 *   ④ 较长轨迹   D_max = D0 × K（K 按 D0 里程区间取）
 *   ⑤ 相似度分组 → 选代表轨迹
 *
 * ⚠️ 口述规则里有几处口径需要明确，本文件的取法（改动请先与航哥确认）：
 *   · **D0 = 同起讫轨迹的「基准里程」= 通过②③筛选后各条实际里程的中位数**，不是起讫直线距离。
 *     原因（实测）：真实路网的公路里程普遍是起讫直线距离的 1.15~1.4 倍（杭州→大连须绕渤海湾，达 1.95 倍），
 *     若 D0 取直线距离，K=1.2 会比现实更紧，40 条市到市线路中 **20 条会一条轨迹都留不下、界面全空**。
 *     取基准里程后 K 表原样可用，规则④ 回归其本义：在同一起讫的轨迹里筛掉绕行异常的那几条。
 *   · 规则②.3「拉直线距离 ≥ 50km」按**轨迹级**判定：清洗后仍存在相邻点直线跨度 ≥50km
 *     → 视为信号长时间丢失，整条剔除。（点级漂移另由 ②.4 处理）
 *   · 规则②.4「漂移点」判定：与前一有效点的瞬时速度 > 150km/h → 该点作废
 *   · 轨迹完整率 = 连续可信片段覆盖的时长 / 首末点总时长（采样间隔按 30s，
 *     相邻点间隔 > 3 倍采样间隔视为"空洞"不计入覆盖）
 *   · 规则⑤ 的里程区间同样按 D0（基准里程）划分，与规则④ 一致
 *   · 因 D0 依赖整池里程，规则④ 必须**两遍扫描**：先跑 ②③ 得到存活集 → 取中位数为 D0 → 再判 ④
 */

/** 原始轨迹点 */
export interface TrajPoint {
  lng: number;
  lat: number;
  /** Unix 秒 */
  ts: number;
  /** 是否成功定位；false = 未定位点，按规则②.4 剔除 */
  located: boolean;
}

/** 一条原始轨迹（同一车辆一次运输） */
export interface RawTrajectory {
  id: string;
  vehicleId: string;
  /** 起点名（如「某工厂」） */
  from: string;
  to: string;
  points: TrajPoint[];
}

export type RejectReason =
  | 'few_points'      // ②.1 轨迹点 < 10
  | 'overspeed'       // ②.2 平均速度 ≥ 150km/h
  | 'gps_jump'        // ②.3 相邻点拉直线距离 ≥ 50km
  | 'over_duration'   // ③ 超过 24h/800km 折算时长
  | 'over_detour';    // ④ 里程 > D_max

export interface TrajMetrics {
  /** 清洗后的有效点数 */
  pointCount: number;
  /** 累计行驶里程（米） */
  mileageM: number;
  /** 起讫拉直线距离 D0（米） */
  straightM: number;
  /** 清洗后相邻点最大直线跨度（米） */
  maxJumpM: number;
  /** 平均速度 km/h = 里程 / 时长 */
  avgSpeedKmh: number;
  /** 首末点时长（小时） */
  durationH: number;
  /** 规则③ 允许的最大时长（小时）= 里程 / 800 × 24 */
  allowedDurationH: number;
  /** 起讫拉直线距离（米），仅诊断用 */
  /** 绕行比 = 实际里程 / 起讫直线距离（仅作诊断，规则④ 不用它） */
  detourRatio: number;
  /** 轨迹完整率 0~1 */
  completeness: number;
  /** 被剔除的未定位点数 */
  droppedUnlocated: number;
  /** 被剔除的漂移点数 */
  droppedDrift: number;
}

export interface ScoredTrajectory {
  traj: RawTrajectory;
  metrics: TrajMetrics;
  /** 清洗后的点序列（已剔除未定位点与漂移点） */
  clean: TrajPoint[];
}

export interface TrajGroup {
  index: number;
  members: ScoredTrajectory[];
  /** 组内平均轨迹完整率 */
  avgCompleteness: number;
  /** 组内代表轨迹（完整率最高，其次里程最短） */
  representative: ScoredTrajectory;
}

export interface AggregateResult {
  from: string;
  to: string;
  /** ① 初步选取：同起讫的原始轨迹条数 */
  rawCount: number;
  kept: ScoredTrajectory[];
  rejected: Array<{ traj: RawTrajectory; reason: RejectReason; metrics: TrajMetrics }>;
  /** 各原因剔除条数 */
  byReason: Record<RejectReason, number>;
  groups: TrajGroup[];
  /** ⑤ 最终选出的代表轨迹；无可用轨迹时为 null */
  representative: ScoredTrajectory | null;
  /** 代表轨迹所属组的条数 */
  representativeGroupSize: number;
  /** 基准里程 D0（米）= 第一遍存活集里程中位数 */
  d0BaselineM: number;
  /** 规则④ 容忍系数 K（按 D0 区间取） */
  kFactor: number;
  /** 规则④ 上限 D_max = D0 × K（米） */
  dMaxM: number;
  stats: {
    droppedUnlocated: number;
    droppedDrift: number;
    /** 相似度阈值（按 D0 区间取） */
    similarityThreshold: number;
    /** 相似度比对容差（米，按 D0 区间取） */
    similarityToleranceM: number;
  };
}

// ==================== 常量（航哥给定） ====================

/** ②.1 最少轨迹点数 */
export const MIN_POINTS = 10;
/** ②.2 平均速度上限 km/h（含等号即剔除） */
export const MAX_AVG_SPEED_KMH = 150;
/** ②.3 相邻点拉直线距离上限（米） */
export const MAX_JUMP_M = 50_000;
/** ②.4 漂移点判定：瞬时速度绝对下限 km/h */
export const DRIFT_SPEED_KMH = 150;
/**
 * ②.4 漂移点判定：相对离群倍数。实际阈值 = max(DRIFT_SPEED_KMH, 本轨迹相邻段瞬时速度中位数 × 此倍数)。
 *
 * 为什么不能只用绝对阈值：整条轨迹真的超速时（如均速 300km/h），每个点相对前一点都 >150km/h
 * → 全部被判漂移剔光 → 最终报 few_points 而不是 overspeed，规则②.2 永远触发不了，
 * 界面上的剔除原因分布也就失真了。改成相对离群后：持续高速 = 中位数本身就高 = 不算漂移，
 * 交给 ②.2 判；孤立瞬移 = 远超中位数 = 漂移，由 ②.4 剔点。两条规则各管各的。
 */
export const DRIFT_OUTLIER_FACTOR = 3;
/** ③ 折算基准：每天 24 小时跑 800 公里 */
export const KM_PER_DAY = 800;
/** GPS 标称采样间隔（秒），完整率空洞判定的下限基准 */
export const SAMPLE_INTERVAL_S = 30;
/** 相邻点间隔超过 N 倍「本轨迹采样节奏」视为空洞 */
export const HOLE_FACTOR = 3;

/** ④ 里程区间容忍系数 K（按 D0 划分） */
export function detourK(d0M: number): number {
  const km = d0M / 1000;
  if (km < 50) return 1.8;        // 短途：市区限行多、装卸点在郊区，频繁绕行
  if (km < 200) return 1.5;       // 中途：国道施工、高速限重，绕行省道
  if (km < 500) return 1.3;       // 长途：绕服务区、避超限检测点
  return 1.2;                     // 超长途：路线固定，绕低价油服务区
}

/** ⑤ 里程区间相似度阈值（按 D0 划分） */
export function similarityThreshold(d0M: number): number {
  const km = d0M / 1000;
  if (km <= 50) return 0.85;      // 短途：可选路线少，高阈值筛非刻意绕路
  if (km <= 200) return 0.75;     // 中途：2-3 条主干路备选
  if (km <= 500) return 0.65;     // 长途：服务区停靠、拥堵绕行
  return 0.60;                    // 超长途：跨区域路网选择极多
}

/** 相似度比对的容差（米），按 D0 区间取——长途允许的横向偏差更大 */
export function similarityToleranceM(d0M: number): number {
  const km = d0M / 1000;
  if (km <= 50) return 300;
  if (km <= 200) return 800;
  if (km <= 500) return 2000;
  return 4000;
}

// ==================== 几何工具 ====================

const R_EARTH = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** 两点球面距离（米） */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 折线累计里程（米） */
export function polylineM(points: Array<{ lat: number; lng: number }>): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineM(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return sum;
}

/** 点到线段的垂距（米），等距投影近似 */
export function pointToSegmentM(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  const kx = Math.cos(rad(pLat));
  const px = pLng * kx, py = pLat;
  const ax = aLng * kx, ay = aLat;
  const bx = bLng * kx, by = bLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const degPerM = 1 / ((R_EARTH * Math.PI) / 180);
  return Math.hypot((px - cx) * kx, py - cy) / degPerM;
}

/** 等距重采样为 n 个点（按里程均分），用于相似度比对 */
export function resample(points: TrajPoint[], n: number): Array<[number, number]> {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => [points[0].lng, points[0].lat]);
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineM(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng));
  }
  const total = cum[cum.length - 1];
  const out: Array<[number, number]> = [];
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (seg < cum.length - 1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1] || 1;
    const t = Math.max(0, Math.min(1, (target - cum[seg - 1]) / span));
    const a = points[seg - 1], b = points[seg];
    out.push([a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t]);
  }
  return out;
}

// ==================== ② 清洗与度量 ====================

/**
 * 清洗点序列：剔除未定位点与漂移点。
 * 漂移点 = 与上一个保留点的瞬时速度 > DRIFT_SPEED_KMH。
 */
export function cleanPoints(points: TrajPoint[]): {
  clean: TrajPoint[];
  droppedUnlocated: number;
  droppedDrift: number;
  /** 本轨迹的漂移判定阈值 km/h = max(150, 中位数 × DRIFT_OUTLIER_FACTOR) */
  driftLimitKmh: number;
} {
  const located = points.filter((p) => p.located);
  // 先求本轨迹的「正常节奏」：相邻已定位段瞬时速度的中位数
  const segSpeeds: number[] = [];
  for (let i = 1; i < located.length; i++) {
    const dtH = (located[i].ts - located[i - 1].ts) / 3600;
    if (dtH <= 0) continue;
    segSpeeds.push(haversineM(located[i - 1].lat, located[i - 1].lng, located[i].lat, located[i].lng) / 1000 / dtH);
  }
  const driftLimitKmh = Math.max(DRIFT_SPEED_KMH, median(segSpeeds) * DRIFT_OUTLIER_FACTOR);

  const clean: TrajPoint[] = [];
  let droppedUnlocated = 0;
  let droppedDrift = 0;
  for (const p of points) {
    if (!p.located) { droppedUnlocated++; continue; }
    const prev = clean[clean.length - 1];
    if (prev) {
      const dtH = (p.ts - prev.ts) / 3600;
      const dM = haversineM(prev.lat, prev.lng, p.lat, p.lng);
      // dt<=0 视为时间戳异常，按漂移处理
      const speed = dtH > 0 ? dM / 1000 / dtH : Infinity;
      if (speed > driftLimitKmh) { droppedDrift++; continue; }
    }
    clean.push(p);
  }
  return { clean, droppedUnlocated, droppedDrift, driftLimitKmh };
}

/**
 * 轨迹完整率：连续可信片段覆盖时长 / 首末点总时长。
 *
 * 空洞阈值必须**自适应本轨迹的采样节奏**：取相邻间隔中位数 × HOLE_FACTOR，
 * 并以标称间隔 SAMPLE_INTERVAL_S × HOLE_FACTOR 兜底取大。
 * 写死 30s×3=90s 的话，任何采样间隔大于 90s 的轨迹每段都被判空洞、完整率恒为 0，
 * 后续「完整率最高的组/轨迹」这类选代表规则会全部退化成空转（实测踩过）。
 */
export function completenessOf(clean: TrajPoint[]): number {
  if (clean.length < 2) return 0;
  const total = clean[clean.length - 1].ts - clean[0].ts;
  if (total <= 0) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < clean.length; i++) {
    const g = clean[i].ts - clean[i - 1].ts;
    if (g > 0) gaps.push(g);
  }
  if (gaps.length === 0) return 0;
  const holeLimit = Math.max(SAMPLE_INTERVAL_S * HOLE_FACTOR, median(gaps) * HOLE_FACTOR);
  let covered = 0;
  for (const g of gaps) if (g <= holeLimit) covered += g;
  return Math.max(0, Math.min(1, covered / total));
}

/** 计算一条轨迹的全部度量 */
export function metricsOf(traj: RawTrajectory): { metrics: TrajMetrics; clean: TrajPoint[] } {
  const { clean, droppedUnlocated, droppedDrift } = cleanPoints(traj.points);
  const pointCount = clean.length;
  const mileageM = polylineM(clean);
  const first = clean[0], last = clean[clean.length - 1];
  const straightM = first && last ? haversineM(first.lat, first.lng, last.lat, last.lng) : 0;
  let maxJumpM = 0;
  for (let i = 1; i < clean.length; i++) {
    const d = haversineM(clean[i - 1].lat, clean[i - 1].lng, clean[i].lat, clean[i].lng);
    if (d > maxJumpM) maxJumpM = d;
  }
  const durationH = first && last ? Math.max(0, (last.ts - first.ts) / 3600) : 0;
  const avgSpeedKmh = durationH > 0 ? mileageM / 1000 / durationH : 0;
  return {
    metrics: {
      pointCount,
      mileageM,
      straightM,
      maxJumpM,
      avgSpeedKmh,
      durationH,
      allowedDurationH: (mileageM / 1000 / KM_PER_DAY) * 24,
      detourRatio: straightM > 0 ? mileageM / straightM : 0,
      completeness: completenessOf(clean),
      droppedUnlocated,
      droppedDrift,
    },
    clean,
  };
}

/** 第一遍：②③ 判定（不依赖整池，可单条判）。返回 null 表示通过 */
export function rejectReasonOf(m: TrajMetrics): RejectReason | null {
  if (m.pointCount < MIN_POINTS) return 'few_points';
  if (m.avgSpeedKmh >= MAX_AVG_SPEED_KMH) return 'overspeed';
  if (m.maxJumpM >= MAX_JUMP_M) return 'gps_jump';
  if (m.durationH > m.allowedDurationH) return 'over_duration';
  return null;
}

/**
 * 第二遍：④ 较长轨迹过滤。
 * @param d0BaselineM 同起讫基准里程（第一遍存活集的里程中位数）
 * 基准里程为 0（存活集为空）时不做该过滤。
 */
export function detourRejectReasonOf(m: TrajMetrics, d0BaselineM: number): RejectReason | null {
  if (d0BaselineM <= 0) return null;
  return m.mileageM > d0BaselineM * detourK(d0BaselineM) ? 'over_detour' : null;
}

// ==================== ⑤ 相似度与分组 ====================

const RESAMPLE_N = 64;

/**
 * 轨迹相似度：双向最近邻命中率取均值。
 * 各自等距重采样到 64 点，统计 A 的点在容差内能落到 B 上的比例，反向同理，取平均。
 */
export function trajectorySimilarity(
  a: TrajPoint[],
  b: TrajPoint[],
  toleranceM: number,
): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ra = resample(a, RESAMPLE_N);
  const rb = resample(b, RESAMPLE_N);
  const hit = (from: Array<[number, number]>, to: Array<[number, number]>) => {
    let n = 0;
    for (const p of from) {
      let best = Infinity;
      for (let i = 1; i < to.length; i++) {
        const d = pointToSegmentM(p[1], p[0], to[i - 1][1], to[i - 1][0], to[i][1], to[i][0]);
        if (d < best) best = d;
        if (best <= toleranceM) break;
      }
      if (best <= toleranceM) n++;
    }
    return n / from.length;
  };
  return (hit(ra, rb) + hit(rb, ra)) / 2;
}

/**
 * 贪心单链分组：按输入顺序与已有组的代表比对，达阈值即入组，否则新建组。
 * 输入顺序固定 → 结果确定（不依赖随机）。
 */
export function groupBySimilarity(items: ScoredTrajectory[], d0M: number): TrajGroup[] {
  const threshold = similarityThreshold(d0M);
  const tolerance = similarityToleranceM(d0M);
  const groups: TrajGroup[] = [];
  for (const it of items) {
    let placed = false;
    for (const g of groups) {
      if (trajectorySimilarity(g.representative.clean, it.clean, tolerance) >= threshold) {
        g.members.push(it);
        // 代表按「完整率最高 → 里程最短」实时更新，保证后续比对基准稳定
        g.representative = pickBest(g.members);
        g.avgCompleteness = avg(g.members.map((m) => m.metrics.completeness));
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push({
        index: groups.length,
        members: [it],
        avgCompleteness: it.metrics.completeness,
        representative: it,
      });
    }
  }
  return groups;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** 组内选代表：完整率最高；并列取里程最短 */
export function pickBest(members: ScoredTrajectory[]): ScoredTrajectory {
  return [...members].sort(
    (a, b) =>
      b.metrics.completeness - a.metrics.completeness ||
      a.metrics.mileageM - b.metrics.mileageM,
  )[0];
}

/**
 * 选最终代表组：① 条数最多 → ② 并列取平均完整率最高 → ③ 再并列取组内代表里程最短
 */
export function pickRepresentativeGroup(groups: TrajGroup[]): TrajGroup | null {
  if (groups.length === 0) return null;
  return [...groups].sort(
    (a, b) =>
      b.members.length - a.members.length ||
      b.avgCompleteness - a.avgCompleteness ||
      a.representative.metrics.mileageM - b.representative.metrics.mileageM,
  )[0];
}

// ==================== 主入口 ====================

/**
 * ① 初步选取：从轨迹池里取「相同起点 → 相同终点」的全部轨迹
 */
export function selectByOd(pool: RawTrajectory[], from: string, to: string): RawTrajectory[] {
  return pool.filter((t) => t.from === from && t.to === to);
}

/**
 * 跑完整五步流水线。
 * @param pool     全部原始轨迹
 * @param from/to  起讫名（须与轨迹上的 from/to 完全一致）
 */
export function aggregateTrajectories(
  pool: RawTrajectory[],
  from: string,
  to: string,
): AggregateResult {
  const selected = selectByOd(pool, from, to);
  const kept: ScoredTrajectory[] = [];
  const rejected: AggregateResult['rejected'] = [];
  const byReason: Record<RejectReason, number> = {
    few_points: 0, overspeed: 0, gps_jump: 0, over_duration: 0, over_detour: 0,
  };
  let droppedUnlocated = 0;
  let droppedDrift = 0;

  // 第一遍：②③ 逐条判定，得到存活集
  const stage1: ScoredTrajectory[] = [];
  for (const traj of selected) {
    const { metrics, clean } = metricsOf(traj);
    droppedUnlocated += metrics.droppedUnlocated;
    droppedDrift += metrics.droppedDrift;
    const reason = rejectReasonOf(metrics);
    if (reason) { byReason[reason]++; rejected.push({ traj, reason, metrics }); continue; }
    stage1.push({ traj, metrics, clean });
  }

  // D0 = 存活集实际里程的中位数（基准里程）。用中位数而非均值：对少量绕行异常稳健
  const d0BaselineM = median(stage1.map((s) => s.metrics.mileageM));
  const kFactor = detourK(d0BaselineM);
  const dMaxM = d0BaselineM * kFactor;

  // 第二遍：④ 较长轨迹过滤
  for (const s of stage1) {
    if (detourRejectReasonOf(s.metrics, d0BaselineM)) {
      byReason.over_detour++;
      rejected.push({ traj: s.traj, reason: 'over_detour', metrics: s.metrics });
    } else {
      kept.push(s);
    }
  }

  // ⑤ 相似度分组：阈值与容差同按基准里程 D0 取
  const groups = d0BaselineM > 0 ? groupBySimilarity(kept, d0BaselineM) : [];
  const winGroup = pickRepresentativeGroup(groups);

  return {
    from,
    to,
    rawCount: selected.length,
    kept,
    rejected,
    byReason,
    groups,
    representative: winGroup ? winGroup.representative : null,
    representativeGroupSize: winGroup ? winGroup.members.length : 0,
    /** 基准里程 D0（第一遍存活集的里程中位数），规则④⑤ 的区间都按它划分 */
    d0BaselineM,
    /** 规则④ 容忍系数与上限 */
    kFactor,
    dMaxM,
    stats: {
      droppedUnlocated,
      droppedDrift,
      similarityThreshold: similarityThreshold(d0BaselineM),
      similarityToleranceM: similarityToleranceM(d0BaselineM),
    },
  };
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 剔除原因中文标签（界面用） */
export const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  few_points: `轨迹点 < ${MIN_POINTS} 个`,
  overspeed: `平均速度 ≥ ${MAX_AVG_SPEED_KMH} km/h`,
  gps_jump: `相邻点直线距离 ≥ ${MAX_JUMP_M / 1000} km`,
  over_duration: `超过 ${KM_PER_DAY} km/24h 折算时长`,
  over_detour: '里程超过 D_max = 基准里程 D0 × K',
};
