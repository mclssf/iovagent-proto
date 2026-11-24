<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  BASE_MAP_OPTIONS,
  LINE_TIER_STYLES,
  MAP_LAYER_STYLES,
  applyBaseMapStyle,
  buildArcPoints,
  buildLineTooltipHtml,
  createArrowIcon,
  fitBoundsToLines,
  getLineTierMap,
  initBaseMap,
} from './mapShared';
import type { BaseMapStyle } from './mapShared';
import MapSearchBox from './MapSearchBox.vue';
// 通用表单弹窗：一个壳同时承载「录入」与「编辑」（航哥 20261124：
// 「能不能把那个弹窗做得稍微通用一点，既能够承载录入，也能够承载编辑」）。
// 原 SensitiveAreaIntakeDialog / SensitiveAreaEditDialog 两个文件已被它取代。
import SensitiveAreaFormDialog from './SensitiveAreaFormDialog.vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import {
  AREA_MARKER_STYLE,
  AREA_SOURCE_LABEL,
  AREA_TYPE_LABEL,
  AREA_TYPE_OPTIONS,
  DISCOVERY_RULES,
  RISK_THRESHOLD,
  RISK_BADGE_CLASS,
  RISK_COLOR,
  RISK_LABEL,
  RISK_ORDER,
  // AREA_NAME_MAX / clampAreaName 已随内联编辑面板搬进 SensitiveAreaFormDialog：
  // 名称上限的校验只应有一处，录入与编辑共用那张卡，父组件不再重复实现
  areaDisplayName,
  areaPointColor,
  // areaZRank = 地图**绘制**层级（低→中→高→人工），与列表排序是两套东西，别混用
  areaZRank,
  MANUAL_AREA_COLOR,
  isUnnamedArea,
  MAP_SEMANTIC_COLOR,
  formatRadius,
  getAggLines,
  getTop20Lines,
} from './mockData';
import {
  MAP_MODE_TABS,
  SECTION_MODE_TABS,
  SENSITIVE_VIEW_TABS,
  assetMapState,
  requestMapFlyTo,
  setRouteMode,
  setSection,
  setSensitiveView,
} from './assetMapStore';
import { getRouteGeometry, resamplePath } from './trajectoryMock';
import type { RouteGeometry } from './trajectoryMock';
// trajectoryAgg（五步聚合流水线）已从 UI 下线：航哥 20261123 两次要求「轨迹聚合这一块整体去掉」。
// 模块与 generateTrajectoryPool 保留在数据层但无消费方，不要再 import 回来。
import { buildAreaLineIndex, buildLineSensitiveMap } from './lineSensitiveStats';
import { buildWaybillPath, formatDuration, formatTs, getWaybillDataset, hitDepartTs, waybillsOfVehicle } from './waybillMock';
import type { MockWaybill, WaybillAreaHit } from './waybillMock';
import type { AreaLineRef, AreaStopStat, LineSensitiveStats } from './lineSensitiveStats';
import SensitiveAreaDetailPanel from './SensitiveAreaDetailPanel.vue';
import type { MapMode } from './assetMapStore';
import type { AggDimension, AggLine, RiskLevel, SensitiveArea } from './mockData';
// updateSensitiveArea 已搬进 SensitiveAreaFormDialog（编辑落库由弹窗自己负责，
// 校验与写库放在一起，避免父组件与弹窗各持一半逻辑）
import {
  deleteSensitiveArea,
  sensitiveAreaState,
} from './sensitiveAreaStore';


/** 页面内录入弹窗（不跳对话框） */
const intakeDialogVisible = ref(false);

/**
 * 「AI 识别规则」浮框的悬停态（航哥 20261123：「要有一个 icon，鼠标触碰就显示一个浮框，
 * 然后敏感区域里只有一个 icon 能看就行，我想着是加到敏感区域列表的上面标题那里」）。
 *
 * ⚠️ **hover 判定必须挂在 icon + 浮框的共同父容器上**，不能只挂在 icon 上：
 * 只挂 icon 的话，鼠标从 icon 移向浮框要跨过 `mt-1` 的 4px 间隙，一离开 icon 就 mouseleave，
 * 浮框在鼠标够到之前就已经关了——和之前浮窗 mouseout 关闭是同一类错误。
 */
const aiRuleHover = ref(false);
/**
 * ⚠️ **必须延时关闭**：浮框不再嵌在 icon 容器内（见模板注释：嵌在里面会被右栏
 * `overflow-hidden` 裁掉左侧），两者成了兄弟节点，中间隔着 header 的下边距。
 * 鼠标从 icon 移向浮框时会先触发 icon 的 mouseleave —— 若立即关闭，浮框在鼠标够到之前就没了，
 * 用户没法选中/复制里面的规则文字。给 160ms 宽限，浮框自己再 mouseenter 就把定时器取消。
 * （与地图浮窗"不能在 mouseout 关"是同一类问题。）
 */
let aiRuleHideTimer = 0;
function showAiRule() {
  window.clearTimeout(aiRuleHideTimer);
  aiRuleHover.value = true;
}
function hideAiRule() {
  window.clearTimeout(aiRuleHideTimer);
  aiRuleHideTimer = window.setTimeout(() => { aiRuleHover.value = false; }, 160);
}

/**
 * 风险分级的区间文案，由 RISK_THRESHOLD 派生。
 * ⚠️ 不要写死 70 / 35：阈值改了这里必须跟着变，否则浮框讲的规则和实际分级对不上。
 */
const aiRuleRiskRows = computed(() => [
  { level: 'high' as RiskLevel, label: RISK_LABEL.high, text: `≥ ${RISK_THRESHOLD.high} 单` },
  { level: 'mid' as RiskLevel, label: RISK_LABEL.mid, text: `${RISK_THRESHOLD.mid} ~ ${RISK_THRESHOLD.high - 1} 单` },
  { level: 'low' as RiskLevel, label: RISK_LABEL.low, text: `< ${RISK_THRESHOLD.mid} 单` },
]);

// ===== 数据 =====

const top20Lines = getTop20Lines();

/** 点位来源筛选：全部 / 人工发现 / AI识别 */
type SourceFilter = 'all' | 'manual' | 'ai';
const SOURCE_FILTERS: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'manual', label: '人工发现' },
  { id: 'ai', label: 'AI识别' },
];
const sourceFilter = ref<SourceFilter>('all');

/**
 * 风险等级子筛选（航哥 20261123：「切到AI识别的时候，也要加一个风险等级切换，相当于一个子tab切换」）。
 * **只在来源筛选 = AI识别 时出现**：人工发现点位不定级（riskLevel 恒为 null），
 * 在「全部 / 人工发现」下显示这组子 tab 会得到空结果，属于无效控件。
 */
type RiskFilter = 'all' | RiskLevel;
const RISK_FILTERS: Array<{ id: RiskFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'high', label: '高风险' },
  { id: 'mid', label: '中风险' },
  { id: 'low', label: '低风险' },
];
const riskFilter = ref<RiskFilter>('all');
const showRiskFilter = computed(() => sourceFilter.value === 'ai');
/** 各档点位数，直接标在子 tab 上，客户不用点进去才知道有多少 */
const riskFilterCount = computed<Record<string, number>>(() => {
  const ai = allAreas.value.filter((a) => a.source === 'ai');
  return {
    all: ai.length,
    high: ai.filter((a) => a.riskLevel === 'high').length,
    mid: ai.filter((a) => a.riskLevel === 'mid').length,
    low: ai.filter((a) => a.riskLevel === 'low').length,
  };
});

/** 全部点位（含对话框新录入的，响应式） */
const allAreas = computed<SensitiveArea[]>(() => sensitiveAreaState.areas);

/**
 * 当前筛选下可见的点位。
 *
 * 排序（航哥 20261123 改）：**按异常停靠运单数降序**。
 * 确认机制已下线，不再有「待确认优先」这一档；300 个点位翻 15 页时，
 * 第一页必须是单数最多的，而不是生成器顺序（对客户等于任意顺序）。
 * 注意必须返回新数组（[...list].sort），原地 sort 会改到 store 里的 areas。
 */
const visibleAreas = computed<SensitiveArea[]>(() => {
  const list = allAreas.value.filter((area) => {
    if (sourceFilter.value !== 'all' && area.source !== sourceFilter.value) return false;
    // 风险等级子筛选：只在来源=AI 时生效（人工发现不定级，不该被这层筛掉）
    if (showRiskFilter.value && riskFilter.value !== 'all' && area.riskLevel !== riskFilter.value) return false;
    return true;
  });
  return [...list].sort((a, b) => (b.discovery?.waybillCount ?? 0) - (a.discovery?.waybillCount ?? 0));
});

/**
 * 点位配色：**颜色 = 风险等级**（AI 高红/中橙/低黄），人工发现走独立 violet + 更大尺寸。
 * 统一转发到 `areaPointColor`，不在组件里另拼颜色，避免同一含义出现两种色值。
 */
function areaColor(area: SensitiveArea) {
  return areaPointColor(area);
}

const DIMENSION_TABS: Array<{ id: AggDimension; label: string }> = [
  { id: 'province', label: '省 - 省' },
  { id: 'city', label: '市 - 市' },
  { id: 'county', label: '县 - 县' },
];

/** 聚合维度：唯一写入方是地图右上角的 tab（走 setRouteMode）；地图在其他模式时保留上次维度 */
const dimension = computed<AggDimension>(() =>
  assetMapState.mode === 'province' || assetMapState.mode === 'city' || assetMapState.mode === 'county'
    ? assetMapState.mode
    : assetMapState.routeMode,
);

/** 当前分区下地图可用的模式 tab（总览 / 敏感区域 由二级导航决定，不显示 tab） */
const visibleModeTabs = computed(() =>
  MAP_MODE_TABS.filter((tab) => SECTION_MODE_TABS[assetMapState.section].includes(tab.id)),
);

const isLineMode = computed(() => assetMapState.mode !== 'sensitive');
const isTop20 = computed(() => assetMapState.mode === 'top20');
const currentLines = computed<AggLine[]>(() => {
  if (assetMapState.mode === 'top20') return top20Lines;
  if (assetMapState.mode === 'province' || assetMapState.mode === 'city' || assetMapState.mode === 'county') {
    return getAggLines(assetMapState.mode);
  }
  return [];
});

// ===== 线路 ↔ 敏感区域 关联 =====

/** 参与线路关联统计的点位：确认/忽略机制已下线，全部点位都计入 */
const countableAreas = computed<SensitiveArea[]>(() => allAreas.value);

/**
 * 线路 → 敏感停靠统计（只算当前维度的线路）
 * 总览（top20）不展示任何敏感区域信息，四处读取点都有 isTop20 守卫 → 这里直接不算，
 * 否则每次多算 20 条无人读取的线路（总览下 currentLines 就是 top20，会同一条算两遍）；
 * 更重要的是留着这批数据等于埋雷：将来谁去掉一处 isTop20 守卫，总览就会冒出敏感点位。
 */
const lineSensitiveMap = computed(() => (
  isTop20.value ? new Map<string, LineSensitiveStats>() : buildLineSensitiveMap(currentLines.value, countableAreas.value)
));

// ===== 敏感区域「路线」视图（航哥 20261120：地图里加 tab，选某工厂→某工厂，画真实轨迹 + 只标该线路命中的红点）=====

/** 线路选择范围固定为市到市：点位↔线路关联本就只统计市到市（省是市的上卷，跨维度会重复计数） */
const sensitiveLines = getAggLines('city');

const isSensitiveByLine = computed(() => (
  assetMapState.mode === 'sensitive' && assetMapState.sensitiveView === 'byLine'
));

/**
 * 市到市线路 → 敏感停靠统计。
 * 必须走 buildLineSensitiveMap（带跨线路对账），不能逐线直调 buildLineSensitiveStats，
 * 否则拿到的是未对账数字，会与点位详情面板对不上（指标铁律 14）。
 */
const sensitiveLineStats = computed(() => (
  isSensitiveByLine.value
    ? buildLineSensitiveMap(sensitiveLines, countableAreas.value)
    : new Map<string, LineSensitiveStats>()
));

const selectedSensitiveLine = computed<AggLine | null>(() => (
  sensitiveLines.find((line) => line.id === assetMapState.sensitiveLineId) ?? null
));

/** 选中线路的真实路网几何，按 lineId 缓存（烘焙 JSON 查表 + 抽稀，很便宜但仍不必重复做） */
const geometryCache = new Map<string, RouteGeometry>();

/**
 * 选中线路的道路几何。
 * 原 `selectedTrajectory` 还会跑 `generateTrajectoryPool` + `aggregateTrajectories`（五步聚合，~30ms/条），
 * 聚合块从 UI 下线后这些都成了无人消费的计算，一并去掉——**只剩几何**。
 */
const selectedLineGeometry = computed<RouteGeometry | null>(() => {
  const line = selectedSensitiveLine.value;
  if (!line) return null;
  let geom = geometryCache.get(line.id);
  if (!geom) {
    geom = getRouteGeometry(line);
    geometryCache.set(line.id, geom);
  }
  return geom;
});

/**
 * 选中线路命中的点位 —— **只有这些点会渲染**，其余点位一律不显示（航哥明确要求）。
 * 命中集合与抽屉/详情面板同源（都出自对账后的 sensitiveLineStats），保证跨视图数字一致。
 */
const selectedLineHitAreas = computed<SensitiveArea[]>(() => {
  const line = selectedSensitiveLine.value;
  if (!line) return [];
  const stats = sensitiveLineStats.value.get(line.id);
  if (!stats || stats.stats.length === 0) return [];
  const ids = new Set(stats.stats.map((item) => item.area.id));
  return countableAreas.value.filter((area) => ids.has(area.id));
});

/**
 * 选中线路的对账后敏感停靠统计。面板六卡、命中清单、地图浮窗**共用这一个来源**，
 * 保证"面板写 47 单、浮窗写 47 单、清单加总 ≥ 47 单"这种跨位置一致性（指标铁律 14）。
 */
const selectedLineStat = computed<LineSensitiveStats | null>(() => {
  const line = selectedSensitiveLine.value;
  return line ? (sensitiveLineStats.value.get(line.id) ?? null) : null;
});

function selectSensitiveLine(lineId: string) {
  // 再次点击已选中的线路 = 取消选中，回到该分区的全量点位视角
  if (assetMapState.sensitiveLineId === lineId) {
    assetMapState.sensitiveLineId = '';
    return;
  }
  assetMapState.sensitiveLineId = lineId;
  // 线路视角下点位详情/编辑态无意义，先收起，避免右栏三态互相盖
  detailAreaId.value = '';
  editingAreaId.value = '';
  assetMapState.selectedAreaId = '';
}

/** 选中线路命中点位的 marker 登记表：点列表项时要能定位并开浮窗 */
const lineHitMarkers = new Map<string, L.CircleMarker>();

/** 选中线路命中点位 id → 本线明细（浮窗与面板共用） */
const hitStatOf = (areaId: string): AreaStopStat | undefined => {
  const line = selectedSensitiveLine.value;
  if (!line) return undefined;
  return sensitiveLineStats.value.get(line.id)?.stats.find((item) => item.area.id === areaId);
};

/** 选中线路命中点位 id → 明细 */
const selectedLineHits = computed(() => {
  const line = currentLines.value.find((item) => item.id === assetMapState.selectedLineId);
  if (!line) return new Map<string, AreaStopStat>();
  const stats = lineSensitiveMap.value.get(line.id);
  return new Map((stats?.stats ?? []).map((item) => [item.area.id, item]));
});

/**
 * 点位 → 关联线路 反向索引
 * 直接归集正向 buildLineSensitiveStats 的结果，保证点位详情与线路详情里的数字完全一致
 * 120 条线路 × 点位数，实测 ~21ms；仅在点位集合变化时重算
 */
/**
 * 只保留「市到市」：省到省是市到市的上卷，同时列出来会把同一次停靠重复计数，
 * 县到县颗粒过细、噪音大。面板 / 列表行 / 地图浮窗三处都读这个索引，口径天然一致。
 */
const areaLineIndex = computed(() => {
  const all = buildAreaLineIndex(countableAreas.value);
  const cityOnly = new Map<string, AreaLineRef[]>();
  all.forEach((refs, areaId) => {
    const cityRefs = refs.filter((ref) => ref.mode === 'city');
    if (cityRefs.length > 0) cityOnly.set(areaId, cityRefs);
  });
  return cityOnly;
});

/** 右栏详情态：地图上点选点位 / 列表「详情」进入 */
const detailAreaId = ref('');

const detailArea = computed<SensitiveArea | null>(
  () => allAreas.value.find((area) => area.id === detailAreaId.value) ?? null,
);

const detailLineRefs = computed<AreaLineRef[]>(() =>
  detailArea.value ? (areaLineIndex.value.get(detailArea.value.id) ?? []) : [],
);

function openAreaDetail(area: SensitiveArea) {
  editingAreaId.value = '';
  detailAreaId.value = area.id;
}

function closeAreaDetail() {
  detailAreaId.value = '';
}

/**
 * 路线视角已于 20261123 隐藏（航哥：「把敏感区域和运单中间的那条路线整个给我删掉，这个我先不要」），
 * 点位详情「途经线路明细」的跳转目标不存在了，所以该 emit 落到这个空实现。
 * 保留函数而不删 emit：路线视角一旦恢复，把 SensitiveAreaDetailPanel 的行改回可点击即可。
 * 原实现（恢复时照抄）：closeAreaDetail() → setSensitiveView('byLine') → sensitiveLineId = lineId，
 * **顺序不能反**——setSensitiveView('all') 会清 sensitiveLineId，先写就被清掉。
 */
function onOpenLineRemoved(_lineId: string) { /* 路线视角已隐藏，暂无跳转目标 */ }

/** 详情面板「查看对应车辆 / 运单」→ 复用浮窗里那两个链接的同一条路径 */
function onDetailViewVehicles(areaId: string) {
  const area = allAreas.value.find((a) => a.id === areaId);
  if (area) openVehiclesOfArea(area);
}
function onDetailViewWaybills(areaId: string) {
  const area = allAreas.value.find((a) => a.id === areaId);
  if (area) openWaybillsOfArea(area);
}

/** @deprecated 路线视角隐藏后不再可达，保留供恢复时参考 */
function openLineFromAreaDetail(lineId: string) {
  detailAreaId.value = '';
  assetMapState.selectedAreaId = '';
  setSensitiveView('byLine');
  assetMapState.sensitiveLineId = lineId;
}

function editFromDetail() {
  const area = detailArea.value;
  if (!area) return;
  detailAreaId.value = '';
  startEditArea(area);
}

/** 点位关联线路摘要（地图浮窗用）：只列 TOP3 线路名，不带停靠次数 */
function areaLineBrief(area: SensitiveArea) {
  const refs = areaLineIndex.value.get(area.id) ?? [];
  if (refs.length === 0) return '暂无';
  return refs
    .slice(0, 3)
    .map((ref) => `${ref.line.from}→${ref.line.to}`)
    .join('、');
}

/** 列表行副标：关联线路里停靠最多的一条（只显示线路名，不显示停靠次数） */
function areaTopLine(area: SensitiveArea) {
  const top = (areaLineIndex.value.get(area.id) ?? [])[0];
  return top ? `${top.line.from}→${top.line.to}` : '';
}

const panelTitle = computed(() => {
  switch (assetMapState.mode) {
    case 'top20': return `精选路线 Top ${top20Lines.length}`;
    case 'province': return '省 - 省 聚合线路';
    case 'city': return '市 - 市 聚合线路';
    case 'county': return '县 - 县 聚合线路';
    case 'sensitive':
      if (isSensitiveByLine.value) {
        return selectedSensitiveLine.value
          ? `${selectedSensitiveLine.value.from} → ${selectedSensitiveLine.value.to}`
          : `路线 · 共 ${sensitiveLines.length} 条市到市`;
      }
      if (isSensitiveByWaybill.value) {
        // 「运单」→「异常运单」（航哥 20261123），列表态与选中态都要改，
        // 只改一个会出现"tab 叫异常运单、标题叫运单"的两套口径
        return selectedWaybill.value
          ? `异常运单 ${selectedWaybill.value.waybillNo}`
          : `异常运单 · 命中 ${matchedWaybills.value.length} 单`;
      }
      return `敏感区域 · ${visibleAreas.value.length} 个点位`;
  }
});

/**
 * 当前筛选口径的一句话描述，跟在「当前显示 N 个点位」后面。
 * 地图左下说明必须与地图上真实画出的点位口径一致，否则客户会以为地图漏画。
 */
const sensitiveFilterDesc = computed(() => {
  const list = visibleAreas.value;
  const manual = list.filter((a) => a.source === 'manual').length;
  const ai = list.filter((a) => a.source === 'ai').length;
  if (sourceFilter.value === 'manual') return '（来源：人工发现，不定级）';
  if (sourceFilter.value === 'ai') {
    if (riskFilter.value === 'all') return `（来源：AI识别，高 ${list.filter((a) => a.riskLevel === 'high').length} / 中 ${list.filter((a) => a.riskLevel === 'mid').length} / 低 ${list.filter((a) => a.riskLevel === 'low').length}）`;
    return `（来源：AI识别 · 风险等级：${RISK_LABEL[riskFilter.value]}）`;
  }
  return `（全部来源：人工发现 ${manual} · AI识别 ${ai}）`;
});

const modeDescription = computed(() => {
  switch (assetMapState.mode) {
    case 'top20': return `总览 Top 20 · 展示运单量最高的 20 条地市间路线，箭头方向为运输流向`;
    case 'province': return '省 - 省 聚合 · 省会 → 省会 · 灰点为全部敏感区域，点击飞线看途经敏感停靠';
    case 'city': return '市 - 市 聚合 · 市中心 → 市中心 · 灰点为全部敏感区域，点击飞线看途经敏感停靠';
    case 'county': return '县 - 县 聚合 · 县中心 → 县中心 · 灰点为全部敏感区域，点击飞线看途经敏感停靠';
    case 'sensitive': {
      // 路线视角：说明当前线路与命中点位数，全量点位统计在此视角下是干扰信息
      if (isSensitiveByLine.value) {
        const line = selectedSensitiveLine.value;
        if (!line) return `路线全览 · 已渲染全部 ${sensitiveLines.length} 条市到市线路的真实道路轨迹（三档色 = 运单量高/中/低）· 叠加全部敏感区域点位 · 点击线路查看其命中点位`;
        // 注：本分支在「路线」视角隐藏后不可达；文案已同步改成来源色口径（不再说"红点"），恢复时直接可用
        return `${line.from} → ${line.to} · 真实轨迹已渲染 · 命中 ${selectedLineHitAreas.value.length} 个敏感区域（其余点位不显示）· 点击点位查看其本线停靠情况`;
      }
      // 运单视角：说明当前运单与其命中点位数
      if (isSensitiveByWaybill.value) {
        const wb = selectedWaybill.value;
        if (!wb) return `异常运单 · 支持按点位名 / 车牌号 / 运单号检索，列表只收录在敏感区域产生过停靠的运单`;
        return `${wb.vehicleNo} · ${wb.from} → ${wb.to} · 真实轨迹已渲染 · 途经 ${selectedWaybillHitAreas.value.length} 个敏感区域（颜色 = 风险等级，其余点位不显示）· 底部可播放轨迹回放`;
      }
      // 检索框只检索点位（车牌/运单检索已移到运单视角），文案不能再提"车牌号/运单号"
      //
      // ⚠️ **本行统计必须取 visibleAreas，不能取 allAreas**：地图画的是筛选后的点位，
      // 说明文字却恒报全量 134/166，切到「高风险」时地图只剩 38 个点、文字还说 166 个，
      // 客户会以为地图漏画了。文案与地图口径必须一致。
      return `敏感区域 · 当前显示 ${visibleAreas.value.length} 个点位${sensitiveFilterDesc.value} · 悬停或点击点位看风险等级与备注`;
    }
  }
});

