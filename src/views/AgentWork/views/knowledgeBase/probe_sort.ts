
import { generateSensitiveAreas } from './src/views/AgentWork/views/knowledgeBase/mockData';
const a=generateSensitiveAreas(300).filter(x=>x.status!=='ignored');
console.log('  前10条 abnormal:', a.slice(0,10).map(x=>x.discovery?.waybillCount).join(', '));
const desc=[...a].sort((x,y)=>(y.discovery?.waybillCount??0)-(x.discovery?.waybillCount??0));
const same=JSON.stringify(a.map(x=>x.id))===JSON.stringify(desc.map(x=>x.id));
console.log('  当前顺序 == 异常停靠降序 ?', same);
const mono=a.every((x,i)=>i===0||(a[i-1].discovery?.waybillCount??0)>=(x.discovery?.waybillCount??0));
console.log('  当前顺序单调递减 ?', mono);
console.log('  结论：列表', same||mono?'有明确排序':'**无排序规则**（按生成器顺序，等于任意顺序）');
