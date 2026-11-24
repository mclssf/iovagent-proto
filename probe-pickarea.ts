
import { generateSensitiveAreas, getAggLines } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/mockData';
import { buildAreaLineIndex } from '/Users/nickyang/Documents/trae/大卡数字人/平台数据资产-V2.3.0/src/views/AgentWork/views/knowledgeBase/lineSensitiveStats';
const areas = generateSensitiveAreas(300);
const idx = buildAreaLineIndex(areas);
const cityLines = getAggLines('city');
const withRefs = areas.filter(a => (idx.get(a.id) ?? []).filter(r => r.mode==='city').length > 0);
const man = withRefs.filter(a => a.source==='manual');
console.log('有市到市线路停靠的点位:', withRefs.length, '| 其中人工发现:', man.length);
const pick = man[0];
const refs = (idx.get(pick.id) ?? []).filter(r=>r.mode==='city');
console.log('取样:', pick.id, pick.name, pick.source, '| 线路数', refs.length, '| 首条', refs[0].line.from+'→'+refs[0].line.to, 'stops', refs[0].stops);
