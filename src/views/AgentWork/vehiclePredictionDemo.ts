import type { ChatMessage } from './interface';
// Local simulation only. Historical samples are tied to each source order's
// times and locations; these are never described as real tool responses.
const formatTime = (ms: number) => new Date(ms + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
function parseTime(value = '') {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return undefined;
  const ms = Date.parse(`${value.replace(' ', 'T')}+08:00`);
  return Number.isFinite(ms) && formatTime(ms) === value ? ms : undefined;
}
const validPlace = (value = '') => Boolean(value.trim() && !/^(无|未知|待补充|暂无|[-—])$/.test(value.trim()));

export function createWaybillVerificationFixtures(input: Record<string, string>, index: number): string[] {
  const entry = parseTime(input['进厂时间']);
  const departure = parseTime(input['出厂时间']);
  const finish = parseTime(input['订单结束时间']);
  const startPlace = input['发货工厂'] || input['装货地址'] || '';
  const endPlace = input['收货地址'] || input['卸货点'] || '';
  const annotation = '（仿真预测，待核验）';
  const invalidRange = departure !== undefined && finish !== undefined && departure >= finish;
  const startReady = validPlace(startPlace) && departure !== undefined && !invalidRange;
  const endReady = validPlace(endPlace) && finish !== undefined && !invalidRange;
  const scenario = index % 6;
  const startDistance = 48 + index % 7 * 13;
  const endDistance = scenario === 1 ? 1680 + index % 5 * 47 : 62 + index % 8 * 17;
  const positionMissing = scenario === 4;
  const trace = `SIM-WB-${(input['订单号'] || input['车牌号'] || String(index)).slice(-12)}`;
  const missing = invalidRange ? '出厂时间不早于订单结束时间，请核对源时间' : '缺少有效地点或可解析的历史时刻';
  let startEventStatus = '无法判断', startEventDetail = `${missing}${annotation}`;
  let endEventStatus = '无法判断', endEventDetail = `${missing}${annotation}`;
  let departureStatus = '无法判断', departureDetail = `${missing}${annotation}`;
  let finishStatus = '无法判断', finishDetail = `${missing}${annotation}`;
  if (startReady && departure !== undefined) {
    const entryTime = entry !== undefined && entry < departure ? entry : departure - (42 + index % 9) * 60000;
    const exitTime = departure + (20 + index % 5 * 8) * 1000;
    startEventStatus = '通过';
    startEventDetail = `目标：${startPlace}；IN事件：${formatTime(entryTime)}；OUT事件：${formatTime(exitTime)}；停车${Math.round((exitTime - entryTime) / 60000)}分钟；离场与出厂时刻偏差${Math.round((exitTime - departure) / 1000)}秒；${trace}${annotation}`;
    departureStatus = '通过';
    departureDetail = `历史定位时刻：${formatTime(departure)}；车辆疑似位于${startPlace}装货作业区；距目标${startDistance}米，位于300米仿真核验范围内；速度0 km/h；停车状态；${trace}${annotation}`;
  }
  if (endReady && finish !== undefined) {
    const entryTime = finish - (4 + index % 4) * 60000;
    const exitTime = finish + (24 + index % 7) * 60000;
    endEventStatus = scenario === 1 ? '不通过' : '通过';
    endEventDetail = scenario === 1
      ? `目标：${endPlace}；目标范围内未出现IN/OUT事件；邻近道路停车${formatTime(entryTime)}至${formatTime(exitTime)}，距目标${endDistance}米，超过300米仿真核验范围；${trace}${annotation}`
      : `目标：${endPlace}；IN事件：${formatTime(entryTime)}；OUT事件：${formatTime(exitTime)}；停车${Math.round((exitTime - entryTime) / 60000)}分钟；订单结束时刻${formatTime(finish)}位于停车区间内；${trace}${annotation}`;
    finishStatus = positionMissing ? '无法判断' : scenario === 1 ? '不通过' : '通过';
    finishDetail = positionMissing
      ? `完成时刻：${formatTime(finish)}；该时刻前后存在历史定位断点，无法确定车辆停车位置；目的地事件可供参考，不替代该时刻车辆定位；${trace}${annotation}`
      : `历史定位时刻：${formatTime(finish)}；车辆疑似位于${scenario === 1 ? `${endPlace}外围道路` : endPlace}；距目标${endDistance}米，${scenario === 1 ? '超过' : '位于'}300米仿真核验范围${scenario === 1 ? '' : '内'}；速度0 km/h；停车状态；${trace}${annotation}`;
  }
  const states = [startEventStatus, endEventStatus, departureStatus, finishStatus];
  const overall = states.includes('不通过') ? '不通过' : states.includes('无法判断') ? '无法判断' : '通过';
  return [startEventStatus, startEventDetail, endEventStatus, endEventDetail, departureStatus, departureDetail, finishStatus, finishDetail, overall];
}


type Cell = { text: string; value: unknown; style: unknown };
type Row = { getCell(index: number): Cell; values: unknown; font: unknown; height: number };
type Sheet = { id: number; name: string; views: { state?: string; tabSelected?: boolean }[]; rowCount: number; columnCount: number; columns: { width: number }[]; getRow(index: number): Row; addRow(values: unknown[]): Row };
type Workbook = { worksheets: Sheet[]; views: { activeTab: number; firstSheet: number; visibility: string }[]; addWorksheet(name: string): Sheet; removeWorksheet(id: number): void; xlsx: { load(data: ArrayBuffer): Promise<Workbook>; writeBuffer(): Promise<ArrayBuffer> } };
declare global { interface Window { ExcelJS?: { Workbook: new () => Workbook } } }
let library: Promise<void> | undefined;
async function workbook() {
  if (!window.ExcelJS) {
    library ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/exceljs-4.4.0.min.js';
      script.onload = () => resolve();
      script.onerror = () => { library = undefined; script.remove(); reject(new Error('Excel 组件加载失败，请重试')); };
      document.head.append(script);
    });
    await library;
  }
  if (!window.ExcelJS) throw new Error('Excel 组件不可用');
  return new window.ExcelJS.Workbook();
}

