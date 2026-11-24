<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import MenuComp from './component/menu.comp.vue';

const route = useRoute();
const isFullBleedRoute = computed(() => ['agent-work-agent', 'agent-work-long-tasks'].includes(String(route.name)));
</script>

<template>
  <div class="grid h-screen grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-[#f7f7f6] text-slate-900">
    <MenuComp />

    <main class="h-full overflow-hidden" :class="isFullBleedRoute ? 'bg-[#fcfcfc] p-0' : 'bg-[#f7f7f5] p-3'">
      <RouterView />
    </main>
  </div>
</template>

<style lang="scss" scoped></style>
