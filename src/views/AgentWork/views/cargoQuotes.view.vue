<script lang="ts" setup>
import type { CargoQuote } from '../interface';

import { computed, watch } from 'vue';

import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';

const store = agentWorkData();
const {
  quoteEndDate,
  quoteKeyword,
  quotePage,
  quotePageSize,
  quotePlatformFilter,
  quoteStartDate,
  quoteStatusFilter,
  quoteTypeFilter,
} = storeToRefs(store);

const pendingCount = computed(() => store.cargoQuotesFiltered.filter((quote) => quote.status === '待处理').length);
const quoteCount = computed(() => store.cargoQuotesFiltered.filter((quote) => quote.type === '报价').length);
const orderCount = computed(() => store.cargoQuotesFiltered.filter((quote) => quote.type === '抢单').length);
const phoneCount = computed(() => store.cargoQuotesFiltered.filter((quote) => quote.type === '电话联系').length);
const quotePageStart = computed(() => (store.cargoQuotesFiltered.length ? (quotePage.value - 1) * quotePageSize.value + 1 : 0));
const quotePageEnd = computed(() => Math.min(quotePage.value * quotePageSize.value, store.cargoQuotesFiltered.length));

function cargoById(cargoId: string) {
  return store.cargoSources.find((cargo) => cargo.id === cargoId);
}

function formatMoney(fen?: number) {
  return fen ? `¥${(fen / 100).toLocaleString('zh-CN')}` : '未报价';
}

function quoteStatusClass(status: CargoQuote['status']) {
  if (status === '待处理') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === '已合作') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === '已联系') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-[#deded9] bg-[#f7f7f5] text-slate-500';
}

watch([quoteStartDate, quoteEndDate, quoteTypeFilter, quotePlatformFilter, quoteStatusFilter, quoteKeyword, quotePageSize], () => {
  quotePage.value = 1;
});

watch(
  () => store.quoteTotalPages,
  (totalPages) => {
    if (quotePage.value > totalPages) quotePage.value = totalPages;
  },
);
</script>

