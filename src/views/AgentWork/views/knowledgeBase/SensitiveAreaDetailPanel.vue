<script lang="ts" setup>
import { computed } from 'vue';

import { ElMessage, ElMessageBox } from 'element-plus';

import { AREA_SOURCE_LABEL, AREA_TYPE_LABEL, RISK_COLOR, RISK_LABEL, areaDisplayName, formatRadius } from './mockData';
import { deleteSensitiveArea } from './sensitiveAreaStore';
import type { AreaLineRef } from './lineSensitiveStats';
import type { SensitiveArea } from './mockData';

const props = defineProps<{
  area: SensitiveArea;
  /** 途经该点位并产生停靠的线路（仅市到市维度，由父级过滤） */
  lineRefs: AreaLineRef[];
}>();

const emit = defineEmits<{
  back: [];
  edit: [];
  deleted: [];
  /**
   * @deprecated 路线视角已下线，「途经线路明细」整块已删，此事件当前无触发点。
   * 保留签名是为了路线能力恢复时不用改父子接口。
   */
  openLine: [lineId: string];
  /** 「查看对应车辆」→ 父级切运单视角 + 按车辆归并 + 以本点位名检索 */
  viewVehicles: [areaId: string];
  /** 「查看对应运单」→ 父级切运单视角 + 以本点位名检索 */
  viewWaybills: [areaId: string];
}>();

const isAi = computed(() => props.area.source === 'ai');

// ruleText / thresholdText 两个 computed 已删：对应的「识别规则」「判定阈值」两行
// 按航哥 20261123 要求整体下线，留着就是无人消费的死代码。DISCOVERY_RULES 导入一并移除。

// 确认 / 忽略机制已整体下线（航哥 20261123）：点位入库即生效，
// 面板只保留「编辑」与「彻底删除」两个操作，不再有状态流转。

