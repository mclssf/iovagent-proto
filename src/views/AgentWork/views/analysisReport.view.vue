<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  prompt: string;
  title: string;
  topic: string;
}>();

const trendData = [
  { date: '07-29', value: 9 },
  { date: '07-30', value: 12 },
  { date: '07-31', value: 10 },
  { date: '08-01', value: 14 },
  { date: '08-02', value: 13 },
  { date: '08-03', value: 16 },
  { date: '08-04', value: 17 },
];
const chartWidth = 420;
const chartHeight = 132;
const chartPaddingX = 18;
const chartPaddingY = 14;
const maxTrendValue = 20;
const trendPoints = trendData.map((item, index) => {
  const x = chartPaddingX + (index * (chartWidth - chartPaddingX * 2)) / (trendData.length - 1);
  const y = chartHeight - chartPaddingY - (item.value / maxTrendValue) * (chartHeight - chartPaddingY * 2);
  return { ...item, x, y };
});
const trendPolyline = trendPoints.map((point) => `${point.x},${point.y}`).join(' ');
const trendAreaPath = `M ${trendPoints[0]!.x} ${chartHeight - chartPaddingY} L ${trendPoints.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${trendPoints.at(-1)!.x} ${chartHeight - chartPaddingY} Z`;

const routeRanking = [
  { name: '上海工厂 → 广州仓', count: 7, width: '88%', tone: 'bg-red-500' },
  { name: '苏州仓 → 成都中心', count: 4, width: '58%', tone: 'bg-amber-500' },
  { name: '青岛工厂 → 济南仓', count: 3, width: '44%', tone: 'bg-blue-500' },
  { name: '合肥工厂 → 武汉仓', count: 2, width: '30%', tone: 'bg-emerald-500' },
];

const carrierRows = [
  { name: '安捷物流', orders: 31, abnormal: 7, rate: '22.6%', change: '+4.8%', level: '重点关注' },
  { name: '华南速运', orders: 26, abnormal: 4, rate: '15.4%', change: '+1.2%', level: '持续观察' },
  { name: '远达运输', orders: 38, abnormal: 3, rate: '7.9%', change: '-0.6%', level: '整体稳定' },
];

const topicInsight = computed(() => {
  if (props.topic.includes('承运商')) return '异常主要集中在安捷物流，异常率高于项目均值 9.3 个百分点，需优先复核其长停与轨迹断点运单。';
  if (props.topic.includes('轨迹')) return '3 单存在 GPS 断点、漂移或速度跳变，其中 1 单轨迹可信度低于 60%，建议人工核验定位真实性。';
  if (props.topic.includes('时效')) return '当前 8 单存在晚到风险，上海至广州线路受长停影响最大，预计平均延误 2.4 小时。';
  if (props.topic.includes('停车')) return '2 单在非目的地高风险地点停车超过 30 分钟，最长停车 94 分钟，且均未产生计划内停靠记录。';
  return '今日异常率 13.3%，较昨日上升 2.1 个百分点；风险集中在安捷物流及上海工厂至广州仓线路。';
});
</script>

