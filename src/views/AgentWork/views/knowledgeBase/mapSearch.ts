import { getAggLines, getTop20Lines } from './mockData';
import type { AggLine, SensitiveArea } from './mockData';
import type { MapMode } from './assetMapStore';
import type { MockWaybill, WaybillDataset } from './waybillMock';

/**
 * 地图检索的纯逻辑层（路线检索 + 地点检索）
 * 不依赖 Vue，可直接跑断言；UI 组件只负责渲染与交互
 */

export interface LineGroup {
  mode: MapMode;
  dimLabel: string;
  lines: AggLine[];
}

/** Mock 线路数据是确定性的，模块加载时构建一次即可 */
export const LINE_GROUPS: LineGroup[] = [
  { mode: 'top20', dimLabel: '总览', lines: getTop20Lines() },
  { mode: 'province', dimLabel: '省到省', lines: getAggLines('province') },
  { mode: 'city', dimLabel: '市到市', lines: getAggLines('city') },
  { mode: 'county', dimLabel: '县到县', lines: getAggLines('county') },
];

export interface LineHit {
  kind: 'line';
  line: AggLine;
  mode: MapMode;
  dimLabel: string;
}

export interface AreaHit {
  kind: 'area';
  area: SensitiveArea;
}

export interface PlaceHit {
  kind: 'place';
  name: string;
  lat: number;
  lng: number;
  dimLabel: string;
}

export type SearchHit = LineHit | AreaHit | PlaceHit;

/** 单车检索命中：按车牌聚合，一车一条（航哥 20261123「加一个单车检索」） */
export interface VehicleHit {
  kind: 'vehicle';
  vehicleNo: string;
  driverName: string;
  carrier: string;
  /** 该车运单总数 */
  total: number;
  /** 其中存在异常停靠的单数 */
  abnormal: number;
}

/** 运单检索命中：一单一条 */
export interface WaybillHit {
  kind: 'waybill';
  waybill: MockWaybill;
}

export type WaybillSearchHit = VehicleHit | WaybillHit;

/** 车牌省份简称（与 waybillMock 的车牌生成保持同一套） */
const PLATE_PROVINCE_CHARS = '新甘宁蒙陕晋青冀鲁豫皖苏';

/**
 * 是否像车牌号：省简称开头 + 至少 1 位字母/数字，或纯 5 位车牌尾号。
 * 用于决定检索结果里车辆与运单的排序优先级。
 */
export function looksLikePlate(rawQuery: string): boolean {
  const q = rawQuery.trim().toUpperCase();
  if (q.length < 2) return false;
  if (PLATE_PROVINCE_CHARS.includes(q[0]!) && /^[A-Z0-9]+$/.test(q.slice(1))) return true;
  return /^[A-Z0-9]{5,6}$/.test(q);
}

/** 是否像运单号：以 YD 开头（waybillMock 的运单号前缀） */
export function looksLikeWaybillNo(rawQuery: string): boolean {
  return /^YD/i.test(rawQuery.trim());
}

export interface WaybillSearchResult {
  vehicles: VehicleHit[];
  waybills: WaybillHit[];
}

/**
 * 单车 / 运单检索（纯函数，可直接跑断言）。
 * 车牌、运单号、司机姓名三者模糊匹配；结果分两组返回，由 UI 决定展示顺序：
 * - 输入像运单号（YD 开头）→ 运单组在前
 * - 输入像车牌 → 车辆组在前
 * - 其余（如司机名）→ 车辆组在前，运单组作为补充
 * 命中上限各自独立，避免一辆车刷满整屏。
 */
export function searchWaybills(rawQuery: string, ds: WaybillDataset, limit = 6): WaybillSearchResult {
  const q = rawQuery.trim();
  if (!q) return { vehicles: [], waybills: [] };
  const up = q.toUpperCase();

  const matched = ds.waybills.filter((wb) => (
    wb.vehicleNo.toUpperCase().includes(up)
    || wb.waybillNo.toUpperCase().includes(up)
    || wb.driverName.includes(q)
  ));

  // 按车牌聚合成车辆命中
  const byVehicle = new Map<string, MockWaybill[]>();
  matched.forEach((wb) => {
    const list = byVehicle.get(wb.vehicleNo);
    if (list) list.push(wb);
    else byVehicle.set(wb.vehicleNo, [wb]);
  });
  const vehicles: VehicleHit[] = [...byVehicle.entries()]
    .map(([vehicleNo, list]) => ({
      kind: 'vehicle' as const,
      vehicleNo,
      driverName: list[0]!.driverName,
      carrier: list[0]!.carrier,
      total: list.length,
      abnormal: list.filter((wb) => wb.abnormal).length,
    }))
    // 车牌前缀精确匹配的排前面，其次按异常单数降序
    .sort((a, b) => {
      const ap = a.vehicleNo.toUpperCase().startsWith(up) ? 0 : 1;
      const bp = b.vehicleNo.toUpperCase().startsWith(up) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.abnormal - a.abnormal || a.vehicleNo.localeCompare(b.vehicleNo);
    })
    .slice(0, limit);

  const waybills: WaybillHit[] = matched
    .slice()
    // 运单号前缀精确匹配的排前面，其次按发运时间倒序（最近的在前）
    .sort((a, b) => {
      const ap = a.waybillNo.toUpperCase().startsWith(up) ? 0 : 1;
      const bp = b.waybillNo.toUpperCase().startsWith(up) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.departTs - a.departTs;
    })
    .slice(0, limit)
    .map((waybill) => ({ kind: 'waybill' as const, waybill }));

  return { vehicles, waybills };
}

