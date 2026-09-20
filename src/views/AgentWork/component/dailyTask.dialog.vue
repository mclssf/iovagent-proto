<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import AppDialog from '@/components/AppDialog.vue';
import { Icon } from '@packages/icon';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import type { DailyTask, DailyTaskDraft, TaskAttachment } from '../dailyTasks';
import { eventDefinitions, isThresholdEvent, monitorDefinitions, taskTypeLabels } from '../dailyTasks';
import { mergeTaskAttachments } from '../ordinaryTasks';
import { strokeIconPaths } from '../strokeIconPaths';
import GeofenceDialog from './geofence.dialog.vue';
import '../dailyTasks.css';

const props = defineProps<{ modelValue: boolean; projectId: string; task?: DailyTask }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [id: string] }>();
const tasks = useAgentDailyTasks();
const error = ref('');
const showFences = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const submitting = ref(false);
let dragDepth = 0;
const runtime = computed(() => tasks.projects[props.projectId]);
const form = reactive<DailyTaskDraft>({ name: '', trigger: 'once', eventType: 'parking', threshold: 30, fenceId: '', time: '18:00', prompt: '', confirmBeforeSend: true, attachments: [] });
const availableTaskTypes = computed(() =>
  (Object.entries(taskTypeLabels) as Array<[DailyTaskDraft['trigger'], string]>)
    .filter(([type]) => Boolean(props.projectId) || type !== 'event')
    .map(([type, label]) => [type, !props.projectId && type === 'schedule' ? '定时任务' : label] as const),
);
const exampleLabel = computed(() => form.trigger === 'once' ? '使用历史轨迹示例' : !props.projectId && form.trigger === 'schedule' ? '使用个人定时示例' : '使用短信通知示例');
const events = computed(() => eventDefinitions.map((event) => ({ ...event, enabled: runtime.value?.skillIds.includes(monitorDefinitions.find((monitor) => monitor.id === event.monitor)!.skillId) })));
const isFence = computed(() => form.trigger === 'event' && form.eventType.startsWith('fence-'));

watch(() => props.modelValue, (open) => {
  if (!open) return;
  const task = props.task;
  Object.assign(form, task ? {
    name: task.name, trigger: task.trigger, eventType: task.eventType, threshold: task.threshold,
    fenceId: task.fenceId, time: task.time, prompt: task.prompt, confirmBeforeSend: task.confirmBeforeSend, attachments: (task.attachments ?? []).map(file => ({ ...file })),
  } : { name: '', trigger: 'once', eventType: events.value.find((event) => event.enabled)?.id ?? 'loading-start', threshold: 30, fenceId: runtime.value?.fences[0]?.id ?? '', time: '18:00', prompt: '', confirmBeforeSend: true, attachments: [] });
  error.value = '';
  submitting.value = false;
  dragging.value = false;
  dragDepth = 0;
});
watch(() => props.projectId, () => { emit('update:modelValue', false); });

function example() {
  if (form.trigger === 'once') {
    form.prompt = '查询沪A12345在180天之前的轨迹，返回轨迹摘要和可下载的明细文件。';
    return;
  }
  if (form.trigger === 'schedule' && !props.projectId) {
    if (!form.name) form.name = '每日工作事项整理';
    form.prompt = '每天整理我的待办事项和个人知识库更新，输出今日重点与需要确认的工作，不读取任何项目运单数据。';
    return;
  }
  if (!form.name) form.name = '异常事件通知司机';
  form.prompt = '核验本次事件的运单、车辆与位置，生成一条短信发送给司机，说明异常情况，并询问原因和预计恢复时间。';
}

function addFiles(files: TaskAttachment[]) {
  try { form.attachments = mergeTaskAttachments(form.attachments ?? [], files); error.value = ''; }
  catch (failure) { error.value = (failure as Error).message; }
}
function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  addFiles(Array.from(input.files ?? []));
  input.value = '';
}
function dropFiles(event: DragEvent) {
  dragging.value = false;
  dragDepth = 0;
  addFiles(Array.from(event.dataTransfer?.files ?? []));
}

function save() {
  if (submitting.value) return;
  try {
    if (!props.projectId && form.trigger === 'event') { error.value = '条件触发任务需要在项目中创建'; return; }
    const event = events.value.find((item) => item.id === form.eventType);
    if (form.trigger === 'event' && !event?.enabled) { error.value = '请先在项目技能中启用对应的判断任务'; return; }
    submitting.value = true;
    const id = tasks.saveTask(props.projectId, { ...form, attachments: form.trigger === 'once' ? form.attachments : [] }, props.task?.id);
    emit('saved', id);
    emit('update:modelValue', false);
  } catch (failure) { submitting.value = false; error.value = (failure as Error).message; }
}
</script>

