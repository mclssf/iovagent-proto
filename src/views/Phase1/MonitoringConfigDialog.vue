<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElCheckbox, ElCheckboxGroup, ElForm, ElFormItem, ElInput, ElInputNumber, ElMessage, ElOption, ElSelect, ElSwitch } from 'element-plus';
import AppDialog from '@/components/AppDialog.vue';
import { agentWorkData } from '@/pinia/agentWork';
import { clone, p1ConfigError, usePhase1 } from '@/pinia/phase1';
import type { P1Config, P1SkillId } from '@/views/AgentWork/interface';
import { phaseSkills, stateNames } from './catalog';
import { routeStrategies } from './routePlanning';
import { defaultOfflineFilter, defaultParkingFilter } from './eventAssessment';

const props = defineProps<{ projectId: string; skillId: P1SkillId; draft?: P1Config; draftOnly?: boolean }>();
const emit = defineEmits<{ close: []; saved: [config: P1Config] }>();
const store = usePhase1();
const draft = ref(clone(props.draft ?? store.config(props.projectId)));
draft.value.deviation.routeStrategy ??= '更多人选择';
const baseline = draft.value.version;
const error = ref('');
const skill = computed(() => phaseSkills.find(item => item.id === props.skillId)!);
const eventType = computed(() => props.skillId === 'p1-parking' ? 'parking' : 'offline');
const stateOptions = ['loading', 'in_transit', 'arrived', 'completed'] as const;
function save() {
  error.value = p1ConfigError(draft.value);
  if (error.value) return;
  if (!props.draftOnly) {
    if (!store.saveConfig(props.projectId, draft.value, baseline)) { error.value = store.error; return; }
    const project = agentWorkData().projects.find(item => item.id === props.projectId);
    if (project) project.skillIds = [...new Set([...(project.skillIds ?? []), ...draft.value.selectedSkills])];
    ElMessage.success('监听配置已保存');
  }
  emit('saved', clone(draft.value));
  emit('close');
}
</script>