function formatNumber(num: number) {
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return num.toLocaleString();
}

// ===== 右侧列表分页 =====

const LIST_PAGE_SIZE = 20;
const listPage = ref(1);

const currentListTotal = computed(() => {
  if (assetMapState.mode === 'top20') return top20Lines.length;
  if (assetMapState.mode === 'sensitive') {
    // 路线视角下分页对象是线路（40 条）；运单视角下分页对象是运单明细；都不是点位
    if (isSensitiveByLine.value && !selectedSensitiveLine.value) return sensitiveLines.length;
    // 运单视角：归并视图分页对象是车辆，否则是运单明细。
    // 已选中某一单时返回 0 → 分页条整体隐藏（航哥 20261123：详情页里不该再出现"共N条/N页"）
    if (isSensitiveByWaybill.value && !selectedWaybill.value) {
      return groupWaybillByVehicle.value ? vehicleGroups.value.length : visibleWaybills.value.length;
    }
    if (isSensitiveByWaybill.value) return 0;
    return visibleAreas.value.length;
  }
  return currentLines.value.length;
});
const listPageCount = computed(() => Math.max(1, Math.ceil(currentListTotal.value / LIST_PAGE_SIZE)));
const pageStart = computed(() => (listPage.value - 1) * LIST_PAGE_SIZE);

const pagedTop20 = computed(() => top20Lines.slice(pageStart.value, pageStart.value + LIST_PAGE_SIZE));
const pagedAggLines = computed(() => currentLines.value.slice(pageStart.value, pageStart.value + LIST_PAGE_SIZE));
const pagedAreas = computed(() => visibleAreas.value.slice(pageStart.value, pageStart.value + LIST_PAGE_SIZE));

/** 路线视角的线路列表分页（40 条市到市，每页 20） */
const pagedSensitiveLines = computed(() => (
  sensitiveLines.slice(pageStart.value, pageStart.value + LIST_PAGE_SIZE)
));

/**
 * 运单视角的运单列表分页。
 * 列表是**全量异常单**（不再有总量截断），只按每页 LIST_PAGE_SIZE 条分页。
 */
const pagedWaybills = computed(() => (
  visibleWaybills.value.slice(pageStart.value, pageStart.value + LIST_PAGE_SIZE)
));

/** 本单累计停靠分钟数（各点位停留时长求和；次数可加，不涉及实体重复计数） */
const waybillTotalStayMin = computed(() => (
  selectedWaybill.value?.hits.reduce((sum, h) => sum + h.stayMin, 0) ?? 0
));

/** 本单命中的点位名摘要（最多列 3 个，超出用「等」收尾） */
const waybillHitNames = computed(() => {
  const names = waybillHitRows.value.map((row) => row.hit.areaName);
  if (names.length <= 3) return names.join('、');
  return `${names.slice(0, 3).join('、')} 等`;
});

/**
 * 选中运单的停靠明细行：**按停靠时刻先后排序**（航哥 20261123：「排序就按停靠时间的先后次序排序就行」），
 * 序号 1..N 即地图上的 ①②③ 标记，两者必须一一对应。
 *
 * ⚠️ `waybillMock` 里 `hits` 已按 `arriveTs` 升序排过，但**不依赖上游的隐式顺序**（与运单列表排序同理）：
 * 这里显式再排一次，让"时间先后"成为本组件自己的契约。上游哪天改了排序，这里不会静默错乱。
 * ⚠️ 必须 `[...]` 拷贝后再 sort，`wb.hits` 是数据集里的原数组，原地 sort 会污染 mock 数据。
 */
const waybillHitRows = computed(() => {
  const wb = selectedWaybill.value;
  if (!wb) return [];
  const byId = new Map(countableAreas.value.map((a) => [a.id, a]));
  return [...wb.hits]
    .sort((a, b) => a.arriveTs - b.arriveTs)
    .map((hit, idx) => ({
      seq: idx + 1,
      hit,
      area: byId.get(hit.areaId) ?? null,
    }));
});

/**
 * 选中线路的命中点位行，按「本线运单数」降序。
 * 航哥要求"所有敏感点都要有一个入口可以进入"——这里全部列出且每行可点开详情，
 * 不做 TOP3 截断（TOP3 是路线分区抽屉的口径，敏感区域分区的重点是点位本身）。
 */
const hitAreaRows = computed(() => {
  const line = selectedSensitiveLine.value;
  if (!line) return [];
  const stats = sensitiveLineStats.value.get(line.id);
  if (!stats) return [];
  return [...stats.stats]
    .sort((a, b) => b.waybills - a.waybills || b.stops - a.stops)
    .map((item) => ({ area: item.area, waybills: item.waybills, stops: item.stops, vehicles: item.vehicles }));
});

watch(() => assetMapState.mode, () => {
  listPage.value = 1;
});
watch(dimension, () => {
  listPage.value = 1;
});

function prevListPage() {
  if (listPage.value > 1) listPage.value -= 1;
}
function nextListPage() {
  if (listPage.value < listPageCount.value) listPage.value += 1;
}

// ===== 地图 =====

const mapRef = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
const layers: Record<string, L.Layer> = {};
/** 线路模式下命中点位的 marker：抽屉点「命中点位」时要在地图上开同一个敏感区域浮窗 */
const routeAreaMarkers = new Map<string, L.CircleMarker>();
const SEGMENTS = 24;

function clearLayers() {
  Object.values(layers).forEach((layer) => {
    if (map) map.removeLayer(layer);
  });
  Object.keys(layers).forEach((key) => delete layers[key]);
}

function drawLineMode() {
  if (!map) return;
  clearLayers();

  const lines = currentLines.value;
  if (lines.length === 0) return;
  const tierMap = getLineTierMap(lines);
  const selectedId = assetMapState.selectedLineId;
  const hasSelection = !!selectedId;

  lines.forEach((line) => {
    const tierStyle = tierMap[line.id] ?? LINE_TIER_STYLES.mid;
    const isSelected = line.id === selectedId;
    const dimOthers = hasSelection && !isSelected;
    const arcPoints = buildArcPoints(line.fromLat, line.fromLng, line.toLat, line.toLng);
    const lineColor = tierStyle.color;
    const lineWeight = isSelected ? tierStyle.weight + 1 : tierStyle.weight;

    for (let i = 0; i < SEGMENTS; i += 1) {
      const segStart = Math.max(0, Math.floor((i / SEGMENTS) * (arcPoints.length - 1)) - 1);
      const segEnd = Math.min(arcPoints.length - 1, Math.floor(((i + 1) / SEGMENTS) * (arcPoints.length - 1)) + 1);
      const segPoints = arcPoints.slice(segStart, segEnd + 1);
      if (segPoints.length < 2) continue;
      const t = i / SEGMENTS;
      let opacity = 0.05 + 0.9 * t;
      if (dimOthers) opacity *= 0.3;

      const segLine = L.polyline(segPoints, {
        color: lineColor,
        weight: lineWeight,
        opacity: isSelected ? Math.min(opacity + 0.1, 1) : opacity,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
      }).addTo(map!);
      layers[`${line.id}-seg-${i}`] = segLine;
    }

    const hitLine = L.polyline(arcPoints, {
      color: tierStyle.color,
      weight: Math.max(tierStyle.weight + 6, 12),
      opacity: 0,
      interactive: true,
    }).addTo(map!);
    // 总览视图不带敏感停靠信息
    const sensitiveStats = isTop20.value ? undefined : lineSensitiveMap.value.get(line.id);
    hitLine.bindTooltip(
      buildLineTooltipHtml(
        line,
        sensitiveStats
          ? {
              waybills: sensitiveStats.waybills,
              areaCount: sensitiveStats.areaCount,
              vehicles: sensitiveStats.vehicles,
            }
          : undefined,
      ),
      {
      direction: 'top',
      sticky: true,
      opacity: 1,
      className: 'line-tooltip',
      offset: [0, -8],
    });
    // Top20 为只读视图；聚合维度点击打开抽屉详情
    if (!isTop20.value) hitLine.on('click', () => {
      assetMapState.selectedLineId = line.id;
    });
    hitLine.on('mouseover', () => {
      for (let i = 0; i < SEGMENTS; i += 1) {
        (layers[`${line.id}-seg-${i}`] as L.Polyline | undefined)?.setStyle({ weight: lineWeight + 1 });
      }
    });
    hitLine.on('mouseout', () => {
      for (let i = 0; i < SEGMENTS; i += 1) {
        (layers[`${line.id}-seg-${i}`] as L.Polyline | undefined)?.setStyle({ weight: lineWeight });
      }
    });
    layers[line.id] = hitLine;

    const midPoint = arcPoints[Math.floor(arcPoints.length / 2)] as [number, number];
    const angle = (Math.atan2(-(line.toLat - line.fromLat), line.toLng - line.fromLng) * 180) / Math.PI;
    const arrowMarker = L.marker(midPoint, {
      icon: createArrowIcon(tierStyle.color),
      interactive: false,
    }).addTo(map!);
    const img = arrowMarker.getElement()?.querySelector('img') as HTMLImageElement | null;
    if (img) {
      img.style.transform = `rotate(${angle}deg)`;
      img.style.transformOrigin = 'center';
    }
    arrowMarker.setOpacity(dimOthers ? 0.25 : 1);
    layers[`${line.id}-arrow`] = arrowMarker;

    const fromMarker = L.circleMarker([line.fromLat, line.fromLng], {
      radius: isSelected ? 4.5 : 3,
      color: '#ffffff',
      fillColor: tierStyle.color,
      fillOpacity: dimOthers ? 0.35 : 1,
      weight: 1.5,
    }).addTo(map!);
    layers[`${line.id}-from`] = fromMarker;

    const toMarker = L.circleMarker([line.toLat, line.toLng], {
      radius: isSelected ? 5 : 3.5,
      color: '#ffffff',
      fillColor: tierStyle.color,
      fillOpacity: dimOthers ? 0.35 : 1,
      weight: 1.5,
    }).addTo(map!);
    layers[`${line.id}-to`] = toMarker;
  });

  // 总览（精选路线 Top20）不铺敏感区域点位，避免与主干流向抢视觉
  if (!isTop20.value) drawRouteSensitiveAreas(hasSelection);
}

/** 线路模式下命中点位的浮窗：带上本线路的停靠统计 */
function buildRouteAreaTooltipHtml(area: SensitiveArea, hit?: AreaStopStat) {
  if (hit) {
    return `<div class="line-tooltip-content">
    <div class="line-tooltip-title">${areaDisplayName(area)}</div>
    <div class="line-tooltip-row"><span>本线运单</span><b style="color:#dc2626">${hit.waybills.toLocaleString()} 单</b></div>
    <div class="line-tooltip-row"><span>本线车辆</span><b>${hit.vehicles.toLocaleString()} 辆</b></div>
    <div class="line-tooltip-row"><span>来源</span><b>${AREA_SOURCE_LABEL[area.source]}</b></div>
  </div>`;
  }
  return `<div class="line-tooltip-content">
    <div class="line-tooltip-title">${areaDisplayName(area)}</div>
    <div class="line-tooltip-row"><span>敏感半径</span><b>${formatRadius(area.radiusM)}</b></div>
    <div class="line-tooltip-row"><span>来源</span><b>${AREA_SOURCE_LABEL[area.source]}</b></div>
  </div>`;
}

/**
 * 线路模式下铺敏感区域点位：
 * - 未选中线路：全部点位铺底（灰色小点），让用户先看到"整张图上有哪些敏感区域"
 * - 选中某条线路：该线路命中的点位红色高亮 + 画敏感半径圈，其余淡出
 * 所有图层都登记进 layers，切模式时才能被 clearLayers 清干净
 */
