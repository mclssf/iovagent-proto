import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { useGuideLedger } from '@/pinia/guideLedger';
import { findGuide, guideSubjects, inspectTrip, lookupGuide, type GuideRow } from './guideScenarios';
import { inspectPhoto, isGuidePhoto } from './guidePhotos';
import type { ChatMessage, SummonedSkill } from './interface';
import type { TaskAttachment } from './dailyTasks';
import { isTaskExcel } from './ordinaryTasks';
import { recordValue } from './taskInput';

interface Exchange {
  skill: SummonedSkill; text: string; files: File[]; attachments: TaskAttachment[]; context?: ChatMessage['guideContext'];
  projectId: string; conversationId?: string; current: () => boolean;
}
export const guideFollowup = (text: string, previous: ChatMessage['guideContext'], files: File[]) => previous &&
  (previous.waiting && (files.length > 0 || guideSubjects(text).length > 0) ||
    /^(?:请|帮我|那|再)?(?:看一下)?(?:依据|为什么|展开|详情|下一步|怎么办|需要哪些|如何处理|生成截图|截图留证|打包留证|整理提醒|提醒司机|提醒调度|查看地图|继续核查|是否到过|有没有去过)/.test(text.trim()));

export async function guideExchange(input: Exchange): Promise<ChatMessage> {
  const { skill, text, files, context, current } = input;
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
  let preview: ChatMessage['guidePhoto'];
  if (images.length) {
    if (images.length > 20 || new Set(images.map(i => i.name)).size < images.length) return reply('每次最多上传 20 张文件名唯一的图片，请拆分或重命名后重试。', rows, true);
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
  if (!current()) throw new Error('会话已切换');
  const explicitZip = scene.id === 'guide-evidence' && /^(?:请|帮我)?(?:生成截图|打包留证|截图留证)/.test(text);
  if (excel.length || context?.batch || rows.length > 1 || explicitZip) {
    const evidence = scene.id === 'guide-evidence';
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
    steps: [{ title: '匹配运输记录', text: '按输入标识关联 ' + matched.length + ' 票运输记录。' },
      { title: '核对业务依据', text: scene.description, skill: scene.name }],
    guidePhoto: preview, guideMaps: photo ? [] : results.filter(({ t }) => ledger.orders.some(o => o.id === t.id)).map(({ t, f }) => ({ order: t.id, event: f.point, label: t.id + ' · ' + t.points[f.point - 1]!.site.name })) };
}
