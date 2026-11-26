<script lang="ts" setup>
import { useWorkspaceChat } from '../useWorkspaceChat';
import { useBusinessViewState, useWorkspaceVisits } from '../workspaceVisits';
import { useRoute } from 'vue-router';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { useSkillComposer } from '@/pinia/skillComposer';
import { ElMessage } from 'element-plus';
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { usePhase1 } from '@/pinia/phase1';
import { dateText, sessionNames } from '@/views/Phase1/catalog';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { tableRiskPillClass, tableStatusPillClass } from '../utils';

const props = defineProps<{
  listMode: 'orders' | 'risk';
}>();

const handoff=useWorkspaceChat();
const ids=ref<string[]>([]);
const store = agentWorkData();
const tasks=useAgentDailyTasks(), composer=useSkillComposer();
const projectId=store.currentProjectId;
const scroller=ref<HTMLElement>(), page=ref(1), size=ref(25), sort=ref('original'), lastTask=ref('');
const submitting=ref(false);
const route=useRoute(), visits=useWorkspaceVisits();
const submittedTask=computed(()=>tasks.tasks.find(t=>t.id===lastTask.value && t.projectId===projectId));
const filtered=computed(()=>props.listMode==='orders'?store.ordersFiltered:store.riskOrdersFiltered);
const rows=computed(()=>sort.value==='original'?filtered.value:[...filtered.value].sort((a,b)=>
  (sort.value==='newest'?-1:1)*(a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id))));
const pages=computed(()=>Math.max(1,Math.ceil(rows.value.length/size.value)));
const visible=computed(()=>rows.value.slice((page.value-1)*size.value,page.value*size.value));
const checkedHere=computed(()=>visible.value.filter(o=>ids.value.includes(o.id)).length);
const actions=computed(()=>{
  const skills=new Set(composer.available.map(s=>s.id));
  return {risk:skills.has('route-risk-expert'),trace:skills.has('vehicle-trace-query') || skills.has('gps-trace-expert')};
});
function togglePage(){
  const set=new Set(ids.value), remove=checkedHere.value===visible.value.length;
  for(const o of visible.value){if(remove)set.delete(o.id);else set.add(o.id);}ids.value=[...set];
}
function validateSelection(){
  if(store.currentProjectId!==projectId)return;
  const valid=new Set(store.currentProjectOrders.map(o=>o.id)), previous=ids.value;
  ids.value=previous.filter(id=>valid.has(id));
  if(previous.length!==ids.value.length)ElMessage.info(`已移除 ${previous.length-ids.value.length} 条不存在或无权查看的运单，其余选择已保留。`);
}
watch(()=>store.currentProjectOrders.map(o=>o.id),validateSelection);
watch(pages,n=>{page.value=Math.min(n,page.value);});
function quick(action:'risk'|'trace'){
  if(submitting.value || !actions.value[action])return;
  validateSelection();if(!ids.value.length)return;
  const selected=new Set(ids.value);
  const records=store.currentProjectOrders.filter(o=>selected.has(o.id)).map(o=>({
    运单号:o.id,车牌号:o.plate,运单开始时间:o.startTime,线路:o.route,运输状态:o.status,风险等级:o.risk,风险标签:o.riskTags?.join("、") || "",异常说明:o.issue,判断来源:o.source,
  }));
  const title=action==='risk'?'核验异常':'导出轨迹';
  submitting.value=true;
  try{
    lastTask.value=tasks.saveTask(projectId,{name:title+' · '+records.length+' 条运单',trigger:'once',prompt:action==='risk'?'核验所选运单已记录的异常与风险依据，输出核验清单。':'导出所选运单的车辆轨迹明细文件。',scopeRecords:records,listAction:action});
    ElMessage.success('已提交'+title+'任务');
  }catch(e){ElMessage.warning((e as Error).message);}finally{submitting.value=false;}
}
function discuss(){
  validateSelection();
  if(ids.value.length)handoff(projectId,ids.value.map(id=>({kind:props.listMode==='orders'?'运单':'异常运单',id,label:id})),props.listMode==='orders'?'请核对所选运单的运输状态和风险。':'请分析所选异常运单的风险依据和处置顺序。');
}
function viewSubmitted(){
  if(!submittedTask.value)return;
  visits.capture(route,projectId);
  goPage('dailyTasks',{projectId,taskId:submittedTask.value.id});
}
const monitoring = usePhase1();
const monitoringManaged = computed(() => !!monitoring.configs[store.currentProjectId]?.selectedSkills.length);
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
const { goPage, openOrderDetail, createDownload } = useAgentWorkNav();

