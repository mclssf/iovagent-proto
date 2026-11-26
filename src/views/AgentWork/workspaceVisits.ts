import { computed, nextTick, onMounted, onScopeDispose, shallowRef, type Ref } from 'vue';
import { defineStore } from 'pinia';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import { ElMessage } from 'element-plus';
import { workspaceKey, useWorkspace } from '@/pinia/workspace';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { agentWorkRouteName as names, projectHasPage } from './useAgentWorkNav';

export const chatRoute=names.agent;
const labels:Record<string,string>={
  orders:'运单列表',risk:'异常运单',detail:'运单详情',analytics:'项目看板','daily-tasks':'任务',
  'cargo-sources':'我发布的货源','cargo-quotes':'报价抢单','private-capacity':'私有运力池',
  projects:'项目配置','project-create':'项目设置',downloads:'下载','knowledge-base':'项目知识库','knowledge-base-empty':'项目知识库',
};
export const viewLabel=(name:unknown)=>labels[String(name).replace(/^agent-work-/,'')] || '业务页面';
type Route=Pick<RouteLocationNormalizedLoaded,'name'|'fullPath'|'query'>;
interface Receipt {id:string; projectId:string; name:string; path:string; entryType:string; detailId?:string}
interface Visit extends Receipt {fields:Record<string,unknown>; scroll:Record<string,[number,number]>; sourceKey?:string}
interface HistoryEntry {key:string; id:string}
interface BrowserNavigation {
  currentEntry?:HistoryEntry;
  entries():HistoryEntry[];
  traverseTo(key:string):{finished:Promise<unknown>};
}
const navigation=()=>(window as Window & {navigation?:BrowserNavigation}).navigation;
const areas=()=>Array.from(document.querySelectorAll<HTMLElement>('[data-business-view] [data-view-scroll]'));

export const useWorkspaceVisits=defineStore('workspaceVisits',()=>{
  const router=useRouter(), key=workspaceKey()+':business-visits';
  const records=shallowRef<Record<string,Visit>>({});
  try{records.value=JSON.parse(sessionStorage.getItem(key)||'{}').records || {};}catch{/* Tab memory remains available. */}
  const readers=new Map<string,()=>unknown>();
  // Never persist traversal authority: a duplicated tab or a reload can restore a snapshot, not this proof.
  const anchors=new Map<string,HistoryEntry & {visitId:string}>();
  const revision=shallowRef(0);
  const businessEntry=shallowRef<string>(window.history.state?.businessVisit || '');
  let navigating=0,returning=false;
  router.afterEach((_to,_from,failure)=>{
    if(failure)return;
    businessEntry.value=window.history.state?.businessVisit || '';
    revision.value++; navigating++; returning=false;
  });
  function capture(route:Route,projectId:string,entryType='业务页面'):Visit|undefined {
    if(!projectId || !route.name || route.name===chatRoute)return;
    const v:Visit={id:crypto.randomUUID(),projectId,name:String(route.name),path:route.fullPath,entryType,
      fields:JSON.parse(JSON.stringify(Object.fromEntries([...readers].map(([k,read])=>[k,read()])))),
      scroll:Object.fromEntries(areas().map(el=>[el.dataset.viewScroll!,[el.scrollLeft,el.scrollTop]]))};
    if(v.name===names.detail)v.detailId=(v.fields.detail as {orderId?:string})?.orderId;
    if(v.name===names.dailyTasks && route.query.monitor!=='1')v.detailId=(v.fields.tasks as {selected?:string})?.selected;
    router.options.history.replace(route.fullPath,{businessVisit:v.id});
    const entry=navigation()?.currentEntry;
    if(entry){v.sourceKey=entry.key;anchors.set(entry.key,{key:entry.key,id:entry.id,visitId:v.id});}
    records.value={...records.value,[v.id]:v};
    try{sessionStorage.setItem(key,JSON.stringify({records:records.value}));}catch{/* Optional persistence. */}
    return v;
  }
  function entry(route:Route){
    const v=records.value[window.history.state?.businessVisit];
    return v && v.name===route.name && v.path===route.fullPath?v:undefined;
  }
  function receipt(route:Route):Receipt|undefined{
    // A URL, even one copied from this browser, is not an entry into the workspace.
    void revision.value;
    const state=window.history.state, r=state?.returnReceipt;
    if(route.name===chatRoute && state?.aiPath===route.fullPath && r?.id && r.id===state.returnContextId)return r;
  }
  function register(key:string,read:()=>unknown){
    readers.set(key,read);return ()=>{if(readers.get(key)===read)readers.delete(key);};
  }
  async function restoreScroll(route:Route){
    const v=entry(route); if(!v)return;
    await nextTick();
    requestAnimationFrame(()=>{
      if(entry(route)?.id!==v.id)return;
      for(const el of areas()){const xy=v.scroll[el.dataset.viewScroll!];if(xy)el.scrollTo(...xy);}
    });
  }
  async function restore(v:Receipt,fallback:()=>Promise<unknown>,exact:boolean){
    if(returning)return;
    returning=true;const request=++navigating;
    try{
      const native=navigation(), key=records.value[v.id]?.sourceKey, anchor=key && anchors.get(key);
      if(exact && native && anchor && anchor.visitId===v.id && native.entries().some(e=>e.key===anchor.key && e.id===anchor.id)){
        try{await native.traverseTo(anchor.key).finished;return;}catch{/* The entry may have just been pruned. */}
      }
      if(request===navigating && receipt(router.currentRoute.value)?.id===v.id) await fallback();
    }finally{if(request===navigating)returning=false;}
  }
  function cancelRestore(){navigating++;returning=false;}
  function confirmDeparture(id:string){
    // Vue Router replaces the departing entry's state (its forward pointer) before it pushes.
    const key=records.value[id]?.sourceKey;
    const entry=key && navigation()?.entries().find(e=>e.key===key);
    if(entry && anchors.get(entry.key)?.visitId===id && receipt(router.currentRoute.value)?.id===id)
      anchors.set(entry.key,{key:entry.key,id:entry.id,visitId:id});
  }
  return {records,businessEntry,capture,entry,receipt,register,restoreScroll,restore,cancelRestore,confirmDeparture};
});

