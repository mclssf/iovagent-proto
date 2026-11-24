// 仅取类型；运行时用动态 import，让 xlsx（约 870KB）单独成块、只在真的解析附件时才加载
import type * as XLSX from 'xlsx';

import type { SensitiveAreaDraft } from '../../interface';
import { AREA_NAME_MAX, AREA_TYPE_PRESET, clampAreaName, extractPlaceName, extractStayThresholdFromLine, mockReverseGeocode, parseAreaInputText } from './mockData';
import type { AreaType, ParsedAreaInput } from './mockData';

/**
 * 敏感区域录入解析（统一入口）
 * 三条来源：① 对话文本单点 ② 对话文本多点（多行 / 分号分隔） ③ Excel·CSV 附件批量（当前无 UI 入口，休眠）
 * 全部收敛成 SensitiveAreaDraft[]，由确认卡渲染：对话框内嵌 SensitiveAreaConfirmCard / 批量卡，
 * 知识库页面内则是 SensitiveAreaIntakeDialog 弹窗（同样复用批量卡）。
 * 关键词闸门只在对话链路生效（requireKeyword），页面弹窗里意图已确定，不做要求。
 */

const COORD_RE = /\d{1,3}\.\d+/;

/** 命中这些词才认为是"录入敏感区域"意图（还需同时存在坐标） */
export const SENSITIVE_AREA_KEYWORDS = [
  '敏感区',
  '敏感点',
  '敏感地',
  '敏感围栏',
  '电子围栏',
  '围栏',
  '窝点',
  '注水',
  '换煤',
  '掺配',
  '洗煤厂',
];

export function hasSensitiveAreaKeyword(text: string): boolean {
  return SENSITIVE_AREA_KEYWORDS.some((term) => text.includes(term));
}

/**
 * 从文本推断点位类型：洗煤/掺配/煤场 → washing，其余一律注水点
 * 轨迹丢失窝点类型已下线，不再从文本推断产出
 */
export function inferAreaType(raw: string): AreaType {
  if (/洗煤|掺配|煤场|堆场|厂区/.test(raw)) return 'washing';
  return 'watering';
}

let draftSeq = 0;

function nextDraftId() {
  draftSeq += 1;
  return `draft-${Date.now()}-${draftSeq}`;
}

/** 单行文本 → 一个草稿（解析失败也返回草稿，带 parseError 供人工核对） */
function buildDraft(
  parsed: ParsedAreaInput,
  origin: SensitiveAreaDraft['origin'],
  sourceRow?: number,
): SensitiveAreaDraft {
  const base = {
    id: nextDraftId(),
    origin,
    sourceRow,
    rawInput: parsed.raw,
    duplicateOf: parsed.dupOf,
  };

  if (parsed.level === 'error' || !parsed.lat || !parsed.lng) {
    return {
      ...base,
      // 名称按 AREA_NAME_MAX 截断：粘贴录入不经过编辑面板的 maxlength，必须在这里拦
      name: clampAreaName(parsed.name) || `第 ${parsed.lineNo} 行`,
      lat: parsed.lat || 0,
      lng: parsed.lng || 0,
      radiusM: 0,
      areaType: 'watering',
      stayThresholdMin: 0,
      region: '',
      address: '',
      remark: '',
      resolveState: 'pending',
      parseError: parsed.error || '未解析到有效经纬度',
    };
  }

  const areaType = inferAreaType(parsed.raw);
  const preset = AREA_TYPE_PRESET[areaType];
  // 文本里写了停留时长就用它，否则走默认（半径同理，在 parseAreaInputText 里已处理）
  const stay = extractStayThresholdFromLine(parsed.raw);
  const placeName = extractPlaceName(parsed.raw) || parsed.name;
  const geo = mockReverseGeocode(parsed.lat, parsed.lng, placeName);

  return {
    ...base,
    /*
     * 取名优先级（航哥 20261124）：**客户填的名称 > POI 名 > 地址**。
     * 「如果客户在录入中填写了名称 优先使用客户填写的；如果获取不到POI名称 就使用地址。」
     *
     * ⚠️ 中间那级原先是 `geo.suggestName`，它回退成「玉门市示范镇」这种**行政区名**——
     * 既不是 POI 也不是门牌地址，客户看到会以为是系统乱起名。改成 poiName → address。
     */
    name: clampAreaName(placeName || geo.poiName || geo.address),
    lat: parsed.lat,
    lng: parsed.lng,
    radiusM: parsed.radiusM > 0 ? parsed.radiusM : preset.radiusM,
    areaType,
    stayThresholdMin: stay.stayThresholdMin > 0 ? stay.stayThresholdMin : preset.stayThresholdMin,
    region: geo.region,
    address: geo.address,
    remark: parsed.remark,
    resolveState: 'pending',
  };
}

/**
 * 对话文本 → 草稿数组
 * 支持：多行（每行一个点位）、单行内用分号分隔多个点位
 * 无坐标 / 无关键词 → 返回空数组（交给其他意图处理）
 */
export interface DraftsFromTextOptions {
  /**
   * 是否要求文本里出现敏感区域关键词。
   * 对话框里需要（自由聊天，得先判定录入意图）；知识库的录入弹窗里不需要（意图已确定）。
   */
  requireKeyword?: boolean;
}

