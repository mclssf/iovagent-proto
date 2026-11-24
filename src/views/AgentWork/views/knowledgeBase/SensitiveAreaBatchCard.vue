<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import { ElMessage } from 'element-plus';

import { AREA_SOURCE_LABEL, formatRadius } from './mockData';
import { confirmableDrafts, summarizeDrafts } from './sensitiveAreaIntake';
import { upsertSensitiveArea, upsertSensitiveAreas } from './sensitiveAreaStore';
import SensitiveAreaConfirmCard from './SensitiveAreaConfirmCard.vue';
import type { SensitiveAreaDraft } from '../../interface';
import type { AreaType } from './mockData';

const props = defineProps<{ drafts: SensitiveAreaDraft[] }>();

const emit = defineEmits<{
  /** 批量入库完成，由父级追加一条 agent 回复 */
  saved: [payload: { created: number; updated: number; names: string[] }];
  /** 从批次里移除一条（未入库的草稿） */
  remove: [index: number];
  gotoBoard: [];
}>();

const TABLE_PAGE_SIZE = 6;

type ViewMode = 'list' | 'step';

const viewMode = ref<ViewMode>(props.drafts.filter((d) => !d.parseError).length > 1 ? 'list' : 'step');
const tablePage = ref(1);
const stepIndex = ref(0);
const showRejected = ref(false);
const isSaving = ref(false);

/** 可审阅的草稿（排除解析失败行） */
const reviewable = computed(() => props.drafts.filter((draft) => !draft.parseError));
/** 解析失败行 */
const rejected = computed(() => props.drafts.filter((draft) => !!draft.parseError));
/** 重复坐标行（在 reviewable 内，但默认不入库） */
const duplicateCount = computed(() => reviewable.value.filter((draft) => (draft.duplicateOf ?? 0) > 0).length);

const summary = computed(() => summarizeDrafts(props.drafts));
const confirmedCount = computed(() => reviewable.value.filter((d) => d.resolveState === 'confirmed').length);
const cancelledCount = computed(() => reviewable.value.filter((d) => d.resolveState === 'cancelled').length);
const pendingCount = computed(() => confirmableDrafts(props.drafts).length);

const tablePageCount = computed(() => Math.max(1, Math.ceil(reviewable.value.length / TABLE_PAGE_SIZE)));
const pagedRows = computed(() => {
  const start = (tablePage.value - 1) * TABLE_PAGE_SIZE;
  return reviewable.value.slice(start, start + TABLE_PAGE_SIZE).map((draft, offset) => ({
    draft,
    index: props.drafts.indexOf(draft),
    no: start + offset + 1,
  }));
});

const currentDraft = computed(() => reviewable.value[stepIndex.value] ?? null);
const currentIndexInAll = computed(() => (currentDraft.value ? props.drafts.indexOf(currentDraft.value) : -1));

const isBatchDone = computed(() => pendingCount.value === 0 && reviewable.value.length > 0);

watch(
  () => props.drafts.length,
  () => {
    if (tablePage.value > tablePageCount.value) tablePage.value = tablePageCount.value;
    if (stepIndex.value >= reviewable.value.length) stepIndex.value = Math.max(0, reviewable.value.length - 1);
  },
);

function switchView(mode: ViewMode) {
  viewMode.value = mode;
}

function prevStep() {
  stepIndex.value = Math.max(0, stepIndex.value - 1);
}

function nextStep() {
  stepIndex.value = Math.min(reviewable.value.length - 1, stepIndex.value + 1);
}

function jumpTo(indexInReviewable: number) {
  stepIndex.value = indexInReviewable;
  viewMode.value = 'step';
}

function openInStep(draft: SensitiveAreaDraft) {
  const idx = reviewable.value.indexOf(draft);
  if (idx >= 0) jumpTo(idx);
}

/** 跳到下一条待确认的（逐个确认时用） */
function gotoNextPending() {
  const nextIdx = reviewable.value.findIndex((draft, index) => index > stepIndex.value && draft.resolveState === 'pending' && !draft.parseError && (draft.duplicateOf ?? 0) === 0);
  if (nextIdx >= 0) {
    stepIndex.value = nextIdx;
    return;
  }
  const firstPending = reviewable.value.findIndex((draft) => draft.resolveState === 'pending' && (draft.duplicateOf ?? 0) === 0);
  if (firstPending >= 0) stepIndex.value = firstPending;
}

