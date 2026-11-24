<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../strokeIconPaths';

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

interface TaskConversationMessage {
  role: 'agent' | 'user';
  text: string;
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

const selectedTaskId = ref(longTasks[0]!.id);
const taskInput = ref('');
const isSending = ref(false);
const taskFeedRef = ref<HTMLDivElement | null>(null);
const conversations = ref<Record<string, TaskConversationMessage[]>>({
  'daily-risk-report': [],
  'severe-stop-sms': [],
});
let replyTimer: ReturnType<typeof setTimeout> | undefined;

const selectedTask = computed(() => longTasks.find((task) => task.id === selectedTaskId.value) ?? longTasks[0]!);

const metricToneClass: Record<MetricTone, string> = {
  blue: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  slate: 'bg-[#f4f4f1] text-slate-800',
};

function selectTask(taskId: string) {
  selectedTaskId.value = taskId;
  taskInput.value = '';
  nextTick(() => {
    if (taskFeedRef.value) taskFeedRef.value.scrollTop = 0;
  });
}

function sendTaskMessage() {
  const text = taskInput.value.trim();
  if (!text || isSending.value) return;
  const taskId = selectedTaskId.value;
  conversations.value[taskId]!.push({ role: 'user', text });
  taskInput.value = '';
  isSending.value = true;

  replyTimer = setTimeout(() => {
    const reply =
      taskId === 'daily-risk-report'
        ? '已记录。本任务将在下一次 18:00 执行时应用该要求，并保留原有高风险运单和线路集中度统计。'
        : '已记录。本任务会继续按 5 分钟频率扫描，满足“高风险地点停车超过 30 分钟”时立即发送短信。';
    conversations.value[taskId]!.push({ role: 'agent', text: reply });
    isSending.value = false;
    nextTick(() => {
      if (taskFeedRef.value) taskFeedRef.value.scrollTop = taskFeedRef.value.scrollHeight;
    });
  }, 650);
}

onBeforeUnmount(() => {
  if (replyTimer) clearTimeout(replyTimer);
});
</script>

<template>
  <div class="grid h-full min-w-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-[#fcfcfc]">
    <aside class="flex h-full flex-col overflow-hidden border-r border-[#e9e9e7] bg-[#f7f7f6]">
      <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#e9e9e7] px-4">
        <div class="flex items-center gap-2">
          <Icon :svg="strokeIconPaths.alarmClock" :size="16" svg-class="text-slate-700" />
          <h1 class="text-sm font-semibold text-slate-950">长期任务</h1>
        </div>
        <span class="text-[11px] text-slate-400">2 个运行中</span>
      </div>
      <div class="min-h-0 flex-1 divide-y divide-[#deded9] overflow-y-auto px-3 py-2">
        <button
          v-for="task in longTasks"
          :key="task.id"
          type="button"
          class="w-full rounded-md px-3 py-3 text-left transition"
          :class="selectedTaskId === task.id ? 'bg-white shadow-sm' : 'hover:bg-white/70'"
          @click="selectTask(task.id)"
        >
          <div class="flex items-start gap-2.5">
            <span
              class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
              :class="selectedTaskId === task.id ? 'border-blue-100 bg-blue-50 text-blue-700' : 'border-[#e4e4df] bg-[#f1f1ee] text-slate-500'"
            >
              <Icon :svg="strokeIconPaths.alarmClock" :size="15" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-slate-900">{{ task.name }}</span>
              <span class="mt-1 flex items-center justify-between gap-2 text-[11px] leading-5">
                <span class="truncate text-slate-500">{{ task.scheduleShort }}</span>
                <span class="shrink-0 text-emerald-600">{{ task.status }}</span>
              </span>
            </span>
          </div>
        </button>
      </div>
    </aside>

    <section class="relative flex h-full min-w-0 flex-col overflow-hidden bg-[#fcfcfc]">
      <header class="flex h-12 shrink-0 items-center border-b border-[#eeeeec] px-4">
        <div class="flex items-center gap-2.5">
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.messages" :size="16" />
          </span>
          <h2 class="text-sm font-semibold leading-5 text-slate-950">长期任务工作台</h2>
        </div>
      </header>

      <div ref="taskFeedRef" class="min-h-0 flex-1 overflow-auto px-5 py-5 pb-44">
        <div class="mx-auto grid w-full max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <main class="min-w-0 space-y-5">
            <div class="flex items-center gap-3">
              <span class="flex h-8 w-8 items-center justify-center rounded-md bg-[#f1f1ee] text-slate-700">
                <Icon :svg="selectedTask.icon" :size="17" />
              </span>
              <div>
                <div class="text-sm font-semibold text-slate-950">{{ selectedTask.name }}</div>
                <div class="text-xs leading-5 text-slate-500">最近 2 天执行输出</div>
              </div>
            </div>

