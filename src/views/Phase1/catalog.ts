import type { P1SkillId } from '@/views/AgentWork/interface';
export const phaseSkills: {id:P1SkillId;name:string;description:string;icon:'truck'|'alert'|'route'|'locate'|'alarmClock'}[] = [
 {id:'p1-status',name:'运单状态自动更新',description:'自动记录运单的运输进展。',icon:'locate'},
 {id:'p1-parking',name:'超时停车监听',description:'及时发现运输途中长时间停车。',icon:'truck'},
 {id:'p1-offline',name:'在途离线监听',description:'及时发现车辆在途失联。',icon:'alert'},
 {id:'p1-deviation',name:'线路偏离监听',description:'及时发现车辆偏离计划线路。',icon:'route'},
 {id:'p1-weather',name:'恶劣天气预警监听',description:'提醒运输途中可能遇到的恶劣天气。',icon:'alert'},
 {id:'p1-late',name:'晚发晚到监听',description:'检查晚发、晚到及起始地、目的地经过记录。',icon:'alarmClock'},
];
export const stateNames={pending:'待发车',loading:'装货中',in_transit:'在途',arrived:'已到达',completed:'已完成'};
export const eventNames={fence:'进出围栏',parking:'超时停车',offline:'在途离线',deviation:'线路偏离',weather:'恶劣天气预警'};
export const sessionNames={subscribing:'订阅中',active:'监听中',paused:'已暂停',stopped:'已结束',cleanup_pending:'退订待重试'};
export const dateText=(value:number|undefined|null)=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(value):'未发生';
export const parseLocal=(value:string)=>Date.parse(value.replace(' ','T')+(value.endsWith('Z')||value.includes('+')?'':'+08:00'));

export const nextWeatherMidnight=(at:number)=> (Math.floor((at+8*3600000)/86400000)+1)*86400000-8*3600000;
