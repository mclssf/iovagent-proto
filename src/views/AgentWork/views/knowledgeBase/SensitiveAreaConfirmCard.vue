<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { AREA_NAME_MAX, clampAreaName, formatRadius, mockReverseGeocode } from './mockData';
import type { AreaType } from './mockData';
import { BASE_MAP_OPTIONS, applyBaseMapStyle } from './mapShared';
import type { BaseMapStyle } from './mapShared';
import type { SensitiveAreaDraft } from '../../interface';

const props = defineProps<{
  draft: SensitiveAreaDraft;
  /** 嵌入批量卡时隐藏自身头部，避免标题重复 */
  compact?: boolean;
  /**
   * create = 录入新点位（默认）；edit = 编辑已入库点位。
   * 只影响文案（按钮「确认入库」→「保存修改」、底部提示），字段与地图选点行为完全一致——
   * 航哥 20261124：「从列表中点击编辑，也可以直接给它一个弹窗，也可以用和之前录入时一样的那种方式」。
   * 复用同一张卡而不是另写一个编辑表单，才能保证两条路径的能力不会各自漂移。
   */
  mode?: 'create' | 'edit';
}>();

const isEdit = computed(() => props.mode === 'edit');

const emit = defineEmits<{
  confirm: [
    payload: {
      name: string;
      lat: number;
      lng: number;
      radiusM: number;
      areaType: AreaType;
      stayThresholdMin: number;
      remark: string;
    },
  ];
  cancel: [];
}>();

// 类型选项统一从 mockData 取（轨迹丢失窝点已下线）
const RADIUS_PRESETS = [200, 300, 500, 1000, 1500, 2000];

const name = ref(props.draft.name);
const lat = ref(props.draft.lat);
const lng = ref(props.draft.lng);
const radiusM = ref(props.draft.radiusM);
const areaType = ref<AreaType>(props.draft.areaType);
const remark = ref(props.draft.remark);
const stayThresholdMin = ref(props.draft.stayThresholdMin);

const readOnly = computed(() => props.draft.resolveState !== 'pending');

/**
 * **只按坐标**做逆地理（nameHint 故意传空串）。
 *
 * ⚠️ 不能复用下面那个把 `name` 当 hint 传进去的 `geo`：那样 name 变化会改 address，
 * 而自动取名又要写回 name —— 形成 name → geo → name 的反馈环。
 * 取名与显示地址都以"坐标"为唯一输入，环就断了。
 */
const geoByCoord = computed(() => mockReverseGeocode(lat.value, lng.value, ''));

/**
 * 自动名称：POI 名优先，查不到回退地址。
 * 航哥 20261124：「需要自动获取POI名称，如果获取不到POI名称 就使用地址」。
 */
const autoName = computed(() =>
  clampAreaName(geoByCoord.value.poiName || geoByCoord.value.address),
);

const geo = geoByCoord;
const canConfirm = computed(() => !readOnly.value && !!name.value.trim());

/**
 * 经纬度一变就重新取名并覆盖输入框。
 *
 * 航哥 20261124 原话：「如果客户在录入中填写了名称 优先使用客户填写的，
 * 但只要调整了经纬度就要重新获取并更新」。两句话合起来的准确语义是：
 * - **没动坐标** → 客户填的名称（或文本解析出来的名称）优先，不动它；
 * - **动了坐标** → 名称跟着坐标走，无条件覆盖（客户之前填的也覆盖）。
 *
 * ⚠️ 所以这里**不加 `immediate: true`**：挂载时不触发，才能保住 draft 里已解析出的名称。
 * 加了 immediate 会在打开卡片瞬间就把客户填的名字冲掉，正好违背前半句。
 * ⚠️ watch 的是 lat/lng 两个 ref，地图点选与手输经纬度都会改它们，两条路径自动都覆盖到。
 */
watch([lat, lng], () => {
  if (readOnly.value) return;
  name.value = autoName.value;
});

/** 底图样式：标准图 / 卫星图（与知识库地图同一套切换逻辑） */
const baseStyle = ref<BaseMapStyle>('standard');

function switchBaseStyle(style: BaseMapStyle) {
  if (baseStyle.value === style) return;
  baseStyle.value = style;
  if (map) {
    applyBaseMapStyle(map, style);
    setTimeout(() => map?.invalidateSize(), 60);
  }
}

const mapRef = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let marker: L.CircleMarker | null = null;
let circle: L.Circle | null = null;

function drawMap() {
  if (!map) return;
  if (marker) map.removeLayer(marker);
  if (circle) map.removeLayer(circle);
  marker = L.circleMarker([lat.value, lng.value], {
    radius: 7,
    color: '#ffffff',
    fillColor: '#7c3aed',
    fillOpacity: 1,
    weight: 2,
  }).addTo(map);
  circle = L.circle([lat.value, lng.value], {
    radius: radiusM.value,
    color: '#7c3aed',
    weight: 1.5,
    dashArray: '6 5',
    fillColor: '#7c3aed',
    fillOpacity: 0.08,
  }).addTo(map);
}