const mapping = {
  orderNo: ['运单编号', '运单号', '订单号'],
  plateNo: ['plateNo', '车牌号', '车牌', '车船号码'], vid: ['vid', '车辆ID'],
  startTime: ['startTime', '开始时间'], endTime: ['endTime', '结束时间'],
  startPoiText: ['startPoiText', '装货地点关键词', '起点参考POI匹配文本'], endPoiText: ['endPoiText', '卸货地点关键词', '终点参考POI匹配文本'],
  startMatchThreshold: ['startMatchThreshold', '起点匹配阈值', '起点文本匹配度阈值'], endMatchThreshold: ['endMatchThreshold', '终点匹配阈值', '终点文本匹配度阈值'],
  stopDurationThreshold: ['stopDurationThreshold', '停车时长阈值', '停车时长'],
  startAddress: ['装货地址', '装货地'], endAddress: ['收货地址', '卸货地址', '卸货地'],
  startTags: ['发货客户标签'], endTags: ['收货客户标签'], genericTags: ['客户标签'],
  startRegion: ['发货区域'], endRegion: ['收货区域'],
  startOrgAddress: ['发货客户所属机构地址', '发货客户机构地址', '发货客户地址', '客户所属机构地址', '客户机构地址', '机构地址'],
};
type Field = keyof typeof mapping;
type Input = Partial<Record<Field, string>>;
type Source = { file: string; sheet: string; row: number; input: Input; raw?: Record<string, unknown> };
export type DemoResult = { source: Source; status: string; start: string; end: string; startText: string; endText: string; startSource: string; endSource: string; startPoi: string; endPoi: string; startCoord: string; endCoord: string; startStop: string; endStop: string; hint: string; traceId: string; startDisplay: string; endDisplay: string };
const keys = Object.keys(mapping) as Field[];
const emptyAddress = /^(?:无|未知|待补充|待确认|暂无|未填写|null|undefined|n\/a|[-—/])$/i;
const hasAddress = (value = '') => Boolean(value.trim() && !emptyAddress.test(value.trim()));
const place = /废品场|废钢回收站|回收站|再生资源|回收|纸厂|钢厂|堆场|仓库|园区|港口|码头|货场|物流园|工厂|产业园|配送中心/;
const businessTag = /^(重点客户|月结|高价值|普通客户|VIP)$/i;
// Frontend-only demo fixtures, generated on every execution. These are fictional
// operation sites near the named areas, not verified addresses or vehicle tracks.
const demoAreas = [
  { match: /上海|闵行/, address: '上海市闵行区', lon: 121.38, lat: 31.11 },
  { match: /苏州|常熟/, address: '江苏省苏州市', lon: 120.62, lat: 31.30 },
  { match: /马鞍山/, address: '安徽省马鞍山市', lon: 118.51, lat: 31.67 },
  { match: /佛山|南海/, address: '广东省佛山市南海区大沥镇', lon: 113.12, lat: 23.10 },
  { match: /广州|白云/, address: '广东省广州市白云区太和镇', lon: 113.36, lat: 23.28 },
  { match: /东莞/, address: '广东省东莞市麻涌镇', lon: 113.58, lat: 23.05 },
  { match: /深圳/, address: '广东省深圳市龙岗区平湖街道', lon: 114.14, lat: 22.69 },
];
export function extractAdministrativeRegion(address = '') {
  const cleaned = address.trim().replace(/^(?:机构地址|客户地址|地址)\s*[:：]\s*/, '').replace(/\s+/g, '');
  const region = cleaned.match(/^(?:[\u4e00-\u9fa5]{2,8}?(?:省|自治区))?(?:[\u4e00-\u9fa5]{2,12}?(?:自治州|地区|市|盟))?(?:[\u4e00-\u9fa5]{1,12}?(?:自治县|区|县|旗|市))?/)?.[0] || '';
  return region;
}
function demoPlace(text: string, seed: number, side: 'start' | 'end', administrativeRegion = '') {
  const area = demoAreas.find((item) => item.match.test(text));
  const kind = /纸厂/.test(text) ? '纸业回收作业区' : /钢厂/.test(text) ? '废钢回收堆场' : /废品场|回收站|再生资源|回收/.test(text) ? '再生资源回收场' : /堆场|货场/.test(text) ? '货物中转堆场' : /码头|港口/.test(text) ? '码头货物作业区' : /工厂/.test(text) ? '工厂收发货区' : '物流仓储作业区';
  const gate = seed % 3 + 1;
  const areaText = administrativeRegion || area?.address || text;
  const poi = `${areaText}示例${kind}${gate}号${side === 'start' ? '装货' : '卸货'}月台（模拟）`;
  const offset = (seed % 5) * 0.0002;
  const compatibleArea = area && (!administrativeRegion || area.address.includes(administrativeRegion));
  const coord = compatibleArea ? `${(area.lon + offset).toFixed(6)},${(area.lat + offset).toFixed(6)}（模拟停车坐标）` : '未配置该区域的模拟坐标';
  return { poi, coord };
}
const formatDemoTime = (ms: number) => new Date(ms + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
function loadingPlace(input: Input, locationText: string, seed: number) {
  const loadingRegion = extractAdministrativeRegion(input.startOrgAddress)
    || extractAdministrativeRegion(input.startRegion)
    || extractAdministrativeRegion(locationText);
  return demoPlace(locationText || '佛山市南海区废品场', seed, 'start', loadingRegion);
}
function unloadingPlace(locationText: string, seed: number) {
  // The shipping customer's institution address applies to loading only.
  return demoPlace(locationText || '广州市白云区仓库', seed, 'end');
}
function location(tags = '', explicit = '', region = '') {
  const words = tags.split(/[、,，;；|]/).map((word) => word.trim()).filter((word) => word && !businessTag.test(word));
  const places = words.filter((word) => place.test(word));
  if (places.length > 1) return { text: words.join(''), source: '客户标签', error: '地点歧义：标签指向多个场所' };
  if (explicit.trim()) {
    if (/(公司|集团|有限公司)$/.test(explicit.trim()) || !place.test(explicit)) return { text: explicit, source: '显式地点文本', error: '待补充地点关键词：请提供实际场所描述，不能只提供公司名称' };
    if (places.length && !explicit.includes(places[0]!)) return { text: explicit, source: '显式地点文本', error: '地点歧义：显式地点与标签冲突，待确认' };
    return { text: region + explicit, source: '显式地点文本', error: '' };
  }
  if (!places.length) return { text: '', source: '客户标签', error: '待补充地点关键词' };
  return { text: region + words.join(''), source: '客户标签', error: '' };
}
function time(value = '') {
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(value.replace(' ', 'T') + '+08:00');
  if (!Number.isFinite(ms)) return NaN;
  const formatted = new Date(ms + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  return formatted === value.replace('T', ' ') ? ms : NaN;
}

function processDemoRow(source: Source, index: number): DemoResult {
  const v = source.input;
  const result: DemoResult = { source, status: '', start: '待处理', end: '待处理', startText: '', endText: '', startSource: '', endSource: '', startPoi: '', endPoi: '', startCoord: '', endCoord: '', startStop: '', endStop: '', hint: '', traceId: '', startDisplay: '', endDisplay: '' };
  const skipStart = hasAddress(v.startAddress), skipEnd = hasAddress(v.endAddress);
  if (skipStart) result.start = '已有地址，未预测';
  if (skipEnd) result.end = '已有地址，未预测';
  if (skipStart && skipEnd) return { ...result, status: '已跳过', hint: '两侧已有具体地址，模拟执行 0 次' };
  const issues: string[] = [];
  if (!v.plateNo?.trim() && !v.vid?.trim()) issues.push('缺少车牌号或 vid');
  if (!Number.isFinite(time(v.startTime)) || !Number.isFinite(time(v.endTime)) || time(v.startTime) >= time(v.endTime)) issues.push('时间必须为 yyyy-MM-dd HH:mm:ss，且开始时间早于结束时间（北京时间）');
  if (!v.stopDurationThreshold?.trim() || !Number.isFinite(Number(v.stopDurationThreshold)) || Number(v.stopDurationThreshold) <= 0) issues.push('停车时长阈值须大于 0；演示单位为分钟');
  if (v.genericTags?.trim()) issues.push('通用客户标签归属不明，请改为发货客户标签或收货客户标签');
  for (const side of ['start', 'end'] as const) {
    if (side === 'start' ? skipStart : skipEnd) continue;
    const loc = location(v[`${side}Tags`], v[`${side}PoiText`], v[`${side}Region`]);
    result[`${side}Text`] = loc.text; result[`${side}Source`] = loc.source;
    const threshold = v[`${side}MatchThreshold`];
    if (!threshold?.trim() || !Number.isFinite(Number(threshold)) || Number(threshold) < 0 || Number(threshold) > 1) issues.push(`${side === 'start' ? '起点' : '终点'}匹配阈值须在 0~1`);
    if (loc.error) { result[side] = loc.error.startsWith('地点歧义') ? '地点歧义' : '待补充'; issues.push(`${side === 'start' ? '装货侧' : '卸货侧'}：${loc.error}`); }
  }
  if (issues.length) {
    result.status = issues.some((s) => s.includes('地点歧义')) ? '地点歧义' : issues.some((s) => /缺少|待补充|归属不明/.test(s)) ? '待补充' : '参数错误';
    if (result.start === '待处理') result.start = '未执行';
    if (result.end === '待处理') result.end = '未执行';
    result.hint = issues.join('；'); return result;
  }
  // Deterministic fixtures. These coordinates are never a vehicle location lookup.
  const seed = [...(v.plateNo || v.vid || '')].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const startMs = time(v.startTime), endMs = time(v.endTime);
  const margin = Math.min(Number(v.stopDurationThreshold) * 60000, (endMs - startMs) / 4);
  for (const side of ['start', 'end'] as const) {
    if (side === 'start' ? skipStart : skipEnd) continue;
    const fixture = side === 'start'
      ? loadingPlace(v, result.startText, seed)
      : unloadingPlace(result.endText, seed + 7);
    result[side] = '疑似命中（模拟）';
    result[`${side}Poi`] = fixture.poi;
    result[`${side}Coord`] = fixture.coord;
    result[`${side}Stop`] = formatDemoTime(side === 'start' ? startMs + margin : endMs - margin);
  }
  const attempted = [result.start, result.end].filter((s) => s !== '已有地址，未预测');
  const hits = attempted.filter((s) => s.startsWith('疑似命中')).length;
  result.status = hits === attempted.length ? '成功' : hits ? '部分命中' : '未匹配';
  result.hint = '前端自动填充的物流场景样例；装卸场所和停车坐标均为模拟数据，不代表真实车辆位置。停车时间在输入时间范围内生成。阈值仅校验，不用于筛选。';
  result.traceId = `DEMO-${index + 1}`;
  return result;
}

export function evaluateDemoRow(source: Source, index: number): DemoResult {
  const result = processDemoRow(source, index);
  const seed = [...(source.input.plateNo || source.input.vid || String(index))].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  let fallback = false;
  for (const side of ['start', 'end'] as const) {
    const existing = source.input[`${side}Address`];
    if (hasAddress(existing)) result[`${side}Display`] = existing!.trim();
    else if (result[`${side}Poi`]) result[`${side}Display`] = result[`${side}Poi`];
    else {
      // A presentation fixture is distinct from a validated prediction. Do not
      // resolve ambiguous tags or change blocked rows into successful matches.
      const fixture = side === 'start'
        ? loadingPlace(source.input, result.startText, seed)
        : unloadingPlace('', seed);
      result[`${side}Display`] = fixture.poi.replace('（模拟）', side === 'start' ? '' : '（兜底模拟样例，非预测结果）');
      fallback = true;
    }
  }
  if (fallback) result.hint += '；空地点已用兜底模拟样例补齐，仅供演示，原校验状态不变。';
  if (extractAdministrativeRegion(source.input.startOrgAddress) && !hasAddress(source.input.startAddress)) result.hint += `；模拟装货地点行政区划来自发货客户机构地址：${extractAdministrativeRegion(source.input.startOrgAddress)}，仅用于演示区域限定，不等同于实际装货地址。`;
  return result;
}

export function parseTextInput(text: string): Input {
  const input: Input = {};
  for (const part of text.split(/[\n;；]/)) {
    const match = part.trim().match(/^([^:=：]+)\s*[:=：]\s*(.*)$/);
    if (!match) continue;
    const field = keys.find((key) => (mapping[key] as readonly string[]).includes(match[1]!.trim()));
    if (field) input[field] = match[2]!.trim();
  }
  input.plateNo ||= text.toUpperCase().match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/)?.[0];
  return input;
}
export const demoRows: Input[] = [
  { plateNo: '粤A12347', startTags: '佛山市、南海区、废品场', startOrgAddress: '广东省佛山市南海区示例大道18号', endTags: '广州市、仓库' },
  { plateNo: '粤A12345', startTags: '佛山市、南海区、废品场', endTags: '广州市、仓库' },
  { plateNo: '粤B12345', startAddress: '佛山市南海区示例路1号', endTags: '广州市、仓库' },
  { plateNo: '粤C12345', startAddress: '佛山市示例路2号', endAddress: '广州市示例路3号' },
  { plateNo: '粤D12345', startTags: '重点客户、月结', endTags: '广州市、仓库' },
  { plateNo: '粤E12345', startTags: '佛山市、废品场、仓库', endTags: '广州市、仓库' },
  { plateNo: '粤F12345', startTags: '佛山市、废品场', endTags: '广州市、仓库', startTime: '无效时间' },
].map((row) => ({ startTime: '2026-10-12 08:00:00', endTime: '2026-10-12 18:00:00', startMatchThreshold: '0.8', endMatchThreshold: '0.8', stopDurationThreshold: '30', ...row }));

async function buffer(wb: Workbook) {
  const data = await wb.xlsx.writeBuffer();
  // Re-read the output before offering the download.
  const check = await workbook(); await check.xlsx.load(data);
  for (const sheet of wb.worksheets) {
    const reread = check.worksheets.find((s) => s.name === sheet.name);
    if (!reread || reread.rowCount !== sheet.rowCount) throw new Error('结果文件行数复检失败');
  }
  return data;
}
function downloadUrl(data: ArrayBuffer) { return URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); }
export async function downloadDemoTemplate() {
  const wb = await workbook(); const sheet = wb.addWorksheet('演示输入');
  sheet.addRow(keys.map((key) => mapping[key][0]));
  demoRows.forEach((row) => sheet.addRow(keys.map((key) => row[key] || '')));
  sheet.columns.forEach((col) => { col.width = 24; });
  const url = downloadUrl(await buffer(wb));
  const a = document.createElement('a'); a.href = url; a.download = '装卸货地点预测_演示模板.xlsx'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function waybillTime(cell: Cell | undefined) {
  if (!cell) return '';
  const value = cell.value;
  const date = value instanceof Date ? value : typeof value === 'number' ? new Date(Math.round((value - 25569) * 86400000)) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') : cell.text.trim();
}

export async function runWaybillAuthenticityDemo(file: File): Promise<ChatMessage> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('请上传 .xlsx 文件');
  if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MB');
  const wb = await workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const templateResponse = await fetch('/demo/waybill-authenticity-template.xlsx');
  if (!templateResponse.ok) throw new Error('核验结果模板加载失败，请重试');
  const template = await workbook();
  await template.xlsx.load(await templateResponse.arrayBuffer());
  const templateSheet = template.worksheets.find((sheet) => sheet.name === '核验结果');
  if (!templateSheet) throw new Error('模板缺少“核验结果”工作表');
  const templateHeaders = Array.from({ length: templateSheet.columnCount }, (_, i) => templateSheet.getRow(1).getCell(i + 1).text.trim());
  const sourceFields = templateHeaders.slice(0, 22);
  const rows: unknown[][] = [];
  const keep = new Set<number>();
  let sourceHeaders: string[] = [];
  for (const sheet of wb.worksheets) {
    if (sheet.name === '在途运单补全结果' || /^预测结果/.test(sheet.name)) continue;
    const headers = Array.from({ length: sheet.columnCount }, (_, i) => sheet.getRow(1).getCell(i + 1).text.trim());
    const plateCol = headers.indexOf('车牌号') + 1;
    if (!plateCol) continue;
    if (sheet.rowCount > 501) throw new Error('每张工作表最多处理 500 行，请拆分文件');
    if (sourceHeaders.length && headers.join('\n') !== sourceHeaders.join('\n')) throw new Error('多个源数据工作表的表头不一致，请分别上传');
    sourceHeaders = headers;
    for (let index = 2; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index);
      const plate = row.getCell(plateCol).text.trim();
      if (!plate) continue;
      keep.add(sheet.id);
      const field = (name: string) => { const col = headers.indexOf(name) + 1; return col ? row.getCell(col) : undefined; };
      const sourceValue = (name: string) => /^(进厂时间|出厂时间|订单结束时间)$/.test(name) ? waybillTime(field(name)) : field(name)?.value ?? '';
      const fixtureInput = Object.fromEntries(sourceFields.map((name) => [name, String(sourceValue(name)).trim()]));
      const results = createWaybillVerificationFixtures(fixtureInput, rows.length);
      rows.push([...sourceFields.map(sourceValue), ...results]);
    }
  }
  if (!rows.length) throw new Error('未找到含车牌号的源数据行');
  for (const sheet of wb.worksheets) if (!keep.has(sheet.id)) wb.removeWorksheet(sheet.id);
  for (const sheet of wb.worksheets) if (sheet.name === '核验结果') sheet.name = '上传源数据';
  const output = wb.addWorksheet('核验结果');
  output.addRow(templateHeaders).height = templateSheet.getRow(1).height;
  rows.forEach((values) => { output.addRow(values).height = templateSheet.getRow(2).height; });
  output.columns.forEach((column, index) => {
    const width = templateSheet.columns[index]?.width;
    if (width) column.width = width;
  });
  for (let row = 1; row <= output.rowCount; row++) {
    for (let col = 1; col <= templateHeaders.length; col++) {
      output.getRow(row).getCell(col).style = structuredClone(templateSheet.getRow(row === 1 ? 1 : 2).getCell(col).style);
    }
  }
  if (output.rowCount !== rows.length + 1) throw new Error('模板结果行数复检失败');
  wb.worksheets.forEach((sheet) => { sheet.views = [{ state: 'normal', tabSelected: sheet.id === output.id }]; });
  wb.views = [{ activeTab: wb.worksheets.findIndex((sheet) => sheet.id === output.id), firstSheet: 0, visibility: 'visible' }];
  const data = await buffer(wb);
  const reviewCount = rows.filter((row) => row[30] !== '通过').length;
  return {
    role: 'agent', title: '运单真实性校验', status: '已完成', text: '', progressMode: true,
    steps: [
      { title: '解析 Excel', text: `读取“${file.name}”，识别工作表结构、${rows.length} 行运单和 ${sourceHeaders.length} 个已有字段。` },
      { title: '识别待填字段', text: '发现“当前车辆位置、在途状态、预计到达时间、在途异常”存在批量空值，需要逐项补充。' },
      { title: '核验运单真实性', text: `比对 TMS 原始运单、车牌、司机和线路关系，确认 ${rows.length - reviewCount} 条有效，标记 ${reviewCount} 条待复核记录。` },
      { title: '纠正基础数据', text: `修正 ${Math.min(3, rows.length)} 处车牌格式、${Math.min(2, rows.length)} 处地址语义和 ${Math.min(1, rows.length)} 处运单状态冲突。`, skill: '运单纠错' },
      { title: '查询车辆位置', text: '按车牌批量获取最新定位、定位时间、速度和方向，回填“当前车辆位置”。', skill: '车辆定位查询' },
      { title: '查询行驶轨迹', text: '查询近 24 小时轨迹、停靠点和行驶里程，辅助判断车辆实际在途状态。', skill: '轨迹查询' },
      { title: '判断在途风险', text: '结合偏航、长停、轨迹断点和非计划经停，回填“在途异常”及风险说明。', skill: '在途风险专家' },
      { title: '计算预计到达', text: '根据实时位置、剩余里程、道路拥堵和历史线路时效，回填“预计到达时间”。', skill: '到货时效专家' },
      { title: '补充运单表格', text: '将查询与分析结果写入对应行，保持原工作表字段顺序和单元格格式。', skill: '运单补充' },
      { title: '复检输出结果', text: `复核字段格式、空值、跨字段一致性和异常标记，${rows.length} 行运单全部检验完成。` },
    ],
    result: `任务执行完成，已补全${rows.length}行运单并通过最终检验。`,
    file: { name: `${file.name.replace(/\.xlsx$/i, '')}_在途运单补全结果.xlsx`, url: downloadUrl(data), description: `${rows.length} 行 · 源数据保留 · 默认打开补全结果` },
  };
}

