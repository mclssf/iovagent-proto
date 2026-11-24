/**
 * 运单 / 车辆 Mock 数据层（航哥 20261123：敏感区域要支持「运单」查看 + 单车检索）
 *
 * 设计约束：
 * 1. **确定性**：全部由 lineId / 车牌 派生种子，刷新不跳动（与项目其他 mock 同口径）。
 * 2. **不另造一套数字**：每单命中的敏感点位，取自 lineSensitiveStats 的真实碰撞结果，
 *    是「该线路命中点位集合」的子集 → 与线路视角、点位详情三处口径天然一致。
 * 3. **抽样而非全量**：每条线路只生成 6~16 单明细。线路级「异常停靠 N 单」是碰撞模型的
 *    聚合结果（可达数百单），明细列表只是其中最近的若干单，界面必须标注为「明细抽样」，
 *    绝不能让 N 单 = 明细行数，否则一加总就对不上（航哥对数据自洽零容忍）。
 * 4. **轨迹是真实路网**：运单视角复用该线路烘焙好的 OSRM 道路几何，
 *    再叠加每单独立的小幅横向偏移（同走廊内的车道级/备选路差异），
 *    所以同线路不同运单的轨迹形状相近但不完全重合。
 */
import { areaDisplayName, getAggLines } from './mockData';
import type { AggLine, SensitiveArea } from './mockData';
import { buildLineSensitiveMap } from './lineSensitiveStats';
import { getRouteGeometry, offsetPath, pointsForDistance, resamplePath } from './trajectoryMock';

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
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

// ===== 车辆 =====

/** 车牌省份简称：覆盖西北煤炭干线与全国主要货运省份 */
const PLATE_PROVINCES = ['新', '甘', '宁', '蒙', '陕', '晋', '青', '冀', '鲁', '豫', '皖', '苏'] as const;
const PLATE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'K', 'L', 'M', 'N'] as const;
const PLATE_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const DRIVER_SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '马', '朱', '胡', '郭', '何', '高', '林', '罗', '郑'] as const;
const DRIVER_GIVENS = ['建军', '志刚', '海涛', '文军', '国强', '永强', '振华', '春生', '德才', '学军', '卫东', '宝山', '小龙', '宏伟', '立新'] as const;

const CARRIER_TYPES = ['物流有限公司', '运输有限公司', '供应链管理有限公司', '货运有限公司'] as const;
const CARRIER_PREFIX = ['宏运', '昌盛', '通达', '鑫源', '恒泰', '瑞丰', '中兴', '远大', '华泰', '金石'] as const;

export interface MockVehicle {
  /** 车牌号（重卡黄牌），如 新A5K217 */
  vehicleNo: string;
  driverName: string;
  /** 承运企业 */
  carrier: string;
  /** 近 30 天趟次 */
  trips: number;
  /** 车牌颜色（航哥 20261123 要求运单列表展示）：12 吨以上重卡以黄牌为主，新能源重卡为黄绿双拼牌 */
  plateColor: string;
}

/**
 * 车牌颜色**由车牌号哈希派生，不消耗 rng**。
 * ⚠️ 绝不能改成 `pick(rng, ...)`：`buildVehicles` 的 rng 序列一旦被多消耗一次，
 * 后面 160 辆车的司机名/承运企业/趟次全部错位，587 单运单跟着全漂，probe 基线全部作废。
 */
const PLATE_COLOR_POOL = ['黄色', '黄色', '黄色', '黄色', '黄色', '黄色', '黄绿双拼色'] as const;
export function plateColorOf(vehicleNo: string): string {
  return PLATE_COLOR_POOL[hashStr(vehicleNo) % PLATE_COLOR_POOL.length]!;
}

const VEHICLE_COUNT = 160;

