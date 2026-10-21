import { read, utils, write } from 'xlsx';
import { strToU8, zipSync } from 'fflate';
import type { DailyTask, TaskAgentDecision, TaskAttachment, TaskResultFile, TaskRun } from './dailyTasks';
import { excelParsingSkill, hasHistoryTaskIntent, ordinaryTaskLimits, resolveOrdinarySkill } from './ordinaryTaskSkills';
import { extractTaskPlates, parseWaybillTimestamp, recordValue } from './taskInput';
import { evidenceInputError, hasWaybillEvidenceIntent, waybillEvidenceSteps } from './waybillEvidence';

export { extractTaskPlates, parseWaybillTimestamp } from './taskInput';

const DAY = 86400000;
const chinaDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const chinaTimeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const chinaDate = (value: number) => chinaDateFormat.format(value);
const safeName = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 80);
export const isTaskExcel = (file: { name: string }) => /\.(xls|xlsx)$/i.test(file.name);

function archiveDate(prompt: string, now: number) {
  const days = prompt.match(/(\d+)\s*天(?:之|以)?前/);
  if (days && Number(days[1]) >= 180 && Number(days[1]) <= 36500) return chinaDate(now - Number(days[1]) * DAY);
  if (/(?:一百八十天|半年|六个月)(?:之|以)?前/.test(prompt)) return chinaDate(now - 180 * DAY);
  const months = prompt.match(/(\d+)\s*个月(?:之|以)?前/);
  if (months && Number(months[1]) >= 6 && Number(months[1]) <= 1200) return chinaDate(now - Number(months[1]) * 30 * DAY);
  const date = prompt.match(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})日?/);
  if (!date) return null;
  const normalized = `${date[1]}-${date[2]!.padStart(2, '0')}-${date[3]!.padStart(2, '0')}`;
  const timestamp = Date.parse(`${normalized}T00:00:00+08:00`);
  return Number.isFinite(timestamp) && chinaDate(timestamp) === normalized && timestamp <= now - 180 * DAY ? normalized : null;
}

export function resolveAsyncTool(prompt: string, now = Date.now()) {
  const date = archiveDate(prompt, now);
  return /查|检索|调取|获取|导出|帮我|请/.test(prompt) && /轨迹|行驶路线/.test(prompt) && date
    ? { id: 'vehicle.track.archive', name: '历史轨迹归档查询', execution: 'async' as const, date } : null;
}

export function ordinaryTaskName(prompt: string) {
  if (hasWaybillEvidenceIntent(prompt)) return '运单补全与轨迹留证';
  if (hasHistoryTaskIntent(prompt)) return `${extractTaskPlates(prompt)[0] ?? '批量运单'}历史轨迹查询`;
  return prompt.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function mergeTaskAttachments(existing: TaskAttachment[], incoming: TaskAttachment[]) {
  const files = [...existing];
  for (const file of incoming) {
    if (files.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) continue;
    if (!isTaskExcel(file)) throw new Error('任务附件仅支持 .xls 或 .xlsx 文件');
    if (file.size <= 0) throw new Error(`“${file.name}”为空文件，请重新选择`);
    if (file.size > ordinaryTaskLimits.maxFileBytes) throw new Error('单个 Excel 文件不能超过 20 MB');
    files.push({ ...file, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, records: file.records?.map(record => ({ ...record })) });
  }
  if (files.length > ordinaryTaskLimits.maxFiles) throw new Error('最多上传 10 个 Excel 文件');
  if (files.reduce((total, file) => total + (file.rowCount ?? 0), 0) > ordinaryTaskLimits.maxRows) throw new Error(`一次任务最多处理 ${ordinaryTaskLimits.maxRows} 行数据`);
  return files;
}

export function parseTaskWorkbook(buffer: ArrayBuffer): Record<string, string>[] {
  const workbook = read(buffer, { type: 'array', cellDates: true });
  const records: Record<string, string>[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]!;
    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false, blankrows: false });
    for (const row of rows) {
      const values = Object.entries(row).map(([key, value]) => [key.trim(), String(value ?? '').trim()]);
      if (!values.some(([, value]) => value)) continue;
      const sourceRow = (row as Record<string, unknown> & { __rowNum__?: number }).__rowNum__;
      records.push({ ...Object.fromEntries(values), __sourceRow: String((sourceRow ?? records.length + 1) + 1), __sourceSheet: sheetName });
      if (records.length > ordinaryTaskLimits.maxRows) throw new Error(`一次任务最多处理 ${ordinaryTaskLimits.maxRows} 行数据`);
    }
  }
  if (!records.length) throw new Error('Excel 中没有可处理的数据行，请检查表头和内容');
  return records;
}