function fitMap() {
  if (!map) return;
  const bounds = circle?.getBounds();
  if (bounds && bounds.isValid()) {
    map.fitBounds(bounds.pad(0.35), { animate: false });
  } else {
    map.setView([lat.value, lng.value], 13, { animate: false });
  }
}

function initMap() {
  if (!mapRef.value || map) return;
  map = L.map(mapRef.value, {
    center: [lat.value, lng.value],
    zoom: 13,
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    dragging: true,
  });
  applyBaseMapStyle(map, baseStyle.value);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  if (!readOnly.value) {
    map.on('click', (event: L.LeafletMouseEvent) => {
      lat.value = Number(event.latlng.lat.toFixed(6));
      lng.value = Number(event.latlng.lng.toFixed(6));
      drawMap();
    });
  }

  drawMap();
  fitMap();
}

function destroyMap() {
  marker = null;
  circle = null;
  map?.remove();
  map = null;
}

onMounted(() => {
  nextTick(() => {
    initMap();
    setTimeout(() => map?.invalidateSize(), 80);
  });
});

onBeforeUnmount(() => destroyMap());

watch([lat, lng], () => drawMap());
watch(radiusM, () => {
  drawMap();
  fitMap();
});

function applyRadius(value: number) {
  if (readOnly.value) return;
  radiusM.value = value;
}