/** 拆「A到B」「A→B」「A->B」这类起讫对 */
export function splitPair(text: string): [string, string] | null {
  const parts = text
    .split(/(?:→|->|=>|到|至)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length >= 2 ? [parts[0]!, parts[1]!] : null;
}

/**
 * 城市 → 省份
 * Mock 线路的「省到省」维度端点存的是城市名（长沙→郑州 实际代表 湖南→河南），
 * 没有这张表，用户在省-省视图里搜「河南」会零结果。
 */
const CITY_PROVINCE: Record<string, string> = {
  上海: '上海', 北京: '北京', 天津: '天津', 重庆: '重庆',
  乌鲁木齐: '新疆', 兰州: '甘肃', 银川: '宁夏', 西安: '陕西', 太原: '山西', 石家庄: '河北',
  呼和浩特: '内蒙古', 沈阳: '辽宁', 大连: '辽宁', 长春: '吉林', 哈尔滨: '黑龙江',
  南京: '江苏', 苏州: '江苏', 无锡: '江苏', 杭州: '浙江', 宁波: '浙江', 温州: '浙江',
  合肥: '安徽', 福州: '福建', 厦门: '福建', 泉州: '福建', 南昌: '江西', 济南: '山东', 青岛: '山东',
  郑州: '河南', 武汉: '湖北', 长沙: '湖南', 广州: '广东', 深圳: '广东', 佛山: '广东',
  南宁: '广西', 成都: '四川', 贵阳: '贵州', 昆明: '云南',
};

/** 省份简称 → 省名 */
const PROVINCE_SHORT: Record<string, string> = {
  京: '北京', 津: '天津', 冀: '河北', 晋: '山西', 蒙: '内蒙古', 辽: '辽宁', 吉: '吉林', 黑: '黑龙江',
  沪: '上海', 苏: '江苏', 浙: '浙江', 皖: '安徽', 闽: '福建', 赣: '江西', 鲁: '山东', 豫: '河南',
  鄂: '湖北', 湘: '湖南', 粤: '广东', 桂: '广西', 琼: '海南', 渝: '重庆', 川: '四川', 蜀: '四川',
  黔: '贵州', 贵: '贵州', 滇: '云南', 藏: '西藏', 陕: '陕西', 秦: '陕西', 甘: '甘肃', 陇: '甘肃',
  青: '青海', 宁: '宁夏', 新: '新疆',
};

const PROVINCE_NAMES = new Set([
  ...new Set(Object.values(CITY_PROVINCE)),
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽',
  '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
]);

/** 查询词指向哪个省：河南省 / 河南 / 豫 都归一到「河南」，不是省名则返回空 */
export function queryProvince(raw: string): string {
  const q = raw.trim();
  if (!q) return '';
  const stripped = q.replace(/(?:维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市)$/, '');
  if (PROVINCE_NAMES.has(stripped)) return stripped;
  return PROVINCE_SHORT[stripped] ?? '';
}

/**
 * 端点匹配：先按城市名比（精度优先），再按省名比（记为「包含」档）
 * 县到县的端点是区县名，表里没有 → 省名查询不会误命中县级线路
 */
function endpointScore(endpoint: string, needle: string): number {
  const direct = matchScore(endpoint.toLowerCase(), needle);
  if (direct >= 0) return direct;
  // 查省名（河南 / 河南省 / 豫）→ 命中该省的市级端点
  const province = queryProvince(needle);
  if (province && CITY_PROVINCE[endpoint] === province) return 2;
  // 查城市名（长沙 / 长沙市）→ 命中其所属省的省级端点（省-省线路显示的是省名）
  const cityProvince = CITY_PROVINCE[needle] ?? CITY_PROVINCE[needle.replace(/市$/, '')];
  if (cityProvince && endpoint === cityProvince) return 3;
  return -1;
}

/** 0 = 完全相等，1 = 前缀匹配，2 = 包含，-1 = 不匹配 */
export function matchScore(haystack: string, needle: string): number {
  if (!needle) return -1;
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  if (haystack.includes(needle)) return 2;
  return -1;
}

function bestOf(scores: number[]): number {
  const valid = scores.filter((score) => score >= 0);
  return valid.length > 0 ? Math.min(...valid) : -1;
}

function lineMatches(line: AggLine, q: string, pair: [string, string] | null): number {
  const from = line.from;
  const to = line.to;
  if (pair) {
    const a = pair[0].toLowerCase();
    const b = pair[1].toLowerCase();
    // 正向（A→B）与反向（B→A）都算命中，取更优的一档
    const forward = bestOf([endpointScore(from, a) >= 0 && endpointScore(to, b) >= 0 ? Math.max(endpointScore(from, a), endpointScore(to, b)) : -1]);
    const backward = bestOf([endpointScore(from, b) >= 0 && endpointScore(to, a) >= 0 ? Math.max(endpointScore(from, b), endpointScore(to, a)) : -1]);
    return bestOf([forward, backward]);
  }
  return bestOf([endpointScore(from, q), endpointScore(to, q)]);
}

/** 路线检索：按匹配精度优先，同档按运单量降序 */
export function searchLines(
  rawQuery: string,
  mode?: MapMode,
  limit = 8,
): { hits: LineHit[]; total: number } {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return { hits: [], total: 0 };
  const pair = splitPair(q);

  const scored: Array<LineHit & { score: number }> = [];
  let total = 0;

  LINE_GROUPS.forEach((group) => {
    // 总览 Top20 没有检索框，且它是省-省线路的子集，参与检索只会产生重复结果与跨分区跳转
    if (group.mode === 'top20') return;
    // **检索范围必须限定在当前维度**：省到省只出省到省、市到市只出市到市、县到县只出县到县。
    // 不限定会出现"在省到省输入『广』却搜出广州→温州"这种跨维度串结果（航哥实测报的 bug）
    if (mode && group.mode !== mode) return;
    group.lines.forEach((line) => {
      const score = lineMatches(line, q, pair);
      if (score < 0) return;
      total += 1;
      scored.push({ kind: 'line', line, mode: group.mode, dimLabel: group.dimLabel, score });
    });
  });

  const hits = scored
    .sort((a, b) => a.score - b.score || b.line.waybillCount - a.line.waybillCount)
    .slice(0, limit)
    .map(({ kind, line, mode, dimLabel }) => ({ kind, line, mode, dimLabel }));

  return { hits, total };
}

/** 敏感区域检索：名称 / 所属区域 / 详细地址 任一命中；已忽略点位不出现在检索结果 */
export function searchAreas(rawQuery: string, areas: SensitiveArea[], limit = 6): AreaHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  return areas
    .filter((area) => area.status !== 'ignored')
    .filter((area) =>
      bestOf([
        matchScore(area.name.toLowerCase(), q),
        matchScore(area.region.toLowerCase(), q),
        matchScore(area.address.toLowerCase(), q),
      ]) >= 0,
    )
    .slice(0, limit)
    .map((area) => ({ kind: 'area' as const, area }));
}

