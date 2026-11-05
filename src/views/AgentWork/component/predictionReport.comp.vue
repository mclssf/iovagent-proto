<script setup lang="ts">
import type { ChatMessage } from '../interface';
import { Icon } from '@packages/icon';
import { strokeIconPaths } from '../strokeIconPaths';
defineProps<{ m: ChatMessage }>();
</script>

<template>
  <div class="min-w-0">
              <div v-if="m.predictionReport" class="space-y-4 px-3 text-xs leading-5 text-slate-600">
                <section v-if="m.predictionReport.taskProgress?.length" class="max-w-[440px] rounded-md border border-slate-200 bg-white p-3">
                  <div class="mb-2 flex items-center justify-between"><h3 class="font-semibold text-slate-900">任务进度</h3><span class="rounded-full border border-slate-200 px-2 text-[10px]">{{ m.predictionReport.taskProgress.length }} 项</span></div>
                  <div v-for="item in m.predictionReport.taskProgress" :key="item.title" class="mt-2 flex items-start justify-between gap-3 rounded border border-slate-200 p-2">
                    <div><h4 class="font-medium text-slate-900">{{ item.title }}</h4><p class="mt-1 text-[11px] text-slate-500">{{ item.text }}</p></div><span class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">已完成</span>
                  </div>
                </section>
                <section v-if="m.predictionReport.introduction">
                  <h3 class="mb-1 font-semibold text-slate-900">{{ m.predictionReport.kind === 'stop-risk' ? '异常停靠风险研判完成' : '运单真实性核验完成' }}</h3><p>{{ m.predictionReport.introduction }}</p>
                </section>
                <section v-if="m.predictionReport.overview?.length" class="overflow-x-auto">
                  <h3 class="mb-2 font-semibold text-slate-900">数据概况</h3>
                  <table class="w-full border-collapse text-left"><thead class="bg-slate-100"><tr><th class="border border-slate-200 p-2">项目</th><th class="border border-slate-200 p-2">数量</th><th class="border border-slate-200 p-2">占比</th></tr></thead><tbody><tr v-for="item in m.predictionReport.overview" :key="item.label"><td class="border border-slate-200 p-2">{{ item.label }}</td><td class="border border-slate-200 p-2">{{ item.count }} {{ item.label === '涉及车辆' ? '辆' : '条' }}</td><td class="border border-slate-200 p-2">{{ item.percent }}</td></tr></tbody></table>
                </section>
                <section v-if="m.predictionReport.riskDistribution?.length" class="overflow-x-auto">
                  <h3 class="mb-2 font-semibold text-slate-900">风险分布</h3>
                  <table class="w-full border-collapse text-left"><thead class="bg-slate-100"><tr><th class="w-[26%] border border-slate-200 p-2">风险等级</th><th class="w-[13%] border border-slate-200 p-2">数量</th><th class="border border-slate-200 p-2">说明</th></tr></thead><tbody><tr v-for="item in m.predictionReport.riskDistribution" :key="item.label"><td class="border border-slate-200 p-2 font-medium" :class="item.label.endsWith('高风险') ? 'text-red-700' : item.label.endsWith('低风险') ? 'text-amber-700' : 'text-emerald-700'">{{ item.label }}</td><td class="border border-slate-200 p-2">{{ item.count }} 条</td><td class="border border-slate-200 p-2">{{ item.note }}</td></tr></tbody></table>
                </section>
                <section v-if="m.predictionReport.summary.length">
                  <h3 class="mb-2 font-semibold text-slate-900">解析摘要</h3>
                  <table class="w-full border-collapse text-left"><thead class="bg-slate-100"><tr><th class="border border-slate-200 p-2">项目</th><th class="border border-slate-200 p-2">内容</th></tr></thead><tbody><tr v-for="item in m.predictionReport.summary" :key="item.label"><td class="border border-slate-200 p-2">{{ item.label }}</td><td class="break-all border border-slate-200 p-2">{{ item.value }}</td></tr></tbody></table>
                </section>
                <section v-if="m.predictionReport.fields.length" class="overflow-x-auto">
                  <h3 class="mb-2 font-semibold text-slate-900">字段映射</h3>
                  <table class="w-full min-w-[420px] border-collapse text-left"><thead class="bg-slate-100"><tr><th class="border border-slate-200 p-2">预测所需字段</th><th class="border border-slate-200 p-2">对应表头</th><th class="border border-slate-200 p-2">识别结果</th></tr></thead><tbody><tr v-for="item in m.predictionReport.fields" :key="item.label"><td class="border border-slate-200 p-2">{{ item.label }}</td><td class="border border-slate-200 p-2">{{ item.header }}</td><td class="border border-slate-200 p-2">{{ item.note }}</td></tr></tbody></table>
                </section>
                <section v-if="m.predictionReport.judgments.length">
                  <h3 class="mb-2 font-semibold text-slate-900">关键判断</h3>
                  <ul class="list-disc space-y-1 pl-4"><li v-for="item in m.predictionReport.judgments" :key="item">{{ item }}</li></ul>
                </section>
                <section v-if="m.predictionReport.statistics.length">
                  <h3 class="mb-2 font-semibold text-slate-900">处理统计</h3>
                  <table class="w-full border-collapse text-left"><thead class="bg-slate-100"><tr><th class="border border-slate-200 p-2">指标</th><th class="border border-slate-200 p-2">数值</th></tr></thead><tbody><tr v-for="item in m.predictionReport.statistics" :key="item.label"><td class="border border-slate-200 p-2">{{ item.label }}</td><td class="border border-slate-200 p-2">{{ item.value }}</td></tr></tbody></table>
                </section>
              </div>
              <div v-if="m.predictionRows?.length" class="mt-4 overflow-x-auto px-3">
                <table class="w-full min-w-[1100px] table-fixed border-collapse whitespace-nowrap text-left text-xs leading-4">
                  <caption class="pb-2 text-left font-semibold text-slate-900">预测结果明细</caption>
                  <colgroup><col class="w-[44px]"><col class="w-[160px]"><col class="w-[88px]"><col class="w-[110px]"><col class="w-[200px]"><col class="w-[150px]"><col class="w-[170px]"><col class="w-[64px]"><col class="w-[114px]"></colgroup>
                  <thead class="bg-slate-100"><tr><th class="p-2">行号</th><th class="p-2">运单编号</th><th class="p-2">车牌号</th><th class="p-2">装货地状态</th><th class="p-2">预测装货地 POI</th><th class="p-2">停车坐标</th><th class="p-2">停车时间</th><th class="p-2">距离</th><th class="p-2">卸货地状态</th></tr></thead>
                  <tbody><tr v-for="(row, index) in m.predictionRows" :key="row.row" class="h-10 border-b border-slate-200">
                    <td class="truncate px-2 py-1" :title="row.row">{{ index + 1 }}</td>
                    <td class="truncate px-2 py-1" :title="row.order">{{ row.order || '—' }}</td>
                    <td class="truncate px-2 py-1" :title="row.plate">{{ row.plate }}</td>
                    <td class="truncate px-2 py-1" :title="row.start">{{ row.start }}</td>
                    <td class="truncate px-2 py-1" :title="row.startLocation">{{ row.startLocation || '—' }}</td>
                    <td class="truncate px-2 py-1" :title="row.coordinate">{{ row.coordinate || '待核验' }}</td>
                    <td class="px-2 py-1"><div class="truncate" :title="row.stopTime">{{ row.stopTime || '待核验' }}</div><div v-if="row.stopEndTime" class="truncate text-slate-500" :title="row.stopEndTime">~ {{ row.stopEndTime }}</div></td>
                    <td class="px-2 py-1">{{ row.parkingDistance ? `${row.parkingDistance}m` : '—' }}</td>
                    <td class="truncate px-2 py-1" :title="row.end">{{ row.end }}</td>
                  </tr></tbody>
                </table>
              </div>
              <div v-if="m.verificationRows?.length" class="mt-4 overflow-x-auto px-3">
                <table class="w-full min-w-[740px] table-fixed border-collapse text-left text-xs leading-4">
                  <caption class="pb-2 text-left font-semibold text-slate-900">核验结果摘要</caption>
                  <colgroup><col class="w-[44px]"><col class="w-[100px]"><col class="w-[120px]"><col class="w-[120px]"><col class="w-[120px]"><col class="w-[120px]"><col class="w-[116px]"></colgroup>
                  <thead class="bg-slate-100"><tr><th class="border border-slate-200 p-2">行号</th><th class="border border-slate-200 p-2">车牌号</th><th class="border border-slate-200 p-2">起始地事件核验</th><th class="border border-slate-200 p-2">目的地事件核验</th><th class="border border-slate-200 p-2">出厂位置查询</th><th class="border border-slate-200 p-2">完成位置查询</th><th class="border border-slate-200 p-2">总结论</th></tr></thead>
                  <tbody><tr v-for="(row, index) in m.verificationRows" :key="row.row" class="h-10 border-b border-slate-200">
                    <td class="border border-slate-200 px-2 py-1" :title="row.row">{{ row.sourceIndex || index + 1 }}</td><td class="border border-slate-200 px-2 py-1" :title="row.order">{{ row.plate }}</td>
                    <td class="border border-slate-200 px-2 py-1">{{ row.start }}</td><td class="border border-slate-200 px-2 py-1" :class="row.end === '通过' ? 'text-emerald-700' : row.end === '无法判断' ? 'text-amber-700' : 'text-red-700'">{{ row.end }}</td><td class="border border-slate-200 px-2 py-1">{{ row.startPosition }}</td><td class="border border-slate-200 px-2 py-1">{{ row.endPosition }}</td><td class="border border-slate-200 px-2 py-1 font-semibold" :class="row.conclusion === '通过' ? 'text-emerald-700' : row.conclusion === '无法判断' ? 'text-amber-700' : 'text-red-700'" :title="row.hint">{{ row.conclusion === '通过' ? '校验通过' : ['无法判断', '调用失败'].includes(row.conclusion) ? row.conclusion : '校验未通过' }}</td>
                  </tr></tbody>
                </table>
              </div>
              <section v-if="m.predictionReport?.analyses.length" class="mt-4 px-3 text-xs leading-5 text-slate-600">
                <h3 class="mb-2 font-semibold text-slate-900">{{ m.predictionReport.kind === 'stop-risk' ? '风险分析摘要' : m.predictionReport.kind === 'waybill' ? '关键发现' : '逐行分析' }}</h3>
                <div v-for="item in m.predictionReport.analyses" :key="item.title" class="border-b border-slate-200 py-3 last:border-0">
                  <h4 class="mb-1 font-medium text-slate-900">{{ item.title }}</h4>
                  <ul v-if="item.points.length" class="list-disc space-y-1 pl-4"><li v-for="point in item.points" :key="point">{{ point }}</li></ul>
                  <details v-if="item.groups?.length" class="mt-2">
                    <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-800">查看车辆明细（{{ item.groups.length }} 项）</summary>
                    <div v-for="group in item.groups" :key="group.label" class="mt-3 border-l-2 border-slate-200 pl-3">
                      <h5 class="mb-1 font-medium text-slate-800">{{ group.label }} <span class="ml-1" :class="!group.status || group.status === '通过' ? 'text-emerald-700' : 'text-amber-700'">{{ group.status || '通过' }}</span></h5>
                      <ul class="list-disc space-y-1 pl-4"><li v-for="point in group.items" :key="point">{{ point }}</li></ul>
                    </div>
                  </details>
                </div>
              </section>
              <section v-if="m.predictionReport?.exportSummary || m.predictionReport?.boundaries.length" class="mt-4 px-3 text-xs leading-5 text-slate-600">
                <div v-if="m.predictionReport.exportSummary" class="border-t border-slate-200 pt-3">
                  <h3 class="mb-1 flex items-center gap-1.5 font-semibold text-slate-900"><Icon :svg="strokeIconPaths.fileSpreadsheet" :size="14" />{{ m.predictionReport.kind === 'stop-risk' ? '研判结果文件' : m.predictionReport.kind === 'waybill' ? '核验结果文件' : '结果文件' }}</h3>
                  <p>{{ m.predictionReport.exportSummary }}</p>
                  <a v-if="m.file" :href="m.file.url" :download="m.file.name" :aria-label="`下载 ${m.file.name}`" class="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 font-medium text-emerald-700 hover:bg-emerald-100"><Icon :svg="strokeIconPaths.download" :size="14" />{{ m.predictionReport.kind === 'stop-risk' ? '下载异常停靠风险研判报告' : m.verificationRows?.length ? '下载轨迹核验结果文件' : '下载核验结果文件' }}</a>
                </div>
                <div v-if="m.predictionReport.boundaries.length" class="mt-4 border-t border-slate-200 pt-3">
                  <h3 class="mb-2 font-semibold text-slate-900">{{ m.predictionReport.kind === 'stop-risk' ? '建议措施' : m.predictionReport.kind === 'waybill' ? '数据边界说明' : '数据边界与核验建议' }}</h3>
                  <p v-for="item in m.predictionReport.boundaries" :key="item.label" class="mb-2"><strong class="font-medium text-slate-900">{{ item.label }}：</strong>{{ item.text }}</p>
                </div>
              </section>
              <div v-if="m.streaming" class="mt-2 flex items-center gap-2 px-3 text-xs text-slate-400" role="status" aria-label="正在输出结果"><span class="inline-block h-4 w-0.5 animate-pulse bg-slate-500"></span>正在输出…</div>
  </div>
</template>
