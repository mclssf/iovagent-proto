<script lang="ts" setup>
import type { PageId } from '../interface';

import { useRoute, useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { agentWorkRouteName } from '../useAgentWorkNav';
import { badgeToneClass, projectStatusTone } from '../utils';

const store = agentWorkData();
const { projects } = storeToRefs(store);
const route = useRoute();
const router = useRouter();

const navs: { icon: string; id: PageId; label: string }[] = [
  { id: 'agent', label: '智能体工作台', icon: strokeIconPaths.bot },
  { id: 'orders', label: '运单列表', icon: strokeIconPaths.list },
  { id: 'risk', label: '异常运单列表', icon: strokeIconPaths.shield },
  { id: 'detail', label: '运单详情与地图', icon: strokeIconPaths.map },
  { id: 'analytics', label: '统计归因', icon: strokeIconPaths.gauge },
  { id: 'projects', label: '项目管理', icon: strokeIconPaths.settings },
  { id: 'downloads', label: '下载任务', icon: strokeIconPaths.download },
];

function goNav(page: PageId) {
  router.push({ name: agentWorkRouteName[page] });
}

function isNavActive(page: PageId) {
  return route.name === agentWorkRouteName[page];
}
</script>

<template>
  <aside class="flex h-full flex-col overflow-y-hidden border-r border-slate-200 bg-white p-4">
    <button
      type="button"
      class="mb-5 flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
      @click="store.openAddProjectModal()"
    >
      <Icon :svg="strokeIconPaths.plus" :size="16" /> 新建项目
    </button>

    <div class="mb-5">
      <div class="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">项目</div>
      <div class="max-h-[325px] space-y-2 overflow-y-auto">
        <button
          v-for="p in projects"
          :key="p.id"
          type="button"
          class="w-full rounded-md border p-3 text-left transition"
          :class="store.currentProject.id === p.id ? 'border-slate-300 bg-slate-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'"
          @click="store.switchProject(p)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-medium text-slate-900">
              {{ p.name }}
            </div>
            <Icon :svg="strokeIconPaths.chevron" :size="15" svg-class="text-slate-400" />
          </div>
          <div class="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span>{{ p.total }} 单</span><span>·</span><span>{{ p.risk }} 异常</span>
          </div>
          <div class="mt-2">
            <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass(projectStatusTone(p.status))">{{
              p.status
            }}</span>
          </div>
        </button>
      </div>
    </div>

    <nav class="flex h-0 flex-1 flex-col space-y-1">
      <div class="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">菜单</div>
      <div class="flex-1 overflow-y-auto">
        <button
          v-for="n in navs"
          :key="n.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition"
          :class="isNavActive(n.id) ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'"
          @click="goNav(n.id)"
        >
          <Icon :svg="n.icon" :size="17" /> {{ n.label }}
        </button>
      </div>
    </nav>
  </aside>
</template>

<style lang="scss"></style>
