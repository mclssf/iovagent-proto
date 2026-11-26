import { computed, reactive, ref, watch } from 'vue';
import { readDraftFiles, writeDraftFiles } from './draftFiles';
import { useWorkspace, workspaceKey } from './workspace';
import { defineStore } from 'pinia';
import { agentWorkData } from './agentWork';
import { useAgentOpsStore, type AgentCallableSkill } from './agentOps';
import { currentWechatEnterpriseId } from './dataEmployeeSkills';
import type { SummonedSkill } from '@/views/AgentWork/interface';

export const unavailableNotice = '该技能已不可用，输入内容已保留。请重新选择技能，或按普通对话发送。';
interface Draft {
  text: string; files: File[]; skillId: string; template: string; automatic: boolean; revision: number; notice: string;
}
const empty = (): Draft => ({ text: '', files: [], skillId: '', template: '', automatic: false, revision: 0, notice: '' });
export const useSkillComposer = defineStore('skillComposer', () => {
  const work = agentWorkData();
  const ops = useAgentOpsStore();
  const customerId = ref(currentWechatEnterpriseId);
  const drafts = reactive<Record<string, Draft>>({});
  const ws=useWorkspace();
  try { Object.assign(drafts,JSON.parse(localStorage.getItem(workspaceKey()+':drafts') || '{}')); } catch {}
  const loadingFiles=new Set(Object.keys(drafts));
  ws.registerDraftLookup(id=>Object.entries(drafts).some(([k,d])=>
    JSON.parse(k)[3]===id && Boolean(loadingFiles.has(k) || d.text || d.skillId || d.files.length)));
  watch(drafts,()=>{ try { localStorage.setItem(workspaceKey()+':drafts',JSON.stringify(drafts,(key,v)=>key==='files'?[]:v)); } catch {} },{deep:true});
  const storagePrefix = typeof localStorage === 'undefined' ? '' : workspaceKey() + ':';
  const reportFileError = () => { ws.storageError = '附件仅保留在本次页面中，刷新后请重新选择文件。'; };
  for (const [k, original] of Object.entries(drafts)) {
    const revision = original.revision;
    void readDraftFiles(storagePrefix+k).then(files=>{
      if (drafts[k]===original && original.revision===revision && !original.files.length) original.files=files;
    }).catch(reportFileError).finally(()=>loadingFiles.delete(k));
  }
  const discard = (k:string) => {
    delete drafts[k];
    void writeDraftFiles(storagePrefix+k,[]).catch(reportFileError);
  };
  watch(()=>ws.data.threads.map(t=>t.id), (ids,previous)=>{
    const removed=previous.filter(id=>!ids.includes(id));
    if(removed.length) for(const k of Object.keys(drafts)) if(removed.includes(JSON.parse(k)[3])) discard(k);
  });
  const panel = ref<'global' | 'composer' | null>(null);
  const focusRequest = ref(0);
  const agentId = computed(() => work.workspaceMode === 'project' ? 'project-chat-agent' : work.conversationAgentId);
  function scopeFor(target: string, projectId = work.currentProjectId, fresh = false) {
    if(ws.active) return JSON.stringify([customerId.value,target,ws.data.projectId,ws.active.id]);
    const project = target === 'project-chat-agent';
    const messages = project && (work.workspaceMode === 'project' && projectId === work.currentProjectId ? work.agentMessages : work.projectChats[projectId]);
    const segment = messages ? [...messages].reverse().find(m => m.sessionDivider)?.sessionDivider?.createdAt ?? 0 : 0;
    return JSON.stringify([customerId.value, target, project ? projectId : '', project ? segment :
      !fresh && agentId.value === target ? work.currentConversationId : '']);
  }
  const key = computed(() => scopeFor(agentId.value));
  function get(k: string) { drafts[k] ??= empty(); return drafts[k]; }
  const draft = computed(() => get(key.value));
  const available = computed(() => ops.summonSkills(customerId.value, agentId.value)
    .filter(skill => !ws.data.projectId || !!work.currentProject.skillIds?.includes(skill.id)));
  const selected = computed(() => available.value.find(s => s.id === draft.value.skillId));
  function edit(text: string) { Object.assign(draft.value, { text, automatic: false }); draft.value.revision++; }
  function attach(files: File[]) { draft.value.files = files; draft.value.revision++; void writeDraftFiles(storagePrefix+key.value,[...files]).catch(reportFileError); }
  function cancel(d = draft.value, notice = '') {
    Object.assign(d, { skillId: '', template: '', automatic: false, notice }); d.revision++;
  }
  function refresh() { ops.refreshSummonConfig(); }
  function invalidate() {
    if (draft.value.skillId && !selected.value) { cancel(draft.value, unavailableNotice); return true; }
    return false;
  }
  function bind(id: string) {
    refresh();
    const skill = available.value.find(s => s.id === id);
    if (!skill) throw new Error(unavailableNotice);
    const d = draft.value;
    if (d.skillId === id) return;
    const template = skill.recommendedPrompt?.trim() ? skill.recommendedPrompt : '';
    const fill = !d.text || d.automatic;
    Object.assign(d, { skillId: id, template, automatic: fill && !!template, notice: '' });
    if (fill) d.text = template;
    d.revision++;
  }
  function useTemplate() {
    if (!selected.value || !draft.value.template) return;
    Object.assign(draft.value, { text: draft.value.template, automatic: true }); draft.value.revision++;
  }
  function validate(id: string): SummonedSkill | undefined {
    if (!id) return;
    refresh();
    const skill = available.value.find(s => s.id === id);
    if (!skill) {
      if (draft.value.skillId === id) cancel(draft.value, unavailableNotice);
      throw new Error(unavailableNotice);
    }
    return { id, name: skill.name, agentId: agentId.value, customerId: customerId.value };
  }
  function accepted(submittedKey: string, revision: number) {
    const submitted = get(submittedKey);
    // A delayed submission must never move its draft into the newly active conversation.
    if (submitted.revision === revision) discard(submittedKey);
  }
  function clearSession() { for (const k of Object.keys(drafts)) delete drafts[k]; panel.value = null; }
  return { customerId, agentId, available, draft, selected, key, panel, focusRequest, scopeFor, get, edit, attach, bind, cancel, validate,
    invalidate, refresh, accepted, useTemplate, clearSession };
});

export function summonIcon(skill: Pick<AgentCallableSkill, 'id' | 'category'>) {
  const byId = { 'operations-logistics-sheet': 'fileSpreadsheet', 'operations-license-recognition': 'scanText',
    'gps-trace-expert': 'waypoints', 'delivery-sla-expert': 'alarmClock', 'vehicle-location-query': 'locate', 'vehicle-trace-query': 'route' } as const;
  return byId[skill.id as keyof typeof byId] ?? ({ '在途专家': 'shield', '运营助手': 'panels', '数据员工': 'file',
    '经营分析参谋': 'list', '运力与货源': 'truck' } as const)[skill.category];
}
