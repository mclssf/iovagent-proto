<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import { ElMessage } from 'element-plus';

import { draftsFromText, summarizeDrafts } from './sensitiveAreaIntake';
import SensitiveAreaBatchCard from './SensitiveAreaBatchCard.vue';
import type { SensitiveAreaDraft } from '../../interface';

/**
 * 知识库页面内的敏感区域录入弹窗（两步：识别 → 核对/编辑 → 入库）。
 *
 * 与对话框录入共用同一套解析（sensitiveAreaIntake）与核对卡（SensitiveAreaBatchCard），
 * 区别只在于：这里的录入意图已经确定，解析不再要求文本里带「敏感区域」关键词。
 * 输入格式刻意放宽——单个输入框，一段一段粘贴或逐行输入都能识别。
 *
 * ⚠️ **核对步骤不可删**（航哥 20261124：「录入点位的确认那一块怎么给去掉了啊？」）。
 * 我曾把这里改成"识别并入库"一步到位，理由是航哥对"人工录入是否还需要确认"答了
 * 「不需要确认」——**那是"不用再来问我"的意思，不是"把产品里的核对环节删掉"**。
 * 核对环节承担着两件事，一步入库都补不回来：
 *   ① 批量粘贴的解析结果可以逐条**改名字、在地图上点选调整位置、调半径**再入库；
 *   ② 解析失败 / 坐标重复的行会被列出来，不会静默变成脏数据。
 * 以后遇到"是否还需要 X"这类提问，答复含糊时**默认保留现状**，不要顺手删功能。
 */
