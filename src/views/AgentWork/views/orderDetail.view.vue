<script lang="ts" setup>
import type { TimelineEvent } from '../interface';

import { Icon } from '@packages/icon';
import { onMounted } from 'vue';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass } from '../utils';

const store = agentWorkData();

function eventCardClass(event: TimelineEvent) {
  if (event.type === 'risk') return 'border-purple-200 bg-purple-50';
  if (event.type === 'stop' && store.detailView === 'agent' && event.agentTone === 'green') return 'border-emerald-200 bg-emerald-50';
  if (event.type === 'stop') return 'border-red-200 bg-red-50';
  return 'border-slate-200 bg-white';
}

onMounted(() => {
  store.detailView = 'agent';
});
</script>

<template>
  <div class="flex h-full flex-col space-y-4">
    <div class="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Icon :svg="strokeIconPaths.map" :size="18" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-slate-900">运单详情与地图轨迹</h1>
            <p class="mt-1 text-sm text-slate-500">{{ store.currentDetailOrder.id }} · {{ store.currentDetailOrder.plate }}</p>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-6 gap-3 text-sm">
        <div v-for="row in store.detailInfoRows" :key="row.label" class="rounded-md bg-slate-50 p-3">
          <div class="text-xs text-slate-500">
            {{ row.label }}
          </div>
          <div class="mt-1 truncate text-sm font-semibold" :class="row.danger ? 'text-red-600' : 'text-slate-900'">
            {{ row.value }}
          </div>
        </div>
      </div>
    </div>
    <div class="grid h-0 flex-1 grid-cols-[1.15fr_0.85fr] gap-4">
      <div class="h-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-200 p-4">
          <div class="font-semibold">地图轨迹</div>
          <div class="flex gap-2">
            <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('red')">异常停车点 2</span>
            <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('purple')">轨迹造假高风险段 1</span>
          </div>
        </div>
        <div
          class="relative h-[590px] overflow-hidden p-5"
          style="
            background:
              linear-gradient(90deg, rgba(203, 213, 225, 0.5) 1px, transparent 1px),
              linear-gradient(0deg, rgba(203, 213, 225, 0.5) 1px, transparent 1px),
              #eef3f8;
            background-size: 44px 44px, 44px 44px, auto;
          "
        >
          <div class="absolute top-20 left-10 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow">装货地 · 上海一厂</div>
          <div class="absolute right-10 bottom-16 rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow">卸货地 · 广州仓</div>
          <div class="absolute top-[26%] left-[18%] h-2 w-2 rounded-full bg-slate-900"></div>
          <div class="absolute top-[33%] left-[24%] h-2 w-2 rounded-full bg-slate-900"></div>
          <div class="absolute top-[41%] left-[34%] h-4 w-4 rounded-full border-4 border-red-500 bg-white shadow-lg"></div>
          <div class="absolute top-[54%] left-[52%] h-4 w-4 rounded-full border-4 border-red-500 bg-white shadow-lg"></div>
          <div class="absolute top-[63%] left-[68%] h-4 w-4 rounded-full border-4 border-purple-500 bg-white shadow-lg"></div>
          <svg class="absolute inset-0 h-full w-full" viewBox="0 0 800 590" fill="none">
            <path
              d="M90 110 C180 160, 240 190, 300 230 S440 310, 520 335 S630 390, 715 500"
              stroke="#0f172a"
              stroke-width="4"
              stroke-linecap="round"
              stroke-dasharray="8 10"
            />
          </svg>
          <div class="absolute top-[45%] left-[35%] rounded-md border border-slate-200 bg-white/95 p-3 text-xs text-slate-700 shadow-xl">
            <b>异常停车</b><br />G60 服务区附近<br />规则：异常 · 智能体：低风险合理休息
          </div>
          <div class="absolute top-[58%] left-[53%] rounded-md border border-slate-200 bg-white/95 p-3 text-xs text-slate-700 shadow-xl">
            <b>异常停车</b><br />非目的地物流园<br />智能体：高风险，建议复核
          </div>
        </div>
      </div>
      <div class="flex h-full flex-col rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-4 flex items-center justify-between gap-2">
          <div class="font-semibold">事件 Timeline</div>
          <button
            type="button"
            class="rounded-md px-3 py-2 text-xs font-medium"
            :class="store.detailOnlyAbnormal ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'"
            @click="store.detailOnlyAbnormal = !store.detailOnlyAbnormal"
          >
            <Icon :svg="strokeIconPaths.filter" :size="14" svg-class="mr-1 inline" /> 只看异常事件
          </button>
        </div>
        <div class="mb-4 flex rounded-md bg-slate-100 p-1 text-xs">
          <button
            type="button"
            class="flex-1 rounded-lg px-3 py-2"
            :class="store.detailView === 'agent' ? 'bg-white shadow-sm' : 'text-slate-500'"
            @click="store.detailView = 'agent'"
          >
            智能体判断
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg px-3 py-2"
            :class="store.detailView === 'rule' ? 'bg-white shadow-sm' : 'text-slate-500'"
            @click="store.detailView = 'rule'"
          >
            规则判断
          </button>
        </div>
        <div class="max-h-[530px] space-y-3 overflow-auto pr-1">
          <div
            v-for="e in store.timelineEvents"
            :key="e.id"
            class="rounded-md border p-3"
            :class="eventCardClass(e)"
          >
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium">
                {{ e.title }}
              </div>
              <div class="text-xs text-slate-500">
                {{ e.time }}
              </div>
            </div>
            <div v-if="e.type !== 'stop' || store.detailView === 'rule'" class="mt-1 text-xs text-slate-500">
              {{ e.place }}
            </div>
            <div v-if="e.type !== 'stop'" class="mt-2 text-sm text-slate-600">
              {{ e.desc }}
            </div>
            <div v-if="e.type === 'stop' && store.detailView === 'agent'" class="mt-3 flex flex-wrap gap-2">
              <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('blue')">
                停靠地点：{{ e.stopPlace }}
              </span>
              <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass(e.agentTone ?? 'gray')">
                {{ e.agentVerdict }}
              </span>
            </div>
            <div v-if="e.type === 'stop' && e.rule && e.agent" class="mt-3 rounded-md bg-white p-3 text-xs leading-5 text-slate-700">
              {{ store.detailView === 'rule' ? e.rule : e.agent }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
