<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ElMessage } from 'element-plus';

import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../../strokeIconPaths';
import { MAP_LAYER_STYLES, initBaseMap } from './mapShared';
import {
  AREA_TYPE_LABEL,
  AREA_TYPE_OPTIONS,
  AREA_TYPE_PRESET,
  formatRadius,
  mockReverseGeocode,
  parseAreaInputText,
} from './mockData';
import type { AreaType } from './mockData';
import { upsertSensitiveArea } from './sensitiveAreaStore';

type PickerMode = 'point' | 'batch';

interface DraftArea {
  key: string;
  name: string;
  lat: number;
  lng: number;
  areaType: AreaType;
  radiusM: number;
  remark: string;
  region: string;
  address: string;
  error: string;
  level: 'ok' | 'warn' | 'error';
}

const props = defineProps<{
  open: boolean;
  /** 对话框解析出的原始文本（批量粘贴模式自动带入） */
  prefillText?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [payload: { created: number; updated: number }];
}>();

// 类型选项统一从 mockData 取（轨迹丢失窝点已下线）

const mode = ref<PickerMode>('point');
const drafts = ref<DraftArea[]>([]);
const activeDraftKey = ref('');
const batchText = ref('');
const batchParsed = ref<ReturnType<typeof parseAreaInputText>>([]);

// 地图选点表单
const pendingPoint = ref<{ lat: number; lng: number } | null>(null);
const formName = ref('');
const formType = ref<AreaType>('watering');
const formRadius = ref<number>(AREA_TYPE_PRESET.watering.radiusM);
const formRemark = ref('');

const pendingGeo = computed(() => {
  const point = pendingPoint.value;
  if (!point) return null;
  return mockReverseGeocode(point.lat, point.lng, formName.value);
});

const validDrafts = computed(() => drafts.value.filter((draft) => draft.level !== 'error'));
const invalidCount = computed(() => drafts.value.length - validDrafts.value.length);

let seq = 0;
function nextKey() {
  seq += 1;
  return `draft-${seq}`;
}

// ===== 地图 =====

const mapRef = ref<HTMLDivElement | null>(null);
let map: L.Map | null = null;
let draftLayer: L.LayerGroup | null = null;
let pendingMarker: L.Marker | null = null;
let previewCircle: L.Circle | null = null;

function ensureStyles() {
  if (document.getElementById('kb-map-shared-styles')) return;
  const styleEl = document.createElement('style');
  styleEl.id = 'kb-map-shared-styles';
  styleEl.textContent = MAP_LAYER_STYLES;
  document.head.appendChild(styleEl);
}

function initMap() {
  if (!mapRef.value || map) return;
  ensureStyles();
  map = initBaseMap(mapRef.value, [38.5, 106.5], 6);
  draftLayer = L.layerGroup().addTo(map);

  map.on('click', (event: L.LeafletMouseEvent) => {
    const { lat, lng } = event.latlng;
    setPendingPoint(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
  });

  if (drafts.value.length > 0) {
    renderDrafts();
    fitDrafts();
  }
}

function destroyMap() {
  draftLayer = null;
  pendingMarker = null;
  previewCircle = null;
  map?.remove();
  map = null;
}

function setPendingPoint(lat: number, lng: number) {
  pendingPoint.value = { lat, lng };
  const geo = mockReverseGeocode(lat, lng, formName.value);
  if (!formName.value || AREA_TYPE_OPTIONS.includes(formType.value)) {
    // 名称为空时用逆地理建议名回填（可编辑）
    if (!formName.value) formName.value = geo.suggestName;
  }
  formRadius.value = AREA_TYPE_PRESET[formType.value].radiusM;
  drawPendingMarker();
}

function drawPendingMarker() {
  if (!map || !pendingPoint.value) return;
  const { lat, lng } = pendingPoint.value;
  if (pendingMarker) map.removeLayer(pendingMarker);
  if (previewCircle) map.removeLayer(previewCircle);

  pendingMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(15,23,42,.35)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    }),
    zIndexOffset: 800,
  }).addTo(map);

  previewCircle = L.circle([lat, lng], {
    radius: formRadius.value,
    color: '#2563eb',
    weight: 1.5,
    dashArray: '6 5',
    fillColor: '#2563eb',
    fillOpacity: 0.08,
  }).addTo(map);
}

