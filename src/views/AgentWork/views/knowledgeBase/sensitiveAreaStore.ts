// 敏感区域点位共享状态（响应式单例，非 pinia）
// 作用：对话框录入的点位与知识库页展示的点位共用同一份数据，录入后立即可见
import { computed, reactive } from 'vue';

import { AREA_TYPE_PRESET, DISCOVERY_RULES, buildAreaDiscovery, deriveRiskLevel, generateSensitiveAreas, mockReverseGeocode } from './mockData';
import type { AreaSource, AreaType, SensitiveArea } from './mockData';

const SEED_COUNT = 300;

/** 新录入点位的默认途经运单量级（真实系统由轨迹碰撞得出，原型阶段给固定量级） */
const DEFAULT_NEW_AREA_PASS_THROUGH = 1200;

export const sensitiveAreaState = reactive({
  areas: generateSensitiveAreas(SEED_COUNT) as SensitiveArea[],
  seq: 0,
});

/**
 * 按来源统计点位数量（人工发现 / AI识别）。
 * 确认机制已下线（航哥 20261123）：不再有「待确认 / 已忽略」分档，全部点位入库即生效，
 * 所以这里只按来源二分，两者之和恒等于点位总数。
 */
export const areaSourceCount = computed(() => ({
  manual: sensitiveAreaState.areas.filter((a) => a.source === 'manual').length,
  ai: sensitiveAreaState.areas.filter((a) => a.source === 'ai').length,
}));

export interface NewAreaInput {
  name: string;
  lat: number;
  lng: number;
  radiusM?: number;
  areaType?: AreaType;
  /** 停留阈值（分钟），0 = 不适用；不传则按类型默认 */
  stayThresholdMin?: number;
  /** 录入来源：text 对话框 / file Excel·CSV 附件（写入发现溯源） */
  origin?: 'text' | 'file';
  remark?: string;
  source?: AreaSource;
  waybillCount?: number;
  evidence?: string;
}

function todayLabel() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function nextId() {
  sensitiveAreaState.seq += 1;
  return `SA${String(SEED_COUNT + sensitiveAreaState.seq).padStart(4, '0')}`;
}

/** 坐标近似相等（约 0.1 米级）视为同一点位 */
function isSameSpot(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
}

export function findAreaByCoord(lat: number, lng: number) {
  return sensitiveAreaState.areas.find((area) => isSameSpot(area, { lat, lng }));
}

/** 新增或更新点位；重复坐标转更新（对齐方案第 4 节幂等口径） */
export function upsertSensitiveArea(input: NewAreaInput): { area: SensitiveArea; created: boolean } {
  const existed = findAreaByCoord(input.lat, input.lng);
  const areaType: AreaType = input.areaType ?? existed?.areaType ?? 'watering';
  const preset = AREA_TYPE_PRESET[areaType];
  const geo = mockReverseGeocode(input.lat, input.lng, input.name);

  if (existed) {
    const typeChanged = existed.areaType !== areaType;
    existed.name = input.name || existed.name;
    // 显式传半径优先；未传但类型变了，半径跟随新类型默认值（避免洗煤厂挂着 300m 半径）
    existed.radiusM = input.radiusM ?? (typeChanged ? preset.radiusM : existed.radiusM);
    existed.areaType = areaType;
    // 显式传阈值优先；未传但类型变了才跟随新类型默认（否则会冲掉用户自定义值）
    existed.stayThresholdMin = input.stayThresholdMin ?? (typeChanged ? preset.stayThresholdMin : existed.stayThresholdMin);
    // 类型变了 → 识别规则口径跟着变（AI识别点位的溯源必须与实际类型一致）
    if (typeChanged && existed.source === 'ai') {
      existed.discovery = {
        ...existed.discovery,
        rule: DISCOVERY_RULES[areaType].rule,
        threshold: DISCOVERY_RULES[areaType].threshold,
      };
    }
    existed.region = geo.region;
    existed.address = geo.address;
    if (input.remark) existed.evidence = input.remark;
    return { area: existed, created: false };
  }

  // 新点位入库即开始监控，必须有碰撞量（航哥规则3）；途经总量未知时给默认量级，
  // 否则「异常停靠」会是 0 或超过途经总量（异常 ⊂ 途经 的约束会被破坏）
  const radiusM = input.radiusM ?? preset.radiusM;
  const stayThresholdMin = input.stayThresholdMin ?? preset.stayThresholdMin;
  const passThrough = input.waybillCount ?? DEFAULT_NEW_AREA_PASS_THROUGH;

  const source = input.source ?? 'manual';
  const discovery = buildAreaDiscovery({
    source,
    areaType,
    lat: input.lat,
    lng: input.lng,
    createdAt: todayLabel(),
    origin: input.origin,
    totalWaybillCount: passThrough,
    radiusM,
    stayThresholdMin,
  });

  const area: SensitiveArea = {
    id: nextId(),
    // 取名优先级与录入解析层保持同一条：客户填的 > POI 名 > 地址（航哥 20261124）。
    // ⚠️ 两处必须同源，否则"解析时叫 A、入库后变 B"，客户会以为数据被改过。
    name: input.name || geo.poiName || geo.address,
    address: geo.address,
    region: geo.region,
    waybillCount: passThrough,
    lat: input.lat,
    lng: input.lng,
    radiusM,
    source,
    status: 'active',
    areaType,
    // 人工录入不定级；若录入时指定为 AI 来源，走与批量生成完全相同的分级函数，避免两套规则
    riskLevel: deriveRiskLevel(source, discovery),
    stayThresholdMin,
    evidence: input.evidence ?? input.remark ?? '',
    createdAt: todayLabel(),
    discovery,
  };
  // 新录入的排最前，便于演示时立刻看到
  sensitiveAreaState.areas.unshift(area);
  return { area, created: true };
}

