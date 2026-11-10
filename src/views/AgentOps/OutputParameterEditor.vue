<script setup lang="ts">
import type { ToolParameter } from '@/pinia/agentOps';
defineOptions({ name: 'OutputParameterEditor' });
defineProps<{ parameters: ToolParameter[]; readonly?: boolean }>();
function addChild(param: ToolParameter) { param.children ||= []; param.children.push({ name: '', type: 'string', required: false, description: '' }); }
</script>
<template>
  <div v-for="(param, index) in parameters" :key="index" class="parameter-row">
    <div class="parameter-fields">
      <input v-if="!readonly" v-model="param.name" class="ops-input" aria-label="出参名称" placeholder="参数名称" /><code v-else>{{ param.name }}</code>
      <select v-if="!readonly" v-model="param.type" class="ops-input" aria-label="出参类型"><option v-for="type in ['string','number','boolean','object','array']" :key="type">{{ type }}</option></select><span v-else>{{ param.type }}</span>
      <textarea v-if="!readonly" v-model="param.description" class="ops-input" rows="2" aria-label="出参说明" placeholder="参数说明" /><span v-else class="whitespace-pre-wrap">{{ param.description }}</span>
      <div v-if="!readonly" class="flex gap-2 text-xs whitespace-nowrap"><button type="button" @click="addChild(param)">添加子参数</button><button type="button" class="text-red-600" @click="parameters.splice(index,1)">删除</button></div>
    </div>
    <div v-if="param.children?.length" class="parameter-children"><OutputParameterEditor :parameters="param.children" :readonly="readonly" /></div>
  </div>
</template>
<style scoped>
.parameter-row{border-bottom:1px solid #e2e2dc;padding:12px 0}.parameter-fields{display:grid;grid-template-columns:minmax(100px,1fr) 100px minmax(160px,2fr) auto;gap:10px;align-items:start}.parameter-children{margin-left:20px;border-left:2px solid #e2e2dc;padding-left:12px}@media(max-width:700px){.parameter-fields{grid-template-columns:1fr 100px}.parameter-children{margin-left:8px}}
</style>
