
import { generateSensitiveAreas } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/mockData';
const a = generateSensitiveAreas(300).filter(x => x.source==='ai');
const hi = a.find(x=>x.riskLevel==='high');
console.log('AI高风险样例:', hi.id, hi.name, hi.riskLevel, hi.discovery.waybillCount, hi.areaType);
