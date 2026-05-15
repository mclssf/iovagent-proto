<script lang="ts" setup>
import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';

const { goPage, createDownload } = useAgentWorkNav();
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Icon :svg="strokeIconPaths.file" :size="18" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-slate-900">每日在途异常报告</h1>
            <p class="mt-1 text-sm text-slate-500">2026-05-09 · 华东干线在途监控</p>
          </div>
        </div>
        <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm text-white" @click="createDownload('今日报告异常明细')">下载明细</button>
      </div>
      <div class="mb-5 grid grid-cols-4 gap-3">
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">全部运单</div>
          <div class="mt-1 text-2xl font-semibold text-slate-900">128</div>
        </div>
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">异常运单</div>
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
      </div>
      <div class="space-y-3 text-sm text-slate-700">
        <div class="rounded-md bg-slate-50 p-4">
          <b>核心结论：</b>今日异常率 13.3%，较昨日上升 2.1 个百分点，主要集中在安捷物流和上海工厂 → 广州仓线路。
        </div>
        <div class="rounded-md bg-slate-50 p-4"><b>风险建议：</b>优先复核 2 单非目的地物流园异常停车，关注 GPS 高风险轨迹段。</div>
        <div class="rounded-md bg-slate-50 p-4"><b>阈值建议：</b>服务区停车误报较多，可单独评估长途线路停车阈值。</div>
      </div>
      <div class="mt-6 flex gap-3">
        <button type="button" class="rounded-md border border-slate-200 px-4 py-2 text-sm" @click="goPage('risk')">查看异常运单</button>
        <button type="button" class="rounded-md border border-slate-200 px-4 py-2 text-sm" @click="goPage('orders')">查看全部运单</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