export async function readTaskAttachments(files: File[]): Promise<TaskAttachment[]> {
  mergeTaskAttachments([], files);
  const attachments: TaskAttachment[] = [];
  for (const file of files) {
    const attachment: TaskAttachment = { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified };
    try {
      attachment.records = parseTaskWorkbook(await file.arrayBuffer()).map(record => ({ ...record, __sourceFile: file.name }));
      attachment.rowCount = attachment.records.length;
    } catch (error) { attachment.parseError = (error as Error).message; }
    attachments.push(attachment);
  }
  return mergeTaskAttachments([], attachments);
}

export const taskExcelRowCount = (files: TaskAttachment[]) => files.reduce((count, file) => count + (isTaskExcel(file) ? file.rowCount ?? 0 : 0), 0);
export const exceedsTaskThreshold = (files: TaskAttachment[], prompt = '') => taskExcelRowCount(files) > (resolveOrdinarySkill(prompt, true)?.batchThresholdRows ?? ordinaryTaskLimits.batchThresholdRows);
export const ordinaryStepDelay = () => 4000 + Math.round(Math.random() * 2000);

export function taskRecords(task: DailyTask): Record<string, string>[] {
  const records = (task.attachments ?? []).flatMap(file => file.records ?? []);
  return records.length ? records : extractTaskPlates(task.prompt).map(plate => ({ 车牌号: plate }));
}

const waybillTimeFields = ['运单开始时间', '运单时间', '订单开始时间', '发车时间', '实际出发时间', '装货开始时间', '装货时间', '开始时间', 'waybillStartTime', 'startTime'];

// The workbench Agent decides the route from parsed rows; task execution reuses it.
export function planWorkbenchExcelTask(files: TaskAttachment[], now = Date.now()): TaskAgentDecision | null {
  const records = files.filter(isTaskExcel).flatMap(file => file.records ?? []);
  const historicalIndexes: number[] = [];
  let waybillRows = 0;
  let invalidTimeRows = 0;
  records.forEach((record, index) => {
    if (!recordValue(record, ['运单号', '订单号', '货单号', '车牌号', '车牌', '车辆牌照', 'plate', 'waybillNo', 'orderNo'])) return;
    waybillRows++;
    const timestamp = parseWaybillTimestamp(recordValue(record, waybillTimeFields));
    if (timestamp === null) invalidTimeRows++;
    else if (timestamp < now - excelParsingSkill.archiveAgeDays * DAY) historicalIndexes.push(index);
  });
  if (!historicalIndexes.length && waybillRows <= excelParsingSkill.batchThresholdRows) return null;
  return { reason: historicalIndexes.length ? 'historical-waybills' : 'large-batch', decidedAt: now, totalRows: records.length, waybillRows, historicalIndexes, invalidTimeRows, thresholdRows: excelParsingSkill.batchThresholdRows, archiveAgeDays: excelParsingSkill.archiveAgeDays };
}

export const isTaskDetailFile = (file: TaskResultFile) => file.detail || /_记录\d+_轨迹\.csv$/i.test(file.name);
export const visibleTaskFiles = (files: TaskResultFile[] = []) => files.filter(file => /\.zip$/i.test(file.name));

export function taskRecordError(task: DailyTask, record: Record<string, string>, index: number) {
  if (task.scenario === 'waybill-evidence') return evidenceInputError(record);
  if (!hasHistoryTaskIntent(task.prompt) && !task.agentDecision?.historicalIndexes.includes(index)) return '';
  const plate = recordValue(record, ['车牌号', '车牌', '车辆号', '车辆牌照', 'plate']);
  return extractTaskPlates(plate).length ? '' : '缺少有效车牌号';
}

export function updateOrdinaryProgress(task: DailyTask, run: TaskRun, processed: number) {
  if (!run.progress) return;
  const records = taskRecords(task);
  const count = Math.min(processed, records.length);
  const failed = records.slice(0, count).filter((record, index) => taskRecordError(task, record, index)).length;
  run.progress = { total: records.length, processed: count, success: count - failed, failed };
}

