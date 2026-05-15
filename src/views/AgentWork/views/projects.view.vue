<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass, projectStatusTone } from '../utils';

const store = agentWorkData();
const { projects } = storeToRefs(store);
</script>

<template>
  <div class="flex h-full flex-col space-y-4 overflow-y-auto">
    <div class="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Icon :svg="strokeIconPaths.settings" :size="18" />
          </div>
          <div>
            <h1 class="text-xl font-semibold text-slate-900">项目管理</h1>
            <p class="mt-1 text-sm text-slate-500">项目连接、同步状态和监控条件</p>
          </div>
        </div>
        <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm text-white" @click="store.openAddProjectModal()">
          <Icon :svg="strokeIconPaths.plus" :size="15" svg-class="mr-1 inline" /> 新建项目
        </button>
      </div>
      <div class="overflow-hidden rounded-md border border-slate-200">
        <table class="w-full border-collapse text-left text-sm">
          <thead class="bg-slate-50">
            <tr class="text-xs font-semibold text-slate-500">
              <th class="px-4 py-3 align-middle">项目</th>
              <th class="w-[130px] px-4 py-3 align-middle">连接</th>
              <th class="px-4 py-3 align-middle">筛选条件</th>
              <th class="w-[150px] px-4 py-3 align-middle">历史数据</th>
              <th class="w-[220px] px-4 py-3 align-middle">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            <tr v-for="(p, i) in projects" :key="p.id" class="hover:bg-slate-50/80">
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
                  <button type="button" class="rounded-md border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50" @click="store.refreshProject(p)">
                    <Icon :svg="strokeIconPaths.refresh" :size="13" svg-class="mr-1 inline" />刷新
                  </button>
                  <button type="button" class="rounded-md border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50" @click="store.editProject(p)">编辑</button>
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
