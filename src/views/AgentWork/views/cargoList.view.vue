<script lang="ts" setup>
import type { CargoPublication, StandardCargo } from '../interface';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { Icon } from '@packages/icon';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';

const store = agentWorkData();
const { cargoEndDate, cargoKeyword, cargoPage, cargoPageSize, cargoSourceFilter, cargoStartDate, cargoStatusFilter } = storeToRefs(store);
const { goPage } = useAgentWorkNav();
const selectedCargo = ref<StandardCargo | null>(null);
const editingCargo = ref<StandardCargo | null>(null);
const cargoFileInput = ref<HTMLInputElement | null>(null);
const editCargoForm = reactive({
  cargoName: '',
  chargeUnit: '趟' as StandardCargo['price']['chargeUnit'],
  findMode: '电议' as StandardCargo['price']['findMode'],
  freightYuan: 0,
  loadAddress: '',
  loadTimeEnd: '',
  loadTimeStart: '',
  maxWeight: 0,
  minWeight: 0,
  packageType: '',
  remark: '',
  truckLength: '',
  truckNumber: 1,
  truckType: '',
  unloadAddress: '',
  unloadTime: '',
});

const currentProjectCargos = computed(() => store.cargoSources.filter((cargo) => cargo.projectId === store.currentProjectId));
const publishingCount = computed(() => currentProjectCargos.value.filter((cargo) => cargo.status === '发布中').length);
const pendingCount = computed(() => currentProjectCargos.value.filter((cargo) => ['待完善', '待发布'].includes(cargo.status)).length);
const quoteCount = computed(() => currentProjectCargos.value.reduce((sum, cargo) => sum + cargo.quoteCount, 0));
const cargoPageStart = computed(() => (store.cargoSourcesFiltered.length ? (cargoPage.value - 1) * cargoPageSize.value + 1 : 0));
const cargoPageEnd = computed(() => Math.min(cargoPage.value * cargoPageSize.value, store.cargoSourcesFiltered.length));

function formatMoney(fen: number) {
  if (!fen) return '电议';
  return `¥${(fen / 100).toLocaleString('zh-CN')}`;
}

function routeText(cargo: StandardCargo) {
  const load = cargo.loadAddresses[0];
  const unload = cargo.unloadAddresses[0];
  return `${load?.city ?? '-'} · ${load?.district ?? '-'} → ${unload?.city ?? '-'} · ${unload?.district ?? '-'}`;
}

function cargoStatusClass(status: StandardCargo['status']) {
  if (status === '发布中') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === '待完善' || status === '同步异常') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === '已派车') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-[#deded9] bg-[#f7f7f5] text-slate-600';
}

function publicationClass(publication: CargoPublication) {
  if (publication.status === '发布中') return 'bg-emerald-50 text-emerald-700';
  if (publication.status === '发布失败') return 'bg-red-50 text-red-600';
  return 'bg-[#f1f1ef] text-slate-500';
}

function openQuotes(cargo: StandardCargo) {
  store.focusCargoQuotes(cargo.id);
  goPage('cargoQuotes');
}

function handleCargoFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  store.importCargoFile(file.name);
  input.value = '';
}

function toDateTimeLocal(value?: string) {
  return value ? value.replace(' ', 'T').slice(0, 16) : '';
}

function fromDateTimeLocal(value: string) {
  return value.replace('T', ' ');
}

