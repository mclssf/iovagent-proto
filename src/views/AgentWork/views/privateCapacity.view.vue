<script lang="ts" setup>
import { computed, ref } from 'vue';

import { Icon } from '@packages/icon';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';

const store = agentWorkData();
const { privateCapacityKeyword, privateCapacityLoadStateFilter } = storeToRefs(store);
const capacityFileInput = ref<HTMLInputElement | null>(null);
const selectedCargoId = ref(store.cargoSources.find((cargo) => cargo.status === '发布中')?.id ?? '');
const showRecommendedOnly = ref(false);

const locatedCount = computed(() => store.privateCapacity.filter((capacity) => Boolean(capacity.currentLocation)).length);
const predictedCount = computed(() => store.privateCapacity.filter((capacity) => Boolean(capacity.predictedDestination)).length);
const loadStateCount = computed(() => store.privateCapacity.filter((capacity) => capacity.loadState !== '未知').length);
const displayedCapacity = computed(() => {
  const list = store.privateCapacityFiltered;
  if (!showRecommendedOnly.value) return list;
  const cargo = store.cargoSources.find((item) => item.id === selectedCargoId.value);
  if (!cargo) return list;
  const loadCity = cargo.loadAddresses[0]?.city.replace('市', '') ?? '';
  const unloadCity = cargo.unloadAddresses[0]?.city.replace('市', '') ?? '';
  return list.filter(
    (capacity) =>
      capacity.routes.some((route) => route.includes(loadCity) || route.includes(unloadCity)) ||
      capacity.currentLocation.includes(loadCity) ||
      capacity.predictedDestination?.includes(unloadCity),
  );
});

function loadStateClass(status: string) {
  if (status === '即将空载' || status === '即将满载') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === '满载') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === '空载') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-[#deded9] bg-[#f7f7f5] text-slate-600';
}

function handleCapacityFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  store.importPrivateCapacityFile(file.name);
  input.value = '';
}

function recommendCapacity() {
  if (!selectedCargoId.value) {
    ElMessage.warning('请选择需要找熟车的货源');
    return;
  }
  showRecommendedOnly.value = true;
  const cargo = store.cargoSources.find((item) => item.id === selectedCargoId.value);
  ElMessage.success(`已结合“${cargo?.cargoName ?? selectedCargoId.value}”车型、线路、车辆位置和目的地预测筛选熟车`);
}

function inviteDriver(driverName: string) {
  ElMessage.success(`已向 ${driverName} 发出定向询价，结果将同步到报价抢单列表`);
}
</script>