<template>
  <AppDialog :model-value="true" :title="skill.name" width="580px" @update:model-value="emit('close')">
    <ElForm label-position="top" class="monitor-config" @submit.prevent="save">
      <template v-if="skillId === 'p1-parking' || skillId === 'p1-offline'">
        <div class="monitor-form-grid">
          <ElFormItem :label="eventType === 'parking' ? '停车时长（分钟）' : '离线时长（分钟）'"><ElInputNumber v-model="draft[eventType].thresholdMinutes" :min="1" :max="4320" controls-position="right" /></ElFormItem>
          <ElFormItem label="重复提醒间隔（分钟）"><ElInputNumber v-model="draft[eventType].repeatMinutes" :min="1" :max="4320" controls-position="right" /></ElFormItem>
        </div>
        <ElFormItem label="环境辅助研判"><ElSwitch v-model="draft.assessments[eventType].enabled" aria-label="环境辅助研判" /></ElFormItem>
        <template v-if="draft.assessments[eventType].enabled">
          <ElFormItem label="周边 POI 查询范围（米）"><ElInputNumber v-model="draft.assessments[eventType].radiusMeters" :min="1" :max="50000" controls-position="right" /></ElFormItem>
          <ElFormItem label="过滤规则"><ElInput v-model="draft.assessments[eventType].filterRule" type="textarea" :rows="4" :placeholder="eventType === 'parking' ? defaultParkingFilter : defaultOfflineFilter" /></ElFormItem>
          <p class="dialog-note">仅在附近存在相关场所，不足以判定合理；证据不足时保留异常待复核。</p>
        </template>
      </template>
      <div v-else-if="skillId === 'p1-deviation'" class="monitor-form-grid">
        <ElFormItem label="线路策略" style="grid-column:1/-1"><ElSelect v-model="draft.deviation.routeStrategy" aria-label="线路策略"><ElOption v-for="strategy in routeStrategies" :key="strategy" :label="strategy" :value="strategy" /></ElSelect><p class="dialog-note">先规划路线，再监听偏离。保存后仅对新运单生效，已有运单继续使用原路线。</p></ElFormItem>
        <ElFormItem label="偏离距离（米）"><ElInputNumber v-model="draft.deviation.radiusMeters" :min="1" :max="100000" controls-position="right" /></ElFormItem>
        <ElFormItem label="重复提醒间隔（分钟）"><ElInputNumber v-model="draft.deviation.repeatMinutes" :min="1" :max="4320" controls-position="right" /></ElFormItem>
      </div>
      <template v-else-if="skillId === 'p1-late'">
        <div class="monitor-form-grid">
          <ElFormItem label="晚发检查"><ElSwitch v-model="draft.lateDeparture.enabled" aria-label="晚发检查" /></ElFormItem>
          <ElFormItem label="晚到检查"><ElSwitch v-model="draft.lateArrival.enabled" aria-label="晚到检查" /></ElFormItem>
          <ElFormItem v-if="draft.lateDeparture.enabled" label="晚发容许时间（分钟）"><ElInputNumber v-model="draft.lateDeparture.graceMinutes" :min="1" :max="4320" controls-position="right" /></ElFormItem>
          <ElFormItem v-if="draft.lateArrival.enabled" label="晚到容许时间（分钟）"><ElInputNumber v-model="draft.lateArrival.graceMinutes" :min="1" :max="4320" controls-position="right" /></ElFormItem>
        </div>
        <ElFormItem label="经过记录检查"><ElCheckbox v-model="draft.missingPass!.origin">未经过起始地</ElCheckbox><ElCheckbox v-model="draft.missingPass!.destination">未经过目的地</ElCheckbox></ElFormItem>
        <p class="dialog-note">仅在运输状态变化时检查。缺少经过记录不等于证实车辆未经过，需结合运输事实复核。</p>
      </template>
      <template v-else-if="skillId === 'p1-status'">
        <ElFormItem label="围栏监听范围"><ElCheckboxGroup v-model="draft.fenceTargets"><ElCheckbox value="origin">起始地</ElCheckbox><ElCheckbox value="destination">目的地</ElCheckbox></ElCheckboxGroup></ElFormItem>
        <ElFormItem label="自动更新运输状态"><ElCheckboxGroup v-model="draft.statusUpdates"><ElCheckbox v-for="state in stateOptions" :key="state" :value="state">{{ stateNames[state] }}</ElCheckbox></ElCheckboxGroup></ElFormItem>
        <p class="dialog-note">关闭某项状态更新后，仍保留已采集的围栏事实。</p>
      </template>
      <template v-else>
        <ElFormItem label="恶劣天气监听"><ElSwitch v-model="draft.weather.enabled" aria-label="恶劣天气监听" /></ElFormItem>
        <p class="dialog-note">预计次日零点生效。有效天气事件直接生成异常，运单结束或监听满 72 小时后停止。</p>
      </template>
      <p v-if="error" class="text-xs text-red-700" role="alert">{{ error }}</p>
    </ElForm>
    <template #footer><div class="dialog-footer"><span class="dialog-note">{{ draftOnly ? '项目完成保存后生效' : '调整不会延长原监听期限' }}</span><div class="dialog-actions"><button type="button" class="dialog-button" @click="emit('close')">取消</button><button type="button" class="dialog-button dialog-primary" @click="save">{{ draftOnly ? '确认' : '保存' }}</button></div></div></template>
  </AppDialog>
</template>

<style scoped>
.monitor-config{font-size:13px}.monitor-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 20px}.monitor-config :deep(.el-input-number){width:100%}.monitor-config :deep(.el-form-item__label){font-size:13px}.monitor-config :deep(.el-checkbox__label){font-size:13px}.monitor-config .dialog-note{line-height:1.8}@media(max-width:560px){.monitor-form-grid{grid-template-columns:1fr}}
</style>