const isOrders = () => props.listMode === 'orders';

onMounted(() => {
  store.ensureOrdersDateRange();
});
const filters={ordersStartDate,ordersEndDate,...(isOrders()?{ordersKeyword,ordersRiskFilter,ordersStatusFilter}:{riskOrdersKeyword,riskOrdersRisk,riskOrdersSource})};
watch([...Object.values(filters),size,sort],()=>{page.value=1;},{flush:'sync'});
function readView(){
  const el=scroller.value;
  const first=el && el.scrollTop>0 ? [...el.querySelectorAll<HTMLElement>('tbody [data-order-id]')].find(row=>row.getBoundingClientRect().bottom>el.getBoundingClientRect().top+(el.querySelector('thead')?.clientHeight||0)):null;
  return {ids:[...ids.value],sort:sort.value,page:page.value,size:size.value,lastTask:lastTask.value,
    filters:Object.fromEntries(Object.entries(filters).map(([k,v])=>[k,v.value])),x:el?.scrollLeft||0,y:el?.scrollTop||0,
    anchor:first?.dataset.orderId,offset:first && el ? first.getBoundingClientRect().top-el.getBoundingClientRect().top : 0};
}
useBusinessViewState('orders',readView, async saved=>{
  for(const [k,v] of Object.entries(filters))if(typeof saved.filters[k]==='string')v.value=saved.filters[k];
  size.value=saved.size;sort.value=saved.sort;page.value=Math.min(saved.page,pages.value);
  const index=saved.anchor?rows.value.findIndex(row=>row.id===saved.anchor):-1;
  if(index>=0)page.value=Math.floor(index/size.value)+1;
  ids.value=[...saved.ids];validateSelection();lastTask.value=saved.lastTask;
  await nextTick();
  const el=scroller.value;if(!el)return;
  const anchor=saved.anchor && [...el.querySelectorAll<HTMLElement>('[data-order-id]')].find(row=>row.dataset.orderId===saved.anchor);
  el.scrollTo(saved.x,anchor ? el.scrollTop+anchor.getBoundingClientRect().top-el.getBoundingClientRect().top-saved.offset : saved.y);
  if(saved.anchor && !anchor)ElMessage.info('原定位运单不在当前页，已恢复到接近的浏览位置。');
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
        <div class="flex gap-2">
          <button
            type="button"
            class="flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            v-if="isOrders()" @click="createDownload('当前运单列表筛选结果')"
          >
            <Icon :svg="strokeIconPaths.download" :size="18" svg-class="mr-1 inline" /> 下载当前结果
          </button>
        </div>
      </div>
      <div v-if="isOrders() && monitoringManaged" class="grid grid-cols-4 gap-3 border-b border-[#e2e2dc] px-4 py-3"><div v-for="item in [{ label: '运单总量', value: ordersSeed.length }, { label: '监听中', value: monitoring.orders.filter(order => order.projectId === store.currentProjectId && ['active', 'subscribing'].includes(order.session)).length }, { label: '高风险', value: ordersSeed.filter(order => order.risk === '高风险').length }, { label: '已完成', value: ordersSeed.filter(order => order.status === '已完成').length }]" :key="item.label"><div class="text-xs text-slate-600">{{ item.label }}</div><div class="mt-1 text-lg font-semibold text-slate-900">{{ item.value }}</div></div></div>
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
            </select>
          </label>
          <label class="text-xs text-slate-500"
            ><span class="mb-1 block">运单状态</span>
            <select v-model="ordersStatusFilter" class="min-h-[40px] rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm text-slate-700">
              <option>全部</option>
              <option>待发车</option>
              <option>装货中</option>
              <option>在途</option>
              <option>已到达</option>
              <option>已完成</option>
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
      <div ref="scroller" class="order-list-table min-h-0 min-w-0 flex-1 overflow-auto">
        <table class="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead class="sticky top-0 z-10 bg-[#f7f7f5]">
            <tr class="text-xs font-semibold text-slate-500">
              <th class="pl-4"><input type="checkbox" aria-label="选择本页运单" :checked="!!visible.length && checkedHere===visible.length" :indeterminate="checkedHere>0 && checkedHere<visible.length" @change="togglePage" /></th><th class="px-4 py-3 align-middle">运单</th>
              <th class="px-4 py-3 align-middle">线路</th>
              <th class="px-4 py-3 align-middle">状态</th>
              <th class="px-4 py-3 align-middle">风险</th>
              <th class="px-4 py-3 align-middle">异常说明</th>
              <th class="px-4 py-3 align-middle"><button type="button" title="切换开始时间排序" @click="sort=sort==='original'?'newest':sort==='newest'?'oldest':'original'">开始时间 {{sort==='newest'?'↓':sort==='oldest'?'↑':'↕'}}</button></th>
              <th class="px-4 py-3 align-middle">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#ededea] bg-white">
            <tr v-for="o in visible" :key="o.id" :data-order-id="o.id" class="hover:bg-[#f7f7f5]">
              <td class="pl-4"><input v-model="ids" type="checkbox" :aria-label="'选择运单 '+o.id" :value="o.id" /></td><td class="px-4 py-4 align-middle">
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
                <span v-if="o.riskTags?.includes('车辆未入网')" class="mr-1 inline-flex rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">车辆未入网</span><span v-if="o.risk!=='无风险'||!o.riskTags?.length" :class="tableRiskPillClass(o.risk)">{{ o.risk }}</span>
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
              <td colspan="8" class="p-8 text-center text-slate-400">暂无符合条件的数据</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="list-controls"><span>筛选命中 {{rows.length}} 条 · 本页 {{visible.length}} 条</span>
        <label class="ml-auto"><select v-model.number="size" aria-label="每页数量"><option v-for="n in [5,25,50,100]" :key="n" :value="n">{{n}} 条/页</option></select></label>
        <button aria-label="上一页" :disabled="page<=1" @click="page--"><Icon :svg="strokeIconPaths.chevron" :size="13" svg-class="rotate-180"/></button><span>{{page}} / {{pages}}</span><button aria-label="下一页" :disabled="page>=pages" @click="page++"><Icon :svg="strokeIconPaths.chevron" :size="13"/></button>
      </div>
      <div v-if="ids.length || submittedTask" class="list-controls batch-bar" aria-label="运单批量操作">
        <template v-if="ids.length"><strong>已选 {{ids.length}} 条运单</strong><span>本页已选 {{checkedHere}} 条</span>
          <button @click="ids=[]">清空选择</button><button v-if="actions.risk" :disabled="submitting" @click="quick('risk')">核验异常</button>
          <button v-if="actions.trace" :disabled="submitting" @click="quick('trace')">导出轨迹</button>
          <button class="primary" @click="discuss"><Icon :svg="strokeIconPaths.bot" :size="14"/>交给数字人</button></template>
        <button v-if="submittedTask" @click="viewSubmitted">已提交 · 查看任务</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.order-list-filters > label { max-width: 100%; }
.order-list-filters input[type='date'] { min-width: 0; }
.order-list-table { overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
.list-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0;padding:6px 16px;border-top:1px solid #e2e2dc;background:white;color:#475569;font-size:12px}
.list-controls button,.list-controls select{min-height:26px}.list-controls button:disabled{opacity:.4}
.batch-bar button{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border:1px solid #deded9;border-radius:5px}.batch-bar .primary{color:white;background:#0f172a}
@media(max-width:700px){.list-controls{gap:5px;padding:4px 8px}.order-list-filters{max-height:26dvh;overflow:auto}}
</style>
