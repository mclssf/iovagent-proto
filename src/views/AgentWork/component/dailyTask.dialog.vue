<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import AppDialog from '@/components/AppDialog.vue';
import { Icon } from '@packages/icon';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { createDataEmployeeSkills } from '@/pinia/dataEmployeeSkills';
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
const form = reactive<DailyTaskDraft>({ name: '', trigger: 'once', taskTemplate: 'general', eventType: 'parking', threshold: 30, fenceId: '', time: '18:00', intervalMinutes: 10, sourceDataEmployeeIds: [], targetDataEmployeeId: '', prompt: '', confirmBeforeSend: true, attachments: [] });
const dataEmployeeSystems = createDataEmployeeSkills().filter((skill) => /^https?:\/\//.test(skill.loginUrl));
const isSmartOrderEntry = computed(() => form.trigger === 'schedule' && form.taskTemplate === 'smart-order-entry');
const selectedSourceSystems = computed(() => dataEmployeeSystems.filter((skill) => form.sourceDataEmployeeIds?.includes(skill.id)));
const selectedTargetSystem = computed(() => dataEmployeeSystems.find((skill) => skill.id === form.targetDataEmployeeId));
const availableTaskTypes = computed(() =>
  (Object.entries(taskTypeLabels) as Array<[DailyTaskDraft['trigger'], string]>)
    .filter(([type]) => Boolean(props.projectId) || type !== 'event')
    .map(([type, label]) => [type, !props.projectId && type === 'schedule' ? '定时任务' : label] as const),
);
const exampleLabel = computed(() => form.trigger === 'once'
  ? '使用历史轨迹示例'
  : isSmartOrderEntry.value
    ? '使用智能录单示例'
    : !props.projectId && form.trigger === 'schedule'
      ? '使用个人定时示例'
      : '使用短信通知示例');
const events = computed(() => eventDefinitions.map((event) => ({ ...event, enabled: runtime.value?.skillIds.includes(monitorDefinitions.find((monitor) => monitor.id === event.monitor)!.skillId) })));
const isFence = computed(() => form.trigger === 'event' && form.eventType.startsWith('fence-'));

watch(() => props.modelValue, (open) => {
  if (!open) return;
  const task = props.task;
  Object.assign(form, task ? {
    name: task.name, trigger: task.trigger, taskTemplate: task.taskTemplate ?? 'general', eventType: task.eventType, threshold: task.threshold,
    fenceId: task.fenceId, time: task.time, intervalMinutes: task.intervalMinutes ?? 10,
    sourceDataEmployeeIds: [...(task.sourceDataEmployeeIds ?? [])], targetDataEmployeeId: task.targetDataEmployeeId ?? '',
    prompt: task.prompt, confirmBeforeSend: task.confirmBeforeSend, attachments: (task.attachments ?? []).map(file => ({ ...file })),
  } : { name: '', trigger: 'once', taskTemplate: 'general', eventType: events.value.find((event) => event.enabled)?.id ?? 'loading-start', threshold: 30, fenceId: runtime.value?.fences[0]?.id ?? '', time: '18:00', intervalMinutes: 10, sourceDataEmployeeIds: [], targetDataEmployeeId: '', prompt: '', confirmBeforeSend: true, attachments: [] });
  error.value = '';
  submitting.value = false;
  dragging.value = false;
  dragDepth = 0;
});
watch(() => props.projectId, () => { emit('update:modelValue', false); });
watch(() => form.trigger, (trigger) => {
  if (trigger !== 'schedule') form.taskTemplate = 'general';
});
watch(() => form.taskTemplate, (template) => {
  if (template !== 'smart-order-entry') return;
  if (!form.name) form.name = '多系统运单智能录入';
  if (!form.prompt) form.prompt = '持续读取来源系统中新建和变更的订单，完成字段语义映射、去重与合规校验后，将有效运单录入目标系统，并记录失败原因和处理回执。';
  if (!form.sourceDataEmployeeIds?.length) form.sourceDataEmployeeIds = dataEmployeeSystems.slice(0, 3).map((skill) => skill.id);
  if (!form.targetDataEmployeeId || form.sourceDataEmployeeIds.includes(form.targetDataEmployeeId)) {
    form.targetDataEmployeeId = dataEmployeeSystems.find((skill) => !form.sourceDataEmployeeIds?.includes(skill.id))?.id ?? '';
  }
  form.confirmBeforeSend = false;
});

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
  if (isSmartOrderEntry.value) {
    form.name = '多系统运单智能录入';
    form.prompt = '持续读取来源系统中新建和变更的订单，完成字段语义映射、去重与合规校验后，将有效运单录入目标系统，并记录失败原因和处理回执。';
    return;
  }
  if (!form.name) form.name = '异常事件通知司机';
  form.prompt = '核验本次事件的运单、车辆与位置，生成一条短信发送给司机，说明异常情况，并询问原因和预计恢复时间。';
}

