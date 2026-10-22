import type {P1Config,P1Event,P1AssessmentConfig} from '@/views/AgentWork/interface';
export const defaultParkingFilter='结合事件位置、停车时长、前后轨迹及周边POI判断。车辆确实位于加油站、服务区、合法停车场或维修场所内，且有加油、休息、维修等正常停靠证据，停车时长与用途相符时，判为合理，不生成异常。仅附近存在相关POI不能作为过滤依据；高速主线、应急车道、出入口或危险路段停车、位置不匹配、停留明显过长，以及证据不足时，不自动过滤，保留异常并提示人工复核。';
export const defaultOfflineFilter='结合最后有效位置、定位时间、离线时长、行驶方向、前后轨迹及周边POI判断。仅在有证据表明车辆进入隧道、地下通道等信号遮挡区域，且失联区间与通行过程相符、恢复后的轨迹能正常衔接时，判为合理，不生成异常。仅靠近隧道、加油站或服务区不足以判为合理；未恢复、离线明显超出通行需要、轨迹无法衔接或证据不足时，保留异常并提示人工复核。不得据此断定司机断电或轨迹造假。';
export function defaultAssessments():P1Config['assessments']{return {parking:{enabled:true,radiusMeters:500,filterRule:''},offline:{enabled:true,radiusMeters:500,filterRule:''}};}
export function assessmentConfig(c:P1Config,type:'parking'|'offline'):P1AssessmentConfig{return c.assessments?.[type]||defaultAssessments()[type];}
export function effectiveFilter(c:P1AssessmentConfig,type:'parking'|'offline'){return c.filterRule.trim()||(type==='parking'?defaultParkingFilter:defaultOfflineFilter);}
export function simulateAssessment(event:P1Event,c:P1AssessmentConfig){
 const evidence=event.poiEvidence;const pois=(evidence?.pois||[]).filter(p=>Number.isFinite(p.distanceMeters)&&p.distanceMeters>=0&&p.distanceMeters<=c.radiusMeters);
 let verdict:'reasonable'|'review'='review';let reason='缺少可核验的位置或轨迹证据，不能仅凭附近POI过滤。';
 if(c.filterRule.trim())reason='已保存自定义过滤规则；本地演示不解释任意规则文本，需接入真实LLM或人工复核，本次不自动过滤。';
 else if(evidence?.source==='mock'&&event.type==='parking'&&pois.some(p=>['加油站','服务区','合法停车场','维修场所'].includes(p.category)&&p.inside)&&evidence.normalActivityConfirmed&&evidence.durationMatches&&!evidence.dangerousLocation){verdict='reasonable';reason='设施内位置、正常停靠用途和停留时长相符，符合默认合理停车规则。';}
 else if(evidence?.source==='mock'&&event.type==='offline'&&pois.some(p=>['隧道','地下通道'].includes(p.category)&&p.inside)&&evidence.signalRecovered&&evidence.trackContinuous&&evidence.durationMatches&&!evidence.dangerousLocation){verdict='reasonable';reason='遮挡区域位置、通行时长和恢复后的轨迹衔接相符，符合默认合理离线规则。';}
 else if(evidence?.dangerousLocation)reason='位于主线、应急车道或其他危险区域，不按设施附近的普通停靠过滤。';
 return {verdict,reason,radiusMeters:c.radiusMeters,rule:effectiveFilter(c,event.type as 'parking'|'offline'),pois,source:'mock' as const};
}