function buildVehicles(): MockVehicle[] {
  const rng = mulberry32(hashStr('vehicles:v1'));
  const list: MockVehicle[] = [];
  const used = new Set<string>();
  for (let i = 0; i < VEHICLE_COUNT; i += 1) {
    // 车牌不允许重复，最多重试 20 次（12×12×32^4 空间足够，实际几乎不碰撞）
    let no = '';
    for (let k = 0; k < 20; k += 1) {
      const prov = pick(rng, PLATE_PROVINCES);
      const letter = pick(rng, PLATE_LETTERS);
      let tail = '';
      for (let j = 0; j < 5; j += 1) tail += PLATE_CHARS[Math.floor(rng() * PLATE_CHARS.length)];
      no = `${prov}${letter}${tail}`;
      if (!used.has(no)) break;
    }
    used.add(no);
    list.push({
      vehicleNo: no,
      driverName: `${pick(rng, DRIVER_SURNAMES)}${pick(rng, DRIVER_GIVENS)}`,
      carrier: `${pick(rng, CARRIER_PREFIX)}${pick(rng, CARRIER_TYPES)}`,
      trips: 1 + Math.floor(rng() * 14),
      plateColor: plateColorOf(no), // 哈希派生，不动 rng
    });
  }
  return list;
}

// ===== 运单 =====

/** 发货点 / 收货点名称后缀：大宗煤炭干线的典型企业形态 */
const ORIGIN_SUFFIX = ['煤业发运站', '能源装车站', '矿业集运站', '焦化发运点', '露天矿发运场'] as const;
const DEST_SUFFIX = ['电厂', '煤化工产业园', '能源储配中心', '热电有限公司', '煤化工业园'] as const;

export interface WaybillAreaHit {
  areaId: string;
  areaName: string;
  /** 到达该点位时间戳（秒） */
  arriveTs: number;
  /** 停留分钟数（≥ 该点位停留阈值才算异常停靠） */
  stayMin: number;
}

/**
 * 结束停靠时间 = 开始停靠 + 停留时长。
 * 航哥 20261123 要求浮窗同时给「开始停靠时间 / 结束停靠时间 / 停靠时长」，
 * 三者必须自洽（结束 − 开始 == 时长），所以**只存两个原始量、第三个派生**，
 * 不要各存一份——存三份迟早对不上，而航哥对数据自洽零容忍。
 */
export function hitDepartTs(hit: WaybillAreaHit): number {
  return hit.arriveTs + hit.stayMin * 60;
}

export interface MockWaybill {
  /** 运单号，如 YD20251108-000123 */
  waybillNo: string;
  /** 所属市到市线路 id */
  lineId: string;
  from: string;
  to: string;
  /** 发货点（厂/站）全称 */
  originName: string;
  /** 收货点（厂/园）全称 */
  destName: string;
  vehicleNo: string;
  driverName: string;
  carrier: string;
  /** 车牌颜色（取自车辆档案） */
  plateColor: string;
  /** 发运时间戳（秒） */
  departTs: number;
  /** 到达时间戳（秒） */
  arriveTs: number;
  /** 行驶里程（公里，真实路网里程 ± 小幅绕行） */
  distanceKm: number;
  /** 装载吨位 */
  loadWeightT: number;
  /** 命中的敏感点位（该线路命中集合的子集） */
  hits: WaybillAreaHit[];
  /** 是否存在异常停靠（hits 非空） */
  abnormal: boolean;
}

/** 每条线路生成的明细单数：随运量伸缩，夹在 6~16（抽样展示，不是全量） */
export function waybillsPerLine(line: AggLine): number {
  return Math.max(6, Math.min(16, Math.round(6 + (line.waybillCount / 3000) * 10)));
}

const T0 = 1_762_000_000; // 约 2025-11-01，作为「近 30 天」窗口右端

export interface WaybillDataset {
  lines: AggLine[];
  vehicles: MockVehicle[];
  waybills: MockWaybill[];
  /** lineId → 该线路的明细运单 */
  byLine: Map<string, MockWaybill[]>;
  /** vehicleNo → 该车的运单（跨线路） */
  byVehicle: Map<string, MockWaybill[]>;
  /** waybillNo → 运单 */
  byNo: Map<string, MockWaybill>;
}

let cache: WaybillDataset | null = null;

/**
 * 构建运单/车辆数据集（懒生成 + 全局缓存）。
 * 40 条市到市线路 × 6~16 单 ≈ 450 单，构建耗时毫秒级。
 */
