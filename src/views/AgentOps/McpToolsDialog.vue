<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DeepReadonly } from 'vue';
import AppDialog from '@/components/AppDialog.vue';
import type { McpTool } from '@/pinia/agentOps';
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ service?: DeepReadonly<McpTool> }>();
const search = ref('');
const filtered = computed(() => props.service?.methods.filter(method => `${method.name} ${method.title ?? ''} ${method.description}`.toLowerCase().includes(search.value.trim().toLowerCase())) ?? []);
watch(open, () => { search.value = ''; });
</script>
<template>
  <AppDialog v-model="open" :title="`${service?.name ?? 'MCP'} · 工具列表`" width="960px" class="ops-tool-dialog">
    <div v-if="service" class="mcp-tools-content">
      <div class="mcp-tools-toolbar"><label>搜索工具<input v-model="search" class="ops-input" placeholder="搜索工具名称或描述" /></label><span>{{ filtered.length }} / {{ service.methods.length }} 个工具</span></div>
      <p class="mcp-tools-note">{{ service.discovery === 'demo' ? '以下为示例工具，尚未从服务同步。' : service.lastSyncedAt ? `最近成功同步：${service.lastSyncedAt}。工具属性由服务提供，只读展示。` : '尚未同步工具，请先同步服务。' }}</p>
      <details v-for="method in filtered" :key="method.name" class="mcp-tool-definition">
        <summary><strong>{{ method.title || method.name }}</strong><code v-if="method.title">{{ method.name }}</code><span>{{ method.description || '暂无描述' }}</span></summary>
        <div class="mcp-tool-schemas"><section v-for="schema in (['inputSchema', 'outputSchema'] as const)" :key="schema"><h4>{{ schema === 'inputSchema' ? '输入参数 Schema' : '输出参数 Schema' }}</h4><pre v-if="method[schema]">{{ JSON.stringify(method[schema], null, 2) }}</pre><p v-else>服务未声明</p></section></div>
      </details>
      <p v-if="!filtered.length" class="mcp-tools-empty">{{ search ? '没有匹配的工具。' : service.discovery === 'synced' ? '服务本次返回 0 个工具。' : '暂无工具定义。' }}</p>
    </div>
    <template #footer><button class="ops-secondary" type="button" @click="open = false">关闭</button></template>
  </AppDialog>
</template>
<style scoped>
.mcp-tools-content { color: #334155; }
.mcp-tools-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; }
.mcp-tools-toolbar label { flex: 1; min-width: 180px; font-size: 12px; }
.mcp-tools-toolbar input { display: block; margin-top: 8px; }
.mcp-tools-toolbar > span, .mcp-tools-note { font-size: 12px; color: #64748b; line-height: 1.8; }
.mcp-tools-note { margin: 16px 0; }
.mcp-tool-definition { border-top: 1px solid #e2e2dc; padding: 16px 0; }
.mcp-tool-definition summary { cursor: pointer; font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.mcp-tool-definition summary strong { font-weight: 600; }
.mcp-tool-definition summary code { margin-left: 8px; font-size: 12px; }
.mcp-tool-definition summary span { display: block; margin: 6px 0 0 16px; color: #64748b; }
.mcp-tool-definition summary:focus-visible { outline: 2px solid #64748b; outline-offset: 4px; }
.mcp-tool-schemas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
.mcp-tool-schemas h4 { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
.mcp-tool-schemas pre { padding: 12px; background: #f7f7f5; border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.7; }
.mcp-tool-schemas p, .mcp-tools-empty { color: #64748b; font-size: 12px; padding: 16px 0; }
@media (max-width: 640px) { .mcp-tool-schemas { grid-template-columns: 1fr; } }
</style>
