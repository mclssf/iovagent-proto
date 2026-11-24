<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import { ElMessage } from 'element-plus';

import SensitiveAreaBatchCard from './SensitiveAreaBatchCard.vue';
import SensitiveAreaConfirmCard from './SensitiveAreaConfirmCard.vue';
import {
  AREA_SOURCE_LABEL,
  AREA_TYPE_LABEL,
  areaDisplayName,
  clampAreaName,
} from './mockData';
// ⚠️ 解析函数在 sensitiveAreaIntake，不在 mockData —— 两个模块都导出同名风格的东西，容易记混
import { draftsFromText, summarizeDrafts } from './sensitiveAreaIntake';
import { updateSensitiveArea } from './sensitiveAreaStore';
import type { AreaType, SensitiveArea } from './mockData';
import type { SensitiveAreaDraft } from '../../interface';

/**
 * 敏感区域**通用表单弹窗**：一个壳同时承载「录入」与「编辑」（航哥 20261124）。
 *
 * 原话：「他点击列表里的"编辑"时，不也是同样使用那个弹窗吗？如果使用这个弹窗的话，
 * 你看看能不能把那个弹窗做得稍微通用一点，属于比较通用的弹窗，既能够承载录入，也能够承载编辑。」
 *
 * ## 为什么必须是一个组件而不是两个
 * 录入与编辑的**主体是同一张卡**（`SensitiveAreaConfirmCard`：小地图点选 + 名称 + 经纬度 + 半径 + 备注）。
 * 拆成两个弹窗就会出现两套壳、两套头部、两套关闭逻辑，字段与校验迟早各自漂移——
 * 内联编辑面板时期就已经出现过"编辑面板有 30 字计数、录入卡没有"这类不一致。
 * 合并后**能力天然对齐**：编辑也能在地图上点选调位置（原内联面板坐标是只读的，做不到）。
 *
 * ## 两种模式的差异只有"主体区渲染什么"
 * - `create`：两步 —— ① 粘贴/输入文本 → ② `SensitiveAreaBatchCard` 批量核对（可逐条改）→ 入库
 * - `edit`  ：一步 —— 直接一张 `SensitiveAreaConfirmCard`（`mode="edit"`）→ 保存修改
 * 壳（遮罩 / 面板 / 头部标题 / 关闭按钮 / 滚动区）完全共用。
 *
 * ⚠️ **编辑模式只接受「人工发现」点位**：AI 点位由中台按月统一更新，前台改了下次跑批就被覆盖，
 * 等于给客户一个"改了会丢"的假承诺。调用方 `startEditArea()` 已按来源拦截，这里再兜一层。
 */
