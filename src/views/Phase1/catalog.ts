import type { P1SkillId } from '@/views/AgentWork/interface';
export const phaseSkills: {id:P1SkillId;name:string;description:string;icon:'truck'|'alert'|'route'|'locate'|'alarmClock'}[] = [
 {id:'p1-status',name:'运单状态自动更新',description:'读取起终点进出围栏事实，按勾选项更新状态。',icon:'locate'},
 {id:'p1-parking',name:'超时停车监听',description:'在途停车达到阈值，直接生成异常并按间隔提醒。',icon:'truck'},
 {id:'p1-offline',name:'在途离线监听',description:'记录供应商离线告警、持续提醒与恢复。',icon:'alert'},
 {id:'p1-deviation',name:'线路偏离监听',description:'根据容许偏离距离监控线路偏离及恢复。',icon:'route'},
 {id:'p1-weather',name:'恶劣天气预警监听',description:'订阅天气预警，次日0点预计生效；有效天气消息直接生成异常，不发送车机提醒。',icon:'alert'},
 {id:'p1-late',name:'晚发晚到监听',description:'按预计出发/到达时间与容许延迟检查事实里程碑。',icon:'alarmClock'},
];
export const stateNames={pending:'待发车',loading:'装货中',in_transit:'在途',arrived:'已到达',completed:'已完成'};
export const eventNames={fence:'进出围栏',parking:'超时停车',offline:'在途离线',deviation:'线路偏离',weather:'恶劣天气预警'};
export const sessionNames={subscribing:'订阅中',active:'监听中',paused:'已暂停',stopped:'已结束',cleanup_pending:'退订待重试'};
export const dateText=(value:number|undefined|null)=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(value):'未发生';
export const parseLocal=(value:string)=>Date.parse(value.replace(' ','T')+(value.endsWith('Z')||value.includes('+')?'':'+08:00'));

export const nextWeatherMidnight=(at:number)=> (Math.floor((at+8*3600000)/86400000)+1)*86400000-8*3600000;
