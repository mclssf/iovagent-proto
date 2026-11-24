<script lang="ts" setup>
import { computed, ref } from 'vue';

import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../strokeIconPaths';

interface KbDoc {
  id: string;
  name: string;
  folderId: string;
  format: string;
  summary: string;
}

interface KbFolder {
  id: string;
  name: string;
}

const emit = defineEmits<{
  (event: 'select', scope: string): void;
}>();

const folders = ref<KbFolder[]>([
  { id: 'all', name: '全部知识库' },
  { id: 'sop', name: '运营制度/SOP' },
  { id: 'contract', name: '合同与赔付标准' },
  { id: 'case', name: '案例库' },
]);

const docs = ref<KbDoc[]>([
  { id: 'D001', name: '在途异常处理SOP_V3.2.pdf', folderId: 'sop', format: 'PDF', summary: '定义异常停车、轨迹造假、非计划经停等场景的处理流程、责任人和升级规则。' },
  { id: 'D002', name: '承运商履约考核办法_2026Q3.docx', folderId: 'sop', format: 'Word', summary: '承运商KPI指标、评分规则、奖惩标准及月度考核输出模板。' },
  { id: 'D003', name: '货损货差赔付标准.pdf', folderId: 'contract', format: 'PDF', summary: '货物损坏、短缺、延误的赔付比例、举证要求和审批流程。' },
  { id: 'D004', name: '运输合同模板_通用版.docx', folderId: 'contract', format: 'Word', summary: '标准运输合同条款，包含责任边界、异常责任和结算规则。' },
  { id: 'D005', name: '皖K55821第三方中转仓经停案例.pdf', folderId: 'case', format: 'PDF', summary: '合肥仓→南京仓线路中，车辆在第三方中转仓非合同经停的处置与复盘。' },
  { id: 'D006', name: '沪A12345轨迹造假复核案例.pdf', folderId: 'case', format: 'PDF', summary: 'GPS断点、速度跳变与点火状态冲突的轨迹造假识别和取证过程。' },
  { id: 'D007', name: '冷链到货时效管理规范.docx', folderId: 'sop', format: 'Word', summary: '冷链城配线路的时效要求、温控异常处理及到货确认标准。' },
  { id: 'D008', name: '华东干线在途监控日报模板.xlsx', folderId: 'sop', format: 'Excel', summary: '日报字段、统计口径及异常运单汇总模板。' },
  { id: 'D009', name: '非目的地物流园长停处置细则.pdf', folderId: 'sop', format: 'PDF', summary: '非计划停靠点的识别规则、处置动作和升级流程。' },
  { id: 'D010', name: '承运商服务等级协议SLA.pdf', folderId: 'contract', format: 'PDF', summary: '不同等级承运商的服务承诺、违约责任和赔付上限。' },
  { id: 'D011', name: '车辆GPS轨迹真实性校验规范.pdf', folderId: 'sop', format: 'PDF', summary: 'GPS断点、速度跳变、点火状态不一致等异常识别方法。' },
  { id: 'D012', name: '在途异常事件分类与编码.xlsx', folderId: 'sop', format: 'Excel', summary: '异常事件分类、编码规则及关联责任方定义。' },
]);

const searchQuery = ref('');

const filteredDocs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  let list = query ? docs.value.filter((doc) => doc.name.toLowerCase().includes(query)) : docs.value;
  return list.slice(0, 10);
});

function selectScope(scope: string) {
  emit('select', scope);
}

function getFileIcon(name: string) {
  if (name.endsWith('.pdf')) return strokeIconPaths.filePdf;
  if (/\.(xls|xlsx|csv)$/i.test(name)) return strokeIconPaths.fileSpreadsheet;
  if (/\.(doc|docx)$/i.test(name)) return strokeIconPaths.fileWord;
  if (/\.(ppt|pptx)$/i.test(name)) return strokeIconPaths.filePpt;
  return strokeIconPaths.fileText;
}
</script>

<template>
  <div class="w-72 overflow-hidden rounded-2xl border border-[#deded9] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.14)]">
    <div class="border-b border-[#eeeeec] px-3 py-2 text-xs font-medium text-slate-700">
      选择知识库检索范围
    </div>

    <div class="max-h-[360px] overflow-y-auto p-2">
      <div class="mb-1 px-2 py-1 text-[11px] font-medium text-slate-400">文件夹</div>
      <button
        v-for="folder in folders"
        :key="folder.id"
        type="button"
        class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-slate-700 transition hover:bg-[#f7f7f5]"
        @click="selectScope(folder.id === 'all' ? '@我的知识库' : `@${folder.name}`)"
      >
        <Icon :svg="strokeIconPaths.folder" :size="13" />
        <span class="truncate">{{ folder.name }}</span>
      </button>

      <div class="mb-1 mt-3 px-2 py-1 text-[11px] font-medium text-slate-400">文件</div>
      <div class="mb-2 px-2">
        <div class="flex h-8 items-center gap-2 rounded-md border border-[#deded9] bg-[#f7f7f5] px-2">
          <Icon :svg="strokeIconPaths.search" :size="13" svg-class="text-slate-400" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索文件"
            class="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>
      <button
        v-for="doc in filteredDocs"
        :key="doc.id"
        type="button"
        class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-slate-700 transition hover:bg-[#f7f7f5]"
        @click="selectScope(`@${doc.name}`)"
      >
        <Icon :svg="getFileIcon(doc.name)" :size="13" />
        <span class="min-w-0 flex-1 truncate">{{ doc.name }}</span>
      </button>
      <div v-if="filteredDocs.length === 0" class="px-2 py-2 text-[11px] text-slate-400">未找到匹配文件</div>
      <div v-else-if="docs.length > 10 && !searchQuery" class="px-2 py-1 text-[10px] text-slate-400">仅展示前 10 个文件，请使用搜索查找更多</div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
