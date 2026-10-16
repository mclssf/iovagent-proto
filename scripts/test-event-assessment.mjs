import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {createServer} from 'vite';import {createPinia,setActivePinia} from 'pinia';
const root=fileURLToPath(new URL('../',import.meta.url));const server=await createServer({configFile:false,root,resolve:{alias:{'@':`${root}src`}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {usePhase1,p1ConfigError}=await server.ssrLoadModule('/src/pinia/phase1.ts');const {simulateAssessment,defaultParkingFilter,effectiveFilter}=await server.ssrLoadModule('/src/views/Phase1/eventAssessment.ts');
 setActivePinia(createPinia());const s=usePhase1();const c=s.config('P001');c.assessments.parking.enabled=true;c.assessments.offline.enabled=true;assert(s.saveConfig('P001',c,c.version));const p={name:'工厂',lat:31.3,lon:121.3,radiusMeters:500,regionCode:'310114'};
 assert(s.createOrder({id:'ASSESS',projectId:'P001',plate:'沪A98221',plateColor:2,driver:'演示',source:'手动录入',origin:p,destination:{...p,name:'仓库'},plannedDeparture:s.now+60000,plannedArrival:s.now+3600000}));s.advance(10);s.progress('ASSESS','loading');s.progress('ASSESS','in_transit');
 const evidence={source:'mock',pois:[{name:'演示服务区',category:'服务区',distanceMeters:100,inside:true}],normalActivityConfirmed:true,durationMatches:true};
 assert.equal(s.event('ASSESS','parking','started',undefined,{poiEvidence:evidence}),'');let e=s.events.at(-1);assert.equal(e.assessment.verdict,'reasonable');assert(!s.anomalies.some(a=>a.kind==='超时停车'));assert.equal(e.assessment.rule,defaultParkingFilter);
 s.advance(1);s.event('ASSESS','parking','started',undefined,{poiEvidence:{...evidence,dangerousLocation:true}});assert(s.anomalies.some(a=>a.kind==='超时停车'));assert.equal(s.events.at(-1).assessment.verdict,'review');
 const event={...e,type:'offline',poiEvidence:{...evidence,signalRecovered:true,trackContinuous:true,pois:[{name:'隧道',category:'隧道',distanceMeters:100,inside:true}]}};
 assert.equal(simulateAssessment(event,c.assessments.offline).verdict,'reasonable');assert.equal(simulateAssessment({...event,poiEvidence:{...event.poiEvidence,signalRecovered:false}},c.assessments.offline).verdict,'review');
 assert.equal(simulateAssessment({...event,poiEvidence:evidence},c.assessments.offline).verdict,'review');assert.equal(simulateAssessment(e,{...c.assessments.parking,radiusMeters:50}).verdict,'review');
 assert.equal(simulateAssessment(e,{...c.assessments.parking,filterRule:'仅过滤客户认可的地点'}).verdict,'review');assert.equal(effectiveFilter({...c.assessments.parking,filterRule:'   '},'parking'),defaultParkingFilter);
 const invalid=s.config('P001');invalid.assessments.parking.radiusMeters=0;assert(p1ConfigError(invalid));
 console.log('PASS: default empty/whitespace rules, disabled compatibility, reasonable events retained/no anomaly, dangerous and nearby-only cases, radius, offline recovered/continuous evidence, custom rule review, config validation and task results');
}finally{await server.close();}
