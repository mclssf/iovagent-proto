import { planNewOrderRoute, routeStrategies } from '@/views/Phase1/routePlanning';
import { defineStore } from 'pinia';
import type {P1Config,P1Order,P1SkillId,P1Event,P1Anomaly,P1Log,P1EventType,P1State,P1Stop,P1Place,P1TrackPoint} from '@/views/AgentWork/interface';
import {phaseSkills,stateNames,dateText,nextWeatherMidnight} from '@/views/Phase1/catalog';
import {defaultAssessments,assessmentConfig,simulateAssessment} from '@/views/Phase1/eventAssessment';
import {detectHighwayTransitions,detectVehicleTransfers} from '@/views/Phase1/trackDetection';
// 系统固定分支：不调用LLM，不接受自然语言替换判断或订阅时限。
export function initialPlanState(_departure:number|null,_arrival:number|null,_now:number):P1State { return 'pending'; }
export const demoEpoch=Date.now();
export const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export const defaultP1Config:P1Config={assessments:defaultAssessments(),version:1,missingPass:{origin:true,destination:true},selectedSkills:phaseSkills.map(s=>s.id),weather:{enabled:true},deviation:{enabled:true,radiusMeters:1000,repeatMinutes:30,routeStrategy:'更多人选择'},offline:{enabled:true,thresholdMinutes:30,repeatMinutes:30},parking:{enabled:true,thresholdMinutes:30,repeatMinutes:30},highway:{enabled:true},transfer:{enabled:true,distanceMeters:100,overlapMinutes:30},fenceTargets:['origin','destination'],fenceRadii:{origin:5000,destination:5000},lateDeparture:{enabled:true,graceMinutes:60},lateArrival:{enabled:true,graceMinutes:60},statusUpdates:['loading','in_transit','arrived','completed']};
const HOUR=3600000;const MINUTE=60000;const DAY=24*HOUR;const DEMO_SPEED_KMH=70;
function straightLineKm(origin:{lat:number;lon:number},destination:{lat:number;lon:number}){
 const lat=(origin.lat+destination.lat)/2*Math.PI/180;const dx=(origin.lon-destination.lon)*111.32*Math.cos(lat);const dy=(origin.lat-destination.lat)*110.54;return Math.hypot(dx,dy);
}
function estimatedTransportMinutes(origin:{lat:number;lon:number},destination:{lat:number;lon:number}){return Math.max(1,Math.round(straightLineKm(origin,destination)/DEMO_SPEED_KMH*60));}
function orderStops(order:P1Order): P1Stop[] {
 const fallback:P1Stop[]=[
  {id:`${order.id}-loading-1`,sequence:1,role:'loading',place:order.origin,plannedAt:order.plannedDeparture??undefined},
  {id:`${order.id}-unloading-1`,sequence:2,role:'unloading',place:order.destination,plannedAt:order.plannedArrival??undefined},
 ];
 return order.stops?.length ? order.stops : fallback;
}
function normalizedStops(input:Partial<P1Order>&{id:string;origin:P1Place;destination:P1Place}):P1Stop[] {
 const stops=input.stops?.length ? clone(input.stops) : [
  {id:`${input.id}-loading-1`,sequence:1,role:'loading' as const,place:clone(input.origin),plannedAt:input.plannedDeparture??undefined},
  {id:`${input.id}-unloading-1`,sequence:2,role:'unloading' as const,place:clone(input.destination),plannedAt:input.plannedArrival??undefined},
 ];
 return stops.map((stop,index)=>({...stop,id:stop.id||`${input.id}-stop-${index+1}`,sequence:stop.sequence||index+1,place:{...stop.place,radiusMeters:stop.place.radiusMeters||5000}}));
}
function estimateOrderMinutes(stops:P1Stop[]){
 const loading=stops.filter(stop=>stop.role==='loading'); const unloading=stops.filter(stop=>stop.role==='unloading');
 let longest=0;
 for(const from of loading) for(const to of unloading) longest=Math.max(longest,straightLineKm(from.place,to.place));
 return Math.max(1,Math.round(longest/DEMO_SPEED_KMH*60));
}
function aggregateState(order:P1Order):P1State {
 const stops=orderStops(order); const loads=stops.filter(stop=>stop.role==='loading'); const unloads=stops.filter(stop=>stop.role==='unloading');
 if(unloads.length && unloads.every(stop=>stop.exitedAt!==undefined)) return 'completed';
 if(unloads.some(stop=>stop.enteredAt!==undefined)) return 'arrived';
 if(loads.length && loads.every(stop=>stop.exitedAt!==undefined)) return 'in_transit';
 if(loads.some(stop=>stop.enteredAt!==undefined)) return 'loading';
 return 'pending';
}
function stopForEvent(order:P1Order,event:P1Event){
 const stops=orderStops(order);
 if(event.stopId) return stops.find(stop=>stop.id===event.stopId);
 const role=event.target==='origin'?'loading':event.target==='destination'?'unloading':undefined;
 return role ? stops.find(stop=>stop.role===role) : undefined;
}
function distanceMeters(a:{lat:number;lon:number},b:{lat:number;lon:number}){ return straightLineKm(a,b)*1000; }
function historicalFenceFacts(order:P1Order, now:number) {
 const track=order.actualTrack?.filter(point=>point.at>=(order.monitorStartAt??order.createdAt)&&point.at<=Math.min(order.expiresAt,now)).slice().sort((a,b)=>a.at-b.at)??[];
 if(!track.length)return [] as Array<{stop:P1Stop;phase:'enter'|'exit';at:number;point:{lat:number;lon:number}} >;
 const facts:Array<{stop:P1Stop;phase:'enter'|'exit';at:number;point:{lat:number;lon:number}}> = [];
 for(const stop of orderStops(order)){
  let inside=false;
  for(const point of track){
   const nowInside=distanceMeters(point,stop.place)<=stop.place.radiusMeters;
   if(nowInside&&!inside){facts.push({stop,phase:'enter',at:point.at,point});inside=true;}
   if(!nowInside&&inside){facts.push({stop,phase:'exit',at:point.at,point});inside=false;}
  }
 }
 return facts.sort((a,b)=>a.at-b.at);
}
function monitoringWindow(plannedDeparture:number,plannedArrival:number|null,transportMinutes:number){
 const duration=transportMinutes*MINUTE;const buffer=duration>2*DAY?DAY:duration/2;
 return {start:plannedDeparture-buffer,end:plannedArrival===null?plannedDeparture+duration*2:plannedArrival+buffer};
}
const taskFor:Record<'parking'|'offline'|'deviation',P1SkillId>={parking:'p1-parking',offline:'p1-offline',deviation:'p1-deviation'};
const kindFor={parking:'超时停车',offline:'在途离线',deviation:'线路偏离'} as const;
export type EventInput=Omit<P1Event,'projectId'|'receivedAt'|'result'|'taskIds'|'configVersion'>;
export function p1ConfigError(c:P1Config){
 if(c.deviation.routeStrategy&&!routeStrategies.includes(c.deviation.routeStrategy))return '请选择有效线路策略。';
 const valid=(n:number,min:number,max:number,step=1)=>Number.isInteger(n)&&n>=min&&n<=max&&(n-min)%step===0;
 if(!valid(c.deviation.radiusMeters,100,10000,100)||!valid(c.deviation.repeatMinutes,1,1440)||!valid(c.offline.thresholdMinutes,10,4320,10)||!valid(c.parking.thresholdMinutes,10,4320,10)||!valid(c.offline.repeatMinutes,1,1440)||!valid(c.parking.repeatMinutes,1,1440)||!valid(c.lateDeparture.graceMinutes,0,1440)||!valid(c.lateArrival.graceMinutes,0,1440))return '参数超出允许范围或不符合步长。';
 if(c.assessments&&Object.values(c.assessments).some(rule=>!valid(rule.radiusMeters,50,5000,50)||typeof rule.filterRule!=='string'||rule.filterRule.length>2000))return 'POI查询范围须为50—5000米、步长50米；过滤文字不超过2000字。';
 if(!valid(c.fenceRadii.origin,100,50000,100)||!valid(c.fenceRadii.destination,100,50000,100))return '围栏半径须为100—50000米、步长100米。';
 if(!c.transfer||!valid(c.transfer.distanceMeters,10,10000,10)||!valid(c.transfer.overlapMinutes,1,1440))return '换车检测距离或重合时长参数无效。';
 if(c.selectedSkills.some(id=>!phaseSkills.some(s=>s.id===id)))return '存在未知技能。';return '';
}
export function monitoringSkillEnabled(c:P1Config,id:P1SkillId){
 if(!c.selectedSkills.includes(id)||c.pausedSkillIds?.includes(id))return false;
 if(id==='p1-status')return c.fenceTargets.length>0&&c.statusUpdates.length>0;
 if(id==='p1-late')return c.lateDeparture.enabled||c.lateArrival.enabled||!!c.missingPass?.origin||!!c.missingPass?.destination;
 if(id==='p1-weather')return !!c.weather?.enabled;
 if(id==='p1-highway')return !!c.highway?.enabled;
 if(id==='p1-transfer')return !!c.transfer?.enabled;
 return c[id==='p1-parking'?'parking':id==='p1-offline'?'offline':'deviation'].enabled;
}
 function transportEnabled(c:P1Config,type:'parking'|'offline'|'deviation'){return monitoringSkillEnabled(c,taskFor[type]);}
