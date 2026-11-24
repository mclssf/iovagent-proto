<script lang="ts" setup>
import { computed } from 'vue';

import { ElMessage } from 'element-plus';

import SensitiveAreaConfirmCard from './SensitiveAreaConfirmCard.vue';
import { AREA_SOURCE_LABEL, AREA_TYPE_LABEL, RISK_COLOR, RISK_LABEL, areaDisplayName, clampAreaName } from './mockData';
import type { AreaType, SensitiveArea } from './mockData';
import { updateSensitiveArea } from './sensitiveAreaStore';
import type { SensitiveAreaDraft } from '../../interface';

/**
 * 编辑敏感区域弹窗（航哥 20261124）。
 *
 * 原话：「如果是列表中已经录入成功的项，从列表中点击编辑，我认为也可以直接给它一个弹窗。
 * 这个弹窗也可以点击，也可以用和之前录入时一样的那种方式。」
 *
 * **刻意复用录入链路的 `SensitiveAreaConfirmCard`，而不是另写一套编辑表单**：
 *   ① 那张卡自带 Leaflet 小地图，**点击地图即可改坐标** —— 这正是"调整位置"要的能力，
 *      而原来右栏内联编辑面板只能改名称/半径/备注，坐标是只读的，还得跳去别处改；
 *   ② 录入与编辑共用同一张卡 → 两条路径的字段、校验、交互天然一致，不会各自漂移
 *      （内联面板时期就已经出现过"编辑面板有字数计数、录入卡没有"这类不一致）；
 *   ③ 少一套表单要维护。
 * 通过 `mode="edit"` 只切换文案（「确认入库」→「保存修改」），字段与行为完全一致。
 *
 * ⚠️ **只有「人工发现」点位能进这里**：调用方 `startEditArea()` 已按来源拦截，
 * 本组件再兜一层（AI 点位由中台按月更新，前台改了下次跑批就被覆盖，等于给假承诺）。
 */
const props = defineProps<{ area: SensitiveArea | null }>();

const emit = defineEmits<{
  close: [];
}>();

const editable = computed(() => props.area !== null && props.area.source === 'manual');

/**
 * 把库里的点位还原成一张草稿卡。
 *
 * ⚠️ `resolveState` 必须是 `'pending'`：ConfirmCard 用 `resolveState !== 'pending'` 判定只读，
 * 传 'confirmed' 会让整张卡变成灰的不可编辑态。这里不是"待确认入库"的语义，
 * 只是借用它作为"可编辑"开关——这是复用组件的代价，务必注释清楚，否则后人会以为改错了。
 * ⚠️ `remark` ← `area.evidence`：界面上统一叫「备注」，底层字段名仍是 evidence（既有约定）。
 */
const draft = computed<SensitiveAreaDraft | null>(() => {
  const area = props.area;
  if (!area || area.source !== 'manual') return null;
  return {
    id: `edit-${area.id}`,
    name: area.name,
    lat: area.lat,
    lng: area.lng,
    radiusM: area.radiusM,
    areaType: area.areaType,
    // 停留阈值已改为全局统一、界面不可编辑（航哥 20261124 结论8），
    // 但字段仍原样带进带出，避免保存一次就把后端要用的值抹成 undefined
    stayThresholdMin: area.stayThresholdMin,
    region: area.region,
    address: area.address,
    remark: area.evidence,
    resolveState: 'pending',
    rawInput: '',
    origin: 'text',
  };
});

function handleConfirm(payload: {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  areaType: AreaType;
  stayThresholdMin: number;
  remark: string;
}) {
  const area = props.area;
  if (!area || area.source !== 'manual') return;

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
  // 并在半径/坐标/类型变化时重算碰撞量，所以这里只负责把改动交出去
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
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="editable && draft"
      class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-6"
      role="presentation"
      @click.self="emit('close')"
    >
      <div
        class="flex max-h-[88vh] w-full max-w-[420px] flex-col overflow-hidden rounded-lg bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24),0_4px_16px_rgba(15,23,42,0.08)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="area-edit-title"
      >
        <!-- 头部：标题 + 来源/风险/类型徽标（沿用原内联编辑面板的口径） -->
        <div class="flex shrink-0 items-start justify-between gap-3 border-b border-[#e7e7e3] px-4 py-3">
          <div class="min-w-0">
            <h2 id="area-edit-title" class="truncate text-[15px] font-semibold leading-6 text-slate-950">编辑敏感区域</h2>
            <div class="mt-1.5 flex flex-wrap items-center gap-1">
              <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold" style="background:#f5f3ff;color:#6d28d9">
                {{ AREA_SOURCE_LABEL[area!.source] }}
              </span>
              <span
                v-if="area!.source === 'ai' && area!.riskLevel"
                class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                :style="{ background: RISK_COLOR[area!.riskLevel] + '1a', color: RISK_COLOR[area!.riskLevel] }"
              >{{ RISK_LABEL[area!.riskLevel] }}</span>
              <span class="rounded bg-[#f2f2ef] px-1.5 py-0.5 text-[10px] text-slate-600">
                {{ AREA_TYPE_LABEL[area!.areaType] }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#f2f2ef] hover:text-slate-700"
            aria-label="关闭"
            @click="emit('close')"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </div>

        <!-- 卡片：与录入核对时同一张，compact 隐藏它自己的头部避免标题重复 -->
        <div class="min-h-0 flex-1 overflow-y-auto bg-white">
          <SensitiveAreaConfirmCard
            :draft="draft"
            :mode="'edit'"
            compact
            @confirm="handleConfirm"
            @cancel="emit('close')"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