const props = defineProps<{
  modelValue: boolean;
  /** create = 录入新点位；edit = 编辑已入库点位 */
  mode: 'create' | 'edit';
  /** edit 模式下要编辑的点位；create 模式忽略 */
  area?: SensitiveArea | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [visible: boolean];
  /** 录入模式入库完成（编辑模式走 update:modelValue 关闭即可，父级自己知道改了谁） */
  saved: [payload: { created: number; updated: number; names: string[] }];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const isEdit = computed(() => props.mode === 'edit');
/** 编辑态必须是「人工发现」点位才允许打开（AI 点位不可编辑，见组件头注释） */
const editArea = computed<SensitiveArea | null>(() =>
  isEdit.value && props.area && props.area.source === 'manual' ? props.area : null,
);

/* ============================================================
 * 录入模式（create）状态
 * ============================================================ */
const SINGLE_EXAMPLE = `98.123456, 40.123456 甘肃省酒泉市玉门市示范镇，半径300米`;

// ⚠️ 示例里不出现「停留15分钟以上算异常」——停留阈值已改为全局统一、界面不可填
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
 * 实时预估（"边打边看"）：可用条数与无法识别条数**分开报**。
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

function handleBatchSaved(payload: { created: number; updated: number; names: string[] }) {
  ElMessage.success(
    `敏感区域已入库：新增 ${payload.created} 个${payload.updated > 0 ? `，更新 ${payload.updated} 个` : ''}`,
  );
  emit('saved', payload);
  close();
}

/* ============================================================
 * 编辑模式（edit）状态
 * ============================================================ */
/**
 * 把库里的点位还原成一张草稿卡喂给 ConfirmCard。
 *
 * ⚠️ `resolveState` 必须是 `'pending'`：ConfirmCard 用 `resolveState !== 'pending'` 判定只读，
 * 传 'confirmed' 会让整张卡变灰不可编辑。这里**不是**"待确认入库"的语义，只是借用它当"可编辑"开关
 * ——这是复用组件的代价，必须注释清楚，否则后人会以为是写错了。
 * ⚠️ `remark` ← `area.evidence`：界面上统一叫「备注」，底层字段名仍是 evidence（既有约定）。
 * ⚠️ `id` 加 `edit-` 前缀，避免与录入草稿的 id 空间混淆。
 */
const editDraft = computed<SensitiveAreaDraft | null>(() => {
  const area = editArea.value;
  if (!area) return null;
  return {
    id: `edit-${area.id}`,
    name: area.name,
    lat: area.lat,
    lng: area.lng,
    radiusM: area.radiusM,
    areaType: area.areaType,
    // 停留阈值界面已不可编辑（结论8：全局统一），但字段仍原样带进带出，
    // 否则保存一次就把后端要用的值抹成 undefined
    stayThresholdMin: area.stayThresholdMin,
    region: area.region,
    address: area.address,
    remark: area.evidence,
    resolveState: 'pending',
    rawInput: '',
    origin: 'text',
  };
});

function handleEditConfirm(payload: {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  areaType: AreaType;
  stayThresholdMin: number;
  remark: string;
}) {
  const area = editArea.value;
  if (!area) return;

  // maxlength 只拦键盘输入，粘贴/脚本改状态都可能绕过 → 落库前再 clamp 一次。
  // 名称允许留空：无名点位是合法状态，列表与浮窗会自动回退显示地址。
  const name = clampAreaName(payload.name);
  if (!(payload.radiusM >= 50) || !(payload.radiusM <= 20000)) {
    ElMessage.warning('半径需在 50–20000 米之间');
    return;
  }
  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
    ElMessage.warning('经纬度不合法，请在地图上重新点选');
    return;
  }

  // store 内部会在坐标变化时重算逆地理（region/address），
  // 并在半径/坐标/类型变化时重算碰撞量，这里只负责把改动交出去
  updateSensitiveArea(area.id, {
    name,
    lat: payload.lat,
    lng: payload.lng,
    radiusM: payload.radiusM,
    areaType: payload.areaType,
    stayThresholdMin: payload.stayThresholdMin,
    evidence: payload.remark.trim(),
  });
  ElMessage.success(`已保存「${areaDisplayName({ ...area, name })}」的修改`);
  close();
}

/* ============================================================ */
function close() {
  visible.value = false;
}

