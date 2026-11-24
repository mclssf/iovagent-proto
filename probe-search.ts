/* 检索层断言：单车 / 运单号 / 司机名（一次性探针） */
import { generateSensitiveAreas } from './src/views/AgentWork/views/knowledgeBase/mockData';
import { getWaybillDataset } from './src/views/AgentWork/views/knowledgeBase/waybillMock';
import { searchWaybills, looksLikePlate, looksLikeWaybillNo } from './src/views/AgentWork/views/knowledgeBase/mapSearch';

let pass = 0, fail = 0;
function ok(c: boolean, msg: string, extra = '') {
  if (c) { pass++; console.log(`  ✓ ${msg}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${msg}${extra ? ' — ' + extra : ''}`); }
}

const ds = getWaybillDataset(generateSensitiveAreas(300));

console.log('\n=== 1. 形态判定 ===');
const plate = ds.vehicles[0]!.vehicleNo;
ok(looksLikePlate(plate), '真车牌判为车牌形态', plate);
ok(looksLikePlate(plate.slice(2)), '车牌尾号（5位）也判为车牌形态', plate.slice(2));
ok(looksLikePlate('新A'), '省简称+字母 判为车牌形态');
ok(!looksLikePlate('恒信产业园'), '点位名不误判为车牌');
ok(!looksLikePlate('广州'), '城市名不误判为车牌');
ok(looksLikeWaybillNo('YD20251101-000027'), 'YD 开头判为运单号');
ok(looksLikeWaybillNo('yd2025'), '小写 yd 也判为运单号');
ok(!looksLikeWaybillNo(plate), '车牌不误判为运单号');

console.log('\n=== 2. 单车检索（车牌）===');
const target = [...ds.byVehicle.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
const byPlate = searchWaybills(target[0], ds);
ok(byPlate.vehicles.length > 0, '按完整车牌命中车辆', `${target[0]} → ${byPlate.vehicles.length} 条车辆命中`);
ok(byPlate.vehicles[0]!.vehicleNo === target[0], '首位就是精确命中的那辆车');
ok(byPlate.vehicles[0]!.total === target[1].length, '车辆命中里的运单数与 byVehicle 索引一致', `${byPlate.vehicles[0]!.total}/${target[1].length}`);
ok(byPlate.vehicles[0]!.abnormal === target[1].filter((w) => w.abnormal).length, '异常单数与明细一致');
ok(byPlate.waybills.length > 0, '同时给出该车运单命中', `${byPlate.waybills.length} 单`);
ok(byPlate.waybills.every((h) => h.waybill.vehicleNo === target[0]), '运单命中全部属于该车');

console.log('\n=== 3. 车牌片段检索 ===');
const frag = plate.slice(0, 3);
const byFrag = searchWaybills(frag, ds);
ok(byFrag.vehicles.every((v) => v.vehicleNo.toUpperCase().includes(frag.toUpperCase())), `片段「${frag}」命中的车牌都包含该片段`, `${byFrag.vehicles.length} 辆`);
ok(byFrag.vehicles.length <= 6, '车辆命中受 limit=6 约束', `${byFrag.vehicles.length}`);
ok(byFrag.waybills.length <= 6, '运单命中受 limit=6 约束', `${byFrag.waybills.length}`);

console.log('\n=== 4. 运单号检索 ===');
const wb = ds.waybills[0]!;
const byNo = searchWaybills(wb.waybillNo, ds);
ok(byNo.waybills.length > 0 && byNo.waybills[0]!.waybill.waybillNo === wb.waybillNo, '完整运单号首位精确命中', wb.waybillNo);
ok(looksLikeWaybillNo(wb.waybillNo), '该输入被识别为运单号形态（UI 会把运单组排前）');
const byNoFrag = searchWaybills(wb.waybillNo.slice(0, 12), ds);
ok(byNoFrag.waybills.every((h) => h.waybill.waybillNo.startsWith(wb.waybillNo.slice(0, 12))), '运单号前缀检索全部前缀匹配', `${byNoFrag.waybills.length} 单`);
ok(searchWaybills('YD99999999-999999', ds).waybills.length === 0, '不存在的运单号零结果');

console.log('\n=== 5. 司机姓名检索 ===');
const driver = ds.waybills[0]!.driverName;
const byDriver = searchWaybills(driver, ds);
ok(byDriver.vehicles.length + byDriver.waybills.length > 0, `按司机「${driver}」有命中`, `车 ${byDriver.vehicles.length} / 单 ${byDriver.waybills.length}`);
ok(byDriver.waybills.every((h) => h.waybill.driverName === driver), '运单命中全部属于该司机');

console.log('\n=== 6. 边界 ===');
ok(searchWaybills('', ds).vehicles.length === 0 && searchWaybills('', ds).waybills.length === 0, '空查询零结果（不返回全量）');
ok(searchWaybills('   ', ds).vehicles.length === 0, '纯空格零结果');
ok(searchWaybills('zzzz不存在zzzz', ds).vehicles.length === 0, '无关字符串零结果');
const withSpace = searchWaybills(`  ${plate}  `, ds);
ok(withSpace.vehicles.length > 0 && withSpace.vehicles[0]!.vehicleNo === plate, '车牌检索容忍首尾空格');
const lower = searchWaybills(plate.toLowerCase(), ds);
ok(lower.vehicles.length > 0 && lower.vehicles[0]!.vehicleNo === plate, '车牌检索容忍小写');

console.log('\n=== 7. 排序：精确前缀优先 ===');
const mixed = searchWaybills(plate.slice(0, 2), ds);
const prefixed = mixed.vehicles.filter((v) => v.vehicleNo.startsWith(plate.slice(0, 2)));
ok(prefixed.length === mixed.vehicles.length || mixed.vehicles.slice(0, prefixed.length).every((v) => v.vehicleNo.startsWith(plate.slice(0, 2))),
  '前缀精确匹配的车辆排在前面', `${mixed.vehicles.map((v) => v.vehicleNo).join(' ')}`);

console.log(`\n========== 通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) process.exit(1);
