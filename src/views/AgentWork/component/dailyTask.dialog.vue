<script lang="ts" setup>
import { reactive, ref, watch } from 'vue';
import AppDialog from '@/components/AppDialog.vue';
import { Icon } from '@packages/icon';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import type { TaskAttachment } from '../dailyTasks';
import { formatFileSize, mergeTaskAttachments, readTaskAttachments } from '../ordinaryTasks';
import { strokeIconPaths } from '../strokeIconPaths';
import '../dailyTasks.css';

const props = defineProps<{ modelValue: boolean; projectId: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [id: string] }>();
const tasks = useAgentDailyTasks();
const form = reactive({ name: '', prompt: '', attachments: [] as TaskAttachment[] });
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const reading = ref(false);
const submitting = ref(false);
let generation = 0;
let dragDepth = 0;
watch(() => props.modelValue, () => {
  generation++; reading.value = false;
  Object.assign(form, { name: '', prompt: '', attachments: [] });
  error.value = ''; submitting.value = false; dragging.value = false; dragDepth = 0;
});
watch(() => props.projectId, () => emit('update:modelValue', false));

async function addFiles(files: File[]) {
  if (reading.value) return;
  const current = generation;
  reading.value = true;
  try {
    const incoming = await readTaskAttachments(files);
    if (current !== generation) return;
    const invalid = incoming.find(file => file.parseError);
    if (invalid) throw new Error(`“${invalid.name}”：${invalid.parseError}`);
    form.attachments = mergeTaskAttachments(form.attachments, incoming); error.value = '';
  } catch (failure) { if (current === generation) error.value = (failure as Error).message; }
  finally { if (current === generation) reading.value = false; }
}
function selectFiles(event: Event) { const input = event.target as HTMLInputElement; void addFiles(Array.from(input.files ?? [])); input.value = ''; }
function dropFiles(event: DragEvent) { dragging.value = false; dragDepth = 0; void addFiles(Array.from(event.dataTransfer?.files ?? [])); }
function example() { form.prompt = '查询表格中所有运单的历史轨迹，分别生成轨迹文件和执行报告，并打包供我下载。'; }
function save() {
  if (submitting.value || reading.value) return;
  submitting.value = true;
  try {
    const id = tasks.saveTask(props.projectId, { ...form, trigger: 'once' });
    emit('saved', id); emit('update:modelValue', false);
  } catch (failure) { submitting.value = false; error.value = (failure as Error).message; }
}
</script>

<template>
  <AppDialog :model-value="modelValue" title="新建普通任务" @update:model-value="emit('update:modelValue', $event)">
    <form id="daily-task-form" class="dt-surface dt-form" @submit.prevent="save">
      <label>任务标题（选填）<input v-model="form.name" maxlength="40" placeholder="根据任务描述自动命名" /></label>
      <div>
        <div class="dt-prompt-label"><label for="daily-task-prompt">要做的事情</label><button type="button" class="dt-text-button" @click="example">使用历史轨迹示例</button></div>
        <div class="dt-task-composer" :class="{ dragging }" @dragenter.prevent="dragDepth++; dragging = true" @dragover.prevent @dragleave.prevent="dragDepth = Math.max(0, dragDepth - 1); dragging = dragDepth > 0" @drop.prevent="dropFiles">
          <div v-if="form.attachments.length" class="dt-input-files">
            <div v-for="(file, index) in form.attachments" :key="`${file.name}-${index}`" class="dt-input-file"><Icon :svg="strokeIconPaths.fileSpreadsheet" :size="15" /><span :title="file.name">{{ file.name }} · {{ file.rowCount }} 行 · {{ formatFileSize(file.size) }}</span><button type="button" class="dt-icon" :aria-label="`移除附件 ${file.name}`" @click="form.attachments.splice(index, 1)"><Icon :svg="strokeIconPaths.x" :size="12" /></button></div>
          </div>
          <textarea id="daily-task-prompt" v-model="form.prompt" maxlength="2000" placeholder="描述任务目标、处理范围和输出要求" required />
          <div class="dt-composer-tools"><input ref="fileInput" class="dt-hidden-input" type="file" accept=".xls,.xlsx" multiple aria-label="普通任务 Excel 附件" @change="selectFiles" /><button type="button" class="dt-icon" title="上传 Excel" aria-label="上传任务文件" :disabled="reading" @click="fileInput?.click()"><Icon :svg="reading ? strokeIconPaths.refresh : strokeIconPaths.paperclip" :size="17" :svg-class="reading ? 'animate-spin' : ''" /></button><span>{{ reading ? '正在读取 Excel…' : `${form.prompt.length} / 2000` }}</span></div>
          <div v-if="dragging" class="dt-drop-indicator"><Icon :svg="strokeIconPaths.upload" :size="22" />松开以上传 Excel</div>
        </div>
      </div>
      <p v-if="error" class="dt-error" role="alert">{{ error }}</p>
    </form>
    <template #footer><div class="dialog-actions"><button type="button" class="dialog-button" @click="emit('update:modelValue', false)">取消</button><button type="submit" form="daily-task-form" class="dialog-button dialog-primary" :disabled="submitting || reading">提交并执行</button></div></template>
  </AppDialog>
</template>
