import type { AMapCoordinate } from '@/utils/amap';
import { extractTaskPlates, parseWaybillTimestamp, recordValue } from './taskInput';

export const evidenceDemoLimit = 50;
export const evidenceExamplePrompt = '请根据表格中已知的真实卸货地或装货地，推测并完善每条运单缺失的装卸货地点和时间，保留已知信息，逐单生成带企业水印的轨迹截图留证，并打包为 ZIP。';
export const hasWaybillEvidenceIntent = (prompt: string) => /运单|装货|卸货|运输任务|装卸/.test(prompt) && /补全|完善|还原|推测|推断|反推|补齐|核实/.test(prompt) && /截图|留证|水印|审计/.test(prompt);

export const evidenceFieldAliases = {
  运单号: ['运单号', '订单号', '货单号', '单号'],
  车牌号: ['车牌号', '车牌', '车辆号', '车辆牌照', 'plate'],
  装货地点: ['真实装货地', '装货地', '装货地点', '装货地址', '装货地POI', '装货地POI描述', '装货地详细地址', '发货地', 'loadingAddress'],
  装货时间: ['真实装货时间', '装货时间', '装货开始时间', 'loadingTime'],
  卸货地点: ['真实卸货地', '卸货地', '卸货地点', '卸货地址', '卸货地POI', '卸货地POI描述', '卸货地详细地址', '收货地', 'unloadingAddress'],
  卸货时间: ['真实卸货时间', '卸货时间', '卸货开始时间', 'unloadingTime'],
};

export function evidenceEnterpriseName() {
  if (typeof window === 'undefined') return '当前企业';
  try { return window.localStorage.getItem('iovagent_login_enterprise_name')?.trim().slice(0, 80) || '当前企业'; }
  catch { return '当前企业'; }
}

export interface EvidenceEndpoint {
  poi: string;
  coordinate?: AMapCoordinate;
  time: number | null;
}
export interface EvidenceInput {
  order: string;
  plate: string;
  loading: EvidenceEndpoint;
  unloading: EvidenceEndpoint;
  windowStart: number | null;
  gps: boolean;
}
export interface EvidenceTrip {
  order: string;
  plate: string;
  loading: Required<Omit<EvidenceEndpoint, 'time'>> & { time: number; inferred: boolean; timeInferred: boolean };
  unloading: EvidenceTrip['loading'];
  distance: number;
  duration: number;
  path: AMapCoordinate[];
  basis: string;
}

function endpoint(record: Record<string, string>, side: '装货' | '卸货'): EvidenceEndpoint {
  const english = side === '装货' ? 'loading' : 'unloading';
  const poi = recordValue(record, evidenceFieldAliases[`${side}地点`]);
  const longitude = recordValue(record, [`真实${side}地经度`, `${side}地经度`, `${side}经度`, `${english}Longitude`]);
  const latitude = recordValue(record, [`真实${side}地纬度`, `${side}地纬度`, `${side}纬度`, `${english}Latitude`]);
  const pair = recordValue(record, [`${side}地经纬度`, `${side}经纬度`]);
  const values = pair ? pair.split(/[,，\s]+/).filter(Boolean) : [longitude, latitude];
  let coordinate: AMapCoordinate | undefined;
  if (values.some(Boolean)) {
    if (values.length !== 2 || values.some(value => !value?.trim() || !Number.isFinite(Number(value))) || Math.abs(Number(values[0])) > 180 || Math.abs(Number(values[1])) > 90) throw new Error(`${side}地经纬度无效，请成对填写经度和纬度`);
    coordinate = [Number(values[0]), Number(values[1])];
  }
  const text = recordValue(record, evidenceFieldAliases[`${side}时间`]);
  const time = parseWaybillTimestamp(text);
  if (text && time === null) throw new Error(`${side}时间格式无效`);
  return { poi, coordinate, time };
}

export function parseEvidenceInput(record: Record<string, string>): EvidenceInput {
  const plate = recordValue(record, evidenceFieldAliases.车牌号).toUpperCase();
  if (extractTaskPlates(plate)[0] !== plate) throw new Error('缺少有效车牌号');
  const loading = endpoint(record, '装货');
  const unloading = endpoint(record, '卸货');
  if (!loading.poi && !loading.coordinate && !unloading.poi && !unloading.coordinate) throw new Error('至少提供一个已知装货地或卸货地（地址或经纬度）');
  const windowText = recordValue(record, ['运单开始时间', '运输任务开始时间', '任务开始时间', '开始时间', 'startTime']);
  const windowStart = parseWaybillTimestamp(windowText);
  if (windowText && windowStart === null) throw new Error('运单开始时间格式无效');
  if (windowStart === null && loading.time === null && unloading.time === null) throw new Error('请提供运单开始时间、装货时间或卸货时间，用于限定查询范围');
  if (loading.time !== null && unloading.time !== null && loading.time >= unloading.time) throw new Error('卸货时间必须晚于装货时间');
  return { plate, loading, unloading, windowStart, order: recordValue(record, evidenceFieldAliases.运单号) || '未提供运单号', gps: /wgs.?84|gps/i.test(recordValue(record, ['坐标系', '坐标类型'])) };
}

