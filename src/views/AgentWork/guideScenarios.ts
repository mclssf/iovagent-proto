import type { Order, TimelineEvent } from './interface';
import { extractRegionVisitRegion, extractTaskPlates, recordValue } from './taskInput';

export const guideProjectId = 'P-EAST-DISPATCH';
export const guideProjectName = '华东运输核查';
export const guideDate = '2026-10-22';

export const guideSkills = [
  { id: 'guide-evidence', name: '装卸货地追溯留证', icon: 'locate', description: '回溯装卸候选地点和停靠时段，批量整理轨迹截图与结果表。', recommendedPrompt: '请追溯 YD261002 的装卸货地点、停靠时间和依据；上传表格时逐票截图留证。' },
  { id: 'guide-mileage', name: '运短骗长核查', icon: 'route', description: '区分车辆全程与本票货程，对比申报里程和候选装货点。', recommendedPrompt: '核查 YD261002 的申报货程是否包含了上一票运输，列出里程差和待补凭证。' },
  { id: 'guide-signin', name: '轨迹造假分析预警', icon: 'waypoints', description: '对照签到、轨迹与门禁记录，识别跳点和到场疑点。', recommendedPrompt: '核验 YD261002 的到场签到，轨迹和门禁记录能否相互印证？' },
  { id: 'guide-offline', name: '车机离线监控提醒', icon: 'bellRing', description: '检查断流时长、最后位置及恢复状态，区分已恢复和待跟进车辆。', recommendedPrompt: '查看沪A56101的车机离线时段、恢复情况和调度提醒。' },
  { id: 'guide-stop', name: '异常停靠与偷串货预警', icon: 'alert', description: '结合货物、授权场站和实际停靠，筛选需要复核的非计划停车。', recommendedPrompt: '核查 YD261002 是否在非授权场站停靠，有哪些偷串货风险线索？' },
  { id: 'guide-shuttle', name: '同城倒短运单生成与监控', icon: 'refresh', description: '按固定装卸点配对往返趟次，生成逐趟运单并标出缺失回执。', recommendedPrompt: '按装卸围栏记录为苏E76325生成同城倒短运单，列出每趟结束状态。' },
  { id: 'guide-photo', name: '装卸图片核验', icon: 'scanText', description: '关联上传的装卸照片，检查图片可读性并整理人工核对事项。', recommendedPrompt: '请核验我上传的 YD261001 装卸照片，列出图片质量和待人工确认项。' },
  { id: 'guide-gate', name: '进场车辆核查', icon: 'shield', description: '按进场规则回溯车辆来源、历史停靠和门禁记录。', recommendedPrompt: '核查苏E53202的进场条件：来源场站是否在名单内，途中是否有非授权停靠？' },
] as const;

