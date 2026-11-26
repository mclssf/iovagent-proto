import { useWorkspace, type BusinessRef } from '@/pinia/workspace';
import { useSkillComposer } from '@/pinia/skillComposer';
import { agentWorkData } from '@/pinia/agentWork';

import { useFullWorkspace } from './workspaceVisits';

export function useWorkspaceChat() {
  const ws=useWorkspace(), work=agentWorkData(), composer=useSkillComposer();
  const {enter}=useFullWorkspace();
  return (projectId:string, refs:BusinessRef[], prompt:string, sourceId?:string, arrange=false) => {
    const p=work.projects.find(p=>p.id===projectId);
    if (!p) return false;
    return enter(p.id,()=>{
    const source=ws.data.threads.find(t=>t.id===sourceId && t.projectId===p.id);
    if(source) ws.open(source); else ws.create();
    ws.active!.refs=refs.map(r=>({...r}));
    ws.active!.arranging = arrange;
    if(!source || !composer.draft.text)composer.edit(prompt);
    },refs[0]?.kind==='任务结果'?(prompt.startsWith('调整任务')?'调整任务':'追问结果'):arrange?'新建任务':'交给数字人');
  };
}