function openEditCargo(cargo: StandardCargo) {
  if (cargo.sourceType !== 'Excel导入') return;
  editingCargo.value = cargo;
  Object.assign(editCargoForm, {
    cargoName: cargo.cargoName,
    chargeUnit: cargo.price.chargeUnit,
    findMode: cargo.price.findMode,
    freightYuan: cargo.price.freightFen / 100,
    loadAddress: cargo.loadAddresses[0]?.detail ?? '',
    loadTimeEnd: toDateTimeLocal(cargo.loadTimeEnd),
    loadTimeStart: toDateTimeLocal(cargo.loadTimeStart),
    maxWeight: cargo.maxWeight ?? 0,
    minWeight: cargo.minWeight ?? 0,
    packageType: cargo.packageType,
    remark: cargo.remark,
    truckLength: cargo.truckLengths[0] ?? '',
    truckNumber: cargo.truckNumber,
    truckType: cargo.truckTypes[0] ?? '',
    unloadAddress: cargo.unloadAddresses[0]?.detail ?? '',
    unloadTime: toDateTimeLocal(cargo.unloadTime),
  });
}

function saveImportedCargo() {
  if (!editingCargo.value) return;
  if (
    !editCargoForm.cargoName.trim() ||
    !editCargoForm.loadAddress.trim() ||
    !editCargoForm.unloadAddress.trim() ||
    !editCargoForm.loadTimeStart ||
    !editCargoForm.loadTimeEnd ||
    !editCargoForm.unloadTime ||
    !editCargoForm.truckType ||
    !editCargoForm.truckLength
  ) {
    ElMessage.warning('请完整填写货物、装卸地址、装卸时间及车型车长');
    return;
  }
  store.updateImportedCargo(editingCargo.value.id, {
    cargoName: editCargoForm.cargoName.trim(),
    chargeUnit: editCargoForm.chargeUnit,
    findMode: editCargoForm.findMode,
    freightFen: Math.round(editCargoForm.freightYuan * 100),
    loadAddress: editCargoForm.loadAddress.trim(),
    loadTimeEnd: fromDateTimeLocal(editCargoForm.loadTimeEnd),
    loadTimeStart: fromDateTimeLocal(editCargoForm.loadTimeStart),
    maxWeight: editCargoForm.maxWeight || undefined,
    minWeight: editCargoForm.minWeight || undefined,
    packageType: editCargoForm.packageType.trim(),
    remark: editCargoForm.remark.trim(),
    truckLength: editCargoForm.truckLength,
    truckNumber: editCargoForm.truckNumber,
    truckType: editCargoForm.truckType,
    unloadAddress: editCargoForm.unloadAddress.trim(),
    unloadTime: fromDateTimeLocal(editCargoForm.unloadTime),
  });
  editingCargo.value = null;
}

watch([cargoKeyword, cargoStatusFilter, cargoSourceFilter, cargoStartDate, cargoEndDate, cargoPageSize], () => {
  cargoPage.value = 1;
});

watch(
  () => store.cargoTotalPages,
  (totalPages) => {
    if (cargoPage.value > totalPages) cargoPage.value = totalPages;
  },
);

onMounted(() => {
  store.ensureCargoDateRange();
});
</script>

