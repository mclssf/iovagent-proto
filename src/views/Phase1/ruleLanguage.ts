import type {P1Config,P1SkillId} from '@/views/AgentWork/interface';
import {assessmentConfig,effectiveFilter,defaultAssessments} from './eventAssessment';
import {phaseSkills,stateNames} from './catalog';
export function taskRule(c:P1Config,id:string):string {
 if(id==='p1-parking'||id==='p1-offline'){const k=id==='p1-parking'?'parking':'offline';return `${c[k].enabled?'开启':'关闭'}${k==='parking'?'超时停车':'在途离线'}监听；持续${c[k].thresholdMinutes}分钟${assessmentConfig(c,k).enabled?'采集事件后研判':'生成异常'}，同一异常每${c[k].repeatMinutes}分钟提醒一次。${assessmentConfig(c,k).enabled?`开启POI与LLM研判，查询范围${assessmentConfig(c,k).radiusMeters}米，按${assessmentConfig(c,k).filterRule.trim()?'自定义':'默认'}规则过滤合理事件。`:'未开启POI研判，按时长直接生成异常。'}`;}
 if(id==='p1-deviation')return `${c.deviation.enabled?'开启':'关闭'}线路偏离监听；偏离计划线路超过${c.deviation.radiusMeters}米生成异常，同一异常每${c.deviation.repeatMinutes}分钟提醒一次。`;
 if(id==='p1-weather')return `${c.weather.enabled?'开启':'关闭'}恶劣天气监听；有效天气消息直接生成异常，预计次日0点生效，运单结束或监听满72小时停止。`;
 if(id==='p1-late')return `晚发${c.lateDeparture.enabled?'开启':'关闭'}，允许延迟${c.lateDeparture.graceMinutes}分钟；晚到${c.lateArrival.enabled?'开启':'关闭'}，允许延迟${c.lateArrival.graceMinutes}分钟；未经过起始地异常${c.missingPass?.origin?'开启':'关闭'}，未经过目的地异常${c.missingPass?.destination?'开启':'关闭'}。`;
 return `监听${c.fenceTargets.map(x=>x==='origin'?'起始地':'目的地').join('、')||'未选择的'}围栏；自动更新${c.statusUpdates.map(x=>stateNames[x]).join('、')||'未选择的状态'}。未勾选的状态不自动更新，围栏事实仍保留。`;
}
export interface RuleProposal {config:P1Config; changes:string[]; unresolved:string[]; name?:string}
export function parseRuleRequest(text:string,base:P1Config,scope?:P1SkillId):RuleProposal {
 const config=JSON.parse(JSON.stringify(base)) as P1Config;const changes:string[]=[];const unresolved:string[]=[];let name:string|undefined;
 let request=text;const filterInput=scope&&['p1-parking','p1-offline'].includes(scope)?text.match(/过滤规则[：:]([\s\S]+)/):null;
 if(filterInput){config.assessments??=defaultAssessments();const key=scope==='p1-parking'?'parking':'offline';config.assessments[key].filterRule=filterInput[1].trim();changes.push(`过滤规则调整为：${filterInput[1].trim()}`);request=text.slice(0,filterInput.index);}
 const clauses=request.split(/[，,。；;\n]/).map(x=>x.trim()).filter(Boolean);let context='';
 const add=(id:P1SkillId)=>{if(!config.selectedSkills.includes(id))config.selectedSkills.push(id);};
 for(const clause of clauses){
  const named=clause.match(/(?:项目名称|项目名|项目叫|项目命名为|创建项目|新建项目)[为是叫：:\s]*[“「"]?([^”」"]+)/);
  if(named&&!scope){name=named[1].trim();if(name.length>20){unresolved.push('项目名称不能超过20字');continue;}changes.push(`项目名称改为“${name}”`);continue;}
  if(/多装|多卸|必经|倒短|循环|车机|白名单|小时后结束/.test(clause)){unresolved.push(clause+'：本期暂不支持');continue;}
  const explicit= /停车/.test(clause)?'p1-parking':/离线/.test(clause)?'p1-offline':/偏离|偏移/.test(clause)?'p1-deviation':/天气/.test(clause)?'p1-weather':/晚发|晚到|未经过|经过起始地|经过目的地/.test(clause)?'p1-late':/围栏|装货中|在途|已到达|已完成|状态更新/.test(clause)?'p1-status':'';
  const id=explicit||context||scope;
  if(/-\s*\d/.test(clause)){unresolved.push(clause+'：数值不能为负数');continue;}
  if(!id||scope&&id!==scope){unresolved.push(clause+'：请说明要调整的当前任务规则');continue;}context=id;
  if((id==='p1-parking'||id==='p1-offline')&&/研判|POI|poi|查询范围|过滤规则/.test(clause)){
   config.assessments??=defaultAssessments();const key=id==='p1-parking'?'parking':'offline';const a=config.assessments[key];let applied=false;
   const radius=clause.match(/(?:范围|半径)[^0-9]*([0-9]+)\s*米/);if(radius&&Number(radius[1])>0){a.radiusMeters=Number(radius[1]);applied=true;}
   if(/默认/.test(clause)){a.filterRule='';applied=true;}
   if(/关闭|暂停|不启用/.test(clause)){a.enabled=false;applied=true;}else if(/开启|启用|打开/.test(clause)){a.enabled=true;applied=true;}
   if(applied)changes.push(`${id==='p1-parking'?'停车':'离线'}研判：${a.enabled?'开启':'关闭'}，POI范围${a.radiusMeters}米，${a.filterRule.trim()?'自定义规则':'默认规则'}`);else unresolved.push(clause+'：请填写查询范围（米）或使用“过滤规则：…”');continue;
  }
  const off=/关闭|暂停|取消|不监听|不更新/.test(clause);const on=/开启|打开|启用|开始|监听|监控|更新/.test(clause);let handled=false;
  const numbers=[...clause.matchAll(/(\d+(?:\.\d+)?)\s*(分钟|小时|公里|千米|米)/g)].map(m=>({value:Number(m[1])*(['小时','公里','千米'].includes(m[2])?(m[2]==='小时'?60:1000):1),unit:m[2],index:m.index||0}));
  if(numbers.some(n=>!Number.isSafeInteger(n.value)||n.value<=0)){unresolved.push(clause+'：请输入大于0的整数分钟或米');continue;}
  if(id==='p1-parking'||id==='p1-offline'||id==='p1-deviation'){
   const key=id==='p1-parking'?'parking':id==='p1-offline'?'offline':'deviation';
   for(const n of numbers){const before=clause.slice(Math.max(0,n.index-12),n.index);const reminder=/提醒|间隔|每/.test(before);if(key==='deviation'&&!reminder){if(!['米','公里','千米'].includes(n.unit))continue;config.deviation.radiusMeters=n.value;}else {if(!['分钟','小时'].includes(n.unit))continue;if(reminder)config[key].repeatMinutes=n.value;else if(key!=='deviation')config[key].thresholdMinutes=n.value;else continue;}handled=true;}
   if(off||on){config[key].enabled=!off;handled=true;}if(handled&&!scope&&!off){config[key].enabled=true;add(id);}
  }else if(id==='p1-weather'){
   if(numbers.length){unresolved.push(clause+'：天气任务不支持阈值和提醒间隔');continue;}if(on||off){config.weather.enabled=!off;if(!off)add('p1-weather');handled=true;}
  }else if(id==='p1-late'){
   config.missingPass??={origin:false,destination:false};for(const [word,key] of [['起始地','origin'],['目的地','destination']] as const){if(clause.includes(word)&&/经过/.test(clause)&&(on||off)){config.missingPass[key]=!off;handled=true;}}
   for(const [word,key] of [['晚发','lateDeparture'],['晚到','lateArrival']] as const){if(!clause.includes(word))continue;const match=clause.match(new RegExp(word+'[^0-9]*([0-9]+(?:\\.[0-9]+)?)\\s*(分钟|小时)'));const n=match?{value:Number(match[1])*(match[2]==='小时'?60:1)}:undefined;if(n){config[key].graceMinutes=n.value;handled=true;}if(on||off){config[key].enabled=!off;handled=true;}if(n&&!scope&&!off)config[key].enabled=true;}
   if(handled&&!scope)add('p1-late');
  }else{
   for(const [word,target] of [['起始地','origin'],['目的地','destination']] as const){if(clause.includes(word)&&/围栏/.test(clause)&&(on||off)){config.fenceTargets=off?config.fenceTargets.filter(x=>x!==target):[...new Set([...config.fenceTargets,target])];handled=true;}}
   for(const [state,label] of Object.entries(stateNames)){if(state==='pending')continue;if(clause.includes(label)&&/更新/.test(clause)){const value=state as P1Config['statusUpdates'][number];config.statusUpdates=off?config.statusUpdates.filter(x=>x!==value):[...new Set([...config.statusUpdates,value])];handled=true;}}
   if(handled&&!scope)add('p1-status');
  }
  if(!handled)unresolved.push(clause+'：未识别到可调整的开关、时长、距离或状态');
 }
 for(const skill of phaseSkills)if(JSON.stringify(base)!==JSON.stringify(config)&&taskRule(base,skill.id)!==taskRule(config,skill.id))changes.push(`${skill.name}：${taskRule(base,skill.id)} → ${taskRule(config,skill.id)}`);
 return {config,changes,unresolved,name};
}