export function getWaybillDataset(areas: SensitiveArea[]): WaybillDataset {
  if (cache) return cache;

  const lines = getAggLines('city');
  const vehicles = buildVehicles();
  const lineStats = buildLineSensitiveMap(lines, areas);

  const waybills: MockWaybill[] = [];
  const byLine = new Map<string, MockWaybill[]>();
  const byVehicle = new Map<string, MockWaybill[]>();
  const byNo = new Map<string, MockWaybill>();

  let seq = 0;
  lines.forEach((line) => {
    const rng = mulberry32(hashStr('wb:' + line.id));
    const stats = lineStats.get(line.id);
    // 该线路的命中点位池（碰撞模型产出）——明细单只能从这里取，保证口径一致
    const pool = stats?.stats ?? [];
    const geom = getRouteGeometry(line);
    const baseKm = geom.distanceM / 1000;
    const n = waybillsPerLine(line);
    const originName = `${line.from}${pick(rng, ORIGIN_SUFFIX)}`;
    const destName = `${line.to}${pick(rng, DEST_SUFFIX)}`;

    const lineWaybills: MockWaybill[] = [];
    for (let i = 0; i < n; i += 1) {
      // 车辆按线路粘性分配：同一辆车多次跑同一条线（大宗干线常态），也允许跨线复用
      const vIdx = (hashStr(line.id) + i * 7) % vehicles.length;
      const veh = vehicles[vIdx]!;

      seq += 1;
      const dayOffset = Math.floor(rng() * 28);
      const departTs = T0 - dayOffset * 86400 - Math.floor(rng() * 86400);
      // 实际运输时长：均速 55~70km/h + 途中休息（每天约 800km 上限口径）
      const avgKmh = 55 + rng() * 15;
      const driveHours = baseKm / avgKmh;
      const restHours = Math.max(0, Math.floor(driveHours / 8)) * (2 + rng() * 3);
      const arriveTs = departTs + Math.round((driveHours + restHours) * 3600);
      // 里程：真实路网里程 ± 3% 绕行
      const distanceKm = Math.round(baseKm * (0.98 + rng() * 0.05));

      /*
       * 命中点位：约 55% 的运单存在异常停靠，命中数取自该线路命中池。
       *
       * ⚠️ **命中数分布 20261124 放宽为长尾**（航哥：「不是每个运单都会途经好几个异常点，
       * 它有可能会途经十几个异常点」）。原实现写死 1~3，实测 324 单里 100% ≤3 处 ——
       * 那样列表行"最多列 3 个"的截断规则**永远触发不到**，功能写了也验不出来、客户也看不见。
       * 现改为：62% 落在 1~3、26% 落在 4~7、12% 落在 8~13，符合干线重卡"多数单少量途经、
       * 少数长途单密集途经"的真实形态。
       */
      const hits: WaybillAreaHit[] = [];
      if (pool.length > 0 && rng() < 0.55) {
        const roll = rng();
        const rawCount = roll < 0.62 ? 1 + Math.floor(rng() * 3)
          : roll < 0.88 ? 4 + Math.floor(rng() * 4)
            : 8 + Math.floor(rng() * 6);
        const hitCount = Math.max(1, Math.min(pool.length, rawCount));
        /*
         * 用**洗牌取前 N** 而不是"随机 + 线性探测"：探测法带 `guard < 12` 上限，
         * 命中数放大到 13 且池子较小时会频繁触顶 break，导致实际命中数**静默少于** hitCount
         * ——分布就失真了，而且失真程度依赖 guard 常量，极难排查。
         * Fisher-Yates 洗牌保证恰好取到 hitCount 个不重复下标。
         */
        const idxBag = pool.map((_, i) => i);
        for (let i = idxBag.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rng() * (i + 1));
          const tmp = idxBag[i]!; idxBag[i] = idxBag[j]!; idxBag[j] = tmp;
        }
        for (const idx of idxBag.slice(0, hitCount)) {
          const stat = pool[idx]!;
          // 停留时长围绕该点位的停留阈值分布：阈值以上才算异常停靠
          const threshold = stat.area.stayThresholdMin || 10;
          const stayMin = Math.round(threshold + rng() * threshold * 2.2);
          // 到达时刻落在运输途中（不含首尾 8%，避免"还没发车就停靠"）
          const span = arriveTs - departTs;
          const arriveAt = departTs + Math.round(span * (0.08 + rng() * 0.84));
          hits.push({
            areaId: stat.area.id,
            // 存**显示名**而非原始 name：无名点位回退到地址（航哥 20261123）。
            // 在这一处修，途经敏感点 chip、敏感区域停靠行、点位名摘要全部自动生效，
            // 不必在每个渲染点各写一遍回退逻辑。
            areaName: areaDisplayName(stat.area),
            arriveTs: arriveAt,
            stayMin,
          });
        }
        hits.sort((a, b) => a.arriveTs - b.arriveTs);
      }

      const ymd = new Date(departTs * 1000);
      const dateStr = `${ymd.getFullYear()}${String(ymd.getMonth() + 1).padStart(2, '0')}${String(ymd.getDate()).padStart(2, '0')}`;
      const wb: MockWaybill = {
        waybillNo: `YD${dateStr}-${String(seq).padStart(6, '0')}`,
        lineId: line.id,
        from: line.from,
        to: line.to,
        originName,
        destName,
        vehicleNo: veh.vehicleNo,
        plateColor: veh.plateColor,
        driverName: veh.driverName,
        carrier: veh.carrier,
        departTs,
        arriveTs,
        distanceKm,
        loadWeightT: Math.round((30 + rng() * 19) * 10) / 10,
        hits,
        abnormal: hits.length > 0,
      };
      waybills.push(wb);
      lineWaybills.push(wb);
      byNo.set(wb.waybillNo, wb);
      const vList = byVehicle.get(wb.vehicleNo);
      if (vList) vList.push(wb);
      else byVehicle.set(wb.vehicleNo, [wb]);
    }
    // 明细列表按发运时间倒序（最近的在前）
    lineWaybills.sort((a, b) => b.departTs - a.departTs);
    byLine.set(line.id, lineWaybills);
  });

  byVehicle.forEach((list) => list.sort((a, b) => b.departTs - a.departTs));
  // 全部运单按发运时间倒序，供「运单」视角默认列表使用
  waybills.sort((a, b) => b.departTs - a.departTs);

  cache = { lines, vehicles, waybills, byLine, byVehicle, byNo };
  return cache;
}

