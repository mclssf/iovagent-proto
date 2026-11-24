
import { generateSensitiveAreas, areaDisplayName, isUnnamedArea } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/mockData';
const a = generateSensitiveAreas(300);
console.log('总数/人工/AI:', a.length, a.filter(x=>x.source==='manual').length, a.filter(x=>x.source==='ai').length);
console.log('风险分布:', ['high','mid','low'].map(k=>k+':'+a.filter(x=>x.riskLevel===k).length).join(' '));
const un = a.filter(isUnnamedArea);
console.log('无名点位:', un.length, '占比', (un.length/a.length*100).toFixed(1)+'%');
console.log('  其中人工/AI:', un.filter(x=>x.source==='manual').length, '/', un.filter(x=>x.source==='ai').length);
console.log('  无名但地址也为空的:', un.filter(x=>!x.address.trim()).length, '(必须0，否则标题空白)');
console.log('回退样例:');
un.slice(0,4).forEach(x=>console.log('   ', x.id, JSON.stringify(x.name), '→', areaDisplayName(x).slice(0,34)));
console.log('有名点位不受影响:', a.filter(x=>!isUnnamedArea(x)).every(x=>areaDisplayName(x)===x.name));
const c0 = a[0]; console.log('首条坐标未漂移:', c0.id, c0.lat.toFixed(4), c0.lng.toFixed(4));
