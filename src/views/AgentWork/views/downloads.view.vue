<script lang="ts" setup>
import { computed } from 'vue';
import { Icon } from '@packages/icon';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { formatTaskTime } from '../dailyTasks';
import { createTaskResultPackage, downloadTaskResult, excelResult, formatFileSize } from '../ordinaryTasks';
import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';

const work = agentWorkData();
const tasks = useAgentDailyTasks();
const { goPage, createDownload } = useAgentWorkNav();
const files = computed(() => tasks.resultDownloads);
function openTask(item: { taskId: string; projectId: string }) {
  if (item.projectId) { const project = work.projects.find(project => project.id === item.projectId); if (project) work.switchProject(project); }
  goPage('dailyTasks', { taskId: item.taskId, scope: item.projectId ? 'project' : 'personal' });
}
function downloadLegacy() {
  if (!work.downloadTask || work.downloadTask.status !== '已完成') return;
  const orders = work.ordersSeed.filter(order => order.risk !== '无风险');
  const report = excelResult(`${work.downloadTask.scope}.xlsx`, orders.map(order => ({ 运单号: order.id, 车牌号: order.plate, 线路: order.route, 承运商: order.carrier, 风险等级: order.risk })), '异常运单');
  downloadTaskResult(createTaskResultPackage(`${work.downloadTask.scope}.zip`, [report]));
}
</script>

<template>
  <div class="downloads-page">
    <header class="downloads-header"><div><Icon :svg="strokeIconPaths.download" :size="16" /><h1>下载</h1></div><button type="button" class="downloads-button" @click="createDownload('今日异常运单')"><Icon :svg="strokeIconPaths.plus" :size="14" />新建下载</button></header>
    <div class="downloads-content">
      <section v-if="work.downloadTask" class="downloads-legacy"><div><strong>{{ work.downloadTask.scope }}.zip</strong><p>{{ work.downloadTask.status }} · {{ work.downloadTask.progress }}%</p></div><button type="button" class="downloads-button" :disabled="work.downloadTask.status !== '已完成'" @click="downloadLegacy"><Icon :svg="strokeIconPaths.download" :size="14" />下载文件</button></section>
      <div v-if="files.length" class="downloads-table-wrapper"><table class="downloads-table"><thead><tr><th>文件名</th><th>任务标题</th><th>执行 / 生成时间</th><th>格式 / 大小</th><th><span class="downloads-sr-only">操作</span></th></tr></thead><tbody><tr v-for="item in files" :key="item.id"><td><div class="downloads-file-name"><Icon :svg="item.file.name.endsWith('.zip') ? strokeIconPaths.folder : strokeIconPaths.fileSpreadsheet" :size="18" /><strong>{{ item.file.name }}</strong></div></td><td><button type="button" class="downloads-task-link" @click="openTask(item)">{{ item.taskTitle }}</button><small>{{ item.projectId ? work.projects.find(project => project.id === item.projectId)?.name : '个人任务' }}</small></td><td>{{ formatTaskTime(item.finishedAt) }}<small>{{ item.runId.slice(-8) }}</small></td><td>{{ item.file.name.split('.').pop()?.toUpperCase() }}<small>{{ formatFileSize(item.file.size ?? 0) }}</small></td><td><button type="button" class="downloads-icon" :title="`下载 ${item.file.name}`" :aria-label="`下载 ${item.file.name}`" @click="downloadTaskResult(item.file)"><Icon :svg="strokeIconPaths.download" :size="17" /></button></td></tr></tbody></table></div>
      <div v-else-if="!work.downloadTask" class="downloads-empty"><Icon :svg="strokeIconPaths.download" :size="28" /><p>暂无下载文件</p></div>
    </div>
  </div>
</template>

<style scoped>
.downloads-page { height: 100%; display: flex; flex-direction: column; background: #fcfcfc; color: #303842; font-size: 12px; }
.downloads-page button { cursor: pointer; }
.downloads-page button:disabled { cursor: not-allowed; opacity: .5; }
.downloads-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 48px; padding: 0 18px; border-bottom: 1px solid #e8e9e6; flex-shrink: 0; }
.downloads-header > div { display: flex; align-items: center; gap: 10px; }
.downloads-header h1 { font-size: 14px; font-weight: 600; margin: 0; }
.downloads-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; border: 1px solid #d9dee3; background: white; border-radius: 6px; font-size: 12px; min-height: 32px; }
.downloads-content { min-height: 0; flex: 1; overflow: auto; padding: 16px 18px 18px; scrollbar-color: #d7d9d4 transparent; scrollbar-width: thin; }
.downloads-legacy { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid #e5e8eb; }
.downloads-legacy p { margin-top: 5px; color: #626c77; }
.downloads-table-wrapper { position: relative; overflow-x: auto; }
.downloads-table { width: 100%; border-collapse: collapse; text-align: left; }
.downloads-table th { font-weight: 500; color: #626c77; padding: 12px 10px; background: #f3f5f6; white-space: nowrap; }
.downloads-table td { padding: 14px 10px; border-bottom: 1px solid #e8ebee; vertical-align: middle; }
.downloads-table td:first-child { max-width: 320px; }
.downloads-file-name { display: flex; gap: 8px; align-items: center; }
.downloads-file-name svg { flex-shrink: 0; color: #48736a; }
.downloads-file-name strong { font-weight: 500; overflow-wrap: anywhere; }
.downloads-table small { display: block; font-size: 11px; color: #626c77; margin-top: 4px; }
.downloads-task-link { text-align: left; color: #245ba8; background: none; border: 0; overflow-wrap: anywhere; }
.downloads-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: transparent; border: 0; border-radius: 6px; color: #536170; }
.downloads-icon:hover, .downloads-button:hover { background: #edf1f5; }
.downloads-empty { min-height: 200px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px; color: #626c77; }
.downloads-sr-only { position: absolute; top: 0; left: 0; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
.downloads-page button:focus-visible { outline: 2px solid #4f8af0; outline-offset: 2px; }
@media (max-width: 700px) { .downloads-table { min-width: 680px; } }
</style>
