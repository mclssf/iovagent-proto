<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref } from 'vue';
import { usePhase1 } from '@/pinia/phase1';
import NewMonitoredOrderDialog from '@/views/Phase1/NewMonitoredOrderDialog.vue';
import { dateText, sessionNames } from '@/views/Phase1/catalog';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { badgeToneClass, tableRiskPillClass, tableStatusPillClass } from '../utils';

const props = defineProps<{
  listMode: 'orders' | 'risk';
}>();

const store = agentWorkData();
const monitoring = usePhase1();
const showCreate = ref(false);
const monitoringManaged = computed(() => !!monitoring.configs[store.currentProjectId]?.selectedSkills.length);
function created(id: string) {
  const record = store.currentProjectOrders.find(item => item.id === id);
  const dates = store.currentProjectOrders.map(item => item.startTime.slice(0, 10)).filter(Boolean).sort();
  if (dates.length) { store.ordersStartDate = dates[0]!; store.ordersEndDate = dates.at(-1)!; }
  if (record) openOrderDetail(record);
}
const {
  currentProjectOrders: ordersSeed,
  ordersRiskFilter,
  ordersStatusFilter,
  ordersKeyword,
  ordersStartDate,
  ordersEndDate,
  riskOrdersRisk,
  riskOrdersSource,
  riskOrdersKeyword,
} = storeToRefs(store);
const { openOrderDetail, createDownload } = useAgentWorkNav();

const isOrders = () => props.listMode === 'orders';

onMounted(() => {
  store.ensureOrdersDateRange();
});
</script>

