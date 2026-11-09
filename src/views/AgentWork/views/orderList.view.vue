<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';
import { computed, onMounted, onBeforeUnmount } from 'vue';

import { associateOrderTrajectory } from '../orderTrajectory';
import { agentWorkData } from '@/pinia/agentWork';

import type { Order } from '../interface';

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
  transportModeFilter,
  orderListView,
  ordersKeyword,
  ordersStartDate,
  ordersEndDate,
  riskOrdersRisk,
  riskOrdersSource,
  riskOrdersKeyword,
} = storeToRefs(store);
const { goPage, createDownload } = useAgentWorkNav();

const isOrders = () => props.listMode === 'orders';

let snapshotTimer: ReturnType<typeof setInterval> | undefined;
onBeforeUnmount(() => { if (snapshotTimer) clearInterval(snapshotTimer); });
onMounted(() => {
  if (store.demoJourneysEnabled) void store.ensureDemoJourneys();
  else if (store.realTelemetryEnabled && !store.telemetryCheckedAt) void store.refreshRealTelemetry();
  else store.reviewCustomerSnapshot();
  snapshotTimer = setInterval(() => {
    if (store.realTelemetryEnabled) {
      if (Date.now() - Date.parse(store.telemetryCheckedAt || '1970-01-01') >= 300000) void store.refreshRealTelemetry();
    } else store.reviewCustomerSnapshot();
  }, 30000);
  store.ensureOrdersDateRange();
});

const filteredOrders = computed(() => isOrders() ? store.ordersFiltered : store.riskOrdersFiltered);
function groupDispatches(orders: Order[]): Order[] {
  const ids = new Set(orders.map((order) => order.dispatchId));
  return [...ids].filter(Boolean).map((id) => {
    const members = ordersSeed.value.filter((order) => order.dispatchId === id);
    const first = members[0]!;
    const risk = members.some((o) => o.risk === '高风险') ? '高风险' : members.some((o) => o.risk === '低风险') ? '低风险' : members.every(o => o.risk === '无风险') ? '无风险' : '待核实';
    return { ...first, id: id!, risk,
      route: [...new Set(members.flatMap((o) => o.stops?.filter((p) => p.kind === '装货').map((p) => p.name) ?? [])),
        ...new Set(members.flatMap((o) => o.stops?.filter((p) => p.kind === '卸货').map((p) => p.name) ?? []))].join(' → '),
      issue: [...new Set(members.map((o) => o.issue))].join('；'),
    };
  });
}
const displayRows = computed(() => orderListView.value === 'waybill' ? filteredOrders.value : groupDispatches(filteredOrders.value));
const summaryRows = computed(() => orderListView.value === 'waybill' ? ordersSeed.value : groupDispatches(ordersSeed.value));
function trajectoryCount(order: Order) {
  const rows = orderListView.value === 'dispatch' ? ordersSeed.value.filter(o => o.dispatchId === order.id) : [order];
  if (rows.some(o => o.demoTrip)) return new Set(rows.flatMap(o => o.demoGps || []).map(p => `${p.timestamp}:${p.coordinate.join(',')}`)).size;
  const points = rows.flatMap(o => associateOrderTrajectory(o, o.telemetry).telemetry?.track || []);
  return new Set(points.map(p => `${p.timestamp}:${p.coordinate.join(',')}`)).size;
}
function viewDetail(order: Order) {
  store.setSelectedOrder(order);
  goPage('detail', orderListView.value === 'dispatch' ? { dispatch: order.id } : { order: order.id });
}

function generateRiskBrief() {
  store.generateRiskBrief();
  goPage('agent');
}
</script>

