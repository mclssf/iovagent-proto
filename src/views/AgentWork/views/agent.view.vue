<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { onMounted } from 'vue';

import { Icon } from '@packages/icon';

import { agentWorkData, quickPrompts, rightPanelTabs } from '@/pinia/agentWork';

import { getRiskOrders, badgeToneClass } from '../utils';
import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';

const store = agentWorkData();
const { agentMessages, agentInput } = storeToRefs(store);
const { goPage, openOrderDetail, createDownload, sendAgent } = useAgentWorkNav();

function setRightPanel(key: string) {
  store.rightPanel = key;
}

const trendData = [
  { date: '05-09', count: 8 },
  { date: '05-10', count: 12 },
  { date: '05-11', count: 9 },
  { date: '05-12', count: 15 },
  { date: '05-13', count: 17 },
  { date: '05-14', count: 13 },
  { date: '05-15', count: 20 },
];

const maxTrendCount = Math.max(...trendData.map((item) => item.count));

onMounted(() => {
  if (!import.meta.env.DEV) return;
  const { ordersSeed } = store;
  const riskOrders = getRiskOrders(ordersSeed);
  console.assert(ordersSeed.length === 6, '运单列表应展示全部运单');
  console.assert(riskOrders.length === 4, '异常运单列表应展示高风险和低风险运单');
  console.assert(riskOrders.every((item) => item.risk !== '无风险'), '异常运单列表不得包含无风险运单');
});
</script>

