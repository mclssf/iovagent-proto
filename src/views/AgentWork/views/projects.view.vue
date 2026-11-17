<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';

import { ElMessage } from 'element-plus';
import { useLingdongSync } from '@/pinia/lingdongSync';
import { dateText } from '@/views/Phase1/catalog';
import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';
import { useAgentWorkNav } from '../useAgentWorkNav';
import { badgeToneClass, projectStatusTone } from '../utils';

const store = agentWorkData();
const inbound = useLingdongSync();
function setDefault(id: string) { const error=inbound.setDefault(id,store.projects); if(error)ElMessage.warning(error);else ElMessage.success('默认项目已更新，仅影响后续新同步运单'); }
function sync() { if(inbound.syncLatest(store.projects))ElMessage.success(inbound.summary);else ElMessage.warning(inbound.error); }
function viewInbound() { const project=store.projects.find(item=>item.id===inbound.defaultProjectId);if(!project)return;store.switchProject(project);const dates=store.currentProjectOrders.map(order=>order.startTime.slice(0,10)).filter(Boolean).sort();store.ordersStartDate=dates[0]||'';store.ordersEndDate=dates.at(-1)||'';store.ordersKeyword='LD260';goPage('orders'); }

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
      <section class="inbound-summary" aria-label="灵动运单同步"><div><strong>灵动运单同步</strong><span>已开启 · 单向获取 · 不回写灵动</span></div><p>新运单归属：{{ projects.find(p=>p.id===inbound.defaultProjectId)?.name || '待设置默认项目' }} · 最近同步：{{ inbound.lastSyncAt ? dateText(inbound.lastSyncAt) : '尚未同步' }}</p><p v-if="inbound.summary">{{ inbound.summary }}</p><p v-if="inbound.error" role="alert" class="text-red-700">{{ inbound.error }}</p><details v-if="inbound.failed.length"><summary>失败原因</summary><p v-for="failure in inbound.failed" :key="failure">{{ failure }}</p></details><div class="flex gap-3"><button class="text-blue-700" :disabled="inbound.busy" @click="sync">{{ inbound.busy?'同步中…':'获取最新运单' }}</button><button class="text-blue-700" @click="viewInbound">查看同步运单</button></div></section>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <thead class="bg-[#f7f7f5]">
            <tr class="text-xs font-semibold text-slate-500">
              <th class="px-4 py-3 align-middle">项目</th>
              <th class="w-[130px] px-4 py-3 align-middle">连接</th>
              <th class="px-4 py-3 align-middle">筛选条件</th>
              <th class="w-[150px] px-4 py-3 align-middle">历史数据</th>
              <th class="w-[320px] px-4 py-3 align-middle">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#ededea] bg-white">
            <tr v-for="(p, i) in projects" :key="p.id" class="hover:bg-[#f7f7f5]">
              <td class="px-4 py-4 align-middle">
                <div class="font-medium text-slate-900">{{ p.name }}<span v-if="inbound.defaultProjectId===p.id" class="ml-2 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">默认项目</span></div>
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
                <div class="flex flex-wrap items-center gap-2">
                  <button v-if="inbound.defaultProjectId!==p.id" type="button" class="rounded-md border border-[#deded9] px-3 py-1.5 text-xs text-blue-700" @click="setDefault(p.id)">设为默认项目</button>
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

<style lang="scss" scoped>.inbound-summary{padding:14px 16px;border-bottom:1px solid #e2e2dc;font-size:12px;line-height:1.8}.inbound-summary>div:first-child{display:flex;gap:16px;align-items:center}.inbound-summary>div:first-child span{color:#64748b}.inbound-summary p{margin:4px 0 8px}</style>
