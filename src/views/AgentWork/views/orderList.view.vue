<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';
import { onMounted } from 'vue';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { tableRiskPillClass, tableStatusPillClass } from '../utils';

const props = defineProps<{
  listMode: 'orders' | 'risk';
}>();

const store = agentWorkData();
const {
  ordersSeed,
  ordersRiskFilter,
  ordersStatusFilter,
  ordersKeyword,
  ordersStartDate,
  ordersEndDate,
  riskOrdersRisk,
  riskOrdersSource,
  riskOrdersKeyword,
} = storeToRefs(store);
const { goPage, openOrderDetail, createDownload } = useAgentWorkNav();

const isOrders = () => props.listMode === 'orders';

onMounted(() => {
  store.ensureOrdersDateRange();
});

function generateRiskBrief() {
  store.generateRiskBrief();
  goPage('agent');
}
</script>

<template>
  <div class="flex h-full flex-col space-y-4">
    <div class="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Icon :svg="strokeIconPaths.list" :size="18" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-slate-900">
              {{ isOrders() ? '运单列表' : '异常运单列表' }}
            </h1>
            <p class="mt-1 text-sm text-slate-500">
              {{ isOrders() ? '当前项目全部运单' : '高风险、低风险运单' }}
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            v-if="!isOrders()"
            type="button"
            class="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900"
            @click="generateRiskBrief()"
          >
            生成简报
          </button>
          <button
            type="button"
            class="flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            @click="createDownload(isOrders() ? '当前运单列表筛选结果' : '当前异常运单筛选结果')"
          >
            <Icon :svg="strokeIconPaths.download" :size="18" svg-class="mr-1 inline" /> 下载当前结果
          </button>
        </div>
      </div>
      <div v-if="isOrders()" class="grid grid-cols-4 gap-3">
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">全部</div>
          <div class="mt-1 text-2xl font-semibold text-slate-900">
            {{ ordersSeed?.length }}
          </div>
        </div>
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">高风险</div>
          <div class="mt-1 text-2xl font-semibold text-red-600">
            {{ ordersSeed.filter((o) => o.risk === '高风险').length }}
          </div>
        </div>
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">低风险</div>
          <div class="mt-1 text-2xl font-semibold text-orange-600">
            {{ ordersSeed.filter((o) => o.risk === '低风险').length }}
          </div>
        </div>
        <div class="rounded-md bg-slate-50 p-4">
          <div class="text-xs text-slate-500">无风险</div>
          <div class="mt-1 text-2xl font-semibold text-emerald-600">
            {{ ordersSeed.filter((o) => o.risk === '无风险').length }}
          </div>
        </div>
      </div>
      <div v-else class="rounded-md border border-orange-200 bg-orange-50 px-4 py-3">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
            <Icon :svg="strokeIconPaths.shield" :size="14" />
          </div>
          <div>
            <div class="text-sm font-semibold text-orange-900">当日异常运单分析</div>
            <div class="mt-1 text-sm leading-6 text-orange-800">
              {{ store.riskOrdersSummary }}建议优先复核非目的地物流园长停和轨迹造假高风险事件。
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="flex h-0 flex-1 flex-col rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <template v-if="isOrders()">
          <label class="text-xs text-slate-500">
            <span class="mb-1 block">时间筛选</span>
            <div class="flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <input
                v-model="ordersStartDate"
                type="date"
                :max="ordersEndDate || undefined"
                class="w-[132px] bg-transparent py-2 text-sm text-slate-700 outline-none"
              />
              <span class="text-slate-300">至</span>
              <input
                v-model="ordersEndDate"
                type="date"
                :min="ordersStartDate || undefined"
                class="w-[132px] bg-transparent py-2 text-sm text-slate-700 outline-none"
              />
            </div>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">风险状态</span>
            <select v-model="ordersRiskFilter" class="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <option>全部</option>
              <option>高风险</option>
              <option>低风险</option>
              <option>无风险</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">运单状态</span>
            <select v-model="ordersStatusFilter" class="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <option>全部</option>
              <option>在途</option>
              <option>装货中</option>
              <option>已到货</option>
              <option>已完成</option>
            </select>
          </label>
          <label class="min-w-[280px] flex-1 text-xs text-slate-500"
            ><span class="mb-1 block">关键词</span>
            <div class="flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-3">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
              <input v-model="ordersKeyword" class="w-full px-2 py-2 text-sm outline-none" placeholder="运单号 / 车牌 / 承运商 / 线路" />
            </div>
          </label>
        </template>
        <template v-else>
          <label class="text-xs text-slate-500">
            <span class="mb-1 block">开始时间</span>
            <div class="flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
              <input
                v-model="ordersStartDate"
                type="date"
                :max="ordersEndDate || undefined"
                class="w-[132px] bg-transparent py-2 text-sm text-slate-700 outline-none"
              />
              <span class="text-slate-300">至</span>
              <input
                v-model="ordersEndDate"
                type="date"
                :min="ordersStartDate || undefined"
                class="w-[132px] bg-transparent py-2 text-sm text-slate-700 outline-none"
              />
            </div>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">风险分组</span>
            <select v-model="riskOrdersRisk" class="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <option>全部异常</option>
              <option>高风险</option>
              <option>低风险</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">风险来源</span>
            <select v-model="riskOrdersSource" class="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <option>全部来源</option>
              <option>规则预警</option>
              <option>智能轨迹分析</option>
              <option>GPS分析</option>
            </select>
          </label>
          <label class="min-w-[320px] flex-1 text-xs text-slate-500"
            ><span class="mb-1 block">关键词</span>
            <div class="flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-3">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
              <input v-model="riskOrdersKeyword" class="w-full px-2 py-2 text-sm outline-none" placeholder="搜索异常运单 / 车牌 / 异常类型 / 承运商" />
            </div>
          </label>
        </template>
      </div>
      <div class="h-0 flex-1 overflow-y-auto rounded-md border border-slate-200">
        <table class="w-full border-collapse text-left text-sm">
          <thead class="bg-slate-50">
            <tr class="text-xs font-semibold text-slate-500">
              <th class="px-4 py-3 align-middle">运单</th>
              <th class="px-4 py-3 align-middle">线路</th>
              <th class="px-4 py-3 align-middle">状态</th>
              <th class="px-4 py-3 align-middle">风险</th>
              <th class="px-4 py-3 align-middle">异常说明</th>
              <th class="px-4 py-3 align-middle">开始时间</th>
              <th class="px-4 py-3 align-middle">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr v-for="o in isOrders() ? store.ordersFiltered : store.riskOrdersFiltered" :key="o.id" class="hover:bg-slate-50/80">
              <td class="px-4 py-4 align-middle">
                <div class="font-semibold text-slate-900">
                  {{ o.id }}
                </div>
                <div class="mt-0.5 text-xs leading-relaxed text-slate-400">{{ o.plate }} · {{ o.driver }}</div>
              </td>
              <td class="px-4 py-4 align-middle">
                <div class="font-semibold text-slate-800">{{ o.route }}</div>
                <div class="mt-0.5 text-xs leading-relaxed text-slate-400">
                  {{ o.carrier }}
                </div>
              </td>
              <td class="px-4 py-4 align-middle">
                <span :class="tableStatusPillClass()">{{ o.status }}</span>
              </td>
              <td class="px-4 py-4 align-middle">
                <span :class="tableRiskPillClass(o.risk)">{{ o.risk }}</span>
              </td>
              <td class="px-4 py-4 align-middle">
                <div class="text-sm text-slate-800">{{ o.issue }}</div>
                <div class="mt-0.5 text-xs leading-relaxed text-slate-400">
                  {{ o.source }}
                </div>
              </td>
              <td class="px-4 py-4 align-middle text-sm text-slate-700">
                {{ o.startTime }}
              </td>
              <td class="px-4 py-4 align-middle">
                <button
                  type="button"
                  class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-900 hover:text-white"
                  @click="openOrderDetail(o)"
                >
                  查看详情
                </button>
              </td>
            </tr>
            <tr v-if="(isOrders() ? store.ordersFiltered : store.riskOrdersFiltered).length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400">暂无符合条件的数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
