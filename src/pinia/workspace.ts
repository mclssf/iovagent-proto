import { defineStore } from 'pinia';
import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import type { AgentConversation, ChatMessage } from '@/views/AgentWork/interface';

export interface BusinessRef { kind: '运单' | '异常运单' | '运输事件' | '任务结果'; id: string; label: string; orderId?: string; runId?: string; monitor?: boolean; detail?: string }
export interface CreationSource { projectId:string; page:string; entryType:string }
export interface Thread { id: string; projectId: string; title: string; updated: number; arranging?: boolean; messages: ChatMessage[]; refs: BusinessRef[]; createdFrom?:CreationSource }
interface Workspace { projectId: string; last: Record<string,string>; threads: Thread[]; favorites: string[]; recent: string[]; migrated: boolean; navCollapsed?:boolean }
export function workspaceKey() {
  let user = 'local';
  try { user = localStorage.getItem('iovagent_login_user') || user; } catch { /* Storage is optional. */ }
  return 'iovagent:workspace:v1:' + user;
}
const fresh = (projectId: string): Thread => ({ id: crypto.randomUUID(), projectId, title: '', updated: 0, messages: [], refs: [] });

export const useWorkspace = defineStore('workspace', () => {
  const key=workspaceKey();
  let saved: Partial<Workspace> = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { /* Leave old data untouched. */ }
  const data = reactive<Workspace>({ projectId:'', last:{}, threads:[], favorites:[], recent:[], migrated:false, ...saved });
  // Ignore the obsolete presentation preference; the active thread and its drafts stay intact.
  delete (data as Workspace & {panelOpen?:boolean}).panelOpen;
  for (const t of data.threads) for (const m of t.messages) {
    if (m.streaming || ['处理中','调用中'].includes(m.status || '')) Object.assign(m,{streaming:false,status:'已中断',text:'页面已重新加载，请重新提交未完成的请求。'});
  }
  for (const t of data.threads) if(t.messages.at(-1)?.role==='user') {
    t.messages.push({role:'agent',status:'已中断',text:'上次回复未完成，没有重新提交。'});
  }
  const active = computed(() => data.threads.find(t => t.projectId === data.projectId && t.id === data.last[data.projectId]));
  const recent = computed(() => data.threads.filter(t => !!data.projectId && t.projectId === data.projectId && t.messages.length).sort((a,b)=>b.updated-a.updated));
  const picker=ref(false), menu = ref(false), history = ref(false);
  let ownsDraft: ((id:string)=>boolean) | undefined;
  let creationSource:CreationSource | undefined;
  function withCreationSource(source:CreationSource, fn:()=>void) {
    creationSource=source;
    try {fn();} finally {creationSource=undefined;}
  }
  function registerDraftLookup(lookup:(id:string)=>boolean) { ownsDraft=lookup; }
  function create(projectId = data.projectId) {
    // A message-free thread may still own text, attachments or a skill draft.
    const previous=active.value;
    if(previous?.projectId===projectId && !previous.messages.length && !previous.refs.length && !previous.arranging && ownsDraft && !ownsDraft(previous.id)){
      if(creationSource && !previous.createdFrom)previous.createdFrom={...creationSource};
      return previous;
    }
    const t = fresh(projectId);
    if(creationSource)t.createdFrom={...creationSource};
    data.threads.push(t); data.last[projectId] = t.id;
    return active.value!;
  }
  function select(id:string) {
    data.projectId = id;
    if (id) data.recent = [id,...data.recent.filter(p=>p!==id)].slice(0,8);
    if (!active.value) create(id);
  }
  function open(t:Thread) { data.projectId=t.projectId; data.last[t.projectId]=t.id; }
  function remove(id:string) { data.threads=data.threads.filter(t=>t.id!==id); if (!active.value) create(); }
  function migrate(projects:Record<string,ChatMessage[]>, conversations:AgentConversation[], availableIds:string[]) {
    if (data.migrated) return;
    const add = (projectId:string,id:string,title:string,messages:ChatMessage[]) => {
      if (!messages.length || data.threads.some(t=>t.id===id)) return;
      data.threads.push({ projectId,id,title,updated:0,messages,refs:[] });
      data.last[projectId] ??= id;
    };
    for (const [id,msgs] of Object.entries(projects)) add(availableIds.includes(id)?id:'','legacy:'+id,'历史项目对话',msgs);
    for (const c of conversations) add('',c.id,c.title,c.messages);
    data.migrated=true;
  }
  const storageError=ref('');
  const encode=(value:unknown)=>JSON.stringify(value,(k,v)=>k==='file' && v?.url?.startsWith('blob:')?undefined:v);
  const revisions=(threads:Thread[])=>new Map(threads.map(t=>[t.id,encode(t)]));
  let known=revisions(saved.threads || []),lastRead:string|null= null,passive='';
  function mergeThreads(threads:Thread[]){
    const disk=revisions(threads),local=new Map(data.threads.map(t=>[t.id,t]));
    for(const incoming of threads){
      const t=local.get(incoming.id),base=known.get(incoming.id);
      if(disk.get(incoming.id)===base || (t?encode(t):undefined)!==base)continue;
      if(t)Object.assign(t,incoming);else data.threads.push(incoming);
    }
    for(const [id,base] of known)if(!disk.has(id) && local.has(id) && encode(local.get(id))===base)
      data.threads=data.threads.filter(t=>t.id!==id);
    known=disk;
  }
  function readShared(raw:string|null){
    if(raw && raw!==lastRead){
      const threads=JSON.parse(raw)?.threads;
      if(Array.isArray(threads))mergeThreads(threads);
    }
    lastRead=raw;
  }
  function persist() {
    try {
      readShared(localStorage.getItem(key));
      const value=encode(data);
      if(value!==passive && value!==lastRead){localStorage.setItem(key,value);lastRead=value;known=revisions(data.threads);}
      passive='';storageError.value='';
    }
    catch { storageError.value='本地空间不足，最近更改仅保留在本次页面中。'; }
  }
  // Share conversation records, never the other tab's active project, selected thread or return receipt.
  function syncThreads(event:StorageEvent){
    if(event.key!==key || !event.newValue || event.newValue!==localStorage.getItem(key))return;
    try{readShared(event.newValue);passive=encode(data);}catch{/* Preserve the current workspace. */}
  }
  if(typeof window!=='undefined' && window.addEventListener){
    window.addEventListener('storage',syncThreads);onScopeDispose(()=>window.removeEventListener('storage',syncThreads));
  }
  watch(data,persist,{deep:true});
  return { data,active,recent,menu,history,picker,create,select,open,remove,migrate,persist,storageError,registerDraftLookup,withCreationSource };
});
