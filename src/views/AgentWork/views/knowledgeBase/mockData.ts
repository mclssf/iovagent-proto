// 聚合运单线路 + 敏感区域 Mock 数据（确定性种子，刷新不跳动）

export type AggDimension = 'province' | 'city' | 'county';

export interface AggTopFlow {
  from: string;
  to: string;
  waybillCount: number;
}

export interface AggLine {
  id: string;
  dimension: AggDimension;
  from: string;
  to: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  waybillCount: number;
  carrierVehicleCount: number;
  /** 近 12 个月发单量 */
  monthlyTrend: number[];
  /** 该聚合线路内部 TOP10 起讫流向 */
  topFlows: AggTopFlow[];
}

/** 点位来源：manual 人工发现（客户/人工录入）｜ai AI识别（中台主动发现） */
export type AreaSource = 'manual' | 'ai';
/** 点位状态：active 已生效｜pending 待确认｜ignored 已忽略 */
export type AreaStatus = 'active' | 'pending' | 'ignored';
/** 点位类型：注水点/路边停靠、洗煤厂/掺配场地、轨迹丢失窝点 */
export type AreaType = 'watering' | 'washing' | 'gps_loss';

/**
 * 风险等级（航哥 20261123）：**只有 AI识别点位定级**，人工发现点位暂不定级（值为 null）。
 * 人工发现是客户/业务人员实地确认过的窝点，本身即最高优先级，不需要再用等级区分——
 * 所以它走独立配色 + 更大尺寸来"更突出"，而不是塞进风险梯度里（见 areaPointColor）。
 */
export type RiskLevel = 'high' | 'mid' | 'low';

export const RISK_LABEL: Record<RiskLevel, string> = { high: '高风险', mid: '中风险', low: '低风险' };

/**
 * 人工发现点位的备注文案池（模拟业务人员实地录入时写的话）。
 * **故意混入超过 50 字的长条目**：浮窗对备注做 50 字截断（超出加省略号、全文挂 title），
 * 池子里若全是短句，截断逻辑永远走不到、也就永远验不出来。
 */
const MANUAL_REMARKS: string[] = [
  '现场核实为注水点，已拍照留存',
  '群众反映夜间有罐车长时间停靠',
  '与相邻洗煤厂共用出入口，需一并监控',
  '稽查队 2026-08 现场查获两起换煤行为，已移交处理',
  '该点位于省道辅路，无监控覆盖，建议加装设备后持续观察',
  '企业自报为临时停车点，但轨迹显示夜间停靠频次异常偏高',
  '周边三公里内无正规加水站，注水嫌疑较大，已列入重点巡查名单并通知属地稽查队跟进复核处理情况',
  // **必须保留这条超长备注**：浮窗对备注做 50 字截断，池子里若全是短句，
  // 截断分支永远走不到、也就永远验不出来（上一版最长仅 45 字，正是这个坑）
  '该点位位于省道301辅路东侧，无视频监控覆盖，夜间22时至次日5时停靠频次显著偏高，建议属地稽查队加装设备并纳入重点巡查名单持续跟踪复核',
];

/** 风险等级列表顺序（子 tab 与图例都按此排，不要各自定义） */
export const RISK_ORDER: RiskLevel[] = ['high', 'mid', 'low'];

/**
 * AI 点位风险分级阈值：按「近 30 天异常停靠运单数」分档。
 * 取值为当前 166 个 AI 点位分布的 p78 / p50（实测 p25=16 p50=35 p75=62 p90=98 max=196），
 * 得到 高38 / 中46 / 低82 的金字塔分布。
 * ⚠️ 这是**派生值不是随机值**：分级函数不消耗 rng，所以加它不会让 300 条点位数据漂移。
 */
export const RISK_THRESHOLD = { high: 70, mid: 35 } as const;

export function deriveRiskLevel(source: AreaSource, discovery: AreaDiscovery): RiskLevel | null {
  // 人工发现不定级（航哥：「人工发现的区域目前先不定风险等级」）
  if (source !== 'ai') return null;
  const n = discovery.waybillCount;
  if (n >= RISK_THRESHOLD.high) return 'high';
  if (n >= RISK_THRESHOLD.mid) return 'mid';
  return 'low';
}

/**
 * 发现溯源：这个点是怎么来的
 * AI识别 → 哪批运单、命中什么规则、判定阈值、命中多少单多少车、首次/最近命中、样例运单号
 * 人工发现 → 录入方式（对话框 / Excel 批量导入）
 */
export interface AreaDiscovery {
  /** 数据来源批次 */
  batch: string;
  /** 命中规则 / 录入方式 */
  rule: string;
  /** 判定阈值口径 */
  threshold: string;
  /** 命中运单数（人工录入为 0） */
  waybillCount: number;
  /** 涉及车辆数（人工录入为 0） */
  vehicleCount: number;
  /** 首次命中日期 */
  firstHit: string;
  /** 最近命中日期 */
  lastHit: string;
  /** 样例运单号，供客户回查 */
  sampleWaybills: string[];
}

/** 识别规则口径（依据 20261113 会议纪要：注水 10 分钟、换煤/掺配约半小时、轨迹丢失纳入监控） */
export const DISCOVERY_RULES: Record<AreaType, { rule: string; threshold: string }> = {
  watering: { rule: '非目的地停留聚集识别', threshold: '单次停留 ≥ 10 分钟，近 30 天 ≥ 5 辆车 / ≥ 10 次' },
  washing: { rule: 'POI 命中洗煤厂·掺配场地 + 长停留', threshold: '单次停留 ≥ 30 分钟，近 30 天 ≥ 3 辆车' },
  gps_loss: { rule: '轨迹中断点聚集识别', threshold: '信号中断 ≥ 20 分钟，近 30 天 ≥ 3 辆车落在同一 500m 网格' },
};

