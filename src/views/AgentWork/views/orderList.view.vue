<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';
import { computed,ref } from 'vue';
import {useRouter} from 'vue-router';
import {usePhase1} from '@/pinia/phase1';
import {eventRisk} from '@/views/Phase1/eventRisk';
import {stateNames,dateText} from '@/views/Phase1/catalog';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { tableRiskPillClass, tableStatusPillClass } from '../utils';

const props = defineProps<{
  listMode: 'orders' | 'risk';
}>();

const store = agentWorkData();
const {

  ordersRiskFilter,
  ordersStatusFilter,
  ordersKeyword,
  riskOrdersRisk,
  riskOrdersSource,
  riskOrdersKeyword,
} = storeToRefs(store);
const ordersStartDate=ref('');const ordersEndDate=ref('');
const router=useRouter();const phase=usePhase1();const brief=ref('');
const ordersSeed=computed(()=>phase.orders.filter(o=>o.projectId===store.currentProjectId).map(o=>{const anomalies=phase.anomalies.filter(a=>a.orderId===o.id&&a.status==='active');const low=phase.events.some(e=>e.orderId===o.id&&eventRisk(e,phase.anomalies)==='低风险');const review=anomalies.some(a=>phase.events.some(e=>e.id===a.eventId&&e.assessment));return {id:o.id,plate:o.plate,driver:o.driver,carrier:store.currentProject.name,route:`${o.origin.name} → ${o.destination.name}`,factory:o.origin.name,status:stateNames[o.state],risk:anomalies.length?'高风险':low?'低风险':'无风险',issue:anomalies.map(a=>a.kind).join('、')||(low?'停车/离线研判合理，低风险记录':'暂无未处理异常'),source:anomalies.length?(review?'智能研判':'规则预警'):low?'智能研判':o.source,startTime:dateText(o.createdAt),updated:dateText(o.createdAt),eta:dateText(o.plannedArrival)};}));
const filtered=computed(()=>ordersSeed.value.filter(o=>{const risk=isOrders()?ordersRiskFilter.value:riskOrdersRisk.value;const keyword=isOrders()?ordersKeyword.value:riskOrdersKeyword.value;return (isOrders()||o.risk!=='无风险')&&(['全部','全部异常'].includes(risk)||o.risk===risk)&&(!isOrders()||ordersStatusFilter.value==='全部'||o.status===ordersStatusFilter.value)&&(isOrders()||riskOrdersSource.value==='全部来源'||o.source.includes(riskOrdersSource.value))&&(!ordersStartDate.value||o.startTime.slice(0,10)>=ordersStartDate.value)&&(!ordersEndDate.value||o.startTime.slice(0,10)<=ordersEndDate.value)&&Object.values(o).join(' ').includes(keyword);}));
function openOrderDetail(o:{id:string}){router.push({path:'/index/detail',query:{orderId:o.id}});}
function createDownload(_name:string){const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';const csv=[['运单','车牌','司机','线路','状态','风险','异常','来源','开始时间'],...filtered.value.map(o=>[o.id,o.plate,o.driver,o.route,o.status,o.risk,o.issue,o.source,o.startTime])].map(row=>row.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='运单筛选结果.csv';a.click();URL.revokeObjectURL(url);}


const isOrders = () => props.listMode === 'orders';

function generateRiskBrief(){brief.value=`当前筛选共${filtered.value.length}张异常运单，高风险${filtered.value.filter(o=>o.risk==='高风险').length}张，低风险${filtered.value.filter(o=>o.risk==='低风险').length}张。${filtered.value.map(o=>`${o.id}：${o.issue}`).join('；')}`;}
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
              {{ isOrders() ? '运单列表' : '异常运单列表' }}
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
      <div v-else class="m-4 rounded-md border border-orange-200 bg-orange-50 px-4 py-3">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
            <Icon :svg="strokeIconPaths.shield" :size="14" />
          </div>
          <div>
            <div class="text-sm font-semibold text-orange-900">异常运单分析</div>
            <div class="mt-1 text-sm leading-6 text-orange-800">
              当前筛选共{{filtered.length}}张异常运单。异常类型：{{[...new Set(filtered.flatMap(o=>o.issue.split('、')))].join('、')||'暂无未处理异常'}}。
            </div>
          </div>
        </div>
      </div>
    </div>
    <p v-if="brief" class="rounded-md border border-[#deded9] bg-white p-3 text-sm">{{brief}}</p><div class="flex h-0 flex-1 flex-col rounded-md border border-[#deded9] bg-white p-3">
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
              <option>低风险</option>
              <option>无风险</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">运单状态</span>
            <select v-model="ordersStatusFilter" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部</option>
              <option>待发车</option><option>在途</option>
              <option>装货中</option>
              <option>已到达</option>
              <option>已完成</option>
            </select>
          </label>
          <label class="min-w-[280px] flex-1 text-xs text-slate-500"
            ><span class="mb-1 block">关键词</span>
            <div class="flex min-h-[40px] items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
              <input v-model="ordersKeyword" class="w-full px-2 py-2 text-sm outline-none" placeholder="运单号 / 车牌 / 承运商 / 线路" />
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
              <option>低风险</option>
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">风险来源</span>
            <select v-model="riskOrdersSource" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部来源</option>
              <option>规则预警</option>
              <option>智能研判</option>

            </select>
          </label>
          <label class="min-w-[320px] flex-1 text-xs text-slate-500"
            ><span class="mb-1 block">关键词</span>
            <div class="flex min-h-[40px] items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3">
              <Icon :svg="strokeIconPaths.search" :size="15" svg-class="text-slate-400" />
              <input v-model="riskOrdersKeyword" class="w-full px-2 py-2 text-sm outline-none" placeholder="搜索异常运单 / 车牌 / 异常类型 / 承运商" />
            </div>
          </label>
        </template>
      </div>
      <div class="h-0 flex-1 overflow-y-auto rounded-md border border-[#deded9]">
        <table class="w-full border-collapse text-left text-sm">
          <thead class="bg-[#f7f7f5]">
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
            <tr v-for="o in filtered" :key="o.id" class="hover:bg-[#f7f7f5]">
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
                  class="rounded-md border border-[#deded9] px-3 py-1.5 text-xs hover:bg-slate-900 hover:text-white"
                  @click="openOrderDetail(o)"
                >
                  查看详情
                </button>
              </td>
            </tr>
            <tr v-if="(filtered).length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400">暂无符合条件的数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
