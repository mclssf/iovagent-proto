<script setup lang="ts">
import { ref } from 'vue';
import { ElForm, ElFormItem, ElInput, ElOption, ElSelect } from 'element-plus';
import AppDialog from '@/components/AppDialog.vue';
import { usePhase1 } from '@/pinia/phase1';
import type { P1State } from '@/views/AgentWork/interface';
import { stateNames } from './catalog';
const props = defineProps<{ id: string; state?: P1State }>();
const emit = defineEmits<{ close: [] }>();
const store = usePhase1();
const reason = ref('');
const conclusion = ref('');
const state = ref<P1State>(props.state ?? 'pending');
const error = ref('');
function save() {
  if (!reason.value.trim()) { error.value = '请填写纠正原因'; return; }
  error.value = props.state ? store.progress(props.id, state.value, reason.value) : store.correctResult(props.id, conclusion.value, reason.value);
  if (!error.value) emit('close');
}
</script>
<template>
  <AppDialog :model-value="true" :title="props.state ? '运输状态纠正' : '事件结果纠正'" width="520px" @update:model-value="emit('close')">
    <ElForm label-position="top" @submit.prevent="save">
      <ElFormItem v-if="props.state" label="正确状态"><ElSelect v-model="state" aria-label="正确状态"><ElOption v-for="(label, value) in stateNames" :key="value" :value="value" :label="label" /></ElSelect></ElFormItem>
      <ElFormItem v-else label="纠正结论"><ElInput v-model="conclusion" placeholder="例如：已核实为合理停车" /></ElFormItem>
      <ElFormItem label="纠正原因"><ElInput v-model="reason" type="textarea" :rows="3" placeholder="填写核实依据" /></ElFormItem>
      <p class="dialog-note">保留原始事实和纠正记录；已结束的监听不会因此重启。</p>
      <p v-if="error" role="alert" class="mt-3 text-xs text-red-700">{{ error }}</p>
    </ElForm>
    <template #footer><div class="dialog-actions"><button class="dialog-button" @click="emit('close')">取消</button><button class="dialog-button dialog-primary" @click="save">保存</button></div></template>
  </AppDialog>
</template>