export function draftsFromText(raw: string, options: DraftsFromTextOptions = {}): SensitiveAreaDraft[] {
  const { requireKeyword = true } = options;
  if (requireKeyword && !hasSensitiveAreaKeyword(raw)) return [];

  const lines = raw
    .split(/[\n;；]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // 对话里的引导语（如「敏感区域录入：」「下面是点位」）不含数字，直接丢掉；
    // 含数字但解析失败的行保留，作为「无法识别」列出来让人核对。
    //
    // ⚠️ **这个过滤只在对话链路（requireKeyword=true）生效**（航哥 20261124 待确认9 去掉确认步骤后修的）：
    // 录入弹窗里用户是**刻意**粘贴点位数据的，一行没坐标就是真失败，不能静默丢。
    // 原来两种链路共用这个 filter，导致「没有坐标的行」在解析前就被扔掉——
    // 它既不会成为 parseError 草稿，也就不计入 rejected，用户完全看不到。
    // 有核对页时还能靠"我粘了 3 行怎么只剩 2 条"察觉；核对页删掉后就是**纯静默丢数据**：
    // 用户以为 3 条都入库了，实际只进了 2 条。
    // 放开后这类行会走到 buildDraft 的 error 分支，成为 parseError 草稿被如实报出来。
    .filter((line) => requireKeyword ? /\d/.test(line) : true);

  // 至少要有坐标，否则不算录入意图
  if (!lines.some((line) => COORD_RE.test(line))) return [];

  const parsed = parseAreaInputText(lines.join('\n'));
  return parsed.map((item) => buildDraft(item, 'text'));
}

export interface AreaFileResult {
  fileName: string;
  sheetName: string;
  /** 命中坐标的数据行数（不含表头） */
  rawRows: number;
  parsed: ParsedAreaInput[];
  /** 与 parsed 一一对应的原始表格行号（1 起） */
  rowNumbers: number[];
  sheetNames: string[];
}

function rowToText(row: unknown[]): string {
  return row
    .map((cell) => (cell === null || cell === undefined ? '' : String(cell)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toRows(xlsx: typeof XLSX, sheet: XLSX.WorkSheet): unknown[][] {
  return xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
}

/**
 * 读取 Excel / CSV 附件（浏览器端解析，不上传服务器）
 * 多 sheet 时优先取名称含「敏感/围栏/点位/POI」的，否则取坐标行最多的那个
 */
export async function parseAreaFile(file: File): Promise<AreaFileResult> {
  const xlsx = await import('xlsx');
  let workbook: XLSX.WorkBook;
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    workbook = xlsx.read(text, { type: 'string' });
  } else {
    const buffer = await file.arrayBuffer();
    workbook = xlsx.read(buffer, { type: 'array' });
  }

  const sheetNames = workbook.SheetNames;
  let bestName = sheetNames[0] ?? '';
  let bestRows: unknown[][] = [];
  let bestScore = -1;

  sheetNames.forEach((name) => {
    const rows = toRows(xlsx, workbook.Sheets[name] as XLSX.WorkSheet);
    const coordRows = rows.filter((row) => COORD_RE.test(rowToText(row))).length;
    const score = coordRows + (/敏感|围栏|点位|poi/i.test(name) ? 1000 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
      bestRows = rows;
    }
  });

  const lines: string[] = [];
  const rowNumbers: number[] = [];
  bestRows.forEach((row, index) => {
    const text = rowToText(row);
    // 表头行、空行、无坐标的说明行自动跳过
    if (!text || !COORD_RE.test(text)) return;
    lines.push(text);
    rowNumbers.push(index + 1);
  });

  const parsed = lines.length > 0 ? parseAreaInputText(lines.join('\n')) : [];

  return {
    fileName: file.name,
    sheetName: bestName,
    rawRows: lines.length,
    parsed,
    rowNumbers,
    sheetNames,
  };
}

/** 文件解析结果 → 草稿数组（带原始行号，便于和客户表格对账） */
export function draftsFromFile(result: AreaFileResult): SensitiveAreaDraft[] {
  return result.parsed.map((item, index) => buildDraft(item, 'file', result.rowNumbers[index]));
}

export interface DraftSummary {
  total: number;
  usable: number;
  duplicate: number;
  rejected: number;
}

/** 批次统计，供消息文案与卡片头部使用 */
export function summarizeDrafts(drafts: SensitiveAreaDraft[]): DraftSummary {
  const rejected = drafts.filter((draft) => draft.parseError).length;
  const duplicate = drafts.filter((draft) => !draft.parseError && (draft.duplicateOf ?? 0) > 0).length;
  return {
    total: drafts.length,
    usable: drafts.length - rejected - duplicate,
    duplicate,
    rejected,
  };
}

/** 可直接入库的草稿（排除解析失败与重复坐标） */
export function confirmableDrafts(drafts: SensitiveAreaDraft[]): SensitiveAreaDraft[] {
  return drafts.filter((draft) => !draft.parseError && (draft.duplicateOf ?? 0) === 0 && draft.resolveState === 'pending');
}
