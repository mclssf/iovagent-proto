
import { generateSensitiveAreas } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/mockData';
const a = generateSensitiveAreas(300);
console.log('总数/人工/AI:', a.length, a.filter(x=>x.source==='manual').length, a.filter(x=>x.source==='ai').length);
const man = a.filter(x=>x.source==='manual');
console.log('人工点位有备注的:', man.filter(x=>x.evidence).length, '/', man.length);
console.log('AI 点位有备注的:', a.filter(x=>x.source==='ai'&&x.evidence).length, '（应 0）');
const lens = man.filter(x=>x.evidence).map(x=>x.evidence.length);
console.log('备注长度: min', Math.min(...lens), 'max', Math.max(...lens));
console.log('超过 50 字的条数:', lens.filter(l=>l>50).length, '（>0 才能验证截断）');
console.log('样例长备注:', man.find(x=>x.evidence.length>50)?.evidence);
console.log('经纬度未漂移(首个人工点):', man[0].id, man[0].lat.toFixed(4), man[0].lng.toFixed(4));
console.log('风险分布:', ['high','mid','low'].map(k=>k+':'+a.filter(x=>x.riskLevel===k).length).join(' '));