<template>
  <div class="grid grid-cols-2 gap-6">
    <div class="flex h-[calc(100vh-112px)] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-200 p-5">
        <div class="mb-5 flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Icon :svg="strokeIconPaths.msg" :size="18" />
            </div>
            <div>
              <h1 class="text-xl font-semibold text-slate-900">智能体工作台</h1>
              <p class="mt-1 text-sm text-slate-500">查询、筛选、分析和下载</p>
            </div>
          </div>
        </div>
      </div>
      <div class="flex-1 space-y-4 overflow-auto bg-slate-50 p-5">
        <div v-for="(m, i) in agentMessages" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
          <div
            class="max-w-[72%] rounded-md px-4 py-3 text-sm leading-6"
            :class="m.role === 'user' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'"
          >
            {{ m.text }}
          </div>
        </div>
      </div>
      <div class="border-t border-slate-200 bg-white p-4">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <span class="mr-1 text-xs font-medium text-slate-500">推荐指令</span>
          <button
            v-for="s in quickPrompts"
            :key="s"
            type="button"
            class="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-400 hover:text-slate-900"
            @click="sendAgent(s)"
          >
            {{ s }}
          </button>
        </div>
        <div class="rounded-md border border-[#dbe3ee] bg-white px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
          <textarea
            v-model="agentInput"
            class="min-h-[64px] w-full resize-none bg-transparent text-sm leading-7 text-slate-800 outline-none"
            placeholder="输入查询，例如：今天有哪些异常运单"
            @keydown.enter.exact.prevent="sendAgent()"
          />
          <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <div class="text-xs text-slate-400">Enter 发送，Shift Enter 换行</div>
            <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" @click="sendAgent()">发送</button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex h-[calc(100vh-112px)] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div class="border-b border-slate-200 p-5">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold text-slate-900">今日在途情况</h2>
            <p class="mt-1 text-sm text-slate-500">预警汇总、运单结果、分析结论</p>
          </div>
          <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass('green')">实时同步</span>
        </div>
        <div class="grid grid-cols-4 gap-3">
          <div class="rounded-md bg-slate-50 p-4">
            <div class="text-xs text-slate-500">监控运单</div>
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
      </div>
      <div class="border-b border-slate-200 bg-white px-5 py-3">
        <div class="flex rounded-md bg-slate-100 p-1 text-sm">
          <button
            v-for="[key, label] in rightPanelTabs"
            :key="key"
            type="button"
            class="flex-1 rounded-lg px-3 py-2"
            :class="store.visibleRightPanel === key ? 'bg-white font-medium shadow-sm' : 'text-slate-500'"
            @click="setRightPanel(key)"
          >
            {{ label }}
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-auto bg-slate-50 p-5">
        <div v-if="store.visibleRightPanel === 'overview'" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="rounded-md border border-slate-200 bg-white p-4">
              <div class="mb-3 flex items-center justify-between">
                <div class="text-sm font-semibold">近 7 天异常趋势</div>
                <span class="text-xs text-slate-400">单位：单</span>
              </div>
              <div class="flex h-40 items-end gap-2 rounded-md bg-slate-50 px-3 pb-3 pt-5">
                <div v-for="item in trendData" :key="item.date" class="flex flex-1 flex-col items-center gap-1">
                  <span class="text-[11px] font-medium text-slate-600">{{ item.count }}</span>
                  <div class="w-full rounded-t bg-slate-700 transition" :style="{ height: `${Math.max(18, (item.count / maxTrendCount) * 88)}px` }"></div>
                  <span class="text-[10px] text-slate-400">{{ item.date }}</span>
                </div>
              </div>
            </div>
            <div class="rounded-md border border-slate-200 bg-white p-4">
              <div class="mb-3 text-sm font-semibold">今日风险TOP3</div>
              <div class="space-y-3 text-sm">
                <div>
                  <div class="mb-1 flex items-center justify-between text-xs text-slate-500"><span>规则预警</span><span>9 单</span></div>
                  <div class="h-2 rounded-full bg-slate-100">
                    <div class="h-2 rounded-full bg-slate-900" style="width: 72%"></div>
                  </div>
                </div>
                <div>
                  <div class="mb-1 flex items-center justify-between text-xs text-slate-500"><span>智能轨迹分析</span><span>5 单</span></div>
                  <div class="h-2 rounded-full bg-slate-100">
                    <div class="h-2 rounded-full bg-slate-900" style="width: 48%"></div>
                  </div>
                </div>
                <div>
                  <div class="mb-1 flex items-center justify-between text-xs text-slate-500"><span>GPS 造假分析</span><span>3 单</span></div>
                  <div class="h-2 rounded-full bg-slate-100">
                    <div class="h-2 rounded-full bg-slate-900" style="width: 32%"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="rounded-md border border-slate-200 bg-white p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-semibold">智能体结论</div>
              <button type="button" class="text-xs font-medium text-slate-900" @click="goPage('analytics')">查看统计归因</button>
            </div>
            <div class="space-y-3 text-sm text-slate-700">
              <div class="rounded-md bg-red-50 p-3 text-red-700">今日异常率 13.3%，较昨日上升 2.1 个百分点。</div>
              <div class="rounded-md bg-orange-50 p-3 text-orange-700">异常主要集中在安捷物流和上海工厂 → 广州仓线路。</div>
              <div class="rounded-md bg-slate-50 p-3">建议优先复核非目的地物流园长停，以及 GPS 高风险轨迹段。</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <button type="button" class="rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white" @click="goPage('risk')">查看异常运单</button>
            <button type="button" class="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700" @click="goPage('orders')">
              查看全部运单
            </button>
          </div>
        </div>

        <div v-else-if="store.visibleRightPanel === 'risk'" class="space-y-4">
          <div class="rounded-md border border-slate-200 bg-white p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-semibold">异常运单</div>
              <button type="button" class="text-xs font-medium text-slate-900" @click="goPage('risk')">进入列表</button>
            </div>
            <div class="space-y-3">
              <button
                v-for="o in getRiskOrders(store.ordersSeed)"
                :key="o.id"
                type="button"
                class="w-full rounded-md border border-slate-200 p-4 text-left transition hover:bg-slate-50"
                @click="openOrderDetail(o)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="font-medium text-slate-900">{{ o.plate }} · {{ o.id }}</div>
                    <div class="mt-1 text-sm text-slate-500">
                      {{ o.route }}
                    </div>
                  </div>
                  <span
                    class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                    :class="badgeToneClass(o.risk === '高风险' ? 'red' : 'orange')"
                    >{{ o.risk }}</span
                  >
                </div>
                <div class="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                  {{ o.issue }}
                </div>
              </button>
            </div>
          </div>
          <button type="button" class="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white" @click="createDownload('今日异常运单')">
            下载今日异常运单
          </button>
        </div>

      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
