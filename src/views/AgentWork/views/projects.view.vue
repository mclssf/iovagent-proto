<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { badgeToneClass, projectStatusTone } from '../utils';

const store = agentWorkData();
const { projects } = storeToRefs(store);
const { goPage } = useAgentWorkNav();
</script>

<template>
  <div class="flex h-full flex-col space-y-3 overflow-y-auto">
    <div class="overflow-hidden rounded-md border border-[#deded9] bg-white">
      <div class="flex h-12 items-center justify-between gap-4 border-b border-[#e2e2dc] px-4">
        <div class="flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-md bg-[#f2f2ef] text-slate-700">
            <Icon :svg="strokeIconPaths.settings" :size="16" />
          </div>
          <div>
            <h1 class="text-sm font-semibold leading-5 text-slate-950">项目管理</h1>
          </div>
        </div>
        <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm text-white" @click="goPage('projectCreate')">
          <Icon :svg="strokeIconPaths.plus" :size="15" svg-class="mr-1 inline" /> 新建项目
        </button>
      </div>
      <div>
        <table class="w-full border-collapse text-left text-sm">
          <thead class="bg-[#f7f7f5]">
            <tr class="text-xs font-semibold text-slate-500">
              <th class="px-4 py-3 align-middle">项目</th>
              <th class="w-[130px] px-4 py-3 align-middle">连接</th>
              <th class="px-4 py-3 align-middle">筛选条件</th>
              <th class="w-[150px] px-4 py-3 align-middle">历史数据</th>
              <th class="w-[220px] px-4 py-3 align-middle">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#ededea] bg-white">
            <tr v-for="(p, i) in projects" :key="p.id" class="hover:bg-[#f7f7f5]">
              <td class="px-4 py-4 align-middle">
                <div class="font-medium text-slate-900">{{ p.name }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ p.tmsUrl }} · {{ p.tmsUser }}</div>
              </td>
              <td class="px-4 py-4 align-middle">
                <span class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium" :class="badgeToneClass(projectStatusTone(p.status))">
                  {{ p.status }}
                </span>
                <div class="mt-1 text-xs text-slate-500">{{ p.sync }}</div>
              </td>
              <td class="px-4 py-4 align-middle text-slate-700">
                <div>关键词：{{ p.keyword || '无' }}</div>
                <div class="mt-1 text-xs text-slate-500">状态：{{ p.statusFilter }}</div>
              </td>
              <td class="px-4 py-4 align-middle">
                <div class="font-medium text-slate-900">{{ p.total }} 单</div>
                <div class="mt-1 text-xs text-red-500">{{ p.risk }} 异常</div>
              </td>
              <td class="px-4 py-4 align-middle">
                <div class="flex items-center gap-2">
                  <button type="button" class="rounded-md border border-[#deded9] px-3 py-1.5 text-xs hover:bg-[#f7f7f5]" @click="store.refreshProject(p)">
                    <Icon :svg="strokeIconPaths.refresh" :size="13" svg-class="mr-1 inline" />刷新
                  </button>
                  <button type="button" class="rounded-md border border-[#deded9] px-3 py-1.5 text-xs hover:bg-[#f7f7f5]" @click="goPage('projectCreate', { projectId: p.id })">
                    编辑
                  </button>
                  <button type="button" class="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50" @click="store.removeProjectAt(i)">
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
