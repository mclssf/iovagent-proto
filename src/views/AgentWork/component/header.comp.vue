<script lang="ts" setup>
import { Icon } from '@packages/icon';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass, projectStatusTone } from '../utils';

const store = agentWorkData();
</script>

<template>
  <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-700">
        <Icon :svg="strokeIconPaths.truck" :size="21" />
      </div>
      <div>
        <div class="text-base font-semibold text-slate-900">在途物流智能体</div>
        <div class="text-xs text-slate-500">TMS 连接 · 在途监控 · 异常分析</div>
      </div>
    </div>
    <div class="flex items-center gap-3 text-sm text-slate-600">
      <span
        class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
        :class="badgeToneClass(projectStatusTone(store.currentProject.status))"
      >
        {{ store.currentProject.status }}
      </span>
      <span>{{ store.currentProject.name }}</span>
      <span class="flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1"> <Icon :svg="strokeIconPaths.user" :size="14" /> alfred </span>
    </div>
  </header>
</template>

<style lang="scss" scoped></style>