function renderDrafts() {
  if (!map || !draftLayer) return;
  draftLayer.clearLayers();
  drafts.value.forEach((draft) => {
    const isActive = draft.key === activeDraftKey.value;
    const color = draft.level === 'error' ? '#94a3b8' : draft.level === 'warn' ? '#f59e0b' : '#dc2626';
    L.circleMarker([draft.lat, draft.lng], {
      radius: isActive ? 6.5 : 4.5,
      color: '#ffffff',
      fillColor: color,
      fillOpacity: isActive ? 1 : 0.85,
      weight: 1.5,
    })
      .addTo(draftLayer!)
      .bindTooltip(
        `<div class="line-tooltip-content"><div class="line-tooltip-title">${draft.name || '未命名点位'}</div>
         <div class="line-tooltip-row"><span>坐标</span><b>${draft.lng.toFixed(6)}, ${draft.lat.toFixed(6)}</b></div>
         <div class="line-tooltip-row"><span>类型</span><b>${AREA_TYPE_LABEL[draft.areaType]}</b></div>
         <div class="line-tooltip-row"><span>半径</span><b>${formatRadius(draft.radiusM)}</b></div></div>`,
        { direction: 'top', className: 'line-tooltip', offset: [0, -6] },
      );
    if (isActive) {
      L.circle([draft.lat, draft.lng], {
        radius: draft.radiusM,
        color: '#dc2626',
        weight: 1.5,
        dashArray: '6 5',
        fillColor: '#dc2626',
        fillOpacity: 0.07,
      }).addTo(draftLayer!);
    }
  });
}

function fitDrafts() {
  if (!map || drafts.value.length === 0) return;
  const bounds = L.latLngBounds(drafts.value.map((draft) => [draft.lat, draft.lng] as [number, number]));
  map.fitBounds(bounds, { padding: [46, 46], maxZoom: 13 });
}

function focusDraft(key: string) {
  activeDraftKey.value = key;
  const draft = drafts.value.find((item) => item.key === key);
  renderDrafts();
  if (map && draft) map.flyTo([draft.lat, draft.lng], 12, { duration: 0.5 });
}

function removeDraft(key: string) {
  drafts.value = drafts.value.filter((draft) => draft.key !== key);
  if (activeDraftKey.value === key) activeDraftKey.value = '';
  renderDrafts();
}

// ===== 表单：加入清单 =====

function applyType(type: AreaType) {
  formType.value = type;
  formRadius.value = AREA_TYPE_PRESET[type].radiusM;
  if (pendingPoint.value) drawPendingMarker();
}

watch(formRadius, () => {
  if (pendingPoint.value) drawPendingMarker();
});

function addPendingToDrafts() {
  const point = pendingPoint.value;
  if (!point) {
    ElMessage.warning('请先在地图上点选位置，或在右侧直接输入经纬度');
    return;
  }
  if (!formName.value.trim()) {
    ElMessage.warning('请填写地点名称');
    return;
  }
  const geo = mockReverseGeocode(point.lat, point.lng, formName.value);
  drafts.value.push({
    key: nextKey(),
    name: formName.value.trim(),
    lat: point.lat,
    lng: point.lng,
    areaType: formType.value,
    radiusM: formRadius.value,
    remark: formRemark.value.trim(),
    region: geo.region,
    address: geo.address,
    error: '',
    level: 'ok',
  });
  activeDraftKey.value = drafts.value[0]!.key;
  // 重置表单，便于连续录入
  formName.value = '';
  formRemark.value = '';
  pendingPoint.value = null;
  if (pendingMarker && map) map.removeLayer(pendingMarker);
  if (previewCircle && map) map.removeLayer(previewCircle);
  pendingMarker = null;
  previewCircle = null;
  renderDrafts();
  ElMessage.success('已加入待入库清单');
}

