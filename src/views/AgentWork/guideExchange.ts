import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { useGuideLedger } from '@/pinia/guideLedger';
import { findGuide, guideSubjects, inspectTrip, lookupGuide, type GuideId, type GuideRow } from './guideScenarios';
import { inspectPhoto, isGuidePhoto } from './guidePhotos';
import type { ChatMessage, SummonedSkill } from './interface';
import type { TaskAttachment } from './dailyTasks';
import { isTaskExcel } from './ordinaryTasks';
import { recordValue } from './taskInput';

interface Exchange {
  skill: SummonedSkill; text: string; files: File[]; attachments: TaskAttachment[]; context?: ChatMessage['guideContext'];
  projectId: string; conversationId?: string;
  progress: (step: NonNullable<ChatMessage['steps']>[number]) => Promise<void>;
}
const checks: Record<GuideId, string> = {
  'guide-evidence': '比对装卸围栏与停靠时段', 'guide-mileage': '比对申报里程与本票货程',
  'guide-signin': '交叉核对签到与门禁', 'guide-offline': '核对定位中断与恢复时刻',
  'guide-stop': '核对停靠点与授权场站', 'guide-shuttle': '配对装卸节点与往返趟次',
  'guide-photo': '核验装卸照片', 'guide-gate': '核对进场条件与运输记录',
};
export const guideFollowup = (text: string, previous: ChatMessage['guideContext'], files: File[]) => previous &&
  (previous.waiting && (files.length > 0 || guideSubjects(text).length > 0) ||
    /^(?:请|帮我|那|再)?(?:看一下)?(?:依据|为什么|展开|详情|下一步|怎么办|需要哪些|如何处理|生成截图|截图留证|打包留证|整理提醒|提醒司机|提醒调度|查看地图|继续核查|是否到过|有没有去过)/.test(text.trim()));

