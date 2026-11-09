import fs from 'node:fs/promises';
import https from 'node:https';
import {createHmac} from 'node:crypto';
const credential=JSON.parse(await fs.readFile('C:/Users/admin/.codex/company-openapi.credentials.json','utf8'));
const end=new Date();end.setUTCHours(0,0,0,0);
const localNow=new Date(Date.now()+8*3600000);const yesterday=new Date(Date.UTC(localNow.getUTCFullYear(),localNow.getUTCMonth(),localNow.getUTCDate()-1)).toISOString().slice(0,10);
const query={plateNo:'鄂AZF133',plateColor:'1',startTime:yesterday+' 00:00:00',endTime:yesterday+' 23:59:59'};
const params={token:credential.token,cid:credential.client_id,...query};
const signature=createHmac('sha1',credential.srt).update(Object.entries(params).map(([k,v])=>k+v).sort().join('')).digest('hex').toUpperCase();
const body=new URLSearchParams({...params,sign:signature}).toString();
const response=await new Promise((resolve,reject)=>{
 const req=https.request({hostname:'zhiyunopenapi.95155.com',path:'/save/apis/upDownHighway',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}},res=>{
  let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{let data;try{data=JSON.parse(text);}catch{data={nonJson:true,preview:text.slice(0,200)}}resolve({httpStatus:res.statusCode,response:data});});
 });req.setTimeout(25000,()=>req.destroy(new Error('timeout')));req.on('error',()=>reject(Error('连接失败或超时')));req.end(body);
});
const stamp=new Date(Date.now()+8*3600000).toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
const file='.local/upDownHighway_'+stamp+'.json';
await fs.mkdir('.local',{recursive:true});
await fs.writeFile(file,JSON.stringify({queriedAt:new Date().toISOString(),endpoint:'/save/apis/upDownHighway',parameters:query,parameterSource:'历史上下高速需求版；尚未确认适用于此公网接口',...response},null,2),{flag:'wx'});
const r=response.response;
console.log(JSON.stringify({file,parameters:query,httpStatus:response.httpStatus,status:r.status,message:r.message||r.msg,result:typeof r.result==='string'?r.result.slice(0,300):undefined,resultKeys:r.result&&typeof r.result==='object'?Object.keys(r.result):undefined,dataKeys:r.data&&typeof r.data==='object'?Object.keys(r.data):undefined,nonJson:r.nonJson}));
