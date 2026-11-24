
import { generateSensitiveAreas } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/mockData';
const a = generateSensitiveAreas(300);
const long = a.filter(x=>x.evidence.length>50).slice(0,3);
long.forEach(x=>console.log(x.id, x.name, x.source, 'len='+x.evidence.length));
const short = a.find(x=>x.evidence && x.evidence.length<=50);
console.log('短备注样例:', short.id, short.name, 'len='+short.evidence.length);
