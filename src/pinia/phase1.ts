import { defineStore } from 'pinia';
import {parameterLimits as limits,inParameterRange} from '@/views/Phase1/parameterLimits';
import type {P1Config,P1Order,P1SkillId,P1Event,P1Anomaly,P1Log,P1EventType,P1State} from '@/views/AgentWork/interface';
import {phaseSkills,stateNames,dateText,nextWeatherMidnight} from '@/views/Phase1/catalog';
import {defaultAssessments,assessmentConfig,simulateAssessment} from '@/views/Phase1/eventAssessment';
// 系统固定分支：不调用LLM，不接受自然语言替换判断或订阅时限。
export function initialPlanState(departure:number|null,arrival:number|null,now:number):P1State {
 if(arrival!==null&&now>=arrival)return 'completed';
 if(departure!==null&&now>=departure)return 'in_transit';
 return 'pending';
}
export const demoEpoch=Date.parse('2026-10-14T10:00:00+08:00');
export const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export const defaultP1Config:P1Config={assessments:defaultAssessments(),version:1,missingPass:{origin:true,destination:true},selectedSkills:phaseSkills.map(s=>s.id),weather:{enabled:true},deviation:{enabled:true,radiusMeters:1000,repeatMinutes:30},offline:{enabled:true,thresholdMinutes:30,repeatMinutes:30},parking:{enabled:true,thresholdMinutes:30,repeatMinutes:30},fenceRadiusMeters:{origin:5000,destination:5000},fenceTargets:['origin','destination'],lateDeparture:{enabled:true,graceMinutes:60},lateArrival:{enabled:true,graceMinutes:60},statusUpdates:['loading','in_transit','arrived','completed']};
const HOUR=3600000;const MINUTE=60000;
const taskFor:Record<Exclude<P1EventType,'fence'|'weather'>,P1SkillId>={parking:'p1-parking',offline:'p1-offline',deviation:'p1-deviation'};
const kindFor={parking:'超时停车',offline:'在途离线',deviation:'线路偏离'} as const;
export type EventInput=Omit<P1Event,'projectId'|'receivedAt'|'result'|'taskIds'|'configVersion'>;
export function p1ConfigError(c:P1Config){
 for(const [label,value,rule] of [
  ['停车时长',c.parking.thresholdMinutes,limits.threshold],['离线时长',c.offline.thresholdMinutes,limits.threshold],
  ['停车重复提醒间隔',c.parking.repeatMinutes,limits.repeat],['离线重复提醒间隔',c.offline.repeatMinutes,limits.repeat],['偏离重复提醒间隔',c.deviation.repeatMinutes,limits.repeat],
  ['偏离半径',c.deviation.radiusMeters,limits.deviation],['晚发容许时间',c.lateDeparture.graceMinutes,limits.grace],['晚到容许时间',c.lateArrival.graceMinutes,limits.grace],
 ] as const)if(!inParameterRange(value,rule))return `${label}须为${rule.min}—${rule.max}的整数，步长${rule.step}。`;
 if(c.fenceRadiusMeters&&Object.values(c.fenceRadiusMeters).some(n=>!inParameterRange(n,limits.fence)))return '围栏半径须为100—50000米，按100米递增。';
 if(c.assessments&&Object.values(c.assessments).some(rule=>!inParameterRange(rule.radiusMeters,limits.poi)||typeof rule.filterRule!=='string'||rule.filterRule.length>limits.filterMax))return 'POI范围须为50—5000米，按50米递增；过滤规则最多2000字。';
 if(c.selectedSkills.some(id=>!phaseSkills.some(s=>s.id===id)))return '存在未知技能。';return '';
}
function transportEnabled(c:P1Config,type:'parking'|'offline'|'deviation'){return c.selectedSkills.includes(taskFor[type])&&c[type].enabled;}
function weatherEnabled(c:P1Config){return !!c.weather?.enabled&&c.selectedSkills.includes('p1-weather');}
function anyWatch(c:P1Config){return weatherEnabled(c)||c.selectedSkills.length>0&&(c.fenceTargets.length>0||(['parking','offline','deviation'] as const).some(t=>transportEnabled(c,t))||c.selectedSkills.includes('p1-late')&&(c.lateDeparture.enabled||c.lateArrival.enabled));}
export const usePhase1=defineStore('phase1-v11',{
 state:()=>({taskDefaultsRevision:0,now:demoEpoch,configs:{P001:clone(defaultP1Config)} as Record<string,P1Config>,orders:[] as P1Order[],events:[] as P1Event[],anomalies:[] as P1Anomaly[],logs:[] as P1Log[],sequence:0,error:'',capability:'mock' as 'mock'|'whitepaper',ready:false,lastResetSnapshot:''}),
 actions:{
  progress(id:string,next:P1State,reason='',source:'手动'|'运单状态同步'|'对话触发'|'超时结束'='手动'){
   const o=this.orders.find(o=>o.id===id);if(!o)return '运单不存在';
   const states:P1State[]=['pending','loading','in_transit','arrived','completed'];
   if(!reason.trim()&&states.indexOf(next)!==states.indexOf(o.state)+1)return '请按运输顺序推进；纠正状态需要填写原因。';
   const before=o.state;const key={loading:'enteredAt',in_transit:'departedAt',arrived:'arrivedAt',completed:'completedAt'} as const;
   if(reason.trim()){
    (o.corrections??=[]).push({at:this.now,reason:reason.trim(),before:stateNames[before],after:stateNames[next],operator:'当前用户'});
    for(const state of states.slice(states.indexOf(next)+1))if(state!=='pending')delete o[key[state]];
   }
   o.state=next;if(next!=='pending')o[key[next]]=this.now;
   (o.milestoneMethods??={})[next]=reason?'人工纠正':source==='手动'?'人工操作':source;
   this.log(o,'p1-status','结果',`${reason?'状态纠正':source}：${stateNames[before]} → ${stateNames[next]}${reason?`；原因：${reason}`:''}。`);
   if(before!==next)this.checkMissingPass(o,source);this.correctLate(o);if(next==='completed')this.stop(id,'人工确认运输完成');
   return '';
  },
  updateMilestone(id:string,state:Exclude<P1State,'pending'>,at:number){
   const o=this.orders.find(o=>o.id===id);if(!o)return '运单不存在';
   const nodes=[{state:'loading',key:'enteredAt'},{state:'in_transit',key:'departedAt'},{state:'arrived',key:'arrivedAt'},{state:'completed',key:'completedAt'}] as const;
   const index=nodes.findIndex(n=>n.state===state);const node=nodes[index];if(!node)return '请选择运输节点';
   if(!Number.isFinite(at)||at<o.createdAt||at>this.now)return '时间须在运单创建时间与当前演示时间之间';
   if(nodes.some((n,i)=>o[n.key]!==undefined&&(i<index?o[n.key]!>at:i>index?o[n.key]!<at:false)))return '节点时间须符合装货、发车、到达、完成的先后顺序';
   const before=o.state;const oldTime=o[node.key];o[node.key]=at;(o.milestoneMethods??={})[state]='手动更新';
   o.state=[...nodes].reverse().find(n=>o[n.key]!==undefined)!.state;
   (o.corrections??=[]).push({at:this.now,reason:`手动更新${stateNames[state]}时间：${dateText(oldTime)} → ${dateText(at)}`,before:stateNames[before],after:stateNames[o.state],operator:'当前用户'});
   this.log(o,'p1-status','结果',`手动更新${stateNames[state]}节点，时间${dateText(at)}；当前状态${stateNames[o.state]}。未创建围栏事件。`);
   if(before!==o.state)this.checkMissingPass(o,'手动');this.correctLate(o);
   if(o.state==='completed'&&!['stopped','cleanup_pending'].includes(o.session))this.stop(id,'人工更新完成节点，运输结束');
   return '';
  },
  correctResult(id:string,conclusion:string,reason:string){
   if(!reason.trim()||!conclusion.trim())return '请填写纠正结论和原因。';
   const a=this.anomalies.find(a=>a.id===id);const e=this.events.find(e=>e.id===id||a?.eventId===e.id);
   const o=this.orders.find(o=>o.id===(e?.orderId||a?.orderId));if(!o)return '结果不存在';
   const before=e?.result||`${a?.kind} · ${a?.status}`;
   const record={at:this.now,reason:reason.trim(),before,after:conclusion.trim(),operator:'当前用户'};
   if(e){e.originalResult??=e.result;(e.corrections??=[]).push(record);e.result=`人工纠正：${conclusion.trim()}；${reason.trim()}`;}
   const linked=this.anomalies.filter(x=>x.id===id||e&&x.eventId===e.id);
   for(const item of linked){(item.corrections??=[]).push(record);item.status='corrected';item.nextReminderAt=0;item.originalReason??=item.reason;item.reason=`${item.originalReason} 人工纠正：${conclusion.trim()}；${reason.trim()}`;}
   const ids=e?.taskIds.length?e.taskIds:a?[a.taskId]:['p1-status' as P1SkillId];
   for(const task of ids)this.log(o,task,'结果',`${id} 人工纠正：${conclusion}；原因：${reason}。原始事实与历史结果保留；不自动修改运单状态。`);
   return '';
  },
  next(prefix:string){return `${prefix}-${++this.sequence}`;},
  config(projectId:string):P1Config{const c=clone(this.configs[projectId]||defaultP1Config);c.fenceRadiusMeters??={origin:5000,destination:5000};c.weather??={enabled:false};c.missingPass??={origin:false,destination:false};c.assessments={...defaultAssessments(),...c.assessments};return c;},
  log(order:P1Order,taskId:P1SkillId,kind:P1Log['kind'],text:string){this.logs.push({id:this.next('LOG'),projectId:order.projectId,orderId:order.id,taskId,kind,at:this.now,text});},
  allLog(order:P1Order,kind:P1Log['kind'],text:string){for(const id of order.config.selectedSkills)if(!(id==='p1-weather'&&kind==='开始'))this.log(order,id,kind,text);},
  saveConfig(projectId:string,draft:P1Config,expectedVersion?:number){
   const error=p1ConfigError(draft);if(error){this.error=error;return false;}
   const previous=this.config(projectId);if(expectedVersion!==undefined&&previous.version!==expectedVersion){this.error='配置已被更新，请重新打开配置页面。';return false;}
   const next={...clone(draft),fenceRadiusMeters:draft.fenceRadiusMeters||{origin:5000,destination:5000},assessments:{...defaultAssessments(),...draft.assessments},weather:draft.weather||{enabled:false},version:previous.version+1};if(next.weather.enabled&&!next.selectedSkills.includes('p1-weather'))next.selectedSkills.push('p1-weather');this.configs[projectId]=next;this.error='';
   const physical=(c:P1Config)=>JSON.stringify({skills:[...c.selectedSkills].sort(),parking:[c.parking.enabled,c.parking.thresholdMinutes],offline:[c.offline.enabled,c.offline.thresholdMinutes],deviation:[c.deviation.enabled,c.deviation.radiusMeters],fences:[...c.fenceTargets].sort(),fenceRadius:c.fenceRadiusMeters||{origin:5000,destination:5000}});
   for(const order of this.orders.filter(o=>o.projectId===projectId&&!['stopped','cleanup_pending'].includes(o.session))){
    const previousConfig=order.config;const resubscribe=physical(order.config)!==physical(next);for(const a of this.anomalies.filter(a=>a.orderId===order.id&&a.status==='active'&&!['p1-late','p1-weather'].includes(a.taskId))){const type=a.taskId==='p1-parking'?'parking':a.taskId==='p1-offline'?'offline':'deviation';if(previousConfig[type].repeatMinutes!==next[type].repeatMinutes)a.nextReminderAt=this.now+next[type].repeatMinutes*MINUTE;}for(const id of order.config.selectedSkills.filter(id=>!next.selectedSkills.includes(id)))this.log(order,id,'结束','本Skill取消选择，停止处理并释放该任务引用；其他任务保留。');const wasWeather=weatherEnabled(order.config);order.config=clone(next);order.origin.radiusMeters=next.fenceRadiusMeters.origin;order.destination.radiusMeters=next.fenceRadiusMeters.destination;if(wasWeather&&!weatherEnabled(next))this.log(order,'p1-weather','结束','天气监听已关闭，停止本单天气事件处理并释放引用；未恢复异常及历史结果保留。');if(!wasWeather&&weatherEnabled(next))this.startWeather(order);
    this.allLog(order,'配置',`读取项目最新配置v${next.version}；${resubscribe?'受控更新订阅，等待模拟生效':'更新本地规则与提醒间隔'}，原72小时截止${dateText(order.expiresAt)}不延长。`);
    if(resubscribe){order.providerMode=this.capability;order.subscriptionRevision++;order.activateAt=this.now+10*MINUTE;order.session=anyWatch(next)?'subscribing':'paused';order.deviationBlocked=this.capability==='whitepaper'&&transportEnabled(next,'deviation');if(order.deviationBlocked)this.log(order,'p1-deviation','失败','白皮书未列偏离半径入参；该项未生效，其他项继续。');}
    if(!anyWatch(next))order.session='paused';
   }
   this.tick();return true;
  },
  createOrder(input:Pick<P1Order,'id'|'projectId'|'plate'|'plateColor'|'driver'|'source'|'origin'|'destination'|'plannedDeparture'|'plannedArrival'>,createdAt=this.now){
   if(!input.id.trim()||!input.plate.trim()||![1,2].includes(input.plateColor)){this.error='请填写运单号、车牌和蓝/黄车牌颜色。';return false;}
   if(this.orders.some(o=>o.id===input.id)){this.error='运单号已存在，未重复创建。';return false;}
   if(this.orders.some(o=>o.projectId===input.projectId&&o.plate===input.plate&&!['stopped','cleanup_pending'].includes(o.session))){this.error='同一项目存在该车的未结束运单，请先结束或取消原单。';return false;}
   for(const p of [input.origin,input.destination])if(!p.name.trim()||!p.regionCode||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180||!Number.isFinite(p.radiusMeters)||p.radiusMeters<=0){this.error='请填写起終点名称、区县编码、有效坐标和围栏半径。';return false;}
   if([input.plannedDeparture,input.plannedArrival].some(t=>t!==null&&!Number.isFinite(t))||input.plannedDeparture!==null&&input.plannedArrival!==null&&input.plannedArrival<input.plannedDeparture){this.error='计划时间无效，预计到达不能早于预计出发。';return false;}
   const config=this.config(input.projectId);const order:P1Order={...clone(input),createdAt,state:'pending',expiresAt:createdAt+72*HOUR,activateAt:createdAt+10*MINUTE,config,session:anyWatch(config)?'subscribing':'paused',endReason:'',cleanupWillFail:false,cleanupAttempts:0,subscriptionRevision:1,providerMode:this.capability,deviationBlocked:this.capability==='whitepaper'&&transportEnabled(config,'deviation')};
   order.origin.radiusMeters=config.fenceRadiusMeters?.origin??5000;order.destination.radiusMeters=config.fenceRadiusMeters?.destination??5000;
   // 固定顺序：校验→读取配置→计划初始化→已完成短路→按开关建立模拟订阅。
   order.state=initialPlanState(order.plannedDeparture,order.plannedArrival,this.now);
   const missing=order.plannedDeparture===null||order.plannedArrival===null;
   order.initialization={at:this.now,state:order.state,basis:`按计划时间初始化：预计出发${dateText(order.plannedDeparture)}，预计到达${dateText(order.plannedArrival)}；当前${dateText(this.now)}，默认为${stateNames[order.state]}。${missing?'计划时间缺失，请补齐；未使用创建时间替代。':''}此为计划推定，未核验实际轨迹或围栏，不写入实际里程碑时间。`};
   this.orders.push(order);this.allLog(order,'配置',`系统运单接入流程：${order.initialization.basis}`);
   if(order.state==='completed'){order.session='stopped';order.endReason='系统按计划到达时间初始化为已完成，不注册在途监控';order.subscriptionRevision=0;order.deviationBlocked=false;this.allLog(order,'结束',order.endReason+'；不注册天气订阅、围栏及其他事件监听，不启动计时或重复提醒。');this.error='';return true;}
   this.allLog(order,'开始',`系统监听注册：${order.id}，${order.plate}；项目最新配置v${config.version}，来源${order.source}，无需SaaS写单。${order.session==='paused'?'监听未开启':'请求模拟订阅，约10分钟后生效'}；固定截止${dateText(order.expiresAt)}。`);
   for(const type of ['parking','offline'] as const)if(order.providerMode==='whitepaper'&&transportEnabled(config,type)&&config[type].thresholdMinutes%10!==0)this.log(order,taskFor[type],'失败','白皮书约束模式：持续时长不是10分钟的倍数，该项未生效。');
   if(config.selectedSkills.includes('p1-late')&&(!config.fenceTargets.includes('origin')||!config.fenceTargets.includes('destination')))this.log(order,'p1-late','失败','缺少所选起始地/目的地围栏事实源，对应晚发/晚到规则不生成异常。');
   if(order.deviationBlocked)this.log(order,'p1-deviation','失败','CAPABILITY_UNSUPPORTED：白皮书没有线路偏离半径参数，该项未生效。');
   if(config.selectedSkills.includes('p1-late')&&(!order.plannedDeparture||!order.plannedArrival))this.log(order,'p1-late','失败','晚发/晚到计划时间缺失，相应计时规则待补齐；不以录入时间替代计划时间。');
   if(config.selectedSkills.includes('p1-late')&&[order.plannedDeparture,order.plannedArrival].some(t=>t&&t>order.expiresAt))this.log(order,'p1-late','失败','计划截止超过72小时监听范围，到期后不继续运行该规则。');
   if(config.selectedSkills.includes('p1-status')&&config.fenceTargets.length)this.log(order,'p1-status','开始',`围栏注册（模拟）：${config.fenceTargets.map(t=>`${t==='origin'?'起始地':'目的地'}半径${order[t].radiusMeters}米，分别注册进入/驶出区域并绑定${order.plate}`).join('；')}。注册结果、车辆绑定和回调通过后才确认生效。`);
   if(weatherEnabled(config))this.startWeather(order);
   this.error='';return true;
  },
  startWeather(order:P1Order){order.weatherRequestedAt??=this.now;order.weatherEffectiveAt??=nextWeatherMidnight(order.weatherRequestedAt);order.weatherActiveLogged=false;this.log(order,'p1-weather','开始',`恶劣天气监听已开启（本地模拟）。预计${dateText(order.weatherEffectiveAt)}生效；截止${dateText(order.expiresAt)}，等待期不延长72小时。不发送车机提醒；真实数据专用服务待接入确认。`);if(order.session==='paused'){order.session='subscribing';order.activateAt=this.now+10*MINUTE;}},
  weatherState(order:P1Order){return ['stopped','cleanup_pending'].includes(order.session)?'已结束':!weatherEnabled(order.config)?'未开启':this.now<(order.weatherEffectiveAt||Infinity)?'待生效':'监听中（模拟）';},
  anomaly(order:P1Order,kind:P1Anomaly['kind'],taskId:P1SkillId,reason:string,eventId?:string){
   const deadline=kind==='晚发'&&order.plannedDeparture?order.plannedDeparture+order.config.lateDeparture.graceMinutes*MINUTE:kind==='晚到'&&order.plannedArrival?order.plannedArrival+order.config.lateArrival.graceMinutes*MINUTE:undefined;
   const dismissed=deadline&&this.anomalies.find(a=>a.orderId===order.id&&a.kind===kind&&a.status==='corrected'&&a.deadlineAt===deadline);if(dismissed)return dismissed;
   const existing=this.anomalies.find(a=>a.orderId===order.id&&a.kind===kind&&a.status==='active'&&(kind!=='恶劣天气'||a.eventId===eventId));if(existing){existing.lastAt=this.now;return existing;}
   const repeat=['p1-late','p1-weather'].includes(taskId)?0:order.config[taskId==='p1-parking'?'parking':taskId==='p1-offline'?'offline':'deviation'].repeatMinutes;
   const abnormal:P1Anomaly={id:this.next('AB'),orderId:order.id,kind,taskId,status:'active',firstAt:this.now,lastAt:this.now,nextReminderAt:repeat?this.now+repeat*MINUTE:0,repeatCount:0,reason,deadlineAt:kind==='晚发'&&order.plannedDeparture?order.plannedDeparture+order.config.lateDeparture.graceMinutes*MINUTE:kind==='晚到'&&order.plannedArrival?order.plannedArrival+order.config.lateArrival.graceMinutes*MINUTE:undefined,eventId,configVersion:order.config.version};this.anomalies.push(abnormal);this.log(order,taskId,'结果',`${kind} ${abnormal.id}：${reason}`);return abnormal;
  },
  receive(input:EventInput){
   const order=this.orders.find(o=>o.id===input.orderId);if(!order)return '运单不存在';
   this.tick();if(input.type==='weather')return this.receiveWeather(order,input);if(order.session!=='active')return `监听未生效或已停止（${order.session}），未采集。`;
   if(input.occurredAt<order.createdAt)return '事件早于创建时间，本期不初始化历史状态。';
   if(!Number.isFinite(input.occurredAt)||input.occurredAt>this.now)return '发生时间必须有效且不晚于模拟当前时间。';
   if(this.events.some(e=>e.id===input.id||e.orderId===input.orderId&&e.type===input.type&&e.phase===input.phase&&e.occurredAt===input.occurredAt&&e.target===input.target))return '重复事件已忽略。';
   if(input.type==='fence'){
    if(!input.target||!order.config.fenceTargets.includes(input.target)||!order.config.selectedSkills.length)return '未订阅该地点围栏，未采集。';
    if(!['enter','exit'].includes(input.phase))return '围栏出入类型无效。';
   }else{
    if(!transportEnabled(order.config,input.type))return '监听或相应Skill未开启，未采集。';
    if(!['started','recovered'].includes(input.phase))return '告警阶段无效。';
    if(order.providerMode==='whitepaper'&&input.type!=='deviation'&&order.config[input.type].thresholdMinutes%10!==0)return '白皮书模式仅支持10分钟倍数的阈值，该项未采集。';
    if(input.type==='deviation'&&order.deviationBlocked)return '偏离半径接口能力未确认，本项未生效。';
    if(input.phase==='started'){
     if(input.type==='deviation'&&(!Number.isFinite(input.distanceMeters)||input.distanceMeters<=order.config.deviation.radiusMeters))return '未超过配置偏离距离，未采集。';
     if(input.type!=='deviation'&&(!Number.isFinite(input.durationMinutes)||input.durationMinutes<order.config[input.type].thresholdMinutes))return '未达到持续时长阈值，未采集。';
    }
   }
   const event:P1Event={...clone(input),projectId:order.projectId,receivedAt:this.now,result:'',taskIds:[],configVersion:order.config.version};this.events.push(event);
   if(event.type==='fence'){
    const mapped:P1State=event.target==='origin'?(event.phase==='enter'?'loading':'in_transit'):(event.phase==='enter'?'arrived':'completed');
    if(event.target==='origin'&&event.phase==='enter')order.enteredAt=Math.min(order.enteredAt||event.occurredAt,event.occurredAt);
    if(event.target==='origin'&&event.phase==='exit')order.departedAt=Math.min(order.departedAt||event.occurredAt,event.occurredAt);
    if(event.target==='destination'&&event.phase==='enter')order.arrivedAt=Math.min(order.arrivedAt||event.occurredAt,event.occurredAt);
    if(event.target==='destination'&&event.phase==='exit')order.completedAt=Math.min(order.completedAt||event.occurredAt,event.occurredAt);
    (order.milestoneMethods??={})[mapped]='围栏事件';
    const rank={pending:0,loading:1,in_transit:2,arrived:3,completed:4};const before=order.state;
    if(order.config.selectedSkills.includes('p1-status')){event.taskIds.push('p1-status');
     if(order.config.statusUpdates.includes(mapped)&&rank[mapped]>rank[before]){order.state=mapped;event.stateUpdate=stateNames[mapped];event.result=`${stateNames[before]} → ${stateNames[mapped]}`;}else event.result=`基础事实已记录；${rank[mapped]<=rank[before]?'重复或乱序，不回退状态':'该状态未勾选，不更新显示状态'}。`;
     this.log(order,'p1-status','基础事件',`${event.target==='origin'?'起始地':'目的地'}${event.phase==='enter'?'进入':'离开'}，${dateText(event.occurredAt)}，${event.address}。`);this.log(order,'p1-status','结果',event.result);
    }else event.result='围栏事实已记录；状态Skill未选择，显示状态不变。';
    if(order.config.selectedSkills.includes('p1-late')){event.taskIds.push('p1-late');this.log(order,'p1-late','基础事件',`取得${event.target==='origin'?'起始地':'目的地'}${event.phase==='enter'?'进入':'离开'}事实；里程碑独立于显示状态。`);}
    this.correctLate(order);
    if(order.completedAt)this.stop(order.id,'目的地驶出，运单运输结束');
   }else{
    const task=taskFor[event.type];event.taskIds.push(task);this.log(order,task,'基础事件',`${event.type==='parking'?'停车':event.type==='offline'?'离线':'偏离'}${event.phase==='recovered'?'解除':'告警'}；发生${dateText(event.occurredAt)}，接收${dateText(this.now)}；${event.address}，${event.type==='deviation'?`${event.distanceMeters}米`:`${event.durationMinutes}分钟`}。`);
    if(event.phase==='recovered'){
     const a=this.anomalies.find(a=>a.orderId===order.id&&a.kind===kindFor[event.type]&&a.status==='active');if(a){a.status='recovered';a.lastAt=this.now;event.result=`${a.id}已恢复`;this.log(order,task,'恢复',event.result);}else event.result='收到解除事实，无待恢复异常。';
    }else if(!order.departedAt||order.arrivedAt||order.completedAt)event.result='运输区间外的基础事实，未生成在途异常。';
    else if((event.type==='parking'||event.type==='offline')&&assessmentConfig(order.config,event.type).enabled){
     event.assessment=simulateAssessment(event,assessmentConfig(order.config,event.type));
     this.log(order,task,'基础事件',`POI查询与LLM研判（模拟）：半径${event.assessment.radiusMeters}米；${event.assessment.pois.map(p=>`${p.name}（${p.category}，${p.distanceMeters}米）`).join('、')||'无有效POI证据'}。`);
     if(event.assessment.verdict==='reasonable'){event.result=`低风险事件（模拟研判）：${event.assessment.reason}`;this.log(order,task,'结果',event.result);}
     else{const a=this.anomaly(order,kindFor[event.type],task,`需人工复核（模拟研判）：${event.assessment.reason}`,event.id);event.result=`${a.kind} ${a.id} · 需复核：${event.assessment.reason}`;}
    }
    else{const a=this.anomaly(order,kindFor[event.type],task,`固定规则命中：${event.type==='deviation'?`${event.distanceMeters}米 ≥ ${order.config.deviation.radiusMeters}米`:`${event.durationMinutes}分钟 ≥ ${order.config[event.type].thresholdMinutes}分钟`}。不经过大模型研判。`,event.id);event.result=`${a.kind} ${a.id}`;}
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
   this.log(order,'p1-weather','基础事件',`${input.weatherType} · ${dateText(input.occurredAt)} · ${input.address}；${input.message}；来源：模拟天气预警消息。`);
   const a=this.anomaly(order,'恶劣天气','p1-weather',`${input.weatherType}：${input.message} 获取有效天气事件直接生成异常，无额外研判配置，不发送车机提醒。`,event.id);event.result=`恶劣天气 ${a.id}`;return '';
  },
  checkMissingPass(order:P1Order,source:string){
   const c=order.config;if(!c.selectedSkills.includes('p1-late'))return;
   const rank={pending:0,loading:1,in_transit:2,arrived:3,completed:4};
   for(const target of ['origin','destination'] as const){
    if(!c.missingPass?.[target]||rank[order.state]<(target==='origin'?1:3))continue;
    const kind=target==='origin'?'未经过起始地':'未经过目的地';
    const evidence=this.events.some(e=>e.orderId===order.id&&e.type==='fence'&&e.target===target&&['enter','exit'].includes(e.phase)&&e.occurredAt<=this.now);
    if(evidence){this.log(order,'p1-late','结果',`${source}：状态${stateNames[order.state]}，已有${target==='origin'?'起始地':'目的地'}进出围栏记录，不生成${kind}异常。`);continue;}
    if(this.anomalies.some(a=>a.orderId===order.id&&a.kind===kind))continue;
    this.anomaly(order,kind,'p1-late',`${source}：运单状态更新为${stateNames[order.state]}，截至${dateText(this.now)}未取得${target==='origin'?'起始地':'目的地'}进入或离开围栏事件。缺少记录不等于已证实车辆未经过，可人工核实并纠正。`);
   }
  },
  correctLate(order:P1Order){for(const a of this.anomalies.filter(a=>a.orderId===order.id&&['晚发','晚到'].includes(a.kind)&&a.status==='active')){
   const actual=a.kind==='晚发'?order.departedAt:order.arrivedAt||order.completedAt;const plan=a.kind==='晚发'?order.plannedDeparture:order.plannedArrival;const grace=a.kind==='晚发'?order.config.lateDeparture.graceMinutes:order.config.lateArrival.graceMinutes;
   if(actual&&plan&&actual<=(a.deadlineAt||plan+grace*MINUTE)){a.status='corrected';a.reason+=' 迟到证据证明按时完成，已纠正。';this.log(order,'p1-late','结果',`${a.id}迟到证据纠正；保留原异常记录。`);}
  }},
  tick(){
   for(const order of this.orders){
    // 运单自动结束独立于订阅生命周期：退订后仍按计划到达+72小时执行。
    if(order.state!=='completed'&&Number.isFinite(order.plannedArrival)&&order.plannedArrival!==null&&this.now>=order.plannedArrival+72*HOUR){
     order.config=this.config(order.projectId);order.state='completed';order.completedAt=order.plannedArrival+72*HOUR;
     (order.milestoneMethods??={}).completed='超时结束';
     this.log(order,'p1-status','结果',`计划结束时间${dateText(order.plannedArrival)}后满72小时，自动更新为已完成；未生成目的地围栏事实。`);
     this.checkMissingPass(order,'超时结束');this.stop(order.id,'计划结束时间后72小时自动完成');
    }
    if(['stopped','cleanup_pending'].includes(order.session))continue;
    if(this.now>=order.expiresAt){this.checkMissingPass(order,'超时结束');this.stop(order.id,'超过72小时监听上限');continue;}
    if(order.session==='subscribing'&&this.now>=order.activateAt){order.session='active';const watched=(['parking','offline','deviation'] as const).filter(type=>transportEnabled(order.config,type)&&!(type==='deviation'&&order.deviationBlocked));this.allLog(order,'开始',`模拟订阅已生效；${watched.length?`线路RID-${order.id}-v${order.subscriptionRevision}供${watched.map(t=>kindFor[t]).join('、')}共享`:'当前无线路订阅，执行所选围栏/本地规则'}。`);}
    if(order.session!=='active')continue;
    const c=order.config;if(weatherEnabled(c)&&!order.weatherRequestedAt)this.startWeather(order);if(weatherEnabled(c)&&!order.weatherActiveLogged&&this.now>=(order.weatherEffectiveAt||Infinity)){order.weatherActiveLogged=true;this.log(order,'p1-weather','开始',`已到预计生效时间${dateText(order.weatherEffectiveAt)}，本地模拟天气监听开始；真实接入须确认订阅结果，不发送车机提醒。`);}
    if(c.selectedSkills.includes('p1-late')){
     if(c.lateDeparture.enabled&&c.fenceTargets.includes('origin')&&order.plannedDeparture&&!order.departedAt&&!order.arrivedAt&&!order.completedAt&&this.now>order.plannedDeparture+c.lateDeparture.graceMinutes*MINUTE)this.anomaly(order,'晚发','p1-late',`预计出发${dateText(order.plannedDeparture)} + ${c.lateDeparture.graceMinutes}分钟，当前无发车事实。`);
     if(c.lateArrival.enabled&&c.fenceTargets.includes('destination')&&order.plannedArrival&&!order.arrivedAt&&!order.completedAt&&this.now>order.plannedArrival+c.lateArrival.graceMinutes*MINUTE)this.anomaly(order,'晚到','p1-late',`预计到达${dateText(order.plannedArrival)} + ${c.lateArrival.graceMinutes}分钟，当前无到达事实。`);
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
   if(weatherEnabled(order.config))this.log(order,'p1-weather',order.cleanupWillFail?'失败':'结束',`天气订阅结束：${reason}；停止本单处理，${order.cleanupWillFail?'模拟取消失败待重试':'模拟释放订阅引用成功'}，其他运单仍有引用时不取消共享订阅。`);
   this.allLog(order,order.cleanupWillFail?'失败':'结束',`${reason}；停止本地事件处理、计时和重复提醒。${order.cleanupWillFail?'模拟外部退订失败，待重试':'模拟退订成功，释放本单引用，不影响其他会话'}。`);
  },
  retryCleanup(id:string){const o=this.orders.find(o=>o.id===id);if(!o||o.session!=='cleanup_pending')return;o.cleanupWillFail=false;o.cleanupAttempts++;o.session='stopped';this.allLog(o,'结束',`第${o.cleanupAttempts}次退订模拟成功；监听结束。`);},
  event(id:string,type:P1EventType,phase:P1Event['phase']='started',target?:P1Event['target'],options:Partial<EventInput>={}){const o=this.orders.find(o=>o.id===id);if(!o)return '运单不存在';return this.receive({id:this.next('EV'),orderId:id,type,phase,target,occurredAt:this.now,address:target==='origin'?o.origin.name:target==='destination'?o.destination.name:'沪宁高速路段',durationMinutes:type==='parking'?45:40,distanceMeters:1500,...options});},
  weatherSample(id:string,weatherType='暴雨',message='前方路段有暴雨，请注意运输安全。',sourceMessageId=this.next('WX')){return this.event(id,'weather','started',undefined,{weatherType,message,sourceMessageId,address:'沪宁高速前方路段',durationMinutes:0,distanceMeters:0});},
  resetSamples(){const state={...clone(this.$state),lastResetSnapshot:''};this.lastResetSnapshot=JSON.stringify(state);this.now=demoEpoch;this.configs={...this.configs,P001:clone(defaultP1Config)};this.orders=[];this.events=[];this.anomalies=[];this.logs=[];this.sequence=0;this.error='';this.ready=false;this.capability='mock';this.seed();},
  undoReset(){if(!this.lastResetSnapshot)return;const saved=JSON.parse(this.lastResetSnapshot);this.$patch(saved);this.lastResetSnapshot='';},
  seed(){if(this.ready)return;this.ready=true;
   const origin={name:'上海嘉定工厂',lat:31.374,lon:121.265,radiusMeters:500,regionCode:'310114'};const destination={name:'南京江宁仓',lat:31.95,lon:118.84,radiusMeters:500,regionCode:'320115'};
   const add=(n:number,created:number,dep:number|null,arr:number|null)=>this.createOrder({id:`V11-WB${String(n).padStart(3,'0')}`,projectId:'P001',plate:`沪A${12340+n}`,plateColor:2,driver:`演示司机${n}`,source:['手动录入','Excel导入','上游系统'][n%3]!,origin,destination,plannedDeparture:dep,plannedArrival:arr},created);
   add(1,this.now-3*HOUR,this.now-2*HOUR,this.now+3*HOUR);
   add(2,this.now-2*HOUR,this.now-HOUR,this.now+4*HOUR);
   add(3,this.now-5*HOUR,this.now-4*HOUR,this.now+HOUR);
   this.orders.find(o=>o.id==='V11-WB003')!.plannedArrival=this.now-HOUR;
   add(4,this.now-20*HOUR,this.now-19*HOUR,this.now-16*HOUR);
   add(5,this.now-73*HOUR,this.now-72*HOUR,this.now+HOUR);
   add(6,this.now-4*HOUR,this.now-3*HOUR,this.now+HOUR);
   add(7,this.now-HOUR,null,null);
   this.tick();
   for(const n of [1,3,4,6]){const id=`V11-WB${String(n).padStart(3,'0')}`;const o=this.orders.find(o=>o.id===id)!;this.event(id,'fence','enter','origin',{occurredAt:o.createdAt+20*MINUTE});this.event(id,'fence','exit','origin',{occurredAt:o.createdAt+45*MINUTE});}
   this.event('V11-WB001','parking');this.event('V11-WB001','offline');this.event('V11-WB001','deviation');
   this.event('V11-WB004','fence','enter','destination',{occurredAt:this.now-16*HOUR});this.event('V11-WB004','fence','exit','destination',{occurredAt:this.now-15.5*HOUR});
   const failed=this.orders.find(o=>o.id==='V11-WB006')!;failed.cleanupWillFail=true;this.event(failed.id,'fence','enter','destination',{occurredAt:this.now-30*MINUTE});this.event(failed.id,'fence','exit','destination');
  },
 }
});
