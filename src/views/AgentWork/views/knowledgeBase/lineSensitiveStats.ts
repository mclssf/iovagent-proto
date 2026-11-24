import { getAggLines } from './mockData';
import type { AggDimension, AggLine, SensitiveArea } from './mockData';

/**
 * 线路 ↔ 敏感区域 关联统计
 *
 * 口径：一条聚合线路（省到省 / 市到市 / 县到县）的运单在途中产生停留事件，
 * 落在哪些敏感区域里、涉及多少运单和车辆。
 * 演示阶段用确定性种子生成（同一条线路 + 同一个点位，结果永远一致）；
 * 正式上线由 GPS 轨迹停留检测结果直接聚合，字段口径不变。
 */

export interface AreaStopStat {
  area: SensitiveArea;
  /** 该点位上的停留事件次数 */
  stops: number;
  /** 涉及运单数（一单可能停多次） */
  waybills: number;
  /** 涉及车辆数 */
  vehicles: number;
  /** 点位到线路走廊的距离（公里），用于排序与展示 */
  distanceKm: number;
}

export interface LineSensitiveStats {
  /** 命中的敏感区域个数 */
  areaCount: number;
  /** 累计停留事件次数 */
  stopEvents: number;
  /** 在敏感区域停靠过的运单数 */
  waybills: number;
  /** 涉及车辆数 */
  vehicles: number;
  /** 敏感停靠运单占该线路总运单比例 */
  waybillRatio: number;
  /** 按停留次数降序的点位明细 */
  stats: AreaStopStat[];
}

const EMPTY_STATS: LineSensitiveStats = {
  areaCount: 0,
  stopEvents: 0,
  waybills: 0,
  vehicles: 0,
  waybillRatio: 0,
  stats: [],
};

/** 走廊缓冲区上下限（米）与线路长度的比例 */
const CORRIDOR_RATIO = 0.15;
const CORRIDOR_MIN_M = 60_000;
const CORRIDOR_MAX_M = 260_000;
/** 命中点位展示上限，避免抽屉清单过长 */
const MAX_MATCH = 18;
/** 每条线路至少展示的关联点位数（Mock 点位聚簇分布，纯缓冲区会让部分线路为空） */
const MIN_MATCH = 4;
/** 每多少运单允许关联一个点位（线路越小命中点位越少，符合实际） */
const WAYBILL_PER_MATCH = 800;