            <article
              v-for="output in selectedTask.history"
              :key="output.id"
              class="rounded-md border border-[#deded9] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
            >
              <div class="flex items-start justify-between gap-4 border-b border-[#ededea] pb-3">
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-slate-900">{{ output.title }}</div>
                  <div class="mt-1 text-[11px] text-slate-400">{{ output.date }}</div>
                </div>
                <span class="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  已完成
                </span>
              </div>
              <p class="mt-3 text-xs leading-5 text-slate-600">{{ output.summary }}</p>
              <div class="mt-3 grid grid-cols-3 gap-2">
                <div v-for="metric in output.metrics" :key="metric.label" class="rounded-md px-3 py-2" :class="metricToneClass[metric.tone]">
                  <div class="text-[10px] leading-4 opacity-70">{{ metric.label }}</div>
                  <div class="mt-0.5 text-sm font-semibold">{{ metric.value }}</div>
                </div>
              </div>
              <dl class="mt-3 divide-y divide-[#ededea] rounded-md bg-[#f8f8f6] px-3">
                <div v-for="row in output.rows" :key="row.label" class="grid grid-cols-[72px_1fr] gap-3 py-2 text-xs leading-5">
                  <dt class="text-slate-400">{{ row.label }}</dt>
                  <dd class="text-slate-600">{{ row.value }}</dd>
                </div>
              </dl>
              <div class="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
                <Icon :svg="strokeIconPaths.check" :size="13" svg-class="mt-0.5 shrink-0 text-emerald-600" />
                <span>{{ output.footer }}</span>
              </div>
            </article>

            <div
              v-for="(message, index) in conversations[selectedTask.id]"
              :key="`${selectedTask.id}-${index}`"
              class="flex"
              :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[76%] rounded-md px-4 py-3 text-sm leading-6"
                :class="message.role === 'user' ? 'bg-slate-900 text-white' : 'border border-[#deded9] bg-white text-slate-700'"
              >
                {{ message.text }}
              </div>
            </div>

            <div v-if="isSending" class="flex justify-start">
              <div class="flex items-center gap-2 rounded-md border border-[#deded9] bg-white px-4 py-3 text-xs text-slate-500">
                <Icon :svg="strokeIconPaths.refresh" :size="13" svg-class="animate-spin text-blue-600" />
                正在更新任务要求
              </div>
            </div>
          </main>

          <aside class="order-first self-start rounded-md border border-[#deded9] bg-white p-4 xl:order-none xl:sticky xl:top-0">
            <div class="flex items-center justify-between gap-3 border-b border-[#ededea] pb-3">
              <div class="text-sm font-semibold text-slate-900">任务详情</div>
              <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                {{ selectedTask.status }}
              </span>
            </div>
            <dl class="mt-3 space-y-3 text-xs">
              <div>
                <dt class="text-slate-400">定时情况</dt>
                <dd class="mt-1 flex items-center gap-1.5 font-medium text-slate-800">
                  <Icon :svg="strokeIconPaths.alarmClock" :size="14" svg-class="text-blue-600" />
                  {{ selectedTask.schedule }}
                </dd>
              </div>
              <div>
                <dt class="text-slate-400">任务说明</dt>
                <dd class="mt-1 leading-5 text-slate-600">{{ selectedTask.description }}</dd>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-md bg-[#f7f7f5] px-3 py-2">
                  <dt class="text-[10px] text-slate-400">已执行次数</dt>
                  <dd class="mt-0.5 text-base font-semibold text-slate-900">{{ selectedTask.executions }}</dd>
                </div>
                <div class="rounded-md bg-[#f7f7f5] px-3 py-2">
                  <dt class="text-[10px] text-slate-400">历史输出</dt>
                  <dd class="mt-0.5 text-base font-semibold text-slate-900">{{ selectedTask.history.length }} 天</dd>
                </div>
              </div>
              <div class="border-t border-[#ededea] pt-3">
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-slate-400">上次执行</dt>
                  <dd class="text-slate-700">{{ selectedTask.lastRun }}</dd>
                </div>
                <div class="mt-2 flex items-center justify-between gap-3">
                  <dt class="text-slate-400">下次执行</dt>
                  <dd class="text-slate-700">{{ selectedTask.nextRun }}</dd>
                </div>
              </div>
            </dl>
          </aside>
        </div>
      </div>

      <div class="pointer-events-none absolute right-0 bottom-4 left-0 z-20 px-5">
        <div class="mx-auto max-w-[1180px] xl:pr-[300px]">
          <div
            class="pointer-events-auto rounded-[22px] border border-[#deded9] bg-white px-4 py-3 shadow-[0_18px_46px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.04)] transition focus-within:border-[#4c8dff] focus-within:shadow-[0_18px_46px_rgba(15,23,42,0.12),0_0_0_3px_rgba(59,130,246,0.16)]"
          >
            <textarea
              v-model="taskInput"
              class="min-h-[44px] w-full resize-none bg-transparent px-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
              :placeholder="`向“${selectedTask.name}”补充任务要求...`"
              rows="1"
              @keydown.enter.exact.prevent="sendTaskMessage"
            />
            <div class="mt-1 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 text-xs text-slate-500">
                <span class="flex h-8 w-8 items-center justify-center rounded-full text-slate-500">
                  <Icon :svg="strokeIconPaths.alarmClock" :size="16" />
                </span>
                自动
              </div>
              <button
                type="button"
                class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                :disabled="!taskInput.trim() || isSending"
                aria-label="发送"
                @click="sendTaskMessage"
              >
                <Icon :svg="strokeIconPaths.arrowUp" :size="16" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
