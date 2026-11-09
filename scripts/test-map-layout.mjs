import { chromium } from 'file:///C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1500,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname!=='127.0.0.1'){await route.abort();return;}
  if(url.pathname==='/api/company-openapi/risk-check') {
   if(request.method()==='GET'){await route.fulfill({json:[{orderId:'T261027175444841538',plate:'豫GG5372',checkedAt:new Date().toISOString(),risk:'高风险',summary:'测试历史核验',items:[{name:'轨迹漂移',status:'异常',risk:'高风险',evidence:'测试轨迹漂移线索',rule:'测试历史规则'}],origin:null,destination:null,color:'2'}]});return;}
   const input=request.postDataJSON();await route.fulfill({json:{orderId:input.orderId,plate:'',checkedAt:new Date().toISOString(),risk:'低风险',summary:'测试核验',items:[],origin:input.origin||null,destination:input.destination||null,color:'2'}});return;
  }
  if(url.pathname==='/api/company-openapi/telemetry' && request.method()==='POST'){
   const input=request.postDataJSON();await route.fulfill({json:{...input,queriedAt:new Date().toISOString(),coordinateSystem:'WGS84',location:{coordinate:[114.3,30.5],timestamp:new Date().toISOString(),address:'测试位置',speed:20,direction:90},track:[{coordinate:[114.2,30.4],timestamp:input.start,speed:20},{coordinate:[114.3,30.5],timestamp:new Date(Date.parse(input.start)+60000).toISOString(),speed:20}],locationError:'',trackError:''}});return;
  }
  await route.continue();
 });
 await page.addInitScript(()=>{
  const data={maps:[],geocoded:0};window.__mapTest=data;
  class Point{constructor(lng,lat){this.lng=lng;this.lat=lat;}getLng(){return this.lng;}getLat(){return this.lat;}toArray(){return [this.lng,this.lat];}}
  class Overlay{constructor(options){this.options=options;}setOptions(options){Object.assign(this.options,options);}on(){}setLabel(label){this.label=label;}hide(){this.hidden=true;}show(){this.hidden=false;}}
  class MapMock{constructor(){this.overlays=[];this.fits=[];data.maps.push(this);}add(value){this.overlays.push(value);}addControl(){}destroy(){}setFitView(){this.fits.push(this.overlays.length);}}
  const amap={Driving:class {search(start,end,options,callback){callback('complete',{routes:[{distance:100000,time:7200,steps:[{path:[new Point(...start),new Point((start[0]+end[0])/2,(start[1]+end[1])/2),new Point(...end)]}]}]});}},Map:MapMock,Polyline:Overlay,Marker:Overlay,Pixel:class{},ToolBar:class{},InfoWindow:class{open(){}},Geocoder:class{getLocation(address,callback){data.geocoded++;callback('complete',{geocodes:[{location:new Point(114+data.geocoded,30+data.geocoded)}]});}},convertFrom(points,type,callback){callback('complete',{info:'ok',locations:points.map(p=>new Point(...p))});},plugin(plugins,callback){callback();}};
  window.AMap=amap;window.AMapLoader={load:async()=>amap};
 });
 await page.goto('http://127.0.0.1:5808/index/detail?dispatch=TP2610282125117677');
 await page.waitForFunction(()=>window.__mapTest.maps.at(-1)?.overlays.filter(o=>o.label).length===3 && window.__mapTest.maps.at(-1)?.overlays.filter(o=>o.options.path).length===4,{timeout:15000});
 const result=await page.evaluate(()=>{
  const map=window.__mapTest.maps.at(-1);
  const body=document.body.innerText;
  return {labels:map.overlays.filter(o=>o.label).length,lastFit:map.fits.at(-1),overlays:map.overlays.length,colors:[...new Set(map.overlays.filter(o=>o.options.path&&o.options.strokeColor!=='#64748b').map(o=>o.options.strokeColor))],openapi:/openapi/i.test(body),hasFullAddress:body.includes('提货地址：'),legend:body.includes('绿色为无风险/低风险')};
 });
 assert.equal(await page.getByText('关联车辆最新上报',{exact:false}).count(),0);assert.equal(await page.getByText('计划线路',{exact:false}).count(),0);assert.equal(await page.evaluate(()=>window.__mapTest.maps.at(-1).overlays.filter(o=>o.options.strokeStyle==='dashed').length),0);assert.equal(result.labels,3);assert.equal(result.lastFit,result.overlays);assert.equal(result.colors.length,4);assert.equal(result.openapi,false);assert.equal(result.legend,true);assert.deepEqual(errors,[]);
 const legends=page.getByRole('group',{name:'运单线路图例'}).getByRole('button');await legends.nth(1).click();
 assert.equal(await page.getByRole('button',{name:'聚焦实际轨迹',exact:true}).count(),0);
 const selected=await page.evaluate(()=>({lines:window.__mapTest.maps.at(-1).overlays.filter(o=>o.options.path&&o.options.strokeOpacity===0.95).length,hiddenStops:window.__mapTest.maps.at(-1).overlays.filter(o=>o.label&&o.hidden).length}));assert.equal(selected.lines,1);assert.equal(selected.hiddenStops,1);
 assert.ok((await page.locator('body').innerText()).includes('完整轨迹演示'));console.log(JSON.stringify({result,selectionPassed:true,pageErrors:errors.length}));
 const timing=page.getByRole('group',{name:'T261027175444841538-时效监控',exact:true});
 assert.equal(await timing.getByText('延误120分钟',{exact:true}).count(),1);
 assert.equal(await timing.getByText('延误45分钟',{exact:true}).count(),1);assert.equal(await timing.getByText('超时停车',{exact:true}).count(),1);assert.equal(await timing.getByText('线路偏移',{exact:true}).count(),1);assert.equal(await timing.getByText('轨迹漂移',{exact:true}).count(),0);assert.equal(await timing.getByText('待核实',{exact:true}).count(),4);
 const originalEvidence=page.getByText('测试轨迹漂移线索',{exact:true});
 assert.equal(await originalEvidence.isVisible(),false);
 const history=page.locator('[data-waybill-id="T261027175444841538"]').getByText('客户原始核验（查看历史结果）',{exact:true});
 assert.ok((await timing.boundingBox()).y<(await history.boundingBox()).y);
 await history.click();assert.equal(await originalEvidence.isVisible(),true);await history.click();
 console.log('Four operational checks prioritized; GPS drift details collapsed and available on demand');
 const quick=page.getByRole('group',{name:'运单快速定位',exact:true});
 const quickButton=quick.getByRole('button',{name:'定位运单 T261027175443672939',exact:true});
 await quickButton.click();
 assert.equal(await quickButton.getAttribute('aria-pressed'),'true');
 assert.equal(await legends.nth(2).getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>{const target=document.querySelector('[data-waybill-id="T261027175443672939"]');return target&&Math.abs(target.getBoundingClientRect().top-target.parentElement.getBoundingClientRect().top-12)<5;});
 assert.equal(await quick.isVisible(),true);
 await quick.getByRole('button',{name:'全部运单',exact:true}).click();
 assert.equal(await quick.getByRole('button',{name:'全部运单',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>window.__mapTest.maps.at(-1).overlays.filter(o=>o.label&&o.hidden).length),0);
 console.log('Quick selector: map legend, detail scrolling, pinned toolbar and reset passed');
 const orderId='T261027175443305963';
 await page.getByRole('button',{name:'调整计划时间',exact:true}).nth(1).click();
 const planned=page.getByLabel(orderId+'-计划发车时间',{exact:true});
 await planned.fill('2026-10-27T06:00');await planned.dispatchEvent('change');
 const legend=page.getByRole('group',{name:'运单线路图例'}).getByRole('button').filter({hasText:orderId});
 await page.waitForFunction(id=>[...document.querySelectorAll('[aria-label="运单线路图例"] button')].some(b=>b.textContent.includes(id)&&b.textContent.includes('高风险')),orderId);
 assert.ok((await page.locator('body').innerText()).includes('晚发180分钟'));
 console.log('Editing planned departure recalculates high risk and explanation');
 await page.goto('http://127.0.0.1:5808/index/orders');
 await page.waitForTimeout(500);
 assert.equal(/openapi/i.test(await page.locator('body').innerText()),false);
 assert.equal(await page.getByRole('button',{name:'更新定位/轨迹',exact:true}).count(),0); assert.equal(await page.getByLabel('轨迹查询范围').count(),0); assert.equal(await page.getByLabel('查询车牌颜色').count(),0); console.log('List wording and removed toolbar checks passed');
}finally{await browser.close();}
