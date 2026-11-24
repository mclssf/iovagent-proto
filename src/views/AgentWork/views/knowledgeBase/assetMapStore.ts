// 共享地图状态：知识库单一地图，多板块联动（响应式单例，非 pinia）
import { reactive } from 'vue';

import type { AggDimension } from './mockData';

export type MapMode = 'top20' | AggDimension | 'sensitive';

/** 知识库二级导航分区 */
export type KbSection = 'overview' | 'route' | 'poi';

/**
 * 隐藏的分区（航哥 20261123：「把那个路线给我隐藏掉」）。
 * **只隐藏导航入口，不删任何能力**：`KbSection='route'`、`setSection('route')`、
 * `SECTION_MODE_TABS.route`、省/市/县维度切换、线路抽屉全部原样保留，
 * 线路相关的呈现改由「敏感区域」分区内的「路线」视角承载。
 * 要恢复：把 'route' 从这个数组里去掉即可，一行。
 */
const HIDDEN_SECTIONS: KbSection[] = ['route'];

// ⚠️ 字面量必须**单独声明并标注类型**再 filter：直接 `[...].filter()` 时注解落在 filter 的返回值上，
// 数组字面量本身会被推断成 { id: string }[]，赋给 { id: KbSection }[] 直接报 TS2322。
const KB_SECTION_TAB_DEFS: Array<{ id: KbSection; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'route', label: '路线' },
  // 标签叫「敏感区域」；内部 id 仍为 'poi'（改动会牵连路由/状态机/检索分区判断，无收益）
  { id: 'poi', label: '敏感区域' },
];
export const KB_SECTION_TABS: Array<{ id: KbSection; label: string }> =
  KB_SECTION_TAB_DEFS.filter((tab) => !HIDDEN_SECTIONS.includes(tab.id));

/**
 * 敏感区域分区的三种视图
 * 界面标签依次为「敏感区域 / 路线 / 运单」（航哥 20261123 定名）
 * - all：敏感区域（全量点位铺开 + 检索 + 录入 + 编辑）
 * - byLine：路线（航哥 20261120：选「某工厂→某工厂」，画真实轨迹 + 只标该线路命中的红点）
 * - byWaybill：运单（航哥 20261123：选一条运单，画该单轨迹 + 只标该单命中的点位，支持点位名/车牌/运单号检索）
 */
export type SensitiveView = 'all' | 'byLine' | 'byWaybill';

// 标签定稿（航哥 20261123）：敏感区域 / 路线 / 运单。内部 id 仍是 all/byLine/byWaybill——
// 改 id 会牵连状态机、setSensitiveView、检索跳转与图层 key，纯字面量收益为零（同 'poi' 的先例）。
/**
 * 已隐藏的视角（航哥 20261123：「把敏感区域和运单中间的那条路线整个给我删掉……这个我先不要」）。
 * 「先不要」= 临时下线，所以走隐藏而非删代码：`SensitiveView='byLine'`、`drawSensitiveRouteOverview`、
 * `drawSensitiveByLine`、线路列表/六卡面板、`selectedLineStat` 全部保留，恢复只需删掉数组里的 'byLine'。
 * ⚠️ 连带影响：点位详情的「途经线路明细」原本点击会跳到 byLine 定位，该视角下线后无处可跳，
 *    已同步改回不可点击（不是忘了改）。
 */
const HIDDEN_SENSITIVE_VIEWS: SensitiveView[] = ['byLine'];

const SENSITIVE_VIEW_TAB_DEFS: Array<{ id: SensitiveView; label: string }> = [
  { id: 'all', label: '敏感区域' },
  { id: 'byLine', label: '路线' },
  // 标签为「异常运单」而非「运单」（航哥 20261123）：本视角列表**只收录有敏感区域停靠的运单**，
  // 叫「运单」会让客户以为是全量运单入口，点进来发现只有几百条反而像数据缺失。
  // ⚠️ 只改 label，**id 仍是 'byWaybill'**——全项目的 SensitiveView 联合类型、setSensitiveView、
  // HIDDEN_SENSITIVE_VIEWS、URL 判定都按 id 走，改 id 会牵连一大片。
  { id: 'byWaybill', label: '异常运单' },
];
export const SENSITIVE_VIEW_TABS: Array<{ id: SensitiveView; label: string }> =
  SENSITIVE_VIEW_TAB_DEFS.filter((tab) => !HIDDEN_SENSITIVE_VIEWS.includes(tab.id));

export const MAP_MODE_TABS: Array<{ id: MapMode; label: string }> = [
  { id: 'top20', label: '总览' },
  { id: 'province', label: '省 - 省' },
  { id: 'city', label: '市 - 市' },
  { id: 'county', label: '县 - 县' },
  { id: 'sensitive', label: '敏感区域' },
];

