<script lang="ts" setup>
import type { WechatEmployeeSource } from '@/pinia/dataEmployeeSkills';

defineProps<{ source: WechatEmployeeSource }>();
</script>

<template>
  <div class="min-w-0 text-sm text-slate-800">
    <dl class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
      <div class="min-w-0">
        <dt class="text-xs leading-5 text-slate-500">数据获取方式</dt>
        <dd class="mt-1 break-words font-medium leading-6">{{ source.acquisitionMethod }}</dd>
      </div>
      <div class="min-w-0">
        <dt class="text-xs leading-5 text-slate-500">来源群</dt>
        <dd class="mt-1 break-words font-medium leading-6">{{ source.groupName }}</dd>
      </div>
      <div class="min-w-0">
        <dt class="text-xs leading-5 text-slate-500">微信账号</dt>
        <dd class="mt-1 break-words font-medium leading-6">{{ source.accountName }}</dd>
        <dd class="mt-0.5 break-all text-xs leading-5 text-slate-600">微信号：{{ source.wechatId }}</dd>
      </div>
      <div class="min-w-0">
        <dt class="text-xs leading-5 text-slate-500">在线状态</dt>
        <dd class="mt-1">
          <span
            class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium leading-4"
            :class="source.onlineStatus === 'online' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></span>
            {{ source.onlineStatus === 'online' ? '微信在线' : '微信离线' }}
          </span>
        </dd>
      </div>
    </dl>

    <section class="mt-6 border-t border-[#e2e2dc] pt-4">
      <h3 class="text-sm font-semibold leading-6 text-slate-900">识别方式</h3>
      <p class="mt-2 break-words text-sm leading-7 text-slate-600">{{ source.recognitionDescription }}</p>
    </section>

    <p v-if="source.onlineStatus === 'offline'" class="mt-4 rounded-md bg-amber-50 px-3 py-2.5 text-xs leading-6 text-amber-900">
      微信账号当前离线，暂不获取新消息。已有绑定和项目配置保留，账号上线后继续获取。
    </p>
    <p class="mt-4 text-xs leading-6 text-slate-500">每位群消息录单员对应一个微信账号和一个来源群，绑定由企业管理员维护。</p>
  </div>
</template>