<template>
  <div class="h-full overflow-y-auto bg-[#fbfbfa] text-slate-700">
    <header class="border-b border-[#e7e7e2] bg-white px-5 py-5">
      <div class="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
        <span class="rounded-md bg-[#f1f1ef] px-2 py-1">经营分析参谋</span>
        <span>生成于 2026-08-04 16:48</span>
      </div>
      <h1 class="text-lg font-semibold leading-7 text-slate-950">{{ title }}</h1>
      <p class="mt-2 text-xs leading-5 text-slate-500">分析问题：{{ prompt }}</p>
      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span>统计周期：今日 00:00-16:45</span>
        <span>数据来源：大卡鹰眼、运单数据、风险事件</span>
      </div>
    </header>

    <main class="space-y-5 px-5 py-5">
      <section>
        <h2 class="mb-3 text-sm font-semibold text-slate-950">核心指标</h2>
        <div class="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <div class="rounded-md border border-[#e3e3de] bg-white p-3">
            <div class="text-[11px] text-slate-500">在途运单</div>
            <div class="mt-1.5 text-xl font-semibold text-slate-950">128</div>
            <div class="mt-1 text-[11px] text-emerald-600">较昨日 +6.7%</div>
          </div>
          <div class="rounded-md border border-[#e3e3de] bg-white p-3">
            <div class="text-[11px] text-slate-500">异常运单</div>
            <div class="mt-1.5 text-xl font-semibold text-red-600">17</div>
            <div class="mt-1 text-[11px] text-red-600">较昨日 +3 单</div>
          </div>
          <div class="rounded-md border border-[#e3e3de] bg-white p-3">
            <div class="text-[11px] text-slate-500">异常率</div>
            <div class="mt-1.5 text-xl font-semibold text-slate-950">13.3%</div>
            <div class="mt-1 text-[11px] text-amber-600">上升 2.1 个百分点</div>
          </div>
          <div class="rounded-md border border-[#e3e3de] bg-white p-3">
            <div class="text-[11px] text-slate-500">高风险运单</div>
            <div class="mt-1.5 text-xl font-semibold text-red-600">6</div>
            <div class="mt-1 text-[11px] text-slate-500">占异常 35.3%</div>
          </div>
        </div>
      </section>

      <section class="rounded-md border border-[#e3e3de] bg-white p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-slate-950">近 7 天异常趋势</h2>
          <span class="text-[11px] text-slate-400">单位：单</span>
        </div>
        <div class="relative aspect-[3/1] min-h-[150px] w-full">
          <svg viewBox="0 0 420 160" class="h-full w-full" preserveAspectRatio="none" aria-label="近 7 天异常运单趋势图">
            <line v-for="y in [14, 66, 118]" :key="y" x1="18" :y1="y" x2="402" :y2="y" stroke="#e7e7e2" stroke-width="1" />
            <path :d="trendAreaPath" fill="#eff6ff" />
            <polyline :points="trendPolyline" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            <circle v-for="point in trendPoints" :key="point.date" :cx="point.x" :cy="point.y" r="4" fill="#ffffff" stroke="#2563eb" stroke-width="2.5" />
            <text v-for="point in trendPoints" :key="`${point.date}-value`" :x="point.x" :y="point.y - 9" text-anchor="middle" font-size="10" fill="#475569">{{ point.value }}</text>
            <text v-for="point in trendPoints" :key="`${point.date}-label`" :x="point.x" y="153" text-anchor="middle" font-size="9" fill="#94a3b8">{{ point.date }}</text>
          </svg>
        </div>
      </section>

      <section class="grid gap-3 xl:grid-cols-2">
        <div class="rounded-md border border-[#e3e3de] bg-white p-4">
          <h2 class="text-sm font-semibold text-slate-950">异常风险构成</h2>
          <div class="mt-4 flex items-center gap-5">
            <div class="relative h-28 w-28 shrink-0 rounded-full" style="background: conic-gradient(#dc2626 0 35.3%, #f59e0b 35.3% 64.7%, #2563eb 64.7% 82.3%, #10b981 82.3% 100%)">
              <div class="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white">
                <span class="text-xl font-semibold text-slate-950">17</span>
                <span class="text-[10px] text-slate-400">异常运单</span>
              </div>
            </div>
            <div class="min-w-0 flex-1 space-y-2.5 text-xs">
              <div class="flex items-center justify-between gap-3"><span class="flex items-center gap-2"><i class="h-2 w-2 rounded-full bg-red-600"></i>异常停车</span><b class="text-slate-900">6</b></div>
              <div class="flex items-center justify-between gap-3"><span class="flex items-center gap-2"><i class="h-2 w-2 rounded-full bg-amber-500"></i>时效风险</span><b class="text-slate-900">5</b></div>
              <div class="flex items-center justify-between gap-3"><span class="flex items-center gap-2"><i class="h-2 w-2 rounded-full bg-blue-600"></i>轨迹异常</span><b class="text-slate-900">3</b></div>
              <div class="flex items-center justify-between gap-3"><span class="flex items-center gap-2"><i class="h-2 w-2 rounded-full bg-emerald-500"></i>其他风险</span><b class="text-slate-900">3</b></div>
            </div>
          </div>
        </div>

        <div class="rounded-md border border-[#e3e3de] bg-white p-4">
          <h2 class="text-sm font-semibold text-slate-950">异常线路 TOP4</h2>
          <div class="mt-4 space-y-3.5">
            <div v-for="route in routeRanking" :key="route.name">
              <div class="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
                <span class="truncate text-slate-600">{{ route.name }}</span>
                <b class="shrink-0 text-slate-900">{{ route.count }} 单</b>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-[#eeeeeb]">
                <div class="h-full rounded-full" :class="route.tone" :style="{ width: route.width }"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-md border border-[#e3e3de] bg-white">
        <div class="border-b border-[#e7e7e2] px-4 py-3">
          <h2 class="text-sm font-semibold text-slate-950">承运商异常表现</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[520px] text-left text-[11px]">
            <thead class="bg-[#f7f7f5] text-slate-500">
              <tr>
                <th class="px-4 py-2.5 font-medium">承运商</th>
                <th class="px-3 py-2.5 font-medium">运单</th>
                <th class="px-3 py-2.5 font-medium">异常</th>
                <th class="px-3 py-2.5 font-medium">异常率</th>
                <th class="px-3 py-2.5 font-medium">环比</th>
                <th class="px-4 py-2.5 font-medium">判断</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#eeeeeb]">
              <tr v-for="carrier in carrierRows" :key="carrier.name">
                <td class="px-4 py-3 font-medium text-slate-900">{{ carrier.name }}</td>
                <td class="px-3 py-3">{{ carrier.orders }}</td>
                <td class="px-3 py-3">{{ carrier.abnormal }}</td>
                <td class="px-3 py-3 font-medium" :class="carrier.rate === '22.6%' ? 'text-red-600' : 'text-slate-700'">{{ carrier.rate }}</td>
                <td class="px-3 py-3" :class="carrier.change.startsWith('+') ? 'text-red-600' : 'text-emerald-600'">{{ carrier.change }}</td>
                <td class="px-4 py-3">{{ carrier.level }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-md border border-blue-200 bg-blue-50 p-4">
        <h2 class="text-sm font-semibold text-blue-950">核心结论</h2>
        <p class="mt-2 text-xs leading-6 text-blue-900">{{ topicInsight }}</p>
        <div class="mt-3 grid gap-2 text-xs leading-5 text-slate-700 sm:grid-cols-2">
          <div class="rounded-md bg-white px-3 py-2.5"><b class="text-slate-950">优先动作：</b>复核 6 单高风险运单，核查停车地点和轨迹真实性。</div>
          <div class="rounded-md bg-white px-3 py-2.5"><b class="text-slate-950">运营建议：</b>对安捷物流设置专项预警，并持续跟踪高风险线路。</div>
        </div>
      </section>

      <footer class="pb-3 text-center text-[10px] text-slate-400">本报告由经营分析参谋基于大卡鹰眼数据自动生成</footer>
    </main>
  </div>
</template>
