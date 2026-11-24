
import { generateSensitiveAreas, isUnnamedArea } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/mockData';
import { getWaybillDataset } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/waybillMock';
const areas = generateSensitiveAreas(300);
const ds = getWaybillDataset(areas);
const byId = new Map(areas.map(a=>[a.id,a]));
// 找无名且被命中的点位
const hitIds = new Set<string>();
ds.waybills.forEach(w=>w.hits.forEach(h=>hitIds.add(h.areaId)));
const un = areas.filter(a=>isUnnamedArea(a) && hitIds.has(a.id));
console.log('无名且被命中的点位数:', un.length);
un.slice(0,3).forEach(a=>{
  const n = ds.waybills.filter(w=>w.hits.some(h=>h.areaId===a.id)).length;
  console.log(' ', a.id, 'lat='+a.lat.toFixed(6), 'lng='+a.lng.toFixed(6), 'radius='+a.radiusM, 'source='+a.source, '命中单数='+n);
  console.log('     地址:', a.address);
});
// 一个有名且被命中的，用于对照
const named = areas.find(a=>!isUnnamedArea(a) && hitIds.has(a.id))!;
console.log('对照(有名):', named.id, named.name, 'lat='+named.lat.toFixed(6), 'lng='+named.lng.toFixed(6));
// 一个远离所有点位的坐标，用于验证搜不到
console.log('空白坐标样例: 30.000000, 100.000000');
let nearest = 1e9;
areas.forEach(a=>{ const d=Math.hypot((a.lat-30)*111000,(a.lng-100)*111000*Math.cos(30*Math.PI/180)); if(d<nearest) nearest=d; });
console.log('  距最近点位约', Math.round(nearest/1000), 'km（应远大于任何半径 → 搜出 0 条）');
