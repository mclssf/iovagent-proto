import {createPinia} from 'pinia';
import {usePhase1,clone,defaultP1Config} from '@/pinia/phase1';
import {agentWorkData} from '@/pinia/agentWork';
import {phaseSkills} from './catalog';
// 独立模拟容器运行历史时钟，不推进现有项目、运单的演示时间。
export function loadHourlyDemo(s:ReturnType<typeof usePhase1>,work:ReturnType<typeof agentWorkData>){
 const name='小时统计演示';let p=work.projects.find(p=>p.name===name);
 const id=p?.id||work.addSkillProject(name,phaseSkills.map(t=>t.name),phaseSkills.map(t=>t.id));
 p=work.projects.find(p=>p.id===id)!;
 const demo=usePhase1(createPinia());const end=Math.floor(s.now/3600000)*3600000;const start=end-4*3600000;
 demo.now=start;demo.sequence=s.sequence;demo.ready=true;const cfg=clone(defaultP1Config);cfg.selectedSkills=phaseSkills.map(t=>t.id);cfg.weather.enabled=true;cfg.assessments.parking.enabled=true;demo.configs[id]=cfg;
 const origin={name:'上海嘉定工厂',lat:31.374,lon:121.265,radiusMeters:5000,regionCode:'310114'},destination={name:'南京江宁仓',lat:31.95,lon:118.84,radiusMeters:5000,regionCode:'320115'};
 for(let n=1;n<=2;n++)demo.createOrder({id:`HOUR-WB00${n}`,projectId:id,plate:`沪B8800${n}`,plateColor:2,driver:`小时演示司机${n}`,source:'小时统计模拟',origin,destination,plannedDeparture:start+3600000,plannedArrival:start+3*3600000});
 demo.advance(10);demo.event('HOUR-WB001','fence','enter','origin');demo.advance(40);demo.event('HOUR-WB001','fence','exit','origin');
 demo.advance(30);demo.event('HOUR-WB002','fence','enter','origin');demo.event('HOUR-WB002','fence','exit','origin');demo.event('HOUR-WB001','parking');demo.event('HOUR-WB002','parking','started',undefined,{address:'沪宁高速服务区',poiEvidence:{source:'mock',pois:[{name:'沪宁高速服务区',category:'服务区',distanceMeters:30,inside:true}],normalActivityConfirmed:true,durationMatches:true,dangerousLocation:false}});demo.event('HOUR-WB002','offline');
 demo.advance(40);demo.event('HOUR-WB001','parking','recovered');demo.event('HOUR-WB001','deviation');
 demo.log(demo.orders[1]!,'p1-offline','失败','模拟事件获取超时，重试后恢复；原事件及异常保留。');
 demo.advance(40);demo.event('HOUR-WB001','fence','enter','destination');demo.event('HOUR-WB002','offline','recovered');
 demo.advance(20);demo.event('HOUR-WB001','fence','exit','destination');demo.advance(60);
 const previousIds=new Set(s.orders.filter(o=>o.projectId===id).map(o=>o.id));
 s.orders=s.orders.filter(o=>o.projectId!==id);s.events=s.events.filter(e=>e.projectId!==id);s.logs=s.logs.filter(l=>l.projectId!==id);s.anomalies=s.anomalies.filter(a=>!previousIds.has(a.orderId));
 s.configs[id]=clone(cfg);s.orders.push(...clone(demo.orders));s.events.push(...clone(demo.events));s.logs.push(...clone(demo.logs));s.anomalies.push(...clone(demo.anomalies));s.sequence=demo.sequence;
 work.switchProject(p);return id;
}
