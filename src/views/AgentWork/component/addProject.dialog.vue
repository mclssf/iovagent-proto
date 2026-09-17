<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

import AppDialog from '@/components/AppDialog.vue';

import { agentWorkData } from '@/pinia/agentWork';


const store = agentWorkData();
const { showProjectModal } = storeToRefs(store);
const addressOptions = ['金隅水泥', '青岛啤酒', '今麦郎'];
const selectedAddress = ref('');
</script>

<template>
  <AppDialog :model-value="showProjectModal" title="新建项目" @update:model-value="store.closeAddProjectModal()">
      <div class="space-y-4">
        <div class="dialog-form-grid">
          <input class="rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm" placeholder="项目名称" />
          <select v-model="selectedAddress" class="rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm" aria-label="地址">
            <option value="" disabled>地址</option>
            <option v-for="address in addressOptions" :key="address" :value="address">{{ address }}</option>
          </select>
          <input class="rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm" placeholder="TMS 登录用户" />
          <input class="rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm" placeholder="运单关键词" />
          <select class="rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm">
            <option>在途</option>
            <option>装货中</option>
            <option>已到货</option>
          </select>
          <input class="rounded-md border border-[#deded9] bg-[#fbfbfa] px-3 py-2 text-sm" placeholder="停车阈值，例如 60 分钟" />
        </div>
        <div class="rounded-md bg-[#f7f7f5] p-4 text-sm text-slate-600">
          首次创建项目需要完成用户授权的目标 TMS 系统连接。连接成功后，系统将持续同步目标 TMS 运单并加入在途监控。
        </div>
      </div>
      <template #footer><div class="dialog-actions">
          <button type="button" class="dialog-button" @click="store.closeAddProjectModal()">取消</button>
          <button type="button" class="dialog-button dialog-primary" @click="store.addDemoProject(selectedAddress || addressOptions[0])">
            创建并连接
          </button>
      </div></template>
  </AppDialog>
</template>

<style lang="scss"></style>
