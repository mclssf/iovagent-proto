import type { DailyTask, TaskResultFile, TaskRun } from './dailyTasks';
import { createTaskResultPackage, taskRecords } from './ordinaryTasks';
import { recordValue } from './taskInput';
import { evidenceFieldAliases, evidenceInputError, evidenceTime, parseEvidenceInput } from './waybillEvidence';
import type { EvidenceRenderer } from './waybillEvidenceCapture';
import { createEvidenceWorkbook, evidenceResultColumns } from './waybillEvidenceWorkbook';
import type { EvidenceResultRow } from './waybillEvidenceWorkbook';

const safeName = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 50);
const base64 = (bytes: Uint8Array) => {
  let result = '';
  for (let index = 0; index < bytes.length; index += 8192) result += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(result);
};

export async function createWaybillEvidenceResult(
  task: DailyTask, run: TaskRun, signal: AbortSignal,
  onProgress: (text: string) => void,
  factory: (signal: AbortSignal) => Promise<EvidenceRenderer> = async signal => (await import('./waybillEvidenceCapture')).createEvidenceRenderer(signal),
  workbookFactory: (rows: EvidenceResultRow[]) => TaskResultFile = createEvidenceWorkbook,
) {
  const records = taskRecords(task);
  const results: EvidenceResultRow[] = [];
  const images: NonNullable<TaskRun['files']> = [];
  const enterprise = task.enterpriseName || '当前企业';
  let renderer: EvidenceRenderer | undefined;
  let setupError = '';
  let processed = 0;
  try {
    if (!signal.aborted && records.some(record => !evidenceInputError(record))) {
      try { renderer = await factory(signal); } catch (error) { setupError = (error as Error).message; }
    }
    for (const [index, record] of records.entries()) {
      const source = Object.fromEntries(Object.entries(evidenceFieldAliases).map(([field, aliases]) => [field, recordValue(record, aliases)]));
      const values: EvidenceResultRow['values'] = {
        ...source, 执行结果: '未执行：任务已停止', 生成图片路径: '',
        ...Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('__source') && !evidenceResultColumns.includes(key))),
        原始装货地点: source.装货地点, 原始装货时间: source.装货时间, 原始卸货地点: source.卸货地点, 原始卸货时间: source.卸货时间,
        企业名称: enterprise, 源文件: record.__sourceFile || '', 工作表: record.__sourceSheet || '', 原始行号: Number(record.__sourceRow || index + 2),
      };
      const result: EvidenceResultRow = { values, changedFields: [] };
      results.push(result);
      if (signal.aborted) continue;
      onProgress(`正在生成第 ${index + 1} / ${records.length} 条运单的水印轨迹截图；已生成 ${images.length} 张。`);
      try {
        const input = parseEvidenceInput(record);
        if (!renderer) throw new Error(setupError || '地图截图服务不可用');
        const { trip, bytes } = await renderer.render(input, index, enterprise, run.id);
        if (signal.aborted) { values.执行结果 = '未执行：任务已停止，当前截图未归档'; continue; }
        const fileName = `轨迹截图/${String(index + 1).padStart(3, '0')}_${safeName(trip.order)}_${safeName(trip.plate)}_轨迹留证.jpg`;
        images.push({ name: fileName, mimeType: 'image/jpeg', content: base64(bytes), encoding: 'base64', size: bytes.length });
        const changes = {
          装货地点: trip.loading.inferred || Boolean(input.loading.poi && trip.loading.poi !== input.loading.poi),
          装货时间: trip.loading.timeInferred || trip.loading.time !== input.loading.time,
          卸货地点: trip.unloading.inferred || Boolean(input.unloading.poi && trip.unloading.poi !== input.unloading.poi),
          卸货时间: trip.unloading.timeInferred || trip.unloading.time !== input.unloading.time,
        };
        result.changedFields = Object.keys(changes).filter(field => changes[field]);
        Object.assign(values, {
          运单号: trip.order, 车牌号: trip.plate, 装货地点: trip.loading.poi, 装货时间: evidenceTime(trip.loading.time), 卸货地点: trip.unloading.poi, 卸货时间: evidenceTime(trip.unloading.time),
          执行结果: '成功', 生成图片路径: fileName,
          装货地经度GCJ02: trip.loading.coordinate[0], 装货地纬度GCJ02: trip.loading.coordinate[1], 装货地来源: changes.装货地点 ? '推测／修正' : '用户提供', 装货时间来源: changes.装货时间 ? '推测／修正' : '用户提供',
          卸货地经度GCJ02: trip.unloading.coordinate[0], 卸货地纬度GCJ02: trip.unloading.coordinate[1], 卸货地来源: changes.卸货地点 ? '推测／修正' : '用户提供', 卸货时间来源: changes.卸货时间 ? '推测／修正' : '用户提供',
          道路里程km: Number((trip.distance / 1000).toFixed(1)), 推断依据: trip.basis, 核验状态: result.changedFields.length ? '需业务核验' : '原始信息保留', 推测修正字段: result.changedFields.join('、'),
        });
      } catch (error) {
        if (signal.aborted) { values.执行结果 = '未执行：任务已停止，当前记录未完成'; continue; }
        values.执行结果 = `失败：${(error as Error).message}`;
      }
      processed++;
    }
  } finally { renderer?.destroy(); }
  const failed = results.filter(row => String(row.values.执行结果).startsWith('失败：')).length;
  const success = images.length;
  const files = [workbookFactory(results), ...images];
  const text = `### ${signal.aborted ? '任务已停止' : failed ? success ? '运单补全留证部分完成' : '运单补全留证未完成' : '运单补全留证已完成'}\n\n共 ${records.length} 条，成功 ${success} 条，失败 ${failed} 条，未执行 ${records.length - processed} 条。已生成 ${success} 张带水印的轨迹图片。\n\n${success ? `以用户提供的装卸货端为锚点，补全另一端的地点与时间。监控运输轨迹截图中的装卸货 POI / 经纬度、运输时间区间、车牌号、企业“${enterprise}”和“兴路车联”标识均叠加在地图内。` : '未生成有效截图；请在 ZIP 内的运单结果表查看逐行原因，补充输入或检查高德服务后重新执行。'}\n\n结果 ZIP 已归档到“下载”。运单信息、执行结果和图片路径已合并至运单结果表，浅黄色标识推测或修正字段。原始输入与字段来源保留供核验。`;
  // Keep only the ZIP in browser persistence; avoid storing every image a second time.
  return { text, files: [createTaskResultPackage(`${task.name}_${run.id.slice(-8)}`, files)], progress: { total: records.length, processed, success, failed } };
}