<template>
  <div class="flex h-full flex-col gap-3">
    <section class="overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex min-h-12 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4 py-2">
        <div class="flex items-center gap-2.5">
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.packageSearch" :size="16" />
          </span>
          <div>
            <h1 class="text-sm font-semibold leading-5 text-slate-950">我发布的货源</h1>
            <p class="text-xs leading-4 text-slate-400">统一管理客户系统与 Excel 货源，并同步发布到大卡和满帮</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <input ref="cargoFileInput" type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="handleCargoFile" />
          <button
            type="button"
            class="inline-flex items-center rounded-md border border-[#deded9] bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-[#f7f7f5]"
            @click="cargoFileInput?.click()"
          >
            <Icon :svg="strokeIconPaths.upload" :size="15" svg-class="mr-1.5" /> Excel 导入
          </button>
          <button type="button" class="inline-flex items-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800" @click="store.refreshCargoSources">
            <Icon :svg="strokeIconPaths.refresh" :size="15" svg-class="mr-1.5" /> 同步客户系统
          </button>
        </div>
      </div>
      <div class="grid grid-cols-4 divide-x divide-[#ededea]">
        <div class="px-4 py-3">
          <div class="text-xs text-slate-500">全部货源</div>
          <div class="mt-1 text-xl font-semibold text-slate-950">{{ currentProjectCargos.length }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-xs text-slate-500">发布中</div>
          <div class="mt-1 text-xl font-semibold text-blue-600">{{ publishingCount }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-xs text-slate-500">待完善 / 待发布</div>
          <div class="mt-1 text-xl font-semibold text-amber-600">{{ pendingCount }}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-xs text-slate-500">报价与抢单</div>
          <div class="mt-1 text-xl font-semibold text-emerald-600">{{ quoteCount }}</div>
        </div>
      </div>
    </section>

    <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#e2e2dc] p-3">
        <label class="text-xs text-slate-500">
          <span class="mb-1 block">创建时间</span>
          <div class="flex h-9 items-center gap-2 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
            <input v-model="cargoStartDate" type="date" :max="cargoEndDate || undefined" class="w-[126px] bg-transparent text-sm text-slate-700 outline-none" />
            <span class="text-slate-300">至</span>
            <input v-model="cargoEndDate" type="date" :min="cargoStartDate || undefined" class="w-[126px] bg-transparent text-sm text-slate-700 outline-none" />
          </div>
        </label>
        <label class="mt-5 flex min-w-[280px] flex-1 items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
          <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
          <input v-model="cargoKeyword" class="h-9 w-full bg-transparent px-2 text-sm outline-none" placeholder="货源编号 / 货物 / 线路 / 来源系统" />
        </label>
        <select v-model="cargoStatusFilter" aria-label="货源状态筛选" class="mt-5 h-9 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm text-slate-700 outline-none">
          <option>全部</option>
          <option>待完善</option>
          <option>待发布</option>
          <option>发布中</option>
          <option>同步异常</option>
          <option>已下架</option>
          <option>已派车</option>
        </select>
        <select v-model="cargoSourceFilter" aria-label="货源来源筛选" class="mt-5 h-9 rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm text-slate-700 outline-none">
          <option>全部</option>
          <option>客户系统</option>
          <option>Excel导入</option>
        </select>
        <span class="mt-5 text-xs text-slate-400">共 {{ store.cargoSourcesFiltered.length }} 条 · 按创建时间倒序</span>
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        <table class="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead class="sticky top-0 z-10 bg-[#f7f7f5] text-xs font-semibold text-slate-500">
            <tr>
              <th class="px-4 py-3">货源</th>
              <th class="px-4 py-3">线路与时间</th>
              <th class="px-4 py-3">车辆 / 货物</th>
              <th class="px-4 py-3">运价</th>
              <th class="px-4 py-3">来源与同步</th>
              <th class="px-4 py-3">平台发布</th>
              <th class="px-4 py-3">反馈</th>
              <th class="w-[210px] px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#ededea]">
            <tr v-for="cargo in store.cargoSourcesPaginated" :key="cargo.id" class="align-top hover:bg-[#fafaf8]">
              <td class="px-4 py-4">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-slate-900">{{ cargo.cargoName }}</span>
                  <span class="rounded border px-1.5 py-0.5 text-[11px] font-medium" :class="cargoStatusClass(cargo.status)">{{ cargo.status }}</span>
                </div>
                <div class="mt-1 text-xs text-slate-400">{{ cargo.id }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ cargo.externalCargoNo }}</div>
              </td>
              <td class="px-4 py-4">
                <div class="font-medium text-slate-800">{{ routeText(cargo) }}</div>
                <div class="mt-1 text-xs text-slate-500">装货 {{ cargo.loadTimeStart }}—{{ cargo.loadTimeEnd.slice(11) }}</div>
                <div class="mt-1 max-w-[250px] truncate text-xs text-slate-400">{{ cargo.loadAddresses[0]?.detail }} → {{ cargo.unloadAddresses[0]?.detail }}</div>
              </td>
              <td class="px-4 py-4">
                <div class="text-slate-800">{{ cargo.truckTypes.join(' / ') }} · {{ cargo.truckLengths.join(' / ') }} · {{ cargo.truckNumber }}辆</div>
                <div class="mt-1 text-xs text-slate-500">{{ cargo.packageType }} · {{ cargo.minWeight ?? '-' }}—{{ cargo.maxWeight ?? '-' }}吨</div>
              </td>
              <td class="px-4 py-4">
                <div class="font-semibold text-slate-900">{{ formatMoney(cargo.price.freightFen) }} / {{ cargo.price.chargeUnit }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ cargo.price.findMode }} · {{ cargo.price.paymentType }}</div>
                <div v-if="cargo.price.depositFen" class="mt-1 text-xs text-slate-400">订金 {{ formatMoney(cargo.price.depositFen) }}</div>
              </td>
              <td class="px-4 py-4">
                <div class="flex items-center gap-1.5 text-slate-800">
                  <span class="rounded bg-[#f1f1ef] px-1.5 py-0.5 text-[11px]">{{ cargo.sourceType }}</span>
                  {{ cargo.sourceSystem }}
                </div>
                <div class="mt-1 text-xs" :class="cargo.syncStatus === '正常' ? 'text-emerald-600' : 'text-amber-600'">{{ cargo.syncStatus }} · {{ cargo.sourceUpdatedAt }}</div>
                <div class="mt-1 text-xs text-slate-400">创建 {{ cargo.createdAt }}</div>
                <div class="mt-1 max-w-[210px] truncate text-xs text-slate-400" :title="cargo.syncMessage">{{ cargo.syncMessage }}</div>
              </td>
              <td class="px-4 py-4">
                <div class="space-y-1.5">
                  <div v-for="publication in cargo.platformPublications" :key="publication.platform" class="flex items-center gap-2 text-xs">
                    <span class="w-7 font-medium text-slate-700">{{ publication.platform }}</span>
                    <span class="rounded px-1.5 py-0.5" :class="publicationClass(publication)">{{ publication.status }}</span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-4">
                <button type="button" class="font-semibold text-blue-600 hover:text-blue-700" @click="openQuotes(cargo)">{{ cargo.quoteCount }} 报价/抢单</button>
                <div class="mt-1 text-xs text-slate-500">{{ cargo.contactCount }} 电话联系</div>
              </td>
              <td class="px-4 py-4">
                <div class="flex flex-wrap gap-1.5">
                  <button type="button" class="rounded-md border border-[#deded9] px-2.5 py-1.5 text-xs text-slate-700 hover:bg-[#f7f7f5]" @click="selectedCargo = cargo">详情</button>
                  <button
                    v-if="cargo.sourceType === 'Excel导入'"
                    type="button"
                    class="rounded-md border border-[#deded9] px-2.5 py-1.5 text-xs text-slate-700 hover:bg-[#f7f7f5]"
                    @click="openEditCargo(cargo)"
                  >编辑</button>
                  <button
                    v-if="['待发布', '已下架'].includes(cargo.status)"
                    type="button"
                    class="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white"
                    @click="store.publishCargo(cargo.id)"
                  >发布</button>
                  <button
                    v-else-if="cargo.status === '发布中'"
                    type="button"
                    class="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    @click="store.offlineCargo(cargo.id)"
                  >下架</button>
                  <button
                    v-else-if="cargo.status === '待完善' && cargo.sourceType !== 'Excel导入'"
                    type="button"
                    class="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700"
                    @click="store.publishCargo(cargo.id)"
                  >补充字段</button>
                </div>
              </td>
            </tr>
            <tr v-if="store.cargoSourcesPaginated.length === 0">
              <td colspan="8" class="p-10 text-center text-sm text-slate-400">暂无符合条件的货源</td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer class="flex h-12 shrink-0 items-center justify-between border-t border-[#e2e2dc] px-4 text-xs text-slate-500">
        <span>显示 {{ cargoPageStart }}—{{ cargoPageEnd }} 条，共 {{ store.cargoSourcesFiltered.length }} 条</span>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2">
            每页
            <select v-model="cargoPageSize" class="h-8 rounded-md border border-[#deded9] bg-white px-2 text-xs text-slate-700">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </label>
          <button type="button" class="h-8 rounded-md border border-[#deded9] px-3 disabled:cursor-not-allowed disabled:text-slate-300" :disabled="cargoPage <= 1" @click="cargoPage -= 1">上一页</button>
          <span>第 {{ cargoPage }} / {{ store.cargoTotalPages }} 页</span>
          <button type="button" class="h-8 rounded-md border border-[#deded9] px-3 disabled:cursor-not-allowed disabled:text-slate-300" :disabled="cargoPage >= store.cargoTotalPages" @click="cargoPage += 1">下一页</button>
        </div>
      </footer>
    </section>

    <div v-if="selectedCargo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6" @click.self="selectedCargo = null">
      <section class="max-h-[88vh] w-full max-w-[760px] overflow-hidden rounded-md border border-[#deded9] bg-white shadow-xl">
        <header class="flex h-12 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div>
            <h2 class="text-sm font-semibold text-slate-950">货源详情 · {{ selectedCargo.id }}</h2>
          </div>
          <button type="button" class="rounded p-1 text-slate-400 hover:bg-[#f7f7f5]" aria-label="关闭货源详情" @click="selectedCargo = null">
            <Icon :svg="strokeIconPaths.x" :size="16" />
          </button>
        </header>
        <div class="max-h-[calc(88vh-48px)] space-y-4 overflow-auto p-4">
          <div class="rounded-md bg-[#f7f7f5] p-4">
            <div class="text-base font-semibold text-slate-950">{{ selectedCargo.cargoName }} · {{ routeText(selectedCargo) }}</div>
            <div class="mt-2 text-sm leading-6 text-slate-600">{{ selectedCargo.remark }}</div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span v-for="tag in selectedCargo.tags" :key="tag" class="rounded bg-white px-2 py-1 text-xs text-slate-600">{{ tag }}</span>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-md border border-[#deded9] p-3"><div class="text-xs text-slate-400">装货地址</div><div class="mt-1 text-slate-800">{{ selectedCargo.loadAddresses[0]?.detail }}</div></div>
            <div class="rounded-md border border-[#deded9] p-3"><div class="text-xs text-slate-400">卸货地址</div><div class="mt-1 text-slate-800">{{ selectedCargo.unloadAddresses[0]?.detail }}</div></div>
            <div class="rounded-md border border-[#deded9] p-3"><div class="text-xs text-slate-400">车型要求</div><div class="mt-1 text-slate-800">{{ selectedCargo.truckTypes.join('、') }} · {{ selectedCargo.truckLengths.join('、') }}</div></div>
            <div class="rounded-md border border-[#deded9] p-3"><div class="text-xs text-slate-400">运费与订金</div><div class="mt-1 text-slate-800">{{ formatMoney(selectedCargo.price.freightFen) }} / {{ selectedCargo.price.chargeUnit }} · 订金 {{ selectedCargo.price.depositFen ? formatMoney(selectedCargo.price.depositFen) : '¥0' }}</div></div>
          </div>
          <div>
            <h3 class="mb-2 text-xs font-semibold text-slate-500">平台发布记录</h3>
            <div class="divide-y divide-[#ededea] rounded-md border border-[#deded9]">
              <div v-for="publication in selectedCargo.platformPublications" :key="publication.platform" class="flex items-center justify-between gap-4 px-3 py-3 text-sm">
                <div><span class="font-medium text-slate-900">{{ publication.platform }}</span><span class="ml-2 text-xs text-slate-400">{{ publication.externalCargoId || '尚未生成平台货源号' }}</span></div>
                <span class="rounded px-2 py-1 text-xs" :class="publicationClass(publication)">{{ publication.status }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="editingCargo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6" @click.self="editingCargo = null">
      <section class="flex max-h-[90vh] w-full max-w-[820px] flex-col overflow-hidden rounded-md border border-[#deded9] bg-white shadow-xl">
        <header class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4">
          <div>
            <h2 class="text-sm font-semibold text-slate-950">编辑 Excel 货源 · {{ editingCargo.id }}</h2>
            <p class="text-xs text-slate-400">保存后生成新版本，并自动重新发布到原发布平台</p>
          </div>
          <button type="button" class="rounded p-1 text-slate-400 hover:bg-[#f7f7f5]" aria-label="关闭编辑货源" @click="editingCargo = null">
            <Icon :svg="strokeIconPaths.x" :size="16" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-auto p-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">货物名称 *</span>
              <input v-model.trim="editCargoForm.cargoName" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none focus:border-slate-400" />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">包装方式</span>
              <input v-model.trim="editCargoForm.packageType" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none focus:border-slate-400" />
            </label>
            <label class="col-span-2 block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">装货地址 *</span>
              <input v-model.trim="editCargoForm.loadAddress" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none focus:border-slate-400" />
            </label>
            <label class="col-span-2 block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">卸货地址 *</span>
              <input v-model.trim="editCargoForm.unloadAddress" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none focus:border-slate-400" />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">装货开始时间 *</span>
              <input v-model="editCargoForm.loadTimeStart" type="datetime-local" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none focus:border-slate-400" />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">装货结束时间 *</span>
              <input v-model="editCargoForm.loadTimeEnd" type="datetime-local" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none focus:border-slate-400" />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">预计卸货时间 *</span>
              <input v-model="editCargoForm.unloadTime" type="datetime-local" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none focus:border-slate-400" />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-600">最小重量（吨）</span>
                <input v-model.number="editCargoForm.minWeight" type="number" min="0" step="0.1" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none" />
              </label>
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-600">最大重量（吨）</span>
                <input v-model.number="editCargoForm.maxWeight" type="number" min="0" step="0.1" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none" />
              </label>
            </div>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">车型 *</span>
              <select v-model="editCargoForm.truckType" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none">
                <option value="">请选择</option><option>高栏</option><option>平板</option><option>厢式</option><option>冷藏</option>
              </select>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-600">车长 *</span>
                <select v-model="editCargoForm.truckLength" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none">
                  <option value="">请选择</option><option>9.6米</option><option>13米</option><option>13.7米</option><option>17.5米</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-600">车辆数 *</span>
                <input v-model.number="editCargoForm.truckNumber" type="number" min="1" max="100" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none" />
              </label>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-600">找车方式 *</span>
                <select v-model="editCargoForm.findMode" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none">
                  <option>电议</option><option>一口价</option><option>指定司机</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1.5 block text-xs font-medium text-slate-600">计价单位 *</span>
                <select v-model="editCargoForm.chargeUnit" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none">
                  <option>趟</option><option>吨</option><option>方</option>
                </select>
              </label>
            </div>
            <label class="block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">运费（元）</span>
              <input v-model.number="editCargoForm.freightYuan" type="number" min="0" step="0.01" class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 outline-none" />
            </label>
            <label class="col-span-2 block">
              <span class="mb-1.5 block text-xs font-medium text-slate-600">备注要求</span>
              <textarea v-model.trim="editCargoForm.remark" rows="3" class="w-full resize-none rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 outline-none focus:border-slate-400"></textarea>
            </label>
          </div>
        </div>
        <footer class="flex h-14 shrink-0 items-center justify-between border-t border-[#e2e2dc] px-4">
          <span class="text-xs text-amber-700">保存将触发大卡必发，并同步到已配置的满帮账号</span>
          <div class="flex gap-2">
            <button type="button" class="rounded-md border border-[#deded9] px-4 py-2 text-sm text-slate-600" @click="editingCargo = null">取消</button>
            <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" @click="saveImportedCargo">保存并重新发布</button>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>
