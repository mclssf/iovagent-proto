import type { DailyTask, TaskRun } from './dailyTasks';
import { createTaskResultPackage, excelResult, taskRecords } from './ordinaryTasks';
import { evidenceInputError, evidenceTime, parseEvidenceInput } from './waybillEvidence';
import type { EvidenceRenderer } from './waybillEvidenceCapture';

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
) {
  const records = taskRecords(task);
  const reports: Record<string, string | number>[] = [];
  const completed: Record<string, string | number>[] = [];
  const images: NonNullable<TaskRun['files']> = [];
  const enterprise = task.enterpriseName || '演示企业';
  let renderer: EvidenceRenderer | undefined;
  let setupError = '';
  let processed = 0;
  try {
    if (!signal.aborted && records.some(record => !evidenceInputError(record))) {
      try { renderer = await factory(signal); } catch (error) { setupError = (error as Error).message; }
    }
    for (const [index, record] of records.entries()) {
      const report: Record<string, string | number> = { 源文件: record.__sourceFile || '', 原始行号: Number(record.__sourceRow || index + 2), 运单号: record.运单号 || record.订单号 || '', 车牌号: record.车牌号 || record.车牌 || '', 执行状态: '未执行', 失败原因: '', 截图文件: '', 数据性质: '演示推断，需业务核验' };
      reports.push(report);
      if (signal.aborted) { report.失败原因 = '任务已停止，未生成截图'; continue; }
      onProgress(`正在生成第 ${index + 1} / ${records.length} 条运单的水印轨迹截图；已生成 ${images.length} 张。`);
      try {
        const input = parseEvidenceInput(record);
        if (!renderer) throw new Error(setupError || '地图截图服务不可用');
        const { trip, bytes } = await renderer.render(input, index, enterprise, run.id);
        if (signal.aborted) { report.失败原因 = '任务已停止，当前截图未归档'; continue; }
        const fileName = `轨迹截图/${String(index + 1).padStart(3, '0')}_${safeName(trip.order)}_${safeName(trip.plate)}_轨迹留证.jpg`;
        images.push({ name: fileName, mimeType: 'image/jpeg', content: base64(bytes), encoding: 'base64', size: bytes.length });
        Object.assign(report, { 运单号: trip.order, 车牌号: trip.plate, 执行状态: '成功', 截图文件: fileName });
        completed.push({ ...Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('__source'))),
          补全后装货地POI: trip.loading.poi, 装货地经度GCJ02: trip.loading.coordinate[0], 装货地纬度GCJ02: trip.loading.coordinate[1], 补全后装货时间: evidenceTime(trip.loading.time), 装货地来源: trip.loading.inferred ? '规则推断（演示）' : '用户提供', 装货时间来源: trip.loading.timeInferred ? '规则推断（演示）' : '用户提供',
          补全后卸货地POI: trip.unloading.poi, 卸货地经度GCJ02: trip.unloading.coordinate[0], 卸货地纬度GCJ02: trip.unloading.coordinate[1], 补全后卸货时间: evidenceTime(trip.unloading.time), 卸货地来源: trip.unloading.inferred ? '规则推断（演示）' : '用户提供', 卸货时间来源: trip.unloading.timeInferred ? '规则推断（演示）' : '用户提供',
          道路里程km: Number((trip.distance / 1000).toFixed(1)), 企业名称: enterprise, 推断依据: trip.basis, 核验状态: '演示推断，非真实凭证', 截图文件: fileName, 源文件: report.源文件, 原始行号: report.原始行号,
        });
      } catch (error) {
        if (signal.aborted) { report.失败原因 = '任务已停止，当前记录未完成'; continue; }
        Object.assign(report, { 执行状态: '失败', 失败原因: (error as Error).message });
      }
      processed++;
    }
  } finally { renderer?.destroy(); }
  const failed = reports.filter(row => row.执行状态 === '失败').length;
  const success = images.length;
  const files = [excelResult('执行报告.xlsx', reports), ...images];
  if (completed.length) files.push(excelResult('运单补全明细.xlsx', completed, '补全运单'));
  const text = `### ${signal.aborted ? '任务已停止' : failed ? success ? '运单补全留证部分完成' : '运单补全留证未完成' : '运单补全留证已完成'}\n\n共 ${records.length} 条，成功 ${success} 条，失败 ${failed} 条，未执行 ${records.length - processed} 条。已生成 ${success} 张带水印的轨迹图片。\n\n${success ? `以用户提供的装卸货端为锚点，模拟补全另一端的地点与时间。图片包含装卸货 POI / 经纬度、运输时间区间、车牌号、企业“${enterprise}”和“兴路车联”文字品牌标识。` : '未生成有效截图；请在 ZIP 内的执行报告查看逐行原因，补充输入或检查高德服务后重新执行。'}\n\n结果 ZIP 已归档到“下载”。已知值原样保留，推断字段单独标注；模拟轨迹不代表真实车辆行驶记录，不能直接作为真实审计凭证。`;
  // Keep only the ZIP in browser persistence; avoid storing every image a second time.
  return { text, files: [createTaskResultPackage(`${task.name}_${run.id.slice(-8)}`, files)], progress: { total: records.length, processed, success, failed } };
}
