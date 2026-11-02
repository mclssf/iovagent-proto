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

// Integration readiness copy; frontend fixtures do not invoke a production tool.
export function predictionSetupMessage(fileNames: string[]) {
  return `已加载“${vehiclePredictionSkill.name}”。\n${fileNames.length ? `已收到附件：${fileNames.join('、')}。\n` : ''}请提供车牌号或 vid、开始和结束时间、停车时长阈值，以及待预测一侧的客户标签或明确地点描述和匹配阈值。已有装卸货地址的一侧将跳过，不覆盖原地址。\n地点归属不明、标签不足或地点冲突时，需要补充确认；预测结果需结合业务记录核验。`;
}
