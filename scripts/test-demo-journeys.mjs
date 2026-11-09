import fs from 'node:fs/promises';
import ts from 'typescript';
import assert from 'node:assert/strict';
const text=await fs.readFile('src/views/AgentWork/demoJourneys.ts','utf8');
const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
const {createDemoJourneys,journeyStops,demoOrderSamples,distanceKm,demoTimeFields,evaluateDemoTimes}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const raw=JSON.parse(await fs.readFile('src/views/AgentWork/customerOrders.json','utf8'));
const orders=raw.map(o=>({...o,stops:[{id:o.dispatchId+':load:'+o.customerRecord.fields['发货地址'],kind:'装货',name:'提货点'}, {id:o.dispatchId+':unload:'+o.customerRecord.fields['收货地址'],kind:'卸货',name:'送货点'}]}));
const evidence=JSON.parse(await fs.readFile('.local/waybill-risk.json','utf8'));
const serialized=JSON.stringify(orders);
const demo=createDemoJourneys(orders,evidence);assert.equal(demo.length,20);assert.equal(JSON.stringify(orders),serialized);
for(const order of demo){assert.ok(Date.parse(order.demoTrip.endTime)>Date.parse(order.demoTrip.startTime));assert.notEqual(order.startTime,order.demoTrip.originalStartTime);assert.ok(order.demoGps.length>=2);assert.equal(order.demoGps[0].timestamp,order.demoTrip.startTime);assert.equal(order.demoGps.at(-1).timestamp,order.demoTrip.endTime);assert.deepEqual(order.demoGps[0].coordinate,order.stops.find(s=>s.kind==='装货').coordinate);assert.deepEqual(order.demoGps.at(-1).coordinate,order.stops.find(s=>s.kind==='卸货').coordinate);for(let i=1;i<order.demoGps.length;i++){assert.ok(Date.parse(order.demoGps[i].timestamp)>=Date.parse(order.demoGps[i-1].timestamp));assert.ok(distanceKm(order.demoGps[i-1].coordinate,order.demoGps[i].coordinate)<=2.001);}assert.deepEqual(order.customerRecord,orders.find(o=>o.id===order.id).customerRecord);}
for(const id of new Set(demo.map(o=>o.dispatchId))){const group=demo.filter(o=>o.dispatchId===id);if(group.length<2)continue;const shortest=[...group].sort((a,b)=>a.demoGps.length-b.demoGps.length)[0];for(const order of group){assert.deepEqual(order.demoGps.slice(0,shortest.demoGps.length),shortest.demoGps);}}
console.log(JSON.stringify({orders:demo.length,dispatches:new Set(demo.map(o=>o.dispatchId)).size,gpsPoints:demo.reduce((n,o)=>n+o.demoGps.length,0),checks:'timestamps, exact endpoints, shared vehicle samples, no gaps, unchanged originals passed'}));

const risks={};
for(const o of demo){
 for(const field of demoTimeFields)assert.ok(Number.isFinite(Date.parse(o.demoTimes[field].replace(' ','T')+'+08:00')));
 const parse=field=>Date.parse(o.demoTimes[field].replace(' ','T')+'+08:00');
 assert.ok(parse('签到时间')<=parse('发车时间')&&parse('发车时间')<=parse('到货确认时间')&&parse('到货确认时间')<=parse('签收时间')&&parse('签收时间')<=parse('最近上报时间'));
 assert.equal(evaluateDemoTimes(o.demoTimes).risk,o.risk);risks[o.risk]=(risks[o.risk]||0)+1;
}
assert.ok(risks['无风险']&&risks['低风险']&&risks['高风险']);
const stamp=minutes=>new Date(Date.parse('2026-10-27T10:00:00+08:00')+minutes*60000+8*3600000).toISOString().slice(0,19).replace('T',' ');
for(const [minutes,risk] of [[-1,'无风险'],[0,'无风险'],[1,'低风险'],[60,'低风险'],[61,'高风险']]){
 const t={'计划发车时间':stamp(0),'发车时间':stamp(minutes),'预约送货时间':stamp(600),'到货确认时间':stamp(600)};
 assert.equal(evaluateDemoTimes(t).risk,risk);
 const a={'计划发车时间':stamp(0),'发车时间':stamp(0),'预约送货时间':stamp(600),'到货确认时间':stamp(600+minutes)};
 assert.equal(evaluateDemoTimes(a).risk,risk);
}
assert.equal(evaluateDemoTimes({'计划发车时间':stamp(600),'预约送货时间':stamp(0)}).risk,'待核实');
console.log(JSON.stringify({completeTimeFields:demoTimeFields.length,risks,thresholdChecks:'early/on-time/1/60/61-minute and invalid schedule passed'}));
