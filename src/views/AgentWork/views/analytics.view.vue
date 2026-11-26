<script lang="ts" setup>
import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';

import { computed } from 'vue';
import { agentWorkData } from '@/pinia/agentWork';
import { getRiskOrders, rankByField } from '../utils';
const work = agentWorkData();
const risks = computed(() => getRiskOrders(work.currentProjectOrders));
const ranking = computed(() => rankByField(work.currentProjectOrders,'carrier').slice(0,5));
const issues = computed(() => [...new Set(risks.value.map(o=>o.issue).filter(Boolean))].slice(0,3));
const statusCounts = computed(() => Object.entries(work.currentProjectOrders.reduce<Record<string,number>>((out,o)=>{
  out[o.status]=(out[o.status]||0)+1;return out;
}, {})));
const { goPage } = useAgentWorkNav();
</script>

<template>
  <div data-view-scroll="dashboard" class="flex h-full flex-col space-y-3 overflow-y-auto">
    <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex h-12 items-center gap-2.5 border-b border-[#e2e2dc] px-4">
        <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
          <Icon :svg="strokeIconPaths.gauge" :size="16" />
        </div>
        <div>
          <h1 class="text-sm font-semibold leading-5 text-slate-950">项目看板</h1>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3 p-4">
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">异常运单</div>
          <div class="mt-1 text-xl font-semibold text-red-600">{{ risks.length }}</div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">高风险</div>
          <div class="mt-1 text-xl font-semibold text-red-600">{{ risks.filter(o=>o.risk==='高风险').length }}</div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">低风险</div>
          <div class="mt-1 text-xl font-semibold text-orange-600">{{ risks.filter(o=>o.risk==='低风险').length }}</div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">异常率</div>
          <div class="mt-1 text-xl font-semibold text-slate-900">{{ work.currentProjectOrders.length ? (100*risks.length/work.currentProjectOrders.length).toFixed(1) : 0 }}%</div>
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-md border border-[#deded9] bg-white p-4">
        <div class="mb-3 text-sm font-semibold">运输状态分布</div>
        <div class="flex h-60 items-end gap-3 rounded-md bg-[#f7f7f5] p-4">
          <div v-for="[status, count] in statusCounts" :key="status" class="flex flex-1 flex-col items-center gap-2">
            <div class="w-full rounded-t bg-slate-900" :style="{ height: `${count * 146 / Math.max(1,...statusCounts.map(s=>s[1]))}px` }"></div>
            <span class="text-xs text-slate-400">{{ status }} · {{ count }}</span>
          </div>
        </div>
      </div>
      <div class="rounded-md border border-[#deded9] bg-white p-4">
        <div class="mb-3 text-sm font-semibold">异常归因</div>
        <div class="space-y-3 text-sm text-slate-600">
          <div v-for="issue in issues" :key="issue" class="rounded-md bg-[#f7f7f5] p-3">{{ issue }}</div>
          <p v-if="!issues.length">当前项目暂无已记录的异常。</p>
          <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm text-white" @click="goPage('risk')">查看异常运单</button>
        </div>
      </div>
    </div>
    <div class="rounded-md border border-[#deded9] bg-white p-4">
      <div class="mb-3 text-sm font-semibold">承运商异常排名</div>
      <div class="space-y-3">
        <div v-for="item in ranking" :key="item.name" class="flex items-center gap-3">
          <div class="w-20 text-sm text-slate-600">
            {{ item.name }}
          </div>
          <div class="h-3 flex-1 rounded-full bg-slate-100">
            <div class="h-3 rounded-full bg-slate-900" :style="{ width: `${100 * item.value / ranking[0]!.value}%` }"></div>
          </div>
          <div class="w-10 text-right text-sm font-medium">
            {{ item.value }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