async function handleDelete() {
  try {
    await ElMessageBox.confirm(
      `将彻底删除「${areaDisplayName(props.area)}」，删除后不可恢复。`,
      '彻底删除敏感区域',
      { type: 'warning', confirmButtonText: '彻底删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  deleteSensitiveArea(props.area.id);
  ElMessage.success(`已彻底删除「${areaDisplayName(props.area)}」`);
  emit('deleted');
}

</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- 头部 -->
    <div class="shrink-0 border-b border-[#eeeeec] px-3 py-2.5">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-6 shrink-0 items-center gap-1 rounded-md border border-[#e3e3df] bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-[#f2f2ef] hover:text-slate-900"
          @click="emit('back')"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          列表
        </button>
        <!-- 无名点位显示地址（航哥 20261123），与列表/浮窗口径一致 -->
        <p class="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-900" :title="areaDisplayName(area)">{{ areaDisplayName(area) }}</p>
      </div>
      <div class="mt-1.5 flex flex-wrap items-center gap-1">
        <span
          class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          :style="isAi
            ? { background: '#f5f3ff', color: '#6d28d9' }
            : { background: '#f5f3ff', color: '#6d28d9' }"
        >{{ AREA_SOURCE_LABEL[area.source] }}</span>
        <!-- 风险等级徽标：只有 AI识别 有（人工发现不定级） -->
        <span
          v-if="isAi && area.riskLevel"
          class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          :style="{ background: RISK_COLOR[area.riskLevel] + '1a', color: RISK_COLOR[area.riskLevel] }"
        >{{ RISK_LABEL[area.riskLevel] }}</span>
        <span class="rounded bg-[#f2f2ef] px-1.5 py-0.5 text-[10px] text-slate-600">半径 {{ formatRadius(area.radiusM) }}</span>
      </div>

      <!-- 核心指标：均为「该点位」口径，全面板唯一，不做跨线路加总 -->
      <!-- 核心指标从三格改两格：**「途经线路」已删**（路线视角下线，路线相关信息统一清理，航哥 20261123） -->
      <div class="mt-2 grid grid-cols-2 gap-1.5">
        <div class="rounded-md border border-[#f0e2e2] bg-[#fdf8f8] px-2 py-1.5">
          <p class="text-[10px] text-slate-500">异常停靠运单</p>
          <p class="text-[15px] font-semibold leading-5 text-red-700">{{ area.discovery.waybillCount }} 单</p>
        </div>
        <div class="rounded-md border border-[#e9e9e5] bg-[#fbfbfa] px-2 py-1.5">
          <p class="text-[10px] text-slate-500">涉及车辆</p>
          <p class="text-[15px] font-semibold leading-5 text-slate-900">{{ area.discovery.vehicleCount }} 辆</p>
        </div>
      </div>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
      <!--
        「途经线路明细」整块已删（航哥 20261123：「所有和路线相关的信息，该去掉的全都去掉，咱们要保持统一」）。
        原来的下钻路径（点位 → 途经哪些线路 → 定位线路）随路线视角一起下线，
        替代路径是下面这两个链接：点位 → 在该点停靠过的**车辆 / 运单**明细。
        lineRefs prop 与 openLine emit 保留在接口上（父层仍在传），路线能力恢复时可直接复用。
      -->

      <!-- 识别信息。**「识别规则」「判定阈值」两行已删**（航哥 20261123：「识别规则和判定阈值这块，
           我们都拿掉吧」）；**「停留阈值」保留**（同一段话里他先说拿掉、随后明确纠正「那个停留阈值不去掉」）。
           本面板当前已无入口（详情入口整体撤销），但字段口径必须与浮窗保持一致，恢复时才不会出现两套。 -->
      <section>
        <p class="mb-1.5 text-xs font-semibold text-slate-900">识别信息</p>
        <div class="rounded-md border border-[#e9e9e5] bg-[#fbfbfa] px-2.5 py-2">
          <dl class="space-y-1.5 text-[11px]">
            <div class="flex gap-2">
              <dt class="w-[68px] shrink-0 text-slate-400">风险等级</dt>
              <dd class="min-w-0 flex-1">
                <span
                  v-if="isAi && area.riskLevel"
                  class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  :style="{ background: RISK_COLOR[area.riskLevel] + '1a', color: RISK_COLOR[area.riskLevel] }"
                >{{ RISK_LABEL[area.riskLevel] }}</span>
                <span v-else class="text-slate-500">人工发现点位暂不定级</span>
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-[68px] shrink-0 text-slate-400">POI类型</dt>
              <dd class="min-w-0 flex-1 text-slate-700">{{ AREA_TYPE_LABEL[area.areaType] }}</dd>
            </div>
            <div class="flex gap-2">
              <!-- 「停留阈值」已删（航哥 20261124：所有停留阈值都去掉），与浮窗口径保持一致 -->
            </div>
          </dl>
        </div>
      </section>

      <!-- 下钻入口：**只留「查看对应运单」**（航哥 20261123：「你只留查看对应运单就行」）。
           「查看对应车辆」与按车辆归并视图的代码保留但已无任何入口。 -->
      <section>
        <p class="mb-1.5 text-xs font-semibold text-slate-900">关联明细</p>
        <div class="grid grid-cols-1 gap-1.5">
          <button
            type="button"
            class="rounded-md border border-[#e3e3df] bg-white px-2 py-2 text-[11px] font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-800"
            @click="emit('viewWaybills', area.id)"
          >查看对应运单</button>
        </div>
        <p class="mt-1 text-[10px] leading-4 text-slate-400">
          点击后右侧列表切到运单视角，并自动以本点位名检索出在此有过异常停靠的运单
        </p>
      </section>

      <!-- 溯源区块（数据来源 / 命中规则或录入方式 / 运单样例）已整块下线（航哥 20261123）。
           discovery 字段在数据层全部保留：异常停靠运单数与涉及车辆数仍取自 discovery.waybillCount /
           vehicleCount（头部三格条），batch / rule / threshold / sampleWaybills 只是不再向用户展示。
           运单号查证改走「运单」视角（可按点位名 / 车牌 / 运单号检索到具体单据）。 -->

      <!-- 基础信息 -->
      <section>
        <p class="mb-1.5 text-xs font-semibold text-slate-900">点位信息</p>
        <div class="rounded-md border border-[#e9e9e5] bg-[#fbfbfa] px-2.5 py-2">
          <dl class="space-y-1.5 text-[11px]">
            <div class="flex gap-2">
              <dt class="w-[68px] shrink-0 text-slate-400">经纬度</dt>
              <dd class="min-w-0 flex-1 font-mono text-slate-700">{{ area.lng.toFixed(6) }}, {{ area.lat.toFixed(6) }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-[68px] shrink-0 text-slate-400">详细地址</dt>
              <dd class="min-w-0 flex-1 text-slate-700">{{ area.address }}</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-[68px] shrink-0 text-slate-400">{{ isAi ? '发现时间' : '录入时间' }}</dt>
              <dd class="min-w-0 flex-1 text-slate-700">{{ area.createdAt }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>

    <!-- 操作区 -->
    <div class="shrink-0 border-t border-[#eeeeec] bg-[#fbfbfa] px-3 py-2.5">
      <div class="flex items-center justify-between gap-2">
        <button
          type="button"
          class="text-[11px] text-red-600 transition hover:text-red-700"
          @click="handleDelete"
        >
          彻底删除
        </button>
        <button
          type="button"
          class="h-8 rounded border border-[#deded9] bg-white px-3.5 text-xs font-medium text-slate-700 transition hover:bg-[#f0f0ed]"
          @click="emit('edit')"
        >
          编辑
        </button>
      </div>
    </div>
  </div>
</template>