export type GuideId = typeof guideSkills[number]['id'];
export const findGuide = (id?: string) => guideSkills.find(skill => skill.id === id);
type Kind = 'load' | 'unload' | 'stop' | 'offline' | 'restore' | 'jump' | 'gate';
interface Site { name: string; lat: number; lon: number }
const su: Site = { name: '苏州相城物流场站', lat: 31.493, lon: 120.635 };
const kun: Site = { name: '昆山陆家配送站', lat: 31.313, lon: 120.994 };
const yard: Site = { name: '昆山东部周转场', lat: 31.36, lon: 120.995 };
const sh: Site = { name: '上海嘉定汽车城物流园', lat: 31.332, lon: 121.176 };
const north: Site = { name: '相城北仓', lat: 31.521, lon: 120.671 };
interface Point { kind: Kind; site: Site; from: string; to?: string; text: string }
const point = (kind: Kind, site: Site, from: string, text: string, to?: string): Point => ({ kind, site, from, to, text });
export interface GuideTrip { id: string; plate: string; cargo: string; origin: Site; destination: Site; points: Point[]; planKm: number; freightKm: number; declared: string; eta: string; stops: number; shuttle?: number }
const shuttleGates = [['07:10', '07:32'], ['08:20', '08:45'], ['10:05', '']] as const;
export const guideTrips: GuideTrip[] = [
  { id: 'YD261001', plate: '沪A56101', cargo: '防水卷材', origin: su, destination: sh, planKm: 86, freightKm: 86, declared: su.name, eta: '11:45', stops: 2,
    points: [point('load', su, '07:20', '装货围栏停留，发货单已登记。', '07:55'), point('unload', kun, '09:05', '第一卸点完成，已收货 8 托。', '09:30'), point('offline', kun, '09:42', '离场后定位中断，超过 15 分钟提醒阈值。'), point('restore', yard, '10:03', '重新收到连续定位。第二卸点尚无到场记录。')] },
  { id: 'YD261002', plate: '苏E53202', cargo: '袋装水泥', origin: su, destination: sh, planKm: 2230, freightKm: 82, declared: '哈尔滨发运库', eta: '12:00', stops: 1,
    points: [point('load', su, '07:40', '上一票卸货交接后，本票出现候选装货停靠。', '08:16'), point('stop', yard, '09:12', '进入非授权周转场，停靠 38 分钟，无调拨记录。', '09:50'), point('jump', sh, '09:51', '签到坐标在嘉定；前一分钟的定位仍在昆山东部，相距约 18 公里。'), point('gate', sh, '10:42', '门禁首次识别到本车，比电子签到晚 51 分钟。'), point('unload', sh, '10:46', '在收货围栏停靠，已关联签收回执。', '11:18')] },
  ...shuttleGates.map(([start, end], i): GuideTrip => ({ id: 'DT26100' + (i + 1), plate: '苏E76325', cargo: '周转托盘', origin: su, destination: north, planKm: 7, freightKm: 7, declared: su.name, eta: end || '10:35', stops: 1, shuttle: i + 1,
    points: [point('load', su, start, '车辆在相城场站完成装货出场。'), ...(end ? [point('unload', north, end, '已匹配同车下一条北仓收货记录。')] : [])] })),
];
const labels: Record<Kind, string> = { load: '装货', unload: '卸货', stop: '非计划停靠', offline: '车机离线', restore: '定位恢复', jump: '签到跳点', gate: '门禁到场' };
export const guideTimeline = (t: GuideTrip): TimelineEvent[] => t.points.map((p, i) => ({ id: i + 1, title: labels[p.kind], type: p.kind === 'stop' ? 'stop' : ['offline','jump'].includes(p.kind) ? 'risk' : 'normal', time: guideDate + ' ' + p.from + (p.to ? ' 至 ' + p.to : ''), place: p.site.name, desc: p.text }));
export const guideOrder = (t: GuideTrip): Order => ({
  id: t.id, plate: t.plate, driver: t.shuttle ? '周师傅' : t.plate.startsWith('沪') ? '陈师傅' : '徐师傅', carrier: '华东联运',
  factory: t.origin.name, route: t.origin.name + ' → ' + t.destination.name, source: '场站运输台账',
  status: t.points.at(-1)?.kind === 'unload' ? '已完成' : '在途', risk: t.points.some(p => p.kind === 'stop') ? '高风险' : '无风险',
  issue: t.points.find(p => p.kind === 'stop')?.text ?? '无未恢复异常', startTime: guideDate + ' ' + t.points[0]!.from, updated: guideDate + ' ' + (t.points.at(-1)!.to ?? t.points.at(-1)!.from), eta: guideDate + ' ' + t.eta,
});
export type GuideRow = Record<string, string>;
export function lookupGuide(row: GuideRow) {
  const id = recordValue(row, ['运单号','订单号','货单号','单号','orderNo']).toUpperCase();
  const plate = recordValue(row, ['车牌号','车牌','车辆牌照','plate']).toUpperCase();
  return guideTrips.filter(t => (id || plate) && (!id || t.id === id) && (!plate || t.plate === plate));
}
export function guideSubjects(text: string): GuideRow[] {
  const ids = [...new Set(text.toUpperCase().match(/(?:[A-Z]{1,12}[-_]?)?\d{5,}(?:[-_]\d+)?/g) ?? [])];
  const plates = extractTaskPlates(text);
  const orders = ids.filter(id => !plates.some(p => p.includes(id)));
  if (orders.length === 1 && plates.length === 1) return [{ 运单号: orders[0]!, 车牌号: plates[0]! }];
  return [...orders.map(运单号 => ({ 运单号 })), ...plates.map(车牌号 => ({ 车牌号 }))] as GuideRow[];
}

