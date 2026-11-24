<script lang="ts" setup>
import type { Project } from '../interface';

import { computed, nextTick, ref, watch } from 'vue';

import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../strokeIconPaths';
import { badgeToneClass, projectStatusTone } from '../utils';

type ImportMode = 'create' | 'merge';

const props = defineProps<{
  fileNames: string[];
  importedCount: number;
  open: boolean;
  projects: Project[];
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [payload: { mode: ImportMode; projectId: string; projectName: string }];
}>();

const importMode = ref<ImportMode>('create');
const projectName = ref('');
const selectedProjectId = ref('');
const projectNameInputRef = ref<HTMLInputElement | null>(null);
const maxProjectNameLength = 20;

const projectNameLength = computed(() => Array.from(projectName.value).length);
const selectedProject = computed(() => props.projects.find((project) => project.id === selectedProjectId.value));
const canConfirm = computed(() =>
  importMode.value === 'create' ? Boolean(projectName.value.trim()) : Boolean(selectedProjectId.value),
);
const fileSummary = computed(() => {
  if (props.fileNames.length === 0) return '已识别运单列表';
  if (props.fileNames.length === 1) return props.fileNames[0];
  return `${props.fileNames[0]} 等 ${props.fileNames.length} 个文件`;
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    importMode.value = 'create';
    projectName.value = '';
    selectedProjectId.value = props.projects[0]?.id ?? '';
    nextTick(() => projectNameInputRef.value?.focus());
  },
);

watch(importMode, (mode) => {
  if (mode === 'create') nextTick(() => projectNameInputRef.value?.focus());
});

function handleProjectNameInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  projectName.value = Array.from(value).slice(0, maxProjectNameLength).join('');
}

function confirmImport() {
  if (!canConfirm.value) return;
  emit('confirm', {
    mode: importMode.value,
    projectId: importMode.value === 'merge' ? selectedProjectId.value : '',
    projectName: importMode.value === 'create' ? projectName.value.trim() : '',
  });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-6" role="presentation">
      <div
        class="w-full max-w-[640px] overflow-hidden rounded-lg bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24),0_4px_16px_rgba(15,23,42,0.08)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waybill-import-title"
      >
        <div class="flex items-start justify-between gap-4 border-b border-[#e7e7e3] px-5 py-4">
          <div class="min-w-0">
            <h2 id="waybill-import-title" class="text-base font-semibold leading-6 text-slate-950">保存运单并持续跟踪</h2>
            <p class="mt-1 text-xs leading-5 text-slate-500">已识别为运单列表。保存到项目后，可持续监控在途状态并针对这些运单问答。</p>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-[#f2f2ef] hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="暂不保存"
            title="暂不保存"
            @click="emit('cancel')"
          >
            <Icon :svg="strokeIconPaths.x" :size="15" />
          </button>
        </div>

        <div class="space-y-5 px-5 py-5">
          <div class="flex items-center gap-3 bg-[#f7f7f5] px-3.5 py-3">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-emerald-700 shadow-sm">
              <Icon :svg="strokeIconPaths.fileSpreadsheet" :size="18" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium text-slate-900">{{ fileSummary }}</div>
              <div class="mt-0.5 text-xs text-slate-500">识别 {{ importedCount }} 条运单 · 运单号、车牌号、装卸货地、计划时间</div>
            </div>
            <span class="shrink-0 text-xs font-medium text-emerald-700">识别完成</span>
          </div>

          <div>
            <div class="mb-2 text-xs font-medium text-slate-600">保存方式</div>
            <div class="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                class="flex min-h-[76px] items-start gap-3 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                :class="importMode === 'create' ? 'border-slate-900 bg-[#f7f7f5]' : 'border-[#deded9] bg-white hover:border-[#c8c8c2]'"
                @click="importMode = 'create'"
              >
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-700 shadow-sm">
                  <Icon :svg="strokeIconPaths.filePlus" :size="16" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-slate-900">新建并导入</span>
                  <span class="mt-1 block text-xs leading-5 text-slate-500">创建独立项目，持续跟踪本批运单。</span>
                </span>
                <Icon v-if="importMode === 'create'" :svg="strokeIconPaths.check" :size="15" svg-class="mt-0.5 shrink-0 text-slate-900" />
              </button>

              <button
                type="button"
                class="flex min-h-[76px] items-start gap-3 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                :class="importMode === 'merge' ? 'border-slate-900 bg-[#f7f7f5]' : 'border-[#deded9] bg-white hover:border-[#c8c8c2]'"
                @click="importMode = 'merge'"
              >
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-blue-700 shadow-sm">
                  <Icon :svg="strokeIconPaths.panels" :size="16" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-slate-900">合并到现有项目</span>
                  <span class="mt-1 block text-xs leading-5 text-slate-500">将本批运单加入已有项目的数据范围。</span>
                </span>
                <Icon v-if="importMode === 'merge'" :svg="strokeIconPaths.check" :size="15" svg-class="mt-0.5 shrink-0 text-slate-900" />
              </button>
            </div>
          </div>

          <div v-if="importMode === 'create'">
            <label for="import-project-name" class="mb-1.5 block text-xs font-medium text-slate-600">项目名称</label>
            <div class="flex h-10 items-center rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <input
                id="import-project-name"
                ref="projectNameInputRef"
                :value="projectName"
                type="text"
                class="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="例如：华东临时运单监控"
                @input="handleProjectNameInput"
                @keydown.enter.prevent="confirmImport"
              />
              <span class="ml-3 text-xs tabular-nums" :class="projectNameLength >= maxProjectNameLength ? 'text-amber-600' : 'text-slate-400'">
                {{ projectNameLength }}/{{ maxProjectNameLength }}
              </span>
            </div>
            <p v-if="!projectName.trim()" class="mt-1.5 text-xs text-slate-400">填写名称后即可创建项目并导入运单。</p>
          </div>

          <div v-else>
            <label for="import-target-project" class="mb-1.5 block text-xs font-medium text-slate-600">选择现有项目</label>
            <select
              id="import-target-project"
              v-model="selectedProjectId"
              class="h-10 w-full rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option v-for="project in projects" :key="project.id" :value="project.id">
                {{ project.name }} · 今日 {{ project.total }} 单
              </option>
            </select>
            <div v-if="selectedProject" class="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>导入后预计 {{ selectedProject.total + importedCount }} 单</span>
              <span class="rounded border px-1.5 py-0.5 font-medium" :class="badgeToneClass(projectStatusTone(selectedProject.status))">
                {{ selectedProject.status }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-[#e7e7e3] bg-[#fbfbfa] px-5 py-3.5">
          <span class="text-xs text-slate-500">当前会话不会创建消息或切换上下文</span>
          <div class="flex shrink-0 items-center gap-2">
            <button type="button" class="h-9 rounded-md px-3 text-sm text-slate-600 transition hover:bg-[#f0f0ed] hover:text-slate-900" @click="emit('cancel')">
              暂不保存
            </button>
            <button
              type="button"
              class="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              :disabled="!canConfirm"
              @click="confirmImport"
            >
              {{ importMode === 'create' ? '创建并导入' : '合并并导入' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
