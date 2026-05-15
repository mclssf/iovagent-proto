<script lang="ts" setup>
import { ElConfigProvider, ElLoading } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';

import { useShuzirenSystemStore } from './store/modules/project';

const shuzirenSystem = useShuzirenSystemStore();
const vLoading = ElLoading.directive;
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <div style="height: 100%; width: 100%" v-loading="shuzirenSystem.pageLoading">
      <RouterView />
    </div>
  </ElConfigProvider>
</template>

<style lang="scss">
html,
body {
  width: 100vw;
  height: 100vh;
  min-width: 1280px;
  margin: 0;
  color: #172033;
  background: #f5f7fb;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  touch-action: manipulation;
}
#app {
  width: 100%;
  height: 100%;
}
</style>
