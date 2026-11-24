<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { AREA_SOURCE_LABEL, RISK_COLOR, RISK_LABEL, formatRadius } from './mockData';
// searchPlaces / searchWaybills 已不再使用（敏感区域检索框只检索点位），但函数保留在 mapSearch 供运单视角与将来恢复
import { looksLikeWaybillNo, searchAreas, searchLines } from './mapSearch';
import type { PlaceHit, SearchHit, VehicleHit, WaybillHit } from './mapSearch';
import { assetMapState, requestMapFlyTo, setRouteMode, setSection, setSensitiveView } from './assetMapStore';
import { sensitiveAreaState } from './sensitiveAreaStore';
import { formatTs, getWaybillDataset } from './waybillMock';

/**
 * 地图检索框：路线页只检索线路，敏感区域页只检索点位与地点（范围随分区收窄）
 * 检索逻辑在 mapSearch.ts（纯函数、可断言）；本组件只负责渲染与交互，
 * 选中结果直接写 assetMapState，地图与右栏列表自动联动。
 */

const query = ref('');
const open = ref(false);
const activeIndex = ref(-1);
const rootRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

/**
 * 检索范围随分区收窄（航哥要求两者分开）：
 * 路线页只出线路，不出地点/点位；敏感区域页只出点位与地点定位，不出线路
 */
const isPoiScope = computed(() => assetMapState.section === 'poi');

// 线路检索限定在当前维度（省到省 / 市到市 / 县到县），不跨维度串结果
const lineResult = computed(() => (
  isPoiScope.value ? { hits: [], total: 0 } : searchLines(query.value, assetMapState.mode)
));
const lineHits = computed(() => lineResult.value.hits);
const lineTotal = computed(() => lineResult.value.total);
const areaHits = computed(() => (isPoiScope.value ? searchAreas(query.value, sensitiveAreaState.areas) : []));
/**
 * 地点检索已下线（航哥 20261123：「敏感区域的检索框里面不要有其他内容，就只是检索点位就行」）。
 * 按地名找点位的能力没有丢：`searchAreas` 本来就同时匹配 name / address / region，
 * 输入「广州」照样能搜出广州的点位，只是结果统一呈现为**点位**，不再混一组"地点定位"。
 */
const placeHits = computed<PlaceHit[]>(() => []);

/**
 * 单车 / 运单检索（航哥 20261123）：只在敏感区域分区生效。
 * getWaybillDataset 内部有全局缓存，computed 重复求值不会重算 587 单。
 */
const waybillDs = computed(() => getWaybillDataset(sensitiveAreaState.areas));
/**
 * 车辆 / 运单检索已从敏感区域检索框移除（航哥 20261123：「把后面的车牌号、运单号等内容删掉，
 * 因为这些内容在运单列表里面已经有了」）。运单视角自带检索框，支持车牌号 / 运单号 / 点位名，
 * 两处都能搜同一批东西只会让客户困惑"该用哪个框"。
 * 反查路径改为：点位浮窗 →「查看对应车辆 / 查看对应运单」→ 自动切到运单列表并按点位名检索。
 */
const wbResult = computed(() => ({ vehicles: [] as VehicleHit[], waybills: [] as WaybillHit[] }));
const vehicleHits = computed(() => wbResult.value.vehicles);
const waybillHits = computed(() => wbResult.value.waybills);
/** 输入像运单号（YD 开头）时运单组排前面，否则车辆组排前面（单车检索是主诉求） */
const waybillFirst = computed(() => looksLikeWaybillNo(query.value));
/** 示例点位名取自真实数据，避免提示词搜出零结果（原示例是车牌号，已随车辆检索一并下线） */
const areaExample = computed(() => sensitiveAreaState.areas[0]?.name ?? '恒信产业园');

/**
 * 检索示例词随维度切换。示例词必须在当前维度的真实数据里能命中，
 * 否则用户照着提示搜出零结果（已实测：省「湖南到河南」/ 市「杭州到大连」/ 县「惠山区到江宁区」）
 */
