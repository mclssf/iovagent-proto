<script setup lang="ts">
defineProps<{ createdAt?: number }>();
</script>

<template>
  <div class="w-full py-5 text-center" role="separator" aria-label="已开始新对话">
    <div class="flex items-center gap-3 text-xs text-slate-400">
      <span class="min-w-4 flex-1 border-t border-slate-200"></span>
      <span class="min-w-0 px-3 py-1 leading-5 text-slate-500">已为您开启新对话，后续提问不会带入此前聊天记录。</span>
      <span class="min-w-4 flex-1 border-t border-slate-200"></span>
    </div>
    <p v-if="createdAt" class="mt-1 text-[11px] text-slate-400">{{ new Date(createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }}</p>
  </div>
</template>
