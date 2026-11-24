<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { badgeToneClass } from '../utils';

const store = agentWorkData();
const { downloadTask } = storeToRefs(store);
const { createDownload } = useAgentWorkNav();
</script>

<template>
  <div class="h-full space-y-3">
    <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex h-12 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.download" :size="16" />
          </div>
          <div>
            <h1 class="text-sm font-semibold leading-5 text-slate-950">下载任务</h1>
          </div>
        </div>
        <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm text-white" @click="createDownload('今日异常运单')">新建下载</button>
      </div>
      <div v-if="!downloadTask" class="m-4 flex min-h-[180px] items-center justify-center rounded-md bg-[#f7f7f5] p-10 text-center text-slate-500">
        <div class="flex flex-col items-center gap-3">
          <Icon :svg="strokeIconPaths.download" :size="28" svg-class="block" />
          <div class="leading-none">暂无下载任务</div>
        </div>
      </div>
      <div v-else class="m-4 rounded-md border border-[#deded9] p-5">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold">{{ downloadTask.scope }}.xlsx</div>
            <div class="mt-1 text-sm text-slate-500">范围：{{ downloadTask.scope }}</div>
          </div>
          <span
            class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
            :class="badgeToneClass(downloadTask.status === '已完成' ? 'green' : 'blue')"
            >{{ downloadTask.status }}</span>
        </div>
        <div class="mt-5 h-3 rounded-full bg-slate-100">
          <div class="h-3 rounded-full bg-slate-900 transition-all" :style="{ width: `${downloadTask.progress}%` }"></div>
        </div>
        <div class="mt-5 flex gap-2">
          <button
            type="button"
            :disabled="downloadTask.status !== '已完成'"
            class="rounded-md px-4 py-2 text-sm"
            :class="downloadTask.status === '已完成' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'"
          >
            下载文件
          </button>
          <button type="button" class="rounded-md border border-[#deded9] px-4 py-2 text-sm" @click="createDownload(downloadTask.scope)">重新生成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
