import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { utils, write } from 'xlsx';
import type { TaskResultFile } from './dailyTasks';
import { parseWaybillTimestamp } from './taskInput';

export const evidenceResultColumns = ['运单号', '车牌号', '装货地点', '装货时间', '卸货地点', '卸货时间', '执行结果', '生成图片路径'];
export interface EvidenceResultRow {
  values: Record<string, string | number>;
  changedFields: string[];
}

export function buildEvidenceWorkbook(rows: EvidenceResultRow[]) {
  const columns = [...new Set([...evidenceResultColumns, ...rows.flatMap(row => Object.keys(row.values))])];
  const sheet = utils.json_to_sheet(rows.map(row => row.values), { header: columns });
  rows.forEach((row, index) => ['装货时间', '卸货时间'].forEach(field => {
    const timestamp = parseWaybillTimestamp(String(row.values[field] ?? ''));
    if (timestamp === null) return;
    const address = utils.encode_cell({ r: index + 1, c: columns.indexOf(field) });
    sheet[address] = { t: 'n', v: timestamp / 86400000 + 25569 + 8 / 24, z: 'yyyy-mm-dd hh:mm:ss' };
  }));
  sheet['!cols'] = columns.map(column => ({ wch: column === '生成图片路径' ? 66 : column.endsWith('地点') ? 32 : column.includes('时间') ? 23 : column === '执行结果' ? 42 : 22 }));
  sheet['!rows'] = [{ hpt: 25 }, ...rows.map(() => ({ hpt: 44 }))];
  sheet['!autofilter'] = { ref: sheet['!ref']! };
  const changedCells = new Set<string>();
  rows.forEach((row, index) => row.changedFields.forEach(field => {
    const column = columns.indexOf(field);
    if (column < 0) return;
    changedCells.add(utils.encode_cell({ r: 0, c: column }));
    changedCells.add(utils.encode_cell({ r: index + 1, c: column }));
  }));
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, '运单结果');
  return { workbook, changedCells };
}

// SheetJS CE does not write fills; patch only this export using the browser's XML DOM.
function styleEvidenceWorkbook(bytes: Uint8Array, changedCells: Set<string>) {
  const entries = unzipSync(bytes);
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const parser = new DOMParser();
  function parse(path: string) {
    const document = parser.parseFromString(strFromU8(entries[path]!), 'application/xml');
    if (document.getElementsByTagName('parsererror').length) throw new Error('结果表格式生成失败，请重新执行');
    return document;
  }
  const styles = parse('xl/styles.xml');
  const sheet = parse('xl/worksheets/sheet1.xml');
  const fills = styles.getElementsByTagNameNS(namespace, 'fills')[0]!;
  const fonts = styles.getElementsByTagNameNS(namespace, 'fonts')[0]!;
  const formats = styles.getElementsByTagNameNS(namespace, 'cellXfs')[0]!;
  function element(name: string, attributes: Record<string, string> = {}) {
    const node = styles.createElementNS(namespace, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }
  function addFill(color: string) {
    const id = fills.children.length;
    const fill = element('fill');
    const pattern = element('patternFill', { patternType: 'solid' });
    pattern.append(element('fgColor', { rgb: color }), element('bgColor', { indexed: '64' }));
    fill.append(pattern); fills.append(fill); fills.setAttribute('count', String(fills.children.length));
    return id;
  }
  const headerFill = addFill('FFF1F5F9');
  const changedFill = addFill('FFFFF2CC');
  const headerFont = fonts.children[0]!.cloneNode(true) as Element;
  headerFont.append(element('b'));
  const headerFontId = fonts.children.length;
  fonts.append(headerFont); fonts.setAttribute('count', String(fonts.children.length));
  const formatCache = new Map<string, number>();
  for (const cell of Array.from(sheet.getElementsByTagNameNS(namespace, 'c'))) {
    const address = cell.getAttribute('r')!;
    const header = utils.decode_cell(address).r === 0;
    const baseId = Number(cell.getAttribute('s') || 0);
    const fill = changedCells.has(address) ? changedFill : header ? headerFill : undefined;
    const key = `${baseId}:${fill ?? ''}:${header}`;
    if (!formatCache.has(key)) {
      const format = formats.children[baseId]!.cloneNode(true) as Element;
      if (fill !== undefined) { format.setAttribute('fillId', String(fill)); format.setAttribute('applyFill', '1'); }
      if (header) { format.setAttribute('fontId', String(headerFontId)); format.setAttribute('applyFont', '1'); }
      for (const alignment of Array.from(format.getElementsByTagNameNS(namespace, 'alignment'))) alignment.remove();
      format.append(element('alignment', { vertical: 'top', wrapText: '1' }));
      format.setAttribute('applyAlignment', '1');
      formatCache.set(key, formats.children.length);
      formats.append(format);
    }
    cell.setAttribute('s', String(formatCache.get(key)));
  }
  formats.setAttribute('count', String(formats.children.length));
  const serializer = new XMLSerializer();
  entries['xl/styles.xml'] = strToU8(serializer.serializeToString(styles));
  entries['xl/worksheets/sheet1.xml'] = strToU8(serializer.serializeToString(sheet));
  return zipSync(entries);
}

export function createEvidenceWorkbook(rows: EvidenceResultRow[]): TaskResultFile {
  const { workbook, changedCells } = buildEvidenceWorkbook(rows);
  const bytes = styleEvidenceWorkbook(new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer), changedCells);
  let content = '';
  for (let index = 0; index < bytes.length; index += 8192) content += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return { name: '运单结果表.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: btoa(content), encoding: 'base64', size: bytes.length };
}