function weatherEnabled(c:P1Config){return monitoringSkillEnabled(c,'p1-weather');}
function anyWatch(c:P1Config){return c.selectedSkills.some(id=>monitoringSkillEnabled(c,id));}
export const usePhase1=defineStore('phase1-v11',{
 state:()=>({now:Date.now(),configs:{'MONITOR-EAST':clone(defaultP1Config)} as Record<string,P1Config>,orders:[] as P1Order[],events:[] as P1Event[],anomalies:[] as P1Anomaly[],logs:[] as P1Log[],sequence:0,error:'',capability:'mock' as 'mock'|'whitepaper',ready:false,lastResetSnapshot:''}),
 actions:{
  progress(id:string,next:P1State,source:'手动'|'运单状态同步'|'对话触发'|'超时结束'='手动'){
   const o=this.orders.find(o=>o.id===id);if(!o)return '运单不存在';
   const states:P1State[]=['pending','loading','in_transit','arrived','completed'];
   if(states.indexOf(next)!==states.indexOf(o.state)+1)return '请按运输顺序推进。';
   const before=o.state;const key={loading:'enteredAt',in_transit:'departedAt',arrived:'arrivedAt',completed:'completedAt'} as const;
   o.state=next;if(next!=='pending')o[key[next]]=this.now;
   (o.milestoneMethods??={})[next]=source==='手动'?'人工操作':source;
   this.log(o,'p1-status','结果',`${source}：${stateNames[before]} → ${stateNames[next]}。`);
   if(before!==next)this.checkMissingPass(o,source);this.correctLate(o);if(next==='completed')this.stop(id,'人工确认运输完成');
   return '';
  },
  updateConversationState(id:string,next:P1State,at:number){
   const order=this.orders.find(item=>item.id===id);if(!order)return '运单不存在';
   const ranks:P1State[]=['pending','loading','in_transit','arrived','completed'];const index=ranks.indexOf(next);
   if(index<=ranks.indexOf(order.state))return '不支持回退或重复推进';
   if(!Number.isFinite(at)||at<order.createdAt||at>this.now)return '节点时间须在创建时间与当前时间之间';
   const fields=['','enteredAt','departedAt','arrivedAt','completedAt'] as const;
   for(let i=1;i<ranks.length;i++){const value=order[fields[i]] as number|undefined;if(value&&((i<index&&value>at)||(i>index&&value<at)))return '节点时间与已有运输记录顺序冲突';}
   const before=order.state;order.state=next;if(next!=='pending')order[fields[index] as 'enteredAt'|'departedAt'|'arrivedAt'|'completedAt']=at;
   (order.milestoneMethods??={})[next]='对话更新';(order.corrections??=[]).push({at:this.now,operator:'当前用户',before:stateNames[before],after:stateNames[next],reason:`对话确认更新，节点时间${dateText(at)}`});
   this.log(order,'p1-status','结果',`对话更新：${stateNames[before]} → ${stateNames[next]}；节点时间${dateText(at)}；仅更新数字人，不回写灵动。`);
   this.checkMissingPass(order,'对话触发');this.correctLate(order);if(next==='completed')this.stop(id,'对话确认运输完成');return '';
  },
  next(prefix:string){return `${prefix}-${++this.sequence}`;},
  config(projectId:string):P1Config{const c=clone(this.configs[projectId]||defaultP1Config);c.weather??={enabled:true};c.highway??={enabled:true};c.transfer??={enabled:true,distanceMeters:100,overlapMinutes:30};c.missingPass??={origin:true,destination:true};c.fenceRadii??={origin:5000,destination:5000};c.assessments={...defaultAssessments(),...c.assessments};return c;},
  log(order:P1Order,taskId:P1SkillId,kind:P1Log['kind'],text:string){this.logs.push({id:this.next('LOG'),projectId:order.projectId,orderId:order.id,taskId,kind,at:this.now,text});},
  cleanupTransferEvents(order:P1Order,transfer:P1Event){
   if(transfer.type!=='transfer'||!transfer.fromPlate||!transfer.toPlate)return;
   const invalidIds=new Set(this.events.filter(event=>event.orderId===order.id&&event.id!==transfer.id&&((event.vehiclePlate===transfer.fromPlate&&event.occurredAt>=transfer.occurredAt)||(event.vehiclePlate===transfer.toPlate&&event.occurredAt<=transfer.occurredAt))).map(event=>event.id));
   if(!invalidIds.size)return;
   this.events=this.events.filter(event=>!invalidIds.has(event.id));
   this.anomalies=this.anomalies.filter(anomaly=>!anomaly.eventId||!invalidIds.has(anomaly.eventId));
   this.log(order,'p1-transfer','结果',`换车事件${transfer.fromPlate} → ${transfer.toPlate}：已物理移出换车前后车辆归属不合法的 ${invalidIds.size} 条事件及其关联异常。`);
  },
  recheckTrackEvents(id:string,source:'historical'|'incremental'='incremental'){
   const order=this.orders.find(item=>item.id===id);if(!order||order.session!=='active'||!order.actualTrack?.length)return;
   const start=order.monitorStartAt??order.createdAt;
   const end=Math.min(order.completedAt??this.now,order.expiresAt,this.now);
   const generated=new Set(this.events.filter(event=>event.orderId===id&&event.detectionSource&&event.detectionSource!=='external'&&['transfer','highway'].includes(event.type)).map(event=>event.id));
   if(generated.size){this.events=this.events.filter(event=>!generated.has(event.id));this.anomalies=this.anomalies.filter(anomaly=>!anomaly.eventId||!generated.has(anomaly.eventId));}
   const track=order.actualTrack;
   if(monitoringSkillEnabled(order.config,'p1-highway'))for(const item of detectHighwayTransitions(track,start,end)){
    const point=item.point;
    this.receive({id:this.next('EV'),orderId:id,type:'highway',phase:'started',occurredAt:point.at,address:point.address??point.roadName??item.phase,durationMinutes:0,distanceMeters:0,vehiclePlate:point.vehiclePlate??order.plate.split('、')[0],position:{lat:point.lat,lon:point.lon},message:item.phase,detectionSource:source});
   }
   if(monitoringSkillEnabled(order.config,'p1-transfer')){
    const segments=order.vehicleSegments??order.plate.split('、').filter(Boolean).map((plate,index)=>({plate,sequence:index+1}));
    for(const item of detectVehicleTransfers(track,segments,order.config.transfer,start,end))this.receive({id:this.next('EV'),orderId:id,type:'transfer',phase:'started',occurredAt:item.at,address:item.point.address??`经纬度 ${item.point.lon.toFixed(4)}, ${item.point.lat.toFixed(4)}`,durationMinutes:item.overlapMinutes,distanceMeters:item.distanceMeters,vehiclePlate:item.toPlate,fromPlate:item.fromPlate,toPlate:item.toPlate,position:{lat:item.point.lat,lon:item.point.lon},detectionSource:source});
   }
   this.log(order,'p1-transfer','配置',`按车辆顺序重新校验${dateText(start)}至${dateText(end)}的换车停车点；同一组相邻车辆有多个匹配点时取最后一个。`);
  },
  appendTrackPoints(id:string,points:P1TrackPoint[]){
   const order=this.orders.find(item=>item.id===id);if(!order)return '运单不存在';
   if(!points.every(point=>Number.isFinite(point.at)&&point.at<=this.now&&Number.isFinite(point.lat)&&Number.isFinite(point.lon)))return '轨迹坐标或时间无效。';
   order.actualTrack=[...(order.actualTrack??[]),...clone(points)].sort((a,b)=>a.at-b.at);
   this.recheckTrackEvents(id,'incremental');
   return '';
  },
  mergeWaybills(dispatchId:string,waybillIds:string[]){
   const ids=[...new Set(waybillIds.map(id=>id.trim()).filter(Boolean))];
   if(!dispatchId.trim()||ids.length<2){this.error='请填写调度单号并选择至少两条零担运单。';return false;}
   if(this.orders.some(order=>order.id===dispatchId)){this.error='调度单号已存在。';return false;}
   const waybills=ids.map(id=>this.orders.find(order=>order.id===id));
   if(waybills.some(order=>!order||order.loadType!=='零担'||order.dispatchId)){this.error='只能关联未合并的零担运单。';return false;}
   const source=waybills as P1Order[];
   if(new Set(source.map(order=>order.projectId)).size!==1){this.error='关联运单必须属于同一项目。';return false;}
   const vehicleInfo=(order:P1Order)=>JSON.stringify({plates:(order.vehicleSegments??order.plate.split('、').filter(Boolean).map((plate,index)=>({plate,sequence:index+1}))).sort((a,b)=>a.sequence-b.sequence).map(item=>item.plate),driver:order.driver,plateColor:order.plateColor});
   const supplied=source.filter(order=>order.plate.trim());
   if(supplied.length>1&&new Set(supplied.map(vehicleInfo)).size>1){this.error='运单车辆及司机信息不一致，不能合并调度单。';return false;}
   const stops:P1Stop[]=[];
   for(const order of source)for(const stop of orderStops(order)){
    const matched=stops.find(item=>item.role===stop.role&&item.place.name===stop.place.name&&Math.hypot(item.place.lat-stop.place.lat,item.place.lon-stop.place.lon)<0.0001);
    if(matched){if(stop.plannedAt!==undefined)matched.plannedAt=Math.min(matched.plannedAt??stop.plannedAt,stop.plannedAt);}
    else stops.push({...clone(stop),id:`${dispatchId}-stop-${stops.length+1}`,sequence:stops.length+1,enteredAt:undefined,exitedAt:undefined});
   }
   const loading=stops.filter(stop=>stop.role==='loading');const unloading=stops.filter(stop=>stop.role==='unloading');
   if(!loading.length||!unloading.length){this.error='关联运单缺少装货点或卸货点。';return false;}
   const orderedStops=[...loading.sort((a,b)=>(a.plannedAt??Infinity)-(b.plannedAt??Infinity)),...unloading.sort((a,b)=>(a.plannedAt??Infinity)-(b.plannedAt??Infinity))].map((stop,index)=>({...stop,sequence:index+1}));
   const first=source[0]!;
   const ok=this.createOrder({id:dispatchId,projectId:first.projectId,plate:first.plate,plateColor:first.plateColor,driver:first.driver,source:'调度单关联演示',origin:orderedStops[0]!.place,destination:orderedStops[orderedStops.length-1]!.place,plannedDeparture:null,plannedArrival:null,stops:orderedStops,vehicleSegments:clone(first.vehicleSegments??first.plate.split('、').filter(Boolean).map((plate,index)=>({plate,sequence:index+1}))),monitoringOwner:'dispatch'},this.now);
   if(!ok)return false;
   for(const order of source){order.dispatchId=dispatchId;order.monitoringOwner='dispatch';order.session='paused';order.subscriptionRevision=0;order.endReason='已由调度单统一监控';}
   const dispatch=this.orders.find(order=>order.id===dispatchId)!;
   if(this.now>=dispatch.monitorStartAt!&&this.now<dispatch.expiresAt)dispatch.session='active';
   this.allLog(dispatch,'结果',`关联 ${ids.length} 条运单：${ids.join('、')}。装卸节点按位置合并，同位置取最早计划时间；状态和风险由调度单重新计算。`);
   this.error='';return true;
  },
  updateDispatchVehicles(dispatchId:string,segments:NonNullable<P1Order['vehicleSegments']>){
   const dispatch=this.orders.find(order=>order.id===dispatchId&&order.monitoringOwner==='dispatch');
   if(!dispatch)return '调度单不存在。';
   const ordered=[...segments].sort((a,b)=>a.sequence-b.sequence);
   if(!ordered.length||ordered.some((segment,index)=>!segment.plate.trim()||segment.sequence!==index+1)||new Set(ordered.map(item=>item.plate)).size!==ordered.length)return '车辆顺序或车牌无效。';
   dispatch.vehicleSegments=clone(ordered);dispatch.plate=ordered.map(item=>item.plate).join('、');
   for(const order of this.orders.filter(item=>item.dispatchId===dispatchId)){order.vehicleSegments=clone(ordered);order.plate=dispatch.plate;}
   this.recheckTrackEvents(dispatchId);
   this.allLog(dispatch,'配置',`调度单车辆顺序已更新：${dispatch.plate}；其他运单和调度单信息未变。`);
   return '';
  },
  allLog(order:P1Order,kind:P1Log['kind'],text:string){for(const id of order.config.selectedSkills)if(!(id==='p1-weather'&&kind==='开始'))this.log(order,id,kind,text);},
  saveConfig(projectId:string,draft:P1Config,expectedVersion?:number){
   const error=p1ConfigError(draft);if(error){this.error=error;return false;}
   const previous=this.config(projectId);if(expectedVersion!==undefined&&previous.version!==expectedVersion){this.error='配置已被更新，请重新打开配置页面。';return false;}
   const next={...clone(draft),assessments:{...defaultAssessments(),...draft.assessments},weather:draft.weather||{enabled:false},version:previous.version+1};if(next.weather.enabled&&!next.selectedSkills.includes('p1-weather'))next.selectedSkills.push('p1-weather');this.configs[projectId]=next;this.error='';
const physical=(c:P1Config)=>JSON.stringify({skills:c.selectedSkills.filter(id=>monitoringSkillEnabled(c,id)).sort(),parking:[c.parking.enabled,c.parking.thresholdMinutes],offline:[c.offline.enabled,c.offline.thresholdMinutes],deviation:[c.deviation.enabled,c.deviation.radiusMeters],highway:c.highway,transfer:c.transfer,fences:[...c.fenceTargets].sort(),fenceRadii:c.fenceRadii});
   for(const order of this.orders.filter(o=>o.projectId===projectId&&!['stopped','cleanup_pending'].includes(o.session))){
    const previousConfig=order.config;const resubscribe=physical(order.config)!==physical(next);for(const a of this.anomalies.filter(a=>a.orderId===order.id&&a.status==='active'&&!['p1-late','p1-weather'].includes(a.taskId))){const type=a.taskId==='p1-parking'?'parking':a.taskId==='p1-offline'?'offline':'deviation';if(previousConfig[type].repeatMinutes!==next[type].repeatMinutes)a.nextReminderAt=this.now+next[type].repeatMinutes*MINUTE;}for(const id of order.config.selectedSkills.filter(id=>!next.selectedSkills.includes(id)))this.log(order,id,'结束','本Skill取消选择，停止处理并释放该任务引用；其他任务保留。');const wasWeather=weatherEnabled(order.config);order.config={...clone(next),deviation:{...clone(next.deviation),routeStrategy:previousConfig.deviation.routeStrategy??'更多人选择'}};order.origin.radiusMeters=next.fenceRadii.origin;order.destination.radiusMeters=next.fenceRadii.destination;if(wasWeather&&!weatherEnabled(next))this.log(order,'p1-weather','结束','天气监听已关闭，停止本单天气事件处理并释放引用；未恢复异常及历史结果保留。');if(!wasWeather&&weatherEnabled(next))this.startWeather(order);
   this.allLog(order,'配置',`读取项目最新配置；${resubscribe?'受控更新订阅，等待生效':'更新时效规则与提醒间隔'}，监控截止${dateText(order.expiresAt)}不延长。`);
    if(resubscribe){order.providerMode=this.capability;order.subscriptionRevision++;order.activateAt=Math.max(this.now+10*MINUTE,order.monitorStartAt??this.now);order.session=anyWatch(next)?'subscribing':'paused';order.deviationBlocked=this.capability==='whitepaper'&&transportEnabled(next,'deviation');if(order.deviationBlocked)this.log(order,'p1-deviation','失败','当前服务不支持偏离半径参数；该项未生效，其他项继续。');}
    if(!anyWatch(next))order.session='paused';
   }
   this.tick();return true;
  },
  createOrder(input:Pick<P1Order,'id'|'projectId'|'plate'|'plateColor'|'driver'|'source'|'origin'|'destination'|'plannedDeparture'|'plannedArrival'> & Partial<Pick<P1Order,'sourceKey'|'sourceUpdatedAt'|'network'|'stops'|'vehicleSegments'|'loadType'|'dispatchId'|'customFields'|'monitoringOwner'|'actualTrack'>>,createdAt=this.now){
   if(!input.id.trim()||!input.plate.trim()||![1,2].includes(input.plateColor)){this.error='请填写运单号、车牌和蓝/黄车牌颜色。';return false;}
   if(this.orders.some(o=>o.id===input.id)){this.error='运单号已存在，未重复创建。';return false;}
   for(const p of [input.origin,input.destination])if(!p.name.trim()||!p.regionCode||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180){this.error='请填写起终点名称、区县编码和有效坐标。';return false;}
   if([input.plannedDeparture,input.plannedArrival].some(t=>t!==null&&!Number.isFinite(t))||input.plannedDeparture!==null&&input.plannedArrival!==null&&input.plannedArrival<input.plannedDeparture){this.error='计划时间无效，预计到达不能早于预计出发。';return false;}
   const config=this.config(input.projectId);
   const stops=normalizedStops(input);
   const loadingTimes=stops.filter(stop=>stop.role==='loading').map(stop=>stop.plannedAt).filter((value):value is number=>value!==undefined);
   const unloadingTimes=stops.filter(stop=>stop.role==='unloading').map(stop=>stop.plannedAt).filter((value):value is number=>value!==undefined);
   const plannedDeparture=loadingTimes.length?Math.min(...loadingTimes):(input.plannedDeparture??this.now);
   const plannedArrival=unloadingTimes.length?Math.max(...unloadingTimes):(input.plannedArrival??null);
   const transportMinutes=estimateOrderMinutes(stops);const window=monitoringWindow(plannedDeparture,plannedArrival,transportMinutes);
   const order:P1Order={...clone(input),loadType:input.loadType??'整车',plannedDeparture,plannedArrival,stops,origin:{...clone(input.origin),radiusMeters:config.fenceRadii.origin},destination:{...clone(input.destination),radiusMeters:config.fenceRadii.destination},createdAt,state:'pending',monitorStartAt:window.start,estimatedTransportMinutes:transportMinutes,expiresAt:window.end,activateAt:Math.max(this.now+10*MINUTE,window.start),config,session:anyWatch(config)?'subscribing':'paused',endReason:'',cleanupWillFail:false,cleanupAttempts:0,subscriptionRevision:1,providerMode:this.capability,deviationBlocked:this.capability==='whitepaper'&&transportEnabled(config,'deviation')};
   // 固定顺序：校验→读取配置→计划初始化→已完成短路→按开关建立监听服务。
   order.state=initialPlanState(order.plannedDeparture,order.plannedArrival,this.now);
   const missingStart=input.plannedDeparture===null;const missingArrival=input.plannedArrival===null;
   order.initialization={at:this.now,state:order.state,basis:`按${stops.length}个装卸节点初始化：计划开始${dateText(order.plannedDeparture)}，计划结束${dateText(order.plannedArrival)}；估算运输时长${transportMinutes}分钟（按${DEMO_SPEED_KMH}km/h直线距离计算），监控开始${dateText(window.start)}，最晚结束${dateText(window.end)}。${missingStart?'计划开始缺失，已按当前时间计算。':''}${missingArrival?'计划结束缺失，按计划开始+运输时长×2计算最晚监控结束。':''}当前状态先按待发车处理，历史围栏回溯后再更新，不写入虚构里程碑时间。`};
   this.orders.push(order);this.allLog(order,'配置',`系统运单接入流程：${order.initialization.basis}`);
   if(order.network?.status==='unregistered'){order.billingExempt=true;order.billingExemptReason='车辆未入网';}
   if(order.loadType==='零担' && order.monitoringOwner!=='dispatch') { order.session='paused'; order.subscriptionRevision=0; this.allLog(order,'结束','零担运单由调度单统一监控，不单独开启运单监听。'); this.error=''; return true; }
   if(order.state==='completed'){order.session='stopped';order.endReason='系统按计划到达时间初始化为已完成，不注册在途监控';order.subscriptionRevision=0;order.deviationBlocked=false;this.allLog(order,'结束',order.endReason+'；不注册天气订阅、围栏及其他事件监听，不启动计时或重复提醒。');this.error='';return true;}
   if(order.network?.status==='unregistered'){this.identifyUnregistered(order.id,order.network.source,order.network.reason);this.error='';return true;}
   if(order.actualTrack?.length && this.now>=window.start && this.now<window.end){
    order.session='active';
    for(const fact of historicalFenceFacts(order,this.now)) this.receive({id:this.next('EV'),orderId:order.id,type:'fence',phase:fact.phase,target:fact.stop.role==='loading'?'origin':'destination',stopId:fact.stop.id,occurredAt:fact.at,address:fact.stop.place.name,durationMinutes:0,distanceMeters:0,position:fact.point});
    this.recheckTrackEvents(order.id,'historical');
    order.initialization.basis+=' 已回溯实际轨迹并生成装卸节点围栏事实。';
   }
   if(transportEnabled(config,'deviation')){order.routePlan=planNewOrderRoute(order,this.now);order.deviationBlocked=order.routePlan.status==='failed'||order.deviationBlocked;this.log(order,'p1-deviation',order.routePlan.status==='ready'?'开始':'失败',`线路规划：${order.routePlan.strategy}；${order.routePlan.reason}；路线${order.routePlan.id}。`);}
   this.allLog(order,'开始',`系统监听注册：${order.id}，${order.plate}；项目最新配置，来源${order.source}，不修改源系统运单。${order.session==='paused'?'监听未开启':this.now<window.start?`监控开始时间${dateText(window.start)}，到时启动`:'回溯监控开始时间至当前时间后启动'}；最晚监控结束${dateText(order.expiresAt)}。`);
   for(const type of ['parking','offline'] as const)if(order.providerMode==='whitepaper'&&transportEnabled(config,type)&&config[type].thresholdMinutes%10!==0)this.log(order,taskFor[type],'失败','服务能力约束：持续时长不是10分钟的倍数，该项未生效。');
   if(config.selectedSkills.includes('p1-late')&&(!config.fenceTargets.includes('origin')||!config.fenceTargets.includes('destination')))this.log(order,'p1-late','失败','缺少所选起始地/目的地围栏事实源，对应晚发/晚到规则不生成异常。');
   if(order.deviationBlocked)this.log(order,'p1-deviation','失败','CAPABILITY_UNSUPPORTED：当前服务不支持线路偏离半径参数，该项未生效。');
   if(config.selectedSkills.includes('p1-late')&&(!order.plannedDeparture||!order.plannedArrival))this.log(order,'p1-late','失败','晚发/晚到计划时间缺失，相应计时规则待补齐；不以录入时间替代计划时间。');
   if(config.selectedSkills.includes('p1-late')&&[order.plannedDeparture,order.plannedArrival].some(t=>t&&t>order.expiresAt))this.log(order,'p1-late','失败','计划时间晚于最晚监控结束时间，到期后不继续运行该规则。');
   if(weatherEnabled(config))this.startWeather(order);
   this.error='';return true;
  },
  identifyUnregistered(id:string,source:string,reason:string){
   const order=this.orders.find(item=>item.id===id);if(!order)return '运单不存在';
   const repeated=order.network?.monitoringBlocked;
   order.network={status:'unregistered',checkedAt:this.now,source,reason,monitoringBlocked:true};order.billingExempt=true;order.billingExemptReason='车辆未入网';
   this.stop(id,'车辆未入网，相关监听未生效；本单免计费，不自动恢复');
   if(!repeated)this.allLog(order,'失败',`车辆未入网：${reason}；来源${source}；本单免计费。该记录不计入基础事件数。`);
   return '';
  },
  startWeather(order:P1Order){order.weatherRequestedAt??=this.now;order.weatherEffectiveAt??=nextWeatherMidnight(order.weatherRequestedAt);order.weatherActiveLogged=false;this.log(order,'p1-weather','开始',`恶劣天气监听已开启。预计${dateText(order.weatherEffectiveAt)}生效；截止${dateText(order.expiresAt)}，等待期不延长监控窗口。不发送车机提醒；天气服务状态待确认。`);if(order.session==='paused'){order.session='subscribing';order.activateAt=Math.max(this.now+10*MINUTE,order.monitorStartAt??this.now);}},
  weatherState(order:P1Order){return ['stopped','cleanup_pending'].includes(order.session)?'已结束':!weatherEnabled(order.config)?'未开启':this.now<(order.weatherEffectiveAt||Infinity)?'待生效':'监听中';},
  anomaly(order:P1Order,kind:P1Anomaly['kind'],taskId:P1SkillId,reason:string,eventId?:string,recordResult=true,stopId?:string){
   const stop=stopId?orderStops(order).find(item=>item.id===stopId):undefined;
   const plan=stop?.plannedAt??(kind==='晚发'?order.plannedDeparture:kind==='晚到'?order.plannedArrival:null);
   const grace=kind==='晚发'?order.config.lateDeparture.graceMinutes:order.config.lateArrival.graceMinutes;
   const deadline=['晚发','晚到'].includes(kind)&&plan?plan+grace*MINUTE:undefined;
   const dismissed=deadline&&this.anomalies.find(a=>a.orderId===order.id&&a.kind===kind&&a.status==='corrected'&&a.deadlineAt===deadline);if(dismissed)return dismissed;
   const existing=this.anomalies.find(a=>a.orderId===order.id&&a.kind===kind&&a.stopId===stopId&&a.status==='active'&&(kind!=='恶劣天气'||a.eventId===eventId));if(existing){existing.lastAt=this.now;return existing;}
   const repeat=['p1-late','p1-weather'].includes(taskId)?0:order.config[taskId==='p1-parking'?'parking':taskId==='p1-offline'?'offline':'deviation'].repeatMinutes;
   const abnormal:P1Anomaly={id:this.next('AB'),orderId:order.id,kind,stopId,taskId,status:'active',firstAt:this.now,lastAt:this.now,nextReminderAt:repeat?this.now+repeat*MINUTE:0,repeatCount:0,reason,deadlineAt:deadline,eventId,configVersion:order.config.version};this.anomalies.push(abnormal);if(recordResult)this.log(order,taskId,'结果',`${kind} ${abnormal.id}：${reason}`);return abnormal;
  },
  receive(input:EventInput){
   const order=this.orders.find(o=>o.id===input.orderId);if(!order)return '运单不存在';
   if(order.network?.monitoringBlocked)return '车辆未入网，相关监听未生效；本单不自动恢复。';
   if(input.type==='deviation'&&order.routePlan?.status==='failed')return '路线尚未规划成功，偏离监听未生效。';
   if(input.type==='deviation'&&order.routePlan){input.routePlanId=order.routePlan.id;input.routeStrategy=order.routePlan.strategy;}
   this.tick();if(input.type==='weather')return this.receiveWeather(order,input);if(order.session!=='active')return `监听未生效或已停止（${order.session}），未采集。`;
   if(input.occurredAt<(order.monitorStartAt??order.createdAt))return '事件早于监控开始时间，未采集。';
   if(!Number.isFinite(input.occurredAt)||input.occurredAt>this.now)return '发生时间必须有效且不晚于当前时间。';
   if(this.events.some(e=>e.id===input.id||e.orderId===input.orderId&&e.type===input.type&&e.phase===input.phase&&e.occurredAt===input.occurredAt&&e.target===input.target&&e.stopId===input.stopId))return '重复事件已忽略。';
   const passiveTask:P1SkillId|undefined=input.type==='highway'?'p1-highway':input.type==='transfer'?'p1-transfer':undefined;
   if(input.type==='fence'){
    if((!input.target&&!input.stopId)||(!input.stopId&&input.target&&!order.config.fenceTargets.includes(input.target))||!order.config.selectedSkills.length)return '未订阅该地点围栏，未采集。';
    if(!['enter','exit'].includes(input.phase))return '围栏出入类型无效。';
   }else if(passiveTask){
    if(!monitoringSkillEnabled(order.config,passiveTask))return '监听或相应Skill未开启，未采集。';
    if(input.phase!=='started')return '该事件仅接受一次性发生事实。';
    if(input.type==='transfer'){
     const segments=order.vehicleSegments??order.plate.split('、').filter(Boolean).map((plate,index)=>({plate,sequence:index+1}));
     const ordered=[...segments].sort((a,b)=>a.sequence-b.sequence);
     const pair=ordered.some((segment,index)=>index>0&&ordered[index-1]!.plate===input.fromPlate&&segment.plate===input.toPlate);
     if(!pair)return '换车车辆必须是运单中顺序相邻的两辆车。';
    }
    if(input.type==='transfer'&&((!Number.isFinite(input.distanceMeters)||input.distanceMeters>order.config.transfer.distanceMeters)||(!Number.isFinite(input.durationMinutes)||input.durationMinutes<order.config.transfer.overlapMinutes)))return '换车事实未达到配置的距离和重合时长条件，未采集。';
   }else{
    if(!transportEnabled(order.config,input.type as 'parking'|'offline'|'deviation'))return '监听或相应Skill未开启，未采集。';
    if(input.type==='deviation'&&order.state!=='in_transit')return '只有在途状态监控线路偏离。';
    if(!['started','recovered'].includes(input.phase))return '告警阶段无效。';
    if(order.providerMode==='whitepaper'&&input.type!=='deviation'&&order.config[input.type as 'parking'|'offline'].thresholdMinutes%10!==0)return '当前服务仅支持10分钟倍数的阈值，该项未采集。';
    if(input.type==='deviation'&&order.deviationBlocked)return '偏离半径接口能力未确认，本项未生效。';
    if(input.phase==='started'){
     if(input.type==='deviation'&&(!Number.isFinite(input.distanceMeters)||input.distanceMeters<=order.config.deviation.radiusMeters))return '未超过配置偏离距离，未采集。';
     if(input.type!=='deviation'&&(!Number.isFinite(input.durationMinutes)||input.durationMinutes<order.config[input.type as 'parking'|'offline'].thresholdMinutes))return '未达到持续时长阈值，未采集。';
    }
   }
   const event:P1Event={...clone(input),projectId:order.projectId,receivedAt:this.now,result:'',taskIds:[],configVersion:order.config.version};this.events.push(event);
   if(passiveTask){
    event.taskIds.push(passiveTask);event.result=event.type==='highway'?`${event.message??'上下高速'}事件已记录，不生成异常。`:'换车事件已记录，不生成异常。';
    if(event.type==='transfer'&&event.fromPlate&&event.toPlate){
      const segments=order.vehicleSegments??order.plate.split('、').filter(Boolean).map((plate,index)=>({plate,sequence:index+1}));
      if(!segments.some(segment=>segment.plate===event.fromPlate))segments.push({plate:event.fromPlate,sequence:segments.length+1});
      if(!segments.some(segment=>segment.plate===event.toPlate))segments.push({plate:event.toPlate,sequence:segments.length+1,startedAt:event.occurredAt,transferFrom:event.fromPlate});
      const from=segments.find(segment=>segment.plate===event.fromPlate);if(from)from.endedAt=event.occurredAt;order.vehicleSegments=segments;order.plate=segments.map(segment=>segment.plate).join('、');
      event.result+=` 当前车辆顺序：${order.plate}。`;
      this.cleanupTransferEvents(order,event);
    }
    this.log(order,passiveTask,'基础事件',`${event.result} ${event.address}，发生于${dateText(event.occurredAt)}。`);this.log(order,passiveTask,'结果',event.result);return '';
   }
   if(event.type==='fence'){
    const stop=stopForEvent(order,event);if(!stop)return '未找到对应装卸节点，未采集。';
    event.stopId=stop.id;event.stopRole=stop.role;event.plannedAt=stop.plannedAt;
    if(event.phase==='enter')stop.enteredAt=Math.min(stop.enteredAt??event.occurredAt,event.occurredAt);
    if(event.phase==='exit')stop.exitedAt=Math.min(stop.exitedAt??event.occurredAt,event.occurredAt);
    if(stop.role==='loading'&&event.phase==='enter')order.enteredAt=Math.min(order.enteredAt??event.occurredAt,event.occurredAt);
    if(stop.role==='loading'&&event.phase==='exit'&&orderStops(order).filter(item=>item.role==='loading').every(item=>item.exitedAt!==undefined))order.departedAt=Math.max(...orderStops(order).filter(item=>item.role==='loading').map(item=>item.exitedAt!));
    if(stop.role==='unloading'&&event.phase==='enter')order.arrivedAt=Math.min(order.arrivedAt??event.occurredAt,event.occurredAt);
    if(stop.role==='unloading'&&event.phase==='exit'&&orderStops(order).filter(item=>item.role==='unloading').every(item=>item.exitedAt!==undefined))order.completedAt=Math.max(...orderStops(order).filter(item=>item.role==='unloading').map(item=>item.exitedAt!));
    const mapped:P1State=aggregateState(order);
    (order.milestoneMethods??={})[mapped]='围栏事件';
    const rank={pending:0,loading:1,in_transit:2,arrived:3,completed:4};const before=order.state;
    if(monitoringSkillEnabled(order.config,'p1-status')){event.taskIds.push('p1-status');
     if(order.config.statusUpdates.includes(mapped)&&rank[mapped]>rank[before]){order.state=mapped;event.result=`${stateNames[before]} → ${stateNames[mapped]}`;}else event.result=`基础事实已记录；${rank[mapped]<=rank[before]?'重复或乱序，不回退状态':'该状态未勾选，不更新显示状态'}。`;
     this.log(order,'p1-status','基础事件',`${stop.role==='loading'?'装货':'卸货'}点${stop.sequence}${event.phase==='enter'?'进入':'离开'}，${dateText(event.occurredAt)}，${event.address}。`);this.log(order,'p1-status','结果',event.result);
    }else event.result='围栏事实已记录；状态Skill未选择，显示状态不变。';
    if(monitoringSkillEnabled(order.config,'p1-late')){event.taskIds.push('p1-late');this.log(order,'p1-late','基础事件',`取得${stop.role==='loading'?'装货':'卸货'}点${stop.sequence}${event.phase==='enter'?'进入':'离开'}事实；里程碑独立于显示状态。`);}
    if(order.state!==before)this.checkMissingPass(order,'围栏事件');
    if(event.phase==='enter'&&transportEnabled(order.config,'deviation')){order.routePlan=planNewOrderRoute(order,this.now);this.log(order,'p1-deviation',order.routePlan.status==='ready'?'配置':'失败',`节点${stop.id}触碰后重新规划路线${order.routePlan.id}：${order.routePlan.reason}。`);}
    this.correctLate(order);
    if(order.completedAt&&mapped==='completed')this.stop(order.id,'全部卸货点驶出，运单运输结束');
   }else{
    const task=taskFor[event.type as 'parking'|'offline'|'deviation'];event.taskIds.push(task);this.log(order,task,'基础事件',`${event.type==='parking'?'停车':event.type==='offline'?'离线':'偏离'}${event.phase==='recovered'?'解除':'告警'}；发生${dateText(event.occurredAt)}，接收${dateText(this.now)}；${event.address}，${event.type==='deviation'?`${event.distanceMeters}米`:`${event.durationMinutes}分钟`}。`);
    if(event.phase==='recovered'){
     const a=this.anomalies.find(a=>a.orderId===order.id&&a.kind===kindFor[event.type]&&a.status==='active');if(a){a.status='recovered';a.lastAt=this.now;event.result=`${a.id}已恢复`;this.log(order,task,'恢复',event.result);}else event.result='收到解除事实，无待恢复异常。';
    }else if(order.state!=='in_transit')event.result='运输区间外的基础事实，未生成在途异常。';
    else if((event.type==='parking'||event.type==='offline')&&assessmentConfig(order.config,event.type).enabled){
     event.assessment=simulateAssessment(event,assessmentConfig(order.config,event.type));
     this.log(order,task,'基础事件',`位置与环境研判：半径${event.assessment.radiusMeters}米；${event.assessment.pois.map(p=>`${p.name}（${p.category}，${p.distanceMeters}米）`).join('、')||'无有效POI证据'}。`);
     if(event.assessment.verdict==='reasonable'){event.result=`合理事件，不生成异常：${event.assessment.reason}`;this.log(order,task,'结果',event.result);}
     else{const a=this.anomaly(order,kindFor[event.type],task,`需人工复核：${event.assessment.reason}`,event.id,false);event.result=`${a.kind} ${a.id} · 需复核：${event.assessment.reason}`;}
    }
    else{const a=this.anomaly(order,kindFor[event.type],task,`固定规则命中：${event.type==='deviation'?`${event.distanceMeters}米 ≥ ${order.config.deviation.radiusMeters}米`:`${event.durationMinutes}分钟 ≥ ${order.config[event.type].thresholdMinutes}分钟`}。不经过大模型研判。`,event.id,false);event.result=`${a.kind} ${a.id}`;}
    if(event.type==='deviation'&&event.routePlanId)event.result+=`；线路策略${event.routeStrategy}；路线${event.routePlanId}`;
    this.log(order,task,'结果',event.result);
   }
   return '';
  },
  receiveWeather(order:P1Order,input:EventInput){
   if(['stopped','cleanup_pending'].includes(order.session)||this.now>=order.expiresAt)return '本单监听已结束，天气消息未处理。';
   if(!weatherEnabled(order.config))return '恶劣天气监听未开启，未采集。';
   if(this.now<(order.weatherEffectiveAt||Infinity))return `天气预警待生效，预计${dateText(order.weatherEffectiveAt)}。`;
   if(input.phase!=='started')return '天气服务未定义解除消息；不自动恢复异常。';
   if(!Number.isFinite(input.occurredAt)||input.occurredAt<Math.max(order.createdAt,order.weatherEffectiveAt||0)||input.occurredAt>this.now)return '天气消息时间不在有效监听窗口。';
   const categories=['风雨','雨','大雨','雷雨','暴雨','雾','大雾','雪','大雪','暴雪','积雪','雨夹雪','冰雹','大风','台风','飓风','结冰','浮尘','沙尘暴','扬沙'];
   if(!input.weatherType||!categories.includes(input.weatherType)||!input.message?.trim())return '未确认的恶劣天气类别或缺少消息内容，未生成天气事件。';
   if(this.events.some(e=>e.orderId===order.id&&e.type==='weather'&&(e.id===input.id||input.sourceMessageId&&e.sourceMessageId===input.sourceMessageId||e.occurredAt===input.occurredAt&&e.weatherType===input.weatherType&&e.message===input.message&&e.address===input.address)))return '重复天气消息已忽略。';
   const event:P1Event={...clone(input),projectId:order.projectId,receivedAt:this.now,taskIds:['p1-weather'],configVersion:order.config.version,result:''};this.events.push(event);
   this.log(order,'p1-weather','基础事件',`${input.weatherType} · ${dateText(input.occurredAt)} · ${input.address}；${input.message}；来源：天气预警消息。`);
   const a=this.anomaly(order,'恶劣天气','p1-weather',`${input.weatherType}：${input.message} 获取有效天气事件直接生成异常，无额外研判配置，不发送车机提醒。`,event.id);event.result=`恶劣天气 ${a.id}`;return '';
  },
  checkMissingPass(order:P1Order,source:string){
   const c=order.config;if(!monitoringSkillEnabled(c,'p1-late'))return;
   const rank={pending:0,loading:1,in_transit:2,arrived:3,completed:4};
   const stops=orderStops(order);
   for(const stop of stops){
    const target=stop.role==='loading'?'origin':'destination';
    if(!c.missingPass?.[target]||rank[order.state]<(stop.role==='loading'?1:3))continue;
    const kind=stop.role==='loading'?'未经过起始地':'未经过目的地';
    const evidence=this.events.some(e=>e.orderId===order.id&&e.type==='fence'&&e.stopId===stop.id&&['enter','exit'].includes(e.phase)&&e.occurredAt<=this.now);
    if(evidence){this.log(order,'p1-late','结果',`${source}：状态${stateNames[order.state]}，已有${stop.role==='loading'?'装货':'卸货'}点${stop.sequence}围栏记录，不生成${kind}异常。`);continue;}
    if(this.anomalies.some(a=>a.orderId===order.id&&a.kind===kind&&a.stopId===stop.id))continue;
    this.anomaly(order,kind,'p1-late',`${source}：运单状态更新为${stateNames[order.state]}，截至${dateText(this.now)}未取得${stop.role==='loading'?'装货':'卸货'}点${stop.sequence}围栏事件。缺少记录不等于已证实车辆未经过，可人工核实并纠正。`,undefined,true,stop.id);
   }
  },
  correctLate(order:P1Order){for(const a of this.anomalies.filter(a=>a.orderId===order.id&&['晚发','晚到'].includes(a.kind)&&a.status==='active')){
   const stop=a.stopId?orderStops(order).find(item=>item.id===a.stopId):undefined;
   const actual=stop?(a.kind==='晚发'?stop.exitedAt:stop.enteredAt):a.kind==='晚发'?order.departedAt:order.arrivedAt||order.completedAt;
   const plan=stop?.plannedAt??(a.kind==='晚发'?order.plannedDeparture:order.plannedArrival);const grace=a.kind==='晚发'?order.config.lateDeparture.graceMinutes:order.config.lateArrival.graceMinutes;
   if(actual&&plan&&actual<=(a.deadlineAt||plan+grace*MINUTE)){a.status='corrected';a.reason+=' 迟到证据证明按时完成，已纠正。';this.log(order,'p1-late','结果',`${a.id}迟到证据纠正；保留原异常记录。`);}
  }},
  tick(){
   for(const order of this.orders){
    if(['stopped','cleanup_pending'].includes(order.session))continue;
    if(this.now>=order.expiresAt){this.stop(order.id,'达到最晚监控结束时间');continue;}
    if(order.session==='subscribing'&&this.now>=order.activateAt){order.session='active';const watched=(['parking','offline','deviation'] as const).filter(type=>transportEnabled(order.config,type)&&!(type==='deviation'&&order.deviationBlocked));this.allLog(order,'开始',`监听服务已生效；${watched.length?`线路${order.routePlan?.id??'RID-'+order.id}供${watched.map(t=>kindFor[t]).join('、')}共享`:'当前无线路订阅，执行所选围栏/时效规则'}。`);}
    if(order.session!=='active')continue;
    const c=order.config;if(weatherEnabled(c)&&!order.weatherRequestedAt)this.startWeather(order);if(weatherEnabled(c)&&!order.weatherActiveLogged&&this.now>=(order.weatherEffectiveAt||Infinity)){order.weatherActiveLogged=true;this.log(order,'p1-weather','开始',`已到预计生效时间${dateText(order.weatherEffectiveAt)}，天气监听开始；需确认订阅结果，不发送车机提醒。`);}
    if(monitoringSkillEnabled(c,'p1-late')){
     for(const stop of orderStops(order)){
      const plan=stop.plannedAt;
      if(!plan)continue;
      if(stop.role==='loading'&&c.lateDeparture.enabled&&c.fenceTargets.includes('origin')&&!stop.exitedAt&&this.now>plan+c.lateDeparture.graceMinutes*MINUTE)this.anomaly(order,'晚发','p1-late',`${stop.place.name}计划装货${dateText(plan)} + ${c.lateDeparture.graceMinutes}分钟，当前无离开围栏事实。`,undefined,true,stop.id);
      if(stop.role==='unloading'&&c.lateArrival.enabled&&c.fenceTargets.includes('destination')&&!stop.enteredAt&&this.now>plan+c.lateArrival.graceMinutes*MINUTE)this.anomaly(order,'晚到','p1-late',`${stop.place.name}计划卸货${dateText(plan)} + ${c.lateArrival.graceMinutes}分钟，当前无进入围栏事实。`,undefined,true,stop.id);
     }
    }
    for(const a of this.anomalies.filter(a=>a.orderId===order.id&&a.status==='active'&&a.nextReminderAt>0&&this.now>=a.nextReminderAt)){
     const type=a.taskId==='p1-parking'?'parking':a.taskId==='p1-offline'?'offline':'deviation';if(!transportEnabled(c,type))continue;
     a.repeatCount++;a.nextReminderAt=this.now+c[type].repeatMinutes*MINUTE;this.log(order,a.taskId,'提醒',`${a.id}持续异常第${a.repeatCount}次提醒；引用既有事件，不是新位置数据，不新建异常。`);
    }
   }
  },
  advance(minutes:number){if(!Number.isFinite(minutes)||minutes<0)return;this.now+=minutes*MINUTE;this.tick();},
  stop(id:string,reason='用户取消监听'){
   const order=this.orders.find(o=>o.id===id);if(!order||['stopped','cleanup_pending'].includes(order.session))return;
   order.endReason=reason;order.cleanupAttempts++;order.session=order.cleanupWillFail?'cleanup_pending':'stopped';
   if(weatherEnabled(order.config))this.log(order,'p1-weather',order.cleanupWillFail?'失败':'结束',`天气订阅结束：${reason}；停止本单处理，${order.cleanupWillFail?'取消失败，待重试':'订阅引用已释放'}，其他运单仍有引用时不取消共享订阅。`);
   this.allLog(order,order.cleanupWillFail?'失败':'结束',`${reason}；停止本地事件处理、计时和重复提醒。${order.cleanupWillFail?'结束监听失败，待重试':'监听已结束，释放本单引用，不影响其他会话'}。`);
  },
  retryCleanup(id:string){const o=this.orders.find(o=>o.id===id);if(!o||o.session!=='cleanup_pending')return;o.cleanupWillFail=false;o.cleanupAttempts++;o.session='stopped';this.allLog(o,'结束',`第${o.cleanupAttempts}次结束监听成功；监听结束。`);},
  event(id:string,type:P1EventType,phase:P1Event['phase']='started',target?:P1Event['target'],options:Partial<EventInput>={}){const o=this.orders.find(o=>o.id===id);if(!o)return '运单不存在';const vehicles=o.plate.split('、').filter(Boolean);const currentVehicle=vehicles[vehicles.length-1]??o.plate;return this.receive({id:this.next('EV'),orderId:id,type,phase,target,occurredAt:this.now,address:target==='origin'?o.origin.name:target==='destination'?o.destination.name:'沪宁高速路段',durationMinutes:type==='parking'?45:40,distanceMeters:1500,vehiclePlate:currentVehicle,...options});},
  weatherSample(id:string,weatherType='暴雨',message='前方路段有暴雨，请注意运输安全。',sourceMessageId=this.next('WX')){return this.event(id,'weather','started',undefined,{weatherType,message,sourceMessageId,address:'沪宁高速前方路段',durationMinutes:0,distanceMeters:0});},
resetSamples(){const state={...clone(this.$state),lastResetSnapshot:''};this.lastResetSnapshot=JSON.stringify(state);this.now=demoEpoch;this.configs={...this.configs,'MONITOR-EAST':clone(defaultP1Config)};this.orders=[];this.events=[];this.anomalies=[];this.logs=[];this.sequence=0;this.error='';this.ready=false;this.capability='mock';this.seed();},
  undoReset(){if(!this.lastResetSnapshot)return;const saved=JSON.parse(this.lastResetSnapshot);this.$patch(saved);this.lastResetSnapshot='';},
  ensureTransferSample(){
   const existing=this.orders.find(order=>order.id==='WB-MON-008');
   if(existing){
    if(!this.events.some(event=>event.orderId===existing.id&&event.type==='transfer')&&this.config(existing.projectId).selectedSkills.includes('p1-transfer')){
     existing.config=clone(this.config(existing.projectId));
     this.recheckTrackEvents(existing.id,'historical');
    }
    return;
   }
   const origin={name:'上海嘉定工厂',lat:31.374,lon:121.265,radiusMeters:5000,regionCode:'310114'};const destination={name:'南京江宁仓',lat:31.95,lon:118.84,radiusMeters:5000,regionCode:'320115'};
   const transferStart=this.now-5*HOUR;
   const handoffA={lat:31.6240,lon:120.5070};
   const handoffB={lat:31.6242,lon:120.5074};
   this.createOrder({id:'WB-MON-008',projectId:'MONITOR-EAST',plate:'沪A12348、苏A67890',plateColor:2,driver:'司机8',source:'轨迹导入演示',origin,destination,plannedDeparture:transferStart+HOUR,plannedArrival:this.now+3*HOUR,loadType:'整车',vehicleSegments:[{plate:'沪A12348',sequence:1},{plate:'苏A67890',sequence:2}],actualTrack:[
    {lat:origin.lat,lon:origin.lon,at:transferStart+70*MINUTE,vehiclePlate:'沪A12348',speedKmh:0,onHighway:false,address:origin.name},
    {lat:31.40,lon:121.18,at:transferStart+80*MINUTE,vehiclePlate:'沪A12348',speedKmh:65,onHighway:true,roadName:'沪宁高速'},
    {lat:handoffA.lat,lon:handoffA.lon,at:transferStart+130*MINUTE,vehiclePlate:'沪A12348',speedKmh:0,onHighway:false,address:'无锡东物流停车区'},
    {lat:handoffB.lat,lon:handoffB.lon,at:transferStart+140*MINUTE,vehiclePlate:'苏A67890',speedKmh:0,onHighway:false,address:'无锡东物流停车区'},
    {lat:handoffA.lat,lon:handoffA.lon,at:transferStart+180*MINUTE,vehiclePlate:'沪A12348',speedKmh:0,onHighway:false,address:'无锡东物流停车区'},
    {lat:handoffB.lat,lon:handoffB.lon,at:transferStart+190*MINUTE,vehiclePlate:'苏A67890',speedKmh:0,onHighway:false,address:'无锡东物流停车区'},
    {lat:31.75,lon:119.83,at:transferStart+220*MINUTE,vehiclePlate:'苏A67890',speedKmh:72,onHighway:true,roadName:'沪宁高速'},
   ]},transferStart);
  },
  ensureMergeSamples(){
   const first={name:'苏州工业园集货仓',lat:31.316,lon:120.749,radiusMeters:5000,regionCode:'320571'};
   const second={name:'无锡新区周转仓',lat:31.573,lon:120.412,radiusMeters:5000,regionCode:'320214'};
   const third={name:'南京江宁一号仓',lat:31.950,lon:118.840,radiusMeters:5000,regionCode:'320115'};
   const fourth={name:'南京溧水二号仓',lat:31.650,lon:119.030,radiusMeters:5000,regionCode:'320117'};
   const cases=[{id:'WB-MON-009',plate:'苏A55888、冀A10203',driver:'张师傅、李师傅',origin:first,destination:third},{id:'WB-MON-010',plate:'苏A55888、冀A10203',driver:'张师傅、李师傅',origin:second,destination:fourth},{id:'WB-MON-011',plate:'苏A00000',driver:'王师傅',origin:second,destination:third}];
   for(const [index,item] of cases.entries()){
    if(this.orders.some(order=>order.id===item.id))continue;
    this.createOrder({id:item.id,projectId:'MONITOR-EAST',plate:item.plate,plateColor:2,driver:item.driver,source:'零担接口样例',origin:item.origin,destination:item.destination,plannedDeparture:this.now+HOUR,plannedArrival:this.now+6*HOUR,loadType:'零担',vehicleSegments:item.plate.split('、').map((plate,sequence)=>({plate,sequence:sequence+1})),stops:[{id:`${item.id}-pickup`,sequence:1,role:'loading',place:item.origin,plannedAt:this.now+(index+1)*HOUR},{id:`${item.id}-delivery`,sequence:2,role:'unloading',place:item.destination,plannedAt:this.now+(index+6)*HOUR}]});
   }
  },
  ensureWaybillDisplaySample(){
   if(this.orders.some(order=>order.id==='WB-MON-012'))return;
   const places=[
    {name:'苏州工业园集货仓',lat:31.316,lon:120.749,radiusMeters:5000,regionCode:'320571'},
    {name:'无锡新区周转仓',lat:31.573,lon:120.412,radiusMeters:5000,regionCode:'320214'},
    {name:'南京江宁一号仓',lat:31.950,lon:118.840,radiusMeters:5000,regionCode:'320115'},
    {name:'南京溧水二号仓',lat:31.650,lon:119.030,radiusMeters:5000,regionCode:'320117'},
   ];
   const plan=this.now+HOUR;
   this.createOrder({id:'WB-MON-012',projectId:'MONITOR-EAST',plate:'苏A55889、皖A77790',plateColor:2,driver:'演示司机',source:'多装多卸演示',origin:places[0]!,destination:places[3]!,plannedDeparture:plan,plannedArrival:plan+7*HOUR,loadType:'整车',vehicleSegments:[{plate:'苏A55889',sequence:1},{plate:'皖A77790',sequence:2}],stops:places.map((place,index)=>({id:`WB-MON-012-stop-${index+1}`,sequence:index+1,role:index<2?'loading' as const:'unloading' as const,place,plannedAt:plan+[0,2,5,7][index]!*HOUR}))});
  },
  seed(){if(this.ready){this.ensureTransferSample();this.ensureMergeSamples();this.ensureWaybillDisplaySample();return;}this.ready=true;
   const origin={name:'上海嘉定工厂',lat:31.374,lon:121.265,radiusMeters:5000,regionCode:'310114'};const destination={name:'南京江宁仓',lat:31.95,lon:118.84,radiusMeters:5000,regionCode:'320115'};
   const add=(n:number,created:number,dep:number|null,arr:number|null)=>this.createOrder({id:`WB-MON-${String(n).padStart(3,'0')}`,projectId:'MONITOR-EAST',plate:`沪A${12340+n}`,plateColor:2,driver:`司机${n}`,source:['手动录入','Excel导入','上游系统'][n%3]!,origin,destination,plannedDeparture:dep,plannedArrival:arr},created);
   add(1,this.now-3*HOUR,this.now-2*HOUR,this.now+3*HOUR);
   add(2,this.now-2*HOUR,this.now-HOUR,this.now+4*HOUR);
   add(3,this.now-5*HOUR,this.now-4*HOUR,this.now+HOUR);
   this.orders.find(o=>o.id==='WB-MON-003')!.plannedArrival=this.now-HOUR;
   add(4,this.now-20*HOUR,this.now-19*HOUR,this.now-16*HOUR);
   add(5,this.now-73*HOUR,this.now-72*HOUR,this.now+HOUR);
   add(6,this.now-4*HOUR,this.now-3*HOUR,this.now+HOUR);
   add(7,this.now-HOUR,null,null);
   this.ensureTransferSample();
   this.ensureMergeSamples();
   this.ensureWaybillDisplaySample();
   this.tick();
   for(const n of [1,3,4,6]){const id=`WB-MON-${String(n).padStart(3,'0')}`;const o=this.orders.find(o=>o.id===id)!;this.event(id,'fence','enter','origin',{occurredAt:o.createdAt+20*MINUTE});this.event(id,'fence','exit','origin',{occurredAt:o.createdAt+45*MINUTE});}
   this.event('WB-MON-001','parking','started',undefined,{position:{lat:31.367,lon:120.998}});this.event('WB-MON-001','offline','started',undefined,{position:{lat:31.367,lon:120.998}});this.event('WB-MON-001','deviation','started',undefined,{position:{lat:31.4,lon:120.96}});
   this.event('WB-MON-004','fence','enter','destination',{occurredAt:this.now-16*HOUR});this.event('WB-MON-004','fence','exit','destination',{occurredAt:this.now-15.5*HOUR});
   const failed=this.orders.find(o=>o.id==='WB-MON-006')!;failed.cleanupWillFail=true;this.event(failed.id,'fence','enter','destination',{occurredAt:this.now-30*MINUTE});this.event(failed.id,'fence','exit','destination');
  },
 }
});