export function makeOrdinaryRun(task: DailyTask): TaskRun {
  const now = Date.now();
  const files = task.attachments ?? [];
  const rows = taskRecords(task).length;
  const tool = resolveAsyncTool(task.prompt, now);
  const archive = Boolean(task.agentDecision?.historicalIndexes.length || !files.length && tool);
  const skill = resolveOrdinarySkill(task.prompt, files.some(isTaskExcel), archive);
  const standardSkill = archive && task.agentDecision && task.agentDecision.historicalIndexes.length < rows ? resolveOrdinarySkill(task.prompt, files.some(isTaskExcel)) : null;
  const skills = [skill, standardSkill].filter((item): item is NonNullable<typeof skill> => Boolean(item));
  const jobId = `JOB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  return {
    id: `run-${crypto.randomUUID()}`, startedAt: now, source: task.origin === 'workbench' ? 'workbench' : 'manual',
    status: 'ready', prompt: task.prompt, toolJobId: jobId, activeStep: 0, nextStepAt: now,
    result: '', executionMode: skill ? 'skill' : 'prompt', skills: skills.map(item => ({ ...item, status: 'loading' })),
    progress: rows ? { total: rows, processed: 0, success: 0, failed: 0 } : undefined,
    steps: task.scenario === 'waybill-evidence' ? waybillEvidenceSteps(rows, task.enterpriseName ?? '演示企业') : [
      { title: '解析任务', text: `已保存原始需求${files.length ? `及附件 ${files.map(file => file.name).join('、')}` : ''}，识别一次性任务目标。` },
      { title: '校验执行输入', text: `${rows ? `读取已保存的 ${rows} 条记录，保留原始行号并校验所需字段。` : '校验提示词中的查询对象和输出要求。'}${task.agentDecision ? `沿用工作台 Agent 的处理方案：${task.agentDecision.historicalIndexes.length ? `${task.agentDecision.historicalIndexes.length} 条超过 180 天的运单调用历史业务质量分析接口，其他记录使用常规能力。` : '超过 100 条运单，按普通批量任务处理，不调用历史业务质量分析接口。'}` : ''}` },
      { title: skill ? '加载执行能力' : '规划提示词执行', text: skill ? `${skill.name} v${skill.version}：${skill.description}${archive ? '按已确定的处理方案调用历史业务质量分析接口（演示）。' : ''}${tool && !files.length ? `查询日期 ${tool.date}。` : ''}` : '依据原始需求整理可用信息，生成一次性的处理结果。', tool: archive ? '历史业务质量分析接口' : skill?.name },
      { title: rows ? '批量处理' : '执行处理', text: rows ? `按每批 ${ordinaryTaskLimits.batchSize} 条处理，记录成功和失败，单条失败不影响后续记录。${standardSkill ? '仅历史记录调用历史业务质量分析接口，其他记录执行常规能力。' : ''}` : '围绕任务目标组织分析和结论。', tool: standardSkill ? `历史业务质量分析接口 / ${standardSkill.name}` : skill?.id },
      { title: '生成结果文件', text: rows ? '生成执行报告，将有效产物打包为 ZIP。' : '整理文字结论，按需求生成执行报告并打包为 ZIP。' },
      { title: '校验与归档', text: '核对输入、处理数量和文件清单，将产物保存至任务结果和下载页面。' },
    ],
  };
}

const csvCell = (value: string | number) => `"${String(value).replace(/^[=+@\-]/, "'$&").replace(/"/g, '""')}"`;
function base64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function resultFileBytes(file: TaskResultFile) {
  return file.encoding === 'base64' ? Uint8Array.from(atob(file.content), char => char.charCodeAt(0)) : strToU8(file.content);
}
export function formatFileSize(bytes: number) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

export function excelResult(name: string, rows: Record<string, string | number>[], sheetName = '执行结果'): TaskResultFile {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet(rows), sheetName);
  const bytes = write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: base64(new Uint8Array(bytes)), encoding: 'base64', size: bytes.byteLength };
}

export function createTaskResultPackage(name: string, files: TaskResultFile[]): TaskResultFile {
  const entries = Object.fromEntries(files.map(file => [isTaskDetailFile(file) ? `轨迹文件/${file.name}` : file.name, resultFileBytes(file)]));
  const archive = zipSync(entries);
  return { name: `${safeName(name).replace(/\.zip$/i, '')}.zip`, mimeType: 'application/zip', encoding: 'base64', content: base64(archive), size: archive.length };
}

