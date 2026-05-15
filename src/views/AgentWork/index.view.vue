<script lang="ts" setup>
import AddProjectDialog from './component/addProject.dialog.vue';
import HeaderComp from './component/header.comp.vue';
import MenuComp from './component/menu.comp.vue';
</script>

<template>
  <div class="min-h-screen bg-[#f5f7fb] text-slate-900">
    <HeaderComp />

    <div class="grid h-[calc(100vh-64px)] grid-cols-[280px_1fr] overflow-hidden">
      <MenuComp />

      <main class="h-full overflow-hidden p-5">
        <RouterView />
      </main>
    </div>

    <AddProjectDialog />
  </div>
</template>

<style lang="scss" scoped></style>
