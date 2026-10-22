import type {P1Log,P1Event,P1Anomaly,P1SkillId} from '@/views/AgentWork/interface';
import {riskDetail,stateUpdate} from './eventRisk';
const HOUR=3600000;
export function hourlyResults(logs:P1Log[],events:P1Event[],anomalies:P1Anomaly[],projectId:string,taskId:P1SkillId,now:number,orderId=''){
 const scoped=logs.filter(l=>l.projectId===projectId&&l.taskId===taskId&&(!orderId||l.orderId===orderId));
 if(!scoped.length)return [];
 const end=Math.floor(now/HOUR)*HOUR;const first=Math.floor(Math.min(...scoped.map(l=>l.at))/HOUR)*HOUR;
 const reports=[];
 for(let start=first;start<end;start+=HOUR){
  const stop=start+HOUR;const within=(t:number)=>t>=start&&t<stop;
  const steps=scoped.filter(l=>within(l.at));
  const monitored=[...new Set(scoped.filter(l=>l.at<stop).map(l=>l.orderId))].filter(id=>{const history=scoped.filter(l=>l.orderId===id&&l.at<stop);return history.some(l=>within(l.at))||history.at(-1)?.kind!=='结束';});
  const active=monitored.length>0;
  if(!active)continue;
  const facts=events.filter(e=>e.projectId===projectId&&e.taskIds.includes(taskId)&&within(e.receivedAt)&&(!orderId||e.orderId===orderId));
  const alarms=anomalies.filter(a=>scoped.some(l=>l.orderId===a.orderId)&&a.taskId===taskId&&within(a.firstAt)&&(!orderId||a.orderId===orderId));
  const orderIds=monitored;
  const failures=steps.filter(l=>l.kind==='失败');const results=steps.filter(l=>l.kind==='结果');
  const riskRows=facts.map(e=>riskDetail(e,anomalies)).filter((r):r is NonNullable<typeof r>=>!!r);
  for(const a of alarms.filter(a=>!a.eventId||!events.some(e=>e.id===a.eventId)))riskRows.push({id:a.id,orderId:a.orderId,type:a.kind,parameters:'位置见运单起终点；按计划时间或状态校验',at:a.firstAt,risk:'高风险',basis:a.reason});
  const updateRows=taskId==='p1-status'?facts.map(stateUpdate).filter((r):r is NonNullable<typeof r>=>!!r):[];
  reports.push({id:`${projectId}-${taskId}-${start}`,start,end:stop,steps,orderIds,riskRows,updateRows,highRisk:riskRows.filter(r=>r.risk==='高风险').length,lowRisk:riskRows.filter(r=>r.risk==='低风险').length,events:facts.length,newAnomalies:alarms.length,
   reasonable:facts.filter(e=>e.assessment?.verdict==='reasonable').length,review:facts.filter(e=>e.assessment&&e.assessment.verdict!=='reasonable').length,
   updates:updateRows.length,reminders:steps.filter(l=>l.kind==='提醒').length,recoveries:steps.filter(l=>l.kind==='恢复').length,failures:failures.length,
   details:orderIds.map(id=>({id,events:facts.filter(e=>e.orderId===id).length,anomalies:alarms.filter(a=>a.orderId===id).map(a=>a.kind),result:steps.filter(l=>l.orderId===id&&['结果','失败','结束'].includes(l.kind)).at(-1)?.text||'本时段已执行，无新增处理结果。'}))});
 }
 return reports.reverse();
}
