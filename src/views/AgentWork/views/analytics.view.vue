<script lang="ts" setup>
import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';

const { goPage } = useAgentWorkNav();
</script>

<template>
  <div class="flex h-full flex-col space-y-4 overflow-y-auto">
    <div class="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-5 flex items-start gap-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Icon :svg="strokeIconPaths.gauge" :size="18" />
        </div>
        <div>
          <h1 class="text-xl font-semibold text-slate-900">统计归因</h1>
          <p class="mt-1 text-sm text-slate-500">按时间、承运商、线路、工厂和风险来源分析异常变化</p>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3">
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">今日异常</div>
          <div class="mt-1 text-2xl font-semibold text-red-600">17</div>
        </div>
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">高风险</div>
          <div class="mt-1 text-2xl font-semibold text-red-600">6</div>
        </div>
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">低风险</div>
          <div class="mt-1 text-2xl font-semibold text-orange-600">11</div>
        </div>
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">异常率</div>
          <div class="mt-1 text-2xl font-semibold text-slate-900">13.3%</div>
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-4 font-semibold">异常趋势</div>
        <div class="flex h-60 items-end gap-3 rounded-md bg-slate-50 p-4">
          <div v-for="(barH, i) in [8, 12, 9, 15, 17, 13, 20]" :key="i" class="flex flex-1 flex-col items-center gap-2">
            <div class="w-full rounded-t bg-slate-900" :style="{ height: `${barH * 7}px` }"></div>
            <span class="text-xs text-slate-400">D{{ i + 1 }}</span>
          </div>
        </div>
      </div>
      <div class="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-4 font-semibold">异常归因</div>
        <div class="space-y-3 text-sm text-slate-600">
          <div class="rounded-md bg-red-50 p-3 text-red-700">安捷物流异常增量占比 42%，高于项目平均水平。</div>
          <div class="rounded-md bg-orange-50 p-3 text-orange-700">上海工厂 → 广州仓线路服务区长停增加。</div>
          <div class="rounded-md bg-slate-50 p-3">异常数量和异常率同步上升，非单纯运单量增加导致。</div>
          <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm text-white" @click="goPage('risk')">查看异常运单</button>
        </div>
      </div>
    </div>
    <div class="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div class="mb-3 font-semibold">承运商异常排名</div>
      <div class="space-y-3">
        <div v-for="(carrierName, index) in ['安捷物流', '远恒运输', '顺达货运', '中联物流']" :key="carrierName" class="flex items-center gap-3">
          <div class="w-20 text-sm text-slate-600">
            {{ carrierName }}
          </div>
          <div class="h-3 flex-1 rounded-full bg-slate-100">
            <div class="h-3 rounded-full bg-slate-900" :style="{ width: `${76 - index * 14}%` }"></div>
          </div>
          <div class="w-10 text-right text-sm font-medium">
            {{ 17 - index * 3 }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