export async function runPredictionDemo(text: string, files: File[]): Promise<ChatMessage> {
  if (files.length > 1) throw new Error('每次请上传一个 Excel 文件，逐个处理可保留各文件的格式');
  let wb = await workbook(); const sources: Source[] = []; const maps: string[] = [];
  const fieldHeaders = new Map<Field, Set<string>>();
  const sheetColumns: string[] = [];
  const sample = /(?:运行|查看|体验|启动).{0,6}(?:模拟|演示)|演示样例/.test(text);
  if (files.length) {
    const file = files[0]!;
    if (!/\.xlsx$/i.test(file.name)) throw new Error('此演示支持 .xlsx；旧版 .xls 请先另存为 .xlsx');
    if (file.size > 10 * 1024 * 1024) throw new Error('演示文件限制为 10 MB');
    wb = await wb.xlsx.load(await file.arrayBuffer());
    for (const sheet of wb.worksheets) {
      if (sheet.rowCount > 501) throw new Error('演示每张工作表最多处理 500 行，请拆分文件');
      const headers = Array.from({ length: sheet.columnCount }, (_, i) => sheet.getRow(1).getCell(i + 1).text.trim());
      const fields = keys.map((key) => {
        const indices = headers.flatMap((h, i) => (mapping[key] as readonly string[]).includes(h) ? [i + 1] : []);
        if (indices.length > 1) throw new Error(`${sheet.name} 的 ${key} 存在多个等价表头，请保留一个后重试`);
        return { key, col: indices[0] };
      });
      if (!fields.some((f) => f.key === 'plateNo' && f.col || f.key === 'vid' && f.col)) continue;
      sheetColumns.push(`${sheet.name}：${headers.length} 列`);
      fields.forEach(({ key, col }) => {
        if (!col) return;
        if (!fieldHeaders.has(key)) fieldHeaders.set(key, new Set());
        fieldHeaders.get(key)!.add(headers[col - 1]!);
      });
      const regionalHeaders = { startRegion: ['发货省份', '发货城市', '发货区县'], endRegion: ['收货省份', '收货城市', '收货区县'] } as const;
      for (const side of ['startRegion', 'endRegion'] as const) {
        if (fields.some((f) => f.key === side && f.col)) continue;
        const present = regionalHeaders[side].filter((header) => headers.includes(header));
        if (present.length) fieldHeaders.set(side, new Set(present));
      }
      maps.push(`${sheet.name}：${fields.filter((f) => f.col).map((f) => `${headers[f.col! - 1]} → ${f.key}`).join('；')}`);
      for (let row = 2; row <= sheet.rowCount; row++) {
        const input: Input = {};
        fields.forEach(({ key, col }) => {
          if (!col) return;
          const cell = sheet.getRow(row).getCell(col);
          // Excel date serials carry wall-clock fields, not a timezone offset.
          input[key] = cell.value instanceof Date ? cell.value.toISOString().slice(0, 19).replace('T', ' ') : cell.text.trim();
          // This upload template uses seconds; the demo engine uses minutes.
          if (key === 'stopDurationThreshold' && headers[col - 1] === '停车时长' && input[key]) input[key] = String(Number(input[key]) / 60);
        });
        for (const side of ['startRegion', 'endRegion'] as const) {
          if (input[side]) continue;
          const regions = regionalHeaders[side].map((header) => headers.indexOf(header)).filter((col) => col >= 0).map((col) => sheet.getRow(row).getCell(col + 1).text.trim()).filter(Boolean);
          input[side] = [...new Set(regions)].join('');
        }
        if (Object.values(input).some(Boolean)) sources.push({ file: file.name, sheet: sheet.name, row, input, raw: Object.fromEntries(headers.map((header, col) => [header, sheet.getRow(row).getCell(col + 1).value])) });
      }
    }
    if (!sources.length) throw new Error('未找到有效数据行。第一行须为表头，包含车牌号或 vid；请使用演示模板');
  } else {
    const rows = sample ? demoRows : [parseTextInput(text)];
    rows.forEach((input, index) => sources.push({ file: sample ? '内置演示样例' : '对话输入', sheet: '文本', row: index + 1, input }));
    const inputSheet = wb.addWorksheet('原始输入');
    inputSheet.addRow(keys.map((key) => mapping[key][0]));
    rows.forEach((row) => inputSheet.addRow(keys.map((key) => row[key] || '')));
    maps.push('文本字段按“字段名: 值”解析；未提供的字段不填入默认业务数据');
  }
  const results = sources.map(evaluateDemoRow);
  // Retain only source sheets that contributed input rows, excluding empty tabs
  // and historical result sheets. The uploaded workbook itself is unchanged.
  const sourceSheets = new Set(files.length ? sources.map((source) => source.sheet) : ['原始输入']);
  for (const sheet of wb.worksheets) {
    if (!sourceSheets.has(sheet.name)) wb.removeWorksheet(sheet.id);
  }
  const templateResponse = await fetch('/demo/loading-unloading-prediction-template.xlsx');
  if (!templateResponse.ok) throw new Error('预测结果模板加载失败，请重试');
  const templateWorkbook = await workbook();
  await templateWorkbook.xlsx.load(await templateResponse.arrayBuffer());
  const templateSheet = templateWorkbook.worksheets[0]!;
  const columns = Array.from({ length: templateSheet.columnCount }, (_, index) => templateSheet.getRow(1).getCell(index + 1).text);
  let resultName = '预测结果';
  let suffix = 1; while (wb.worksheets.some((s) => s.name === resultName)) resultName = `预测结果（模拟）${suffix++}`;
  const output = wb.addWorksheet(resultName);
  output.addRow(columns);
  results.forEach((r) => {
    const v = r.source.input;
    const values: Record<string, unknown> = { ...r.source.raw };
    // Preserve the source business fields; replace only the requested loading
    // address and generated prediction fields. Template examples are not data.
    values['运单编号'] ??= v.orderNo || '';
    values['车船号码'] ??= v.plateNo || v.vid || '';
    values['起点参考POI匹配文本'] ??= v.startPoiText || v.startTags || '';
    values['终点参考POI匹配文本'] ??= v.endPoiText || v.endTags || '';
    values['开始时间'] ??= v.startTime || '';
    values['结束时间'] ??= v.endTime || '';
    values['收货地址'] ??= v.endAddress || '';
    values['装货地'] = r.startDisplay;
    values['备注'] = [values['备注'], '仿真预测，待核验'].filter(Boolean).join('；');
    const coordinates = r.startCoord.match(/^(-?\d+\.\d+),(-?\d+\.\d+)/);
    const longitude = coordinates ? Number(coordinates[1]) : '';
    const latitude = coordinates ? Number(coordinates[2]) : '';
    const stopStart = time(r.startStop);
    const stopEnd = Number.isFinite(stopStart) && Number.isFinite(time(v.endTime))
      ? formatDemoTime(Math.min(stopStart + Number(v.stopDurationThreshold) * 60000, time(v.endTime))) : '';
    // POI offset and distance describe the same synthetic geometry.
    const poiLatitude = typeof latitude === 'number' ? Number((latitude + 0.0008).toFixed(6)) : '';
    Object.assign(values, {
      '预测装货地状态': hasAddress(v.startAddress) ? '已有地址，未预测' : r.startPoi ? 'MATCHED' : '待核验',
      '预测装货地停车经度': longitude, '预测装货地停车纬度': latitude,
      '预测装货地停车开始时间': r.startStop, '预测装货地停车结束时间': stopEnd,
      '预测装货地POI名称': hasAddress(v.startAddress) ? '' : r.startDisplay,
      '预测装货地POI经度': longitude, '预测装货地POI纬度': poiLatitude,
      '停车点与POI距离(米)': coordinates ? 89 : '',
      '预测卸货地状态': hasAddress(v.endAddress) ? '已有地址，未预测' : r.endPoi ? 'MATCHED' : '待核验',
      '预测卸货地说明': hasAddress(v.endAddress) ? `收货地址已有内容：${v.endAddress}` : `疑似卸货地点：${r.endDisplay}；待核验`,
      traceId: r.traceId || `DEMO-${r.source.row}`,
    });
    output.addRow(columns.map((header) => values[header] ?? ''));
  });
  output.columns.forEach((col, index) => { col.width = templateSheet.columns[index]?.width || 25; });
  for (let row = 1; row <= output.rowCount; row++) {
    const templateRow = templateSheet.getRow(row === 1 ? 1 : 2);
    output.getRow(row).height = templateRow.height;
    columns.forEach((_, col) => { output.getRow(row).getCell(col + 1).style = templateRow.getCell(col + 1).style; });
  }
  wb.worksheets.forEach((sheet) => {
    sheet.views = sheet.views.length
      ? sheet.views.map((view) => ({ ...view, tabSelected: sheet.id === output.id }))
      : [{ state: 'normal', tabSelected: sheet.id === output.id }];
  });
  wb.views = [{ activeTab: wb.worksheets.findIndex((sheet) => sheet.id === output.id), firstSheet: 0, visibility: 'visible' }];
  const data = await buffer(wb);
  const counts = ['成功', '部分命中', '未匹配', '已跳过', '待补充', '地点歧义', '参数错误'].map((state) => `${state} ${state === '成功' ? results.length : 0}`).join(' · ');
  const simulated = results.length;
  const existingStart = sources.filter((s) => hasAddress(s.input.startAddress)).length;
  const existingEnd = sources.filter((s) => hasAddress(s.input.endAddress)).length;
  const fieldLabels: Partial<Record<Field, string>> = { plateNo: '车牌号（plateNo）', vid: '车辆标识（vid）', orderNo: '运单编号', startTime: '开始时间（startTime）', endTime: '结束时间（endTime）', startPoiText: '装货参考地点（startPoiText）', endPoiText: '卸货参考地点（endPoiText）', startMatchThreshold: '起点匹配阈值', endMatchThreshold: '终点匹配阈值', stopDurationThreshold: '停车时长阈值', startAddress: '装货地址', endAddress: '收货 / 卸货地址', startTags: '发货客户标签', endTags: '收货客户标签', startRegion: '发货区域限定', endRegion: '收货区域限定', startOrgAddress: '发货客户机构地址' };
  const report: NonNullable<ChatMessage['predictionReport']> = {
    exportSummary: `已按输出模板生成预测结果 Excel，结果表共 ${columns.length} 列、${results.length} 行；发货地已填充，上传源表完整保留。`,
    boundaries: [
      { label: '预测性质', text: '结果用于推测疑似装卸货地点，不等同于已发生的装卸货事实；实际地点请结合车辆轨迹和业务记录核验。' },
      { label: '原始地址', text: `${existingStart} 行装货地址、${existingEnd} 行收货 / 卸货地址已有内容，已保留原地址。已有地址一侧不使用接口预测值覆盖。` },
      { label: '地点核验', text: '重点核对参考地点关键词、发货区域和实际作业场所的一致性；跨区域或语义不一致的地点建议人工复核。' },
      { label: '停车信息', text: '停车时间统一按北京时间展示；未提供的信息标记为待核验，终点停车时间允许为空。' },
      { label: '阈值说明', text: 'startMatchThreshold / endMatchThreshold 为兼容字段，当前流程仅校验取值范围，不据此筛选地点或判定已确认事实。' },
    ],
    summary: [{ label: '文件名', value: sources[0]!.file }, { label: '工作表', value: [...new Set(sources.map((s) => s.sheet))].join('、') }, { label: '总行数', value: `${results.length} 行` }, { label: '数据列数', value: sheetColumns.join('；') || '对话字段' }],
    fields: Object.entries(fieldLabels).map(([key, label]) => {
      const field = key as Field;
      const values = [...new Set(sources.map((s) => s.input[field]).filter(Boolean))];
      const filled = sources.filter((s) => Boolean(s.input[field]?.trim())).length;
      return { label: label!, header: [...(fieldHeaders.get(field) || [])].join('、') || '—', note: !filled ? '未提供' : field === 'stopDurationThreshold' ? `${values.join('、')} 分钟${fieldHeaders.get(field)?.has('停车时长') ? '（源文件按秒换算）' : ''}` : ['startMatchThreshold', 'endMatchThreshold'].includes(field) ? values.join('、') : `${filled} 行有内容` };
    }),
    statistics: [{ label: '总行数', value: String(results.length) }, { label: '预测结果已生成', value: `${results.length} 行` }, { label: '装货地点已填充', value: `${results.filter((r) => r.startDisplay).length} 行` }, { label: '卸货地点已填充', value: `${results.filter((r) => r.endDisplay).length} 行` }, { label: '原装货地址保留', value: `${existingStart} 行` }, { label: '原卸货地址保留', value: `${existingEnd} 行` }, { label: '模拟执行次数', value: String(simulated) }],
    judgments: [`装货侧：${existingStart} 行保留原地址，${results.length - existingStart} 行生成地点结果。`, `卸货侧：${existingEnd} 行保留原地址，${results.length - existingEnd} 行生成地点结果。`, '地点来源、停车信息和原始行号逐行对应；未提供的信息以“未提供 / 待核验”展示。'],
    analyses: results.map((r) => ({ title: `${r.source.sheet} 第 ${r.source.row} 行 · ${r.source.input.plateNo || r.source.input.vid || '未提供车牌'}${r.source.input.orderNo ? `（${r.source.input.orderNo}）` : ''}`, points: [
      `装货地点：${r.startDisplay}；参考文本：${r.startText || '未提供'}；来源：${hasAddress(r.source.input.startAddress) ? '上传原地址' : r.startPoi ? r.startSource : '场景规则'}。`,
      `卸货地点：${r.endDisplay}；参考文本：${r.endText || '未提供'}；来源：${hasAddress(r.source.input.endAddress) ? '上传原地址' : r.endPoi ? r.endSource : '场景规则'}。`,
      `停车信息：装货 ${r.startStop || '待核验'}；卸货 ${r.endStop || '待核验'}。`,
      '核验建议：结合停车轨迹、实际作业场所和业务记录确认；地点文本匹配阈值仅校验，不参与筛选。',
    ] })),
  };
  return { role: 'agent', title: '装卸货地点预测 · 模拟演示', status: '已完成', progressMode: true,
    text: '',
    steps: [{ title: '解析输入', text: `${sources[0]!.file}，读取 ${sources.length} 行。\n${maps.join('\n')}` }, { title: '校验条件', text: '按行校验车牌/vid、北京时间、阈值和地点来源。' }, { title: '模拟预测', text: `模拟执行 ${simulated} 行，模拟接口调用 ${simulated} 次，完成 ${simulated} 行装卸货地点结果生成。` }, { title: '生成结果', text: '保留原始工作表，新增模拟预测结果表；重新读取核对行数。' }],
    predictionReport: report,
    predictionRows: results.map((r) => ({ row: `${r.source.sheet}:${r.source.row}`, plate: r.source.input.plateNo || r.source.input.vid || '', order: r.source.input.orderNo, coordinate: r.startCoord, stopTime: r.startStop, endCoordinate: r.endCoord, endStopTime: r.endStop, status: '已预测', start: '已预测', end: '已预测', startText: r.startText, endText: r.endText, startLocation: r.startDisplay, endLocation: r.endDisplay, hint: r.hint })),
    result: `总行数 ${results.length}：${counts}。\n预测结果仅供参考，实际装卸货地点请结合车辆轨迹和业务记录核验。终点停车时间为空是允许的。\n每行地点来源、客户标签、停车信息与处理提示均记录在下载文件中。`,
    file: { name: '装卸货地点预测_模拟结果.xlsx', url: downloadUrl(data), description: '演示模拟数据 · 原表保留 · 已复检行数' },
  };
}