<template>
  <div class="flex h-full flex-col gap-3">
    <section class="overflow-hidden rounded-md border border-[#deded9] bg-white">
      <header class="flex min-h-12 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4 py-2">
        <div class="flex items-center gap-2.5">
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.receipt" :size="16" />
          </span>
          <div>
            <h1 class="text-sm font-semibold leading-5 text-slate-950">报价抢单</h1>
            <p class="text-xs leading-4 text-slate-400">查询大卡与满帮的抢单、报价及电话联系反馈</p>
          </div>
        </div>
        <span class="rounded-md border border-[#deded9] bg-[#f7f7f5] px-3 py-1.5 text-xs text-slate-500">每 2 分钟自动同步平台反馈</span>
      </header>
      <div class="grid grid-cols-4 divide-x divide-[#ededea]">
        <div class="px-4 py-3"><div class="text-xs text-slate-500">待处理</div><div class="mt-1 text-xl font-semibold text-amber-600">{{ pendingCount }}</div></div>
        <div class="px-4 py-3"><div class="text-xs text-slate-500">司机报价</div><div class="mt-1 text-xl font-semibold text-slate-950">{{ quoteCount }}</div></div>
        <div class="px-4 py-3"><div class="text-xs text-slate-500">司机抢单</div><div class="mt-1 text-xl font-semibold text-slate-950">{{ orderCount }}</div></div>
        <div class="px-4 py-3"><div class="text-xs text-slate-500">电话联系</div><div class="mt-1 text-xl font-semibold text-slate-950">{{ phoneCount }}</div></div>
      </div>
    </section>

    <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex shrink-0 flex-wrap items-end gap-3 border-b border-[#e2e2dc] p-3">
        <label class="text-xs text-slate-500">
          <span class="mb-1 block">反馈时间</span>
          <div class="flex h-9 items-center gap-2 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
            <input v-model="quoteStartDate" type="date" :max="quoteEndDate || undefined" class="w-[126px] bg-transparent text-sm text-slate-700 outline-none" />
            <span class="text-slate-300">至</span>
            <input v-model="quoteEndDate" type="date" :min="quoteStartDate || undefined" class="w-[126px] bg-transparent text-sm text-slate-700 outline-none" />
          </div>
        </label>
        <label class="text-xs text-slate-500"><span class="mb-1 block">反馈类型</span><select v-model="quoteTypeFilter" class="h-9 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm text-slate-700 outline-none"><option>全部</option><option>报价</option><option>抢单</option><option>电话联系</option></select></label>
        <label class="text-xs text-slate-500"><span class="mb-1 block">来源平台</span><select v-model="quotePlatformFilter" class="h-9 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm text-slate-700 outline-none"><option>全部</option><option>大卡</option><option>满帮</option></select></label>
        <label class="text-xs text-slate-500"><span class="mb-1 block">处理状态</span><select v-model="quoteStatusFilter" class="h-9 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm text-slate-700 outline-none"><option>全部</option><option>待处理</option><option>已联系</option><option>已合作</option><option>已忽略</option></select></label>
        <label class="min-w-[280px] flex-1 text-xs text-slate-500">
          <span class="mb-1 block">搜索</span>
          <span class="flex items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
            <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
            <input v-model="quoteKeyword" class="h-9 w-full bg-transparent px-2 text-sm outline-none" placeholder="货源 ID / 货物 / 司机 / 车牌 / 所在地" />
          </span>
        </label>
        <button type="button" class="h-9 rounded-md border border-[#deded9] px-3 text-xs text-slate-600 hover:bg-[#f7f7f5]" @click="store.resetQuoteFilters">重置</button>
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <table class="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead class="sticky top-0 z-10 bg-[#f7f7f5] text-xs font-semibold text-slate-500">
            <tr>
              <th class="px-4 py-3">关联货源</th>
              <th class="px-4 py-3">司机与车辆</th>
              <th class="px-4 py-3">反馈</th>
              <th class="px-4 py-3">位置</th>
              <th class="px-4 py-3">平台画像</th>
              <th class="px-4 py-3">近期合作</th>
              <th class="w-[230px] px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#ededea]">
            <tr v-for="quote in store.cargoQuotesPaginated" :key="quote.id" class="align-top hover:bg-[#fafaf8]">
              <td class="px-4 py-4">
                <div class="font-semibold text-slate-900">{{ cargoById(quote.cargoId)?.cargoName || quote.cargoId }}</div>
                <div class="mt-1 text-xs text-slate-400">{{ quote.cargoId }} · {{ cargoById(quote.cargoId)?.status || '货源已归档' }}</div>
                <div class="mt-1 max-w-[220px] truncate text-xs text-slate-500">
                  {{ cargoById(quote.cargoId)?.loadAddresses[0]?.city }} → {{ cargoById(quote.cargoId)?.unloadAddresses[0]?.city }}
                </div>
              </td>
              <td class="px-4 py-4">
                <div class="font-semibold text-slate-900">{{ quote.driverName }} <span class="ml-1 text-xs font-normal text-slate-400">{{ quote.driverPhone }}</span></div>
                <div class="mt-1 text-slate-700">{{ quote.truckNo }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ quote.truckType }} · {{ quote.truckLength }}</div>
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-2">
                  <span class="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{{ quote.sourcePlatform }} · {{ quote.type }}</span>
                  <span class="rounded border px-1.5 py-0.5 text-[11px]" :class="quoteStatusClass(quote.status)">{{ quote.status }}</span>
                </div>
                <div class="mt-2 text-base font-semibold text-slate-950">{{ formatMoney(quote.amountFen) }}</div>
                <div class="mt-1 text-xs text-slate-400">{{ quote.createdAt }}</div>
              </td>
              <td class="px-4 py-4">
                <div class="font-medium text-slate-800">{{ quote.location }}</div>
                <div class="mt-1 text-xs text-slate-500">距装货地约 {{ quote.distanceKm }}km</div>
              </td>
              <td class="px-4 py-4">
                <template v-if="quote.sourcePlatform === '满帮' && quote.rating">
                  <div class="font-semibold text-slate-900">满帮评分 {{ quote.rating.toFixed(1) }}</div>
                  <div class="mt-1 max-w-[210px] truncate text-xs text-slate-400">{{ quote.comments.join('、') || '暂无平台评价标签' }}</div>
                </template>
                <div v-else class="text-xs leading-5 text-slate-400">大卡暂未提供司机评分</div>
              </td>
              <td class="px-4 py-4">
                <div class="font-semibold text-slate-900">近 30 天 {{ quote.recentOrderCount30 }} 单</div>
                <div class="mt-1 text-xs leading-5 text-slate-400">根据数字人已同步运单统计，不依赖平台画像</div>
              </td>
              <td class="px-4 py-4">
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-if="quote.status === '待处理'"
                    type="button"
                    class="rounded-md border border-[#deded9] px-2.5 py-1.5 text-xs text-slate-700 hover:bg-[#f7f7f5]"
                    @click="store.updateQuoteStatus(quote.id, '已联系')"
                  >联系司机</button>
                  <button
                    v-if="quote.status !== '已合作' && quote.type !== '电话联系'"
                    type="button"
                    class="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                    @click="store.dispatchQuote(quote.id)"
                  >确认合作并派车</button>
                  <span v-if="quote.status === '已合作'" class="inline-flex items-center text-xs font-medium text-emerald-700">
                    <Icon :svg="strokeIconPaths.check" :size="14" svg-class="mr-1" />已回写派车
                  </span>
                </div>
              </td>
            </tr>
            <tr v-if="store.cargoQuotesPaginated.length === 0"><td colspan="7" class="p-10 text-center text-sm text-slate-400">暂无符合条件的报价或抢单反馈</td></tr>
          </tbody>
        </table>
      </div>
      <footer class="flex h-12 shrink-0 items-center justify-between border-t border-[#e2e2dc] px-4 text-xs text-slate-500">
        <span>显示 {{ quotePageStart }}—{{ quotePageEnd }} 条，共 {{ store.cargoQuotesFiltered.length }} 条</span>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2">
            每页
            <select v-model="quotePageSize" class="h-8 rounded-md border border-[#deded9] bg-white px-2 text-xs text-slate-700">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </label>
          <button type="button" class="h-8 rounded-md border border-[#deded9] px-3 disabled:cursor-not-allowed disabled:text-slate-300" :disabled="quotePage <= 1" @click="quotePage -= 1">上一页</button>
          <span>第 {{ quotePage }} / {{ store.quoteTotalPages }} 页</span>
          <button type="button" class="h-8 rounded-md border border-[#deded9] px-3 disabled:cursor-not-allowed disabled:text-slate-300" :disabled="quotePage >= store.quoteTotalPages" @click="quotePage += 1">下一页</button>
        </div>
      </footer>
    </section>
  </div>
</template>
