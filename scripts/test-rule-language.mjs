import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({configFile:false,root,resolve:{alias:{'@':`${root}src`}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {parseRuleRequest,taskRule}=await server.ssrLoadModule('/src/views/Phase1/ruleLanguage.ts');
 const {defaultP1Config}=await server.ssrLoadModule('/src/pinia/phase1.ts');
 const before=JSON.stringify(defaultP1Config);
 let p=parseRuleRequest('停车超过45分钟提醒，每20分钟重复提醒',defaultP1Config,'p1-parking');
 assert.equal(p.config.parking.thresholdMinutes,45);assert.equal(p.config.parking.repeatMinutes,20);assert.equal(p.unresolved.length,0);assert.equal(JSON.stringify(defaultP1Config),before);
 p=parseRuleRequest('离线超过1小时，每15分钟提醒',defaultP1Config);assert.equal(p.config.offline.thresholdMinutes,60);assert.equal(p.config.offline.repeatMinutes,15);
 p=parseRuleRequest('线路偏离超过2公里，每20分钟提醒',defaultP1Config);assert.equal(p.config.deviation.radiusMeters,2000);assert.equal(p.config.deviation.repeatMinutes,20);
 p=parseRuleRequest('晚发允许30分钟晚到允许60分钟',defaultP1Config);assert.equal(p.config.lateDeparture.graceMinutes,30);assert.equal(p.config.lateArrival.graceMinutes,60);
 p=parseRuleRequest('关闭天气监听',defaultP1Config);assert.equal(p.config.weather.enabled,false);
 p=parseRuleRequest('项目名称：回归演示；开启天气监听；停车45分钟',defaultP1Config);assert.equal(p.name,'回归演示');assert(p.config.weather.enabled);assert(p.config.selectedSkills.includes('p1-weather'));assert.equal(p.config.parking.thresholdMinutes,45);
 for(const input of ['停车-5分钟','停车0分钟','监控必经点','随便弄一下'])assert(parseRuleRequest(input,defaultP1Config).unresolved.length,input);
 assert(parseRuleRequest('离线45分钟',defaultP1Config,'p1-parking').unresolved.length);
 p=parseRuleRequest('关闭起始地围栏；不更新已完成',defaultP1Config,'p1-status');assert(!p.config.fenceTargets.includes('origin'));assert(!p.config.statusUpdates.includes('completed'));assert.match(taskRule(p.config,'p1-status'),/目的地/);
 const paused=JSON.parse(JSON.stringify(defaultP1Config));paused.parking.enabled=false;
 p=parseRuleRequest('重复提醒间隔改为20分钟',paused,'p1-parking');
 assert.equal(p.config.parking.enabled,false);assert.equal(p.config.parking.thresholdMinutes,paused.parking.thresholdMinutes);assert.equal(p.config.parking.repeatMinutes,20);assert.deepEqual(p.config.offline,paused.offline);assert.deepEqual(p.config.selectedSkills,paused.selectedSkills);
 p=parseRuleRequest('晚发容许时间改为45分钟',defaultP1Config,'p1-late');assert.equal(p.config.lateDeparture.graceMinutes,45);assert.deepEqual(p.config.lateArrival,defaultP1Config.lateArrival);
 const {taskParameters}=await server.ssrLoadModule('/src/views/Phase1/ruleLanguage.ts');assert.equal(taskParameters(paused,'p1-parking').length,4);assert.equal(taskParameters(paused,'p1-status').length,6);assert.equal(taskParameters(paused,'p1-late').length,4);
 console.log('PASS: proposed changes, no base mutation, threshold/reminder separation, units, multiple late limits, weather selection, project name, unsupported/invalid input, scoped editing and fence/state selection');
}finally{await server.close();}
