import { hasWaybillEvidenceIntent } from './waybillEvidence';

export const ordinaryTaskLimits = {
  batchThresholdRows: 100,
  maxRows: 2000,
  maxFileBytes: 20 * 1024 * 1024,
  maxFiles: 10,
  batchSize: 30,
  maxConcurrentRuns: 3,
};

export const excelParsingSkill = {
  id: 'excel-parsing', name: 'Excel 解析', version: '1.0.0',
  description: '读取工作表、对齐运单字段，提取开始时间并统计实际运单条数。',
  batchThresholdRows: ordinaryTaskLimits.batchThresholdRows, archiveAgeDays: 180,
};

export const ordinaryTaskSkills = {
  evidence: { id: 'waybill-reconstruction-evidence', name: '运单补全与轨迹留证', version: '1.0.0', description: '以已知装卸货端为锚点，模拟反推缺失地点与时间，逐单生成带企业水印的高德地图轨迹图片。', batchThresholdRows: ordinaryTaskLimits.batchThresholdRows },
  history: { id: 'history-business-quality', name: '历史业务质量分析', version: '1.0.0', description: '批量查询运单历史轨迹，生成轨迹明细和执行报告。', batchThresholdRows: ordinaryTaskLimits.batchThresholdRows },
  trajectory: { id: 'vehicle-trajectory-query', name: '车辆轨迹查询', version: '1.0.0', description: '查询非归档时间范围内的车辆轨迹，生成轨迹结果与执行报告。', batchThresholdRows: ordinaryTaskLimits.batchThresholdRows },
  spreadsheet: { id: 'logistics-spreadsheet', name: '物流表格', version: '1.0.0', description: '识别表格字段，补全车辆位置、在途状态、预计到达和异常信息。', batchThresholdRows: ordinaryTaskLimits.batchThresholdRows },
  analysis: { id: 'logistics-data-analysis', name: '经营数据分析', version: '1.0.0', description: '校验业务表格，汇总数据质量及处理结果。', batchThresholdRows: ordinaryTaskLimits.batchThresholdRows },
};

export const hasHistoryTaskIntent = (prompt: string) => /轨迹|行驶路线/.test(prompt) && /查|调取|检索|获取|导出|打包|生成.*(?:明细|文件)|(?:明细|文件).*生成/.test(prompt);

export function resolveOrdinarySkill(prompt: string, hasExcel: boolean, usesArchive = false) {
  if (hasWaybillEvidenceIntent(prompt)) return ordinaryTaskSkills.evidence;
  if (usesArchive) return ordinaryTaskSkills.history;
  if (hasHistoryTaskIntent(prompt)) return ordinaryTaskSkills.trajectory;
  if (/填表|填写|补全|补充|制表|制作表格/.test(prompt)) return ordinaryTaskSkills.spreadsheet;
  return hasExcel ? ordinaryTaskSkills.analysis : null;
}