export function evidenceInputError(record: Record<string, string>) {
  try { parseEvidenceInput(record); return ''; } catch (error) { return (error as Error).message; }
}

export function evidenceTime(value: number) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(value);
}

export function hasEvidenceMapDetails(pixels: Uint8ClampedArray, width: number, height: number) {
  let details = 0;
  for (let y = Math.floor(height * .05); y < height * .9; y += 2) {
    for (let x = Math.floor(width * .05); x < width * .95; x += 2) {
      const pixel = (y * width + x) * 4;
      const r = pixels[pixel]!, g = pixels[pixel + 1]!, b = pixels[pixel + 2]!;
      if (pixels[pixel + 3]! > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 35 && (r + g + b) / 3 < 180) details++;
    }
  }
  return details >= 50;
}

export function evidenceTimes(input: EvidenceInput, travelSeconds: number, index: number) {
  const duration = (travelSeconds + (55 + index % 5 * 11) * 60) * 1000;
  const loading = input.loading.time ?? (input.unloading.time !== null ? input.unloading.time - duration : input.windowStart! + (10 + index % 5 * 5) * 60000);
  const unloading = input.unloading.time ?? loading + duration;
  if (unloading - loading < travelSeconds * 1000) throw new Error('已知时间与道路行驶耗时冲突，需核验原始时间');
  if (input.windowStart !== null && loading < input.windowStart) throw new Error('时间范围不足以还原装货，请扩大查询范围或核验已知时间');
  return { loading, unloading };
}

export function waybillEvidenceSteps(rows: number, enterprise: string) {
  return [
    { title: '理解补全与留证需求', text: `识别 ${rows} 条运输任务：以已知装货端或卸货端为锚点，补全另一端，不覆盖原始信息。` },
    { title: '解析 Excel 与校验锚点', text: '调用 Excel 解析 Skill，提取车牌、已知 POI / 经纬度及时间范围，区分用户已知值与待推断字段；缺失输入逐行记录失败原因。', tool: 'Excel 解析 Skill' },
    { title: '规划轨迹反推规则', text: '查询时间窗内的车辆轨迹，按停车时长、先后顺序、装卸场站 POI 及到离场规则筛选候选端点。', tool: '车辆轨迹查询 / 装卸货还原' },
    { title: '逐单补全地点与时间', text: '保留用户提供的锚点，补全缺失端点与装卸时间；校验装货早于卸货、运输时长与道路距离相容，并记录字段来源。', tool: '运单补全与轨迹留证 Skill' },
    { title: '生成水印轨迹截图', text: `逐单使用运单详情页的地图水印层，直接导出监控运输轨迹 JPG：装卸货 POI / 经纬度、时间区间、车牌、企业“${enterprise}”及“兴路车联”品牌标识均叠加在地图内。`, tool: '高德 JS API 2.0 / 地图截图' },
    { title: '核验图片并打包归档', text: '核对逐单图片与结果表的关联，将运单信息、执行结果和图片路径合并为一张表，标色推测或修正字段；ZIP 同步到任务结果及下载，失败记录不伪造留证。' },
  ];
}

export function evidenceSampleRows() {
  return Array.from({ length: 6 }, (_, index) => ({
    运单号: `YZ202610${String(index + 1).padStart(4, '0')}`,
    车牌号: ['沪A55821', '苏E83216', '浙A26953', '皖K55821', '鲁B31568', '冀E03166'][index]!,
    运单开始时间: `2026-10-${15 + index} 06:00:00`,
    装货地: index % 2 ? '上海嘉定汽车城物流园' : '',
    装货地经度: index % 2 ? 121.176 : '', 装货地纬度: index % 2 ? 31.332 : '',
    装货时间: index % 2 ? `2026-10-${15 + index} 07:20:00` : '',
    卸货地: index % 2 ? '' : '杭州钱塘物流园',
    卸货地经度: index % 2 ? '' : 120.480, 卸货地纬度: index % 2 ? '' : 30.307,
    卸货时间: index % 2 ? '' : `2026-10-${15 + index} 16:30:00`,
    坐标系: 'GCJ-02', 数据说明: '保留已知装卸货信息，补全缺失地点及时间',
  }));
}
