import type { DailyTask, TaskAttachment, TaskResultFile, TaskRun } from './dailyTasks';

const DAY = 86400000;
const chinaDate = (value: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);

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

// Routing uses the selected tool's execution mode, before synchronous location and spreadsheet demos.
const tools = [{
  id: 'vehicle.track.archive', name: '历史轨迹归档查询', execution: 'async' as const,
  matches: (prompt: string, now: number) => /查|检索|调取|获取|导出|帮我|请/.test(prompt) && /轨迹|行驶路线/.test(prompt) && Boolean(archiveDate(prompt, now)),
}];

export function resolveAsyncTool(prompt: string, now = Date.now()) {
  const tool = tools.find((item) => item.matches(prompt, now));
  return tool ? { id: tool.id, name: tool.name, execution: tool.execution, date: archiveDate(prompt, now)! } : null;
}

export function extractTaskPlates(prompt: string) {
  return [...new Set(prompt.toUpperCase().match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/g) ?? [])];
}

export function ordinaryTaskName(prompt: string) {
  const plate = extractTaskPlates(prompt)[0];
  return resolveAsyncTool(prompt) ? `${plate ?? '车辆'}历史轨迹查询` : prompt.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function mergeTaskAttachments(existing: TaskAttachment[], incoming: TaskAttachment[]) {
  const files = [...existing];
  for (const file of incoming) {
    if (files.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) continue;
    if (file.size <= 0) throw new Error(`“${file.name}”为空文件，请重新选择`);
    if (file.size > 20 * 1024 * 1024) throw new Error('单个附件不能超过 20 MB');
    files.push({ name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });
  }
  if (files.length > 10) throw new Error('最多上传 10 个附件');
  return files;
}

export function makeOrdinaryRun(task: DailyTask): TaskRun {
  const now = Date.now();
  const tool = resolveAsyncTool(task.prompt, now);
  const files = task.attachments ?? [];
  const jobId = `JOB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  return {
    id: `run-${crypto.randomUUID()}`, startedAt: now, source: task.origin === 'workbench' ? 'workbench' : 'manual',
    status: 'running', prompt: task.prompt, toolJobId: jobId, activeStep: 0, nextStepAt: now + ordinaryStepDelay(), result: '',
    steps: [
      { title: '接收任务', text: `已保存执行指令${files.length ? `和 ${files.length} 个附件：${files.map((file) => file.name).join('、')}` : ''}。本任务只执行一次。` },
      { title: '规划执行', text: tool ? `${tool.date} 的轨迹需调用异步归档工具，采用“提交任务 → 等待回调 → 校验结果”的流程。` : '根据提示词与附件上下文规划一次性处理流程，不订阅运单事件或重复调度。' },
      { title: '提交异步工具', text: `任务编号 ${jobId}，已进入演示队列。`, tool: tool ? `${tool.name} · ${tool.id}` : '普通任务执行 · agent.task.once' },
      { title: '等待工具结果', text: '工具正在处理，完成后通过模拟回调返回结果；离开此页面不影响本次演示执行。' },
      { title: '校验返回结果', text: '核对任务编号、查询对象及返回字段，整理文字结果和下载附件。' },
    ],
  };
}

export const ordinaryStepDelay = () => 4000 + Math.round(Math.random() * 2000);
const csvCell = (value: string | number) => `"${String(value).replace(/^[=+@\-]/, "'$&").replace(/"/g, '""')}"`;

export function ordinaryTaskResult(task: DailyTask, run: TaskRun): { text: string; files: TaskResultFile[] } {
  const tool = resolveAsyncTool(run.prompt, run.startedAt);
  const plates = extractTaskPlates(run.prompt);
  if (tool && plates.length) {
    const rows: (string | number)[][] = [['车牌号', '定位时间（北京时间）', '经度', '纬度', '速度（km/h）', '航向', '地点', '数据性质']];
    for (const plate of plates) {
      for (let index = 0; index < 37; index++) {
        const minutes = 8 * 60 + index * 10;
        rows.push([plate, `${tool.date} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`, (121.3 - index * .032).toFixed(6), (31.1 - index * .025).toFixed(6), index === 18 || index === 36 ? 0 : 50 + index % 16, '西南', index === 0 ? '上海装货点' : index === 36 ? '杭州卸货点' : index === 18 ? '沿线服务区' : '沪杭运输线路', '演示仿真数据']);
      }
    }
    return {
      text: `历史轨迹查询完成（演示仿真数据）。\n车辆：${plates.join('、')}\n查询日期：${tool.date}；返回时段：08:00–14:00（北京时间）。\n返回 ${plates.length * 37} 个轨迹点，每车 37 个点，包含定位时间、坐标、速度、航向与地点。\n仿真线路：上海 → 杭州；11:00 有服务区停靠记录。结果已校验，可下载明细，不代表真实车辆轨迹。`,
      files: [{ name: `${plates.length === 1 ? plates[0] : `${plates.length}辆车`}_历史轨迹_${tool.date}.csv`, mimeType: 'text/csv;charset=utf-8', content: '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') }],
    };
  }
  const names = (task.attachments ?? []).map((file) => file.name);
  const text = `普通任务执行完成（演示）。\n执行要求：${run.prompt}\n输入附件：${names.length ? names.join('、') : '无'}\n已完成任务提交、异步等待与结果回传。${tool && !plates.length ? '\n附件中的车牌尚未接入真实解析，未生成车辆轨迹明细。' : '\n本原型返回模拟处理回执，未调用真实业务工具或解析附件内容。'}`;
  const wantsFile = names.length > 0 || /文件|下载|导出|报告|表格/.test(run.prompt);
  return { text, files: wantsFile ? [{ name: `${task.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')}_执行结果.txt`, mimeType: 'text/plain;charset=utf-8', content: text }] : [] };
}

export function downloadTaskResult(file: TaskResultFile) {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