/** 各分区里地图可用的模式 tab（总览与敏感区域由二级导航直接决定，不再显示 tab） */
export const SECTION_MODE_TABS: Record<KbSection, MapMode[]> = {
  overview: [],
  route: ['province', 'city', 'county'],
  poi: [],
};

export const assetMapState = reactive({
  /** 当前二级导航分区 */
  section: 'overview' as KbSection,
  mode: 'top20' as MapMode,
  /** 路线分区当前维度（切到别的分区再回来时保留） */
  routeMode: 'province' as AggDimension,
  /** 当前选中的聚合线路（抽屉详情） */
  selectedLineId: '',
  /** 列表悬停的线路（地图高亮） */
  hoverLineId: '',
  /** 当前选中的敏感区域 */
  selectedAreaId: '',
  /** 列表悬停的敏感区域 */
  hoverAreaId: '',
  /** 列表请求地图定位（nonce 保证重复点击同一项也触发） */
  flyTo: null as { lat: number; lng: number; zoom: number; nonce: number } | null,
  /**
   * 敏感区域分区的视图：'all' = 敏感区域；'byLine' = 路线；'byWaybill' = 运单
   * 与 mode 分开存：mode 仍是 'sensitive'（分区语义），这里只是该分区内部的展示视角
   */
  sensitiveView: 'all' as SensitiveView,
  /** byLine 视图下选中的市到市线路 id（该线路的真实轨迹 + 命中点位） */
  sensitiveLineId: '',
  /** byWaybill 视图下选中的运单号（该单的真实轨迹 + 命中点位） */
  sensitiveWaybillNo: '',
  /**
   * byWaybill 视图下的检索词：点位名 / 车牌号 / 运单号 三者皆可（航哥 20261123「单车检索」；
   * 司机姓名已下线——运单列表不再展示人名，检索命中了也没法在列表里看出为什么命中）
   * 地图检索框与右栏输入框共用这一个字段，避免两处筛选状态不同步
   */
  sensitiveWaybillQuery: '',
});

function isDimension(mode: MapMode): mode is AggDimension {
  return mode === 'province' || mode === 'city' || mode === 'county';
}

export function setMapMode(mode: MapMode) {
  assetMapState.mode = mode;
  if (isDimension(mode)) assetMapState.routeMode = mode;
}

/**
 * 切换二级导航分区
 * 分区决定地图模式：总览 → Top20，路线 → 上次用的省/市/县维度，敏感区域 → sensitive
 * 同时清掉跨分区无意义的选中态（线路抽屉 / 点位详情）
 */
export function setSection(section: KbSection) {
  if (assetMapState.section === section) return;
  assetMapState.section = section;
  assetMapState.selectedLineId = '';
  assetMapState.hoverLineId = '';
  assetMapState.selectedAreaId = '';
  assetMapState.hoverAreaId = '';
  // 跨分区后「路线 / 运单」视角与选中对象都失去意义
  assetMapState.sensitiveView = 'all';
  assetMapState.sensitiveLineId = '';
  assetMapState.sensitiveWaybillNo = '';
  assetMapState.sensitiveWaybillQuery = '';
  if (section === 'overview') assetMapState.mode = 'top20';
  else if (section === 'route') assetMapState.mode = assetMapState.routeMode;
  else assetMapState.mode = 'sensitive';
}

/** 路线分区内切换省 / 市 / 县维度 */
export function setRouteMode(dimension: AggDimension) {
  assetMapState.routeMode = dimension;
  assetMapState.mode = dimension;
}

/**
 * 切换敏感区域分区的视图。
 * 离开某视角时必须清掉该视角的选中对象，否则地图会继续按旧视角渲染：
 * - 回到「敏感区域」→ 清线路与运单
 * - 切到「路线」→ 清运单与检索词（都只在运单视角有意义）
 * - 切到「运单」→ 清线路
 * 注意：这里只负责「清」，切过去后自动选中第一项由 SharedAssetMap 的 watch 补（store 不反向依赖数据层）
 */
export function setSensitiveView(view: SensitiveView) {
  // 隐藏的视角不可进入：兜底夹回 'all'，防止历史状态或外部调用把界面停在无 tab 可选的视角
  const target = HIDDEN_SENSITIVE_VIEWS.includes(view) ? 'all' : view;
  if (assetMapState.sensitiveView === target) return;
  view = target;
  if (assetMapState.sensitiveView === view) return;
  assetMapState.sensitiveView = view;
  if (view === 'all') {
    assetMapState.sensitiveLineId = '';
    assetMapState.sensitiveWaybillNo = '';
    assetMapState.sensitiveWaybillQuery = '';
  } else if (view === 'byLine') {
    assetMapState.sensitiveWaybillNo = '';
    assetMapState.sensitiveWaybillQuery = '';
  } else {
    assetMapState.sensitiveLineId = '';
  }
}

export function requestMapFlyTo(lat: number, lng: number, zoom: number) {
  assetMapState.flyTo = { lat, lng, zoom, nonce: Date.now() + Math.random() };
}