/** 单条确认（逐个视图里点「确认入库」） */
function handleOneConfirm(
  payload: {
    name: string;
    lat: number;
    lng: number;
    radiusM: number;
    areaType: AreaType;
    stayThresholdMin: number;
    remark: string;
  },
) {
  const index = currentIndexInAll.value;
  if (index < 0) return;
  const draft = props.drafts[index];
  if (!draft || draft.resolveState !== 'pending') return;

  const result = upsertSensitiveArea({
    name: payload.name,
    lat: payload.lat,
    lng: payload.lng,
    radiusM: payload.radiusM,
    areaType: payload.areaType,
    stayThresholdMin: payload.stayThresholdMin,
    remark: payload.remark,
    source: 'manual',
  });
  Object.assign(draft, payload, { resolveState: 'confirmed' });
  ElMessage.success(result.created ? `已入库「${payload.name}」` : `坐标已存在，已更新「${payload.name}」`);
  gotoNextPending();
}

function handleOneCancel() {
  const index = currentIndexInAll.value;
  if (index < 0) return;
  const draft = props.drafts[index];
  if (!draft || draft.resolveState !== 'pending') return;
  draft.resolveState = 'cancelled';
  gotoNextPending();
}

/** 全部确认入库 */
function handleConfirmAll() {
  const targets = confirmableDrafts(props.drafts);
  if (targets.length === 0) {
    ElMessage.info('没有待入库的点位了');
    return;
  }
  isSaving.value = true;
  const result = upsertSensitiveAreas(
    targets.map((draft) => ({
      name: draft.name,
      lat: draft.lat,
      lng: draft.lng,
      radiusM: draft.radiusM,
      areaType: draft.areaType,
      stayThresholdMin: draft.stayThresholdMin,
      remark: draft.remark,
      source: 'manual' as const,
      status: 'active' as const,
    })),
  );
  targets.forEach((draft) => {
    draft.resolveState = 'confirmed';
  });
  isSaving.value = false;
  emit('saved', {
    created: result.created,
    updated: result.updated,
    names: targets.map((draft) => draft.name),
  });
}

/** 整批取消 */
function handleCancelAll() {
  let count = 0;
  props.drafts.forEach((draft) => {
    if (!draft.parseError && draft.resolveState === 'pending') {
      draft.resolveState = 'cancelled';
      count += 1;
    }
  });
  if (count > 0) ElMessage.info(`已取消 ${count} 个点位，未写入知识库`);
}

/** 从批次里剔除一条（草稿还没入库，直接移除） */
function handleRemove(index: number) {
  emit('remove', index);
}

