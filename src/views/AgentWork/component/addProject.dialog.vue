<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

import { Icon } from '@packages/icon';

import { agentWorkData } from '@/pinia/agentWork';

import { strokeIconPaths } from '../strokeIconPaths';

const store = agentWorkData();
const { showProjectModal } = storeToRefs(store);
const addressOptions = ['金隅水泥', '青岛啤酒', '今麦郎'];
const selectedAddress = ref('');
</script>

<template>
  <div v-if="showProjectModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
    <div class="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
      <div class="mb-5 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-slate-900">新建项目</h3>
        <button type="button" class="rounded-full p-2 text-slate-500 hover:bg-slate-100" @click="store.closeAddProjectModal()">
          <Icon :svg="strokeIconPaths.x" :size="18" />
        </button>
      </div>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <input class="rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="项目名称" />
          <select v-model="selectedAddress" class="rounded-md border border-slate-200 px-3 py-2 text-sm" aria-label="地址">
            <option value="" disabled>地址</option>
            <option v-for="address in addressOptions" :key="address" :value="address">{{ address }}</option>
          </select>
          <input class="rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="TMS 登录用户" />
          <input class="rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="运单关键词" />
          <select class="rounded-md border border-slate-200 px-3 py-2 text-sm">
            <option>在途</option>
            <option>装货中</option>
            <option>已到货</option>
          </select>
          <input class="rounded-md border border-slate-200 px-3 py-2 text-sm" placeholder="停车阈值，例如 60 分钟" />
        </div>
        <div class="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
          首次创建项目需要完成用户授权的目标 TMS 系统连接。连接成功后，系统将持续同步目标 TMS 运单并加入在途监控。
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-md border border-slate-200 px-4 py-2 text-sm" @click="store.closeAddProjectModal()">取消</button>
          <button type="button" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" @click="store.addDemoProject(selectedAddress || addressOptions[0])">
            创建并连接
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss"></style>