// 每次打开都回到干净状态：录入模式回到输入步（保留上次文本，避免误关丢内容），
// 编辑模式清掉上一次的错误提示
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
      v-if="visible && (!isEdit || editDraft)"
      class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-6"
      role="presentation"
      @click.self="close"
    >
      <!--
        编辑弹窗 420 → 640（航哥 20261124：「可以大一点、宽一点…主要核心还是要宽一点」）。
        高度不动（max-h-[88vh] 已经够），只放宽度：420px 下地图只有巴掌大，
        点选调位置时看不清周边路网，等于白给这个能力。
        ⚠️ 这段说明必须写在标签**外面**：标签内的属性区不认 `//` 注释，
        会被当成属性名解析，直接编译报错。
      -->
      <div
        class="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-lg bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24),0_4px_16px_rgba(15,23,42,0.08)]"
        :class="isEdit ? 'max-w-[640px]' : 'max-w-[760px]'"
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-form-title"
      >
        <!-- ===== 共用头部 ===== -->
        <div class="flex shrink-0 items-start justify-between gap-4 border-b border-[#e7e7e3] px-5 py-4">
          <div class="min-w-0">
            <h2 id="area-form-title" class="text-base font-semibold leading-6 text-slate-950">
              {{ isEdit ? '编辑敏感区域' : '录入敏感区域点位' }}
            </h2>
            <p class="mt-1 text-xs leading-5 text-slate-500">
              <template v-if="isEdit">可改名称、在地图上点选调整位置、调半径与备注；保存后立即生效</template>
              <template v-else-if="isReviewing">核对识别结果，可改名称 / 地图点选调整位置 / 调半径，逐个确认或一键全部入库</template>
              <template v-else>粘贴或输入点位信息，系统自动识别后进入核对；来源标记为「人工发现」</template>
            </p>
            <!--
              编辑态徽标：来源 + POI 类型，两者都是**只读事实**，在此弹窗里不可改。
              ⚠️ 这里**故意不渲染风险等级徽标**：`editArea` computed 已把来源限定为 manual，
              AI 点位根本进不到这个弹窗，写 `v-if="editArea.source === 'ai'"` 是永不成立的死分支。
              （风险等级只对 AI 点位有意义，见 mockData 的 riskLevel 口径。）
            -->
            <div v-if="isEdit && editArea" class="mt-1.5 flex flex-wrap items-center gap-1">
              <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold" style="background:#f5f3ff;color:#6d28d9">
                {{ AREA_SOURCE_LABEL[editArea.source] }}
              </span>
              <span class="rounded bg-[#f2f2ef] px-1.5 py-0.5 text-[10px] text-slate-600">
                {{ AREA_TYPE_LABEL[editArea.areaType] }}
              </span>
            </div>
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

        <!-- ===== 主体区：三种形态共用一个滚动容器 ===== -->
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4" :class="isEdit ? '!px-0 !py-0' : ''">
          <!-- 形态 A：编辑单点（一张卡，自带地图点选） -->
          <SensitiveAreaConfirmCard
            v-if="isEdit && editDraft"
            :key="editDraft.id"
            :draft="editDraft"
            mode="edit"
            compact
            @confirm="handleEditConfirm"
            @cancel="close"
          />

          <!-- 形态 B：录入第一步（输入文本） -->
          <template v-else-if="!isReviewing">
            <div class="mb-2 flex items-center justify-between gap-3">
              <label for="area-form-text" class="text-xs font-medium text-slate-700">点位信息</label>
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
              id="area-form-text"
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

          <!-- 形态 C：录入第二步（批量核对，复用对话内嵌的同一张批量卡） -->
          <SensitiveAreaBatchCard
            v-else
            :drafts="drafts ?? []"
            @saved="handleBatchSaved"
            @remove="handleRemove"
            @goto-board="close"
          />
        </div>

        <!-- ===== 底部操作条：编辑模式由卡片自带按钮，这里只服务录入模式 ===== -->
        <div v-if="!isEdit" class="flex shrink-0 items-center justify-between gap-3 border-t border-[#e7e7e3] bg-[#fbfbfa] px-5 py-3">
          <p class="text-[11px] text-slate-400">
            <template v-if="!isReviewing && preview && preview.usable > 0">
              已识别 {{ preview.usable }} 个点位<template v-if="preview.rejected + preview.duplicate > 0">
                · {{ preview.rejected + preview.duplicate }} 行无法识别</template>
            </template>
            <template v-else-if="!isReviewing">尚未识别到点位</template>
            <template v-else>共 {{ drafts?.length ?? 0 }} 条待核对</template>
          </p>
          <div class="flex shrink-0 items-center gap-2">
            <!--
              录入底栏的关闭按钮同样叫「不入库」（航哥 20261124：「取消」→「不入库」）。
              ⚠️ 同一个弹窗里第一步叫「取消」、第二步叫「不入库」，正是他要消除的那种歧义——
              客户点「取消」会以为只是关掉窗口、下次打开数据还在；叫「不入库」才是真实语义。
              这个底栏整体在 `v-if="!isEdit"` 内，**只在录入模式出现**，所以改名不会波及编辑态
              （编辑态的放弃按钮仍叫「取消」，语义是"不保存这次修改"，与入不入库无关）。
            -->
            <button
              type="button"
              class="rounded-md border border-[#e3e3df] bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-[#f2f2ef] hover:text-slate-900"
              @click="isReviewing ? backToInput() : close()"
            >
              {{ isReviewing ? '返回修改' : '不入库' }}
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