export function ordinaryTaskResult(task: DailyTask, run: TaskRun, stopped = false): { text: string; files: TaskResultFile[] } {
  const records = taskRecords(task);
  const processed = stopped ? run.progress?.processed ?? 0 : records.length;
  const files: TaskResultFile[] = [];
  const report: Record<string, string | number>[] = [];
  const filled: Record<string, string | number>[] = [];
  const history = hasHistoryTaskIntent(run.prompt) || Boolean(task.agentDecision?.historicalIndexes.length);
  const spreadsheet = /填表|填写|补全|补充|制表|制作表格/.test(run.prompt);
  const queryDate = resolveAsyncTool(run.prompt, run.startedAt)?.date;
  const defaultDate = queryDate ?? chinaDate(run.startedAt - DAY);
  for (const [index, record] of records.entries()) {
    const error = taskRecordError(task, record, index);
    const plate = recordValue(record, ['车牌号', '车牌', '车辆号', '车辆牌照', 'plate']);
    const order = recordValue(record, ['运单号', '订单号', '货单号', '单号']);
    const service = task.agentDecision?.historicalIndexes.includes(index) || !task.attachments?.length && queryDate ? '历史业务质量分析接口' : '常规处理工具';
    const outputName = (hasHistoryTaskIntent(run.prompt) || service === '历史业务质量分析接口') && !error && index < processed ? `${safeName(order || plate)}_记录${index + 1}_轨迹.csv` : '';
    report.push({ 源文件: record.__sourceFile ?? '', 工作表: record.__sourceSheet ?? '', 原始行号: Number(record.__sourceRow ?? index + 2), 运单号: order, 车牌号: plate, 处理接口: service, 执行状态: index >= processed ? '未执行' : error ? '失败' : '成功', 失败原因: index >= processed ? '用户停止后未执行' : error, 输出文件: outputName });
    if (index >= processed || error) continue;
    if (outputName) {
      const rows: (string | number)[][] = [['运单号', '车牌号', '定位时间', '经度', '纬度', '速度', '航向', '地点', '数据性质']];
      const inputStartedAt = parseWaybillTimestamp(recordValue(record, waybillTimeFields));
      const startedAt = inputStartedAt ?? Date.parse(`${defaultDate}T08:00:00+08:00`);
      for (let point = 0; point < 37; point++) {
        const timestamp = startedAt + point * 600000;
        const time = chinaTimeFormat.format(timestamp);
        rows.push([order, plate, `${chinaDate(timestamp)} ${time}`, (121.3 - point * .032).toFixed(6), (31.1 - point * .025).toFixed(6), point === 18 || point === 36 ? 0 : 50 + point % 16, '西南', point === 0 ? '上海装货点' : point === 36 ? '杭州卸货点' : point === 18 ? '沿线服务区' : '沪杭运输线路', '演示仿真数据']);
      }
      const content = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
      files.push({ name: outputName, mimeType: 'text/csv;charset=utf-8', content, size: strToU8(content).length, detail: true });
    }
    const input = Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('__source')));
    filled.push(spreadsheet ? { ...input, 当前车辆位置: 'G60 沪昆高速·嘉兴服务区', 在途状态: '行程在途', 预计到达时间: new Date(run.startedAt + (120 + index % 120) * 60000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }), 在途异常: index % 17 === 0 ? '停车待核验' : '无', 数据性质: '演示仿真数据' } : { ...input, 校验结果: '字段读取完成', 数据性质: '演示处理结果' });
  }
  const success = report.filter(row => row.执行状态 === '成功').length;
  const failed = report.filter(row => row.执行状态 === '失败').length;
  const text = records.length
    ? `${stopped ? '任务已停止' : failed ? success ? '任务部分完成' : '任务执行失败' : '任务已完成'}（演示结果）。\n共 ${records.length} 条记录，已处理 ${processed} 条，成功 ${success} 条，失败 ${failed} 条，未执行 ${records.length - processed} 条。\n${history ? `结果包内包含 ${files.filter(file => file.detail).length} 份车辆轨迹数据，每份 37 个轨迹点。` : spreadsheet ? `已补全 ${success} 行车辆位置、在途状态、预计到达和异常字段。` : `已读取并校验 ${success} 行业务数据。`}\n${task.agentDecision ? `沿用工作台处理方案：${task.agentDecision.historicalIndexes.length} 条历史运单使用历史业务质量分析接口，其他记录使用常规能力（演示）。\n` : ''}${failed ? '失败原因：缺少有效车牌号；原始行号及失败原因见执行报告。\n' : ''}${success ? '产物已归档至任务结果和下载页面。' : '没有可用业务产物，请补充输入后重新执行。'}`
    : stopped ? '任务已停止，尚未生成有效结果。可重新执行。' : `任务已完成（演示结果）。\n执行目标：${run.prompt}\n已整理任务要求、处理范围和结论。${/风险|异常/.test(run.prompt) ? '\n建议先核验非计划停靠与轨迹缺失，再按时效影响确定处理顺序。' : '\n未附带业务数据，结果仅围绕输入要求整理，不读取其他项目数据。'}`;
  if (records.length && processed) {
    if (!history && filled.length) files.push(excelResult(`${safeName(task.name)}_处理结果.xlsx`, filled));
    files.push(excelResult('执行报告.xlsx', report));
  } else if (!records.length && !stopped && /文件|下载|导出|报告|表格/.test(run.prompt)) files.push(excelResult('执行报告.xlsx', [{ 任务标题: task.name, 执行需求: run.prompt, 执行结果: text, 数据性质: '演示结果' }]));
  if (files.length) {
    files.unshift(createTaskResultPackage(`${task.name}_${run.id.slice(-8)}_结果包.zip`, files));
  }
  return { text, files };
}

export function downloadTaskResult(file: TaskResultFile) {
  const bytes = resultFileBytes(file);
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: file.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