<template>
  <div class="flex h-full flex-col gap-3">
    <section class="overflow-hidden rounded-md border border-[#deded9] bg-white">
      <header class="flex min-h-12 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4 py-2">
        <div class="flex items-center gap-2.5">
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.usersRound" :size="16" />
          </span>
          <div>
            <h1 class="text-sm font-semibold leading-5 text-slate-950">私有运力池</h1>
            <p class="text-xs leading-4 text-slate-400">沉淀企业熟车资源，叠加中交车辆位置、目的地预测和当前装卸状态</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <input ref="capacityFileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleCapacityFile" />
          <button type="button" class="inline-flex items-center rounded-md border border-[#deded9] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-[#f7f7f5]" @click="capacityFileInput?.click()">
            <Icon :svg="strokeIconPaths.upload" :size="15" svg-class="mr-1.5" /> 导入熟车 Excel
          </button>
        </div>
      </header>
      <div class="grid grid-cols-4 divide-x divide-[#ededea]">
        <div class="px-4 py-3"><div class="text-xs text-slate-500">熟车总数</div><div class="mt-1 text-xl font-semibold text-slate-950">{{ store.privateCapacity.length }}</div></div>
        <div class="px-4 py-3"><div class="text-xs text-slate-500">已获取车辆位置</div><div class="mt-1 text-xl font-semibold text-emerald-600">{{ locatedCount }}</div></div>
        <div class="px-4 py-3"><div class="text-xs text-slate-500">已有目的地预测</div><div class="mt-1 text-xl font-semibold text-blue-600">{{ predictedCount }}</div></div>
        <div class="px-4 py-3"><div class="text-xs text-slate-500">已有载重状态</div><div class="mt-1 text-xl font-semibold text-amber-600">{{ loadStateCount }}</div></div>
      </div>
    </section>

    <section class="rounded-md border border-[#deded9] bg-white p-3">
      <div class="flex flex-wrap items-end gap-3">
        <label class="min-w-[320px] flex-1 text-xs text-slate-500">
          <span class="mb-1 block">给发布中的货源推荐熟车</span>
          <select v-model="selectedCargoId" class="h-9 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm text-slate-700 outline-none">
            <option value="">请选择货源</option>
            <option v-for="cargo in store.cargoSources.filter((item) => item.status === '发布中')" :key="cargo.id" :value="cargo.id">
              {{ cargo.id }} · {{ cargo.cargoName }} · {{ cargo.loadAddresses[0]?.city }} → {{ cargo.unloadAddresses[0]?.city }}
            </option>
          </select>
        </label>
        <button type="button" class="inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" @click="recommendCapacity">
          <Icon :svg="strokeIconPaths.zap" :size="15" svg-class="mr-1.5" /> 智能推荐
        </button>
        <button v-if="showRecommendedOnly" type="button" class="h-9 rounded-md border border-[#deded9] px-3 text-sm text-slate-600" @click="showRecommendedOnly = false">查看全部</button>
      </div>
    </section>

    <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#e2e2dc] p-3">
        <label class="flex min-w-[320px] flex-1 items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
          <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
          <input v-model="privateCapacityKeyword" class="h-9 w-full bg-transparent px-2 text-sm outline-none" placeholder="司机 / 车牌 / 承运主体 / 位置 / 预测目的地" />
        </label>
        <select v-model="privateCapacityLoadStateFilter" aria-label="载重状态筛选" class="h-9 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm text-slate-700 outline-none">
          <option>全部</option>
          <option>空载</option>
          <option>满载</option>
          <option>即将空载</option>
          <option>即将满载</option>
        </select>
        <span class="text-xs text-slate-400">{{ showRecommendedOnly ? '推荐' : '筛选' }}结果 {{ displayedCapacity.length }} 条</span>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <table class="w-full min-w-[1240px] border-collapse text-left text-sm">
          <thead class="sticky top-0 z-10 bg-[#f7f7f5] text-xs font-semibold text-slate-500">
            <tr>
              <th class="px-4 py-3">司机与车辆</th>
              <th class="px-4 py-3">承运主体</th>
              <th class="px-4 py-3">常跑线路</th>
              <th class="px-4 py-3">车辆位置</th>
              <th class="px-4 py-3">目的地预测</th>
              <th class="px-4 py-3">当前装卸状态</th>
              <th class="w-[130px] px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#ededea]">
            <tr v-for="capacity in displayedCapacity" :key="capacity.id" class="hover:bg-[#fafaf8]">
              <td class="px-4 py-4">
                <div class="font-semibold text-slate-900">{{ capacity.driverName }} <span class="ml-1 text-xs font-normal text-slate-400">{{ capacity.driverPhone }}</span></div>
                <div class="mt-1 text-slate-700">{{ capacity.truckNo }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ capacity.truckType }} · {{ capacity.truckLength }}</div>
              </td>
              <td class="px-4 py-4">
                <div class="font-medium text-slate-800">{{ capacity.carrierName }}</div>
                <div class="mt-1 text-xs text-slate-500">常驻 {{ capacity.baseCity }}</div>
              </td>
              <td class="px-4 py-4">
                <div v-for="route in capacity.routes" :key="route" class="mb-1 text-slate-700">{{ route }}</div>
              </td>
              <td class="px-4 py-4">
                <div class="max-w-[220px] font-medium text-slate-800">{{ capacity.currentLocation }}</div>
                <div class="mt-1 text-xs text-slate-400">定位 {{ capacity.positionTime }}</div>
              </td>
              <td class="px-4 py-4">
                <template v-if="capacity.predictedDestination">
                  <div class="max-w-[240px] font-medium text-slate-800">
                    预计到达 {{ capacity.predictedDestination }}<span v-if="capacity.destinationProbability !== undefined">（{{ capacity.destinationProbability }}%概率）</span>
                  </div>
                  <div class="mt-1 text-xs text-slate-400">预计到达时间 {{ capacity.predictedArrivalTime || '-' }}</div>
                </template>
                <div v-else class="text-xs text-slate-400">暂无目的地预测</div>
              </td>
              <td class="px-4 py-4">
                <template v-if="capacity.loadState !== '未知'">
                  <span class="inline-flex rounded border px-2 py-1 text-xs font-medium" :class="loadStateClass(capacity.loadState)">{{ capacity.loadState }}</span>
                  <div class="mt-1 text-xs text-slate-400">更新 {{ capacity.loadStateUpdatedAt }}</div>
                </template>
              </td>
              <td class="px-4 py-4">
                <button
                  type="button"
                  class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  @click="inviteDriver(capacity.driverName)"
                >定向询价</button>
              </td>
            </tr>
            <tr v-if="displayedCapacity.length === 0"><td colspan="7" class="p-10 text-center text-sm text-slate-400">暂无符合条件的熟车运力</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