export async function guideExchange(input: Exchange): Promise<ChatMessage> {
  const { skill, text, files, context, progress } = input;
  const scene = findGuide(skill.id)!;
  const photo = scene.id === 'guide-photo';
  const excel = input.attachments.filter(isTaskExcel);
  const images = files.filter(isGuidePhoto);
  const reply = (text: string, rows: GuideRow[], waiting = false): ChatMessage => ({ role: 'agent', text, guideContext: { skill, rows, waiting, batch: !!excel.length || context?.batch } });
  if (files.some(f => !isTaskExcel(f) && !(photo && isGuidePhoto(f)))) return reply(photo ? '请上传 JPG、PNG 或 WebP 图片；批量核验可同时上传 Excel。' : '批量查询支持 .xls 和 .xlsx，请重新选择文件。', [], true);
  const bad = excel.find(a => a.parseError || !a.records?.length);
  if (bad) return reply('无法读取「' + bad.name + '」：' + (bad.parseError || '未找到数据行') + '。请检查表头和内容后重新上传。', [], true);
  const subjects = guideSubjects(text);
  const rows = excel.length ? excel.flatMap(a => a.records!).map(r => ({ ...r })) : subjects.length ? subjects : context?.rows?.map(r => ({ ...r })) ?? [];
  if (!rows.length) return reply('请补充运单号或车牌号，例如 ' + (scene.id === 'guide-shuttle' ? '苏E76325' : 'YD261002') + '；也可以上传运单或车辆表格。', [], true);
  if (photo && !images.length && (excel.length || !context || !rows.every(r => r['图片检查']))) return reply('请上传这批运单的装卸照片（JPG、PNG 或 WebP）。多票照片请在表格「图片文件名」列逐行填写对应文件名，并一并上传。', rows.map(({ 图片检查, 图片信息, ...r }) => r), true);
  if (images.length > 20 || new Set(images.map(i => i.name)).size < images.length) return reply('每次最多上传 20 张文件名唯一的图片，请拆分或重命名后重试。', rows, true);
  await progress(excel.length ? { title: '核对表格输入', text: '核对 ' + excel.length + ' 份表格中的 ' + rows.length + ' 条输入，保留原表行号。' }
    : { title: '匹配运输记录', text: '按运单号或车牌定位本次核查涉及的运输记录。' });
  let preview: ChatMessage['guidePhoto'];
  if (images.length) {
    await progress({ title: checks['guide-photo'], text: '检查 ' + images.length + ' 张照片的可读性，并按文件名关联运单。', skill: skill.name });
    if (!excel.length && rows.length === 1 && images.length > 1) {
      const base = { ...rows[0] }; rows.splice(0, 1, ...images.map(im => ({ ...base, 图片文件名: im.name })));
    }
    const material = new Map<string, { 图片检查: string; 图片信息: string; 画面内容?: string; 核对事项?: string; url?: string }>();
    for (const im of images) {
      try { material.set(im.name, await inspectPhoto(im)); }
      catch { material.set(im.name, { 图片检查: '', 图片信息: '无法解码或文件超限：' + im.name }); }
    }
    for (const row of rows) {
      const name = recordValue(row, ['图片文件名','照片名称','照片','文件名']) || (rows.length === 1 && images.length === 1 ? images[0]!.name : '');
      const match = material.get(name);
      Object.assign(row, { 图片文件名: name, 图片检查: match?.图片检查 || '', 图片信息: match?.图片信息 || '未匹配上传图片：' + (name || '未填写文件名'), 画面内容: match?.画面内容 || '', 核对事项: match?.核对事项 || '' });
      if (match?.url && rows.length === 1) preview = { name, url: match.url };
    }
  }
  const explicitZip = scene.id === 'guide-evidence' && /^(?:请|帮我)?(?:生成截图|打包留证|截图留证)/.test(text);
  if (excel.length || context?.batch || rows.length > 1 || explicitZip) {
    const evidence = scene.id === 'guide-evidence';
    await progress({ title: '编排普通任务', text: '按原始输入逐条安排「' + skill.name + '」，' + (evidence ? '汇总结果表和轨迹截图。' : '将各条记录的结果汇总到 Excel。'), skill: skill.name });
    // Preserve source sheet and row coordinates; never substitute example identifiers for uploads.
    let offset = 0;
    const attachments = excel.map(a => ({ ...a, records: rows.slice(offset, offset += a.records!.length) }));
    const taskId = useAgentDailyTasks().saveTask(input.projectId, { name: scene.name, trigger: 'once', prompt: text.trim() || scene.recommendedPrompt,
      attachments, guideSkillId: scene.id, ...(!attachments.length ? { guideInputs: rows } : {}) }, undefined,
      { origin: 'workbench', conversationId: input.conversationId });
    return { role: 'agent', text: '已将 ' + rows.length + ' 条输入交给「做任务」逐条核查。' + (evidence ? '完成后下载结果表和水印轨迹截图 ZIP。' : '完成后可下载结果 Excel，未匹配的记录会标明原因。'), dailyTaskId: taskId };
  }
  const matched = lookupGuide(rows[0]!);
  if (!matched.length) return reply('未找到与「' + Object.values(rows[0]!).slice(0, 2).join(' / ') + '」一致的运输记录。请核对编号或车牌后重试。', [], true);
  if (!images.length) await progress({ title: checks[scene.id], text: '关联 ' + matched.length + ' 票运输记录。' + scene.description, skill: skill.name });
  await progress({ title: '整理核查结果', text: photo ? '汇总照片检查结果和需人工核对的事项。' : '按运单整理事实依据、核查结论和待核事项。' });
  const ledger = useGuideLedger();
  if (scene.id === 'guide-shuttle') ledger.register(matched.map(t => t.id));
  const results = matched.map(t => ({ t, f: inspectTrip(scene.id, t, rows[0], text) }));
  const reminder = /提醒司机|提醒调度|整理提醒/.test(text) && ['guide-offline','guide-stop'].includes(scene.id);
  return { ...reply(reminder ? '调度提醒草稿（未发送）' : scene.name, rows),
    result: results.map(({ t, f }) => {
      const lead = t.id + ' · ' + t.plate + '\n';
      if (reminder) return lead + '请跟进' + t.plate + '运输情况：' + f.conclusion + '。' + f.facts + '\n' + f.action;
      if (context && /依据|为什么|展开/.test(text)) return lead + '核查依据：' + f.facts + '\n首个作业节点：' + t.points[0]!.from + '；' + f.action;
      if (context && /下一步|怎么办|需要哪些|如何处理/.test(text)) return lead + '处理建议：' + f.action + '\n待核事项：' + f.conclusion;
      return lead + f.conclusion + '\n' + f.facts + '\n' + f.action;
    }).join('\n\n'),
    title: reminder ? '调度提醒草稿（未发送）' : scene.name, status: '已完成',
    guidePhoto: preview, guideMaps: photo ? [] : results.filter(({ t }) => ledger.orders.some(o => o.id === t.id)).map(({ t, f }) => ({ order: t.id, event: f.point, label: t.id + ' · ' + t.points[f.point - 1]!.site.name })) };
}