/** 测试/热更换数据后重置缓存 */
export function resetWaybillCache() {
  cache = null;
}

// ===== 查询辅助 =====
// 一律显式传 dataset：不用模块级可变全局绑定，避免"谁先调谁后调"的隐式时序依赖。

/** 按运单号精确查（大小写与首尾空格不敏感） */
export function getWaybillByNo(ds: WaybillDataset, no: string): MockWaybill | undefined {
  return ds.byNo.get(no.trim().toUpperCase());
}

/** 某辆车的运单（跨线路），按发运时间倒序 */
export function waybillsOfVehicle(ds: WaybillDataset, vehicleNo: string): MockWaybill[] {
  return ds.byVehicle.get(vehicleNo.trim().toUpperCase()) ?? [];
}

// ===== 轨迹 =====

const pathCache = new Map<string, Array<[number, number]>>();

/**
 * 某运单的行驶轨迹（GCJ-02 坐标串）。
 * 取该线路烘焙好的真实路网几何，按运单派生的小幅偏移（0.6~4km，随里程档位）生成，
 * 同线路不同运单形状相近但不重合——真实场景里同一走廊内的车道级/备选路差异。
 */
export function buildWaybillPath(wb: MockWaybill, line: AggLine, samplePoints = 220): Array<[number, number]> {
  const key = wb.waybillNo;
  const cached = pathCache.get(key);
  if (cached) return cached;

  const geom = getRouteGeometry(line);
  const n = Math.min(samplePoints, Math.max(60, pointsForDistance(geom.distanceM)));
  const base = resamplePath(geom.coords, n);
  const d0Km = geom.distanceM / 1000;
  const offsetKm = d0Km < 50 ? 0.6 : d0Km < 200 ? 1.4 : d0Km < 500 ? 2.6 : 4;
  const rng = mulberry32(hashStr('path:' + wb.waybillNo));
  const path = offsetPath(base, offsetKm, rng);
  pathCache.set(key, path);
  return path;
}

// ===== 展示格式 =====

export function formatTs(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`;
}