/** 右侧表单直接输入经纬度并定位 */
const coordInput = ref('');
function locateByCoordInput() {
  const parsed = parseAreaInputText(coordInput.value);
  const first = parsed[0];
  if (!first || first.level === 'error') {
    ElMessage.warning(first?.error || '坐标格式不正确，示例：98.123456, 40.123456');
    return;
  }
  if (first.error) ElMessage.warning(first.error);
  if (first.name && !formName.value) formName.value = first.name;
  applyCoord(first.lat, first.lng);
  coordInput.value = '';
}

function applyCoord(lat: number, lng: number) {
  setPendingPoint(lat, lng);
  map?.flyTo([lat, lng], 12, { duration: 0.5 });
}

// ===== 批量粘贴 =====

function parseBatch() {
  const text = batchText.value.trim();
  if (!text) {
    ElMessage.warning('请先粘贴点位内容');
    return;
  }
  const parsed = parseAreaInputText(text);
  batchParsed.value = parsed;
  const okCount = parsed.filter((item) => item.level !== 'error').length;
  const warnCount = parsed.filter((item) => item.level === 'warn').length;
  ElMessage.success(`解析到 ${parsed.length} 行，可入库 ${okCount} 行${warnCount ? `（其中 ${warnCount} 行有提示）` : ''}`);
}

function addBatchToDrafts() {
  const usable = batchParsed.value.filter((item) => item.level !== 'error');
  if (usable.length === 0) {
    ElMessage.warning('没有可入库的行，请先解析');
    return;
  }
  usable.forEach((item) => {
    const geo = mockReverseGeocode(item.lat, item.lng, item.name);
    drafts.value.push({
      key: nextKey(),
      name: item.name || geo.suggestName,
      lat: item.lat,
      lng: item.lng,
      areaType: formType.value,
      radiusM: item.radiusM > 0 ? item.radiusM : AREA_TYPE_PRESET[formType.value].radiusM,
      remark: item.remark,
      region: geo.region,
      address: geo.address,
      error: item.error,
      level: item.level,
    });
  });
  batchText.value = '';
  batchParsed.value = [];
  mode.value = 'point';
  activeDraftKey.value = drafts.value[0]?.key ?? '';
  renderDrafts();
  fitDrafts();
  ElMessage.success(`已加入 ${usable.length} 个点位到待入库清单`);
}

// ===== 入库 =====

const saving = ref(false);

function confirmSave() {
  if (validDrafts.value.length === 0) {
    ElMessage.warning('待入库清单为空');
    return;
  }
  saving.value = true;
  let created = 0;
  let updated = 0;
  validDrafts.value.forEach((draft) => {
    const result = upsertSensitiveArea({
      name: draft.name,
      lat: draft.lat,
      lng: draft.lng,
      radiusM: draft.radiusM,
      areaType: draft.areaType,
      remark: draft.remark,
      source: 'manual',
    });
    if (result.created) created += 1;
    else updated += 1;
  });
  saving.value = false;
  ElMessage.success(`已入库：新增 ${created} 个${updated ? `，更新 ${updated} 个（坐标重复）` : ''}`);
  emit('saved', { created, updated });
  resetAll();
  emit('close');
}

function resetAll() {
  drafts.value = [];
  activeDraftKey.value = '';
  pendingPoint.value = null;
  formName.value = '';
  formRemark.value = '';
  formType.value = 'watering';
  formRadius.value = AREA_TYPE_PRESET.watering.radiusM;
  batchText.value = '';
  batchParsed.value = [];
  mode.value = 'point';
}

function handleClose() {
  resetAll();
  emit('close');
}

// ===== 打开 / 关闭生命周期 =====