export interface BatchUpsertResult {
  created: number;
  updated: number;
  areas: SensitiveArea[];
}

/**
 * 批量入库（一次导入十来个点位）
 * upsertSensitiveArea 内部每次都会按坐标查重，所以「与库里已有重复」和「同批次内部重复」都会被归到 updated
 */
export function upsertSensitiveAreas(inputs: NewAreaInput[]): BatchUpsertResult {
  const result: BatchUpsertResult = { created: 0, updated: 0, areas: [] };
  inputs.forEach((input) => {
    const { area, created } = upsertSensitiveArea(input);
    if (created) {
      result.created += 1;
    } else {
      result.updated += 1;
    }
    result.areas.push(area);
  });
  return result;
}

/** 可编辑字段 */
export interface AreaPatch {
  name?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
  areaType?: AreaType;
  stayThresholdMin?: number;
  /** 备注（AI 点位初始填充识别依据文案） */
  evidence?: string;
}

/** 编辑点位；改坐标时同步刷新逆地理区域与地址 */
export function updateSensitiveArea(id: string, patchData: AreaPatch): SensitiveArea | null {
  const area = sensitiveAreaState.areas.find((item) => item.id === id);
  if (!area) return null;

  const coordChanged = patchData.lat !== undefined || patchData.lng !== undefined;
  Object.assign(area, patchData);

  if (patchData.areaType) {
    // 类型变了但没显式给阈值/半径时，跟随新类型默认
    if (patchData.stayThresholdMin === undefined) area.stayThresholdMin = AREA_TYPE_PRESET[patchData.areaType].stayThresholdMin;
    if (patchData.radiusM === undefined) area.radiusM = AREA_TYPE_PRESET[patchData.areaType].radiusM;
    // AI识别点位的溯源规则口径必须与实际类型一致，否则客户按图索骥对不上
    if (area.source === 'ai') {
      area.discovery = {
        ...area.discovery,
        rule: DISCOVERY_RULES[patchData.areaType].rule,
        threshold: DISCOVERY_RULES[patchData.areaType].threshold,
      };
    }
  }
  if (coordChanged) {
    const geo = mockReverseGeocode(area.lat, area.lng, area.name);
    area.region = geo.region;
    area.address = geo.address;
  }

  // 碰撞条件变了就必须重算异常停靠（航哥规则1：数值来自与运单中途停靠的碰撞）
  // 半径放大 / 停留阈值放宽 → 碰到的单变多；否则编辑面板改完半径，数字纹丝不动，模型就假了
  const collisionInputChanged =
    patchData.areaType !== undefined ||
    patchData.radiusM !== undefined ||
    patchData.stayThresholdMin !== undefined ||
    coordChanged;
  if (collisionInputChanged) {
    const next = buildAreaDiscovery({
      source: area.source,
      areaType: area.areaType,
      lat: area.lat,
      lng: area.lng,
      createdAt: area.createdAt,
      totalWaybillCount: area.waybillCount,
      radiusM: area.radiusM,
      stayThresholdMin: area.stayThresholdMin,
    });
    // 只换碰撞量，溯源文案（数据来源批次 / 命中规则 / 判定口径）保持原样
    area.discovery = {
      ...next,
      batch: area.discovery.batch,
      rule: area.discovery.rule,
      threshold: area.discovery.threshold,
    };
  }
  return area;
}

/**
 * 彻底删除点位（从库中移除，不可恢复）
 * 确认/忽略机制已下线，删除是唯一的下线手段
 */
export function deleteSensitiveArea(id: string): boolean {
  const index = sensitiveAreaState.areas.findIndex((item) => item.id === id);
  if (index < 0) return false;
  sensitiveAreaState.areas.splice(index, 1);
  return true;
}

/** 批量彻底删除，返回实际删除条数 */
export function deleteSensitiveAreas(ids: string[]): number {
  const idSet = new Set(ids);
  const before = sensitiveAreaState.areas.length;
  for (let i = sensitiveAreaState.areas.length - 1; i >= 0; i -= 1) {
    const area = sensitiveAreaState.areas[i]!;
    if (idSet.has(area.id)) sensitiveAreaState.areas.splice(i, 1);
  }
  return before - sensitiveAreaState.areas.length;
}