export interface Finding { conclusion: string; facts: string; action: string; point: number; columns?: GuideRow }
export function inspectTrip(skill: GuideId, t: GuideTrip, row: GuideRow = {}, prompt = ''): Finding {
  const { points } = t;
  const idx = (k: Kind) => points.findIndex(p => p.kind === k);
  const unloading = points.filter(p => p.kind === 'unload');
  const last = points.at(-1)!;
  const fact = (p: Point) => p.from + (p.to ? '–' + p.to : '') + ' ' + p.site.name + '：' + p.text;
  const finding = (conclusion: string, facts: string, action: string, i = points.length - 1, columns?: GuideRow): Finding => ({ conclusion, facts, action, point: Math.max(0, i) + 1, columns });
  switch (skill) {
    case 'guide-evidence': return finding('候选装货点：' + t.origin.name, fact(points[0]!) + '\n' + (unloading.length ? unloading.map(fact).join('\n') : '尚无卸货围栏记录。'), '用磅单或回单核对停靠区间；轨迹本身不证明交易。', 0);
    case 'guide-mileage': {
      const diff = t.planKm - t.freightKm;
      return finding(diff ? '本票货程与申报不符，需复核' : '未发现货程差异', '申报起点：' + t.declared + '，' + t.planKm + ' km；候选装货点：' + t.origin.name + '，本票约 ' + t.freightKm + ' km，差额 ' + diff + ' km。' + fact(points[0]!), '调取装货磅单、前票交接单；不据此扣款。', 0, { 申报里程_km: String(t.planKm), 本票参考里程_km: String(t.freightKm), 差额_km: String(diff) });
    }
    case 'guide-signin': return idx('jump') >= 0 ? finding('电子签到与连续轨迹不一致', fact(points[idx('jump')]!) + '\n' + fact(points[idx('gate')]!), '以门禁原始记录交叉复核，不直接判定造假。', idx('jump')) : finding('未发现已记录的跳点', fact(last), '没有独立门禁时不能据此认定到场。');
    case 'guide-offline': return idx('offline') >= 0 ? finding('离线 21 分钟，定位已恢复', fact(points[idx('offline')]!) + '\n' + fact(points[idx('restore')]!), '已达到提醒阈值；恢复后停止重复提醒，核实终端供电。', idx('offline')) : finding('无已记录的超时离线事件', fact(last), '保持原监听策略。');
    case 'guide-stop': return idx('stop') >= 0 ? finding('非计划停靠待复核', t.cargo + '；' + fact(points[idx('stop')]!), '核对调拨授权、封签与交接单，不将停靠直接认定为偷串货。', idx('stop')) : finding('未发现非授权场地停靠', fact(last), '正常卸货、途经与停车分开记录。');
    case 'guide-shuttle': return !t.shuttle ? finding('非固定线路倒短作业', fact(points[0]!), '不按倒短趟次建单。') : finding('第 ' + t.shuttle + ' 趟 · ' + (unloading.length ? '卸货已配对' : '待补卸货记录'), points.map(fact).join('\n'), unloading.length ? '按趟留存，参考路程不作为精确结算里程。' : '保留运输中状态，不补造结束时间。', points.length - 1, { 趟次: String(t.shuttle), 发车: points[0]!.from, 卸货: unloading[0]?.from || '待确认' });
    case 'guide-gate': {
      const region = extractRegionVisitRegion(prompt);
      if (region) {
        const regions = (s: Site) => s === sh ? ['上海市','嘉定区'] : s === yard || s === kun ? ['江苏省','苏州市','昆山市'] : ['江苏省','苏州市','相城区'];
        const i = points.findIndex(p => regions(p.site).includes(region) && p.kind !== 'jump');
        return finding(i >= 0 ? '有' + region + '到访记录' : '本票时段内未查到' + region + '到访记录', i >= 0 ? fact(points[i]!) : '已核对 ' + points.length + ' 个运输节点。记录以外的时段不在核查范围内。', '请结合准入规则及门禁凭证确认，不自动放行。', Math.max(0, i), { 查询地区: region, 到访记录: i >= 0 ? '有' : '未查到', 到访时间: i >= 0 ? guideDate + ' ' + points[i]!.from : '' });
      }
      return finding(idx('stop') >= 0 ? '转现场复核' : '来源场站在名单内', '来源：' + t.origin.name + '；规则：授权场站起运，途中不得进入非授权周转场。' + (idx('stop') >= 0 ? fact(points[idx('stop')]!) : '本票时段内无非授权停靠记录。'), '最终放行由现场审核确认。', Math.max(0, idx('stop')));
    }
    case 'guide-photo': return finding(row['图片检查'] || '缺少关联照片', [row['图片信息'], row['画面内容']].filter(Boolean).join('\n') || '未找到此行对应的上传图片。', row['核对事项'] || '请人工对照装卸环节、货物与交接凭证，不判断照片真伪。', 0);
  }
}
