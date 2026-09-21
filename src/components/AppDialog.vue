<script setup lang="ts">
import { ElDialog } from 'element-plus';

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ modelValue: boolean; title?: string; width?: string | number }>(), { title: '', width: '580px' });
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    :width="width"
    align-center
    append-to-body
    :close-on-click-modal="false"
    modal-class="app-dialog-overlay"
    transition="app-dialog-fade"
    v-bind="$attrs"
    class="app-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-for="(_, name) in $slots" #[name]="scope">
      <slot :name="name" v-bind="scope || {}" />
    </template>
  </ElDialog>
</template>