/** 该线路最多关联多少个点位：随运量伸缩，夹在 [MIN_MATCH, MAX_MATCH] */
export function matchLimitFor(line: AggLine): number {
  return Math.min(MAX_MATCH, Math.max(MIN_MATCH, Math.round(line.waybillCount / WAYBILL_PER_MATCH)));
}

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG_EQUATOR = 111_320;

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 线路长度（米，球面近似） */
export function lineLengthM(line: AggLine): number {
  const toRad = Math.PI / 180;
  const dLat = (line.toLat - line.fromLat) * toRad;
  const dLng = (line.toLng - line.fromLng) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(line.fromLat * toRad) * Math.cos(line.toLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 该线路的走廊缓冲半径（米） */
export function corridorBufferM(line: AggLine): number {
  return Math.min(CORRIDOR_MAX_M, Math.max(CORRIDOR_MIN_M, lineLengthM(line) * CORRIDOR_RATIO));
}

/**
 * 点位到线路走廊的近似距离（米）
 * 等距投影后算点到线段距离，原型精度足够（用于关联判定，不做测距展示）
 */
export function corridorDistanceM(lat: number, lng: number, line: AggLine): number {
  const kx = Math.cos((((lat + line.fromLat + line.toLat) / 3) * Math.PI) / 180);
  const ax = line.fromLng * kx;
  const ay = line.fromLat;
  const bx = line.toLng * kx;
  const by = line.toLat;
  const px = lng * kx;
  const py = lat;

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return Math.hypot((px - cx) * METERS_PER_DEG_LNG_EQUATOR, (py - cy) * METERS_PER_DEG_LAT);
}

/**
 * 计算一条线路途经敏感区域的停靠情况
 * @param areas 参与统计的点位（调用方决定是否排除 ignored）
 */
export function buildLineSensitiveStats(line: AggLine, areas: SensitiveArea[]): LineSensitiveStats {
  if (areas.length === 0) return { ...EMPTY_STATS, stats: [] };

  const buffer = corridorBufferM(line);
  const withDistance = areas.map((area) => ({
    area,
    distanceKm: corridorDistanceM(area.lat, area.lng, line) / 1000,
  }));

  const inside = withDistance.filter((item) => item.distanceKm * 1000 <= buffer);
  let matched = inside;

  // 走廊内点位不足时用最近的补齐，保证每条线路都有可展示的关联结果
  if (matched.length < MIN_MATCH) {
    const insideSet = new Set(matched.map((item) => item.area.id));
    const rest = withDistance
      .filter((item) => !insideSet.has(item.area.id))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    matched = [...matched, ...rest.slice(0, MIN_MATCH - matched.length)];
  }

  matched = matched
    .slice()
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, matchLimitFor(line));

  const stats: AreaStopStat[] = matched.map(({ area, distanceKm }) => {
    const rng = mulberry32(hashString(`${line.id}|${area.id}`));
    // 离走廊越近，停靠越多
    const intensity = Math.max(0.3, 1 - distanceKm / 500);
    const base = Math.min(60, Math.max(4, Math.round(line.waybillCount / 500)));
    const stops = Math.max(2, Math.round(base * (0.4 + rng() * 1.2) * intensity));
    const waybills = Math.max(1, Math.round(stops * (0.65 + rng() * 0.3)));
    const vehicles = Math.max(1, Math.min(Math.round(waybills * (0.6 + rng() * 0.35)), line.carrierVehicleCount));
    return { area, stops, waybills, vehicles, distanceKm: Number(distanceKm.toFixed(1)) };
  });

  if (stats.length === 0) return { ...EMPTY_STATS, stats: [] };

  stats.sort((a, b) => b.stops - a.stops);

  const stopEvents = stats.reduce((sum, item) => sum + item.stops, 0);
  const waybillSum = stats.reduce((sum, item) => sum + item.waybills, 0);
  const lineRng = mulberry32(hashString(line.id));
  // 敏感停靠运单数：不超过点位明细加总，也不超过线路总运单的一定比例
  const waybills = Math.max(1, Math.min(waybillSum, Math.round(line.waybillCount * (0.03 + lineRng() * 0.12))));
  const vehicles = Math.max(
    1,
    Math.min(line.carrierVehicleCount, Math.round(waybills * (0.7 + lineRng() * 0.25))),
  );

  return {
    areaCount: stats.length,
    stopEvents,
    waybills,
    vehicles,
    waybillRatio: line.waybillCount > 0 ? waybills / line.waybillCount : 0,
    stats,
  };
}

/** 批量计算多条线路，返回 lineId → 统计（含跨线路对账） */
export function buildLineSensitiveMap(lines: AggLine[], areas: SensitiveArea[]): Map<string, LineSensitiveStats> {
  const result = new Map<string, LineSensitiveStats>();
  lines.forEach((line) => {
    result.set(line.id, buildLineSensitiveStats(line, areas));
  });
  reconcileWithAreaTotals(result, lines);
  return result;
}

/**
 * 跨线路对账（航哥规则1）
 *
 * 点位级「异常停靠 N 单」是与运单中途停靠碰撞出的**总量**；同一维度内一个运单只属于一条线路
 * （按起讫对互斥），所以各线路分到的单数之和**必须等于**该点位的总量，绝不允许出现
 * "抽屉说本线 88 单、详情说该点总共 4 单" 这种部分大于整体。
 *
 * 做法：以点位总量为上限，按原生成的运单数（已含距走廊衰减）作权重，用最大余数法分配到各线路；
 * 若命中线路数多于总量（总量太小撑不起每线至少 1 单），按权重保留前 N 条、剔除其余。
 * 停靠次数与车辆数再由分配后的运单数推导，保证 stops ≥ waybills ≥ vehicles ≥ 1。
 */
function reconcileWithAreaTotals(result: Map<string, LineSensitiveStats>, lines: AggLine[]): void {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const perArea = new Map<string, Array<{ lineId: string; stat: AreaStopStat }>>();
  result.forEach((stats, lineId) => {
    stats.stats.forEach((stat) => {
      const list = perArea.get(stat.area.id);
      if (list) list.push({ lineId, stat });
      else perArea.set(stat.area.id, [{ lineId, stat }]);
    });
  });

  const dropped = new Map<string, Set<string>>();

  perArea.forEach((entries, areaId) => {
    const cap = Math.max(1, entries[0].stat.area.discovery.waybillCount);
    const weights = entries.map((entry) => Math.max(1, entry.stat.waybills));
    const order = entries.map((_, i) => i).sort((a, b) => weights[b] - weights[a]);
    const keepCount = Math.min(entries.length, cap);
    const kept = order.slice(0, keepCount);
    const keptSet = new Set(kept);
    // 点位总量撑不起这么多线路时，剔除权重最低的（每条线路至少要能分到 1 单）
    order.forEach((idx) => {
      if (keptSet.has(idx)) return;
      const lineId = entries[idx].lineId;
      const set = dropped.get(lineId);
      if (set) set.add(areaId);
      else dropped.set(lineId, new Set([areaId]));
    });

    // 先给每条保留线路保底 1 单，再把余额按权重分配（最大余数法）。
    // 不能"先按比例分、再用 max(1, ·) 兜底"——那样权重悬殊时兜底会把总和顶过 cap，
    // 重新造出「部分 > 整体」的矛盾。
    const keepN = kept.length;
    const alloc = new Array<number>(keepN).fill(1);
    const rest = cap - keepN;
    if (rest > 0) {
      const keptWeightSum = kept.reduce((sum, i) => sum + weights[i], 0) || 1;
      const raw = kept.map((i) => (weights[i] / keptWeightSum) * rest);
      const floors = raw.map((v) => Math.floor(v));
      let remainder = rest - floors.reduce((a, b) => a + b, 0);
      const byFrac = raw
        .map((v, k) => ({ k, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac);
      for (let j = 0; j < remainder; j += 1) floors[byFrac[j % keepN].k] += 1;
      for (let k = 0; k < keepN; k += 1) alloc[k] += floors[k];
    }

    kept.forEach((origIdx, k) => {
      const entry = entries[origIdx];
      const stat = entry.stat;
      const waybills = alloc[k];
      const prng = mulberry32(hashString(`${entry.lineId}|${stat.area.id}|reconcile`));
      stat.waybills = waybills;
      // 一单可停多次：次数 ≥ 单数，倍数 1.05~2.45
      stat.stops = Math.max(waybills, Math.round(waybills * (1.05 + prng() * 1.4)));
      stat.vehicles = Math.max(1, Math.min(Math.round(waybills * (0.45 + prng() * 0.4)), waybills));
    });
  });

  // 重算线路级汇总：明细变了，加总与占比必须跟着变
  result.forEach((stats, lineId) => {
    const drop = dropped.get(lineId);
    if (drop && drop.size > 0) {
      const kept = stats.stats.filter((item) => !drop.has(item.area.id));
      // 不让任何线路被剔空（抽屉打开必须有内容）：真被剔空就保留原明细里权重最高的一条
      stats.stats = kept.length > 0 ? kept : stats.stats.slice(0, 1);
    }
    stats.stats.sort((a, b) => b.stops - a.stops || b.waybills - a.waybills);
    stats.areaCount = stats.stats.length;
    stats.stopEvents = stats.stats.reduce((sum, item) => sum + item.stops, 0);
    const sumWaybills = stats.stats.reduce((sum, item) => sum + item.waybills, 0);
    const sumVehicles = stats.stats.reduce((sum, item) => sum + item.vehicles, 0);
    // 线路级运单数 = 去重后的量：≤ 明细加总（同一单可在本线多个点位停靠），且沿用原有的占本线比例上限
    stats.waybills = Math.min(stats.waybills, sumWaybills);
    stats.vehicles = Math.min(Math.min(stats.vehicles, sumVehicles), stats.waybills);
    const line = lineById.get(lineId);
    stats.waybillRatio = line && line.waybillCount > 0 ? stats.waybills / line.waybillCount : 0;
  });
}

// ===== 反向：点位 → 关联线路 =====

/** 参与反向关联的维度（领导口径：省 / 市 / 县线路；总览是市到市的子集，不重复计） */
export const DIMENSION_GROUPS: Array<{ mode: AggDimension; dimLabel: string; lines: AggLine[] }> = [
  { mode: 'province', dimLabel: '省到省', lines: getAggLines('province') },
  { mode: 'city', dimLabel: '市到市', lines: getAggLines('city') },
  { mode: 'county', dimLabel: '县到县', lines: getAggLines('county') },
];

export interface AreaLineRef {
  line: AggLine;
  mode: AggDimension;
  dimLabel: string;
  /** 该线路在本点位上的停靠次数 */
  stops: number;
  /** 该线路涉及运单数 */
  waybills: number;
  /** 该线路涉及车辆数 */
  vehicles: number;
  /** 点位距该线路走廊的距离（公里） */
  distanceKm: number;
  /** 占该线路总运单的比例 */
  ratio: number;
}

/**
 * 反向索引：点位 id → 途经并产生停靠的线路
 *
 * 关键：**直接归集正向 buildLineSensitiveStats 的结果**，不另写一套匹配逻辑。
 * 否则同一条(线路, 点位)在"线路详情"和"点位详情"里会给出两个不同的数字，客户一眼看出矛盾。
 * 成本：120 条线路 × 点位数，300 点位实测 ~15ms，可整表缓存。
 */
export function buildAreaLineIndex(areas: SensitiveArea[]): Map<string, AreaLineRef[]> {
  const index = new Map<string, AreaLineRef[]>();

  DIMENSION_GROUPS.forEach((group) => {
    // 走 buildLineSensitiveMap（含跨线路对账），不要直接调 buildLineSensitiveStats——
    // 否则点位详情拿到的是未对账的数字，与抽屉对不上
    const grouped = buildLineSensitiveMap(group.lines, areas);
    group.lines.forEach((line) => {
      const stats = grouped.get(line.id);
      if (!stats) return;
      stats.stats.forEach((item) => {
        const ref: AreaLineRef = {
          line,
          mode: group.mode,
          dimLabel: group.dimLabel,
          stops: item.stops,
          waybills: item.waybills,
          vehicles: item.vehicles,
          distanceKm: item.distanceKm,
          ratio: line.waybillCount > 0 ? item.waybills / line.waybillCount : 0,
        };
        const list = index.get(item.area.id);
        if (list) list.push(ref);
        else index.set(item.area.id, [ref]);
      });
    });
  });

  index.forEach((list) => {
    list.sort((a, b) => b.stops - a.stops || b.waybills - a.waybills);
  });
  return index;
}

/** 单点查询（不做整表缓存时用） */
export function getAreaLineRefs(areaId: string, areas: SensitiveArea[]): AreaLineRef[] {
  return buildAreaLineIndex(areas).get(areaId) ?? [];
}
