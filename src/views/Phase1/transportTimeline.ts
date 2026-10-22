import type {P1Order,P1Event,P1Anomaly,P1State} from '@/views/AgentWork/interface';
import {eventRisk,eventParameters} from './eventRisk';
import {eventNames} from './catalog';
export function transportTimeline(order:P1Order,events:P1Event[],anomalies:P1Anomaly[]){
 const stageAt=(at:number):P1State=>{
  if(order.completedAt&&at>=order.completedAt)return 'completed';
  if(order.arrivedAt&&at>=order.arrivedAt)return 'arrived';
  if(order.departedAt&&at>=order.departedAt)return 'in_transit';
  if(order.enteredAt&&at>=order.enteredAt)return 'loading';
  if(order.initialization?.state==='in_transit'&&at>=order.initialization.at)return 'in_transit';
  return 'pending';
 };
 const fixed=(kind:string):P1State|undefined=>kind==='晚发'?'loading':['晚到','未经过目的地'].includes(kind)?'arrived':kind==='未经过起始地'?'pending':undefined;
 const items=events.filter(e=>e.orderId===order.id&&!!eventRisk(e,anomalies)).map(e=>{
  const linked=anomalies.filter(a=>a.eventId===e.id);const stage=e.type==='fence'?(e.target==='origin'?(e.phase==='enter'?'loading':'in_transit'):(e.phase==='enter'?'arrived':'completed')):stageAt(e.occurredAt);
  return {id:e.id,at:e.occurredAt,stage:stage as P1State,label:linked[0]?.kind||eventNames[e.type],risk:eventRisk(e,anomalies)||'无风险',parameters:e.type==='weather'?(e.weatherType||e.message||'天气预警'):e.type==='deviation'?e.address:eventParameters(e),basis:e.assessment?.reason||linked.map(a=>a.reason).join('；'),text:e.result,ruleText:e.assessment?'已达到监听阈值，合理性判断见智能体判断。':e.result,abnormal:!!eventRisk(e,anomalies),kind:linked.map(a=>a.kind).join('、'),status:linked.map(a=>a.status==='active'?'未处理':a.status==='corrected'?'已纠正':'已恢复').join('、'),correctionId:e.id};
 });
 for(const a of anomalies.filter(a=>a.orderId===order.id&&!events.some(e=>e.id===a.eventId))){items.push({id:a.id,at:a.firstAt,stage:fixed(a.kind)||stageAt(a.firstAt),label:a.kind==='未经过起始地'?'未抵达起点':a.kind==='未经过目的地'?'未抵达终点':a.kind,risk:'高风险',parameters:'',basis:a.reason,text:a.reason,ruleText:a.reason,abnormal:a.status==='active',kind:a.kind,status:a.status==='active'?'未处理':a.status==='corrected'?'已纠正':'已恢复',correctionId:a.id});}

 return items.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
}
