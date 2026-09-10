<script lang="ts" setup>
import { Icon } from '@packages/icon';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';
import { sensitiveHeader } from './mcpConfig';
import type { McpKeyValue } from './mcpConfig';

const rows = defineModel<McpKeyValue[]>({ required: true });
const props = defineProps<{ title: string; addLabel: string; environment?: boolean; secret?: boolean }>();
function update(index: number, field: keyof McpKeyValue, event: Event) {
  rows.value = rows.value.map((row, i) => i === index ? { ...row, [field]: (event.target as HTMLInputElement).value } : row);
}
</script>

<template>
  <fieldset class="mcp-pairs">
    <legend>{{ title }} <span>{{ rows.length }}</span></legend>
    <p v-if="environment">填写请求头名称和环境变量名，连接时从环境变量读取值。</p>
    <div v-for="(row, index) in rows" :key="index" class="mcp-pair-row">
      <input :value="row.key" class="ops-input" :aria-label="`${title} ${index + 1} 名称`" placeholder="名称" autocomplete="off" @input="update(index, 'key', $event)" />
      <input :value="row.value" class="ops-input" :type="secret || (!environment && sensitiveHeader(row.key)) ? 'password' : 'text'" :aria-label="`${title} ${index + 1} ${environment ? '环境变量名' : '值'}`" :placeholder="environment ? '环境变量名，如 MCP_API_KEY' : '值'" autocomplete="off" @input="update(index, 'value', $event)" />
      <button type="button" class="ops-secondary" :aria-label="`删除${title}第 ${index + 1} 行`" @click="rows = rows.filter((_, i) => i !== index)"><Icon :svg="strokeIconPaths.trash" :size="15" /></button>
    </div>
    <button type="button" class="ops-secondary mcp-add-row" @click="rows = [...rows, { key: '', value: '' }]"><Icon :svg="strokeIconPaths.plus" :size="14" />{{ props.addLabel }}</button>
  </fieldset>
</template>

<style scoped>
.mcp-pairs { min-width: 0; }
.mcp-pairs legend { margin-bottom: 8px; font-size: 13px; font-weight: 600; }
.mcp-pairs legend span { margin-left: 6px; color: #64748b; font-weight: 400; }
.mcp-pairs p { margin-bottom: 10px; color: #64748b; font-size: 12px; line-height: 1.6; }
.mcp-pair-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) 36px; gap: 8px; margin-bottom: 8px; }
.mcp-pair-row button { padding: 6px; }
.mcp-add-row { width: 100%; }
@media (max-width: 540px) {
  .mcp-pair-row { grid-template-columns: minmax(0, 1fr) 36px; padding-bottom: 10px; border-bottom: 1px solid #e2e2dc; }
  .mcp-pair-row input:nth-child(2) { grid-column: 1; grid-row: 2; }
  .mcp-pair-row button { grid-column: 2; grid-row: 1 / 3; align-self: start; }
}
</style>