/** 地名词典：从线路端点提取（自带坐标），并记录它出现在哪些维度 */
export function buildGazetteer(): Map<string, { lat: number; lng: number; dims: Set<string> }> {
  const dict = new Map<string, { lat: number; lng: number; dims: Set<string> }>();
  LINE_GROUPS.forEach((group) => {
    group.lines.forEach((line) => {
      const endpoints: Array<[string, number, number]> = [
        [line.from, line.fromLat, line.fromLng],
        [line.to, line.toLat, line.toLng],
      ];
      endpoints.forEach(([name, lat, lng]) => {
        const existed = dict.get(name);
        if (existed) existed.dims.add(group.dimLabel);
        else dict.set(name, { lat, lng, dims: new Set([group.dimLabel]) });
      });
    });
  });
  return dict;
}

/** 地点检索：定位到城市 / 区县中心 */
export function searchPlaces(rawQuery: string, limit = 6): PlaceHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const dict = buildGazetteer();
  const hits: Array<PlaceHit & { score: number }> = [];
  dict.forEach((value, name) => {
    const score = matchScore(name.toLowerCase(), q);
    if (score < 0) return;
    hits.push({
      kind: 'place',
      name,
      lat: value.lat,
      lng: value.lng,
      dimLabel: [...value.dims].join('/'),
      score,
    });
  });
  return hits
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length)
    .slice(0, limit)
    .map(({ kind, name, lat, lng, dimLabel }) => ({ kind, name, lat, lng, dimLabel }));
}