function drawRouteSensitiveAreas(hasSelection: boolean) {
  if (!map) return;
  // 每次重绘 marker 都是新建的，旧引用必须清掉，否则 openPopup 会作用在已移除的图层上
  routeAreaMarkers.clear();
  const hits = selectedLineHits.value;

  countableAreas.value.forEach((area) => {
    const hit = hits.get(area.id);
    const isHit = !!hit;
    const dimmed = hasSelection && !isHit;

    if (isHit) {
      const circle = L.circle([area.lat, area.lng], {
        radius: area.radiusM,
        color: '#dc2626',
        weight: 1,
        dashArray: '4 4',
        fillColor: '#dc2626',
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(map!);
      layers[`route-sa-circle-${area.id}`] = circle;
    }

    const marker = L.circleMarker([area.lat, area.lng], {
      radius: isHit ? 5.5 : 2.5,
      color: isHit ? '#ffffff' : '#ffffff',
      weight: isHit ? 1.5 : 0.5,
      fillColor: isHit ? '#dc2626' : '#64748b',
      fillOpacity: dimmed ? 0.16 : isHit ? 0.95 : 0.42,
      interactive: true,
    }).addTo(map!);
    // 悬停：本线路口径的简要提示（区域名字 / 本线运单 / 本线车辆 / 来源）
    marker.bindTooltip(buildRouteAreaTooltipHtml(area, hit), {
      direction: 'top',
      opacity: 1,
      className: 'line-tooltip',
      offset: [0, -6],
    });
    if (isHit) {
      // 点击：弹出与「敏感区域」页签完全一致的浮窗（同函数、同样式参数）
      marker.bindPopup(buildAreaPopupHtml(area), {
        closeButton: false,
        className: 'line-tooltip',
        offset: [0, -6],
      });
      marker.on('click', () => {
        // 悬停提示与浮窗同时出现会重叠，点开浮窗时先收起 tooltip
        marker.closeTooltip();
        requestMapFlyTo(area.lat, area.lng, 11);
      });
      routeAreaMarkers.set(area.id, marker);
    }
    layers[`route-sa-${area.id}`] = marker;
  });
}

/** 抽屉里点命中点位 → 地图定位过去并弹出该点位的敏感区域浮窗（保持在线路模式） */
function focusHitArea(stat: AreaStopStat) {
  requestMapFlyTo(stat.area.lat, stat.area.lng, 11);
  openRouteAreaPopup(stat.area.id);
}

/**
 * 在线路模式打开某个命中点位的浮窗
 * 飞行过程中开浮窗会跟着地图跑、位置错位，所以等 moveend；
 * 若目标位置已在视野中心（flyTo 不产生 moveend），用超时兜底，且靠 opened 标志保证只开一次。
 */
function openRouteAreaPopup(areaId: string) {
  if (!routeAreaMarkers.has(areaId) || !map) return;
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    // 飞行期间若发生重绘，marker 会被重建，所以开浮窗时重新取一次，避免作用在已移除的图层上
    const marker = routeAreaMarkers.get(areaId);
    if (!marker) return;
    marker.closeTooltip();
    marker.openPopup();
  };
  map.once('moveend', open);
  // 目标已在视野中心时 flyTo 不产生 moveend，用超时兜底（opened 标志保证只开一次）
  window.setTimeout(open, 900);
}

/** 列表行的敏感停靠摘要 */
function sensitiveBrief(line: AggLine) {
  // 总览列表不显示敏感停靠摘要
  if (isTop20.value) return null;
  const stats = lineSensitiveMap.value.get(line.id);
  if (!stats || stats.areaCount === 0) return null;
  return { waybills: stats.waybills, areaCount: stats.areaCount, ratio: stats.waybillRatio };
}

/**
 * 敏感区域视角浮窗：标题行（含风险徽标）+ 公共行 + 「查看对应车辆 / 运单」链接。
 * 20261123 删除「途经线路」行（路线视角下线，路线相关信息统一清理）。
 */
function buildAreaPopupHtml(area: SensitiveArea) {
  return `<div class="line-tooltip-content">
    ${areaPopupHead(area)}
    ${areaPopupBaseRows(area)}
    ${areaPopupActions(area)}
  </div>`;
}

const areaMarkers = new Map<string, L.CircleMarker>();

/** 真实轨迹的分段数：分段做透明度渐变（起点淡 → 终点浓），与飞线视觉语言一致 */
const TRAJ_SEGMENTS = 14;
const TRAJ_COLOR = '#2563eb';

/**
 * 敏感区域「路线」视角：
 * ① 把选中线路的**真实道路轨迹**画到地图上（OSRM 路网几何，已抽稀 + GCJ-02 校正）
 * ② **只渲染该线路命中的敏感点**（红色），其余点位一律不显示
 * ③ 每个命中点都可点击进详情 —— 航哥要求「所有敏感点都要有一个入口可以进入」
 */
function drawSensitiveByLine() {
  const line = selectedSensitiveLine.value;
  const geom = selectedLineGeometry.value;
  if (!map || !line || !geom) return;

  lineHitMarkers.clear();
  const coords = geom.coords;
  if (coords.length >= 2) {
    const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
    // 分段渐变：真实轨迹点数多（最长 900 点），分段比逐点画便宜，且能表达方向
    for (let i = 0; i < TRAJ_SEGMENTS; i += 1) {
      const from = Math.floor((i / TRAJ_SEGMENTS) * (latlngs.length - 1));
      const to = Math.min(latlngs.length - 1, Math.floor(((i + 1) / TRAJ_SEGMENTS) * (latlngs.length - 1)) + 1);
      const seg = latlngs.slice(from, to + 1);
      if (seg.length < 2) continue;
      const t = i / TRAJ_SEGMENTS;
      // 白描边打底，保证在卫星图上也能看清
      const casing = L.polyline(seg, { color: '#ffffff', weight: 6.5, opacity: 0.55, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      const stroke = L.polyline(seg, { color: TRAJ_COLOR, weight: 3.5, opacity: 0.45 + 0.55 * t, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      layers[`traj-case-${i}`] = casing;
      layers[`traj-seg-${i}`] = stroke;
    }
    // 起讫端点：深色=起点工厂，红=终点工厂（原绿色起点与人工发现 teal 撞色，改 slate-900）
    const start = latlngs[0], end = latlngs[latlngs.length - 1];
    const startMarker = L.circleMarker(start, { radius: 6, color: '#ffffff', fillColor: MAP_SEMANTIC_COLOR.origin, fillOpacity: 1, weight: 2 }).addTo(map);
    startMarker.bindTooltip(`起点 · ${line.from}`, { className: 'line-tooltip', direction: 'top', offset: [0, -8] });
    const endMarker = L.circleMarker(end, { radius: 6, color: '#ffffff', fillColor: MAP_SEMANTIC_COLOR.destination, fillOpacity: 1, weight: 2 }).addTo(map);
    endMarker.bindTooltip(`终点 · ${line.to}`, { className: 'line-tooltip', direction: 'top', offset: [0, -8] });
    layers['traj-start'] = startMarker;
    layers['traj-end'] = endMarker;
  }

  // 命中点位：沿用来源色（teal/amber），不再统一涂红——
  // ① 红色是线路高频档的颜色，涂红会再次撞色；② 颜色在全产品只表达「来源」一件事，
  //    换个视角就换含义，客户会以为是两个指标。"命中"语义由「只画这些点 + 尺寸更大」承载。
  selectedLineHitAreas.value.forEach((area) => {
    const isSelected = assetMapState.selectedAreaId === area.id;
    const color = areaColor(area);
    const halo = L.circleMarker([area.lat, area.lng], {
      radius: (isSelected ? AREA_MARKER_STYLE.hitRadius.lineSelected : AREA_MARKER_STYLE.hitRadius.line) + AREA_MARKER_STYLE.hitHaloRadiusOffset,
      color, weight: 0, fillColor: color,
      fillOpacity: isSelected ? AREA_MARKER_STYLE.haloOpacitySelected : AREA_MARKER_STYLE.haloOpacity,
      interactive: false,
    }).addTo(map!);
    layers[`traj-sa-halo-${area.id}`] = halo;
    const marker = L.circleMarker([area.lat, area.lng], {
      radius: isSelected ? AREA_MARKER_STYLE.hitRadius.lineSelected : AREA_MARKER_STYLE.hitRadius.line,
      color: '#ffffff',
      fillColor: color,
      fillOpacity: isSelected ? AREA_MARKER_STYLE.fillOpacitySelected : AREA_MARKER_STYLE.fillOpacity,
      weight: AREA_MARKER_STYLE.hitWeight,
    }).addTo(map!);
    // 富弹窗：本线口径（运单/车辆/停靠次数）+ 点位全量口径，两段分开标注避免混淆
    marker.bindPopup(buildRouteHitAreaPopupHtml(area, hitStatOf(area.id)), {
      closeButton: false, className: 'line-tooltip', offset: [0, -10],
    });
    marker.bindTooltip(`${areaDisplayName(area)} · 本线 ${hitStatOf(area.id)?.waybills ?? 0} 单`, {
      className: 'line-tooltip', direction: 'top', offset: [0, -12],
    });
    marker.on('click', () => {
      if (assetMapState.selectedAreaId === area.id) {
        assetMapState.selectedAreaId = '';
        detailAreaId.value = '';
        return;
      }
      assetMapState.selectedAreaId = area.id;
      openAreaDetail(area);
    });
    lineHitMarkers.set(area.id, marker);
    areaMarkers.set(area.id, marker);
    layers[`traj-sa-${area.id}`] = marker;
  });

  // 选中点位画自己的敏感半径圈
  const selected = selectedLineHitAreas.value.find((a) => a.id === assetMapState.selectedAreaId);
  if (selected) {
    const circle = L.circle([selected.lat, selected.lng], {
      radius: selected.radiusM, color: areaColor(selected), weight: 1.5, dashArray: '6 5',
      fillColor: areaColor(selected), fillOpacity: 0.06,
    }).addTo(map!);
    layers['traj-sa-radius'] = circle;
    lineHitMarkers.get(selected.id)?.openPopup();
  }
}

// ===== 敏感区域「运单」视图（航哥 20261123：单车/运单检索 + 单条运单真实轨迹）=====

const isSensitiveByWaybill = computed(() => (
  assetMapState.mode === 'sensitive' && assetMapState.sensitiveView === 'byWaybill'
));

/** 运单/车辆数据集：每单命中的点位全部出自碰撞模型，与「路线」视角同源，不会两套数字 */
const waybillDs = computed(() => getWaybillDataset(countableAreas.value));

// WAYBILL_LIST_LIMIT（原 60 单上限）已删除——航哥 20261123：「仅列前 60 单，请收窄检索，这个限制取消」。
// 分页本身就承担了"不要一次渲染几百行"的职责（每页 20 条），再叠一层总量截断是双重限制：
// 客户搜出来的单明明存在，却因为排在 60 名之后而看不到，还要被提示"请收窄检索"，属于自己给自己设障。

/**
 * 检索词命中判定：点位名 / 车牌号 / 运单号 三者模糊匹配（航哥要求的「单车检索」）。
 * 车牌与运单号统一转大写比较（用户常输小写、也常带空格），点位名/地址/区域按原文包含匹配。
 */
/**
 * 经纬度检索：把查询串解析成 (lat, lng)。
 *
 * 航哥 20261123：「敏感区域可能就是一片空地，就没有名字，但一定有经纬度，
 * 如果没有运单名的，可以通过检索经纬度查找异常运单，所以异常运单那里的检索也可以再加一个经纬度」。
 *
 * 支持的分隔写法（客户从表格/微信/地图 App 里复制出来的格式五花八门）：
 *   `39.9042,116.4074`  `39.9042 116.4074`  `39.9042，116.4074`（全角逗号）  `116.4074,39.9042`（经度在前）
 * ⚠️ **必须自动识别纬度/经度顺序**：中国境内纬度恒在 3~54、经度恒在 73~136，两个区间不重叠，
 * 所以按数值范围就能判定谁是谁，不必要求客户按固定顺序输入。判不出来（两个数都在同一区间）才返回 null。
 */
function parseLatLngQuery(raw: string): { lat: number; lng: number } | null {
  const parts = raw.trim().split(/[,，;；\s]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const isLat = (n: number) => n >= 3 && n <= 54;
  const isLng = (n: number) => n >= 73 && n <= 136;
  if (isLat(a) && isLng(b)) return { lat: a, lng: b };
  if (isLng(a) && isLat(b)) return { lat: b, lng: a };
  return null;
}

/** 两点球面距离（米），Haversine。用于判断查询坐标是否落在某点位的敏感半径内 */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 经纬度命中的点位集合。
 * 判定口径：**查询坐标落在该点位的敏感半径圈内**（`radiusM`），而不是"最近的 N 个点位"——
 * 敏感区域本身就是一个有半径的围栏，坐标在圈内才算"这个位置的异常运单"，语义才对得上。
 * ⚠️ 半径很小的点位（如 200m）要求客户输入很精确的坐标才命中，所以再叠一个
 * **最小容差 500m**：`max(radiusM, 500)`，避免客户从地图上随手读个整数坐标就搜不到东西。
 * 用 computed 缓存，避免每输入一个字符就对 300 个点位重算一遍距离。
 */
const latLngHitAreaIds = computed<Set<string>>(() => {
  const parsed = parseLatLngQuery(assetMapState.sensitiveWaybillQuery);
  if (!parsed) return new Set();
  const out = new Set<string>();
  allAreas.value.forEach((area) => {
    const tolerance = Math.max(area.radiusM, 500);
    if (haversineM(parsed.lat, parsed.lng, area.lat, area.lng) <= tolerance) out.add(area.id);
  });
  return out;
});

/**
 * 运单检索匹配。**支持按点位名检索**（航哥 20261123：「把 POI 的名字放到检索框里面，
 * 自动搜索这个区域内有过异常停靠的运单」）——浮窗里「查看对应运单/车辆」就是靠这条路径。
 * 司机姓名已从运单列表移除（航哥：「运单列表里面要把人名去掉」），所以**不再按司机匹配**，
 * 否则会出现"搜得到但列表里看不到为什么命中"的诡异体验。
 *
 * **新增经纬度检索**：无名点位（一片空地）没有名字可搜，但一定有经纬度，
 * 客户拿着坐标也要能查出在这个位置异常停靠过的运单。
 */
function waybillMatches(wb: MockWaybill, rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (!q) return true;
  const up = q.toUpperCase();
  if (wb.vehicleNo.toUpperCase().includes(up)) return true;
  if (wb.waybillNo.toUpperCase().includes(up)) return true;
  // 经纬度检索：该单在"查询坐标所在敏感圈"内的任一点位停过 → 命中
  if (latLngHitAreaIds.value.size > 0
    && wb.hits.some((h) => latLngHitAreaIds.value.has(h.areaId))) return true;
  // 点位名检索：只要该单在名字/地址含关键词的点位上停过就算命中。
  // ⚠️ areaName 存的是**显示名**（无名点位=地址），所以按地址搜也能命中无名点位
  return wb.hits.some((h) => {
    if (h.areaName.includes(q)) return true;
    const a = areaByIdMap.value.get(h.areaId);
    return !!a && (a.address.includes(q) || a.region.includes(q));
  });
}

/**
 * 匹配到的运单。
 * ⚠️ **只保留有异常停靠的单**（航哥 20261123：「如果这个运单里面没有异常停靠，在运单列表里就不显示；
 * 这里边显示的一定都是有异常停靠的」）。本视角的存在意义就是查异常，混进正常单只会稀释列表、
 * 让客户以为"无异常停靠"也是一种需要关注的结果。
 * 连带影响：① 列表里不会再出现「无异常停靠」灰标（每行必然是异常）；
 *          ② 「命中 N 单 · M 辆车」统计的是**异常单**，与地图命中点位口径一致；
 *          ③ 空态文案改为「没有匹配的异常运单」。
 */
const matchedWaybills = computed<MockWaybill[]>(() => (
  waybillDs.value.waybills.filter((wb) => wb.abnormal && waybillMatches(wb, assetMapState.sensitiveWaybillQuery))
));

/**
 * 列表实际渲染的运单：**按发运时间最新在前**（航哥 20261123：「运单按最新排序」）。
 *
 * `waybillMock` 里 `waybills` 已经是 `departTs` 倒序，`filter` 也保序，所以结果本来就是这个顺序——
 * 但**依赖上游数组的隐式顺序是脆的**：哪天 mock 生成逻辑改了排序、或者检索走了另一条路径，
 * 这里就会静默变成别的顺序，而且没人会发现（列表照样有数据）。所以在消费端**显式再排一次**，
 * 让"最新在前"成为本组件自己的契约，而不是上游的副作用。
 *
 * ⚠️ 用 `[...]` 拷贝后再 sort：`matchedWaybills` 是 computed 缓存值，原地 sort 会改到缓存数组。
 * departTs 相同再用运单号兜底，保证顺序稳定（否则同秒发运的两单每次刷新可能互换位置）。
 */
const visibleWaybills = computed<MockWaybill[]>(() => (
  [...matchedWaybills.value].sort(
    (a, b) => b.departTs - a.departTs || a.waybillNo.localeCompare(b.waybillNo),
  )
));

/** 检索命中的车辆数（去重）：让"单车检索"的结果一眼可见 */
const matchedVehicleCount = computed(() => new Set(matchedWaybills.value.map((wb) => wb.vehicleNo)).size);

const selectedWaybill = computed<MockWaybill | null>(() => {
  const no = assetMapState.sensitiveWaybillNo;
  return no ? (waybillDs.value.byNo.get(no) ?? null) : null;
});

const selectedWaybillLine = computed<AggLine | null>(() => {
  const wb = selectedWaybill.value;
  if (!wb) return null;
  return waybillDs.value.lines.find((line) => line.id === wb.lineId) ?? null;
});

const selectedWaybillPath = computed<Array<[number, number]>>(() => {
  const wb = selectedWaybill.value;
  const line = selectedWaybillLine.value;
  if (!wb || !line) return [];
  return buildWaybillPath(wb, line);
});

/**
 * 选中运单命中的点位 —— **只有这些点会渲染**，其余点位一律不显示（与路线视角同口径）。
 * 每单命中 0~3 个点，所以这里不做 TOP3 截断。
 */
const selectedWaybillHitAreas = computed<SensitiveArea[]>(() => {
  const wb = selectedWaybill.value;
  if (!wb || wb.hits.length === 0) return [];
  const ids = new Set(wb.hits.map((h) => h.areaId));
  return countableAreas.value.filter((area) => ids.has(area.id));
});

/** 点位 id → 该单在此的停靠明细（地图浮窗与右栏清单共用） */
function waybillHitOf(areaId: string): WaybillAreaHit | undefined {
  return selectedWaybill.value?.hits.find((h) => h.areaId === areaId);
}

/**
 * ===== 轨迹播放（航哥 20261123：「轨迹也要支持播放」+「一倍速、五倍速、十倍速、二十倍速和五十倍速」）=====
 * 用 requestAnimationFrame 按**真实时间轴**推进：把运单的 departTs→arriveTs 映射到
 * `总时长 / 倍速` 的墙钟时间里，游标走到哪就在轨迹上插值出当前位置。
 * 经过某个敏感区域停靠的时间窗时，自动弹出该停靠浮窗——播放不只是看车在动，
 * 更要看见"它在哪停过、停了多久"。
 */
/**
 * 倍速档位（航哥 20261123 二次修正）。原 1/5/10/20/50 已废。
 * ⚠️ 航哥口述经语音转写为「最小是1，然后是10，接着是51、15、10、100、500」——数字明显转乱，
 * 按其可辨识部分（1、10、100、500）+ 递增序列取 **1 / 10 / 50 / 100 / 500**。
 * 若他要的是别的组合，只改这一行即可。
 */
const PLAYBACK_SPEEDS = [1, 10, 50, 100, 500] as const;

/**
 * 卡车图标（内联 SVG，不引外部图片资源：离线可用、不产生额外请求、颜色可随主题改）。
 * 侧视半挂：货厢 + 驾驶室 + 两个车轮，白描边保证在卫星图上不糊。车头朝右 = 前进方向。
 */
const TRUCK_SVG = `<svg viewBox="0 0 32 21" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">
    <rect x="1.4" y="2.6" width="18.2" height="11.2" rx="1.6" fill="#0f172a"/>
    <path d="M19.6 6.4h5.1l4.9 4.6v2.8H19.6z" fill="#1e293b"/>
    <rect x="21.4" y="7.6" width="3.4" height="2.6" rx="0.6" fill="#93c5fd" stroke-width="1"/>
  </g>
  <g stroke="#ffffff" stroke-width="1.5">
    <circle cx="7.2" cy="16.2" r="3.1" fill="#0f172a"/>
    <circle cx="24.6" cy="16.2" r="3.1" fill="#0f172a"/>
  </g>
  <circle cx="7.2" cy="16.2" r="1.1" fill="#e2e8f0"/>
  <circle cx="24.6" cy="16.2" r="1.1" fill="#e2e8f0"/>
</svg>`;
const playbackSpeed = ref<number>(5);
const isPlaying = ref(false);
/** 播放进度 0~1（沿时间轴） */
const playbackProgress = ref(0);
let playbackRaf = 0;
let playbackStartWall = 0;
let playbackStartProgress = 0;
let playbackMarker: L.Marker | null = null;
/** 已弹过浮窗的停靠序号，避免同一次播放里反复弹 */
const firedStops = new Set<number>();

function playbackDurationMs(): number {
  const wb = selectedWaybill.value;
  if (!wb) return 0;
  // 真实运输时长（秒）→ 按倍速压缩成墙钟毫秒
  return ((wb.arriveTs - wb.departTs) * 1000) / playbackSpeed.value;
}

function playbackLatLng(): [number, number] | null {
  const coords = selectedWaybillPath.value;
  if (coords.length < 2) return null;
  // 按里程比例插值（不是按点序号），否则抽稀不均时游标会忽快忽慢
  const target = playbackProgress.value * totalPathLen(coords);
  let acc = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const segLen = distM(coords[i - 1]!, coords[i]!);
    if (acc + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - acc) / segLen;
      const [x0, y0] = coords[i - 1]!;
      const [x1, y1] = coords[i]!;
      return [y0 + (y1 - y0) * t, x0 + (x1 - x0) * t];
    }
    acc += segLen;
  }
  const last = coords[coords.length - 1]!;
  return [last[1], last[0]];
}

function tickPlayback(now: number) {
  const total = playbackDurationMs();
  if (!total) { stopPlayback(); return; }
  const elapsed = now - playbackStartWall;
  playbackProgress.value = Math.min(1, playbackStartProgress + elapsed / total);
  const pos = playbackLatLng();
  if (pos && playbackMarker && map) playbackMarker.setLatLng(pos);
  // 进入某个停靠时间窗 → 自动弹该停靠浮窗
  const wb = selectedWaybill.value;
  if (wb) {
    const curTs = wb.departTs + playbackProgress.value * (wb.arriveTs - wb.departTs);
    wb.hits.forEach((hit, idx) => {
      if (firedStops.has(idx)) return;
      if (curTs >= hit.arriveTs) {
        firedStops.add(idx);
        const m = layers[`wbtraj-stop-${idx}`] as L.Marker | undefined;
        m?.openPopup();
      }
    });
  }
  if (playbackProgress.value >= 1) { stopPlayback(); return; }
  playbackRaf = requestAnimationFrame(tickPlayback);
}

function startPlayback() {
  const wb = selectedWaybill.value;
  if (!wb || !map) return;
  if (playbackProgress.value >= 1) playbackProgress.value = 0;
  ensurePlaybackMarker();
  firedStops.clear();
  isPlaying.value = true;
  playbackStartWall = performance.now();
  playbackStartProgress = playbackProgress.value;
  playbackRaf = requestAnimationFrame(tickPlayback);
}

function pausePlayback() {
  isPlaying.value = false;
  if (playbackRaf) cancelAnimationFrame(playbackRaf);
  playbackRaf = 0;
}

function stopPlayback() {
  pausePlayback();
  if (playbackMarker && map) { map.removeLayer(playbackMarker); playbackMarker = null; }
  playbackProgress.value = 0;
  firedStops.clear();
}

function restartPlayback() {
  pausePlayback();
  playbackProgress.value = 0;
  firedStops.clear();
  startPlayback();
}

function seekPlayback(v: number) {
  playbackProgress.value = Math.max(0, Math.min(1, v));
  const pos = playbackLatLng();
  if (pos && playbackMarker) playbackMarker.setLatLng(pos);
  if (isPlaying.value) { playbackStartWall = performance.now(); playbackStartProgress = playbackProgress.value; }
}

function setPlaybackSpeed(s: number) {
  // 换倍速时以当前进度为新起点重新计时，否则 elapsed/total 会瞬间跳变
  if (isPlaying.value) { playbackStartProgress = playbackProgress.value; playbackStartWall = performance.now(); }
  playbackSpeed.value = s;
}

function ensurePlaybackMarker() {
  if (!map) return;
  if (!playbackMarker) {
    playbackMarker = L.marker(playbackLatLng() ?? [0, 0], {
      icon: L.divIcon({
        className: 'ep-icon',
        html: `<div class="play-truck">${TRUCK_SVG}</div>`,
        iconSize: [30, 20], iconAnchor: [15, 10],
      }),
      zIndexOffset: 1200,
      interactive: false,
    }).addTo(map);
  } else {
    const pos = playbackLatLng();
    if (pos) playbackMarker.setLatLng(pos);
    if (!map.hasLayer(playbackMarker)) playbackMarker.addTo(map);
  }
}

/** 运单列表按车辆归并（「查看对应车辆」链接用） */
const groupWaybillByVehicle = ref(false);

/** id → 点位，运单列表要按 id 反查风险色/名称，逐行 find 在 587 单上是 O(n²) */
const areaByIdMap = computed(() => new Map(allAreas.value.map((a) => [a.id, a])));
function areaOf(id: string): SensitiveArea | undefined {
  return areaByIdMap.value.get(id);
}

/** 某单途经的敏感点位（按停靠时刻先后），用于运单列表行的 chip 展示 */
function waybillHitAreasOf(wb: MockWaybill): SensitiveArea[] {
  return wb.hits
    .slice()
    .sort((a, b) => a.arriveTs - b.arriveTs)
    .map((h) => areaByIdMap.value.get(h.areaId))
    .filter((a): a is SensitiveArea => !!a);
}

/**
 * 运单列表行最多列几个途经点位（航哥 20261124）。
 * 原话：「它有可能会途经十几个异常点…如果途经的点多，咱不能在列表里都列出来，
 * 所以这块最多列三个就行，也就是前三个。」
 */
const WAYBILL_HIT_CHIP_MAX = 3;

/**
 * 列表行 chip 数据：**前 3 个 + 溢出计数**。
 *
 * "前三个" = 按停靠时刻最早的三个（`waybillHitAreasOf` 已按 arriveTs 升序），
 * 与运单详情里停靠明细的排序口径一致，客户在两处看到的是同一批"前三"。
 *
 * ⚠️ 截断必须**显式报数**（+N）并把被折叠的名称挂在 title 上：
 * 静默截断会让客户以为这单只途经 3 处，与行首「停靠 N 处」徽标自相矛盾。
 * 完整清单在运单详情的停靠明细里，一个都不少。
 */
function waybillHitChipsOf(wb: MockWaybill): { shown: SensitiveArea[]; rest: number; restNames: string[] } {
  const all = waybillHitAreasOf(wb);
  const rest = all.slice(WAYBILL_HIT_CHIP_MAX);
  return {
    shown: all.slice(0, WAYBILL_HIT_CHIP_MAX),
    rest: rest.length,
    restNames: rest.map((a) => areaDisplayName(a)),
  };
}

/**
 * 地图**绘制顺序**（航哥 20261124：「显示层级上应该优先显示人工的；其次是高，再然后是中，再然后是低」）。
 *
 * Leaflet 的 SVG 渲染器按加入顺序叠放，**后画的压在先画的上面**。
 * 所以要让"人工 > 高 > 中 > 低"的视觉优先级成立，必须**反过来**按 `areaZRank` 升序绘制：
 * 低风险先画（垫底）→ 中 → 高 → 人工最后画（置顶）。点位重叠时人工发现永远不被 AI 点位盖住。
 *
 * ⚠️ 这个排序**只服务于地图绘制**，绝不能拿去改 `visibleAreas` 本身——
 * 右栏列表顺序是「异常停靠运单数降序」（航哥 20261119 定稿），两套排序服务两个目的；
 * 直接 sort `visibleAreas` 会把列表顺序一起改掉。所以这里必须 `[...]` 拷贝后再排。
 */
const drawOrderAreas = computed<SensitiveArea[]>(() =>
  [...visibleAreas.value].sort((a, b) => areaZRank(a) - areaZRank(b)),
);

/**
 * 按车辆归并的运单列表（「查看对应车辆」）：一行一辆车，
 * 给车牌号 / 车牌颜色 / 停靠次数 / 涉及点位数 / 最近停靠时间。
 * 点某一行 → 退出归并、把检索词换成该车牌号，下钻到这辆车的运单明细。
 */
interface VehicleGroup {
  vehicleNo: string;
  plateColor: string;
  carrier: string;
  waybills: number;
  stops: number;
  areaCount: number;
  lastStopTs: number;
}
const vehicleGroups = computed<VehicleGroup[]>(() => {
  const m = new Map<string, VehicleGroup>();
  matchedWaybills.value.forEach((wb) => {
    let g = m.get(wb.vehicleNo);
    if (!g) {
      g = { vehicleNo: wb.vehicleNo, plateColor: wb.plateColor, carrier: wb.carrier, waybills: 0, stops: 0, areaCount: 0, lastStopTs: 0 };
      m.set(wb.vehicleNo, g);
    }
    g.waybills += 1;
    g.stops += wb.hits.length;
    wb.hits.forEach((h) => { if (h.arriveTs > g!.lastStopTs) g!.lastStopTs = h.arriveTs; });
  });
  // 涉及点位数要按去重算，不能累加（同一辆车多单可能停同一个点）
  const areaSets = new Map<string, Set<string>>();
  matchedWaybills.value.forEach((wb) => {
    let s = areaSets.get(wb.vehicleNo);
    if (!s) { s = new Set(); areaSets.set(wb.vehicleNo, s); }
    wb.hits.forEach((h) => s!.add(h.areaId));
  });
  const list = Array.from(m.values());
  list.forEach((g) => { g.areaCount = areaSets.get(g.vehicleNo)?.size ?? 0; });
  return list.sort((a, b) => b.stops - a.stops || b.waybills - a.waybills);
});

/** 归并视图也要分页，否则几百辆车一次渲染会卡 */
const pagedVehicleGroups = computed(() =>
  vehicleGroups.value.slice(pageStart.value, pageStart.value + LIST_PAGE_SIZE));

function drillVehicle(vehicleNo: string) {
  groupWaybillByVehicle.value = false;
  assetMapState.sensitiveWaybillQuery = vehicleNo;
}

function selectWaybill(no: string) {
  // 切换运单必须先停掉上一条的播放：游标 marker 不属于 layers（不受 clearLayers 管），
  // 不清掉就会在地图上留一个孤立的黑色三角，而且 rAF 还在按旧轨迹插值
  stopPlayback();
  // 再次点击已选中的运单 = 取消选中，回到该视角的运单列表态
  if (assetMapState.sensitiveWaybillNo === no) {
    assetMapState.sensitiveWaybillNo = '';
    return;
  }
  assetMapState.sensitiveWaybillNo = no;
  // 单子视角下点位详情/编辑态无意义，先收起，避免右栏多态互相盖
  detailAreaId.value = '';
  editingAreaId.value = '';
  assetMapState.selectedAreaId = '';
}

/** 沿轨迹按时间比例取点：把「什么时候停的」映射成「停在轨迹的哪个位置」 */
/**
 * 两点球面距离（米）。trajectoryMock 里的 haversine 是模块私有的，这里就地实现一份——
 * 播放游标必须**按里程插值**，按点序号插值会因抽稀不均而忽快忽慢。
 * 入参是 [lng, lat]（GeoJSON 顺序），别搞反。
 */
function distM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 折线总里程（米） */
function totalPathLen(path: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 1; i < path.length; i += 1) sum += distM(path[i - 1]!, path[i]!);
  return sum;
}

function pointAtRatio(path: Array<[number, number]>, ratio: number): [number, number] {
  if (path.length === 0) return [0, 0];
  const idx = Math.max(0, Math.min(path.length - 1, Math.round(ratio * (path.length - 1))));
  return path[idx]!;
}

/**
 * 重绘后要重新打开的浮窗 layer key。
 * `watch(selectedAreaId)` 会触发全量重绘、marker 被销毁重建，浮窗随之消失；
 * 重绘末尾按这个 key 把它重新打开。之所以要记 key 而不是写死"开选中点位的浮窗"：
 * 运单视角下**同一个点位有两个可点对象**——轨迹上的序号标记（停靠浮窗：地址/起止时间/时长）
 * 和点位本体的大圆（点位浮窗：风险等级/识别规则/查看对应车辆运单），两者内容不同，
 * 写死就会点序号却弹出点位信息。
 */
let reopenPopupKey: string | null = null;

/** 该单命中点位的 marker 登记表（与路线视角共用一张表，切视角时统一清） */
function drawSensitiveByWaybill() {
  const wb = selectedWaybill.value;
  const line = selectedWaybillLine.value;
  if (!map || !wb || !line) return;

  lineHitMarkers.clear();
  const coords = selectedWaybillPath.value;
  if (coords.length >= 2) {
    const latlngs = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
    for (let i = 0; i < TRAJ_SEGMENTS; i += 1) {
      const from = Math.floor((i / TRAJ_SEGMENTS) * (latlngs.length - 1));
      const to = Math.min(latlngs.length - 1, Math.floor(((i + 1) / TRAJ_SEGMENTS) * (latlngs.length - 1)) + 1);
      const seg = latlngs.slice(from, to + 1);
      if (seg.length < 2) continue;
      const t = i / TRAJ_SEGMENTS;
      const casing = L.polyline(seg, { color: '#ffffff', weight: 6.5, opacity: 0.55, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      const stroke = L.polyline(seg, { color: TRAJ_COLOR, weight: 3.5, opacity: 0.45 + 0.55 * t, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
      layers[`wbtraj-case-${i}`] = casing;
      layers[`wbtraj-seg-${i}`] = stroke;
    }
    // 起讫端点：**两端同款黑圆，圆内写「起」/「终」**（航哥 20261123 二次修正：
    // 「没有必要区分它是实心还是空心，「起」这个字就在地图上显示，「终」也在地图上显示就行」）
    const epIcon = (ch: string) => L.divIcon({
      className: 'ep-icon', html: `<div class="ep-label">${ch}</div>`, iconSize: [24, 24], iconAnchor: [12, 12],
    });
    const startMarker = L.marker(latlngs[0], { icon: epIcon('起'), zIndexOffset: 900 }).addTo(map);
    bindAutoPopup(startMarker, endpointPopupHtml('发货', wb.originName, wb.departTs, wb.from));
    const endMarker = L.marker(latlngs[latlngs.length - 1], { icon: epIcon('终'), zIndexOffset: 900 }).addTo(map);
    bindAutoPopup(endMarker, endpointPopupHtml('收货', wb.destName, wb.arriveTs, wb.to));
    layers['wbtraj-start'] = startMarker;
    layers['wbtraj-end'] = endMarker;

    // 敏感区域停靠序号标记：在轨迹上按时间比例定位，直观看出"停在这条路的哪一段"。
    // 航哥 20261123：① 要有序号 ② 底色按风险等级区分 ③ 浮窗给停靠地址/POI类型/起止时间/时长
    // circleMarker 画不了文字，所以用 divIcon。
    const span = Math.max(1, wb.arriveTs - wb.departTs);
    wb.hits.forEach((hit, idx) => {
      const [lng, lat] = pointAtRatio(coords, (hit.arriveTs - wb.departTs) / span);
      const area = selectedWaybillHitAreas.value.find((a) => a.id === hit.areaId);
      const color = area ? areaPointColor(area) : '#64748b';
      const seq = idx + 1;
      const isSel = !!area && assetMapState.selectedAreaId === area.id;
      const stopMarker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'stop-num-icon',
          html: `<div class="stop-num${isSel ? ' sel' : ''}" style="background:${color}">${seq}</div>`,
          iconSize: [isSel ? 30 : 24, isSel ? 30 : 24],
          iconAnchor: [isSel ? 15 : 12, isSel ? 15 : 12],
        }),
        zIndexOffset: 800,
      }).addTo(map!);
      if (area) {
        bindAutoPopup(stopMarker, buildStopPopupHtml(area, hit, seq));
        // 在地图上点序号标记：只弹浮窗，不拽地图（center=false）
        stopMarker.on('click', () => focusWaybillStop(area, false));
      } else {
        // 兜底分支：命中记录还在、但点位对象已查不到（例如点位被彻底删除）。
        // 标题同样写名称而不是「敏感区域停靠 N」——`hit.areaName` 在 waybillMock 里存的就是
        // **显示名**（无名点位=地址），所以这一支也自动符合"直接写 POI 名/地址"的口径。
        const fallbackName = hit.areaName || `敏感区域停靠 ${seq}`;
        bindAutoPopup(stopMarker, `<div class="line-tooltip-content"><div class="line-tooltip-head"><span class="stop-seq" style="background:#94a3b8">${seq}</span><span class="t" title="${fallbackName}">${fallbackName}</span></div><div class="line-tooltip-hint">该点位已不在库中，仅保留停靠记录</div></div>`);
      }
      layers[`wbtraj-stop-${idx}`] = stopMarker;
    });
  }

  /*
   * ===== 「点位本体大圆」已整块删除（航哥 20261123）=====
   * 原话：「我发现里面还有一些不带这种标号（1、2、3、4）的大红点，或者其他颜色的点。
   *        这些不带标号的点，说白了就是没在轨迹上出现的点，我认为可以去掉，不在这里显示。」
   *
   * 被删的是画在**点位圆心**（area.lat/lng）的三层 circleMarker：光晕 + 空心强调环 + 主点。
   * 它们按点位真实坐标落点，而车辆实际停靠位置是沿轨迹插值出来的另一点，两者相差几十到几百米，
   * 于是同一处停靠会出现**两个点**：一个带序号在轨迹上、一个不带序号在圆心 —— 客户看不出区别，
   * 只会以为漏了一个未编号的异常点。**运单视角从此只保留轨迹上带序号的停靠标记。**
   *
   * 连带失效但**代码保留**（恢复只需还原本块）：
   *   buildWaybillHitAreaPopupHtml()（点位口径浮窗）、selectWaybillHitArea()、
   *   lineHitMarkers 在本视角的登记、AREA_MARKER_STYLE 的 hit* 强调档参数。
   * 注意「敏感区域」全览视角的点位大圆**不受影响**——那里没有轨迹，大圆是唯一的点位呈现。
   */

  const selected = selectedWaybillHitAreas.value.find((a) => a.id === assetMapState.selectedAreaId);
  if (selected) {
    const circle = L.circle([selected.lat, selected.lng], {
      radius: selected.radiusM, color: areaColor(selected), weight: 1.5, dashArray: '6 5',
      fillColor: areaColor(selected), fillOpacity: 0.06,
    }).addTo(map!);
    layers['wbtraj-sa-radius'] = circle;
  }
  // 重绘把 marker 全换了一遍，按记录的 key 把用户正在看的浮窗重新打开
  if (reopenPopupKey) {
    (layers[reopenPopupKey] as L.Marker | L.CircleMarker | undefined)?.openPopup();
  }
}

// ===== 路线视角 · 全览态（航哥 20261123：「应该呈现全部路线，而不是只呈现第一条」）=====

/**
 * 全览态每条线的降采样点数。40 条 × 60 点 = 2400 点，全国视野下与全精度视觉无差，
 * 但渲染量只有全精度（40×220=8800 点）的 1/4——选中单条时才用全精度画渐变轨迹。
 */
const ROUTE_OVERVIEW_POINTS = 60;

/** 40 条市到市线路的三档配色，与路线分区共用同一个 getLineTierMap，口径一致 */
const routeTierStyles = computed(() => getLineTierMap(sensitiveLines));

/**
 * 路线视角·未选中任何线路时：把全部 40 条市到市线路的**真实道路轨迹**铺满地图。
 * 用烘焙好的 OSRM 路网几何（不是起讫直飞弧线），三档配色表达运单量高低，
 * 与「敏感区域」视角的全量点位叠加 → 一眼看出"网络长什么样、点都落在哪"。
 */
function drawSensitiveRouteOverview() {
  if (!map) return;
  const tiers = routeTierStyles.value;
  sensitiveLines.forEach((line) => {
    const geom = getRouteGeometry(line);
    const latlngs = resamplePath(geom.coords, ROUTE_OVERVIEW_POINTS)
      .map(([lng, lat]) => [lat, lng] as [number, number]);
    if (latlngs.length < 2) return;
    const style = tiers[line.id] ?? LINE_TIER_STYLES.mid;
    const pl = L.polyline(latlngs, {
      color: style.color,
      weight: style.weight,
      opacity: 0.62,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map!);
    pl.bindTooltip(buildSensitiveLineTooltipHtml(line, sensitiveLineStats.value.get(line.id)), {
      className: 'line-tooltip',
      sticky: true,
    });
    pl.on('click', () => selectSensitiveLine(line.id));
    layers[`sroute-${line.id}`] = pl;
  });
}

/**
 * 路线视角的线路浮窗。比通用 buildLineTooltipHtml 多「停靠次数」与「涉及敏感点位」。
 * ⚠️ 停靠次数是**事件数**：同一单在 3 个点停过就计 3 次，可加总、不与运单数重复计数，
 * 但必须与「异常停靠运单」分行并列展示，否则客户会当成运单数误读（指标铁律 3：次数可加、实体不可加）。
 */
function buildSensitiveLineTooltipHtml(line: AggLine, stats?: LineSensitiveStats) {
  const rows = stats && stats.areaCount > 0
    ? `<div class="line-tooltip-row"><span>异常停靠运单</span><b style="color:#dc2626">${stats.waybills.toLocaleString()} 单</b></div>
    <div class="line-tooltip-row"><span>涉及车辆</span><b>${stats.vehicles.toLocaleString()} 辆</b></div>
    <div class="line-tooltip-row"><span>停靠次数</span><b>${stats.stopEvents.toLocaleString()} 次</b></div>
    <div class="line-tooltip-row"><span>涉及敏感点位</span><b>${stats.areaCount} 个</b></div>`
    : `<div class="line-tooltip-row"><span>敏感区域</span><b>未命中</b></div>`;
  return `<div class="line-tooltip-content">
    <div class="line-tooltip-title">${line.from} → ${line.to}</div>
    <div class="line-tooltip-row"><span>运单数</span><b>${line.waybillCount.toLocaleString()} 单</b></div>
    <div class="line-tooltip-row"><span>承运车辆数</span><b>${line.carrierVehicleCount.toLocaleString()} 辆</b></div>
    ${rows}
  </div>`;
}

/**
 * 命中点位弹窗的公共部分（三种视角共用，保证同一字段在任何视角都同名同口径）。
 * 航哥 20261123：「弹窗内容要丰富一点」——补齐来源 / 地址 / 半径 / 停留阈值 / 全局异常停靠 / 备注。
 */
/**
 * 浮窗标题行：点位名 + 风险等级徽标（航哥 20261123）。
 * **人工发现不挂徽标**——它不定级，且「来源」行已写明人工发现，再挂一个「人工发现」徽标
 * 就是同一信息出现两次（航哥对字段重叠零容忍）。
 */
function areaPopupHead(area: SensitiveArea) {
  const tag = area.source === 'ai' && area.riskLevel
    ? `<span class="risk-tag risk-${area.riskLevel}">${RISK_LABEL[area.riskLevel]}</span>`
    : '';
  // 标题走 areaDisplayName：无名点位显示地址（航哥 20261123）
  return `<div class="line-tooltip-head"><span class="t">${areaDisplayName(area)}</span>${tag}</div>`;
}

/** 备注在浮窗里的最大展示字数（航哥 20261123：「最多在里边呈现50个字就行」） */
const POPUP_REMARK_MAX = 50;

/**
 * 浮窗公共行（三个视角逐字一致，避免同一字段换名字被当成两个指标）。
 *
 * 20261123 第六轮变更：
 * ① **删「识别规则」「判定阈值」**（航哥：「识别规则和判定阈值这块，我们都拿掉吧」）。
 *    ⚠️ **「停留阈值」保留**——航哥同一段话里先说拿掉、随后明确纠正「那个停留阈值不去掉」，以纠正为准。
 *    注意别把两者搞混：停留阈值 = 单次停多久才算异常（点位属性）；判定阈值 = AI 命中规则的统计口径（如"近30天≥5辆车"）。
 * ② **新增「经纬度」「发现时间（AI）/ 录入时间（人工）」**：详情面板入口已撤销，这两项是详情面板独有信息，
 *    航哥原话「详情里面更多的信息其实就是经纬度和时间，这两个都可以在浮窗里显示出来」→ 搬到浮窗。
 * ③ **备注最多 50 字**，超出截断加省略号，全文挂 title 悬停可见。
 * ④ 「途经线路」上一轮已删（路线视角下线）。
 */
/**
 * @param opts.skipAddress / opts.skipPoi —— 跳过「具体地址」「POI类型」两行。
 * 停靠浮窗已经用「停靠地址」「POI类型」展示过同样内容，同一个浮窗里重复两遍是噪音，
 * 所以由调用方声明跳过，而不是在这里猜。
 *
 * ⚠️ **「停留阈值」行已删**（航哥 20261124：「所有停留阈值的都去掉」）。此前它是唯一
 * 保留的阈值展示（当时口径是"输入删掉、展示保留"），本轮一并删除。数据字段
 * `stayThresholdMin` 仍在 store / 生成器里参与碰撞量计算，只是不再对客户呈现。
 *
 * ⚠️ 说明为什么这条写在函数外而不是行内：本函数返回的是**模板字符串**，在里面写
 * `<!-- -->` 不是注释，而是会被原样拼进 HTML 字符串、打进构建产物、注入浏览器 DOM。
 * 实测过：那样写会让 `grep 停留阈值 dist/assets/*.js` 命中，删了个寂寞。
 */
function areaPopupBaseRows(area: SensitiveArea, opts: { skipAddress?: boolean; skipPoi?: boolean } = {}) {
  const isAi = area.source === 'ai';
  const remark = area.evidence
    ? (area.evidence.length > POPUP_REMARK_MAX
        ? `${area.evidence.slice(0, POPUP_REMARK_MAX)}…`
        : area.evidence)
    : '';
  return `<div class="line-tooltip-row"><span>来源</span><b>${AREA_SOURCE_LABEL[area.source]}</b></div>
    ${isAi && area.riskLevel ? `<div class="line-tooltip-row"><span>风险等级</span><b style="color:${RISK_COLOR[area.riskLevel]}">${RISK_LABEL[area.riskLevel]}</b></div>` : ''}
    ${opts.skipAddress ? '' : `<div class="line-tooltip-row"><span>具体地址</span><b style="max-width:190px;text-align:right">${area.address}</b></div>`}
    ${opts.skipPoi ? '' : `<div class="line-tooltip-row"><span>POI类型</span><b style="max-width:190px;text-align:right">${AREA_TYPE_LABEL[area.areaType]}</b></div>`}
    <div class="line-tooltip-row"><span>经纬度</span><b style="font-family:ui-monospace,monospace;font-size:10.5px">${area.lng.toFixed(6)}, ${area.lat.toFixed(6)}</b></div>
    <div class="line-tooltip-row"><span>敏感半径</span><b>${formatRadius(area.radiusM)}</b></div>
    <div class="line-tooltip-row"><span>异常停靠</span><b style="color:#dc2626">${area.discovery.waybillCount} 单 · ${area.discovery.vehicleCount} 辆车</b></div>
    <div class="line-tooltip-row"><span>${isAi ? '发现时间' : '录入时间'}</span><b>${area.createdAt}</b></div>
    ${remark ? `<div class="line-tooltip-row"><span>备注</span><b style="max-width:190px;text-align:right;font-weight:500" title="${area.evidence}">${remark}</b></div>` : ''}`;
}

/**
 * 下钻链接（航哥 20261123）。
 * **只保留「查看对应运单」**——「查看对应车辆」已按航哥要求去掉（「你只留查看对应运单就行」）。
 * `openVehiclesOfArea()` 与按车辆归并视图的代码保留但已无入口，恢复只需把下面那行加回来。
 * 浮窗是 Leaflet 拼的原始 HTML，挂不了 Vue 事件——用 data-* 属性 + 地图容器上的事件委托，
 * 这样浮窗被销毁重建也不需要重新绑定（见 onMounted 里挂的 onPopupAction）。
 */
function areaPopupActions(area: SensitiveArea) {
  return `<div class="line-tooltip-actions">
    <span class="tt-action" data-tt-action="waybills" data-area-id="${area.id}">查看对应运单</span>
  </div>`;
}

/**
 * 统一挂浮窗（航哥 20261123：「不论鼠标是触碰还是点击，都要直接自动显示浮窗」）。
 * - **hover 即弹**：`mouseover` 就 openPopup，不等点击
 * - **不在 mouseout 关**：否则鼠标往浮窗上移（要点里面的「查看对应运单」链接）时浮窗就消失了
 * - **closeButton: true**：右上角带叉号，可手动关闭（航哥明确要求）
 * - 打开新浮窗时 Leaflet 自动关掉旧的，不会叠一片
 * 所有地图浮窗都必须走这个函数，不要各自 bindPopup——否则有的能 hover 弹有的不能。
 */
function bindAutoPopup(layer: L.Layer, html: string) {
  layer.bindPopup(html, {
    closeButton: true,
    className: 'line-tooltip',
    offset: [0, -12],
    // **autoPan 关掉**（航哥 20261123：「浮窗不一定必须完全显示出来，因为现在地图老是在动……
    // 没必要一直保障浮窗必须在正中间，或者能一直查看」）。
    // autoPan 会在每次弹窗时把地图平移去保证浮窗完整可见，hover 密集区来回扫就变成地图一直在抖。
    // 现在的行为：hover 就地弹，浮窗被裁掉就让用户自己拖地图。
    autoPan: false,
  });
  layer.on('mouseover', () => { (layer as L.Marker).openPopup(); });
}

/** 起点/终点浮窗：两端都是黑色圆圈，靠浮窗文案区分发货还是收货 */
function endpointPopupHtml(kind: '发货' | '收货', name: string, ts: number, place: string) {
  return `<div class="line-tooltip-content">
    <div class="line-tooltip-head"><span class="t">${kind} · ${name}</span></div>
    <div class="line-tooltip-row"><span>${kind}时间</span><b>${formatTs(ts)}</b></div>
    <div class="line-tooltip-row"><span>所在地</span><b>${place}</b></div>
  </div>`;
}

/**
 * 浮窗里「查看对应车辆 / 查看对应运单」的点击处理。
 * 浮窗是 Leaflet 拼的原始 HTML，挂不了 Vue 事件 → 用 data-* + 地图容器上的**事件委托**，
 * 浮窗销毁重建都不用重新绑定（委托在 onMounted 里挂一次，onBeforeUnmount 里摘掉）。
 */
function onPopupAction(e: MouseEvent) {
  const el = (e.target as HTMLElement | null)?.closest?.('[data-tt-action]') as HTMLElement | null;
  if (!el) return;
  const action = el.dataset.ttAction;
  const areaId = el.dataset.areaId;
  if (!action || !areaId) return;
  e.stopPropagation();
  const area = allAreas.value.find((a) => a.id === areaId);
  if (!area) return;
  map?.closePopup();
  if (action === 'vehicles') openVehiclesOfArea(area);
  else openWaybillsOfArea(area);
}

/**
 * 「查看对应运单」：切到运单视角，**把点位名填进检索框**，自动列出在该点位有过异常停靠的运单
 * （航哥 20261123：「把 POI 的名字放到检索框里面，自动搜索这个区域内有过异常停靠的运单」）。
 * ⚠️ 顺序：先 setSensitiveView 再写 query——切视角会清 sensitiveWaybillQuery，先写就被清掉。
 */
function openWaybillsOfArea(area: SensitiveArea) {
  detailAreaId.value = '';
  editingAreaId.value = '';
  setSensitiveView('byWaybill');
  groupWaybillByVehicle.value = false;
  // ⚠️ **必须用 areaDisplayName 而不是 area.name**：无名点位的 name 是空串，
  // 而 waybillMatches 对空查询直接 return true → 会列出全部 324 单，
  // 客户以为"这个空地点位关联了 324 单"。用显示名（地址）才对得上。
  assetMapState.sensitiveWaybillQuery = areaDisplayName(area);
}

/**
 * 「查看对应车辆」：同样切到运单视角 + 填入点位名，但列表**按车辆归并**
 * （一行一辆车：车牌号 + 车牌颜色 + 停靠次数 + 最近停靠），点某辆车再下钻到它的运单。
 */
function openVehiclesOfArea(area: SensitiveArea) {
  detailAreaId.value = '';
  editingAreaId.value = '';
  setSensitiveView('byWaybill');
  groupWaybillByVehicle.value = true;
  // 同 openWaybillsOfArea：无名点位传空串会匹配全部运单
  assetMapState.sensitiveWaybillQuery = areaDisplayName(area);
}

/**
 * 轨迹上的停靠浮窗（航哥 20261123 明确列了字段）：
 * 停靠地址 / POI类型 / 开始停靠时间 / 结束停靠时间 / 停靠时长。
 * 标题从「第 N 次异常停靠」改叫「**敏感区域停靠 N**」——因为只有落在敏感区域里才算停靠，
 * 这个限定词不能省，否则客户会以为是"所有中途停车"。
 * ⚠️ 结束时间由 `hitDepartTs` 派生，不单独存字段：结束 − 开始 必须恒等于时长。
 */
/**
 * 轨迹上的停靠浮窗（航哥 20261123 第十轮重定）。
 *
 * **标题直接写停靠点的 POI 名称 / 地址**（`areaDisplayName`），不再写「敏感区域停靠 3」——
 * 航哥原话：「浮框里的停靠名称，现在是"敏感区域停靠 3"，改为"鹏程中转库"这种，
 * 直接就是写停靠的 POI 名称或者地址名称」。
 * ⚠️ **左侧那个带序号的彩色圆标保留**：它是地图上 ①②③ 标记的对应关系，删了就没法把浮窗和地图上的点连起来。
 *
 * **已删两行**：① 「超出阈值」——停留阈值本身已在下面的点位信息里给出，再报一个差值属于内部判定口径，
 * 客户看到"超出 26 分钟"还得反推阈值是多少；② 「车牌号」——浮窗是从某一单的轨迹上点出来的，
 * 车牌在右栏详情头部已经写着，这里是纯重复。
 *
 * **新增「点位信息」段**：航哥要求「还要加上这个敏感区域的其他信息」，直接复用 `areaPopupBaseRows`，
 * 但跳过「具体地址」「POI类型」两行——它们已在停靠段里以「停靠地址」「POI类型」出现过，
 * 同一段浮窗里同一内容出现两遍是噪音。
 */
function buildStopPopupHtml(area: SensitiveArea, hit: WaybillAreaHit, seq: number) {
  const tag = area.source === 'ai' && area.riskLevel
    ? `<span class="risk-tag risk-${area.riskLevel}">${RISK_LABEL[area.riskLevel]}</span>` : '';
  return `<div class="line-tooltip-content">
    <div class="line-tooltip-head">
      <span class="stop-seq" style="background:${areaPointColor(area)}">${seq}</span>
      <span class="t" title="${areaDisplayName(area)}">${areaDisplayName(area)}</span>${tag}
    </div>
    <div class="line-tooltip-row"><span>停靠地址</span><b style="max-width:190px;text-align:right">${area.address}</b></div>
    <div class="line-tooltip-row"><span>POI类型</span><b style="max-width:190px;text-align:right">${AREA_TYPE_LABEL[area.areaType]}</b></div>
    <div class="line-tooltip-row"><span>开始停靠</span><b>${formatTs(hit.arriveTs)}</b></div>
    <div class="line-tooltip-row"><span>结束停靠</span><b>${formatTs(hitDepartTs(hit))}</b></div>
    <div class="line-tooltip-row"><span>停靠时长</span><b style="color:#dc2626">${hit.stayMin} 分钟</b></div>
    <div class="line-tooltip-sep">点位信息</div>
    ${areaPopupBaseRows(area, { skipAddress: true, skipPoi: true })}
  </div>`;
}

/**
 * 路线视角·命中点位弹窗：在公共部分之上加**本线口径**三行。
 * 本线数字来自对账后的 sensitiveLineStats，与右栏命中清单、点位详情面板同源。
 */
function buildRouteHitAreaPopupHtml(area: SensitiveArea, stat?: AreaStopStat) {
  const lineRows = stat
    ? `<div class="line-tooltip-sep">本线路口径</div>
    <div class="line-tooltip-row"><span>本线异常停靠</span><b style="color:#dc2626">${stat.waybills.toLocaleString()} 单</b></div>
    <div class="line-tooltip-row"><span>本线涉及车辆</span><b>${stat.vehicles.toLocaleString()} 辆</b></div>
    <div class="line-tooltip-row"><span>本线停靠次数</span><b>${stat.stops.toLocaleString()} 次</b></div>`
    : '';
  return `<div class="line-tooltip-content">
    <div class="line-tooltip-title">${areaDisplayName(area)}</div>
    ${lineRows}
    <div class="line-tooltip-sep">点位全量</div>
    ${areaPopupBaseRows(area)}
    <div class="line-tooltip-hint">点击查看点位详情</div>
  </div>`;
}

/**
 * 运单视角·命中点位弹窗：在公共部分之上加**本单口径**（到达时刻 + 停留时长）。
 * 航哥 20261123：「这个车在这里停靠的整体情况，以及在这个敏感点位停靠的时间」。
 */
/**
 * 运单视角·命中点位浮窗（点位本体，不是轨迹上的停靠序号标记）。
 * 停靠时刻/时长那几行已移到 `buildStopPopupHtml`（轨迹上的序号标记），
 * 这里只讲点位本身：风险等级 + 识别规则 + 查看对应车辆/运单，避免两个浮窗字段重复。
 */
function buildWaybillHitAreaPopupHtml(area: SensitiveArea) {
  return `<div class="line-tooltip-content">
    ${areaPopupHead(area)}
    ${areaPopupBaseRows(area)}
    ${areaPopupActions(area)}
    <div class="line-tooltip-hint">轨迹上的序号标记可看本次停靠的起止时间</div>
  </div>`;
}

function drawSensitiveMode() {
  if (!map) return;
  clearLayers();
  areaMarkers.clear();

  // 路线视角：画真实轨迹 + 只画命中点位，其余点位不渲染
  if (isSensitiveByLine.value && selectedSensitiveLine.value) {
    drawSensitiveByLine();
    return;
  }
  // 运单视角：画该运单的真实轨迹 + 只画该单命中的点位，其余点位不渲染
  if (isSensitiveByWaybill.value && selectedWaybill.value) {
    drawSensitiveByWaybill();
    return;
  }
  // 路线视角·未选中：先铺全部 40 条市到市线路的真实轨迹，再叠加全量点位
  // （航哥 20261123：进路线视角地图应呈现全部路线，不是只呈现第一条）
  if (isSensitiveByLine.value) drawSensitiveRouteOverview();

  /*
   * ⚠️ 用 drawOrderAreas 而不是 visibleAreas：绘制顺序决定叠放层级（低 → 中 → 高 → 人工）。
   * 列表仍读 visibleAreas（异常停靠运单数降序），两套排序服务两个目的，互不影响。
   *
   * ⚠️ **必须拆成"先全部光晕、再全部点位"两趟**，不能像原来那样每个点位 halo→marker 交替画：
   * Leaflet 的 SVG 渲染器按加入顺序叠放，交替绘制时**后一个点位的光晕会盖在前一个点位的实心圆上**
   * （光晕半径比主点大 haloRadiusOffset，且是半透明同色填充）。结果就是人工发现点位虽然最后画，
   * 却仍会被它自己的光晕之外的顺序问题干扰，低风险的淡色光晕糊在高风险点上，层级等于白排。
   * 两趟画完，所有实心点都在所有光晕之上，层级严格由 drawOrderAreas 决定。
   */
  drawOrderAreas.value.forEach((area) => {
    const isSelected = assetMapState.selectedAreaId === area.id;
    const isHover = assetMapState.hoverAreaId === area.id;
    const color = areaColor(area);
    // 点位显示更明显（航哥 20261123 二次加大）：半径 3.5 → 8，白描边 1.5 → 2.5，外加同色光晕。
    // **人工发现再大一档**（航哥：「人工发现的异常相当于更加重要和敏感，要更突出的显示」）：
    // 半径 8 → 10.5、描边 2.5 → 3，配合独立 violet 配色形成「颜色 + 尺寸」双重区分。
    const isManual = area.source === 'manual';
    const rs = isManual ? AREA_MARKER_STYLE.manualRadius : AREA_MARKER_STYLE.radius;
    const baseRadius = isSelected ? rs.selected : isHover ? rs.hover : rs.base;
    const halo = L.circleMarker([area.lat, area.lng], {
      radius: baseRadius + AREA_MARKER_STYLE.haloRadiusOffset,
      color,
      weight: 0,
      fillColor: color,
      // 颜色淡一点（航哥 20261123）：光晕 0.18 → 0.13，主点填充 0.95 → 0.75
      fillOpacity: isSelected ? AREA_MARKER_STYLE.haloOpacitySelected : AREA_MARKER_STYLE.haloOpacity,
      interactive: false,
    }).addTo(map!);
    // layers 是对象（非数组），光晕单独占一个 key，切模式时随 clearLayers 一起清掉
    layers[`sa-halo-${area.id}`] = halo;
  });

  drawOrderAreas.value.forEach((area) => {
    const isSelected = assetMapState.selectedAreaId === area.id;
    const isHover = assetMapState.hoverAreaId === area.id;
    const color = areaColor(area);
    const isManual = area.source === 'manual';
    const rs = isManual ? AREA_MARKER_STYLE.manualRadius : AREA_MARKER_STYLE.radius;
    const baseRadius = isSelected ? rs.selected : isHover ? rs.hover : rs.base;
    const marker = L.circleMarker([area.lat, area.lng], {
      radius: baseRadius,
      color: '#ffffff',
      fillColor: color,
      fillOpacity: isSelected ? AREA_MARKER_STYLE.fillOpacitySelected : AREA_MARKER_STYLE.fillOpacity,
      weight: isManual ? AREA_MARKER_STYLE.manualWeight : AREA_MARKER_STYLE.weight,
    }).addTo(map!);
    // hover 与 click 都自动弹浮窗，且右上角带关闭叉号（航哥 20261123）
    bindAutoPopup(marker, buildAreaPopupHtml(area));
    // 地图点选 = 选中（画敏感半径圈）+ 弹浮窗，**不再自动打开右侧详情面板**。
    // 航哥 20261123：详情面板里比浮窗多出的只有经纬度和时间，这两项已搬进浮窗，
    // 详情入口整体撤掉；浮窗由上面的 bindAutoPopup 负责（hover 与 click 都弹）。
    marker.on('click', () => {
      if (assetMapState.selectedAreaId === area.id) {
        assetMapState.selectedAreaId = '';
        return;
      }
      assetMapState.selectedAreaId = area.id;
    });
    areaMarkers.set(area.id, marker);
    // 同时登记到 layers，切回线路模式时 clearLayers 才能清掉点位
    layers[`sa-${area.id}`] = marker;
  });

  // 选中点位：按该点位半径画敏感圈
  const selected = visibleAreas.value.find((a) => a.id === assetMapState.selectedAreaId);
  if (selected) {
    const color = areaColor(selected);
    const circle = L.circle([selected.lat, selected.lng], {
      radius: selected.radiusM,
      color,
      weight: 1.5,
      dashArray: '6 5',
      fillColor: color,
      fillOpacity: 0.06,
    }).addTo(map!);
    layers['area-radius'] = circle;
    areaMarkers.get(selected.id)?.openPopup();
  }
}

// ===== 底图切换（标准图 / 卫星图）=====

const baseStyle = ref<BaseMapStyle>('standard');

function switchBaseStyle(style: BaseMapStyle) {
  if (baseStyle.value === style) return;
  baseStyle.value = style;
  if (map) {
    applyBaseMapStyle(map, style);
    // 换底图后瓦片要重算尺寸，否则新层可能只铺一部分
    setTimeout(() => map?.invalidateSize(), 60);
  }
}

function redraw() {
  if (!map) return;
  if (isLineMode.value) drawLineMode();
  else drawSensitiveMode();
}

function fitCurrentBounds() {
  if (!map) return;
  if (isLineMode.value) {
    fitBoundsToLines(map, currentLines.value);
  } else if (isSensitiveByLine.value && selectedLineGeometry.value) {
    // 路线视角：视野贴合真实轨迹，而不是全量点位
    const coords = selectedLineGeometry.value.coords;
    if (coords.length >= 2) {
      const bounds = L.latLngBounds(coords.map(([lng, lat]) => [lat, lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  } else if (isSensitiveByLine.value) {
    // 路线视角·全览态：视野贴合全部 40 条线路（不是全量点位，两者范围接近但线路才是主角）
    fitBoundsToLines(map, sensitiveLines);
  } else if (isSensitiveByWaybill.value && selectedWaybillPath.value.length >= 2) {
    // 运单视角：视野贴合这一单的轨迹
    const bounds = L.latLngBounds(selectedWaybillPath.value.map(([lng, lat]) => [lat, lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
  } else if (visibleAreas.value.length > 0) {
    const bounds = L.latLngBounds(visibleAreas.value.map((a) => [a.lat, a.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48] });
  }
}

function switchMode(mode: MapMode) {
  // 省/市/县 走 setRouteMode，记住路线页当前维度
  if (mode === 'province' || mode === 'city' || mode === 'county') setRouteMode(mode);
  else assetMapState.mode = mode;
}

watch(() => assetMapState.mode, () => {
  // 切模式收起右栏详情/编辑态，避免回到敏感区域时残留上一个点的面板
  detailAreaId.value = '';
  editingAreaId.value = '';
  // 容器尺寸可能随分区/板块显隐变化，重算一次，避免瓦片只铺一部分
  map?.invalidateSize();
  // 切模式先关掉残留浮窗，再按新模式重绘
  // 注意：线路模式也会铺敏感点位（灰色打底 / 选中线路后红色高亮），
  // 但两种模式的图层 key 不同（sa-* vs route-sa-*），clearLayers 必须能把对方清干净
  map?.closePopup();
  redraw();
  fitCurrentBounds();
});

// 「切入即选中第一项」已撤销（航哥 20261123 二次要求）：
//   · 路线视角 → 地图直接铺**全部** 40 条市到市线路的真实轨迹，不是只画第一条
//   · 运单视角 → 右栏直接是**运单列表**，不自动打开某一单的详情
// 两个视角都回到「先看全局，再点进去」的下钻路径。

/**
 * 路线视角·全览态的悬停高亮：右栏列表悬停 ↔ 地图线条加粗。
 * **只 setStyle 不重绘**——40 条线路全量重绘一次要重建 2400 个点，悬停触发会明显卡顿；
 * 而且重绘会重建 polyline，鼠标正悬停的那条被换掉后 mouseout 不再触发，高亮会卡住不消失。
 */
watch(() => assetMapState.hoverLineId, (id, oldId) => {
  if (!isSensitiveByLine.value || selectedSensitiveLine.value) return;
  const tiers = routeTierStyles.value;
  [oldId, id].forEach((lid) => {
    if (!lid) return;
    const pl = layers[`sroute-${lid}`] as L.Polyline | undefined;
    if (!pl) return;
    const style = tiers[lid] ?? LINE_TIER_STYLES.mid;
    const on = lid === id;
    pl.setStyle({ weight: on ? style.weight + 2 : style.weight, opacity: on ? 1 : 0.62 });
    if (on) pl.bringToFront();
  });
});

// 敏感区域「路线 / 运单」视角：切换视图或选中对象都要重绘并重新贴合视野
watch(() => [assetMapState.sensitiveView, assetMapState.sensitiveLineId, assetMapState.sensitiveWaybillNo], () => {
  if (assetMapState.mode !== 'sensitive') return;
  map?.closePopup();
  redraw();
  fitCurrentBounds();
});

watch(() => [assetMapState.selectedLineId, assetMapState.hoverLineId], () => {
  if (isLineMode.value) drawLineMode();
});

watch(() => assetMapState.selectedAreaId, (id, oldId) => {
  if (isLineMode.value) return;
  // 检索跳转过来的点位可能被当前来源筛选挡住 → 自动放开筛选
  if (id && !visibleAreas.value.some((area) => area.id === id)) {
    keepSelectionOnFilterReset = true;
    sourceFilter.value = 'all';
  }
  drawSensitiveMode();
  // 取消选中：关闭浮窗并回到当前视角的视野
  // 走 fitCurrentBounds 而不是直接贴合全量点位——路线视角下应当贴合轨迹，
  // 否则取消选中会把视野从一条线路拉回全国，用户丢失上下文
  if (oldId && !id) {
    map?.closePopup();
    fitCurrentBounds();
  }
});

watch(() => assetMapState.hoverAreaId, () => {
  // 路线视角下命中点不做悬停态（只回答"这条线踩了哪些点"），
  // 而真实轨迹最多 900 点 ×14 段，每次悬停全量重绘既卡又无视觉收益
  if (!isLineMode.value && !isSensitiveByLine.value) drawSensitiveMode();
});

watch(() => assetMapState.flyTo, (target) => {
  if (!map || !target) return;
  map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.6 });
});

onMounted(() => {
  if (!document.getElementById('kb-map-shared-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'kb-map-shared-styles';
    styleEl.textContent = MAP_LAYER_STYLES;
    document.head.appendChild(styleEl);
  }
  nextTick(() => {
    if (!mapRef.value || map) return;
    map = initBaseMap(mapRef.value, [32.5, 118.8], 5);
    // 浮窗内「查看对应车辆/运单」链接的事件委托：挂一次，浮窗反复重建都不用重绑
    map.getContainer().addEventListener('click', onPopupAction);
    redraw();
    setTimeout(() => {
      map?.invalidateSize();
      fitCurrentBounds();
    }, 80);
  });
});

onBeforeUnmount(() => {
  stopPlayback();
  map?.getContainer()?.removeEventListener('click', onPopupAction);
  clearLayers();
  areaMarkers.clear();
  routeAreaMarkers.clear();
  map?.remove();
  map = null;
});

// ===== 右侧列表交互 =====

/** 检索跳转时临时抑制「筛选变化清选中」 */
let keepSelectionOnFilterReset = false;

function hoverTop20Line(line: AggLine | null) {
  assetMapState.hoverLineId = line ? line.id : '';
}

function clickTop20Line(line: AggLine) {
  assetMapState.hoverLineId = line.id;
}

function hoverAggLine(line: AggLine | null) {
  if (line) {
    setRouteMode(line.dimension);
    assetMapState.hoverLineId = line.id;
  } else {
    assetMapState.hoverLineId = '';
  }
}

function selectAggLine(line: AggLine) {
  setRouteMode(line.dimension);
  assetMapState.selectedLineId = line.id;
}

function selectArea(area: SensitiveArea) {
  // 再次点击已选中的列表项 → 取消选中
  if (assetMapState.selectedAreaId === area.id) {
    assetMapState.selectedAreaId = '';
    return;
  }
  // setSection 会清选中态，必须先切分区再选中
  if (assetMapState.section !== 'poi') setSection('poi');
  else assetMapState.mode = 'sensitive';
  assetMapState.selectedAreaId = area.id;
  requestMapFlyTo(area.lat, area.lng, 12);
}

function hoverArea(id: string) {
  if (assetMapState.mode !== 'sensitive') assetMapState.mode = 'sensitive';
  assetMapState.hoverAreaId = id;
}

function unhoverArea() {
  assetMapState.hoverAreaId = '';
}

// AI识别点位确认流已整体下线（航哥 20261123）：不再有确认 / 忽略 / 批量确认 / 批量忽略。
// 点位入库即生效，唯一的下线手段是「彻底删除」。

function switchSourceFilter(filter: SourceFilter) {
  sourceFilter.value = filter;
  // 离开「AI识别」时风险子 tab 会消失，必须把档位重置回 all——
  // 否则再切回 AI识别 会带着上次的「高风险」筛选，看起来像点位少了一半
  riskFilter.value = 'all';
}

function switchRiskFilter(filter: RiskFilter) {
  // 重绘与分页重置统一交给 watch([sourceFilter, riskFilter])，这里只改状态，
  // 避免同一件事在两处各写一遍、日后改一处漏一处
  riskFilter.value = filter;
}

// ===== 点位「更多」操作：定位 / 编辑 / 彻底删除 =====

const areaMenuId = ref('');

/**
 * 正在编辑的点位 id。
 *
 * ⚠️ 编辑已从"右栏整栏覆盖的内联面板"改为**模态弹窗**（航哥 20261124），
 * 所以这个状态只用来告诉弹窗"编辑哪一个"，**不再改变右栏的渲染分支**。
 * 原先表单值暂存在本组件的 `editForm` 里，现已随内联面板一起删除——
 * 表单状态归弹窗自己管（它复用录入那张 `SensitiveAreaConfirmCard`），
 * 否则同一份表单会有两个真相来源，保存时不知道以谁为准。
 */
const editingAreaId = ref('');

const editingArea = computed<SensitiveArea | null>(
  () => allAreas.value.find((area) => area.id === editingAreaId.value) ?? null,
);

function toggleAreaMenu(id: string) {
  areaMenuId.value = areaMenuId.value === id ? '' : id;
}

function closeAreaMenu() {
  areaMenuId.value = '';
}

function areaLineCount(area: SensitiveArea) {
  return (areaLineIndex.value.get(area.id) ?? []).length;
}

/**
 * 路线视角下从命中点位清单进入详情。
 * 只选中 + 画敏感圈 + 开详情，**不改视野**：整条轨迹已在视野内，
 * flyTo 到 12 级反而会把轨迹裁掉，看不出"这个点在这条线的哪一段"。
 */
function openHitAreaDetail(area: SensitiveArea) {
  assetMapState.selectedAreaId = area.id;
  openAreaDetail(area);
}

/**
 * 运单视角：把某个命中点位在地图上**弹窗 + 居中**，不进详情页（航哥 20261123）。
 *
 * ⚠️ 顺序不能反：`watch(selectedAreaId)` 会触发 `drawSensitiveMode()` **全量重绘**，
 * marker 被销毁重建、刚 openPopup 的浮窗会跟着消失。所以必须等 nextTick（重绘跑完）
 * 之后再 setView + openPopup。重绘函数末尾本来也会对选中点 openPopup，这里显式再开一次，
 * 保证「从明细列表点进来」（selectedAreaId 未变化、不触发重绘）时浮窗同样弹出。
 */
async function focusWaybillStop(area: SensitiveArea, center = true) {
  // 明确不进详情页（航哥 20261123：「不需要再点击后进入异常敏感区域的详情页面」）
  detailAreaId.value = '';
  editingAreaId.value = '';
  const wb = selectedWaybill.value;
  const idx = wb ? wb.hits.findIndex((h) => h.areaId === area.id) : -1;
  // 「敏感区域停靠」明细行点进来 → 弹的是**停靠浮窗**（停靠地址 / POI类型 / 起止时间 / 时长），
  // 不是点位浮窗。序号标记的 layer key 就是 wbtraj-stop-${idx}
  reopenPopupKey = idx >= 0 ? `wbtraj-stop-${idx}` : `wbtraj-sa-${area.id}`;
  if (assetMapState.selectedAreaId !== area.id) {
    assetMapState.selectedAreaId = area.id; // 触发重绘 → 强调档尺寸 + 敏感半径圈
    await nextTick();                        // 必须等重绘跑完，否则刚开的浮窗被销毁
  }
  if (!map) return;
  const target = (layers[reopenPopupKey] as L.Marker | L.CircleMarker | undefined);
  // 只有从右栏列表点进来才居中（center=true）；在地图上直接点标记时 center=false，不移动地图。
  // 居中目标取**停靠位置**（轨迹上的序号标记）而非点位圆心——两者差几十到几百米，
  // 居中到圆心会让客户以为车停在点位中心
  if (center) {
    const ll = target ? (target as L.Marker).getLatLng() : L.latLng(area.lat, area.lng);
    // 不过度放大：保留整条轨迹上下文；全国级视野时收到 9 级保证弹窗读得清
    map.setView(ll, Math.max(map.getZoom(), 9), { animate: true });
  }
  target?.openPopup();
}

/**
 * 点位本体的大圆被点：只选中 + 开浮窗，**不移动地图**。
 * 航哥 20261123：「没必要一直保障浮窗必须在正中间」——在地图上点一个已经看得见的点，
 * 再把地图拽过去反而是干扰。需要居中的场景（从右栏列表点进来）走 focusWaybillStop(area, true)。
 */
async function selectWaybillHitArea(area: SensitiveArea) {
  if (assetMapState.selectedAreaId === area.id) {
    assetMapState.selectedAreaId = '';
    reopenPopupKey = null;
    return;
  }
  reopenPopupKey = `wbtraj-sa-${area.id}`;
  assetMapState.selectedAreaId = area.id;
  await nextTick();
  (layers[reopenPopupKey] as L.CircleMarker | undefined)?.openPopup();
}

function openAreaDetailFromMenu(area: SensitiveArea) {
  closeAreaMenu();
  assetMapState.selectedAreaId = area.id;
  openAreaDetail(area);
  // 菜单里点「详情」时点位可能在视野外，必须定位过去，否则右侧有详情、地图上看不到点
  requestMapFlyTo(area.lat, area.lng, 12);
}

function locateArea(area: SensitiveArea) {
  closeAreaMenu();
  // 已选中则先取消再选中，保证地图重新定位
  if (assetMapState.selectedAreaId === area.id) assetMapState.selectedAreaId = '';
  selectArea(area);
}

/**
 * 进入编辑态。
 *
 * ⚠️ **只允许「人工发现」点位编辑**（航哥 20261124 待确认11）。列表里的编辑按钮已按来源 v-if 隐藏，
 * 但**只藏按钮不够**——详情面板的 @edit、以及将来任何新入口都能调到这个函数。
 * 守卫必须落在函数里，否则"UI 看不见"和"实际不能改"是两件事，后者才是真的权限。
 */
function startEditArea(area: SensitiveArea) {
  closeAreaMenu();
  // ⚠️ 守卫必须留在函数里，不能只靠列表按钮的 v-if：详情面板 @edit、以及将来任何新入口
  // 都能调到这个函数。"UI 看不见"和"实际不能改"是两件事，后者才是真的权限。
  if (area.source !== 'manual') {
    ElMessage.warning('AI 识别点位由中台按月统一更新，不支持在此编辑');
    return;
  }
  editingAreaId.value = area.id;
  // 编辑时同样选中并定位：弹窗里改半径/坐标，背后地图上要能看到这个点和它的圈
  // （选中还会自动放开来源筛选，避免点位被过滤掉看不见）
  assetMapState.selectedAreaId = area.id;
  requestMapFlyTo(area.lat, area.lng, 12);
}

function cancelEdit() {
  editingAreaId.value = '';
}

/*
 * `applyEditRadius()` / `saveEdit()` 已随内联编辑面板一起删除（航哥 20261124 改用弹窗）。
 * 表单值校验、名称 clamp、半径范围检查、落库调用全部搬进 SensitiveAreaFormDialog —— 那里
 * 与录入共用同一张 SensitiveAreaConfirmCard，校验只写一处，录入与编辑不会各自漂移。
 * ⚠️ 别把校验留在父组件：弹窗自己会 emit 已校验过的 payload，父级再校验一遍就有两套真相。
 */

/**
 * 彻底删除点位。
 *
 * ⚠️ **只允许删「人工发现」点位**（航哥 20261124：「ai识别的也不可删除」）。
 * AI 点位由中台按月跑批统一维护：这个月删掉，下月跑批又会被重新导入，
 * 删除动作对客户来说等于无效操作，还会让人误以为"我删过了怎么又出现"。
 * 与编辑同一条理由，所以编辑/删除两个入口对 AI 点位一并关闭。
 * 守卫同样落在函数里，不只靠列表按钮 v-if。
 */
async function handleDeleteArea(area: SensitiveArea) {
  closeAreaMenu();
  if (area.source !== 'manual') {
    ElMessage.warning('AI 识别点位由中台按月统一更新，不支持在此删除');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将彻底删除「${areaDisplayName(area)}」，删除后不可恢复。`,
      '彻底删除敏感区域',
      { type: 'warning', confirmButtonText: '彻底删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  if (assetMapState.selectedAreaId === area.id) assetMapState.selectedAreaId = '';
  if (assetMapState.hoverAreaId === area.id) assetMapState.hoverAreaId = '';
  if (editingAreaId.value === area.id) editingAreaId.value = '';
  deleteSensitiveArea(area.id);
  // 删除后当前页可能越界，回退到最后一页
  const maxPage = Math.max(1, Math.ceil(visibleAreas.value.length / LIST_PAGE_SIZE));
  if (listPage.value > maxPage) listPage.value = maxPage;
  ElMessage.success(`已彻底删除「${areaDisplayName(area)}」`);
}

// 筛选变化：回到第 1 页、清选中、地图按新的可见点位重绘并自适应视野
// 例外：由检索跳转触发的筛选重置要保留选中，否则跳过去反而什么都选不中
//
// ⚠️ **必须同时监听 riskFilter**（航哥 20261123：「切换到哪个 tab，地图就显示哪个 tab 的敏感区域」）。
// 原来只有 sourceFilter，于是切「全部 / 人工发现 / AI识别」地图会跟着变，
// 但切 AI 下面的「高风险 / 中风险 / 低风险」子 tab **地图纹丝不动**——只有右栏列表在变，
// 地图与列表各说一套。switchRiskFilter() 里也只重置了 listPage，没重绘，两处都得补。
/**
 * 运单检索词变化 → **回到第 1 页**（航哥 20261123：「运单列表实时更新」）。
 *
 * 检索框本来就是 `v-model` 双向绑定、逐字触发 `matchedWaybills` 重算，数据层面一直是实时的。
 * 真正的问题是**页码没跟着重置**：翻到第 5 页再输入关键词，结果从 300 单缩到 12 单，
 * 而 `listPage` 还停在 5 → `pagedWaybills` 切出来是空数组 → 列表一片空白。
 * 客户看到的就是"我明明搜到了，列表却没了"，也就是他说的"不实时"。
 */
watch(() => assetMapState.sensitiveWaybillQuery, () => {
  listPage.value = 1;
});

/**
 * 兜底钳制：任何原因导致总数变少、当前页越界时，自动退回最后一页。
 * 上面那个 watch 只覆盖"改检索词"这一条路径；删除点位、切视角、归并视图切换
 * 等也会让 `currentListTotal` 缩水，统一在这里兜住，避免再出现空白页。
 */
watch(listPageCount, (maxPage) => {
  if (listPage.value > maxPage) listPage.value = maxPage;
});

watch([sourceFilter, riskFilter], () => {
  listPage.value = 1;
  if (keepSelectionOnFilterReset) {
    keepSelectionOnFilterReset = false;
  } else {
    assetMapState.selectedAreaId = '';
    assetMapState.hoverAreaId = '';
  }
  if (!isLineMode.value) {
    map?.closePopup();
    drawSensitiveMode();
    fitCurrentBounds();
  }
});

// 点位数据变化（对话框新录入 / 编辑 / 删除）→ 重绘地图
// 线路模式现在也会铺敏感点位并做关联高亮，所以两种模式都要重绘
watch(
  () =>
    sensitiveAreaState.areas
      .map((area) => `${area.id}:${area.status}:${area.lat}:${area.lng}:${area.radiusM}:${area.areaType}:${area.name}`)
      .join('|'),
  () => {
    redraw();
  },
);

// ===== 抽屉详情 =====

const drawerOpen = ref(false);
const selectedLine = computed<AggLine | null>(
  () => currentLines.value.find((line) => line.id === assetMapState.selectedLineId) ?? null,
);

const drawerStats = computed(() => {
  const line = selectedLine.value;
  if (!line) return null;
  const trend = line.monthlyTrend;
  const last = trend[trend.length - 1] ?? 0;
  const prev = trend[trend.length - 2] ?? 0;
  // 环比上月：给趋势图之外的一个精确读数（涨红跌绿，沿用国内习惯）
  const mom = prev > 0 ? (last - prev) / prev : 0;
  return {
    momUp: mom >= 0,
    momLabel: `${mom >= 0 ? '▲' : '▼'} ${Math.abs(mom * 100).toFixed(1)}%`,
  };
});

const selectedLineSensitive = computed(() => {
  const line = selectedLine.value;
  if (!line) return null;
  return lineSensitiveMap.value.get(line.id) ?? null;
});

watch(() => assetMapState.selectedLineId, (id) => {
  const exists = currentLines.value.some((line) => line.id === id);
  if (id && exists && !isTop20.value) {
    drawerOpen.value = true;
  } else {
    drawerOpen.value = false;
  }
});

function closeDrawer() {
  drawerOpen.value = false;
  assetMapState.selectedLineId = '';
}
</script>

<template>
  <div class="relative mb-5 flex h-[600px] gap-4">
    <!-- 菜单打开时的点击遮罩（点空白关闭） -->
    <div v-if="areaMenuId" class="fixed inset-0 z-[550]" @click="closeAreaMenu"></div>

    <!-- 左：地图（与右栏同高，随页面滚动，不吸顶） -->
    <div class="relative min-w-0 flex-1">
      <div ref="mapRef" class="platform-map absolute inset-0 overflow-hidden rounded-xl border border-[#e4e4e0] bg-[#f3f3ef]"></div>
      <div class="pointer-events-none absolute inset-0 rounded-xl" style="box-shadow: inset 0 0 0 1px rgba(255,255,255,.55), inset 0 1px 0 rgba(255,255,255,.6), inset 0 -12px 24px rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.04);"></div>

      <!-- 地图右上角工具区：模式切换 + 底图切换（检索已移到右栏列表上方）
           抽屉宽度已收到与右栏同宽(340px)，不会再压进地图，右上角可安全放置 -->
      <div class="absolute right-3 top-3 z-[520] flex flex-col items-end gap-2">
        <!-- 模式切换：仅「路线」分区显示省/市/县；总览与敏感区域由二级导航直接决定 -->
        <div v-if="visibleModeTabs.length > 0" class="flex items-center gap-1 rounded-lg border border-white/60 bg-white/85 p-1 shadow-sm backdrop-blur-md">
          <button
            v-for="tab in visibleModeTabs"
            :key="tab.id"
            type="button"
            class="rounded-md px-2.5 py-1 text-[11px] font-medium transition"
            :class="assetMapState.mode === tab.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-[#f7f7f5] hover:text-slate-900'"
            @click="switchMode(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- 敏感区域分区专属：敏感区域 / 路线 / 运单 三视角（航哥 20261120 要求 tab 放在地图里） -->
        <div
          v-if="assetMapState.mode === 'sensitive'"
          class="flex items-center gap-1 rounded-lg border border-white/60 bg-white/85 p-1 shadow-sm backdrop-blur-md"
        >
          <button
            v-for="tab in SENSITIVE_VIEW_TABS"
            :key="tab.id"
            type="button"
            class="rounded-md px-2.5 py-1 text-[11px] font-medium transition"
            :class="assetMapState.sensitiveView === tab.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-[#f7f7f5] hover:text-slate-900'"
            @click="setSensitiveView(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- 底图切换：标准图 / 卫星图 -->
        <div class="flex items-center gap-0.5 rounded-lg border border-white/70 bg-white/92 p-0.5 shadow-sm backdrop-blur-md">
          <button
            v-for="option in BASE_MAP_OPTIONS"
            :key="option.id"
            type="button"
            class="rounded px-2 py-0.5 text-[11px] font-medium transition"
            :class="baseStyle === option.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'"
            @click="switchBaseStyle(option.id)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- 图例：线路模式 -->
      <div v-if="isLineMode" class="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-1.5 rounded-lg border border-white/60 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">线路量级</p>
        <div class="flex items-center gap-1.5">
          <span class="h-[3.5px] w-5 rounded-full bg-[#dc2626]"></span>
          <span class="text-[11px] text-slate-600">高频</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="h-[2.5px] w-5 rounded-full bg-[#8b5cf6]"></span>
          <span class="text-[11px] text-slate-600">中频</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="h-[1.5px] w-5 rounded-full bg-[#3b82f6]"></span>
          <span class="text-[11px] text-slate-600">低频</span>
        </div>
        <div v-if="!isTop20" class="mt-1 border-t border-slate-200/70 pt-1.5">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">敏感区域</p>
          <div class="mt-1 flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-[#64748b]/60"></span>
            <span class="text-[11px] text-slate-600">敏感区域（打底）</span>
          </div>
          <div class="mt-1 flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 rounded-full border border-white bg-[#dc2626]"></span>
            <span class="text-[11px] text-slate-600">选中线路途经命中</span>
          </div>
        </div>
      </div>

      <!-- 图例：敏感区域模式 -->
      <!-- 图例：路线视角·全览态（40 条线路三档配色 + 全量点位二色） -->
      <div v-else-if="isSensitiveByLine && !selectedSensitiveLine" class="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-1.5 rounded-lg border border-white/60 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">路线全览</p>
        <div class="flex items-center gap-1.5">
          <span class="h-[3px] w-5 rounded-full bg-[#dc2626]"></span>
          <span class="text-[11px] text-slate-600">高频线路</span>
          <span class="ml-1 h-[2.5px] w-4 rounded-full bg-[#8b5cf6]"></span>
          <span class="text-[11px] text-slate-600">中频</span>
          <span class="ml-1 h-[1.5px] w-4 rounded-full bg-[#3b82f6]"></span>
          <span class="text-[11px] text-slate-600">低频</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-1"><span class="h-3 w-3 rounded-full border-2 border-white" :style="{ background: MANUAL_AREA_COLOR }"></span><span class="text-[11px] text-slate-600">人工发现</span></span>
          <!-- 图例色**绑定 RISK_COLOR 常量**，不再硬编码 hex：改配色时图例自动跟随，
               不会出现"图例说一套、地图上画另一套"（硬编码时期这个漂移反复出现过） -->
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.high }"></span><span class="text-[11px] text-slate-600">高</span></span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.mid }"></span><span class="text-[11px] text-slate-600">中</span></span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.low }"></span><span class="text-[11px] text-slate-600">低</span></span>
        </div>
        <p class="text-[10px] text-slate-400">全部为真实道路轨迹 · 三档色为 AI识别风险等级</p>
      </div>

      <!-- 图例：敏感区域·路线视角（命中点沿用来源色，与全览态同一套编码） -->
      <div v-else-if="isSensitiveByLine && selectedSensitiveLine" class="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-1.5 rounded-lg border border-white/60 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">当前线路</p>
        <div class="flex items-center gap-1.5">
          <span class="h-[3.5px] w-5 rounded-full bg-[#2563eb]"></span>
          <span class="text-[11px] text-slate-600">真实轨迹</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-1"><span class="h-3 w-3 rounded-full border-2 border-white" :style="{ background: MANUAL_AREA_COLOR }"></span><span class="text-[11px] text-slate-600">人工发现</span></span>
          <!-- 图例色**绑定 RISK_COLOR 常量**，不再硬编码 hex：改配色时图例自动跟随，
               不会出现"图例说一套、地图上画另一套"（硬编码时期这个漂移反复出现过） -->
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.high }"></span><span class="text-[11px] text-slate-600">高</span></span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.mid }"></span><span class="text-[11px] text-slate-600">中</span></span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.low }"></span><span class="text-[11px] text-slate-600">低</span></span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-[#0f172a] text-[7px] font-bold text-white">起</span>
          <span class="text-[11px] text-slate-600">起点</span>
          <span class="ml-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-[#0f172a] text-[7px] font-bold text-white">终</span>
          <span class="text-[11px] text-slate-600">终点</span>
        </div>
      </div>

      <!-- 图例：敏感区域·运单视角 -->
      <div v-else-if="isSensitiveByWaybill && selectedWaybill" class="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-1.5 rounded-lg border border-white/60 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">当前运单</p>
        <!-- 「真实轨迹（起点淡 → 终点浓）」整行已删（航哥 20261123）：轨迹本身就是画面主体，
             再用一行图例解释"起点淡终点浓"属于冗余说明 -->
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-1"><span class="h-3 w-3 rounded-full border-2 border-white" :style="{ background: MANUAL_AREA_COLOR }"></span><span class="text-[11px] text-slate-600">人工发现</span></span>
          <!-- 图例色**绑定 RISK_COLOR 常量**，不再硬编码 hex：改配色时图例自动跟随，
               不会出现"图例说一套、地图上画另一套"（硬编码时期这个漂移反复出现过） -->
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.high }"></span><span class="text-[11px] text-slate-600">高</span></span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.mid }"></span><span class="text-[11px] text-slate-600">中</span></span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.low }"></span><span class="text-[11px] text-slate-600">低</span></span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="flex h-4 w-4 items-center justify-center rounded-full bg-[#64748b] text-[9px] font-bold text-white">1</span>
          <!-- 括号里的「底色 = 该点风险色」已删（航哥：「这个不给我去掉，你把括号里的内容给我去掉就行」）。
               ⚠️ 他先说整条删掉、随后立即纠正为只删括号，**以纠正为准**：条目保留 -->
          <span class="text-[11px] text-slate-600">敏感区域停靠序号</span>
        </div>
        <div class="flex items-center gap-1.5">
          <!-- 「发货」「收货」文字已删（航哥：「只保留图例」）——圆内已有「起」「终」二字，
               再加文字就是同一信息说两遍 -->
          <span class="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-[#0f172a] text-[7px] font-bold text-white">起</span>
          <span class="ml-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-[#0f172a] text-[7px] font-bold text-white">终</span>
        </div>
      </div>

      <div v-else class="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-1.5 rounded-lg border border-white/60 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">敏感区域</p>
        <div class="flex items-center gap-1.5">
          <!-- 人工发现的图例点画得更大，与地图上实际的尺寸差一致（图例与实物的视觉比例不能撒谎） -->
          <span class="h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm" :style="{ background: MANUAL_AREA_COLOR }"></span>
          <span class="text-[11px] text-slate-600">人工发现（不定级）</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.high }"></span><span class="text-[11px] text-slate-600">高风险</span></span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.mid }"></span><span class="text-[11px] text-slate-600">中</span></span>
          <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-full border border-white" :style="{ background: RISK_COLOR.low }"></span><span class="text-[11px] text-slate-600">低</span></span>
        </div>
        <p class="text-[10px] text-slate-400">以上三档为 AI识别点位 · 悬停或点击点位看详情</p>
        <div class="flex items-center gap-1.5">
          <span class="h-3 w-3 rounded-full border border-dashed border-slate-400"></span>
          <span class="text-[11px] text-slate-600">敏感半径（选中显示）</span>
        </div>
      </div>

      <!-- 轨迹播放控制条（航哥 20261123：「轨迹也要支持播放」+ 1/5/10/20/50 倍速）
           只在运单详情态出现：其他视角没有轨迹可播 -->
      <div
        v-if="isSensitiveByWaybill && selectedWaybill"
        class="absolute bottom-3 left-1/2 z-[500] w-[min(560px,calc(100%-24px))] -translate-x-1/2 rounded-xl border border-white/70 bg-white/92 px-3 py-2 shadow-lg backdrop-blur-md"
      >
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700"
            :title="isPlaying ? '暂停' : '播放'"
            @click="isPlaying ? pausePlayback() : startPlayback()"
          >
            <svg v-if="!isPlaying" width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5l7 4.5-7 4.5z" /></svg>
            <svg v-else width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="2.5" y="2" width="2.6" height="8" rx="0.6" /><rect x="6.9" y="2" width="2.6" height="8" rx="0.6" /></svg>
          </button>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-400 hover:text-slate-800"
            title="重新播放"
            @click="restartPlayback()"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 6a4 4 0 1 0 1.3-2.9" /><path d="M2 1.6V4h2.4" /></svg>
          </button>
          <!-- 进度条：可拖动定位 -->
          <input
            type="range" min="0" max="1000" step="1"
            class="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
            :value="Math.round(playbackProgress * 1000)"
            @input="seekPlayback(Number(($event.target as HTMLInputElement).value) / 1000)"
          />
          <span class="shrink-0 font-mono text-[10px] tabular-nums text-slate-500">{{ (playbackProgress * 100).toFixed(0) }}%</span>
          <!-- 倍速：1/5/10/20/50 -->
          <div class="flex shrink-0 items-center gap-0.5 rounded-md bg-[#f2f2ef] p-0.5">
            <button
              v-for="s in PLAYBACK_SPEEDS"
              :key="s"
              type="button"
              class="rounded px-1.5 py-0.5 text-[10px] font-medium transition"
              :class="playbackSpeed === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="setPlaybackSpeed(s)"
            >{{ s }}×</button>
          </div>
        </div>
        <p class="mt-1 text-center text-[10px] text-slate-400">
          按真实时间轴回放 {{ formatTs(selectedWaybill.departTs) }} → {{ formatTs(selectedWaybill.arriveTs) }} · 经过敏感区域停靠点时自动弹出浮窗
        </p>
      </div>

      <!-- 底部说明 -->
      <div class="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[70%] rounded-lg border border-white/60 bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur-md">
        <p class="text-[11px] text-slate-600">{{ modeDescription }}</p>
      </div>
    </div>

    <!-- 右：联动列表（随模式切换，列表自身可滚动） -->
    <div class="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#e4e4e0] bg-white">
      <!-- 详情态：完整覆盖右栏（含头部），与列表同尺寸 -->
      <SensitiveAreaDetailPanel
        v-if="detailArea"
        :area="detailArea"
        :line-refs="detailLineRefs"
        class="min-h-0 flex-1"
        @back="closeAreaDetail"
        @edit="editFromDetail"
        @deleted="closeAreaDetail"
        @open-line="onOpenLineRemoved"
        @view-vehicles="onDetailViewVehicles"
        @view-waybills="onDetailViewWaybills"
      />


      <template v-else>
      <!-- relative：作为「AI 识别规则」浮框的定位基准。
           ⚠️ 浮框**不能挂在 icon 自己的容器里**：icon 左侧还有「录入点位」按钮，
           icon 容器右缘距右栏右缘约 100px，300px 宽的浮框以 icon 为基准 `right-0` 向左展开时
           会越过右栏左边界约 59px，被右栏的 `overflow-hidden` 裁掉。
           改挂到 header 上、用 `right-4` 对齐右栏内容区右缘，才完整落在 340px 栏内。 -->
      <div class="relative border-b border-[#eeeeec] px-4 py-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">{{ panelTitle }}</p>

          <!--
            ===== AI 识别规则 icon + 悬停浮框（航哥 20261123）=====
            原话：「要有一个可以展示 AI 识别运单的规则的地方，要有一个 icon，鼠标触碰就显示一个浮框，
                   然后敏感区域里只有一个 icon 能看就行，我想着是加到敏感区域列表的上面标题那里」。

            ⚠️ **只在「敏感区域」视角出现**（`!isSensitiveByLine && !isSensitiveByWaybill`）——
               航哥要求"敏感区域里只有一个 icon 能看就行"，运单视角不再重复放一个。
            ⚠️ **规则内容从 DISCOVERY_RULES / AREA_TYPE_OPTIONS / RISK_THRESHOLD 派生，不写死文案**：
               这三处是规则与阈值的单一事实来源，写死会出现"浮框讲的规则和实际分级对不上"。
               「轨迹丢失窝点」已下线，所以只遍历 AREA_TYPE_OPTIONS（自动排除 gps_loss）。
            ⚠️ **浮框必须落在右栏 340px 容器内**：右栏是 `overflow-hidden`，浮框若向左溢出会被裁掉。
               故宽度取 300px、`right-0` 右对齐、向下展开。
          -->
          <div
            v-if="assetMapState.mode === 'sensitive' && !isSensitiveByLine && !isSensitiveByWaybill"
            class="shrink-0"
            @mouseenter="showAiRule"
            @mouseleave="hideAiRule"
          >
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded-full border border-[#deded9] bg-white text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              :class="aiRuleHover ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : ''"
              aria-label="AI 识别规则"
              title="AI 识别规则"
            >
              <!-- AI 星芒图标：与「录入点位」的 + 号、「更多」的 ⋯ 在形状上区分开，一眼知道是说明类入口 -->
              <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M6 0.8l1.05 2.9a.3.3 0 0 0 .19.19L10.15 5 7.24 6.06a.3.3 0 0 0-.19.19L6 9.15 4.95 6.25a.3.3 0 0 0-.19-.19L1.85 5l2.91-1.06a.3.3 0 0 0 .19-.19L6 0.8z" />
                <path d="M9.6 8.1l.45 1.25 1.25.45-1.25.45-.45 1.25-.45-1.25-1.25-.45 1.25-.45.45-1.25z" opacity=".65" />
              </svg>
            </button>

          </div>

          <!-- 敏感区域：录入入口（复用对话框的录入链路，不再造第二套 UI） -->
          <button
            v-if="assetMapState.mode === 'sensitive' && !isSensitiveByLine && !isSensitiveByWaybill"
            type="button"
            class="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-slate-800"
            title="弹窗录入：粘贴或输入点位信息，自动识别后核对入库"
            @click="intakeDialogVisible = true"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 1.5v9M1.5 6h9" /></svg>
            录入点位
          </button>
        </div>
        <!-- AI 识别规则浮框：挂在 header（relative）上，`right-4 top-8` 落在右栏内容区内，
             不会被右栏 overflow-hidden 裁切。见上方 header 注释说明为何不能挂在 icon 容器里 -->
            <div
              v-show="aiRuleHover"
              @mouseenter="showAiRule"
              @mouseleave="hideAiRule"
              class="absolute right-4 top-8 z-[600] w-[300px] rounded-lg border border-[#e3e3df] bg-white p-3 shadow-[0_8px_28px_rgba(15,23,42,0.14)]"
            >
              <p class="text-[12px] font-semibold text-slate-900">AI 识别规则</p>
              <p class="mt-0.5 text-[10px] leading-4 text-slate-400">
                数据源：中交兴路 12 吨以上重卡 GPS 轨迹 · 统计窗口近 30 天
              </p>

              <div class="mt-2 space-y-2 border-t border-[#f0f0ed] pt-2">
                <div v-for="t in AREA_TYPE_OPTIONS" :key="t">
                  <p class="text-[11px] font-medium text-slate-800">{{ AREA_TYPE_LABEL[t] }}</p>
                  <p class="mt-0.5 text-[10px] leading-4 text-slate-500">
                    <span class="text-slate-400">识别规则</span> · {{ DISCOVERY_RULES[t].rule }}
                  </p>
                  <p class="text-[10px] leading-4 text-slate-500">
                    <span class="text-slate-400">判定阈值</span> · {{ DISCOVERY_RULES[t].threshold }}
                  </p>
                </div>
              </div>

              <div class="mt-2 border-t border-[#f0f0ed] pt-2">
                <p class="text-[11px] font-medium text-slate-800">风险分级</p>
                <p class="text-[10px] leading-4 text-slate-400">按近 30 天异常停靠运单数自动派生</p>
                <div class="mt-1 space-y-0.5">
                  <p v-for="r in aiRuleRiskRows" :key="r.level" class="flex items-center gap-1.5 text-[10px] text-slate-600">
                    <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: RISK_COLOR[r.level] }"></span>
                    <span class="w-[52px] shrink-0">{{ r.label }}</span>
                    <span class="font-mono">{{ r.text }}</span>
                  </p>
                </div>
              </div>

              <p class="mt-2 border-t border-[#f0f0ed] pt-2 text-[10px] leading-4 text-slate-400">
                仅 AI识别点位定级；人工发现点位暂不定级，以紫色更大圆点标识。
              </p>
            </div>
        <p class="mt-1 text-[11px] text-slate-400">
          {{ isSensitiveByLine
            ? (selectedSensitiveLine ? '地图已渲染该线路的真实轨迹，彩色点为其命中的敏感区域（颜色 = 风险等级）' : `地图已铺全部 ${sensitiveLines.length} 条市到市线路的真实轨迹，点击任一条查看其命中点位`)
            : isSensitiveByWaybill
              ? (selectedWaybill ? '地图已渲染该运单的真实轨迹，带序号的圆标为敏感区域停靠位置（底色 = 该点风险等级）' : '按点位名 / 经纬度 / 车牌号 / 运单号检索，列表只收录有敏感区域停靠的运单')
              : assetMapState.mode === 'sensitive' ? '点击列表项地图定位并呈现敏感半径，再次点击取消选中' : assetMapState.mode === 'top20' ? '悬停高亮地图飞线' : '悬停高亮飞线，点击查看线路详情' }}
        </p>

        <!-- 检索：路线 / 敏感区域点位 / 地点定位（总览 Top20 与两个收窄视角不提供） -->
        <div v-if="!isTop20 && !isSensitiveByLine && !isSensitiveByWaybill" class="mt-2">
          <MapSearchBox />
        </div>

        <!-- 运单视角：单车 / 运单检索（航哥 20261123） -->
        <div v-if="isSensitiveByWaybill && !selectedWaybill" class="mt-2">
          <div class="flex items-center gap-1.5 rounded-md border border-[#e3e3df] bg-white px-2 py-1.5 focus-within:border-slate-400">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" class="shrink-0 text-slate-400"><circle cx="5" cy="5" r="3.4" /><path d="M7.6 7.6L10.5 10.5" stroke-linecap="round" /></svg>
            <input
              v-model="assetMapState.sensitiveWaybillQuery"
              type="text"
              placeholder="点位名 / 经纬度 / 车牌号 / 运单号"
              class="min-w-0 flex-1 bg-transparent text-[11px] text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              v-if="assetMapState.sensitiveWaybillQuery"
              type="button"
              class="shrink-0 text-[10px] text-slate-400 transition hover:text-slate-700"
              @click="assetMapState.sensitiveWaybillQuery = ''"
            >
              清除
            </button>
          </div>
          <p class="mt-1 text-[10px] text-slate-400">
            <!-- 统计口径随「只列异常单」同步改文案，否则客户会以为 587 单里只搜到这么几条 -->
            异常运单 {{ matchedWaybills.length }} 单 · {{ matchedVehicleCount }} 辆车 · 按发运时间最新在前
          </p>
        </div>

        <!-- 敏感区域：来源筛选 -->
        <div v-if="assetMapState.mode === 'sensitive' && !isSensitiveByLine && !isSensitiveByWaybill" class="mt-2 flex items-center justify-between gap-2">
          <div class="flex items-center gap-0.5 rounded-md bg-[#f2f2ef] p-0.5">
            <button
              v-for="filter in SOURCE_FILTERS"
              :key="filter.id"
              type="button"
              class="rounded px-2 py-0.5 text-[10px] font-medium transition"
              :class="sourceFilter === filter.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="switchSourceFilter(filter.id)"
            >
              {{ filter.label }}
            </button>
          </div>
        </div>

        <!-- 风险等级子 tab：仅「AI识别」下出现（人工发现不定级，此控件对它无意义） -->
        <div v-if="showRiskFilter && !isSensitiveByLine && !isSensitiveByWaybill" class="mt-1.5 flex items-center gap-1">
          <span class="shrink-0 text-[10px] text-slate-400">风险等级</span>
          <div class="flex items-center gap-0.5 rounded-md bg-[#f2f2ef] p-0.5">
            <button
              v-for="rf in RISK_FILTERS"
              :key="rf.id"
              type="button"
              class="rounded px-2 py-0.5 text-[10px] font-medium transition"
              :class="riskFilter === rf.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
              @click="switchRiskFilter(rf.id)"
            >
              {{ rf.label }}<span class="ml-0.5 text-[9px] text-slate-400">{{ riskFilterCount[rf.id] }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <!-- Top20 列表 -->
        <template v-if="assetMapState.mode === 'top20'">
          <div
            v-for="(line, idx) in pagedTop20"
            :key="line.id"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition"
            :class="assetMapState.hoverLineId === line.id ? 'bg-blue-50' : 'hover:bg-[#f7f7f5]'"
            @mouseenter="hoverTop20Line(line)"
            @mouseleave="hoverTop20Line(null)"
            @click="clickTop20Line(line)"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold"
                :class="pageStart + idx < 3 ? 'bg-slate-900 text-white' : 'bg-[#f0f0ed] text-slate-500'"
              >{{ pageStart + idx + 1 }}</span>
              <div class="min-w-0">
                <p class="truncate text-[13px] font-medium text-slate-900">{{ line.from }} → {{ line.to }}</p>
                <p class="mt-0.5 text-[11px] text-slate-400">承运车辆 {{ line.carrierVehicleCount.toLocaleString() }} 辆</p>
                <p v-if="sensitiveBrief(line)" class="mt-0.5 text-[11px]">
                  <span class="font-medium text-red-600">敏感停靠 {{ sensitiveBrief(line)?.waybills.toLocaleString() }} 单</span>
                  <span class="text-slate-400"> · {{ sensitiveBrief(line)?.areaCount }} 个点位</span>
                </p>
              </div>
            </div>
            <span class="shrink-0 text-xs font-semibold text-slate-700">{{ formatNumber(line.waybillCount) }} 单</span>
          </div>
        </template>

        <!-- 聚合线路列表（省/市/县） -->
        <template v-else-if="assetMapState.mode !== 'sensitive'">
          <div
            v-for="(line, idx) in pagedAggLines"
            :key="line.id"
            class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition"
            :class="assetMapState.selectedLineId === line.id ? 'bg-violet-50' : 'hover:bg-[#f7f7f5]'"
            @mouseenter="hoverAggLine(line)"
            @mouseleave="hoverAggLine(null)"
            @click="selectAggLine(line)"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold"
                :class="pageStart + idx < 3 ? 'bg-violet-600 text-white' : 'bg-[#f0f0ed] text-slate-500'"
              >{{ pageStart + idx + 1 }}</span>
              <div class="min-w-0">
                <p class="truncate text-[13px] font-medium text-slate-900">{{ line.from }} → {{ line.to }}</p>
                <p class="mt-0.5 text-[11px] text-slate-400">承运车辆 {{ line.carrierVehicleCount.toLocaleString() }} 辆</p>
                <p v-if="sensitiveBrief(line)" class="mt-0.5 text-[11px]">
                  <span class="font-medium text-red-600">敏感停靠 {{ sensitiveBrief(line)?.waybills.toLocaleString() }} 单</span>
                  <span class="text-slate-400"> · {{ sensitiveBrief(line)?.areaCount }} 个点位</span>
                </p>
              </div>
            </div>
            <span class="shrink-0 text-xs font-semibold text-slate-700">{{ formatNumber(line.waybillCount) }} 单</span>
          </div>
        </template>

        <!-- 敏感区域列表 -->
        <template v-else>
          <!-- 编辑面板已提升到右栏容器顶层（与详情面板同级），见下方 v-else-if="editingArea" 分支 -->

          <!-- ===== 敏感区域 · 路线视角（航哥 20261120）===== -->
          <template v-if="isSensitiveByLine">
            <!-- 未选线路：市到市线路列表 -->
            <template v-if="!selectedSensitiveLine">
              <div
                v-for="line in pagedSensitiveLines"
                :key="line.id"
                class="cursor-pointer rounded-lg border px-3 py-2.5 transition"
                :class="assetMapState.hoverLineId === line.id ? 'border-slate-300 bg-[#f7f7f5]' : 'border-transparent hover:bg-[#f7f7f5]'"
                @click="selectSensitiveLine(line.id)"
                @mouseenter="assetMapState.hoverLineId = line.id"
                @mouseleave="assetMapState.hoverLineId = ''"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate text-[13px] font-medium text-slate-900">{{ line.from }} → {{ line.to }}</p>
                    <p class="mt-0.5 text-[11px] text-slate-400">承运车辆 {{ line.carrierVehicleCount.toLocaleString() }} 辆</p>
                    <!-- 途经敏感区域情况：运单 / 车辆 / 停靠次数 / 点位数（航哥 20261123 要求给全） -->
                    <p v-if="sensitiveLineStats.get(line.id)?.areaCount" class="mt-0.5 text-[11px]">
                      <span class="font-medium text-red-600">异常停靠 {{ sensitiveLineStats.get(line.id)?.waybills.toLocaleString() }} 单</span>
                      <span class="text-slate-400">
                        · {{ sensitiveLineStats.get(line.id)?.vehicles.toLocaleString() }} 车
                        · 停 {{ sensitiveLineStats.get(line.id)?.stopEvents.toLocaleString() }} 次
                        · {{ sensitiveLineStats.get(line.id)?.areaCount }} 个点
                      </span>
                    </p>
                    <p v-else class="mt-0.5 text-[11px] text-slate-400">未命中敏感区域</p>
                  </div>
                  <span class="shrink-0 text-xs font-semibold text-slate-700">{{ formatNumber(line.waybillCount) }} 单</span>
                </div>
              </div>
              <p v-if="sensitiveLines.length === 0" class="px-3 py-10 text-center text-[11px] text-slate-400">暂无市到市线路</p>
            </template>

            <!-- 已选线路：真实轨迹 + 命中点位 -->
            <div v-else class="px-3 py-3">
              <button
                type="button"
                class="mb-2 inline-flex items-center gap-1 text-[11px] text-slate-500 transition hover:text-slate-900"
                @click="selectSensitiveLine(selectedSensitiveLine.id)"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7.5 2L3.5 6l4 4" /></svg>
                返回线路列表
              </button>

              <!-- 线路数据六卡（航哥 20261123：途经信息要给全 运单/车辆/停靠次数/点位数）
                   上排两卡是「本线全部运单」口径，下排四卡是「其中命中敏感区域」口径，用底色区分 -->
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-2.5">
                  <p class="text-[10px] text-slate-500">运单数</p>
                  <p class="mt-0.5 text-base font-semibold text-slate-900">{{ selectedSensitiveLine.waybillCount.toLocaleString() }}</p>
                </div>
                <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-2.5">
                  <p class="text-[10px] text-slate-500">承运车辆数</p>
                  <p class="mt-0.5 text-base font-semibold text-slate-900">{{ selectedSensitiveLine.carrierVehicleCount.toLocaleString() }}</p>
                </div>
                <div class="rounded-lg border border-[#f0dada] bg-[#fdf8f8] p-2.5">
                  <p class="text-[10px] text-slate-500">异常停靠运单</p>
                  <p class="mt-0.5 text-base font-semibold text-red-700">{{ (selectedLineStat?.waybills ?? 0).toLocaleString() }}</p>
                </div>
                <div class="rounded-lg border border-[#f0dada] bg-[#fdf8f8] p-2.5">
                  <p class="text-[10px] text-slate-500">涉及车辆数</p>
                  <p class="mt-0.5 text-base font-semibold text-red-700">{{ (selectedLineStat?.vehicles ?? 0).toLocaleString() }}</p>
                </div>
                <div class="rounded-lg border border-[#f0dada] bg-[#fdf8f8] p-2.5">
                  <p class="text-[10px] text-slate-500">停靠次数</p>
                  <p class="mt-0.5 text-base font-semibold text-red-700">{{ (selectedLineStat?.stopEvents ?? 0).toLocaleString() }}</p>
                </div>
                <div class="rounded-lg border border-[#f0dada] bg-[#fdf8f8] p-2.5">
                  <p class="text-[10px] text-slate-500">涉及敏感点位</p>
                  <p class="mt-0.5 text-base font-semibold text-red-700">{{ selectedLineHitAreas.length }}</p>
                </div>
              </div>
              <p class="mt-1 text-[10px] leading-4 text-slate-400">
                停靠次数为事件数：同一运单在多个点位停靠会分别计数，故 ≥ 异常停靠运单数。
              </p>

              <!-- 轨迹聚合块已整块删除（航哥 20261123 两次要求）：原始/过滤后/分组/代表轨迹、
                   剔除原因分布、完整率/里程/轨迹点三格、D0·K·D_max 全部不再展示。
                   trajectoryAgg.ts 与 generateTrajectoryPool 在数据层保留但已无 UI 消费方。 -->
              <!-- 命中点位：全部列出，每条都可点进详情 -->
              <div class="mt-3">
                <p class="text-xs font-semibold text-slate-900">
                  命中敏感区域
                  <span class="ml-1 text-[10px] font-normal text-slate-400">{{ hitAreaRows.length }} 个 · 按本线运单降序</span>
                </p>
                <ul class="mt-1.5 space-y-1">
                  <li
                    v-for="row in hitAreaRows"
                    :key="row.area.id"
                    class="flex cursor-pointer items-center gap-2 rounded-md border border-[#e3e3df] bg-white px-2 py-1.5 transition hover:border-slate-300 hover:bg-[#f7f7f5]"
                    @click="openHitAreaDetail(row.area)"
                  >
                    <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600"></span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-[11px] font-medium text-slate-800" :title="areaDisplayName(row.area)">{{ areaDisplayName(row.area) }}</p>
                      <p class="truncate text-[10px] text-slate-400">{{ row.area.region }} · {{ AREA_SOURCE_LABEL[row.area.source] }}</p>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="text-[11px] font-semibold text-red-700">本线 {{ row.waybills }} 单</p>
                      <p class="text-[10px] text-slate-400">{{ row.vehicles }} 车 · 停 {{ row.stops }} 次</p>
                    </div>
                  </li>
                </ul>
                <p v-if="hitAreaRows.length === 0" class="mt-2 rounded-md bg-[#f7f7f5] px-2 py-3 text-center text-[11px] text-slate-400">
                  该线路未命中任何敏感区域
                </p>
              </div>
            </div>
          </template>

          <!-- ===== 敏感区域 · 运单视角（航哥 20261123：单车/运单检索 + 单条运单真实轨迹）===== -->
          <template v-if="isSensitiveByWaybill">
            <!-- 未选运单：运单列表 -->
            <template v-if="!selectedWaybill">
              <!-- 按车辆归并视图（浮窗「查看对应车辆」进来时） -->
              <template v-if="groupWaybillByVehicle">
                <div
                  v-for="g in pagedVehicleGroups"
                  :key="g.vehicleNo"
                  class="cursor-pointer rounded-lg border border-transparent px-3 py-2 transition hover:bg-[#f7f7f5]"
                  @click="drillVehicle(g.vehicleNo)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate font-mono text-[13px] font-semibold text-slate-900">{{ g.vehicleNo }}</p>
                    <span class="shrink-0 rounded bg-[#f2f2ef] px-1.5 py-0.5 text-[10px] text-slate-500">{{ g.plateColor }}</span>
                  </div>
                  <p class="mt-0.5 truncate text-[10px] text-slate-400">{{ g.carrier }}</p>
                  <p class="mt-1 text-[11px] text-slate-600">
                    敏感区域停靠 <b class="font-semibold text-red-600">{{ g.stops }}</b> 次 ·
                    涉及 <b class="font-semibold">{{ g.areaCount }}</b> 个点位 · {{ g.waybills }} 单
                  </p>
                  <p class="mt-0.5 text-[10px] text-slate-400">最近停靠 {{ formatTs(g.lastStopTs) }}</p>
                </div>
                <p v-if="vehicleGroups.length === 0" class="px-3 py-10 text-center text-[11px] leading-5 text-slate-400">
                  没有匹配的车辆<br />试试点位名、车牌号或运单号
                </p>
              </template>

              <!-- 运单明细视图：车牌号 + 车牌颜色 / 运单号 / 发收货点 / 收发时间 / 途经敏感点 -->
              <template v-else>
                <div
                  v-for="wb in pagedWaybills"
                  :key="wb.waybillNo"
                  class="cursor-pointer rounded-lg border border-transparent px-3 py-2.5 transition hover:bg-[#f7f7f5]"
                  @click="selectWaybill(wb.waybillNo)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="flex min-w-0 items-center gap-1.5">
                      <span class="truncate font-mono text-[13px] font-semibold text-slate-900">{{ wb.vehicleNo }}</span>
                      <span class="shrink-0 rounded bg-[#f2f2ef] px-1 py-px text-[9px] text-slate-500">{{ wb.plateColor }}</span>
                    </p>
                    <!-- 列表已过滤为「只有异常单」，所以这里必然是异常，不再需要灰色「无异常停靠」分支 -->
                    <span class="shrink-0 rounded bg-[#fdf2f2] px-1.5 py-0.5 text-[10px] font-medium text-red-600">停靠 {{ wb.hits.length }} 处</span>
                  </div>
                  <p class="mt-0.5 truncate font-mono text-[10px] text-slate-400">{{ wb.waybillNo }}</p>
                  <p class="mt-1 truncate text-[11px] text-slate-700" :title="`${wb.originName} → ${wb.destName}`">
                    {{ wb.originName }} <span class="text-slate-300">→</span> {{ wb.destName }}
                  </p>
                  <p class="mt-0.5 text-[10px] text-slate-400">发货 {{ formatTs(wb.departTs) }} · 到货 {{ formatTs(wb.arriveTs) }}</p>
                  <!-- 途经的敏感点位（航哥 20261123 要求列表里就看得见）。
                       ⚠️ 20261124 起**最多列前 3 个**：一单可能途经十几个敏感区域，全列出来会把
                       行撑到十几行高，一屏只剩两三单。截断后必须显式给「+N」，否则与行首
                       「停靠 N 处」徽标自相矛盾——客户会以为数据不一致。完整清单在运单详情里。 -->
                  <div class="mt-1.5 flex flex-wrap gap-1">
                    <span
                      v-for="a in waybillHitChipsOf(wb).shown"
                      :key="a.id"
                      class="inline-flex max-w-full items-center gap-1 rounded border border-[#e9e9e5] bg-white px-1.5 py-px text-[10px] text-slate-600"
                      :title="areaDisplayName(a)"
                    >
                      <span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{ background: areaColor(a) }"></span>
                      <!-- 无名点位 chip 显示地址（航哥 20261123：轨迹页面也这么显示） -->
                      <span class="truncate">{{ areaDisplayName(a) }}</span>
                    </span>
                    <!-- 溢出计数：被折叠的点位名全挂在 title 上，悬停即可看到，信息不丢 -->
                    <span
                      v-if="waybillHitChipsOf(wb).rest > 0"
                      class="inline-flex shrink-0 items-center rounded border border-dashed border-[#deded9] bg-[#fbfbfa] px-1.5 py-px text-[10px] text-slate-500"
                      :title="`另有 ${waybillHitChipsOf(wb).rest} 处：${waybillHitChipsOf(wb).restNames.join('、')}`"
                    >+{{ waybillHitChipsOf(wb).rest }}</span>
                    <span v-if="wb.hits.length === 0" class="text-[10px] text-slate-300">未途经敏感区域</span>
                  </div>
                </div>
                <p v-if="visibleWaybills.length === 0" class="px-3 py-10 text-center text-[11px] leading-5 text-slate-400">
                  没有匹配的<strong>异常</strong>运单<br />本列表只收录在敏感区域产生过停靠的运单<br />试试点位名、经纬度、车牌号或运单号
                </p>
              </template>
              <!-- 截断提示已随 WAYBILL_LIST_LIMIT 一起删除（航哥 20261123：「这个限制取消」）。
                   现在列表就是全量异常单，只按每页 20 条分页，不存在"被截断"这回事 -->
              <p v-if="matchedWaybills.length > 0" class="px-3 pb-1 pt-2 text-center text-[10px] text-slate-400">
                仅展示有敏感区域停靠的运单 · 共 {{ matchedWaybills.length }} 单，按发运时间最新在前
              </p>
            </template>

            <!-- 已选运单：真实轨迹 + 停靠明细 + 命中点位 -->
            <div v-else class="px-3 py-3">
              <button
                type="button"
                class="mb-2 inline-flex items-center gap-1 text-[11px] text-slate-500 transition hover:text-slate-900"
                @click="selectWaybill(selectedWaybill.waybillNo)"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7.5 2L3.5 6l4 4" /></svg>
                返回运单列表
              </button>

              <!-- 车辆与运单标识 -->
              <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-2.5">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="font-mono text-base font-semibold text-slate-900">{{ selectedWaybill.vehicleNo }}</p>
                  <p class="shrink-0 font-mono text-[10px] text-slate-400">{{ selectedWaybill.waybillNo }}</p>
                </div>
                <!-- **司机人名与承运企业已删**（航哥 20261123：「车牌号下面还有人名和运输公司，
                     把这个人名和运输公司都给我拿掉」）。与运单列表口径保持一致——列表已删人名，
                     详情卡不能还留着。改放车牌颜色（列表已有，此处补齐使两处字段完全一致） -->
                <p class="mt-0.5 text-[11px] text-slate-500">车牌颜色 · {{ selectedWaybill.plateColor }}</p>
              </div>

              <!-- 运输概要 -->
              <div class="mt-2 grid grid-cols-2 gap-2">
                <div class="rounded-lg border border-[#e3e3df] bg-white p-2">
                  <p class="text-[10px] text-slate-500">发货点</p>
                  <p class="mt-0.5 truncate text-[11px] font-medium text-slate-800" :title="selectedWaybill.originName">{{ selectedWaybill.originName }}</p>
                </div>
                <div class="rounded-lg border border-[#e3e3df] bg-white p-2">
                  <p class="text-[10px] text-slate-500">收货点</p>
                  <p class="mt-0.5 truncate text-[11px] font-medium text-slate-800" :title="selectedWaybill.destName">{{ selectedWaybill.destName }}</p>
                </div>
                <div class="rounded-lg border border-[#e3e3df] bg-white p-2">
                  <p class="text-[10px] text-slate-500">发运 / 到达</p>
                  <p class="mt-0.5 text-[11px] font-medium text-slate-800">{{ formatTs(selectedWaybill.departTs) }}</p>
                  <p class="text-[10px] text-slate-400">{{ formatTs(selectedWaybill.arriveTs) }}</p>
                </div>
                <div class="rounded-lg border border-[#e3e3df] bg-white p-2">
                  <!-- **「装载 / X 吨」已删**（航哥 20261123：「把装载给我去掉，包括它多少吨，这些都给我去掉」）。
                       loadWeightT 字段在数据层保留，任何 UI 不得展示 -->
                  <p class="text-[10px] text-slate-500">里程</p>
                  <p class="mt-0.5 text-[11px] font-medium text-slate-800">{{ selectedWaybill.distanceKm.toLocaleString() }} km</p>
                </div>
              </div>
              <!-- **「所属线路 A → B」已删**（航哥 20261123：「还有什么所属线路之类的，这些什么线路之类的全都给我拿掉」）。
                   路线视角下线后所有线路相关表述统一清理；起讫城市信息已由上方发货点/收货点全称承载，不重复 -->
              <p class="mt-1 text-[10px] text-slate-400">
                在途 {{ formatDuration(selectedWaybill.arriveTs - selectedWaybill.departTs) }}
              </p>

              <!-- 命中敏感点位个数：航哥 20261123「这个车到底有一个敏感点位，还是两个」要一眼看到 -->
              <div class="mt-2 rounded-lg border px-2.5 py-2"
                :class="waybillHitRows.length > 0 ? 'border-[#f0dada] bg-[#fdf8f8]' : 'border-[#e3e3df] bg-[#f7f7f5]'"
              >
                <div class="flex items-baseline justify-between gap-2">
                  <p class="text-[11px] text-slate-500">本单命中敏感点位</p>
                  <p class="text-lg font-semibold leading-6" :class="waybillHitRows.length > 0 ? 'text-red-700' : 'text-slate-400'">
                    {{ waybillHitRows.length }} 个
                  </p>
                </div>
                <p v-if="waybillHitRows.length > 0" class="mt-0.5 text-[10px] text-slate-500">
                  累计停靠 {{ waybillTotalStayMin }} 分钟（{{ waybillHitNames }}）
                </p>
                <p v-else class="mt-0.5 text-[10px] text-slate-400">全程未在任何敏感区域产生异常停靠</p>
              </div>

              <!--
                敏感区域停靠明细。序号与地图上的 divIcon 序号标记**一一对应**，底色同取该点位风险色。
                标题从「异常停靠明细」改叫「敏感区域停靠」——航哥 20261123：「只有在敏感区域我们才会在这里
                呈现停靠，所以这个就叫敏感区域停靠一、敏感区域停靠二」。这个限定词不能省，否则客户会以为
                列表里是该单**所有**中途停车（含服务区/加油/堵车），而实际只收录落在敏感区域里的那些。
              -->
              <div class="mt-3">
                <p class="text-xs font-semibold text-slate-900">
                  敏感区域停靠
                  <span class="ml-1 text-[10px] font-normal text-slate-400">{{ waybillHitRows.length }} 处 · 按停靠时刻先后</span>
                </p>
                <ul v-if="waybillHitRows.length > 0" class="mt-1.5 space-y-1">
                  <li
                    v-for="row in waybillHitRows"
                    :key="row.hit.areaId"
                    class="cursor-pointer rounded-md border border-[#ececec] bg-white px-2 py-1.5 transition hover:border-slate-300 hover:bg-[#f7f7f5]"
                    @click="row.area && focusWaybillStop(row.area)"
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        :style="{ background: row.area ? areaColor(row.area) : '#94a3b8' }"
                      >{{ row.seq }}</span>
                      <!-- 标题只写停靠点名称（航哥 20261123：「直接就是写停靠的POI名称或者地址名称」）：
                           序号已由左侧彩色圆标承载，再写「敏感区域停靠 3 ·」是同一信息说两遍。
                           右侧「{{ stayMin }} 分」已按要求删除——停靠时长在浮窗里给，列表只保留时间区间 -->
                      <p class="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-800" :title="row.hit.areaName">
                        {{ row.hit.areaName }}
                      </p>
                    </div>
                    <p class="mt-0.5 pl-6 text-[10px] text-slate-400">
                      {{ formatTs(row.hit.arriveTs) }} → {{ formatTs(hitDepartTs(row.hit)) }}
                      <span v-if="row.area" class="ml-1" :style="{ color: row.area.riskLevel ? RISK_COLOR[row.area.riskLevel] : '#7c3aed' }">
                        {{ row.area.riskLevel ? RISK_LABEL[row.area.riskLevel] : '人工发现' }}
                      </span>
                    </p>
                  </li>
                </ul>
                <p v-else class="mt-2 rounded-md bg-[#f7f7f5] px-2 py-3 text-center text-[11px] text-slate-400">
                  该运单未在任何敏感区域产生停靠
                </p>
              </div>

              <!-- 「该车其他运单」整块已删除（航哥 20261123：「该车其他运单这块也不需要显示，整体给我去掉」）。
                   看同一辆车的其他运单改走：浮窗「查看对应车辆」→ 按车辆归并列表 → 点某辆车下钻。
                   waybillsOfVehicle() 仍被归并逻辑间接依赖，函数保留。 -->
            </div>
          </template>

          <template v-if="!isSensitiveByLine && !isSensitiveByWaybill">
          <div
            v-for="area in pagedAreas"
            :key="area.id"
            class="relative cursor-pointer rounded-lg border px-3 py-2.5 transition"
            :class="[
              assetMapState.selectedAreaId === area.id
                ? 'border-slate-300 bg-[#f7f7f5]'
                : 'border-transparent hover:bg-[#f7f7f5]',
            ]"
            @click="selectArea(area)"
            @mouseenter="hoverArea(area.id)"
            @mouseleave="unhoverArea()"
          >
            <div class="flex items-start justify-between gap-2">
              <!-- 无名点位在**名称位置**显示地址（航哥 20261123）。
                   ⚠️ 下方原有的地址行**照常保留**——航哥明确纠正过：「之前展示的地址的地方还是继续展示地址就行，
                   不用把原先的干掉」。所以无名点位会出现名称行与地址行内容相同，这是**刻意为之**，不是重复 bug。 -->
              <!-- ⚠️ 字色必须**整体走 :class 三元**，不能静态写 text-slate-900 再动态叠 text-slate-600：
                   两个类同优先级，谁生效取决于生成 CSS 里的先后而非 class 属性顺序，
                   实测 Tailwind v4 下 slate-900 恒胜，弱化样式完全不生效（静默失效，看代码看不出来）。 -->
              <p class="min-w-0 flex-1 truncate text-[13px] font-medium" :title="areaDisplayName(area)"
                 :class="isUnnamedArea(area) ? 'text-slate-600' : 'text-slate-900'">{{ areaDisplayName(area) }}</p>
              <div class="flex shrink-0 items-center gap-1">
                <!-- 徽标同时给出来源与风险等级（航哥 20261123：列表里也要把风险等级加上）。
                     人工发现不定级 → 只显示「人工发现」；AI识别 → 显示「AI·高/中/低风险」。
                     用 inline style 取风险色，不用 Tailwind 动态类名（拼接类名 JIT 扫不到，会掉样式） -->
                <span
                  class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  :style="area.source === 'ai' && area.riskLevel
                    ? { background: RISK_COLOR[area.riskLevel] + '1a', color: RISK_COLOR[area.riskLevel] }
                    : { background: '#f5f3ff', color: '#6d28d9' }"
                >{{ area.source === 'ai' && area.riskLevel ? `AI·${RISK_LABEL[area.riskLevel]}` : '人工发现' }}</span>
                <!-- **编辑外露**（航哥 20261123：「这里面的编辑，我们可以直接暴露出来」）：
                     原来藏在三点菜单里，多一次点击且不易发现。
                     ⚠️ **仅「人工发现」点位有编辑入口**（航哥 20261124 待确认11：
                     「把ai识别的可编辑功能给去掉，只给人工发现的留着编辑入口」）。
                     理由：AI 点位一个月跑批更新一次，客户这月改的半径/阈值下月会被覆盖回去，
                     给了编辑入口等于给客户一个"改了会丢"的假承诺。人工点位是客户自己录的，才该由客户维护。 -->
                <button
                  v-if="area.source === 'manual'"
                  type="button"
                  class="shrink-0 rounded border border-[#e3e3df] bg-white px-1.5 py-px text-[10px] font-medium text-slate-600 transition hover:border-slate-400 hover:bg-[#f7f7f5] hover:text-slate-900"
                  :aria-label="`编辑：${areaDisplayName(area)}`"
                  @click.stop="startEditArea(area)"
                >编辑</button>
                <!-- 更多操作：现只剩「彻底删除」（危险操作仍藏一层，防误触）。
                     ⚠️ **整个按钮对 AI 点位隐藏**（航哥 20261124：「ai识别的也不可删除」）：
                     菜单里唯一的项就是删除，AI 点位既不可编辑也不可删，留着就是个点开只有空菜单的按钮。
                     理由与不可编辑同源——AI 点位由中台按月跑批维护，这个月删了下个月又被导回来，
                     删除对客户是无效操作，还会让人以为"我明明删过了怎么又出现"。 -->
                <button
                  v-if="area.source === 'manual'"
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded text-slate-400 transition hover:bg-[#ececea] hover:text-slate-700"
                  :aria-label="`更多操作：${areaDisplayName(area)}`"
                  @click.stop="toggleAreaMenu(area.id)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="1.9" />
                    <circle cx="12" cy="12" r="1.9" />
                    <circle cx="19" cy="12" r="1.9" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- 下拉菜单 -->
            <div
              v-if="areaMenuId === area.id"
              class="absolute right-2 top-8 z-[560] w-[136px] overflow-hidden rounded-md border border-[#e3e3df] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.14)]"
              @click.stop
              @mouseenter.stop
            >
              <!--
                「详情（关联线路）」与「定位查看」两个入口已删（航哥 20261123）：
                · 定位查看 —— 「我们直接点击这个框就可以了，不需要再从三个点里面进入」
                · 详情 —— 「详情里面更多的信息其实就是经纬度和时间，这两个都可以在浮窗里显示出来」
                  → 经纬度与识别/录入时间已搬进浮窗，详情面板失去存在理由，入口整体撤掉
                「编辑」已外露成行内按钮。菜单现只剩「彻底删除」——危险操作保留一层确认距离。
                openAreaDetailFromMenu() / locateArea() 函数保留在代码里，恢复只需把按钮加回来。
              -->
              <button
                type="button"
                class="flex w-full items-center px-3 py-1.5 text-left text-[11px] font-medium text-red-600 transition hover:bg-red-50"
                @click="handleDeleteArea(area)"
              >
                彻底删除
              </button>
            </div>

            <!-- 区域与半径不在列表行展示：region 与 address 内容 100% 重复（"广州·临港工业区" vs "广州临港工业区临港路43号"），
                 半径属点位属性，浮窗/详情面板/编辑面板都有 -->
            <p class="mt-0.5 truncate text-[11px] text-slate-400">{{ area.address }}</p>

            <!-- 「途经 N 条线路」+「暂无市到市线路停靠」+ 停靠最多的线路名 **整行已删**
                 （航哥 20261123：「敏感区域列表下边还有什么途经几条线路之类的，都去掉」）。
                 ⚠️ 这条上一轮就要求过、文档也写了"已删"，但模板漏改，本轮补上——
                 **文档写了不等于代码改了，删字段类需求必须 grep 模板逐处核对**。
                 areaLineCount() / areaTopLine() / areaLineBrief() 函数保留（路线能力恢复时复用） -->

            <div v-if="area.evidence" class="mt-1 truncate text-[10px] text-slate-400">
              备注：{{ area.evidence }}
            </div>

            <!-- 异常停靠：人工发现 / AI识别 一律显示，是列表的核心排序依据 -->
            <div class="mt-1.5 flex items-center">
              <span class="ml-auto shrink-0 text-[10px] text-slate-500">
                异常停靠 <b class="font-semibold text-red-700">{{ area.discovery.waybillCount }}</b> 单
              </span>
            </div>
          </div>

          <!-- 筛选后无结果 -->
          <div v-if="pagedAreas.length === 0" class="px-3 py-10 text-center">
            <p class="text-xs text-slate-400">当前筛选条件下没有点位</p>
            <button
              type="button"
              class="mt-2 rounded-md border border-[#e3e3df] bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:bg-[#f2f2ef]"
              @click="sourceFilter = 'all'"
            >
              重置筛选
            </button>
          </div>
          </template>
        </template>
      </div>

      <!-- 分页：**详情态整体隐藏**（航哥 20261123：「已经切换到某个运单的查看页面，下面共多少条、多少页分页应该去掉」）。
           currentListTotal 在运单详情态返回 0，线路详情态也不该显示分页 -->
      <div v-if="currentListTotal > 0 && !detailAreaId && !selectedWaybill && !selectedSensitiveLine" class="flex items-center justify-between border-t border-[#eeeeec] px-4 py-2">
        <p class="text-[11px] text-slate-400">共 {{ currentListTotal }} 条</p>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-md border border-[#e3e3df] text-slate-500 transition enabled:hover:bg-[#f2f2ef] enabled:hover:text-slate-900 disabled:opacity-35"
            :disabled="listPage <= 1"
            @click="prevListPage"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M6.5 1.5L3 5l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <span class="text-[11px] text-slate-500">第 {{ listPage }} / {{ listPageCount }} 页</span>
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded-md border border-[#e3e3df] text-slate-500 transition enabled:hover:bg-[#f2f2ef] enabled:hover:text-slate-900 disabled:opacity-35"
            :disabled="listPage >= listPageCount"
            @click="nextListPage"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 1.5L7 5L3.5 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      </template>
    </div>

    <!--
      通用表单弹窗（Teleport 到 body）：**录入与编辑共用同一个组件**（航哥 20261124）。
      两个实例只是 mode 不同，主体都是同一张 SensitiveAreaConfirmCard（自带小地图点选）。
      ⚠️ 编辑实例用 `:model-value="!!editingArea"` 而不是再存一个 visible ref：
      真相来源只有 editingAreaId 一个，否则两处状态可能一个说开一个说关。
    -->
    <SensitiveAreaFormDialog v-model="intakeDialogVisible" mode="create" />
    <SensitiveAreaFormDialog
      :model-value="!!editingArea"
      mode="edit"
      :area="editingArea"
      @update:model-value="(v: boolean) => { if (!v) cancelEdit(); }"
    />

    <!-- 抽屉详情（覆盖右侧列表） -->
    <transition name="agg-drawer">
      <div
        v-if="drawerOpen && selectedLine"
        class="absolute inset-y-0 right-0 z-[600] flex w-[340px] flex-col border-l border-[#e3e3df] bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.08)]"
      >
        <div class="flex items-start justify-between gap-3 border-b border-[#eeeeec] px-4 py-3.5">
          <div>
            <p class="text-[15px] font-semibold text-slate-900">{{ selectedLine.from }} → {{ selectedLine.to }}</p>
            <p class="mt-0.5 text-xs text-slate-500">
              {{ DIMENSION_TABS.find((t) => t.id === dimension)?.label }} 聚合 · 全量累计
            </p>
          </div>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#f2f2ef] hover:text-slate-700"
            @click="closeDrawer"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          <!-- KPI：运单总数 / 承运车辆数 / 当月环比上月（三卡） -->
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-3">
              <p class="text-[11px] text-slate-500">运单总数</p>
              <p class="mt-1 text-lg font-semibold text-slate-900">{{ selectedLine.waybillCount.toLocaleString() }}</p>
            </div>
            <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-3">
              <p class="text-[11px] text-slate-500">承运车辆数</p>
              <p class="mt-1 text-lg font-semibold text-slate-900">{{ selectedLine.carrierVehicleCount.toLocaleString() }}</p>
            </div>
            <div class="rounded-lg border border-[#e3e3df] bg-[#f7f7f5] p-3">
              <p class="text-[11px] text-slate-500">当月环比上月</p>
              <p class="mt-1 text-lg font-semibold" :class="drawerStats?.momUp ? 'text-red-600' : 'text-emerald-600'">{{ drawerStats?.momLabel }}</p>
            </div>
          </div>

          <!-- 途经敏感区域停靠 -->
          <div v-if="selectedLineSensitive" class="mt-4 rounded-lg border border-[#f0dada] bg-[#fdf8f8] p-3">
            <p class="text-xs font-semibold text-slate-900">途经敏感区域停靠</p>

            <div class="mt-2 grid grid-cols-3 gap-2">
              <div class="rounded-md border border-[#f0e2e2] bg-white px-2 py-1.5">
                <p class="text-[10px] text-slate-500">异常停靠运单</p>
                <p class="mt-0.5 text-base font-semibold text-red-700">{{ selectedLineSensitive.waybills.toLocaleString() }}</p>
              </div>
              <div class="rounded-md border border-[#f0e2e2] bg-white px-2 py-1.5">
                <p class="text-[10px] text-slate-500">涉及敏感区域</p>
                <p class="mt-0.5 text-base font-semibold text-slate-900">{{ selectedLineSensitive.areaCount }}</p>
              </div>
              <div class="rounded-md border border-[#f0e2e2] bg-white px-2 py-1.5">
                <p class="text-[10px] text-slate-500">涉及车辆</p>
                <p class="mt-0.5 text-base font-semibold text-slate-900">{{ selectedLineSensitive.vehicles.toLocaleString() }}</p>
              </div>
            </div>

            <p class="mt-2.5 text-[11px] leading-5 text-slate-600">
              命中敏感区域 <b class="text-red-700">TOP3</b>（按停靠次数排序，点击定位并查看详情）：
            </p>

            <ul class="mt-1.5 space-y-1">
              <li
                v-for="(item, idx) in selectedLineSensitive.stats.slice(0, 3)"
                :key="item.area.id"
                class="flex cursor-pointer items-center gap-2 rounded-md border border-[#f0e2e2] bg-white px-2 py-1.5 transition hover:border-[#e6c9c9] hover:bg-[#fdf5f5]"
                :class="idx < 3 ? 'border-l-2 border-l-red-600' : ''"
                @click="focusHitArea(item)"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[11px] font-medium text-slate-800" :title="areaDisplayName(item.area)">{{ areaDisplayName(item.area) }}</p>
                  <p class="truncate text-[10px] text-slate-400" :title="`${item.area.region} · ${item.area.address}`">
                    {{ item.area.region }} · {{ AREA_SOURCE_LABEL[item.area.source] }}
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <p class="text-[11px] font-semibold text-red-700">停靠 {{ item.stops }} 次</p>
                  <p class="text-[10px] text-slate-400">本线 {{ item.waybills }} 单</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style lang="scss" scoped>
.agg-drawer-enter-active,
.agg-drawer-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.agg-drawer-enter-from,
.agg-drawer-leave-to {
  transform: translateX(24px);
  opacity: 0;
}
</style>