function toggleSourceSystem(id: string) {
  const selected = form.sourceDataEmployeeIds ?? [];
  if (selected.includes(id)) {
    form.sourceDataEmployeeIds = selected.filter((item) => item !== id);
    return;
  }
  if (selected.length >= 3) {
    error.value = '数据源最多选择 3 个系统';
    return;
  }
  form.sourceDataEmployeeIds = [...selected, id];
  if (form.targetDataEmployeeId === id) form.targetDataEmployeeId = '';
  error.value = '';
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
    if (isSmartOrderEntry.value && form.sourceDataEmployeeIds?.length !== 3) { error.value = '请选择 3 个数据员工系统作为数据源'; return; }
    if (isSmartOrderEntry.value && !form.targetDataEmployeeId) { error.value = '请选择 1 个录单目标系统'; return; }
    if (isSmartOrderEntry.value && form.sourceDataEmployeeIds?.includes(form.targetDataEmployeeId)) { error.value = '目标系统不能同时作为数据源'; return; }
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
      <template v-else-if="form.trigger === 'schedule'">
        <label v-if="projectId">持续任务类型<select v-model="form.taskTemplate" aria-label="持续任务类型"><option value="general">通用定时任务</option><option value="smart-order-entry">智能录单</option></select></label>
        <label v-if="isSmartOrderEntry">检查频率<select v-model.number="form.intervalMinutes" aria-label="智能录单检查频率"><option :value="5">每 5 分钟</option><option :value="10">每 10 分钟</option><option :value="30">每 30 分钟</option><option :value="60">每 60 分钟</option></select></label>
        <label v-else>每日执行时间（北京时间）<input v-model="form.time" type="time" required /></label>
        <div v-if="isSmartOrderEntry" class="dt-system-config">
          <div class="dt-system-heading"><div><strong>数据源系统</strong><span>请选择 3 个数据员工技能接入的系统</span></div><small>{{ form.sourceDataEmployeeIds?.length ?? 0 }} / 3</small></div>
          <div class="dt-system-grid">
            <button v-for="system in dataEmployeeSystems" :key="system.id" type="button" class="dt-system-option" :class="{ selected: form.sourceDataEmployeeIds?.includes(system.id) }" :aria-pressed="form.sourceDataEmployeeIds?.includes(system.id)" @click="toggleSourceSystem(system.id)">
              <Icon :svg="strokeIconPaths.panels" :size="15" /><span><strong>{{ system.name }}</strong><small>{{ system.loginType }}</small></span><Icon v-if="form.sourceDataEmployeeIds?.includes(system.id)" :svg="strokeIconPaths.check" :size="14" />
            </button>
          </div>
          <label>录单目标系统<select v-model="form.targetDataEmployeeId" aria-label="录单目标系统" required><option value="" disabled>请选择 1 个目标系统</option><option v-for="system in dataEmployeeSystems" :key="system.id" :value="system.id" :disabled="form.sourceDataEmployeeIds?.includes(system.id)">{{ system.name }}{{ form.sourceDataEmployeeIds?.includes(system.id) ? '（已选为数据源）' : '' }}</option></select></label>
          <p v-if="selectedTargetSystem" class="dt-system-flow">{{ selectedSourceSystems.map(system => system.name).join('、') || '待选数据源' }} → {{ selectedTargetSystem.name }}</p>
        </div>
      </template>
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
      <label v-if="form.trigger !== 'once' && !isSmartOrderEntry" class="dt-checkbox"><input v-model="form.confirmBeforeSend" type="checkbox" />短信、邮件发送前由我确认</label>
      <p v-if="error" class="dt-error" role="alert">{{ error }}</p>
    </form>
    <template #footer><div class="dialog-actions"><button type="button" class="dialog-button" @click="emit('update:modelValue', false)">取消</button><button type="submit" form="daily-task-form" class="dialog-button dialog-primary" :disabled="submitting">{{ task ? '保存修改' : form.trigger === 'once' ? '提交并执行一次' : '创建任务' }}</button></div></template>
    <GeofenceDialog v-if="projectId" v-model="showFences" :project-id="projectId" @saved="form.fenceId = $event" />
  </AppDialog>
</template>