export function taskParameters(c:P1Config,id:string):{key:string;label:string;value:string;note:string}[]{
 const switchText=(on:boolean)=>on?'开启':'关闭';
 if(id==='p1-parking'||id==='p1-offline'){
  const k=id==='p1-parking'?'parking':'offline';const label=k==='parking'?'停车':'离线';
  const assessment=assessmentConfig(c,k);
  return [{key:'enabled',label:'监听开关',value:switchText(c[k].enabled),note:'关闭后不采集该类事件。'},
   {key:'threshold',label:`${label}时长`,value:`${c[k].thresholdMinutes}分钟`,note:`仅在发出后、到达前，持续${label}达到此时长才生成异常。`},
   {key:'repeat',label:'重复提醒间隔',value:`${c[k].repeatMinutes}分钟`,note:'同一异常未恢复时的再次提醒间隔，不是数据获取频率。'},
   {key:'assessment',label:'异常研判',value:assessment.enabled?'POI与LLM研判':'未开启',note:'判为合理才不生成异常；证据不足保留异常待复核。'},
   ...(assessment.enabled?[{key:'poi-radius',label:'POI查询范围',value:`${assessment.radiusMeters}米`,note:'以事件位置（离线为最后有效位置）为中心查询。'}, {key:'filter-rule',label:'过滤规则',value:assessment.filterRule.trim()||'使用默认规则',note:effectiveFilter(assessment,k)}]:[])];
 }
 if(id==='p1-deviation')return [{key:'enabled',label:'监听开关',value:switchText(c.deviation.enabled),note:'关闭后不采集线路偏离事件。'},
  {key:'radius',label:'偏离半径',value:`${c.deviation.radiusMeters}米`,note:'在途车辆偏离计划线路的距离严格超过此值时生成异常。'},
  {key:'repeat',label:'重复提醒间隔',value:`${c.deviation.repeatMinutes}分钟`,note:'同一异常未恢复时再次提醒，不生成新的异常。'}];
 if(id==='p1-late')return [
  {key:'missing-origin',label:'未经过起始地异常',value:switchText(!!c.missingPass?.origin),note:'状态更新为装货中、在途、已到达或已完成，且没有起始地进或出围栏记录时生成异常；初始化除外。'},
  {key:'missing-destination',label:'未经过目的地异常',value:switchText(!!c.missingPass?.destination),note:'状态更新为已到达或已完成，且没有目的地进或出围栏记录时生成异常；初始化除外。'},
  {key:'departure-enabled',label:'晚发异常开关',value:switchText(c.lateDeparture.enabled),note:'关闭后不判断晚发。'},
  {key:'departure-time',label:'晚发容许时间',value:`${c.lateDeparture.graceMinutes}分钟`,note:'超过预计出发时间加此时长，仍无有效发出事实时生成晚发异常。'},
  {key:'arrival-enabled',label:'晚到异常开关',value:switchText(c.lateArrival.enabled),note:'关闭后不判断晚到。'},
  {key:'arrival-time',label:'晚到容许时间',value:`${c.lateArrival.graceMinutes}分钟`,note:'超过预计到达时间加此时长，仍无有效到达事实时生成晚到异常。'}];
 if(id==='p1-weather')return [{key:'enabled',label:'恶劣天气监听开关',value:switchText(c.weather.enabled),note:'开启后接收有效天气事件并直接生成异常，无额外研判参数。'},
  {key:'effective',label:'预计生效时间',value:'订阅成功后的次日0点',note:'固定规则，不能通过规则调整修改。'},
  {key:'expiry',label:'监听期限',value:'首次会话创建后最长72小时，运单结束提前停止',note:'固定规则，不发送车机提醒。'}];
 return [
  {key:'origin',label:'起始地围栏监听',value:switchText(c.fenceTargets.includes('origin')),note:'采集进入和离开起始地的事件。'},
  {key:'destination',label:'目的地围栏监听',value:switchText(c.fenceTargets.includes('destination')),note:'采集进入和离开目的地的事件。'},
  ...(['loading','in_transit','arrived','completed'] as const).map((state,i)=>({key:state,label:`自动更新为${stateNames[state]}`,value:switchText(c.statusUpdates.includes(state)),note:['进入起始地时更新。','离开起始地时更新。','进入目的地时更新。','离开目的地时更新。'][i]}))];
}