function shiftDate(dateLabel: string, days: number): string {
  const base = new Date(`${dateLabel}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * 生成发现溯源（确定性：同坐标同类型永远同样结果）
 */
/**
 * 异常运单 / 涉及车辆 的去重总数
 *
 * 单点的 `discovery.waybillCount` 是「在该点位停靠过的运单数」，同一运单可能在多个点位停靠，
 * 直接相加会重复计数（把 300 个点位加总当「异常运单数」是错的）。
 * 这里用确定性哈希把每个点位的命中运单映射到共享号池，取并集大小 = 去重后的真实单数。
 * 号池容量决定重叠率：容量越小重叠越高。取 5000 ≈ 单量重叠 30%，符合"同一批车反复跑同几条线"的实际。
 */
const ABNORMAL_WAYBILL_POOL = 40000;
const ABNORMAL_VEHICLE_POOL = 20000;

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function countDistinctAbnormal(areas: SensitiveArea[]): { waybills: number; vehicles: number } {
  const waybillSlots = new Set<number>();
  const vehicleSlots = new Set<number>();
  areas.forEach((area) => {
    let seed = hashSeed(area.id);
    for (let i = 0; i < area.discovery.waybillCount; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      waybillSlots.add(seed % ABNORMAL_WAYBILL_POOL);
    }
    let vSeed = hashSeed(`${area.id}-v`);
    for (let i = 0; i < area.discovery.vehicleCount; i += 1) {
      vSeed = (Math.imul(vSeed, 1664525) + 1013904223) >>> 0;
      vehicleSlots.add(vSeed % ABNORMAL_VEHICLE_POOL);
    }
  });
  return { waybills: waybillSlots.size, vehicles: vehicleSlots.size };
}

/** 新录入点位尚无途经运单统计时的默认量级（保证「异常停靠」始终有值，航哥规则3） */
const DEFAULT_PASS_THROUGH = 1200;

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildAreaDiscovery(opts: {
  source: AreaSource;
  areaType: AreaType;
  lat: number;
  lng: number;
  createdAt: string;
  origin?: 'text' | 'file';
  waybillCount?: number;
  vehicleCount?: number;
  /** 该点关联运单总数，用于夹住命中数（命中 ≤ 途经总量） */
  totalWaybillCount?: number;
  /** 敏感半径（米）：围栏越大，越容易与运单中途停靠碰撞 */
  radiusM?: number;
  /** 停留阈值（分钟）：阈值越严，符合"异常停靠"定义的运单越少 */
  stayThresholdMin?: number;
}): AreaDiscovery {
  const rng = mulberry32(
    (Math.round(Math.abs(opts.lat) * 100000) * 3571 + Math.round(Math.abs(opts.lng) * 100000)) >>> 0,
  );

  const total = opts.totalWaybillCount && opts.totalWaybillCount > 0 ? opts.totalWaybillCount : DEFAULT_PASS_THROUGH;
  const cap = opts.totalWaybillCount && opts.totalWaybillCount > 0 ? opts.totalWaybillCount : Number.POSITIVE_INFINITY;

  // ===== 碰撞模型（航哥规则1：人工/AI 都要与运单"中途停靠"做碰撞，碰到即计为异常停靠）=====
  // 暴露度 = 半径因子 × 停留阈值因子
  //   半径 300m→0.60 / 500m→1.00 / 1500m→2.40（封顶）：围栏越大越容易碰到
  //   阈值 10min→1.50（封顶）/ 20min→1.00 / 30min→0.67 / 60min→0.45：判定越严，符合的单越少
  const radiusFactor = clampNum((opts.radiusM ?? 500) / 500, 0.6, 2.4);
  const thresholdFactor = opts.stayThresholdMin && opts.stayThresholdMin > 0
    ? clampNum(20 / opts.stayThresholdMin, 0.45, 1.5)
    : 1;
  const exposure = radiusFactor * thresholdFactor;
  // 碰撞率 = 途经运单中在此产生异常停靠的比例。异常停靠是少数事件：
  // 基础 0.15%~0.65%，按暴露度缩放后夹在 0.08%~5%（均值约 0.46%）
  const hitRate = clampNum((0.0015 + rng() * 0.005) * exposure, 0.0008, 0.05);
  const derivedWaybills = Math.max(1, Math.round(total * hitRate));

  // 命中运单数不能超过途经该点的运单总数；涉及车辆数不能超过命中运单数
  const waybillCount = Math.max(1, Math.min(opts.waybillCount ?? derivedWaybills, cap));
  const vehicleCount = Math.max(1, Math.min(
    opts.vehicleCount ?? Math.round(waybillCount * (0.32 + rng() * 0.38)),
    waybillCount,
  ));
  const spanDays = 12 + Math.floor(rng() * 40);
  const ruleSet = DISCOVERY_RULES[opts.areaType];
  const samples: string[] = [];
  for (let i = 0; i < Math.min(3, waybillCount); i += 1) {
    const dayOffset = Math.floor(rng() * spanDays);
    const seq = String(10000 + Math.floor(rng() * 89999));
    samples.push(`YSD${shiftDate(opts.createdAt, -dayOffset).replace(/-/g, '')}${seq}`);
  }

  const isManual = opts.source === 'manual';
  return {
    // 人工发现：批次与规则写录入方式；异常停靠统计照样给（点位一样在监控）
    batch: isManual
      ? opts.origin === 'file'
        ? '客户敏感地点清单（批量粘贴导入）'
        : '对话框录入'
      : `灵动系统 ${shiftDate(opts.createdAt, -spanDays).slice(0, 7)} 起近 30 天全量运单（${(3 + rng() * 15).toFixed(1)} 万单）`,
    rule: isManual ? '客户 / 业务人员人工提供' : ruleSet.rule,
    threshold: isManual ? '按点位默认，可在点位上单独调整' : ruleSet.threshold,
    waybillCount,
    vehicleCount,
    firstHit: isManual ? opts.createdAt : shiftDate(opts.createdAt, -spanDays),
    lastHit: opts.createdAt,
    // 人工点位同样给样例：面板显示「异常停靠 N 单」，就必须能查证到具体运单号
    sampleWaybills: samples.slice(0, Math.min(3, waybillCount)),
  };
}

export interface SensitiveArea {
  id: string;
  name: string;
  address: string;
  region: string;
  waybillCount: number;
  lat: number;
  lng: number;
  /** 敏感半径（米）：注水点 200–500，洗煤厂/掺配场地 1000–2000 */
  radiusM: number;
  source: AreaSource;
  status: AreaStatus;
  areaType: AreaType;
  /** 风险等级：AI识别点位必有值，人工发现点位为 null（暂不定级） */
  riskLevel: RiskLevel | null;
  /** 停留时长阈值（分钟），0 表示该类型不适用 */
  stayThresholdMin: number;
  /** AI识别的命中证据；人工发现为空 */
  evidence: string;
  createdAt: string;
  /** 发现溯源：哪批运单、命中什么规则（AI识别）/ 录入方式（人工发现） */
  discovery: AreaDiscovery;
}

/** 展示用中文标签（航哥定名：manual=人工发现、ai=AI识别） */
export const AREA_SOURCE_LABEL: Record<AreaSource, string> = { manual: '人工发现', ai: 'AI识别' };

/**
 * 点位配色（航哥 20261123：「敏感区域和路线的颜色也要区分开」）。
 *
 * 旧配色与线路三档色**直接撞车**：人工发现 `#dc2626` == 线路高频色，AI识别 `#7c3aed` ≈ 线路中频 `#8b5cf6`，
 * 路线全览态下 40 条彩色轨迹 + 300 个点位同屏，红点和红线根本分不开。
 * 线路三档色是文档里「必须照抄」的既定项，所以**改点位、不改线路**：
 * 点位移到 teal / amber 色族，与线路的蓝-紫-红完全错开。
 *
 * 连带调整（否则会造出新撞色）：
 * - 起点标记 绿 `#059669` → slate-900 `#0f172a`（绿与人工发现 teal 太近）
 * - 运单视角异常停靠位置 amber `#f59e0b` → pink `#db2777`（amber 已让给 AI识别）
 */
/**
 * 点位配色（航哥 20261123 第三次调整，**本节为终稿**）。
 *
 * 演进：① 红/紫 → ② teal/amber（因与线路三档色撞车）→ ③ 本节：风险梯度。
 * 之所以敢把红色放回来：**「路线」视角与二级导航「路线」分区都已下线**，
 * 敏感区域视图里不再同屏出现线路三档色（蓝/紫/红），红色重新空出来。
 * 总览分区仍画线路三档色，但总览**不显示任何敏感区域点位**，两者永不同屏。
 *
 * 编码规则：**颜色 = 风险等级**（AI 三档，**风险越低越暗淡**），**人工发现走独立冷色 + 更大尺寸**。
 */
/** 人工发现点位色：violet-600，与 AI 的暖色梯度完全分族，一眼可辨"这是人确认过的" */
export const MANUAL_AREA_COLOR = '#7c3aed';

/**
 * AI识别点位按风险等级配色：**饱和度单调递减 = 等级越低越暗淡**（航哥 20261124）。
 *
 * 原三档是 red-600 / orange-500 / yellow-500，饱和度 72% / 95% / 92% ——
 * **中低风险反而比高风险更鲜艳**，黄色在浅底图上还最扎眼，视觉权重与业务权重完全反了。
 * 客户扫一眼地图，注意力会被低风险点抢走。
 *
 * 现改为按 HSL 构造的等明度降饱和梯度（明度都在 45~52%，保证三档在标准图与卫星图上都看得清）：
 *   高 hsl(2, 75%, 48%)  → 鲜艳正红
 *   中 hsl(26, 52%, 45%) → 暗淡的棕橙
 *   低 hsl(32, 14%, 52%) → 近乎暖灰
 * 饱和度 75% → 52% → 14%，严格单调递减，"越低越暗淡"是可量化的而不是凭感觉。
 *
 * ⚠️ 高风险红 `#d6261e` 与线路高频红 `#dc2626`（mapShared.LINE_TIER_STYLES）**已不再同值**，
 * 顺带缓解了路线视角恢复时的撞色问题（两者仍是相近色，恢复路线视角时仍需复核）。
 */
export const RISK_COLOR: Record<RiskLevel, string> = {
  high: '#d6261e',
  mid: '#ae6b37',
  low: '#968673',
};

/**
 * 风险等级标签底色（Tailwind 类，供列表/浮窗徽标用）。
 * ⚠️ 类名必须**整串字面量写死**，不能用 `bg-${x}-50` 拼接 —— Tailwind JIT 扫不到拼接类名，
 * 样式根本不会生成（构建后 grep CSS 才发现，白屏级别的坑）。
 * 文字色与 RISK_COLOR 同步降饱和：red-700 → amber-700 → stone-500。
 */
export const RISK_BADGE_CLASS: Record<RiskLevel, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  mid: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-stone-100 text-stone-500 border-stone-200',
};

/**
 * 地图**绘制层级**（航哥 20261124：「显示层级上应该优先显示人工的；其次是高，再然后是中，再然后是低」）。
 *
 * Leaflet 的 SVG 渲染器按**加入顺序**叠放，后画的压在先画的上面。
 * 所以绘制时要按本函数返回值**升序**遍历（低 → 中 → 高 → 人工），
 * 人工发现最后画 = 永远压在最上层，重叠时不会被 AI 点位盖住。
 *
 * ⚠️ 这个顺序**只用于地图绘制**，绝不能拿它去排右栏列表——
 * 列表顺序是「异常停靠运单数降序」（航哥 20261119 定稿），两套排序服务两个目的，混用会互相破坏。
 */
export function areaZRank(area: Pick<SensitiveArea, 'source' | 'riskLevel'>): number {
  if (area.source === 'manual') return 3;
  return area.riskLevel === 'high' ? 2 : area.riskLevel === 'mid' ? 1 : 0;
}
/** 人工发现徽标底色 */
export const MANUAL_BADGE_CLASS = 'bg-violet-50 text-violet-700 border-violet-200';

/**
 * 地图点位实际填色：**单一入口，任何绘图/图例/浮窗都必须走这里**，
 * 不要自己按 source 或 riskLevel 拼颜色，否则会出现同一含义两种颜色。
 */
export function areaPointColor(area: Pick<SensitiveArea, 'source' | 'riskLevel'>): string {
  if (area.source === 'manual') return MANUAL_AREA_COLOR;
  return RISK_COLOR[area.riskLevel ?? 'low'];
}

/**
 * 地图上的语义色。
 * 航哥 20261123：「起点和终点用两个黑色圆圈表示，你看怎么设计更美观一点」→
 * 两端都用 slate-900，靠**实心 vs 空心环**区分（制图惯例：实心=出发、空心=到达），
 * 比原来"绿起点/红终点"更克制，也不会与点位风险色抢注意力。
 * 原 `destination: '#dc2626'` 已退役——红色现在是 AI 高风险点位的专用色，不能一色两义。
 * 原 `stop: '#db2777'` 也已退役——停靠标记改用**所在点位的风险色**（见 areaPointColor），
 * 这样"轨迹上这个点是什么风险"不用查表就能看出来。
 */
export const MAP_SEMANTIC_COLOR = {
  /** 起点（发货）：实心黑圆 + 白描边 */
  origin: '#0f172a',
  /** 终点（收货）：空心黑环 + 白心 */
  destination: '#0f172a',
  /** 选中线路/运单的真实轨迹渐变主色 */
  trajectory: '#2563eb',
} as const;

/**
 * 点位渲染尺寸与不透明度（航哥 20261123：「颜色稍微淡一点」——降不透明度而非缩尺寸，
 * 尺寸是上一轮刚按「要显示得大一点」加大过的，不能再退回去）。
 */
export const AREA_MARKER_STYLE = {
  /** 主点填充不透明度：0.95 → 0.75，视觉上明显变淡但仍清晰 */
  fillOpacity: 0.75,
  /** 选中态填充不透明度 */
  fillOpacitySelected: 0.95,
  /** 光晕不透明度：0.18 → 0.13 */
  haloOpacity: 0.13,
  haloOpacitySelected: 0.22,
  /** 白描边宽度 */
  weight: 2.5,
  /** 路线/运单视角命中点的描边（更粗一档，因为它是该视角的焦点） */
  hitWeight: 3,
  radius: { base: 8, hover: 10.5, selected: 13 },
  /**
   * 人工发现点位尺寸（航哥：「人工发现的异常相当于更加重要和敏感，要更突出的显示」）。
   * 比 AI 点位大一档 + 描边更粗，配合独立配色形成双重区分。
   */
  manualRadius: { base: 10.5, hover: 13, selected: 16 },
  manualWeight: 3,
  haloRadiusOffset: 5,
  hitRadius: { line: 11, lineSelected: 14, waybill: 15, waybillSelected: 18 },
  hitHaloRadiusOffset: 5,
  /**
   * 命中点强调档（航哥 20261123：「途经的异常点一定要显示得更明显一点」）。
   * 与全览态相反——全览态 300 个点要「淡」，聚焦态只有 0~3 个点要「跳出来」，
   * 所以这里把不透明度拉满并加一圈强调环，两处参数刻意不同，不要图省事共用。
   */
  hitFillOpacity: 0.95,
  hitHaloOpacity: 0.3,
  hitHaloRadiusOffsetEmphasis: 8,
  /** 外圈强调环：空心、同色、比光晕再大一圈，卫星图上也能一眼锁定 */
  hitRingRadiusOffset: 13,
  hitRingWeight: 2,
  hitRingOpacity: 0.55,
} as const;
export const AREA_STATUS_LABEL: Record<AreaStatus, string> = { active: '已生效', pending: '待确认', ignored: '已忽略' };
export const AREA_TYPE_LABEL: Record<AreaType, string> = {
  watering: '注水点 / 路边停靠',
  washing: '洗煤厂 / 掺配场地',
  gps_loss: '轨迹丢失窝点',
};

/**
 * 可录入 / 可编辑的点位类型选项（单一事实来源，三处表单都从这里取）
 * 「轨迹丢失窝点」已下线：不再作为选项，但标签与预设保留，历史数据仍能正常显示
 */
export const AREA_TYPE_OPTIONS: AreaType[] = ['watering', 'washing'];

/** 各类型默认半径与停留阈值（客户 1113 会议口径） */
export const AREA_TYPE_PRESET: Record<AreaType, { radiusM: number; stayThresholdMin: number }> = {
  watering: { radiusM: 300, stayThresholdMin: 10 },
  washing: { radiusM: 1500, stayThresholdMin: 30 },
  gps_loss: { radiusM: 500, stayThresholdMin: 0 },
};

/**
 * 敏感区域名称的最大长度（航哥 20261123：「敏感区域的名字长度要有一个合理的限制」）。
 *
 * 取 30 字的依据：中文 POI 名绝大多数在 4~16 字（如「鹏程中转库」「石家庄临港工业区物流大道461号」= 16 字），
 * 30 字已能容纳"园区+楼栋+门牌"这类最长写法；再长就会在 340px 右栏列表、290px 浮窗里被截断得看不出主体，
 * 反而不如让客户写短名 + 用备注补充。
 *
 * ⚠️ **三处都要执行这个上限**，缺一处就会被绕过：
 *   ① 编辑面板输入框 `maxlength`（前端拦）
 *   ② `sensitiveAreaIntake` 解析结果截断（粘贴长文本录入时拦）
 *   ③ `saveEdit` 落库前再 clamp（防止绕过 UI 直接改状态）
 * 只加 maxlength 是不够的——批量粘贴录入走的是解析链路，不经过那个输入框。
 */
export const AREA_NAME_MAX = 30;

/** 按上限截断点位名，超长时不带省略号（存储层存干净值，省略号只在展示层加） */
export function clampAreaName(name: string): string {
  return (name ?? '').trim().slice(0, AREA_NAME_MAX);
}

/**
 * 点位显示名：**无名点位回退到地址**（航哥 20261123）。
 *
 * 原话：「敏感区域可能就是一片空地，就没有名字，但一定有经纬度……列表中如果没有名，
 * 就在名称的地方显示地址，包括浮框中也是这么显示，查看运单的车辆轨迹页面也这么显示。」
 *
 * 回退链：name → address → region → 兜底文案。**绝不返回空串**，否则列表/浮窗/轨迹页
 * 会出现一个空白标题，比显示地址更糟。
 *
 * ⚠️ **凡是展示点位名的地方都必须走这个函数**，不能直接写 `area.name`：
 * 列表行、点位浮窗标题、停靠浮窗标题、marker tooltip、运单详情 chip、
 * 途经点位摘要、详情面板标题、编辑面板、删除二次确认文案——漏一处就会出现
 * "列表显示地址、浮窗显示空白"的两套口径。
 */
export function areaDisplayName(area: { name: string; address: string; region: string }): string {
  const name = area.name?.trim();
  if (name) return name;
  const address = area.address?.trim();
  if (address) return address;
  const region = area.region?.trim();
  if (region) return `${region}（未命名点位）`;
  return '未命名点位';
}

/**
 * 该点位是否无名（无名时**名称位置**显示地址）。
 * ⚠️ 原有的地址行/「具体地址」字段**照常保留，不要隐藏**——航哥 20261123 明确纠正过：
 * 「之前展示的地址的地方还是继续展示地址就行，不用把原先的干掉，还是保留」。
 * 所以无名点位会出现名称与地址内容相同，这是刻意为之，不是重复 bug。
 * 本谓词目前只用于**名称字色弱化**（无名时用 slate-600，提示这不是正式点位名）。
 */
export function isUnnamedArea(area: { name: string }): boolean {
  return !area.name?.trim();
}

export function formatRadius(meters: number) {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${meters} m`;
}

interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
  /** 所属省份（仅省级池填充）：省-省维度端点显示省名，坐标仍用省会 */
  province?: string;
}

// 确定性伪随机（mulberry32）
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

function pick<T>(rng: () => number, pool: T[]): T {
  return pool[Math.floor(rng() * pool.length)]!;
}

// ===== 地理坐标池 =====

// 省级维度：省会坐标
const PROVINCE_CAPITALS: GeoPoint[] = [
  { name: '石家庄', province: '河北', lat: 38.0428, lng: 114.5149 },
  { name: '太原', province: '山西', lat: 37.8706, lng: 112.5489 },
  { name: '呼和浩特', province: '内蒙古', lat: 40.8426, lng: 111.7492 },
  { name: '沈阳', province: '辽宁', lat: 41.8057, lng: 123.4315 },
  { name: '长春', province: '吉林', lat: 43.8171, lng: 125.3235 },
  { name: '哈尔滨', province: '黑龙江', lat: 45.8038, lng: 126.5349 },
  { name: '南京', province: '江苏', lat: 32.0603, lng: 118.7969 },
  { name: '杭州', province: '浙江', lat: 30.2741, lng: 120.1551 },
  { name: '合肥', province: '安徽', lat: 31.8206, lng: 117.2272 },
  { name: '福州', province: '福建', lat: 26.0745, lng: 119.2965 },
  { name: '南昌', province: '江西', lat: 28.682, lng: 115.8579 },
  { name: '济南', province: '山东', lat: 36.6512, lng: 117.1201 },
  { name: '郑州', province: '河南', lat: 34.7466, lng: 113.6253 },
  { name: '武汉', province: '湖北', lat: 30.5928, lng: 114.3055 },
  { name: '长沙', province: '湖南', lat: 28.2282, lng: 112.9388 },
  { name: '广州', province: '广东', lat: 23.1291, lng: 113.2644 },
  { name: '南宁', province: '广西', lat: 22.817, lng: 108.3669 },
  { name: '成都', province: '四川', lat: 30.5728, lng: 104.0668 },
  { name: '西安', province: '陕西', lat: 34.3416, lng: 108.9398 },
  { name: '乌鲁木齐', province: '新疆', lat: 43.8256, lng: 87.6168 },
];

// 市级维度：主要城市坐标
const CITIES: GeoPoint[] = [
  { name: '上海', lat: 31.2304, lng: 121.4737 },
  { name: '杭州', lat: 30.2741, lng: 120.1551 },
  { name: '南京', lat: 32.0603, lng: 118.7969 },
  { name: '苏州', lat: 31.2989, lng: 120.5853 },
  { name: '宁波', lat: 29.8683, lng: 121.544 },
  { name: '合肥', lat: 31.8206, lng: 117.2272 },
  { name: '北京', lat: 39.9042, lng: 116.4074 },
  { name: '天津', lat: 39.0842, lng: 117.2009 },
  { name: '济南', lat: 36.6512, lng: 117.1201 },
  { name: '青岛', lat: 36.0671, lng: 120.3826 },
  { name: '郑州', lat: 34.7466, lng: 113.6253 },
  { name: '武汉', lat: 30.5928, lng: 114.3055 },
  { name: '长沙', lat: 28.2282, lng: 112.9388 },
  { name: '广州', lat: 23.1291, lng: 113.2644 },
  { name: '深圳', lat: 22.5431, lng: 114.0579 },
  { name: '福州', lat: 26.0745, lng: 119.2965 },
  { name: '厦门', lat: 24.4798, lng: 118.0894 },
  { name: '成都', lat: 30.5728, lng: 104.0668 },
  { name: '重庆', lat: 29.4316, lng: 106.9123 },
  { name: '西安', lat: 34.3416, lng: 108.9398 },
  { name: '昆明', lat: 25.0389, lng: 102.7183 },
  { name: '贵阳', lat: 26.647, lng: 106.6302 },
  { name: '南宁', lat: 22.817, lng: 108.3669 },
  { name: '南昌', lat: 28.682, lng: 115.8579 },
  { name: '石家庄', lat: 38.0428, lng: 114.5149 },
  { name: '太原', lat: 37.8706, lng: 112.5489 },
  { name: '沈阳', lat: 41.8057, lng: 123.4315 },
  { name: '大连', lat: 38.914, lng: 121.6147 },
  { name: '长春', lat: 43.8171, lng: 125.3235 },
  { name: '哈尔滨', lat: 45.8038, lng: 126.5349 },
  { name: '兰州', lat: 36.0611, lng: 103.8343 },
  { name: '银川', lat: 38.4872, lng: 106.2309 },
  { name: '无锡', lat: 31.4912, lng: 120.3119 },
  { name: '佛山', lat: 23.0215, lng: 113.1214 },
  { name: '东莞', lat: 23.043, lng: 113.7518 },
  { name: '温州', lat: 27.9944, lng: 120.6994 },
  { name: '泉州', lat: 24.8741, lng: 118.6757 },
];

/**
 * 敏感区域点位专用城市池（航哥 20261123：「示例也可以全国分散一点」）。
 *
 * **为什么不直接扩 `CITIES`**：`CITIES` 同时是「市到市」聚合线路的端点池，
 * 而 `routeGeometries.json` 里的 40 条 OSRM 真实路网几何是**按当时的城市对烘焙**的。
 * 动 `CITIES` → 线路端点变 → 烘焙几何全部失配 → 真实轨迹退化成起讫直飞兜底线，
 * 上一轮验收的「40/40 真实路网」当场作废。所以点位分散必须走独立池子。
 *
 * 覆盖范围：经度 76°（喀什）~ 127°（哈尔滨）、纬度 20°（海口）~ 46°（哈尔滨），
 * 补齐原 `CITIES` 完全缺失的**新疆 / 青海 / 西藏 / 内蒙西部 / 甘肃河西走廊**，
 * 以及中部的地级市（洛阳、襄阳、株洲、南阳…）——大宗煤炭干线的真实窝点就在这些地方。
 *
 * ⚠️ `pick(rng, AREA_CITIES)` 与原 `pick(rng, CITIES)` 一样只消耗 1 次 rng，
 * 所以随机序列节奏不变、人工/AI 的 134:166 拆分不漂移；但**坐标全变**，
 * 依赖坐标的 `buildAreaDiscovery` 与线路↔点位碰撞结果会随之重算，基线数字需重新断言。
 */
const AREA_CITIES: GeoPoint[] = [
  // 东北
  { name: '哈尔滨', lat: 45.8038, lng: 126.5349 }, { name: '长春', lat: 43.8171, lng: 125.3235 },
  { name: '沈阳', lat: 41.8057, lng: 123.4315 }, { name: '大连', lat: 38.914, lng: 121.6147 },
  // 华北
  { name: '北京', lat: 39.9042, lng: 116.4074 }, { name: '天津', lat: 39.0842, lng: 117.2009 },
  { name: '石家庄', lat: 38.0428, lng: 114.5149 }, { name: '太原', lat: 37.8706, lng: 112.5489 },
  { name: '呼和浩特', lat: 40.8424, lng: 111.7491 }, { name: '包头', lat: 40.6571, lng: 109.8403 },
  { name: '鄂尔多斯', lat: 39.6086, lng: 109.7813 }, { name: '大同', lat: 40.0900, lng: 113.3001 },
  { name: '唐山', lat: 39.6305, lng: 118.1802 }, { name: '保定', lat: 38.8737, lng: 115.4646 },
  // 华东
  { name: '上海', lat: 31.2304, lng: 121.4737 }, { name: '南京', lat: 32.0603, lng: 118.7969 },
  { name: '杭州', lat: 30.2741, lng: 120.1551 }, { name: '苏州', lat: 31.2989, lng: 120.5853 },
  { name: '宁波', lat: 29.8683, lng: 121.544 }, { name: '合肥', lat: 31.8206, lng: 117.2272 },
  { name: '福州', lat: 26.0745, lng: 119.2965 }, { name: '厦门', lat: 24.4798, lng: 118.0894 },
  { name: '南昌', lat: 28.682, lng: 115.8579 }, { name: '济南', lat: 36.6512, lng: 117.1201 },
  { name: '青岛', lat: 36.0671, lng: 120.3826 }, { name: '徐州', lat: 34.2618, lng: 117.1839 },
  { name: '温州', lat: 27.9944, lng: 120.6994 }, { name: '泉州', lat: 24.8741, lng: 118.6757 },
  { name: '无锡', lat: 31.4912, lng: 120.3119 }, { name: '烟台', lat: 37.4638, lng: 121.4479 },
  { name: '赣州', lat: 25.8312, lng: 114.9334 }, { name: '金华', lat: 29.0789, lng: 119.6474 },
  // 华中
  { name: '郑州', lat: 34.7466, lng: 113.6253 }, { name: '武汉', lat: 30.5928, lng: 114.3055 },
  { name: '长沙', lat: 28.2282, lng: 112.9388 }, { name: '洛阳', lat: 34.6197, lng: 112.4540 },
  { name: '襄阳', lat: 32.0090, lng: 112.1220 }, { name: '宜昌', lat: 30.6919, lng: 111.2865 },
  { name: '株洲', lat: 27.8274, lng: 113.1340 }, { name: '衡阳', lat: 26.8930, lng: 112.5720 },
  { name: '南阳', lat: 32.9908, lng: 112.5283 }, { name: '岳阳', lat: 29.3570, lng: 113.1290 },
  // 华南
  { name: '广州', lat: 23.1291, lng: 113.2644 }, { name: '深圳', lat: 22.5431, lng: 114.0579 },
  { name: '南宁', lat: 22.817, lng: 108.3669 }, { name: '佛山', lat: 23.0215, lng: 113.1214 },
  { name: '东莞', lat: 23.043, lng: 113.7518 }, { name: '柳州', lat: 24.3260, lng: 109.4160 },
  { name: '桂林', lat: 25.2740, lng: 110.2990 }, { name: '湛江', lat: 21.2710, lng: 110.3590 },
  { name: '海口', lat: 20.0440, lng: 110.3500 },
  // 西南
  { name: '成都', lat: 30.5728, lng: 104.0668 }, { name: '重庆', lat: 29.4316, lng: 106.9123 },
  { name: '昆明', lat: 25.0389, lng: 102.7183 }, { name: '贵阳', lat: 26.647, lng: 106.6302 },
  { name: '拉萨', lat: 29.6500, lng: 91.1300 }, { name: '绵阳', lat: 31.4677, lng: 104.6796 },
  { name: '宜宾', lat: 28.7513, lng: 104.6417 }, { name: '泸州', lat: 28.8717, lng: 105.4421 },
  { name: '曲靖', lat: 25.4900, lng: 103.7960 }, { name: '遵义', lat: 27.7253, lng: 106.9272 },
  // 西北（原 CITIES 完全缺失的大片区域）
  { name: '西安', lat: 34.3416, lng: 108.9398 }, { name: '兰州', lat: 36.0611, lng: 103.8343 },
  { name: '西宁', lat: 36.6171, lng: 101.7782 }, { name: '银川', lat: 38.4872, lng: 106.2309 },
  { name: '乌鲁木齐', lat: 43.8256, lng: 87.6168 }, { name: '喀什', lat: 39.4704, lng: 75.9898 },
  { name: '库尔勒', lat: 41.7260, lng: 86.1740 }, { name: '阿克苏', lat: 41.1670, lng: 80.2600 },
  { name: '哈密', lat: 42.8180, lng: 93.5150 }, { name: '嘉峪关', lat: 39.7730, lng: 98.2890 },
  { name: '酒泉', lat: 39.7330, lng: 98.4940 }, { name: '玉门', lat: 40.2920, lng: 97.0450 },
  { name: '格尔木', lat: 36.4020, lng: 94.9040 }, { name: '中卫', lat: 37.5000, lng: 105.1900 },
  { name: '固原', lat: 36.0000, lng: 106.2400 }, { name: '延安', lat: 36.5850, lng: 109.4900 },
  { name: '榆林', lat: 38.2860, lng: 109.7340 }, { name: '宝鸡', lat: 34.3630, lng: 107.2380 },
];

// 县级维度：县/县级市/区中心坐标
const COUNTIES: GeoPoint[] = [
  { name: '昆山市', lat: 31.3843, lng: 120.9581 },
  { name: '江阴市', lat: 31.9113, lng: 120.2655 },
  { name: '张家港市', lat: 31.8762, lng: 120.5531 },
  { name: '常熟市', lat: 31.6532, lng: 120.7485 },
  { name: '太仓市', lat: 31.4591, lng: 121.1147 },
  { name: '慈溪市', lat: 30.1696, lng: 121.2665 },
  { name: '余姚市', lat: 30.0363, lng: 121.1546 },
  { name: '义乌市', lat: 29.3069, lng: 120.0751 },
  { name: '诸暨市', lat: 29.7136, lng: 120.2443 },
  { name: '晋江市', lat: 24.7816, lng: 118.5517 },
  { name: '南安市', lat: 24.9604, lng: 118.3863 },
  { name: '石狮市', lat: 24.7321, lng: 118.6481 },
  { name: '即墨区', lat: 36.3903, lng: 120.4471 },
  { name: '胶州市', lat: 36.2647, lng: 120.0336 },
  { name: '寿光市', lat: 36.8745, lng: 118.7912 },
  { name: '邹城市', lat: 35.4053, lng: 116.9734 },
  { name: '巩义市', lat: 34.7479, lng: 112.9688 },
  { name: '新郑市', lat: 34.3963, lng: 113.7407 },
  { name: '荥阳市', lat: 34.7874, lng: 113.3832 },
  { name: '浏阳市', lat: 28.1411, lng: 113.6253 },
  { name: '宁乡市', lat: 28.2775, lng: 112.5519 },
  { name: '番禺区', lat: 22.9372, lng: 113.3642 },
  { name: '南海区', lat: 23.0218, lng: 113.1432 },
  { name: '顺德区', lat: 22.8408, lng: 113.2933 },
  { name: '增城区', lat: 23.2613, lng: 113.8108 },
  { name: '花都区', lat: 23.4042, lng: 113.2207 },
  { name: '双流区', lat: 30.5733, lng: 103.9236 },
  { name: '郫都区', lat: 30.8294, lng: 103.9028 },
  { name: '温江区', lat: 30.7031, lng: 103.8364 },
  { name: '龙泉驿区', lat: 30.5606, lng: 104.2692 },
  { name: '长安区', lat: 34.1589, lng: 108.9404 },
  { name: '临潼区', lat: 34.3721, lng: 109.2141 },
  { name: '大兴区', lat: 39.7268, lng: 116.3414 },
  { name: '通州区', lat: 39.9098, lng: 116.6564 },
  { name: '顺义区', lat: 40.1303, lng: 116.6548 },
  { name: '昌平区', lat: 40.2208, lng: 116.2312 },
  { name: '嘉定区', lat: 31.3756, lng: 121.2643 },
  { name: '松江区', lat: 31.0305, lng: 121.2278 },
  { name: '江宁区', lat: 31.9529, lng: 118.8397 },
  { name: '六合区', lat: 32.3535, lng: 118.8413 },
  { name: '锡山区', lat: 31.5892, lng: 120.3573 },
  { name: '惠山区', lat: 31.6812, lng: 120.2988 },
  { name: '萧山区', lat: 30.1629, lng: 120.2707 },
  { name: '柯桥区', lat: 30.0819, lng: 120.4947 },
  { name: '南海新区', lat: 37.3523, lng: 122.0531 },
  { name: '荣成市', lat: 37.1652, lng: 122.4867 },
  { name: '乳山市', lat: 36.9206, lng: 121.5398 },
  { name: '莱州市', lat: 37.1771, lng: 119.9423 },
  { name: '招远市', lat: 37.3555, lng: 120.4343 },
];

// 镇/街道级名称（县级线路 TOP10 流向用）
const TOWNS = [
  '城关镇', '开发区街道', '临港产业园', '物流大道沿线', '工业园区',
  '滨河街道', '高新区', '经济开发区', '商贸城', '货运集散中心',
  '建材市场周边', '农产品批发区', '化工园区', '港城街道', '绕城高速口',
];

const SENSITIVE_NAME_A = ['宏图', '宏远', '众联', '顺达', '安捷', '中链', '汇通', '联运', '捷运', '广源', '恒信', '金桥', '瑞丰', '天宇', '昌盛', '鼎力', '汇鑫', '鹏程', '凯越', '嘉禾'];
const SENSITIVE_NAME_B = ['物流园', '货运场站', '批发市场', '化工园区', '建材市场', '仓储中心', '集散中心', '产业园', '停车场', '中转库'];
const SENSITIVE_DISTRICT = ['经济开发区', '临港工业区', '高新产业园', '综合保税区', '物流港', '商贸城', '化工集中区', '临港新城'];
const SENSITIVE_ROAD = ['物流大道', '货运路', '临港路', '通达街', '仓储路', '联运路', '港兴路', '环线辅路'];

// ===== 生成器 =====

/**
 * 按权重把 total 拆成 N 个正整数，保证加总**精确等于** total（最大余数法）
 * 用途：12 个月趋势加总必须等于「运单总数」，否则同一张卡片里两个数字互相打脸
 */
function distributeTotal(weights: number[], total: number): number[] {
  const n = weights.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || total < n) {
    // 兜底：总量不够每月 1 单时平均分，余数补到第一个月
    const each = Math.max(1, Math.floor(total / n));
    const out = new Array<number>(n).fill(each);
    out[0] += total - each * n;
    return out;
  }
  const scaled = weights.map((w) => (w / sum) * total);
  const out = scaled.map((v) => Math.floor(v));
  const remainder = total - out.reduce((a, b) => a + b, 0);
  const order = scaled
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k += 1) out[order[k % n].i] += 1;
  // 每月至少 1 单：从最大的月份借，借完总和不变
  for (let i = 0; i < n; i += 1) {
    if (out[i] < 1) {
      const maxIdx = out.indexOf(Math.max(...out));
      out[maxIdx] -= 1 - out[i];
      out[i] = 1;
    }
  }
  return out;
}

function generateMonthlyTrend(rng: () => number, total: number): number[] {
  const base = total / 12;
  const weights: number[] = [];
  let seasonal = rng() * Math.PI * 2;
  for (let i = 0; i < 12; i += 1) {
    seasonal += (rng() - 0.48) * 0.9;
    const wave = 1 + 0.18 * Math.sin((i / 12) * Math.PI * 2 + seasonal);
    // 噪声从 0.72~1.28（±28%）收窄到 0.92~1.08（±8%）：
    // 原来月波动中位数 20.6%、最大环比 +73%，真实干线货运月波动一般在 ±10% 内，太锯齿客户会质疑数据
    const noise = 0.92 + rng() * 0.16;
    weights.push(Math.max(1e-4, base * wave * noise));
  }
  // rng() 调用次数与改前完全一致（1 + 12×2），下游线路/车辆/敏感区域数据零漂移
  return distributeTotal(weights, total);
}

function generateTopFlows(
  rng: () => number,
  dimension: AggDimension,
  total: number,
  fromName: string,
  toName: string,
): AggTopFlow[] {
  const flows: AggTopFlow[] = [];
  const used = new Set<string>();

  // 显式标注成 (GeoPoint | string)[]：三个池子类型不同（TOWNS 是 string[]），
  // 不标注会被推断成 string[] | GeoPoint[] 联合，pick() 无法确定 T，
  // 后续 typeof 收窄直接失效并报 TS2345/TS2339
  const namePool: Array<GeoPoint | string> =
    dimension === 'province' ? CITIES :
    dimension === 'city' ? COUNTIES :
    TOWNS;

  const pickName = (): string => {
    const item = pick(rng, namePool);
    return typeof item === 'string' ? item : item.name;
  };

  for (let i = 0; i < 10; i += 1) {
    let f = pickName();
    let t = pickName();
    let attempts = 0;
    while ((f === t || used.has(`${f}-${t}`)) && attempts < 40) {
      f = pickName();
      t = pickName();
      attempts += 1;
    }
    if (attempts >= 40) continue;
    used.add(`${f}-${t}`);

    // 首条流向挂靠聚合线路起终点，语义更顺
    if (i === 0) {
      if (dimension === 'county') {
        f = `${fromName.replace(/[市区县]$/, '')}${f}`;
        t = `${toName.replace(/[市区县]$/, '')}${t}`;
      } else {
        f = fromName;
        t = toName;
      }
    }

    // 占比递减：TOP1 ~25%，其后递减 + 抖动
    const share = i === 0 ? 0.16 + rng() * 0.1 : Math.max(0.015, (0.12 - i * 0.009) * (0.7 + rng() * 0.6));
    flows.push({ from: f, to: t, waybillCount: Math.max(1, Math.round(total * share)) });
  }
  return flows;
}

function generateAggLines(dimension: AggDimension, count: number, seed: number, countRange: [number, number]): AggLine[] {
  const rng = mulberry32(seed);
  const pool = dimension === 'province' ? PROVINCE_CAPITALS : dimension === 'city' ? CITIES : COUNTIES;
  /**
   * 端点显示名：省-省维度显示省名（湖南→河南），其余显示地名本身。
   * 坐标仍取省会，作为该省飞线起终点的近似位置。
   */
  const labelOf = (point: GeoPoint) => (dimension === 'province' ? point.province ?? point.name : point.name);
  const lines: AggLine[] = [];
  const usedPairs = new Set<string>();

  for (let i = 0; i < count; i += 1) {
    let from = pick(rng, pool);
    let to = pick(rng, pool);
    let attempts = 0;
    while ((labelOf(from) === labelOf(to) || usedPairs.has(`${labelOf(from)}-${labelOf(to)}`)) && attempts < 80) {
      from = pick(rng, pool);
      to = pick(rng, pool);
      attempts += 1;
    }
    if (attempts >= 80) continue;
    usedPairs.add(`${labelOf(from)}-${labelOf(to)}`);

    const [min, max] = countRange;
    const waybillCount = min + Math.floor(rng() * (max - min));
    const monthlyTrend = generateMonthlyTrend(rng, waybillCount);

    lines.push({
      id: `${dimension}-${String(i + 1).padStart(3, '0')}`,
      dimension,
      from: labelOf(from),
      to: labelOf(to),
      fromLat: from.lat,
      fromLng: from.lng,
      toLat: to.lat,
      toLng: to.lng,
      waybillCount,
      carrierVehicleCount: Math.max(1, Math.round(waybillCount / (6 + rng() * 12))),
      monthlyTrend,
      // 下钻流向仍用城市名：省线路的 TOP1 市对市流向即省会之间（湖南→河南 下面是 长沙→郑州）
      topFlows: generateTopFlows(rng, dimension, waybillCount, from.name, to.name),
    });
  }

  return lines.sort((a, b) => b.waybillCount - a.waybillCount);
}

export function getAggLines(dimension: AggDimension): AggLine[] {
  if (dimension === 'province') return generateAggLines('province', 20, 2026110401, [8000, 62000]);
  if (dimension === 'city') return generateAggLines('city', 40, 2026110402, [600, 8600]);
  return generateAggLines('county', 60, 2026110403, [80, 1400]);
}

/** 地市间运单量 Top 20 线路（原知识库首屏地图数据，改为确定性种子） */
export function getTop20Lines(): AggLine[] {
  const rng = mulberry32(2026110405);
  const usedPairs = new Set<string>();
  const lines: AggLine[] = [];

  const backbonePairs = [
    { from: '上海', to: '杭州', count: 486 },
    { from: '杭州', to: '上海', count: 452 },
    { from: '深圳', to: '广州', count: 442 },
    { from: '广州', to: '深圳', count: 398 },
    { from: '苏州', to: '南京', count: 388 },
    { from: '北京', to: '天津', count: 356 },
    { from: '成都', to: '重庆', count: 334 },
  ];

  backbonePairs.forEach((bp, i) => {
    const fromCity = CITIES.find((c) => c.name === bp.from)!;
    const toCity = CITIES.find((c) => c.name === bp.to)!;
    lines.push({
      id: `T${String(i + 1).padStart(3, '0')}`,
      dimension: 'city',
      from: bp.from,
      to: bp.to,
      fromLat: fromCity.lat,
      fromLng: fromCity.lng,
      toLat: toCity.lat,
      toLng: toCity.lng,
      waybillCount: bp.count,
      carrierVehicleCount: Math.floor(bp.count / 12),
      monthlyTrend: generateMonthlyTrend(rng, bp.count),
      topFlows: generateTopFlows(rng, 'city', bp.count, bp.from, bp.to),
    });
    usedPairs.add(`${bp.from}-${bp.to}`);
  });

  for (let i = lines.length; i < 100; i += 1) {
    let fromCity = pick(rng, CITIES);
    let toCity = pick(rng, CITIES);
    let pairKey = `${fromCity.name}-${toCity.name}`;
    let attempts = 0;
    while ((fromCity.name === toCity.name || usedPairs.has(pairKey)) && attempts < 50) {
      fromCity = pick(rng, CITIES);
      toCity = pick(rng, CITIES);
      pairKey = `${fromCity.name}-${toCity.name}`;
      attempts += 1;
    }
    if (attempts >= 50) continue;
    usedPairs.add(pairKey);

    // 运单量：大部分低频，少数中频，极少高频（模拟真实分布）
    const rand = rng();
    let waybillCount: number;
    if (rand < 0.6) waybillCount = 50 + Math.floor(rng() * 150);
    else if (rand < 0.9) waybillCount = 200 + Math.floor(rng() * 150);
    else waybillCount = 350 + Math.floor(rng() * 200);

    lines.push({
      id: `T${String(i + 1).padStart(3, '0')}`,
      dimension: 'city',
      from: fromCity.name,
      to: toCity.name,
      fromLat: fromCity.lat,
      fromLng: fromCity.lng,
      toLat: toCity.lat,
      toLng: toCity.lng,
      waybillCount,
      carrierVehicleCount: Math.max(1, Math.round(waybillCount / (6 + rng() * 12))),
      monthlyTrend: generateMonthlyTrend(rng, waybillCount),
      topFlows: generateTopFlows(rng, 'city', waybillCount, fromCity.name, toCity.name),
    });
  }

  return lines.sort((a, b) => b.waybillCount - a.waybillCount).slice(0, 20);
}

export function generateSensitiveAreas(count = 300): SensitiveArea[] {
  const rng = mulberry32(2026110404);
  const areas: SensitiveArea[] = [];

  for (let i = 0; i < count; i += 1) {
    // 用点位专用全国池（不碰 CITIES，避免动到已烘焙的 40 条线路端点）
    const city = pick(rng, AREA_CITIES);
    const district = pick(rng, SENSITIVE_DISTRICT);
    const road = pick(rng, SENSITIVE_ROAD);
    // ⚠️ **两次 pick(rng, …) 必须照常执行，即使这个点位最终不具名**。
    // 生成器主序列一旦被少消耗，后续所有条目的坐标/来源/类型全部漂移，
    // 134:166 拆分与全部 probe 基线作废。所以先照旧算出名字，再按哈希决定丢弃。
    const generatedName = `${pick(rng, SENSITIVE_NAME_A)}${pick(rng, SENSITIVE_NAME_B)}`;
    /**
     * 约 10% 的点位设为**无名**（航哥 20261123：「敏感区域可能就是一片空地，就没有名字，
     * 但一定有经纬度」）。这是真实业务场景：AI 从轨迹聚集里识别出的空地本来就没有 POI 名。
     *
     * ⚠️ 必须由 id 哈希派生，**绝不能消耗 rng**（同上，理由与备注一致）。
     * ⚠️ **不造出无名点位，"回退显示地址"这条逻辑就永远走不到、也无从验证**——
     *    和上一轮备注恒为空串是同一个坑。
     */
    const name = hashSeed(`nameless:${i}`) % 10 === 0 ? '' : generatedName;
    const num = 1 + Math.floor(rng() * 498);
    // 途经总量：一个位于干线走廊附近的点位，30 天内途经的重卡运单是千级而非百级。
    // 仍只消耗 1 次 rng()，随机序列节奏不变 → 后续所有条目零漂移。
    const waybillCount = 800 + Math.floor(rng() * 19200);
    // 抖动从 ±0.12°（≈13km，300 个点挤成 37 个坨）放宽到 ±0.35°（≈39km），
    // 配合 76 城的全国池 → 点位真正散开。rng 消耗次数不变（各 1 次），序列不漂
    const lat = city.lat + (rng() - 0.5) * 0.7;
    const lng = city.lng + (rng() - 0.5) * 0.7;

    // 来源：约 45% 人工发现、55% AI识别
    const source: AreaSource = rng() < 0.45 ? 'manual' : 'ai';
    // 确认机制已下线（航哥 20261123）：AI识别点位不再区分待确认/已确认，入库即生效。
    // **随机数消耗节奏必须原样保留**——原逻辑 manual 不消耗、ai 消耗 1 次 rng()，
    // 这里照旧条件消耗后丢弃，否则后续 300 条的坐标/来源/类型全部漂移。
    const legacyStatusRoll = source === 'manual' ? 0 : rng();
    void legacyStatusRoll;
    const status: AreaStatus = 'active';

    const typeRoll = rng();
    // 轨迹丢失窝点档位（typeRoll ≥ 0.9）已下线，并入注水点；washing 的区间保持原样，
    // 随机序列消耗节奏不变，避免影响后续条目的确定性
    const areaType: AreaType = typeRoll >= 0.55 && typeRoll < 0.9 ? 'washing' : 'watering';
    const legacyGpsLossSlot = typeRoll >= 0.9;
    const preset = AREA_TYPE_PRESET[areaType];
    const radiusM = areaType === 'washing' ? [1000, 1500, 2000][Math.floor(rng() * 3)]! : preset.radiusM;

    // 这两个值曾直接充当 discovery 的命中运单/车辆数（导致均值只有 12.6 单，
    // 与线路级碰撞结果差 20 倍）。现改由碰撞模型推导；**随机数消耗节奏必须原样保留**，
    // 否则后续 300 条的坐标/来源/状态全部漂移。
    const legacyVehicleCount = 3 + Math.floor(rng() * 9);
    const legacyStopCount = legacyVehicleCount + Math.floor(rng() * 12);
    void legacyVehicleCount;
    void legacyStopCount;
/**
     * 备注（人工填写口径）。
     * 航哥 20261123 要求「人工添加的备注在浮窗里显示，最多呈现 50 个字」——
     * 但此前所有 mock 点位的 evidence 恒为空串，浮窗里那一行**永远不渲染**，功能等于看不见，
     * 截断逻辑也无从验证。所以给人工发现点位补上确定性备注。
     *
     * ⚠️ **必须由 id 哈希派生，绝不能消耗 rng**：生成器主序列一旦被多消耗，
     * 后续点位的坐标/来源/类型全部漂移，134:166 拆分与所有 probe 基线作废。
     * AI识别点位仍留空——备注是人工录入时填的，AI 的识别依据由风险等级与异常停靠量承载。
     */
    const evidence = source === 'manual' ? MANUAL_REMARKS[hashSeed(`remark:${i}`) % MANUAL_REMARKS.length]! : '';
    if (source === 'ai') {
      // 原轨迹丢失档位的证据文案会消耗两次随机数，这里保持消耗以维持后续条目确定性
      if (legacyGpsLossSlot) {
        rng();
        rng();
      }
    } else {
      // 保持随机序列消耗一致，避免影响后续条目的确定性
      rng();
      rng();
    }

    const month = 9 + Math.floor(rng() * 3);
    const day = 1 + Math.floor(rng() * 28);
    const createdAt = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 命中运单数 = 触发规则的停靠事件数（≤ 该点关联运单总数），车辆数与 evidence 文案保持一致。
    // 提取成局部变量是为了让 riskLevel 能由它派生——**buildAreaDiscovery 自带坐标种子，
    // 不消耗主 rng**，所以这次提取不改变随机序列节奏，300 条点位数据零漂移。
    const discovery = buildAreaDiscovery({
      source,
      areaType,
      lat,
      lng,
      createdAt,
      totalWaybillCount: waybillCount,
      radiusM,
      stayThresholdMin: preset.stayThresholdMin,
    });

    areas.push({
      id: `SA${String(i + 1).padStart(4, '0')}`,
      name,
      address: `${city.name}${district}${road}${num}号`,
      region: `${city.name} · ${district}`,
      waybillCount,
      lat,
      lng,
      radiusM,
      source,
      status,
      areaType,
      riskLevel: deriveRiskLevel(source, discovery),
      stayThresholdMin: preset.stayThresholdMin,
      evidence,
      createdAt,
      discovery,
    });
  }

  return areas;
}

// ===== 录入辅助（原型阶段：Mock 逆地理，不联网） =====

/** 西北走廊 / 宁夏城市池（客户干线沿途，Mock 逆地理用） */
const CORRIDOR_CITIES: GeoPoint[] = [
  { name: '乌鲁木齐市', lat: 43.8256, lng: 87.6168 },
  { name: '吐鲁番市', lat: 42.9513, lng: 89.1896 },
  { name: '哈密市', lat: 42.8185, lng: 93.5145 },
  { name: '敦煌市', lat: 40.1411, lng: 94.6619 },
  { name: '玉门市', lat: 40.292, lng: 97.045 },
  { name: '嘉峪关市', lat: 39.7731, lng: 98.2891 },
  { name: '酒泉市', lat: 39.7325, lng: 98.494 },
  { name: '张掖市', lat: 38.9259, lng: 100.4497 },
  { name: '武威市', lat: 37.9283, lng: 102.6347 },
  { name: '金昌市', lat: 38.5201, lng: 102.1876 },
  { name: '白银市', lat: 36.5447, lng: 104.1386 },
  { name: '兰州市', lat: 36.0611, lng: 103.8343 },
  { name: '中卫市', lat: 37.5003, lng: 105.1968 },
  { name: '吴忠市', lat: 37.9976, lng: 106.1984 },
  { name: '银川市', lat: 38.4872, lng: 106.2309 },
  { name: '灵武市', lat: 38.0965, lng: 106.3401 },
  { name: '青铜峡市', lat: 38.0215, lng: 106.0754 },
  { name: '中宁县', lat: 37.4915, lng: 105.6818 },
  { name: '景泰县', lat: 37.1935, lng: 104.0663 },
  { name: '古浪县', lat: 37.4705, lng: 102.8979 },
];

export interface ReverseGeoResult {
  province: string;
  city: string;
  district: string;
  region: string;
  address: string;
  suggestName: string;
  /**
   * 该坐标处的 POI 名称（如「鹏程中转库」）。**查不到时为空串**，
   * 调用方必须回退用 `address`——航哥 20261124：「自动获取POI名称，
   * 如果获取不到POI名称 就使用地址」。
   */
  poiName: string;
}

/**
 * POI 名称池：品牌前缀 × 设施类型，组合出「鹏程中转库」这类有真实感的名称。
 *
 * ⚠️ 这是**独立于 `SENSITIVE_DISTRICT` / `SENSITIVE_ROAD` 的另一套池子**：
 * 那两个拼的是行政地址（「玉门市示范镇物流大道43号」），这里拼的是 POI 名。
 * 两者语义不同，不能混用——地址是兜底，POI 名才是首选。
 */
const POI_BRANDS = [
  '鹏程', '恒通', '鑫源', '中汇', '宏图', '瑞丰', '通达', '金鹰', '陇原', '塞外',
  '华北', '江汉', '昌盛', '联合', '众诚', '汇通', '安泰', '永盛', '德邦', '冀东',
];
const POI_FACILITY = [
  '中转库', '洗煤厂', '物流园', '加水站', '停车场', '货场', '仓储中心', '搅拌站',
  '焦化厂', '配煤中心', '转运站', '堆煤场', '装卸点', '集散中心',
];

/**
 * 坐标 → POI 名称（Mock 逆地理的 POI 部分，正式上线由中台 POI 接口替换）。
 *
 * **查不到返回空串**，让调用方回退到地址。命中率刻意设成约 6 成而不是 100%：
 * 荒野/空地查不到 POI 是真实情况，也让「回退用地址」这条分支在演示里真的能被看到——
 * 全都命中等于这条兜底逻辑永远不执行，写错了也没人发现。
 *
 * ⚠️ **用独立种子，不复用 `mockReverseGeocode` 内部那个 rng**：
 * 共用会改变既有 rng 消耗节奏，导致同一坐标的 `address` 输出跟着变。
 */
export function mockPoiName(lat: number, lng: number): string {
  const rng = mulberry32(
    (Math.round(Math.abs(lat) * 1000) * 104729 + Math.round(Math.abs(lng) * 1000) * 31) >>> 0,
  );
  if (rng() > 0.6) return '';
  return `${pick(rng, POI_BRANDS)}${pick(rng, POI_FACILITY)}`.trim();
}

/** 从地名里按行政级别顺序切分：省/自治区 → 市/州 → 县/区 → 镇/乡 */
function parseAdminFromName(name: string) {
  let rest = name.trim();
  const grab = (re: RegExp) => {
    const matched = rest.match(re);
    if (matched) {
      rest = rest.slice(matched[0].length);
      return matched[0];
    }
    return '';
  };
  const province = grab(/^(.*?(?:维吾尔自治区|回族自治区|壮族自治区|自治区|省|北京市|天津市|上海市|重庆市))/);
  const city = grab(/^(.*?(?:市|自治州|地区|盟))/);
  const district = grab(/^(.*?(?:县|区|市|旗))/);
  const town = grab(/^(.*?(?:镇|乡|街道))/);
  return { province, city, district, town, rest };
}

function nearestCorridorCity(lat: number, lng: number) {
  let best = CORRIDOR_CITIES[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  CORRIDOR_CITIES.forEach((city) => {
    const dist = (city.lat - lat) ** 2 + (city.lng - lng) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  });
  return best;
}

/**
 * 坐标 → 省市区县 + 地址（原型用 Mock 逆地理，正式上线由中台逆地理接口替换）
 * 优先从用户给的地点名称里解析行政区（真实场景客户都会带地址），解析不出再用最近城市兜底。
 */
export function mockReverseGeocode(lat: number, lng: number, nameHint = ''): ReverseGeoResult {
  const admin = parseAdminFromName(nameHint);

  if (admin.province || admin.city || admin.district) {
    const city = admin.city || admin.district;
    const district = admin.district && admin.city ? admin.district : admin.town || admin.district;
    const region = [city, district].filter(Boolean).join(' · ');
    return {
      province: admin.province,
      city,
      district,
      region: region || admin.province,
      address: nameHint.trim(),
      suggestName: nameHint.trim(),
      poiName: mockPoiName(lat, lng),
    };
  }

  const nearest = nearestCorridorCity(lat, lng);
  const rng = mulberry32((Math.round(Math.abs(lat) * 1000) * 7919 + Math.round(Math.abs(lng) * 1000)) >>> 0);
  const road = pick(rng, SENSITIVE_ROAD);
  const num = 1 + Math.floor(rng() * 498);
  const district = admin.town || pick(rng, SENSITIVE_DISTRICT);
  const city = nearest.name;
  return {
    province: '',
    city,
    district,
    region: `${city} · ${district}`,
    address: nameHint.trim() || `${city}${district}${road}${num}号`,
    suggestName: nameHint.trim() || `${city}${district}`,
    poiName: mockPoiName(lat, lng),
  };
}

export interface ParsedAreaInput {
  lat: number;
  lng: number;
  name: string;
  remark: string;
  raw: string;
  lineNo: number;
  /** 校验消息；无问题为空串 */
  error: string;
  /** ok 可入库｜warn 可入库但需提示（自动纠正/重复合并）｜error 不可入库 */
  level: 'ok' | 'warn' | 'error';
  /** 与哪一行重复（0 表示不重复） */
  dupOf: number;
  /** 文本中显式给出的半径（米）；0 表示未指定，按点位类型取默认 */
  radiusM: number;
}

/** 半径建议区间（米），超出只提示不阻断 */
export const RADIUS_SUGGEST_RANGE: [number, number] = [100, 3000];

/** 地名特征字：用于从自然语言里挑出真正的地点名 */
const PLACE_TOKEN_RE = /(省|市|县|区|镇|乡|村|街道|路|街|矿|厂|园|场|站|港|仓库|物流|高速|收费站|服务区)/;

/** 对话式输入里要剔除的指令词（否则会当成地名） */
const COMMAND_WORDS = [
  '帮我把这个', '帮我把', '帮我', '把', '这个', '那个', '请', '麻烦', '需要', '想要', '给我',
  '录进', '录入', '加入', '添加', '新增', '写进', '存进', '存到', '登记', '标记', '设置', '配置',
  '知识库', '敏感区域', '敏感点', '敏感围栏', '电子围栏', '围栏', '点位', '地点', '区域', '窝点',
  '半径', '范围', '米', '公里', '千米', '注水', '换煤', '掺配', '洗煤厂', '的', '了', '在', '到',
];

/**
 * 从自然语言中挑出地点名：剔除坐标、半径、指令词后，取最长的含地名特征字的片段。
 * 例：「帮我把这个敏感区域录进知识库：98.123456, 40.123456 甘肃省酒泉市玉门市示范镇，半径300米」
 * → 「甘肃省酒泉市玉门市示范镇」
 */
/** 地名尾部的自然语言噪声（「玉门市示范镇有个」→「玉门市示范镇」） */
const NAME_TRAILING_NOISE_RE = /(?:有个|一个|这个|那个|这里|那里|这边|那边|附近|一带|地方|位置|坐标|也要加|要加|需要|应该)+$/;

export function extractPlaceName(text: string): string {
  const { cleaned } = extractRadiusFromLine(text);
  // 停留阈值片段同样要剔除，否则「停留15分钟」会混进地名
  const withoutStay = extractStayThresholdFromLine(cleaned).cleaned;
  let working = withoutStay.replace(/-?\d{1,3}\.\d+/g, ' ');
  COMMAND_WORDS.forEach((word) => {
    working = working.split(word).join(' ');
  });
  const tokens = working
    .replace(/[，,。；;：:！!？?、|\t（）()\[\]【】"']/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .map((token) => token.replace(NAME_TRAILING_NOISE_RE, ''))
    .filter((token) => token.length >= 3 && PLACE_TOKEN_RE.test(token));
  if (tokens.length === 0) return '';
  return tokens.reduce((longest, token) => (token.length > longest.length ? token : longest), tokens[0]!);
}

const KM_UNITS = ['km', '公里', '千米'];
/** 以小时计的停留时长单位 */
const STAY_HOUR_UNITS = ['小时', 'h', 'hour', 'hours'];

/**
 * 从一行文本里抽出「停留 / 停靠时长阈值」，并把该片段从文本中剔除
 * 支持：停留15分钟、停留 ≥30min、停车超过2小时、停靠10分钟以上、停留时间: 20 分钟
 */
export function extractStayThresholdFromLine(line: string): { stayThresholdMin: number; cleaned: string; matched: string } {
  const patterns = [
    /(?:停留|停靠|停车|驻车)[^，,。；;\n]{0,6}?(\d+(?:\.\d+)?)\s*(分钟|min|mins|小时|h|hours?)(?:以上|及以上)?/i,
    /(\d+(?:\.\d+)?)\s*(分钟|min|mins)\s*(?:以上|及以上)/i,
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (!m) continue;
    const value = Number(m[1]);
    const unit = (m[2] ?? '').toLowerCase();
    const minutes = STAY_HOUR_UNITS.includes(unit) ? Math.round(value * 60) : Math.round(value);
    // 夹逼到 1 分钟 ~ 24 小时，超出视为误匹配
    if (minutes > 0 && minutes <= 24 * 60) {
      return { stayThresholdMin: minutes, cleaned: line.replace(m[0], ' '), matched: m[0] };
    }
  }
  return { stayThresholdMin: 0, cleaned: line, matched: '' };
}

/**
 * 从一行文本里抽出半径/范围，并把该片段从文本中剔除（避免 0.5公里 被当成坐标）
 * 优先匹配带「半径/范围/围栏」关键词的写法，其次匹配裸的「数字+单位」
 */
export function extractRadiusFromLine(line: string): { radiusM: number; cleaned: string; matched: string } {
  // m 后面不能跟 in，否则「停留15min」会被当成半径 15 米
  const patterns = [
    /(?:半径|范围|围栏)\s*[:：约为是]?\s*(\d+(?:\.\d+)?)\s*(km|公里|千米|米|m(?!in))/i,
    /(\d+(?:\.\d+)?)\s*(km|公里|千米|米|m(?!in))/i,
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (!m) continue;
    const value = Number(m[1]);
    const unit = (m[2] ?? '').toLowerCase();
    const radiusM = KM_UNITS.includes(unit) ? Math.round(value * 1000) : Math.round(value);
    if (radiusM > 0) {
      return { radiusM, cleaned: line.replace(m[0], ' '), matched: m[0] };
    }
  }
  return { radiusM: 0, cleaned: line, matched: '' };
}

const LNG_RANGE: [number, number] = [73, 135];
const LAT_RANGE: [number, number] = [3, 54];
/** 同一点位判定半径（米），与高频停靠聚类口径一致 */
const DUP_RADIUS_M = 500;

/** 两点球面距离（米） */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function makeResult(partial: Partial<ParsedAreaInput> & { raw: string; lineNo: number }): ParsedAreaInput {
  return {
    lat: 0,
    lng: 0,
    name: '',
    remark: '',
    error: '',
    level: 'ok',
    dupOf: 0,
    radiusM: 0,
    ...partial,
  };
}

/**
 * 解析客户粘贴的点位文本（对齐客户样例格式：「经度, 纬度  地点名称  备注」）
 * 校验：坐标可解析、经纬度范围、经纬度是否填反、同坐标重复、500m 内近重复（聚类合并）
 */
export function parseAreaInputText(text: string): ParsedAreaInput[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const results: ParsedAreaInput[] = [];
  const seenExact = new Map<string, number>();
  const accepted: Array<{ lat: number; lng: number; lineNo: number }> = [];

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    // 跳过表头行（无坐标数字）
    if (/^(经纬度|经度|地点名称|序号|#)/.test(line) && !/\d{1,3}\.\d+/.test(line)) return;

    const { radiusM, cleaned } = extractRadiusFromLine(line);
    const numbers = cleaned.match(/-?\d{1,3}\.\d+/g) ?? [];
    if (numbers.length < 2) {
      results.push(makeResult({ raw: line, lineNo, radiusM, error: '未解析到经纬度（需两个小数坐标）', level: 'error' }));
      return;
    }

    let lng = Number(numbers[0]);
    let lat = Number(numbers[1]);
    let message = '';
    let level: ParsedAreaInput['level'] = 'ok';

    const lngOk = lng >= LNG_RANGE[0] && lng <= LNG_RANGE[1];
    const latOk = lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1];
    if (!lngOk || !latOk) {
      const swapOk = lat >= LNG_RANGE[0] && lat <= LNG_RANGE[1] && lng >= LAT_RANGE[0] && lng <= LAT_RANGE[1];
      if (swapOk) {
        const tmp = lng;
        lng = lat;
        lat = tmp;
        message = '经纬度顺序疑似填反，已自动纠正';
        level = 'warn';
      } else {
        results.push(makeResult({
          lat, lng, raw: line, lineNo,
          error: '坐标超出中国范围（经度 73–135 / 纬度 3–54）',
          level: 'error',
        }));
        return;
      }
    }

    const textPart = cleaned
      .replace(/-?\d{1,3}\.\d+/g, ' ')
      .replace(/[，,;；|\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const segments = textPart.split(' ').filter(Boolean);
    const name = segments[0] ?? '';
    const remark = segments.slice(1).join(' ');
    if (!name) {
      message = message ? `${message}；缺少地点名称` : '缺少地点名称';
      level = 'error';
    }

    // 判重：先精确坐标，再 500m 近重复
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    let dupOf = 0;
    if (seenExact.has(key)) {
      dupOf = seenExact.get(key)!;
      message = message ? `${message}；与第 ${dupOf} 行坐标完全重复（将合并）` : `与第 ${dupOf} 行坐标完全重复（将合并）`;
      if (level === 'ok') level = 'warn';
    } else {
      const near = accepted.find((p) => haversineMeters(p.lat, p.lng, lat, lng) <= DUP_RADIUS_M);
      if (near) {
        const dist = Math.round(haversineMeters(near.lat, near.lng, lat, lng));
        dupOf = near.lineNo;
        message = message
          ? `${message}；与第 ${near.lineNo} 行相距 ${dist}m，属同一点位（将合并）`
          : `与第 ${near.lineNo} 行相距 ${dist}m，属同一点位（将合并）`;
        if (level === 'ok') level = 'warn';
        seenExact.set(key, near.lineNo);
      } else {
        accepted.push({ lat, lng, lineNo });
        seenExact.set(key, lineNo);
      }
    }

    if (radiusM > 0 && (radiusM < RADIUS_SUGGEST_RANGE[0] || radiusM > RADIUS_SUGGEST_RANGE[1])) {
      message = message
        ? `${message}；半径 ${radiusM}m 超出建议区间 ${RADIUS_SUGGEST_RANGE[0]}–${RADIUS_SUGGEST_RANGE[1]}m，过大易误报`
        : `半径 ${radiusM}m 超出建议区间 ${RADIUS_SUGGEST_RANGE[0]}–${RADIUS_SUGGEST_RANGE[1]}m，过大易误报`;
      if (level === 'ok') level = 'warn';
    }

    results.push(makeResult({ lat, lng, name, remark, raw: line, lineNo, error: message, level, dupOf, radiusM }));
  });

  return results;
}