function statusLabel(draft: SensitiveAreaDraft) {
  if ((draft.duplicateOf ?? 0) > 0) return { text: `重复(同第${draft.duplicateOf}条)`, cls: 'bg-slate-100 text-slate-500' };
  if (draft.resolveState === 'confirmed') return { text: '已入库', cls: 'bg-emerald-50 text-emerald-700' };
  if (draft.resolveState === 'cancelled') return { text: '已取消', cls: 'bg-slate-100 text-slate-500' };
  return { text: '待确认', cls: 'bg-amber-50 text-amber-700' };
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-[#deded9] bg-white">
    <!-- 头部 -->
    <div class="flex items-center justify-between gap-2 border-b border-[#ededea] bg-[#f7f7f5] px-3 py-2">
      <div class="flex min-w-0 items-center gap-2">
        <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-red-50 text-red-600">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M2 12h2M20 12h2" />
          </svg>
        </span>
        <p class="truncate text-xs font-semibold text-slate-900">敏感区域录入确认</p>
        <span class="shrink-0 text-[10px] text-slate-500">共 {{ summary.total }} 条</span>
      </div>
      <!-- 视图切换 -->
      <div v-if="reviewable.length > 1" class="flex shrink-0 items-center rounded-md border border-[#e3e3df] bg-white p-0.5">
        <button
          v-for="mode in (['list', 'step'] as ViewMode[])"
          :key="mode"
          type="button"
          class="rounded px-2 py-0.5 text-[11px] font-medium transition"
          :class="viewMode === mode ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'"
          @click="switchView(mode)"
        >
          {{ mode === 'list' ? '清单总览' : '逐个确认' }}
        </button>
      </div>
    </div>

    <!-- 统计条 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#ededea] px-3 py-1.5 text-[10px] text-slate-500">
      <span>可入库 <b class="font-semibold text-slate-800">{{ summary.usable }}</b></span>
      <span>已入库 <b class="font-semibold text-emerald-600">{{ confirmedCount }}</b></span>
      <span v-if="duplicateCount > 0">重复 <b class="font-semibold text-slate-700">{{ duplicateCount }}</b></span>
      <span v-if="cancelledCount > 0">已取消 <b class="font-semibold text-slate-500">{{ cancelledCount }}</b></span>
      <span v-if="rejected.length > 0">
        无法识别
        <button type="button" class="font-semibold text-amber-600 underline decoration-dotted" @click="showRejected = !showRejected">
          {{ rejected.length }}
        </button>
      </span>
      <span class="ml-auto text-slate-400">来源将标记为「{{ AREA_SOURCE_LABEL.manual }}」</span>
    </div>

    <!-- 无法识别清单（折叠） -->
    <div v-if="showRejected && rejected.length > 0" class="border-b border-[#ededea] bg-amber-50/40 px-3 py-2">
      <p class="mb-1 text-[10px] font-medium text-amber-700">以下 {{ rejected.length }} 条没能解析出有效经纬度，请核对原始数据后重新发送：</p>
      <ul class="space-y-1">
        <li v-for="(item, idx) in rejected" :key="item.id" class="flex items-start gap-2 text-[10px] leading-4">
          <span class="shrink-0 font-mono text-slate-400">{{ item.sourceRow ? `第${item.sourceRow}行` : `#${idx + 1}` }}</span>
          <span class="min-w-0 flex-1 break-all text-slate-600">{{ item.rawInput }}</span>
          <span class="shrink-0 text-amber-700">{{ item.parseError }}</span>
        </li>
      </ul>
    </div>

    <!-- 清单总览 -->
    <div v-if="viewMode === 'list' && reviewable.length > 0">
      <table class="w-full border-collapse text-left">
        <thead>
          <tr class="border-b border-[#ededea] bg-[#fbfbfa] text-[10px] text-slate-500">
            <th class="w-8 px-2 py-1.5 font-medium">#</th>
            <th class="px-2 py-1.5 font-medium">地点名称</th>
            <th class="w-[124px] px-2 py-1.5 font-medium">经纬度</th>
            <th class="w-14 px-2 py-1.5 font-medium">半径</th>
            <th class="w-[92px] px-2 py-1.5 font-medium">状态</th>
            <th class="w-14 px-2 py-1.5 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pagedRows"
            :key="row.draft.id"
            class="border-b border-[#f2f2ef] text-[11px] transition last:border-b-0 hover:bg-[#fafaf8]"
            :class="row.draft.resolveState === 'cancelled' ? 'opacity-55' : ''"
          >
            <td class="px-2 py-1.5 font-mono text-slate-400">
              {{ row.draft.sourceRow ? `R${row.draft.sourceRow}` : row.no }}
            </td>
            <td class="max-w-0 px-2 py-1.5">
              <p class="truncate font-medium text-slate-800" :title="row.draft.name">{{ row.draft.name }}</p>
              <p class="truncate text-[10px] text-slate-400">{{ row.draft.region }}</p>
            </td>
            <td class="px-2 py-1.5 font-mono text-[10px] text-slate-600">
              {{ row.draft.lng.toFixed(4) }}, {{ row.draft.lat.toFixed(4) }}
            </td>
            <td class="px-2 py-1.5 text-slate-600">{{ row.draft.radiusM ? formatRadius(row.draft.radiusM) : '—' }}</td>
            <td class="px-2 py-1.5">
              <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold" :class="statusLabel(row.draft).cls">
                {{ statusLabel(row.draft).text }}
              </span>
            </td>
            <td class="px-2 py-1.5 text-right">
              <button
                v-if="row.draft.resolveState === 'pending'"
                type="button"
                class="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 transition hover:bg-red-50"
                @click="handleRemove(row.index)"
              >
                剔除
              </button>
              <button
                type="button"
                class="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-600 transition hover:bg-[#f0f0ed]"
                @click="openInStep(row.draft)"
              >
                查看
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 分页 -->
      <div v-if="tablePageCount > 1" class="flex items-center justify-between border-t border-[#ededea] px-3 py-1.5">
        <span class="text-[10px] text-slate-400">共 {{ reviewable.length }} 条 · 第 {{ tablePage }} / {{ tablePageCount }} 页</span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded border border-[#e3e3df] px-2 py-0.5 text-[10px] text-slate-600 transition hover:bg-[#f2f2ef] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="tablePage <= 1"
            @click="tablePage -= 1"
          >
            上一页
          </button>
          <button
            type="button"
            class="rounded border border-[#e3e3df] px-2 py-0.5 text-[10px] text-slate-600 transition hover:bg-[#f2f2ef] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="tablePage >= tablePageCount"
            @click="tablePage += 1"
          >
            下一页
          </button>
        </div>
      </div>
    </div>

    <!-- 逐个确认 -->
    <div v-if="viewMode === 'step' && currentDraft" class="p-2.5">
      <SensitiveAreaConfirmCard
        :key="currentDraft.id"
        :draft="currentDraft"
        compact
        @confirm="handleOneConfirm"
        @cancel="handleOneCancel"
      />
      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="text-[10px] text-slate-400">
          第 {{ stepIndex + 1 }} / {{ reviewable.length }} 个
          <template v-if="currentDraft.sourceRow">· 表格第 {{ currentDraft.sourceRow }} 行</template>
        </span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="rounded border border-[#e3e3df] px-2 py-0.5 text-[10px] text-slate-600 transition hover:bg-[#f2f2ef] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="stepIndex <= 0"
            @click="prevStep"
          >
            上一个
          </button>
          <button
            type="button"
            class="rounded border border-[#e3e3df] px-2 py-0.5 text-[10px] text-slate-600 transition hover:bg-[#f2f2ef] disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="stepIndex >= reviewable.length - 1"
            @click="nextStep"
          >
            下一个
          </button>
        </div>
      </div>
    </div>

    <!-- 底部批量操作 -->
    <div class="flex items-center justify-between gap-2 border-t border-[#ededea] bg-[#fbfbfa] px-3 py-2.5">
      <template v-if="!isBatchDone">
        <span class="text-[11px] text-slate-400">
          待入库 <b class="font-semibold text-slate-700">{{ pendingCount }}</b> 个
          <template v-if="duplicateCount > 0">（{{ duplicateCount }} 个重复坐标不会重复入库）</template>
        </span>
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="h-8 rounded border border-[#deded9] bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-[#f0f0ed] hover:text-slate-900"
            @click="handleCancelAll"
          >
            <!-- 航哥 20261124：「取消」→「不入库」、「全部取消」→「全部不入库」。
                 理由是这个按钮的真实语义不是"关闭窗口"，而是"这些点位不写进知识库"，
                 叫「取消」客户会以为只是关掉弹窗、下次还在。 -->
            全部不入库
          </button>
          <button
            type="button"
            class="h-8 rounded bg-slate-900 px-3.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            :disabled="pendingCount === 0 || isSaving"
            @click="handleConfirmAll"
          >
            全部确认入库（{{ pendingCount }}）
          </button>
        </div>
      </template>
      <template v-else>
        <span class="text-[11px] text-emerald-700">✓ 本批已处理完：入库 {{ confirmedCount }} 个<template v-if="cancelledCount">，取消 {{ cancelledCount }} 个</template></span>
        <button
          type="button"
          class="h-8 shrink-0 rounded border border-[#deded9] bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-[#f0f0ed]"
          @click="emit('gotoBoard')"
        >
          去知识库查看
        </button>
      </template>
    </div>
  </div>
</template>