const LINE_HINTS: Record<string, { pair: string; single: string }> = {
  province: { pair: '湖南到河南', single: '河南' },
  city: { pair: '杭州到大连', single: '杭州' },
  county: { pair: '惠山区到江宁区', single: '惠山区' },
};
const lineHint = computed(() => LINE_HINTS[assetMapState.mode] ?? LINE_HINTS.city!);
const searchPlaceholder = computed(() => (
  isPoiScope.value
    ? `检索敏感区域点位，如 ${areaExample.value}`
    : `检索本维度路线，如 ${lineHint.value.pair}`
));
const emptyHint = computed(() => (
  isPoiScope.value
    ? `只检索点位。试试点位名（${areaExample.value}）或所在城市（如 广州）`
    : `只检索当前维度。试试起讫对（${lineHint.value.pair}）或${assetMapState.mode === 'province' ? '省名' : assetMapState.mode === 'county' ? '区县名' : '城市名'}（${lineHint.value.single}）`
));

const hasResults = computed(() => (
  lineHits.value.length + areaHits.value.length + placeHits.value.length
  + vehicleHits.value.length + waybillHits.value.length > 0
));

/** 键盘导航用的扁平结果集（顺序与面板渲染顺序严格一致，否则上下键会错位） */
const flatHits = computed<Array<SearchHit | VehicleHit | WaybillHit>>(() => [
  ...lineHits.value,
  ...(waybillFirst.value
    ? [...waybillHits.value, ...vehicleHits.value]
    : [...vehicleHits.value, ...waybillHits.value]),
  ...areaHits.value,
  ...placeHits.value,
]);

function onInput() {
  open.value = true;
  activeIndex.value = -1;
}

function clearQuery() {
  query.value = '';
  open.value = false;
  activeIndex.value = -1;
  inputRef.value?.focus();
}

function closePanel() {
  open.value = false;
  activeIndex.value = -1;
}

function hitIndex(hit: SearchHit | VehicleHit | WaybillHit) {
  return flatHits.value.indexOf(hit);
}

function pickHit(hit: SearchHit | VehicleHit | WaybillHit) {
  if (hit.kind === 'vehicle') {
    // 单车检索 → 切到「按单子」视角，用该车牌作为筛选词（列出这辆车的全部运单）
    setSection('poi');
    setSensitiveView('byWaybill');
    assetMapState.sensitiveWaybillNo = '';
    assetMapState.sensitiveWaybillQuery = hit.vehicleNo;
  } else if (hit.kind === 'waybill') {
    // 运单号检索 → 切到「按单子」视角并直接选中该单（地图立刻渲染其轨迹）
    setSection('poi');
    setSensitiveView('byWaybill');
    assetMapState.sensitiveWaybillQuery = '';
    assetMapState.sensitiveWaybillNo = hit.waybill.waybillNo;
  } else if (hit.kind === 'line') {
    // 先切二级分区（会清选中态），再落到维度与线路；抽屉由 selectedLineId 的 watch 自动打开
    setSection(hit.mode === 'top20' ? 'overview' : 'route');
    if (hit.mode === 'province' || hit.mode === 'city' || hit.mode === 'county') setRouteMode(hit.mode);
    else assetMapState.mode = hit.mode;
    assetMapState.selectedLineId = hit.line.id;
  } else if (hit.kind === 'area') {
    setSection('poi');
    assetMapState.selectedAreaId = hit.area.id;
    requestMapFlyTo(hit.area.lat, hit.area.lng, 12);
  } else {
    requestMapFlyTo(hit.lat, hit.lng, 10);
  }
  closePanel();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (query.value) clearQuery();
    else closePanel();
    return;
  }
  if (!open.value) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const total = flatHits.value.length;
    if (total === 0) return;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value = (activeIndex.value + delta + total) % total;
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const target = activeIndex.value >= 0 ? flatHits.value[activeIndex.value] : flatHits.value[0];
    if (target) pickHit(target);
  }
}

function onDocumentMousedown(event: MouseEvent) {
  if (!rootRef.value?.contains(event.target as Node)) closePanel();
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMousedown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown);
});

