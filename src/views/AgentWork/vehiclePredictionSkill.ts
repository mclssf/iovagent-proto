import instructions from '../../../public/skills/vehicle-loading-unloading-predict/SKILL.md?raw';

export const vehiclePredictionSkill = {
  id: 'vehicle-loading-unloading-predict',
  name: '车辆真实性装卸货地预测专家',
  description: '从对话或 Excel 提取参数，依据客户标签地点关键词预测疑似装卸货地点。',
  instructions,
};

export function hasVehiclePredictionIntent(text: string) {
  if (/已确认.{0,8}装卸|写入|回写/.test(text)) return false;
  return /真实(?:性)?(?:装货|卸货|装卸货)(?:地|地点)|装卸货地点预测|停车点推测|轨迹匹配\s*POI|vehicle-loading-unloading-predict|车辆真实性装卸货地预测专家/i.test(text);
}

// The prototype has no etaPredit contract or spreadsheet execution service yet.
// Preserve the input and disclose this boundary before any legacy demo handler runs.
export function predictionSetupMessage(fileNames: string[]) {
  return `[Loaded Skill: 车辆真实装卸货地点预测]\n\n已加载“${vehiclePredictionSkill.name}”。\n${fileNames.length ? `已收到附件：${fileNames.join('、')}。文件尚未解析，工作表、表头映射和有效行数尚未核验。\n` : ''}\n请提供车牌号或 vid、开始和结束时间、停车时长阈值，以及待预测一侧的客户标签（注明发货/收货）或明确地点描述和匹配阈值。已有装货/卸货地址请同时提供：已有地址的一侧将跳过，不覆盖原地址。\n\n地点关键词仅从该侧标签或明确地点描述提取，公司名称不用于推导地点；归属不明、标签不足或地点冲突时需要补充确认。\n\n当前状态：等待接入真实预测服务。此原型尚未配置经核验的 etaPredit 工具契约及 Excel 处理服务，本次调用 0 次、重试 0 次，没有产生预测坐标、POI、停车时间或下载结果；此状态不属于接口 NOT_FOUND。\n\n结果应使用“预测/疑似/待核验”，不代表已发生装卸货事实。`;
}