<template>
  <AppDialog :model-value="modelValue" :title="task ? '编辑任务' : '新建任务'" @update:model-value="emit('update:modelValue', $event)">
    <form id="daily-task-form" class="dt-surface dt-form" @submit.prevent="save">
      <div class="dt-task-types" role="radiogroup" aria-label="任务类型">
        <label v-for="[type, label] in availableTaskTypes" :key="type" :class="{ selected: form.trigger === type, disabled: type === 'once' && !!task }"><input v-model="form.trigger" type="radio" name="task-type" :value="type" :disabled="type === 'once' && !!task" />{{ label }}</label>
      </div>
      <label>任务名称{{ form.trigger === 'once' ? '（选填）' : '' }}<input v-model="form.name" maxlength="40" :placeholder="form.trigger === 'once' ? '根据执行指令自动命名' : '例如：异常停车通知司机'" :required="form.trigger !== 'once'" /></label>
      <template v-if="form.trigger === 'event'">
        <div class="dt-form-grid" :style="!isThresholdEvent(form.eventType) ? { gridTemplateColumns: '1fr' } : undefined">
          <label>触发事件<select v-model="form.eventType" aria-label="触发事件"><option v-for="event in events" :key="event.id" :value="event.id" :disabled="!event.enabled">{{ event.name }}{{ event.enabled ? '' : '（判断技能未启用）' }}</option></select></label>
          <label v-if="isThresholdEvent(form.eventType)">{{ form.eventType === 'deviation' ? '偏移距离至少（公里）' : '持续时间至少（分钟）' }}<input v-model.number="form.threshold" type="number" min="1" :max="form.eventType === 'deviation' ? 1000 : 1440" required /></label>
        </div>
        <div v-if="isFence">
          <label>目标围栏<select v-model="form.fenceId" aria-label="目标围栏" required><option value="" disabled>请选择围栏</option><option v-for="fence in runtime?.fences ?? []" :key="fence.id" :value="fence.id">{{ fence.name }}</option></select></label>
          <button class="dt-text-button" type="button" @click="showFences = true">管理区域围栏</button>
        </div>
      </template>
      <label v-else-if="form.trigger === 'schedule'">每日执行时间（北京时间）<input v-model="form.time" type="time" required /></label>
      <div>
        <div class="dt-prompt-label"><label for="daily-task-prompt">要做的事情</label><button type="button" class="dt-text-button" @click="example">{{ exampleLabel }}</button></div>
        <div v-if="form.trigger === 'once'" class="dt-task-composer" :class="{ dragging }" @dragenter.prevent="dragDepth++; dragging = true" @dragover.prevent @dragleave.prevent="dragDepth = Math.max(0, dragDepth - 1); dragging = dragDepth > 0" @drop.prevent="dropFiles">
          <div v-if="form.attachments?.length" class="dt-input-files">
            <div v-for="(file, index) in form.attachments" :key="`${file.name}-${index}`" class="dt-input-file"><Icon :svg="strokeIconPaths.file" :size="15" /><span :title="file.name">{{ file.name }}</span><button type="button" class="dt-icon" :aria-label="`移除附件 ${file.name}`" @click="form.attachments.splice(index, 1)"><Icon :svg="strokeIconPaths.x" :size="12" /></button></div>
          </div>
          <textarea id="daily-task-prompt" v-model="form.prompt" maxlength="2000" placeholder="描述需要完成的工作，也可添加文件" required />
          <div class="dt-composer-tools"><input ref="fileInput" class="dt-hidden-input" type="file" multiple aria-label="普通任务附件" @change="selectFiles" /><button type="button" class="dt-icon" title="上传文件" aria-label="上传任务文件" @click="fileInput?.click()"><Icon :svg="strokeIconPaths.paperclip" :size="17" /></button><span>{{ form.prompt.length }} / 2000</span></div>
          <div v-if="dragging" class="dt-drop-indicator"><Icon :svg="strokeIconPaths.upload" :size="22" />松开以上传文件</div>
        </div>
        <textarea v-else id="daily-task-prompt" v-model="form.prompt" maxlength="2000" placeholder="描述需要 Agent 完成的工作、通知对象及输出要求" required />
      </div>
      <label v-if="form.trigger !== 'once'" class="dt-checkbox"><input v-model="form.confirmBeforeSend" type="checkbox" />短信、邮件发送前由我确认</label>
      <p v-if="error" class="dt-error" role="alert">{{ error }}</p>
    </form>
    <template #footer><div class="dialog-actions"><button type="button" class="dialog-button" @click="emit('update:modelValue', false)">取消</button><button type="submit" form="daily-task-form" class="dialog-button dialog-primary" :disabled="submitting">{{ task ? '保存修改' : form.trigger === 'once' ? '提交并执行一次' : '创建任务' }}</button></div></template>
    <GeofenceDialog v-if="projectId" v-model="showFences" :project-id="projectId" @saved="form.fenceId = $event" />
  </AppDialog>
</template>
