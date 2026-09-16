<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import { ElDialog } from 'element-plus';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import type { DailyTask, DailyTaskDraft } from '../dailyTasks';
import { eventDefinitions, isThresholdEvent, monitorDefinitions } from '../dailyTasks';
import GeofenceDialog from './geofence.dialog.vue';
import '../dailyTasks.css';

const props = defineProps<{ modelValue: boolean; projectId: string; task?: DailyTask }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [id: string] }>();
const tasks = useAgentDailyTasks();
const error = ref('');
const showFences = ref(false);
const runtime = computed(() => tasks.projects[props.projectId]);
const form = reactive<DailyTaskDraft>({ name: '', trigger: 'event', eventType: 'parking', threshold: 30, fenceId: '', time: '18:00', prompt: '', confirmBeforeSend: true });
const events = computed(() => eventDefinitions.map((event) => ({ ...event, enabled: runtime.value?.skillIds.includes(monitorDefinitions.find((monitor) => monitor.id === event.monitor)!.skillId) })));
const isFence = computed(() => form.trigger === 'event' && form.eventType.startsWith('fence-'));

watch(() => props.modelValue, (open) => {
  if (!open) return;
  const task = props.task;
  Object.assign(form, task ? {
    name: task.name, trigger: task.trigger, eventType: task.eventType, threshold: task.threshold,
    fenceId: task.fenceId, time: task.time, prompt: task.prompt, confirmBeforeSend: task.confirmBeforeSend,
  } : { name: '', trigger: 'event', eventType: events.value.find((event) => event.enabled)?.id ?? 'loading-start', threshold: 30, fenceId: runtime.value?.fences[0]?.id ?? '', time: '18:00', prompt: '', confirmBeforeSend: true });
  error.value = '';
});
watch(() => props.projectId, () => { emit('update:modelValue', false); });

function example() {
  if (!form.name) form.name = '异常事件通知司机';
  form.prompt = '核验本次事件的运单、车辆与位置，生成一条短信发送给司机，说明异常情况，并询问原因和预计恢复时间。';
}

function save() {
  try {
    const event = events.value.find((item) => item.id === form.eventType);
    if (form.trigger === 'event' && !event?.enabled) { error.value = '请先在项目技能中启用对应的判断任务'; return; }
    const id = tasks.saveTask(props.projectId, { ...form }, props.task?.id);
    emit('saved', id);
    emit('update:modelValue', false);
  } catch (failure) { error.value = (failure as Error).message; }
}
</script>

<template>
  <ElDialog :model-value="modelValue" :title="task ? '编辑日常任务' : '新建日常任务'" width="min(580px, calc(100vw - 32px))" append-to-body @update:model-value="emit('update:modelValue', $event)">
    <form class="dt-surface dt-form" @submit.prevent="save">
      <label>任务名称<input v-model="form.name" maxlength="40" placeholder="例如：异常停车通知司机" required /></label>
      <label>触发方式<select v-model="form.trigger" aria-label="触发方式"><option value="event">运单事件触发</option><option value="schedule">定时执行</option></select></label>
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
      <label v-else>每日执行时间（北京时间）<input v-model="form.time" type="time" required /></label>
      <div>
        <div class="dt-prompt-label"><label for="daily-task-prompt">要做的事情</label><button type="button" class="dt-text-button" @click="example">使用短信通知示例</button></div>
        <textarea id="daily-task-prompt" v-model="form.prompt" maxlength="2000" placeholder="描述需要 Agent 完成的工作、通知对象及输出要求" required />
      </div>
      <label class="dt-checkbox"><input v-model="form.confirmBeforeSend" type="checkbox" />短信、邮件发送前由我确认</label>
      <p v-if="error" class="dt-error" role="alert">{{ error }}</p>
      <div class="dt-dialog-footer"><button type="button" class="dt-button" @click="emit('update:modelValue', false)">取消</button><button type="submit" class="dt-button primary">{{ task ? '保存修改' : '创建任务' }}</button></div>
    </form>
    <GeofenceDialog v-model="showFences" :project-id="projectId" @saved="form.fenceId = $event" />
  </ElDialog>
</template>
