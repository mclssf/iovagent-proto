
import { generateSensitiveAreas } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/mockData';
const areas = generateSensitiveAreas(300);
const ai = areas.filter(a => a.source === 'ai');
const wc = ai.map(a => a.discovery.waybillCount).sort((x,y)=>x-y);
const vc = ai.map(a => a.discovery.vehicleCount).sort((x,y)=>x-y);
const q = (arr,p) => arr[Math.floor((arr.length-1)*p)];
console.log('AI点位数:', ai.length);
console.log('waybillCount 分位: p25',q(wc,.25),'p50',q(wc,.5),'p60',q(wc,.6),'p75',q(wc,.75),'p90',q(wc,.9),'max',wc[wc.length-1]);
console.log('vehicleCount 分位: p25',q(vc,.25),'p50',q(vc,.5),'p75',q(vc,.75),'p90',q(vc,.9),'max',vc[vc.length-1]);
// 试几组阈值的分布
for (const [hi,mid] of [[80,40],[90,45],[70,35],[100,50]]) {
  const h=ai.filter(a=>a.discovery.waybillCount>=hi).length;
  const m=ai.filter(a=>a.discovery.waybillCount>=mid && a.discovery.waybillCount<hi).length;
  console.log(`阈值 高>=${hi} 中>=${mid}: 高${h} 中${m} 低${ai.length-h-m}  (${(h/ai.length*100).toFixed(0)}/${(m/ai.length*100).toFixed(0)}/${((ai.length-h-m)/ai.length*100).toFixed(0)}%)`);
}
console.log('\n人工发现点位的 discovery.waybillCount 样例:', areas.filter(a=>a.source==='manual').slice(0,3).map(a=>a.discovery.waybillCount));
console.log('areaType 分布:', JSON.stringify(areas.reduce((m,a)=>{m[a.areaType]=(m[a.areaType]||0)+1;return m;},{})));