const props = defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{
  'update:modelValue': [visible: boolean];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const SINGLE_EXAMPLE = `98.123456, 40.123456 甘肃省酒泉市玉门市示范镇，半径300米`;

// ⚠️ 示例里不再出现「停留15分钟以上算异常」——停留阈值已改为全局统一、不在录入里逐条填
// （航哥 20261124 结论8）。留着会诱导用户写一个界面上已经改不了的字段。
const MULTI_EXAMPLE = `玉门市示范镇有个注水点，98.123456, 40.123456，半径300米
郑州中牟县万三公路 113.665412, 34.757138 也要加，500米
110.348261, 26.614455 广西壮族自治区桂林市灵川县，半径200米
武威市凉州区发放镇 102.634871, 37.929455；中卫市沙坡头区 105.189244, 37.514327`;

const rawText = ref('');
const drafts = ref<SensitiveAreaDraft[] | null>(null);
const errorMsg = ref('');

const isReviewing = computed(() => drafts.value !== null);

/**
 * 实时预估（"边打边看"）：可用条数与无法识别条数分开报。
 * ⚠️ 不能只报总数——`draftsFromText` 返回的数组里含 parseError 行，
 * 笼统说"已识别 5 个"会让用户以为 5 条都能入库，实际可能只有 3 条能进。
 */
const preview = computed(() => {
  const text = rawText.value.trim();
  if (!text) return null;
  return summarizeDrafts(draftsFromText(text, { requireKeyword: false }));
});

function fillExample(kind: 'single' | 'multi') {
  rawText.value = kind === 'single' ? SINGLE_EXAMPLE : MULTI_EXAMPLE;
  errorMsg.value = '';
}

function handleParse() {
  const text = rawText.value.trim();
  if (!text) {
    errorMsg.value = '请先输入或粘贴点位信息';
    return;
  }
  const parsed = draftsFromText(text, { requireKeyword: false });
  if (parsed.length === 0) {
    drafts.value = null;
    errorMsg.value = '没有识别到有效坐标：每段需包含经纬度，例如 98.123456, 40.123456';
    return;
  }
  errorMsg.value = '';
  drafts.value = parsed;
}

function backToInput() {
  drafts.value = null;
}

function handleRemove(index: number) {
  if (!drafts.value) return;
  drafts.value.splice(index, 1);
  if (drafts.value.length === 0) drafts.value = null;
}

function handleSaved(payload: { created: number; updated: number; names: string[] }) {
  const parts = [`新增 ${payload.created} 个`];
  if (payload.updated > 0) parts.push(`更新 ${payload.updated} 个`);
  ElMessage.success(`敏感区域已入库：${parts.join('，')}`);
  close();
}

function close() {
  visible.value = false;
}

// 每次打开回到输入态（保留上次文本，避免误关丢内容）
watch(visible, (value) => {
  if (value) {
    drafts.value = null;
    errorMsg.value = '';
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-6"
      role="presentation"
      @click.self="close"
    >
      <div
        class="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-lg bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24),0_4px_16px_rgba(15,23,42,0.08)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-intake-title"
      >
        <!-- 头部 -->
        <div class="flex items-start justify-between gap-4 border-b border-[#e7e7e3] px-5 py-4">
          <div class="min-w-0">
            <h2 id="area-intake-title" class="text-base font-semibold leading-6 text-slate-950">录入敏感区域点位</h2>
            <p class="mt-1 text-xs leading-5 text-slate-500">
              {{ isReviewing ? '核对识别结果，可改名称 / 地图点选调整位置 / 调半径，逐个确认或一键全部入库；来源标记为「人工发现」' : '粘贴或输入点位信息，系统自动识别后进入核对' }}
            </p>
          </div>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#f2f2ef] hover:text-slate-700"
            aria-label="关闭"
            @click="close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <!-- 主体 -->
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <!-- 步骤一：输入 -->
          <template v-if="!isReviewing">
            <div class="mb-2 flex items-center justify-between gap-3">
              <label for="area-intake-text" class="text-xs font-medium text-slate-700">点位信息</label>
              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  class="rounded border border-[#e3e3df] bg-white px-2 py-0.5 text-[11px] text-slate-600 transition hover:bg-[#f7f7f5] hover:text-slate-900"
                  @click="fillExample('single')"
                >
                  填入单点示例
                </button>
                <button
                  type="button"
                  class="rounded border border-[#e3e3df] bg-white px-2 py-0.5 text-[11px] text-slate-600 transition hover:bg-[#f7f7f5] hover:text-slate-900"
                  @click="fillExample('multi')"
                >
                  填入多点示例
                </button>
              </div>
            </div>

            <textarea
              id="area-intake-text"
              v-model="rawText"
              rows="8"
              class="w-full resize-y rounded-md border border-[#deded9] bg-white px-3 py-2.5 text-[13px] leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              placeholder="一段一段粘贴，或逐行输入都可以。只要每段里有经纬度就能识别，其余信息（地点名、半径）有就带上、没有就走默认值。&#10;&#10;例如：&#10;98.123456, 40.123456 甘肃省酒泉市玉门市示范镇，半径300米"
              @input="errorMsg = ''"
            ></textarea>

            <p class="mt-2 text-[11px] leading-5 text-slate-400">
              支持换行、分号分隔与整段自然语言；坐标顺序「经度, 纬度」或「纬度, 经度」都能识别，缺名称时按坐标逆地理自动补全。
            </p>

            <p v-if="errorMsg" class="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
              {{ errorMsg }}
            </p>
          </template>

          <!-- 步骤二：核对识别结果（复用对话框里的批量确认卡） -->
          <template v-else>
            <SensitiveAreaBatchCard
              :drafts="drafts ?? []"
              @saved="handleSaved"
              @remove="handleRemove"
              @goto-board="close"
            />
          </template>
        </div>

        <!-- 底部操作 -->
        <div class="flex items-center justify-between gap-3 border-t border-[#e7e7e3] bg-[#fbfbfa] px-5 py-3">
          <p class="text-[11px] text-slate-400">
            <template v-if="!isReviewing && preview && preview.usable > 0">
              已识别 {{ preview.usable }} 个点位<template v-if="preview.rejected + preview.duplicate > 0">
                · {{ preview.rejected + preview.duplicate }} 行无法识别</template>
            </template>
            <template v-else-if="!isReviewing">尚未识别到点位</template>
            <template v-else>共 {{ drafts?.length ?? 0 }} 条待核对</template>
          </p>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="rounded-md border border-[#e3e3df] bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-[#f2f2ef] hover:text-slate-900"
              @click="isReviewing ? backToInput() : close()"
            >
              {{ isReviewing ? '返回修改' : '取消' }}
            </button>
            <button
              v-if="!isReviewing"
              type="button"
              class="rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              :disabled="!preview || preview.usable === 0"
              @click="handleParse"
            >
              识别点位
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
