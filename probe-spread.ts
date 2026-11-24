
import { generateSensitiveAreas } from './src/views/AgentWork/views/knowledgeBase/mockData';
import { getAggLines } from './src/views/AgentWork/views/knowledgeBase/mockData';
const a = generateSensitiveAreas(300);
const lng = a.map(x=>x.lng), lat = a.map(x=>x.lat);
console.log('点位数:', a.length);
console.log('人工/AI:', a.filter(x=>x.source==='manual').length, '/', a.filter(x=>x.source==='ai').length);
console.log('经度范围:', Math.min(...lng).toFixed(2), '~', Math.max(...lng).toFixed(2), ' 跨度', (Math.max(...lng)-Math.min(...lng)).toFixed(1));
console.log('纬度范围:', Math.min(...lat).toFixed(2), '~', Math.max(...lat).toFixed(2), ' 跨度', (Math.max(...lat)-Math.min(...lat)).toFixed(1));
const bands = {'73-90(新疆西藏)':0,'90-105(西北)':0,'105-115(中部)':0,'115-125(华东)':0,'125+(东北)':0};
lng.forEach(v=>{ if(v<90)bands['73-90(新疆西藏)']++; else if(v<105)bands['90-105(西北)']++; else if(v<115)bands['105-115(中部)']++; else if(v<125)bands['115-125(华东)']++; else bands['125+(东北)']++; });
console.log('经度分带:', JSON.stringify(bands));
const cities = new Set(a.map(x=>x.region.split(' · ')[0]));
console.log('覆盖城市数:', cities.size);
console.log('含西北/边疆城市:', ['乌鲁木齐','喀什','拉萨','西宁','酒泉','玉门','鄂尔多斯','库尔勒'].filter(c=>cities.has(c)).join(' ') || '无');
// 线路端点必须完全没变（保护烘焙路网）
const L = getAggLines('city');
console.log('\n市到市线路数:', L.length, '| 前3条:', L.slice(0,3).map(l=>l.from+'→'+l.to).join(', '));
console.log('city-013:', L.find(l=>l.id==='city-013')?.from, '→', L.find(l=>l.id==='city-013')?.to);
