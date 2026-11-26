import { strokeIconPaths } from './strokeIconPaths';
import type { DailyTask, TaskRun } from './dailyTasks';

type MetricTone = 'blue' | 'emerald' | 'orange' | 'red' | 'slate';

interface TaskMetric {
  label: string;
  tone: MetricTone;
  value: string;
}

interface TaskOutput {
  date: string;
  footer: string;
  id: string;
  metrics: TaskMetric[];
  rows: { label: string; value: string }[];
  summary: string;
  title: string;
}

interface LongTask {
  description: string;
  executions: number;
  history: TaskOutput[];
  icon: string;
  id: string;
  lastRun: string;
  name: string;
  nextRun: string;
  schedule: string;
  scheduleShort: string;
  status: string;
}

const longTasks: LongTask[] = [
  {
    id: 'daily-risk-report',
    name: '每日异常报告',
    scheduleShort: '每天 18:00',
    schedule: '每天 18:00 自动执行',
    description: '汇总当日在途异常风险，输出高风险运单、异常类型、集中线路和处置建议，供物流负责人晚间复盘。',
    executions: 32,
    lastRun: '07-23 18:00',
    nextRun: '今天 18:00',
    status: '运行中',
    icon: strokeIconPaths.file,
    history: [
      {
        id: 'report-0723',
        date: '2026-07-23 · 18:00',
        title: '7 月 23 日在途异常风险报告',
        summary: '今日监控 126 单，识别异常 18 单，其中高风险 7 单；异常主要集中在华东至华南干线。',
        metrics: [
          { label: '监控运单', value: '126', tone: 'slate' },
          { label: '异常运单', value: '18', tone: 'orange' },
          { label: '高风险', value: '7', tone: 'red' },
        ],
        rows: [
          { label: '重点异常', value: '非计划物流园长停 3 单、GPS 轨迹异常 2 单、严重晚点 2 单' },
          { label: '集中线路', value: '上海嘉定 → 广州黄埔，异常 5 单' },
          { label: '承运商', value: '安捷物流高风险 3 单，已通知值班负责人复核' },
        ],
        footer: '报告已生成并同步至项目群，7 条高风险运单已进入人工复核队列。',
      },
      {
        id: 'report-0722',
        date: '2026-07-22 · 18:00',
        title: '7 月 22 日在途异常风险报告',
        summary: '今日监控 119 单，识别异常 14 单，其中高风险 5 单；整体异常率较前日下降 1.8 个百分点。',
        metrics: [
          { label: '监控运单', value: '119', tone: 'slate' },
          { label: '异常运单', value: '14', tone: 'orange' },
          { label: '高风险', value: '5', tone: 'red' },
        ],
        rows: [
          { label: '重点异常', value: '高风险地点长停 2 单、偏离计划线路 2 单、轨迹断点 1 单' },
          { label: '集中线路', value: '青岛市北 → 济南历城，异常 4 单' },
          { label: '处置结果', value: '4 单已核实为正常等待，1 单转交承运商调查' },
        ],
        footer: '报告已发送给物流运营、运输调度和承运商管理人员。',
      },
    ],
  },
  {
    id: 'severe-stop-sms',
    name: '严重停车短信',
    scheduleShort: '持续监控',
    schedule: '每 5 分钟扫描一次',
    description: '持续识别车辆在高风险地点停车超过 30 分钟的事件，确认严重风险后向物流负责人发送短信。',
    executions: 18,
    lastRun: '今天 11:42',
    nextRun: '预计 4 分钟后',
    status: '运行中',
    icon: strokeIconPaths.messageText,
    history: [
      {
        id: 'sms-0724',
        date: '2026-07-24 · 11:42',
        title: '严重停车风险短信已发送',
        summary: '皖K55821 在非计划高风险物流园持续停车 47 分钟，任务已完成风险核验并触发通知。',
        metrics: [
          { label: '风险等级', value: '高风险', tone: 'red' },
          { label: '停车时长', value: '47 分钟', tone: 'orange' },
          { label: '短信送达', value: '3/3', tone: 'emerald' },
        ],
        rows: [
          { label: '关联运单', value: 'WB202607240087 · 合肥仓 → 南京仓' },
          { label: '停车地点', value: '合肥北城物流园东区，距计划线路 16.8km' },
          { label: '通知对象', value: '华东物流负责人、运输调度、承运商值班经理' },
        ],
        footer: '短信均已送达；事件已升级至人工复核，等待承运商反馈。',
      },
      {
        id: 'sms-0723',
        date: '2026-07-23 · 15:18',
        title: '严重停车风险短信已发送',
        summary: '鲁B3M579 在临沂兰华物流园连续停车 63 分钟，地点未包含在计划节点与常用休息点中。',
        metrics: [
          { label: '风险等级', value: '高风险', tone: 'red' },
          { label: '停车时长', value: '63 分钟', tone: 'orange' },
          { label: '短信送达', value: '3/3', tone: 'emerald' },
        ],
        rows: [
          { label: '关联运单', value: 'WB202607230052 · 青岛仓 → 徐州仓' },
          { label: '停车地点', value: '临沂兰华物流园西门，偏离主路线 11.2km' },
          { label: '处置结果', value: '承运商 16:06 反馈为临时换胎，车辆 16:14 恢复行驶' },
        ],
        footer: '风险事件已闭环，停车原因和承运商反馈已写入运单时间轴。',
      },
    ],
  },
];

// These definitions predate project-scoped scheduling; preserve their history without activating them in an arbitrary project.
export function archivedLongTasks(): DailyTask[] {
  return longTasks.map(source => {
    const runs: TaskRun[] = source.history.map(item => {
      const at = Date.parse(item.date.replace(' · ', 'T') + ':00+08:00');
      return { id:item.id, source:'manual', prompt:source.description, startedAt:at, finishedAt:at, status:'complete', steps:[], activeStep:0, nextStepAt:0,
        result:[item.title,item.summary,...[...item.metrics,...item.rows].map(row=>row.label+'：'+row.value),item.footer].join('\n\n') };
    });
    return {id:source.id, projectId:'', name:source.name, prompt:source.description, trigger:'once', createdAt:runs.at(-1)!.startedAt, runs,
      archive:{kind:source.id==='daily-risk-report'?'scheduled':'listener', executions:source.executions, triggerLabel:source.schedule}, enabled:false};
  });
}

