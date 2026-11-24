<script lang="ts" setup>
import { ref } from 'vue';

import { Icon } from '@packages/icon';

import { strokeIconPaths } from '../../strokeIconPaths';

import { assetMapState, requestMapFlyTo } from './assetMapStore';
import { generateSensitiveAreas } from './mockData';
import type { SensitiveArea } from './mockData';


const areas = ref<SensitiveArea[]>(generateSensitiveAreas(300));

function selectArea(area: SensitiveArea) {
  assetMapState.mode = 'sensitive';
  assetMapState.selectedAreaId = area.id;
  requestMapFlyTo(area.lat, area.lng, 12);
}

function hoverArea(id: string) {
  if (assetMapState.mode !== 'sensitive') assetMapState.mode = 'sensitive';
  assetMapState.hoverAreaId = id;
}

function unhoverArea() {
  assetMapState.hoverAreaId = '';
}
</script>

<template>
  <div class="mb-5">
    <!-- 标题区 -->
    <div class="mb-3 flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-md bg-red-50 text-red-600">
            <Icon :svg="strokeIconPaths.locate" :size="15" />
          </span>
          <h3 class="text-sm font-semibold text-slate-900">敏感区域</h3>
        </div>
        <p class="mt-1 pl-9 text-xs text-slate-500">
          客户圈定的重点监控点位 · 点击列表项地图定位并呈现 1km 敏感半径
        </p>
      </div>
      <p class="text-xs text-slate-400">共 {{ areas.length }} 个点位</p>
    </div>

    <!-- 列表 -->
    <div class="overflow-hidden rounded-xl border border-[#e4e4e0] bg-white">
      <div class="max-h-[360px] overflow-y-auto p-2">
        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="area in areas"
            :key="area.id"
            class="cursor-pointer rounded-lg px-3 py-2.5 transition"
            :class="assetMapState.selectedAreaId === area.id ? 'bg-red-50' : 'hover:bg-[#f7f7f5]'"
            @click="selectArea(area)"
            @mouseenter="hoverArea(area.id)"
            @mouseleave="unhoverArea()"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="min-w-0 truncate text-[13px] font-medium text-slate-900">{{ area.name }}</p>
              <span class="shrink-0 text-[11px] font-semibold text-slate-700">{{ area.waybillCount }} 单</span>
            </div>
            <p class="mt-0.5 truncate text-[11px] text-slate-400">{{ area.address }}</p>
            <p class="mt-0.5 text-[11px] text-slate-500">{{ area.region }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