watch(
  () => props.open,
  (open) => {
    if (open) {
      nextTick(() => {
        initMap();
        setTimeout(() => map?.invalidateSize(), 60);
        if (props.prefillText && props.prefillText.trim()) {
          mode.value = 'batch';
          batchText.value = props.prefillText;
          nextTick(() => parseBatch());
        }
      });
    } else {
      destroyMap();
    }
  },
);

watch(drafts, () => renderDrafts(), { deep: true });
watch(activeDraftKey, () => renderDrafts());

onBeforeUnmount(() => destroyMap());
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-6" role="presentation">
      <div
        class="flex max-h-[88vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-lg bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24),0_4px_16px_rgba(15,23,42,0.08)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensitive-area-picker-title"
      >
        <!-- 头部 -->
        <div class="flex items-start justify-between gap-4 border-b border-[#e7e7e3] px-5 py-4">
          <div class="min-w-0">
            <h2 id="sensitive-area-picker-title" class="text-base font-semibold leading-6 text-slate-950">录入敏感区域点位</h2>
            <p class="mt-1 text-xs leading-5 text-slate-500">
              在地图上点选位置或粘贴经纬度清单，确认半径与类型后入知识库；来源标记为「人工发现」。
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-3">
            <div class="flex items-center gap-0.5 rounded-md bg-[#f2f2ef] p-0.5">
              <button
                v-for="item in ([{ id: 'point', label: '地图选点' }, { id: 'batch', label: '批量粘贴' }] as const)"
                :key="item.id"
                type="button"
                class="rounded px-2.5 py-1 text-xs font-medium transition"
                :class="mode === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
                @click="mode = item.id"
              >
                {{ item.label }}
              </button>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#f2f2ef] hover:text-slate-800"
              aria-label="关闭"
              title="关闭"
              @click="handleClose"
            >
              <Icon :svg="strokeIconPaths.x" :size="15" />
            </button>
          </div>
        </div>

        <!-- 主体：左地图 + 右表单/清单 -->
        <div class="flex min-h-0 flex-1 gap-0">
          <!-- 地图 -->
          <div class="relative min-w-0 flex-1 border-r border-[#eeeeec]">
            <div ref="mapRef" class="platform-map absolute inset-0 bg-[#f3f3ef]"></div>
            <div class="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg border border-white/60 bg-white/85 px-3 py-2 shadow-sm backdrop-blur-md">
              <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">操作提示</p>
              <p class="mt-0.5 text-[11px] text-slate-600">点击地图落点 · 蓝圈为半径预览</p>
            </div>
            <div v-if="drafts.length" class="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-white/60 bg-white/85 px-3 py-1.5 text-[11px] text-slate-600 shadow-sm backdrop-blur-md">
              待入库 {{ drafts.length }} 个 · 红点已加入 / 蓝点当前选点
            </div>
          </div>

          <!-- 右侧 -->
          <div class="flex w-[380px] shrink-0 flex-col overflow-hidden">
            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <!-- 地图选点模式 -->
              <template v-if="mode === 'point'">
                <div class="mb-3">
                  <label class="mb-1.5 block text-xs font-medium text-slate-600">坐标定位</label>
                  <div class="flex gap-2">
                    <input
                      v-model="coordInput"
                      type="text"
                      class="h-9 min-w-0 flex-1 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      placeholder="粘贴：98.123456, 40.123456"
                      @keydown.enter.prevent="locateByCoordInput"
                    />
                    <button
                      type="button"
                      class="h-9 shrink-0 rounded-md border border-[#deded9] bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-[#f2f2ef]"
                      @click="locateByCoordInput"
                    >
                      定位
                    </button>
                  </div>
                  <p v-if="pendingPoint" class="mt-1.5 text-[11px] text-slate-500">
                    当前选点：{{ pendingPoint.lng.toFixed(6) }}, {{ pendingPoint.lat.toFixed(6) }}
                    <span v-if="pendingGeo" class="text-slate-400">· {{ pendingGeo.region }}</span>
                  </p>
                  <p v-else class="mt-1.5 text-[11px] text-slate-400">在左侧地图点击任意位置落点。</p>
                </div>

                <div class="mb-3">
                  <label class="mb-1.5 block text-xs font-medium text-slate-600">地点名称</label>
                  <input
                    v-model="formName"
                    type="text"
                    class="h-9 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="例如：甘肃省酒泉市玉门市示范镇"
                  />
                  <p v-if="pendingGeo" class="mt-1.5 text-[11px] text-slate-400">逆地理参考地址：{{ pendingGeo.address }}</p>
                </div>

                <div class="mb-3">
                  <label class="mb-1.5 block text-xs font-medium text-slate-600">点位类型</label>
                  <div class="grid gap-1.5">
                    <button
                      v-for="type in AREA_TYPE_OPTIONS"
                      :key="type"
                      type="button"
                      class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition"
                      :class="formType === type ? 'border-slate-900 bg-[#f7f7f5]' : 'border-[#deded9] bg-white hover:border-[#c8c8c2]'"
                      @click="applyType(type)"
                    >
                      <span class="text-xs font-medium text-slate-900">{{ AREA_TYPE_LABEL[type] }}</span>
                      <span class="shrink-0 text-[11px] text-slate-500">
                        默认 {{ formatRadius(AREA_TYPE_PRESET[type].radiusM) }}
                        <template v-if="AREA_TYPE_PRESET[type].stayThresholdMin">
                          · 停留 {{ AREA_TYPE_PRESET[type].stayThresholdMin }} 分钟
                        </template>
                      </span>
                    </button>
                  </div>
                </div>

                <div class="mb-3 flex items-end gap-3">
                  <div class="flex-1">
                    <label class="mb-1.5 block text-xs font-medium text-slate-600">半径（米）</label>
                    <input
                      v-model.number="formRadius"
                      type="number"
                      min="50"
                      max="5000"
                      step="50"
                      class="h-9 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div class="flex-1">
                    <label class="mb-1.5 block text-xs font-medium text-slate-600">备注</label>
                    <input
                      v-model="formRemark"
                      type="text"
                      class="h-9 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      placeholder="如：重点区域"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  class="h-9 w-full rounded-md bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  :disabled="!pendingPoint"
                  @click="addPendingToDrafts"
                >
                  加入待入库清单
                </button>
              </template>

              <!-- 批量粘贴模式 -->
              <template v-else>
                <label class="mb-1.5 block text-xs font-medium text-slate-600">粘贴点位清单</label>
                <textarea
                  v-model="batchText"
                  rows="7"
                  class="w-full resize-none rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 font-mono text-[11px] leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  placeholder="每行一个点位，格式：经度, 纬度  地点名称  备注&#10;106.123456, 37.654321  宁夏回族自治区吴忠市青铜峡市示范镇&#10;97.654321, 40.321654  甘肃省酒泉市玉门市样板镇  重点区域"
                ></textarea>
                <div class="mt-2 flex gap-2">
                  <button
                    type="button"
                    class="h-9 flex-1 rounded-md border border-[#deded9] bg-white text-sm font-medium text-slate-700 transition hover:bg-[#f2f2ef]"
                    @click="parseBatch"
                  >
                    解析校验
                  </button>
                  <button
                    type="button"
                    class="h-9 flex-1 rounded-md bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    :disabled="batchParsed.length === 0"
                    @click="addBatchToDrafts"
                  >
                    加入清单
                  </button>
                </div>

                <div v-if="batchParsed.length" class="mt-3">
                  <p class="mb-1.5 text-xs font-medium text-slate-600">
                    解析结果 · {{ batchParsed.length }} 行
                    <span class="ml-1 text-[11px] font-normal text-slate-400">（可入库 {{ batchParsed.filter((i) => i.level !== 'error').length }} 行）</span>
                  </p>
                  <div class="max-h-[190px] overflow-y-auto rounded-md border border-[#e7e7e3]">
                    <div
                      v-for="item in batchParsed"
                      :key="item.lineNo"
                      class="border-b border-[#f1f1ee] px-3 py-2 last:border-b-0"
                      :class="item.level === 'error' ? 'bg-red-50/50' : item.level === 'warn' ? 'bg-amber-50/50' : ''"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <p class="min-w-0 truncate text-[11px] font-medium text-slate-800">
                          <span class="text-slate-400">行{{ item.lineNo }}</span>
                          {{ item.name || '（无名称）' }}
                        </p>
                        <span class="shrink-0 font-mono text-[10px] text-slate-500">
                          {{ item.lng.toFixed(4) }}, {{ item.lat.toFixed(4) }}<template v-if="item.radiusM"> · {{ formatRadius(item.radiusM) }}</template>
                        </span>
                      </div>
                      <p v-if="item.error" class="mt-0.5 text-[10px]" :class="item.level === 'error' ? 'text-red-600' : 'text-amber-600'">
                        {{ item.error }}
                      </p>
                      <p v-if="item.remark" class="mt-0.5 text-[10px] text-slate-400">备注：{{ item.remark }}</p>
                    </div>
                  </div>
                </div>
              </template>

              <!-- 待入库清单 -->
              <div class="mt-5 border-t border-[#eeeeec] pt-3">
                <div class="mb-1.5 flex items-center justify-between">
                  <p class="text-xs font-semibold text-slate-900">待入库清单 · {{ drafts.length }}</p>
                  <button
                    v-if="drafts.length"
                    type="button"
                    class="text-[11px] text-slate-400 transition hover:text-red-600"
                    @click="drafts = []; activeDraftKey = ''"
                  >
                    清空
                  </button>
                </div>
                <p v-if="!drafts.length" class="text-[11px] text-slate-400">尚无点位，先在地图选点或批量粘贴。</p>
                <div v-else class="max-h-[220px] space-y-1 overflow-y-auto">
                  <div
                    v-for="draft in drafts"
                    :key="draft.key"
                    class="group flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-2 transition"
                    :class="[
                      draft.level === 'error'
                        ? 'border-red-200 bg-red-50/40'
                        : activeDraftKey === draft.key
                          ? 'border-slate-900 bg-[#f7f7f5]'
                          : 'border-[#e7e7e3] bg-white hover:border-[#c8c8c2]',
                    ]"
                    @click="focusDraft(draft.key)"
                  >
                    <div class="min-w-0">
                      <p class="truncate text-[11px] font-medium text-slate-900">{{ draft.name }}</p>
                      <p class="mt-0.5 truncate text-[10px] text-slate-400">
                        {{ AREA_TYPE_LABEL[draft.areaType] }} · {{ formatRadius(draft.radiusM) }}
                        <span v-if="draft.error" :class="draft.level === 'error' ? 'text-red-600' : 'text-amber-600'">· {{ draft.error }}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                      aria-label="移除"
                      @click.stop="removeDraft(draft.key)"
                    >
                      <Icon :svg="strokeIconPaths.x" :size="11" />
                    </button>
                  </div>
                </div>
                <p v-if="invalidCount" class="mt-1.5 text-[11px] text-red-600">{{ invalidCount }} 行校验不通过，入库时将自动跳过。</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部 -->
        <div class="flex items-center justify-between gap-3 border-t border-[#e7e7e3] bg-[#fbfbfa] px-5 py-3.5">
          <span class="text-xs text-slate-500">
            入库后可在「知识库 · 敏感区域」查看，来源标记为
            <b class="text-slate-700">人工发现</b>
          </span>
          <div class="flex shrink-0 items-center gap-2">
            <button type="button" class="h-9 rounded-md px-3 text-sm text-slate-600 transition hover:bg-[#f0f0ed] hover:text-slate-900" @click="handleClose">
              取消
            </button>
            <button
              type="button"
              class="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              :disabled="validDrafts.length === 0 || saving"
              @click="confirmSave"
            >
              确认入库{{ validDrafts.length ? `（${validDrafts.length}）` : '' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