function handleConfirm() {
  if (!canConfirm.value) return;
  emit('confirm', {
    name: clampAreaName(name.value),
    lat: lat.value,
    lng: lng.value,
    radiusM: radiusM.value,
    areaType: areaType.value,
    stayThresholdMin: stayThresholdMin.value,
    remark: remark.value.trim(),
  });
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-[#deded9] bg-white">
    <!-- 卡片头 -->
    <div v-if="!compact" class="flex items-center justify-between gap-2 border-b border-[#ededea] bg-[#f7f7f5] px-3 py-2">
      <div class="flex min-w-0 items-center gap-2">
        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-50 text-red-600">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2" />
          </svg>
        </span>
        <p class="truncate text-xs font-semibold text-slate-900">敏感区域确认</p>
      </div>
      <span
        class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
        :class="
          draft.resolveState === 'confirmed'
            ? 'bg-emerald-50 text-emerald-700'
            : draft.resolveState === 'cancelled'
              ? 'bg-slate-100 text-slate-500'
              : 'bg-amber-50 text-amber-700'
        "
      >
        {{ draft.resolveState === 'confirmed' ? '已入库' : draft.resolveState === 'cancelled' ? '未入库' : '待确认' }}
      </span>
    </div>

    <!-- 地图 -->
    <div class="relative h-[200px] w-full border-b border-[#ededea] bg-[#f3f3ef]">
      <div ref="mapRef" class="absolute inset-0"></div>
      <p v-if="!readOnly" class="pointer-events-none absolute left-2 top-2 z-[500] max-w-[62%] rounded bg-white/85 px-2 py-1 text-[10px] leading-4 text-slate-600 shadow-sm backdrop-blur">
        点击地图可微调点位 · 红圈为敏感半径
      </p>
      <!-- 底图切换：标准图 / 卫星图 -->
      <div class="absolute right-2 top-2 z-[500] flex items-center gap-0.5 rounded-md border border-white/70 bg-white/90 p-0.5 shadow-sm backdrop-blur">
        <button
          v-for="option in BASE_MAP_OPTIONS"
          :key="option.id"
          type="button"
          class="rounded px-1.5 py-0.5 text-[10px] font-medium transition"
          :class="baseStyle === option.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'"
          @click="switchBaseStyle(option.id)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- 表单 -->
    <div class="space-y-2.5 px-3 py-3" :class="readOnly ? 'opacity-70' : ''">
      <div>
        <!-- 名称上限 30 字（航哥 20261123）：这张卡现在是录入与编辑**共用**的唯一表单，
             上限必须落在这里，否则编辑路径会绕过限制。名称允许留空（无名点位合法）。 -->
        <label class="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-medium text-slate-500">
          <span>地点名称</span>
          <span class="text-[10px] font-normal text-slate-400">{{ name.length }} / {{ AREA_NAME_MAX }}</span>
        </label>
        <input
          v-model="name"
          type="text"
          :maxlength="AREA_NAME_MAX"
          :disabled="readOnly"
          class="h-8 w-full rounded border border-[#deded9] bg-[#fbfbfa] px-2.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
          placeholder="无名点位可留空，列表与浮窗会自动显示地址"
        />
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <div>
          <label class="mb-1 block text-[11px] font-medium text-slate-500">经度</label>
          <input
            v-model.number="lng"
            type="number"
            step="0.000001"
            :disabled="readOnly"
            class="h-8 w-full rounded border border-[#deded9] bg-[#fbfbfa] px-2.5 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-medium text-slate-500">纬度</label>
          <input
            v-model.number="lat"
            type="number"
            step="0.000001"
            :disabled="readOnly"
            class="h-8 w-full rounded border border-[#deded9] bg-[#fbfbfa] px-2.5 font-mono text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-[11px] font-medium text-slate-500">
          敏感半径（米）
          <span class="ml-1 text-slate-400">当前 {{ formatRadius(radiusM) }}</span>
        </label>
        <div class="flex items-center gap-1.5">
          <input
            v-model.number="radiusM"
            type="number"
            min="50"
            max="20000"
            step="50"
            :disabled="readOnly"
            class="h-8 w-[92px] shrink-0 rounded border border-[#deded9] bg-[#fbfbfa] px-2.5 text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
          />
          <div class="flex flex-wrap gap-1">
            <button
              v-for="preset in RADIUS_PRESETS"
              :key="preset"
              type="button"
              :disabled="readOnly"
              class="rounded border px-1.5 py-0.5 text-[10px] transition disabled:cursor-not-allowed"
              :class="radiusM === preset ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-[#e3e3df] bg-white text-slate-500 hover:text-slate-800'"
              @click="applyRadius(preset)"
            >
              {{ formatRadius(preset) }}
            </button>
          </div>
        </div>
      </div>

      <!-- 「停留阈值」输入已删除（航哥 20261124 待确认8：「把录入和编辑中的停靠时长阈值都去掉，
           统一设置入口咱这里不要」）。阈值改为全局统一，由后端配置，不在录入链路里逐条填。
           ⚠️ 数据字段保留：`stayThresholdMin` 仍从 draft 带入、在 confirm payload 里原样回传，
           值走一轮往返不变——删输入框不等于删字段，否则入库时该字段没人负责。 -->

      <div>
        <label class="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-medium text-slate-500">
          <span>备注</span>
          <!-- 浮窗只呈现前 50 字：不硬拦输入，但要把截断提前告知，避免写完才发现 -->
          <span
            class="text-[10px] font-normal"
            :class="remark.length > 50 ? 'text-amber-600' : 'text-slate-400'"
          >{{ remark.length }} / 50<template v-if="remark.length > 50"> · 浮窗只显示前 50 字</template></span>
        </label>
        <!--
          备注用 **textarea 而不是 input**（航哥 20261124：「它其实现在没有换行。
          如果超出宽度的话，是可以进行换行的」）。单行 input 超宽只会横向滚动/截断，
          客户写长备注时根本看不见自己写了什么。
          `break-words whitespace-pre-wrap` 保证长串（如连续数字/英文）也能折行不溢出。
        -->
        <textarea
          v-model="remark"
          rows="2"
          :disabled="readOnly"
          class="w-full resize-y rounded border border-[#deded9] bg-[#fbfbfa] px-2.5 py-1.5 text-xs leading-5 text-slate-900 outline-none break-words whitespace-pre-wrap placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed"
          placeholder="如：重点区域 / 30 天内 5 辆车 12 次异常停靠"
        ></textarea>
      </div>

      <!-- 只留地址：region 内容已被 address 完全包含（300/300 实测），并排显示是重复；
           「逆地理」是技术术语，对客户统一叫「识别地址」 -->
      <div class="rounded bg-[#f7f7f5] px-2.5 py-2 text-[11px] leading-5 text-slate-500">
        <div>识别地址：{{ geo.address }}</div>
      </div>
    </div>

    <!-- 操作 -->
    <div v-if="!readOnly" class="flex items-center justify-between gap-2 border-t border-[#ededea] bg-[#fbfbfa] px-3 py-2.5">
      <span class="text-[11px] text-slate-400">
        {{ isEdit ? '可在地图上点击调整位置，保存后立即生效' : compact ? '确认后写入知识库' : '入库后来源标记为「人工发现」' }}
      </span>
      <div class="flex shrink-0 items-center gap-2">
        <!--
          录入模式叫「不入库」，编辑模式仍叫「取消」（航哥 20261124）。
          ⚠️ 不能无脑全改：编辑一个已入库点位时点这个按钮，语义是"放弃这次修改"，
          写成「不入库」会让客户以为要把这个点位从库里删掉——那是另一个操作（彻底删除）。
        -->
        <button
          type="button"
          class="h-8 rounded border border-[#deded9] bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-[#f0f0ed] hover:text-slate-900"
          @click="emit('cancel')"
        >
          {{ isEdit ? '取消' : '不入库' }}
        </button>
        <button
          type="button"
          class="h-8 rounded bg-slate-900 px-3.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          :disabled="!canConfirm"
          @click="handleConfirm"
        >
          {{ isEdit ? '保存修改' : '确认入库' }}
        </button>
      </div>
    </div>
    <div v-else class="border-t border-[#ededea] bg-[#fbfbfa] px-3 py-2.5">
      <p class="text-[11px]" :class="draft.resolveState === 'confirmed' ? 'text-emerald-700' : 'text-slate-400'">
        {{ draft.resolveState === 'confirmed' ? '✓ 已写入知识库敏感区域，可继续对话查询或录入下一个点位' : '已选择不入库，未写入知识库' }}
      </p>
    </div>
  </div>
</template>
