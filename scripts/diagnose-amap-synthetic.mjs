import { chromium } from 'file:///C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5808/login',{waitUntil:'domcontentloaded'});
 await page.addScriptTag({url:'/demo/amap-config.js'});
 await page.addScriptTag({url:'https://webapi.amap.com/loader.js'});
 const result=await page.evaluate(async()=>{
   window._AMapSecurityConfig={serviceHost:location.origin+'/_AMapService'};
   await window.AMapLoader.load({key:window.__IOV_AMAP_CONFIG__.key,version:'2.0'});
   const {convertGpsBatch}=await import('/src/utils/gpsCoordinates.ts');
   let calls=0;
   const original=window.AMap.convertFrom;
   window.AMap.convertFrom=(...args)=>{calls++;return original.apply(window.AMap,args);};
   const points=Array.from({length:480},(_,i)=>[116.30123456789+i*0.001,39.90123456789]);
   const started=Date.now();
   const converted=await convertGpsBatch(window.AMap,points);
   const elapsed=Date.now()-started;
   const before=calls;
   const cached=await convertGpsBatch(window.AMap,points);
   let cancellation=false;
   try {await convertGpsBatch(window.AMap,points,()=>true);}catch{cancellation=true;}
   return {converted:converted.length,elapsedMs:elapsed,serviceCalls:calls,cacheCalls:calls-before,cached:cached.length,cancelled:cancellation,finite:converted.every(p=>p.every(Number.isFinite))};
 });
 console.log(JSON.stringify(result));
}finally{await browser.close();}
