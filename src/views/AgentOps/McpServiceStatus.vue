<script setup lang="ts">
import { computed } from 'vue';
import type { DeepReadonly } from 'vue';
import { useAgentOpsStore } from '@/pinia/agentOps';
import type { McpTool } from '@/pinia/agentOps';
const props = defineProps<{ service: DeepReadonly<McpTool> }>();
const emit = defineEmits<{ viewTools: [] }>();
const store = useAgentOpsStore();
const busy = computed(() => props.service.activity !== 'idle');
const connectionLabel = computed(() => props.service.activity === 'testing' ? '测试中…' : props.service.connectionStatus === 'connected' ? '正常' : props.service.connectionStatus === 'error' ? '异常' : '未测试');
</script>
<template>
  <div class="mcp-service-status" :aria-busy="busy">
    <dl class="mcp-status-grid">
      <dt>连接状态</dt><dd><span class="mcp-connection" :class="service.connectionStatus" :title="service.lastTestedAt ? `最近检测：${service.lastTestedAt}` : ''">{{ connectionLabel }}</span></dd>
      <dt>Transport</dt><dd>{{ service.transport }}</dd>
      <dt>工具</dt><dd>{{ service.discovery === 'pending' ? '尚未同步' : `${service.methods.length} 个` }}<span v-if="service.discovery === 'demo'" class="mcp-sample">示例</span></dd>
      <dt>认证</dt><dd>{{ service.auth }}</dd>
      <dt>最近同步</dt><dd>{{ service.lastSyncedAt || '尚未同步' }}</dd>
      <dt>协议版本</dt><dd>{{ service.protocolVersion || '尚未协商' }}</dd>
    </dl>
    <p v-if="service.connectionStatus === 'error' && service.connectionResult" class="mcp-result is-error" role="status">{{ service.connectionResult }}</p>
    <p v-else-if="service.lastTestedAt" class="mcp-tested">最近检测：{{ service.lastTestedAt }}</p>
    <p v-if="service.activity === 'syncing' || service.syncResult" class="mcp-result" :class="{ 'is-error': service.activity !== 'syncing' && service.syncStatus === 'error' }" role="status">{{ service.activity === 'syncing' ? '正在同步工具…' : service.syncResult }}<span v-if="service.activity !== 'syncing' && service.syncStatus === 'error'" class="mcp-attempt">{{ service.lastSyncAttemptAt }}</span></p>
    <div class="mcp-status-actions">
      <button type="button" class="ops-secondary" :disabled="busy" @click="store.testMcpConnection(service.id)">{{ service.activity === 'testing' ? '测试中…' : '测试连接' }}</button>
      <button type="button" class="ops-secondary" :disabled="busy" @click="store.syncMcpTools(service.id)">{{ service.activity === 'syncing' ? '同步中…' : '同步工具' }}</button>
      <button type="button" class="ops-secondary" @click="emit('viewTools')">查看工具</button>
    </div>
  </div>
</template>
<style scoped>
.mcp-status-grid { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 10px 16px; font-size: 13px; line-height: 1.6; }
.mcp-status-grid dt { color: #64748b; }
.mcp-status-grid dd { color: #334155; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.mcp-connection { display: inline-flex; align-items: center; gap: 6px; }
.mcp-connection::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; }
.mcp-connection.connected { color: #21623b; }
.mcp-connection.connected::before { background: #30804b; }
.mcp-connection.error, .mcp-result.is-error { color: #b42318; }
.mcp-connection.error::before { background: #b42318; }
.mcp-sample { margin-left: 8px; padding: 2px 5px; background: #f2f2ef; color: #64748b; font-size: 11px; border-radius: 3px; }
.mcp-result, .mcp-tested { margin-top: 12px; font-size: 12px; line-height: 1.8; color: #64748b; overflow-wrap: anywhere; }
.mcp-attempt { display: block; }
.mcp-status-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.mcp-status-actions button { font-size: 12px; }
</style>