<template>
  <div class="order-list-page flex h-full min-h-0 min-w-0 flex-col bg-white">
    <div class="shrink-0">
      <div class="flex h-12 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4">
        <div class="flex items-center gap-2.5">
          <div class="flex items-center justify-center text-slate-700">
            <Icon :svg="strokeIconPaths.list" :size="16" />
          </div>
          <div>
            <h1 class="text-[13px] font-semibold leading-5 text-slate-950">
              {{ isOrders() ? '运单列表' : '异常运单列表' }}
            </h1>
          </div>
        </div>
        <div v-if="isOrders()" class="flex gap-2">
          <button v-if="monitoringManaged" type="button" class="inline-flex items-center gap-1.5 rounded-md border border-[#deded9] px-3 py-2 text-xs text-slate-700 hover:bg-[#f7f7f5]" @click="showCreate = true"><Icon :svg="strokeIconPaths.plus" :size="14" />新增运单</button>
          <button
            type="button"
            class="flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            @click="createDownload('当前运单列表筛选结果')"
          >
            <Icon :svg="strokeIconPaths.download" :size="18" svg-class="mr-1 inline" /> 下载当前结果
          </button>
        </div>
      </div>
      <div v-if="isOrders() && monitoringManaged" class="grid grid-cols-4 gap-3 border-b border-[#e2e2dc] px-4 py-3"><div v-for="item in [{ label: '运单总量', value: ordersSeed.length }, { label: '监听中', value: monitoring.orders.filter(order => order.projectId === store.currentProjectId && ['active', 'subscribing'].includes(order.session)).length }, { label: '待核实', value: ordersSeed.filter(order => order.risk === '待核实').length }, { label: '已完成', value: ordersSeed.filter(order => order.status === '已完成').length }]" :key="item.label"><div class="text-xs text-slate-600">{{ item.label }}</div><div class="mt-1 text-lg font-semibold text-slate-900">{{ item.value }}</div></div></div>
      <div v-else-if="isOrders()" class="grid grid-cols-4 gap-3 border-b border-[#e2e2dc] p-4">
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">全部</div>
          <div class="mt-1 text-xl font-semibold text-slate-900">
            {{ ordersSeed?.length }}
          </div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">高风险</div>
          <div class="mt-1 text-xl font-semibold text-red-600">
            {{ ordersSeed.filter((o) => o.risk === '高风险').length }}
          </div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">低风险</div>
          <div class="mt-1 text-xl font-semibold text-orange-600">
            {{ ordersSeed.filter((o) => o.risk === '低风险').length }}
          </div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">无风险</div>
          <div class="mt-1 text-xl font-semibold text-emerald-600">
            {{ ordersSeed.filter((o) => o.risk === '无风险').length }}
          </div>
        </div>
      </div>
      <div v-else class="border-b border-orange-100 bg-orange-50 px-4 py-3">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
            <Icon :svg="strokeIconPaths.shield" :size="14" />
          </div>
          <div>
            <div class="text-sm font-semibold text-orange-900">当日异常运单分析</div>
            <div class="mt-1 text-sm leading-6 text-orange-800">
              {{ monitoringManaged ? `当前筛选范围内有 ${store.riskOrdersFiltered.length} 条异常运单，建议核对运输事件及未恢复异常。` : store.riskOrdersSummary + '建议优先复核非目的地物流园长停和轨迹造假高风险事件。' }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <div class="order-list-filters flex shrink-0 flex-wrap items-end gap-3 border-b border-[#e2e2dc] px-4 py-3">
        <template v-if="isOrders()">
          <label class="text-xs text-slate-500">
            <span class="mb-1 block">时间筛选</span>
            <div class="flex min-h-[40px] items-center gap-2 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
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
            <select v-model="ordersRiskFilter" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部</option>
              <option>高风险</option>
              <option>低风险</option>
              <option>无风险</option><option>车辆未入网</option>
              <option v-if="monitoringManaged">待核实</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">运单状态</span>
            <select v-model="ordersStatusFilter" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部</option>
              <option>在途</option>
              <option>装货中</option>
              <option>已到货</option>
              <option>已完成</option>
              <option v-if="monitoringManaged">待发车</option><option v-if="monitoringManaged">装货中</option><option v-if="monitoringManaged">已到达</option>
            </select>
          </label>
          <label class="min-w-0 flex-1 basis-[280px] text-xs text-slate-500"
            ><span class="mb-1 block">关键词</span>
            <div class="flex min-h-[40px] items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
              <input v-model="ordersKeyword" class="min-w-0 w-full px-2 py-2 text-sm outline-none" placeholder="运单号 / 车牌 / 承运商 / 线路" />
            </div>
          </label>
        </template>
        <template v-else>
          <label class="text-xs text-slate-500">
            <span class="mb-1 block">开始时间</span>
            <div class="flex min-h-[40px] items-center gap-2 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
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
            <select v-model="riskOrdersRisk" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部异常</option><option>车辆未入网</option>
              <option v-if="monitoringManaged">待核实</option>
              <option>高风险</option>
              <option>低风险</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">风险来源</span>
            <select v-model="riskOrdersSource" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部来源</option>
              <option>规则预警</option>
              <option>智能轨迹分析</option>
              <option>GPS分析</option>
            </select>
          </label>
          <label class="min-w-0 flex-1 basis-[320px] text-xs text-slate-500"
            ><span class="mb-1 block">关键词</span>
            <div class="flex min-h-[40px] items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
              <input v-model="riskOrdersKeyword" class="min-w-0 w-full px-2 py-2 text-sm outline-none" placeholder="搜索异常运单 / 车牌 / 异常类型 / 承运商" />
            </div>
          </label>
        </template>
      </div>
      <div class="order-list-table min-h-0 min-w-0 flex-1 overflow-auto">
        <table class="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead class="sticky top-0 z-10 bg-[#f7f7f5]">
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
          <tbody class="divide-y divide-[#ededea] bg-white">
            <tr v-for="o in isOrders() ? store.ordersFiltered : store.riskOrdersFiltered" :key="o.id" class="hover:bg-[#f7f7f5]">
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
                <div v-if="o.monitoringId" class="mt-1 text-xs text-slate-600">{{ sessionNames[monitoring.orders.find(item => item.id === o.id)!.session] }}</div>
              </td>
              <td class="px-4 py-4 align-middle">
                <span v-if="o.riskTags?.includes('车辆未入网')" class="mr-1 inline-flex rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">车辆未入网</span><span v-if="o.risk!=='无风险'||!o.riskTags?.length" :class="o.risk === '待核实' ? badgeToneClass('orange') : tableRiskPillClass(o.risk)">{{ o.risk }}</span>
              </td>
              <td class="px-4 py-4 align-middle">
                <div class="text-sm text-slate-800">{{ o.issue }}</div>
                <div class="mt-0.5 text-xs leading-relaxed text-slate-400">
                  {{ o.source }}<span v-if="o.billingExempt" class="ml-2 text-emerald-700">免计费</span>
                </div>
              </td>
              <td class="px-4 py-4 align-middle text-sm text-slate-700">
                {{ o.startTime }}
              </td>
              <td class="px-4 py-4 align-middle">
                <button
                  type="button"
                  class="rounded-md border border-[#deded9] px-3 py-1.5 text-xs hover:bg-slate-900 hover:text-white"
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
    <NewMonitoredOrderDialog v-if="showCreate" :project-id="store.currentProjectId" @close="showCreate = false" @created="created" />
  </div>
</template>

<style lang="scss" scoped>
.order-list-filters > label { max-width: 100%; }
.order-list-filters input[type='date'] { min-width: 0; }
.order-list-table { overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
</style>
