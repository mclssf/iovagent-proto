<script setup lang="ts">
import {computed,ref,watch,nextTick,onBeforeUnmount} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {Icon} from '@packages/icon';
import {strokeIconPaths} from '@/views/AgentWork/strokeIconPaths';
import {agentWorkData} from '@/pinia/agentWork';
import {usePhase1} from '@/pinia/phase1';
import {loadAMap,convertGpsCoordinates} from '@/utils/amap';
import {stateNames,sessionNames,dateText} from './catalog';
import {transportTimeline} from './transportTimeline';
import {ElDialog,ElButton} from 'element-plus';
import type {P1State} from '@/views/AgentWork/interface';
const route=useRoute(),router=useRouter(),work=agentWorkData(),s=usePhase1();
const order=computed(()=>s.orders.find(o=>o.projectId===work.currentProjectId&&o.id===route.query.orderId));
const abnormalities=computed(()=>s.anomalies.filter(a=>a.orderId===order.value?.id));
const active=computed(()=>abnormalities.value.filter(a=>a.status==='active'));
const view=ref('agent'),onlyAbnormal=ref(false),feedback=ref('');
const rows=computed(()=>order.value?[{label:'运单号',value:order.value.id},{label:'车牌 / 司机',value:`${order.value.plate} · ${order.value.driver}`},{label:'运输状态',value:stateNames[order.value.state]},{label:'监听状态',value:sessionNames[order.value.session]},{label:'起始地',value:order.value.origin.name},{label:'目的地',value:order.value.destination.name}]:[]);
const milestones=[{state:'pending',label:'运单创建',key:'createdAt',next:'loading',action:'开始装货'},{state:'loading',label:'装货中',key:'enteredAt',next:'in_transit',action:'发出'},{state:'in_transit',label:'在途',key:'departedAt',next:'arrived',action:'已到达'},{state:'arrived',label:'已到达',key:'arrivedAt',next:'completed',action:'已完成'},{state:'completed',label:'已完成',key:'completedAt'}] as const;
const editing=ref<Exclude<P1State,'pending'>>(),editTime=ref(''),editError=ref('');
function openUpdate(state:Exclude<P1State,'pending'>,time?:number){editing.value=state;editTime.value=dateText(time??s.now).replace(' ','T');editError.value='';}
function saveUpdate(){if(!order.value||!editing.value)return;editError.value=s.updateMilestone(order.value.id,editing.value,editTime.value?Date.parse(`${editTime.value}:00+08:00`):NaN);if(!editError.value){feedback.value='节点时间与运输状态已更新';editing.value=undefined;}}
const timeline=computed(()=>order.value?transportTimeline(order.value,s.events,abnormalities.value):[]);
const mapEl=ref<HTMLDivElement>(),mapError=ref('');let map:AMap.Map|undefined;let generation=0;
watch(()=>[order.value?.id,order.value?.origin.radiusMeters,order.value?.destination.radiusMeters],async ()=>{const o=order.value;const g=++generation;map?.destroy();map=undefined;mapError.value='';await nextTick();if(!o||!mapEl.value)return;try{const a=await loadAMap();const points=await convertGpsCoordinates(a,[[o.origin.lon,o.origin.lat],[o.destination.lon,o.destination.lat]]);if(g!==generation||!mapEl.value)return;map=new a.Map(mapEl.value,{center:points[0],zoom:8});map.add(points.map((p,i)=>new a.Marker({position:p,title:i?o.destination.name:o.origin.name})));map.add(points.map((p,i)=>new a.Circle({center:p,radius:i?o.destination.radiusMeters:o.origin.radiusMeters,strokeColor:'#475569',strokeWeight:1,fillColor:'#94a3b8',fillOpacity:.15})));map.setFitView();}catch(error){if(g===generation)mapError.value=error instanceof Error&&error.message.includes('VITE_AMAP_KEY')?'尚未配置高德地图Key，请按地图接入说明配置后重启服务。':'高德地图加载失败，请检查网络、域名白名单和安全代理。';}},{immediate:true});
onBeforeUnmount(()=>{generation++;map?.destroy();});
</script>
<template>
 <div class="flex h-full flex-col space-y-3">
  <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
   <div class="flex h-12 items-center justify-between border-b border-[#e2e2dc] px-4"><div class="flex items-center gap-2.5"><Icon :svg="strokeIconPaths.map" :size="16"/><h1 class="text-sm font-semibold">运单详情</h1></div><button class="detail-button" @click="router.push('/index/orders')">返回运单列表</button></div>
   <div v-if="order" class="detail-overview grid grid-cols-6 gap-3 p-4 text-sm"><div v-for="row in rows" :key="row.label" class="rounded-md bg-[#f7f7f5] p-3"><div class="text-xs text-slate-500">{{row.label}}</div><div class="mt-1 truncate text-sm font-semibold" :title="row.value">{{row.value}}</div></div></div>
  </div>
  <div v-if="order" class="detail-columns grid h-0 flex-1 grid-cols-[1.15fr_0.85fr] gap-4">
   <div class="flex h-full flex-col overflow-hidden rounded-md border border-[#deded9] bg-white"><div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-4"><h2 class="text-sm font-semibold">地图轨迹</h2><span class="text-xs text-red-600">{{active.length}}项未处理异常</span></div><div class="relative min-h-[300px] flex-1"><div ref="mapEl" class="absolute inset-0"></div><div v-if="mapError" class="absolute inset-0 flex items-center justify-center bg-slate-50 p-5 text-sm text-slate-500">{{mapError}}</div><div class="pointer-events-none absolute left-4 top-4 rounded-md border bg-white/95 p-3 text-xs"><strong>{{order.origin.name}} → {{order.destination.name}}</strong><p class="mt-1 text-slate-500">起始地半径{{order.origin.radiusMeters}}米 · 目的地半径{{order.destination.radiusMeters}}米</p></div></div><p class="border-t p-3 text-xs text-slate-500">当前样例仅提供起终点，未提供实际轨迹。监听截止{{dateText(order.expiresAt)}}；{{order.endReason||'按任务配置执行'}}。</p></div>
   <div class="flex h-full flex-col overflow-hidden rounded-md border border-[#deded9] bg-white"><div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e2e2dc] px-3"><h2 class="text-sm font-semibold">运输事件</h2><button class="detail-button" :class="{'text-red-600':onlyAbnormal}" @click="onlyAbnormal=!onlyAbnormal">{{onlyAbnormal?'查看全部':'只看异常事件'}}</button></div><div class="m-3 flex shrink-0 rounded-md bg-[#f2f2ef] p-1 text-xs"><button v-for="item in [{id:'agent',label:'智能体判断'},{id:'rule',label:'规则判断'}]" :key="item.id" class="flex-1 rounded-md px-3 py-2" :class="view===item.id?'bg-white':'text-slate-500'" @click="view=item.id">{{item.label}}</button></div>
    <div class="min-h-0 flex-1 space-y-3 overflow-auto px-3 pb-3">
     <p v-if="feedback" role="status" class="rounded-md bg-slate-50 p-3 text-xs">{{feedback}}</p>
     <section v-for="item in milestones.filter(m=>!onlyAbnormal||timeline.some(e=>e.stage===m.state&&e.abnormal))" :key="item.state" class="rounded-md border border-[#deded9] p-3" :class="{'border-slate-500':order.state===item.state}">
      <div class="flex justify-between gap-2"><strong class="text-sm">{{item.label}}<span v-if="item.state==='pending'" class="ml-2 text-xs font-normal text-slate-500">待发车</span></strong><div class="flex items-center gap-2"><small class="text-xs text-slate-500">{{dateText(order[item.key])}}</small><button v-if="item.state!=='pending'" class="detail-button" :aria-label="`更新${item.label}时间`" @click="openUpdate(item.state,order[item.key])">更新</button></div></div>
      <p class="mt-2 text-xs text-slate-500">触发方式：{{item.state==='pending'?order.source:order[item.key]?(order.milestoneMethods?.[item.state]||'围栏事件'):'尚未触发'}}<span v-if="order.state===item.state"> · 当前状态</span></p>
      <p v-if="item.state==='in_transit'||item.state==='arrived'" class="mt-1 text-xs text-slate-500">计划{{dateText(item.state==='in_transit'?order.plannedDeparture:order.plannedArrival)}}</p>
      <p v-if="item.state!=='pending'" class="mt-1 text-xs text-slate-500">{{item.state==='loading'?'进入起始地':item.state==='in_transit'?'离开起始地':item.state==='arrived'?'进入目的地':'离开目的地'}}：{{dateText(s.events.filter(e=>e.orderId===order.id&&e.type==='fence'&&e.target===(['loading','in_transit'].includes(item.state)?'origin':'destination')&&e.phase===(['loading','arrived'].includes(item.state)?'enter':'exit')).sort((a,b)=>a.occurredAt-b.occurredAt)[0]?.occurredAt)}}</p>
      <article v-for="e in timeline.filter(e=>e.stage===item.state&&(!onlyAbnormal||e.abnormal))" :key="e.id" class="anomaly-card" :class="view==='agent'?(e.risk==='高风险'?'risk-high':'risk-low'):'risk-neutral'">
       <div class="anomaly-title"><strong>{{e.label}}</strong><span v-if="view==='agent'" class="risk-tag">{{e.risk}}</span><time class="anomaly-time">{{dateText(e.at)}}</time></div>
       <p v-if="e.parameters?.trim()" class="anomaly-parameters" :title="e.parameters">{{e.parameters}}</p>
       <p v-if="view==='agent'&&['在途离线','超时停车'].includes(e.label)&&(e.basis||'').trim()" class="anomaly-basis" :title="e.basis">研判依据：{{e.basis}}</p>
      </article>
      <p v-if="!timeline.some(e=>e.stage===item.state)&&item.state!=='pending'" class="mt-3 text-xs text-slate-400">暂无子事件</p>
     </section><p v-if="onlyAbnormal&&!timeline.some(e=>e.abnormal)" class="p-4 text-center text-xs text-slate-500">暂无未处理异常</p>
    </div>
   </div>
  </div><p v-else class="p-8 text-sm text-slate-500">当前项目没有该运单，请从运单列表进入。</p>
  <ElDialog :model-value="!!editing" title="更新节点时间" width="460px" style="max-width:calc(100vw - 32px)" :close-on-click-modal="false" @close="editing=undefined"><p class="mb-3 text-sm">{{editing?stateNames[editing]:''}} · 北京时间</p><label class="block text-sm">节点时间<input v-model="editTime" aria-label="节点时间" type="datetime-local" class="mt-2 block w-full rounded-md border p-2"/></label><p class="mt-3 text-xs leading-5 text-slate-500">更新此节点时间，当前状态按已记录的最后一个运输节点确定；保留后续节点，不生成围栏事实。最晚可填{{dateText(s.now)}}。</p><p v-if="editError" role="alert" class="mt-3 text-sm text-red-600">{{editError}}</p><template #footer><ElButton @click="editing=undefined">取消</ElButton><ElButton type="primary" @click="saveUpdate">保存更新</ElButton></template></ElDialog>
 </div>
</template>
<style scoped>
.anomaly-card{margin-top:10px;padding:10px 12px;border:1px solid #e2e2dc;border-radius:5px;font-size:12px;line-height:20px}.anomaly-title{display:flex;align-items:center;gap:8px;height:20px}.anomaly-time{margin-left:auto;flex-shrink:0;font-size:11px;color:#64748b}.anomaly-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.risk-neutral{background:#fff;border-color:#e2e2dc}.risk-high{background:#fff8f7;border-color:#f0d7d2}.risk-low{background:#f7fafc;border-color:#dce5ec}.risk-tag{flex-shrink:0;border-radius:4px;padding:0 6px;background:#f8e4df;color:#a44230;font-size:11px}.risk-low .risk-tag{background:#e6eef5;color:#43647f}.anomaly-parameters,.anomaly-basis{margin:3px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b}.anomaly-basis{color:#475569}.detail-button{border:1px solid #deded9;border-radius:5px;background:#fff;padding:5px 9px;font-size:12px;color:#475569}.detail-button:hover{background:#f7f7f5}@media(max-width:950px){.detail-columns{display:flex;height:auto;flex-direction:column;overflow:auto}.detail-columns>div{flex-shrink:0}.detail-columns>div:first-child{height:380px;min-height:380px}.detail-columns>div:last-child{height:650px;min-height:650px}.detail-overview{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:560px){.detail-overview{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
