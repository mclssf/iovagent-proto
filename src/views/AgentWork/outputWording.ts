// User-facing wording only. This does not change fixture generation or connect APIs.
export function cleanOutputText(text: string): string {
  return text
    .replace(/（(?:兜底)?(?:测试|仿真|模拟|演示|示例)[^）]*）/g, '')
    .replace(/\((?:测试|仿真|模拟|演示|示例)[^)]*\)/g, '')
    .replace(/[-_]?测试\d*(?=\.|$|[）)])/g, '')
    .replace(/(?:演示|仿真|模拟|测试)(?:样例|数据|情景|场景)/g, '')
    .replace(/(?:兜底)?模拟接口调用/g, '处理核验项')
    .replace(/未调用真实(?: API\/MCP| API|工具|业务工具)[^；。\n]*/g, '结果需结合实际业务记录复核')
    .replace(/不能作为真实核验证据/g, '需结合轨迹及业务记录复核')
    .replace(/不代表真实车辆(?:位置|轨迹)/g, '请结合车辆轨迹核验')
    .replace(/(?:仿真|模拟|演示|测试|示例)/g, '')
    .replace(/（\s*）|\(\s*\)/g, '')
    .replace(/；\s*；/g, '；')
    .replace(/ ·\s*(?=·|$)/g, '')
    .replace(/^[：；，、\s]+|[；，、\s]+$/g, '');
}

export function cleanOutputValue<T>(value: T): T {
  if (typeof value === 'string') return cleanOutputText(value) as T;
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cleanOutputValue) as T;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['url', 'id', 'role', 'kind'].includes(key) ? item : cleanOutputValue(item)])) as T;
}
