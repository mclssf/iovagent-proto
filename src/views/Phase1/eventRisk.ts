import type {P1Event,P1Anomaly} from '@/views/AgentWork/interface';
import {eventNames,stateNames} from './catalog';
export function eventRisk(e:P1Event,anomalies:P1Anomaly[]):'高风险'|'低风险'|undefined{
 if(e.phase==='recovered'||e.type==='fence')return;
 if((e.type==='parking'||e.type==='offline')&&e.assessment?.verdict==='reasonable')return '低风险';
 if(e.assessment?.verdict==='review'||anomalies.some(a=>a.eventId===e.id))return '高风险';
}
export function eventParameters(e:P1Event){return `${e.address||'位置待补充'}${['parking','offline'].includes(e.type)?` · 持续${e.durationMinutes}分钟`:e.type==='deviation'?` · 偏离${e.distanceMeters}米`:e.type==='weather'?` · ${e.weatherType||'天气预警'}`:''}`;}
export function stateUpdate(e:P1Event){
 if(e.type!=='fence')return;
 const state=e.stateUpdate||Object.values(stateNames).find(name=>e.result.endsWith(`→ ${name}`));
 if(state)return {orderId:e.orderId,fence:e.target==='origin'?'起始地':'目的地',direction:e.phase==='enter'?'进入':'离开',state,at:e.occurredAt};
}
export function riskDetail(e:P1Event,anomalies:P1Anomaly[]){const risk=eventRisk(e,anomalies);if(!risk)return;const linked=anomalies.find(a=>a.eventId===e.id);return {id:e.id,orderId:e.orderId,type:linked?.kind||eventNames[e.type],parameters:eventParameters(e),at:e.occurredAt,risk,basis:e.assessment?.reason||linked?.reason||e.message||'',};}