function formatCount(num: number) {
  return num >= 10000 ? `${(num / 10000).toFixed(1)}万` : num.toLocaleString();
}
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <!-- 输入框 -->
    <div
      class="flex items-center gap-1.5 rounded-md border border-[#e3e3df] bg-[#fbfbfa] px-2.5 py-1.5 transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100"
    >
      <svg class="shrink-0 text-slate-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="min-w-0 flex-1 bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-400"
                :placeholder="searchPlaceholder"
        @input="onInput"
        @focus="open = true"
        @keydown="onKeydown"
      />
      <button
        v-if="query"
        type="button"
        class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-[#f0f0ed] hover:text-slate-700"
        aria-label="清空检索"
        @click="clearQuery"
      >
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </div>

    <!-- 结果面板 -->
    <div
      v-if="open && query.trim()"
      class="absolute left-0 right-0 top-[calc(100%+4px)] z-[540] max-h-[380px] overflow-y-auto rounded-md border border-[#e3e3df] bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.16)]"
    >
      <template v-if="hasResults">
        <!-- 路线 -->
        <template v-if="lineHits.length > 0">
          <p class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            路线 · 匹配 {{ lineTotal }} 条<template v-if="lineTotal > lineHits.length">，显示前 {{ lineHits.length }}</template>
          </p>
          <button
            v-for="hit in lineHits"
            :key="`line-${hit.mode}-${hit.line.id}`"
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition"
            :class="hitIndex(hit) === activeIndex ? 'bg-blue-50' : 'hover:bg-[#f7f7f5]'"
            @click="pickHit(hit)"
            @mouseenter="activeIndex = hitIndex(hit)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[12px] font-medium text-slate-800">{{ hit.line.from }} → {{ hit.line.to }}</span>
              <span class="block truncate text-[10px] text-slate-400">{{ hit.dimLabel }} · {{ formatCount(hit.line.waybillCount) }} 单 · {{ formatCount(hit.line.carrierVehicleCount) }} 辆</span>
            </span>
            <span class="shrink-0 text-[10px] text-slate-400">查看</span>
          </button>
        </template>

        <!-- 车辆（单车检索） -->
        <template v-if="!waybillFirst && vehicleHits.length > 0">
          <p class="mt-1 border-t border-[#f2f2ef] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">车辆</p>
          <button
            v-for="hit in vehicleHits"
            :key="`veh-${hit.vehicleNo}`"
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition"
            :class="hitIndex(hit) === activeIndex ? 'bg-blue-50' : 'hover:bg-[#f7f7f5]'"
            @click="pickHit(hit)"
            @mouseenter="activeIndex = hitIndex(hit)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-mono text-[12px] font-medium text-slate-800">{{ hit.vehicleNo }}</span>
              <span class="block truncate text-[10px] text-slate-400">{{ hit.driverName }} · {{ hit.carrier }}</span>
            </span>
            <span class="shrink-0 text-right">
              <span class="block text-[10px] text-slate-500">{{ hit.total }} 单</span>
              <span class="block text-[10px]" :class="hit.abnormal > 0 ? 'text-red-600' : 'text-slate-400'">异常 {{ hit.abnormal }}</span>
            </span>
          </button>
        </template>

        <!-- 运单 -->
        <template v-if="waybillHits.length > 0">
          <p class="mt-1 border-t border-[#f2f2ef] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">运单</p>
          <button
            v-for="hit in waybillHits"
            :key="`wb-${hit.waybill.waybillNo}`"
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition"
            :class="hitIndex(hit) === activeIndex ? 'bg-blue-50' : 'hover:bg-[#f7f7f5]'"
            @click="pickHit(hit)"
            @mouseenter="activeIndex = hitIndex(hit)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-mono text-[12px] font-medium text-slate-800">{{ hit.waybill.waybillNo }}</span>
              <span class="block truncate text-[10px] text-slate-400">
                {{ hit.waybill.vehicleNo }} · {{ hit.waybill.from }} → {{ hit.waybill.to }} · {{ formatTs(hit.waybill.departTs) }}
              </span>
            </span>
            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold"
              :class="hit.waybill.abnormal ? 'bg-red-50 text-red-700' : 'bg-[#f2f2ef] text-slate-500'"
            >{{ hit.waybill.abnormal ? `异常 ${hit.waybill.hits.length}` : '正常' }}</span>
          </button>
        </template>

        <!-- 车辆（输入像运单号时排在运单之后） -->
        <template v-if="waybillFirst && vehicleHits.length > 0">
          <p class="mt-1 border-t border-[#f2f2ef] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">车辆</p>
          <button
            v-for="hit in vehicleHits"
            :key="`veh2-${hit.vehicleNo}`"
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition"
            :class="hitIndex(hit) === activeIndex ? 'bg-blue-50' : 'hover:bg-[#f7f7f5]'"
            @click="pickHit(hit)"
            @mouseenter="activeIndex = hitIndex(hit)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-mono text-[12px] font-medium text-slate-800">{{ hit.vehicleNo }}</span>
              <span class="block truncate text-[10px] text-slate-400">{{ hit.driverName }} · {{ hit.carrier }}</span>
            </span>
            <span class="shrink-0 text-[10px] text-slate-500">{{ hit.total }} 单 · 异常 {{ hit.abnormal }}</span>
          </button>
        </template>

        <!-- 敏感区域 -->
        <template v-if="areaHits.length > 0">
          <p class="mt-1 border-t border-[#f2f2ef] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">敏感区域点位</p>
          <button
            v-for="hit in areaHits"
            :key="`area-${hit.area.id}`"
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition"
            :class="hitIndex(hit) === activeIndex ? 'bg-blue-50' : 'hover:bg-[#f7f7f5]'"
            @click="pickHit(hit)"
            @mouseenter="activeIndex = hitIndex(hit)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[12px] font-medium text-slate-800">{{ hit.area.name }}</span>
              <span class="block truncate text-[10px] text-slate-400">
                半径 {{ formatRadius(hit.area.radiusM) }} · {{ hit.area.region }}
              </span>
            </span>
            <!-- 徽标与右栏列表口径统一：人工发现 = violet「人工发现」，AI = 风险色「AI·高/中/低风险」。
                 原 teal/amber 已随配色终稿作废。用 inline style 取风险色（动态 Tailwind 类名 JIT 扫不到） -->
            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold"
              :style="hit.area.source === 'ai' && hit.area.riskLevel
                ? { background: RISK_COLOR[hit.area.riskLevel] + '1a', color: RISK_COLOR[hit.area.riskLevel] }
                : { background: '#f5f3ff', color: '#6d28d9' }"
            >{{ hit.area.source === 'ai' && hit.area.riskLevel ? `AI·${RISK_LABEL[hit.area.riskLevel]}` : '人工发现' }}</span>
          </button>
        </template>

        <!-- 地点定位 -->
        <template v-if="placeHits.length > 0">
          <p class="mt-1 border-t border-[#f2f2ef] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">地点定位</p>
          <button
            v-for="hit in placeHits"
            :key="`place-${hit.name}`"
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition"
            :class="hitIndex(hit) === activeIndex ? 'bg-blue-50' : 'hover:bg-[#f7f7f5]'"
            @click="pickHit(hit)"
            @mouseenter="activeIndex = hitIndex(hit)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[12px] font-medium text-slate-800">{{ hit.name }}</span>
              <span class="block truncate text-[10px] text-slate-400">{{ hit.lng.toFixed(4) }}, {{ hit.lat.toFixed(4) }} · 出现在 {{ hit.dimLabel }}</span>
            </span>
            <span class="shrink-0 text-[10px] text-slate-400">定位</span>
          </button>
        </template>
      </template>

      <div v-else class="px-3 py-4 text-center">
        <p class="text-[11px] text-slate-500">没找到「{{ query.trim() }}」相关的{{ isPoiScope ? '点位、车辆或运单' : '路线' }}</p>
        <p class="mt-1 text-[10px] text-slate-400">
          {{ emptyHint }}
        </p>
      </div>
    </div>
  </div>
</template>