<template>
  <div class="flex h-full flex-col space-y-3">
    <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex h-12 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.list" :size="16" />
          </div>
          <div>
            <h1 class="text-sm font-semibold leading-5 text-slate-950">
              {{ orderListView === 'dispatch' ? (isOrders() ? '排线单列表' : '异常排线单列表') : (isOrders() ? '运单列表' : '异常运单列表') }}
            </h1>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            v-if="!isOrders()"
            type="button"
            class="rounded-md border border-[#deded9] bg-[#f7f7f5] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:text-slate-900"
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
      <div v-if="isOrders()" class="grid grid-cols-4 gap-3 p-4">
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">全部</div>
          <div class="mt-1 text-xl font-semibold text-slate-900">
            {{ summaryRows.length }}
          </div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">高风险</div>
          <div class="mt-1 text-xl font-semibold text-red-600">
            {{ summaryRows.filter((o) => o.risk === '高风险').length }}
          </div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">低风险</div>
          <div class="mt-1 text-xl font-semibold text-emerald-600">
            {{ summaryRows.filter((o) => o.risk === '低风险').length }}
          </div>
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-3">
          <div class="text-xs text-slate-500">无风险 / 待核实</div>
          <div class="mt-1 text-xl font-semibold text-emerald-600">
            {{ summaryRows.filter((o) => (o.risk === '待核实' || o.risk === '无风险')).length }}
          </div>
        </div>
      </div>
      <div v-else class="m-4 rounded-md border border-orange-200 bg-orange-50 px-4 py-3">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
            <Icon :svg="strokeIconPaths.shield" :size="14" />
          </div>
          <div>
            <div class="text-sm font-semibold text-orange-900">客户运单待复核分析</div>
            <div class="mt-1 text-sm leading-6 text-orange-800">
              {{ store.riskOrdersSummary }}请复核在场停留及缺失的履约数据。
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="flex h-0 flex-1 flex-col rounded-md border border-[#deded9] bg-white p-3">
      <div class="mb-3 flex items-center gap-2" role="group" aria-label="查看维度">
        <button v-for="item in ([{ id: 'waybill', label: '运单' }, { id: 'dispatch', label: '排线单' }] as const)" :key="item.id" :aria-pressed="orderListView === item.id" class="rounded-md border px-4 py-2 text-sm" :class="orderListView === item.id ? 'bg-slate-900 text-white' : 'text-slate-600'" @click="orderListView = item.id">{{ item.label }}</button>
        <span class="text-xs text-slate-500">共 {{ displayRows.length }} {{ orderListView === 'dispatch' ? '张排线单' : '张运单' }}</span>
      </div>
      <div class="mb-4 flex flex-wrap items-end gap-3">
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
              <option>低风险</option><option v-if="!isOrders()">待核实</option>
              <option>无风险</option><option>待核实</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">运单状态</span>
            <select aria-label="运单状态" v-model="ordersStatusFilter" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部</option>
              <option v-for="status in [...new Set(ordersSeed.map(o => o.status))]" :key="status">{{ status }}</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"><span class="mb-1 block">运输方式</span>
            <select aria-label="运输方式" v-model="transportModeFilter" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700"><option>全部</option><option>零担</option><option>大件整车</option></select>
          </label>
          <label class="min-w-[280px] flex-1 text-xs text-slate-500"
            ><span class="mb-1 block">关键词</span>
            <div class="flex min-h-[40px] items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
              <input v-model="ordersKeyword" class="w-full px-2 py-2 text-sm outline-none" placeholder="运单号 / 排线单号 / 车牌 / 承运商 / 线路" />
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
              <option>全部异常</option>
              <option>高风险</option>
              <option>低风险</option><option v-if="!isOrders()">待核实</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">风险来源</span>
            <select v-model="riskOrdersSource" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部来源</option>
              <option>规则预警</option>
              <option>智能轨迹分析</option>
              <option>GPS分析</option><option>模拟定位监控</option><option>客户快照规则复核</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"><span class="mb-1 block">运单状态</span><select aria-label="运单状态" v-model="ordersStatusFilter" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700"><option>全部</option><option v-for="status in [...new Set(ordersSeed.map(o => o.status))]" :key="status">{{ status }}</option></select></label>
          <label class="text-xs text-slate-500"><span class="mb-1 block">运输方式</span>
            <select aria-label="运输方式" v-model="transportModeFilter" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700"><option>全部</option><option>零担</option><option>大件整车</option></select>
          </label>
          <label class="min-w-[320px] flex-1 text-xs text-slate-500"
            ><span class="mb-1 block">关键词</span>
            <div class="flex min-h-[40px] items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
              <input v-model="riskOrdersKeyword" class="w-full px-2 py-2 text-sm outline-none" placeholder="运单号 / 排线单号 / 车牌 / 异常类型 / 承运商" />
            </div>
          </label>
        </template>
      </div>
      <div class="h-0 flex-1 overflow-auto rounded-md border border-[#deded9]">
        <table class="order-results-table w-full border-collapse text-left text-sm">
          <colgroup><col class="identity-col" /><col /><col class="status-col" /><col class="risk-col" /><col class="issue-col" /><col class="time-col" /><col class="action-col" /></colgroup>
          <thead class="bg-[#f7f7f5]">
            <tr class="text-xs font-semibold text-slate-500">
              <th class="px-4 py-3 align-middle">{{ orderListView === 'dispatch' ? '排线单' : '运单' }}</th>
              <th class="px-4 py-3 align-middle">线路</th>
              <th class="px-4 py-3 align-middle">状态</th>
              <th class="px-4 py-3 align-middle">风险</th>
              <th class="px-4 py-3 align-middle">异常说明</th>
              <th class="px-4 py-3 align-middle">{{ store.demoJourneysEnabled ? '演示起止时间' : '开始时间' }}</th>
              <th class="px-4 py-3 align-middle">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#ededea] bg-white">
            <tr v-for="o in displayRows" :key="o.id" class="hover:bg-[#f7f7f5]">
              <td class="px-4 py-4 align-middle">
                <div class="whitespace-nowrap font-semibold text-slate-900" :title="o.id">
                  {{ o.id }}
                </div>
                <div class="mt-0.5 truncate text-xs leading-relaxed text-slate-400" :title="`${o.plate} · ${o.driver}`">{{ o.plate }} · {{ o.driver }}<span v-if="orderListView === 'dispatch'"> · {{ ordersSeed.filter(item => item.dispatchId === o.id).length }} 张运单</span></div>
              </td>
              <td class="px-4 py-4 align-middle">
                <div class="cell-two-lines font-semibold text-slate-800" :title="o.route">{{ o.route }}</div>
                <div class="mt-0.5 text-xs leading-relaxed text-slate-400">
                  {{ o.carrier }} · {{ o.transportMode }}
                </div>
              </td>
              <td class="px-4 py-4 align-middle">
                <span class="whitespace-nowrap" :class="tableStatusPillClass()">{{ o.status }}</span><div v-if="o.demoTrip" class="mt-1 text-xs text-slate-500">演示轨迹{{ trajectoryCount(o) }}点</div><div v-else-if="o.telemetry" class="mt-1 truncate text-xs text-slate-500" >{{ orderListView === 'dispatch' ? '关联运单轨迹' : '本单轨迹' }}{{ trajectoryCount(o) }}点</div><div v-if="o.simulation" class="mt-1 truncate text-xs text-slate-500" :title="o.simulation.state">模拟：{{ o.simulation.state }}</div>
              </td>
              <td class="px-4 py-4 align-middle">
                <span class="whitespace-nowrap" :class="tableRiskPillClass(o.risk)">{{ o.risk }}</span>
              </td>
              <td class="px-4 py-4 align-middle">
                <div class="cell-two-lines text-sm text-slate-800" :title="o.issue">{{ o.issue }}</div>
                <div class="mt-0.5 text-xs leading-relaxed text-slate-400">
                  {{ o.source }}
                </div>
              </td>
              <td class="px-4 py-4 align-middle text-sm text-slate-700">
                <template v-if="o.demoTrip"><div class="whitespace-nowrap text-xs" :title="o.startTime">起 {{ o.startTime.slice(5,16) }}</div><div class="mt-1 whitespace-nowrap text-xs text-slate-500" :title="o.eta">止 {{ o.eta.slice(5,16) }}</div></template>
                <template v-else><div class="whitespace-nowrap text-xs">{{ o.startTime.split(' ')[0] }}</div><div class="mt-1 whitespace-nowrap text-xs text-slate-500">{{ o.startTime.split(' ')[1] }}</div></template>
              </td>
              <td class="px-4 py-4 align-middle">
                <button
                  type="button"
                  class="whitespace-nowrap rounded-md border border-[#deded9] px-3 py-1.5 text-xs hover:bg-slate-900 hover:text-white"
                  @click="viewDetail(o)"
                >
                  查看详情
                </button>
              </td>
            </tr>
            <tr v-if="displayRows.length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400">暂无符合条件的数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.order-results-table {
  table-layout: fixed;
  min-width: 1160px;
  .identity-col { width: 220px; }
  .status-col { width: 112px; }
  .risk-col { width: 96px; }
  .issue-col { width: 23%; }
  .time-col { width: 130px; }
  .action-col { width: 110px; }
  th, td { padding-left: 12px; padding-right: 12px; }
  th { white-space: nowrap; }
  td { padding-top: 16px; padding-bottom: 16px; }
  td:nth-child(3), td:nth-child(4), td:last-child { text-align: center; }
  th:nth-child(3), th:nth-child(4), th:last-child { text-align: center; }
}
.cell-two-lines {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
</style>