export function useBusinessViewState<T>(key:string,read:()=>T,restore:(value:T)=>void){
  const visits=useWorkspaceVisits(),ws=useWorkspace(),route=useRoute();
  onScopeDispose(visits.register(key,read));
  onMounted(()=>{
    const v=visits.entry(route);
    if(v?.projectId===ws.data.projectId && v.fields[key]!==undefined)restore(structuredClone(v.fields[key]) as T);
  });
}
export function useBusinessFields(key:string,fields:Record<string,Ref>){
  useBusinessViewState(key,()=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])),saved=>{
    for(const [k,v] of Object.entries(fields))if(k in saved)v.value=saved[k];
  });
}

export function useFullWorkspace(){
  const route=useRoute(),router=useRouter(),ws=useWorkspace(),work=agentWorkData(),visits=useWorkspaceVisits(),tasks=useAgentDailyTasks();
  const source=computed(()=>visits.receipt(route));
  const target=computed(()=>{
    const v=source.value;if(!v)return;
    const p=work.projects.find(p=>p.id===v.projectId);
    if(!p)return {label:'选择可访问项目',warning:'来源项目已删除或无权访问。',name:'',exact:false};
    const prefix=p.id===ws.data.projectId?'':p.name+' · ';
    const fallback=(name:string,warning:string)=>({name,exact:false,warning,label:'前往'+p.name+' · '+viewLabel(name)});
    if(!router.hasRoute(v.name) || router.resolve(v.path).name!==v.name || !projectHasPage(v.name,p.skillIds))
      return fallback(names.analytics,'来源页面已移除或未在项目中启用，已打开项目看板。');
    const {query}=router.resolve(v.path),snapshot=visits.records[v.id];
    const orderId=query.orderId || v.detailId;
    if(v.name===names.detail && orderId && !work.projectOrders(p.id).some(o=>o.id===orderId))
      return fallback(names.orders,'原运单详情已不可用，已返回该项目的运单列表。');
    if(v.name===names.dailyTasks && query.monitor!=='1'){
      const id=v.detailId || query.taskId;
      if(id && !tasks.tasks.some(t=>t.id===id && (!t.projectId || work.projects.some(p=>p.id===t.projectId))))
        return fallback(names.dailyTasks,'原任务详情已不可用，已打开任务列表。');
    }
    return {name:v.name,label:'返回'+prefix+viewLabel(v.name),exact:true,warning:snapshot?'':'页面状态已失效，只恢复来源页面。'};
  });
  function enter(projectId=ws.data.projectId,prepare?:()=>void,entryType='AI 工作台'){
    const p=work.projects.find(p=>p.id===projectId);
    if(!p){ws.picker=true;return false;}
    visits.cancelRestore();
    const inside=route.name===chatRoute, from=inside?source.value:visits.capture(route,ws.data.projectId,entryType);
    const creation={projectId:ws.data.projectId||p.id,page:String(route.name||chatRoute),entryType};
    ws.withCreationSource(creation,()=>{
      if(ws.data.projectId!==p.id)work.switchProject(p);
      prepare?.();
    });
    ws.menu=false;
    const to={name:chatRoute,query:{projectId:p.id,chat:ws.active?.id}}, aiPath=router.resolve(to).fullPath;
    const receipt=from?{id:from.id,projectId:from.projectId,name:from.name,path:from.path,entryType:from.entryType,...(from.detailId?{detailId:from.detailId}:{})}:null;
    void router.push({...to,state:{aiPath,returnContextId:from?.id||null,returnReceipt:receipt}}).then(failure=>{
      if(!failure && !inside && from)visits.confirmDeparture(from.id);
    });
    return true;
  }
  function back(){
    const v=source.value,t=target.value;if(!v || !t)return;
    if(!t.name){ElMessage.info(t.warning);ws.picker=true;return;}
    if(t.warning)ElMessage.info(t.warning);
    void visits.restore(v,()=>{
      const resolved=router.resolve(v.path);
      const detailQuery=!visits.records[v.id] && v.detailId?{[v.name===names.detail?'orderId':'taskId']:v.detailId}:{};
      const to=t.exact?{path:resolved.path,query:{...resolved.query,...detailQuery},hash:resolved.hash}:{name:t.name,query:{projectId:v.projectId,...(t.name===names.dailyTasks?{view:'list'}:{})}};
      return router.replace({...to,state:{aiPath:null,returnReceipt:null,returnContextId:null,
        businessVisit:t.exact?v.id:null,businessProject:v.projectId,identityPath:router.resolve(to).fullPath}});
    },t.exact);
  }
  return {enter,source,target,back};
}
