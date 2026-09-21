<script lang="ts" setup>
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import AppDialog from '@/components/AppDialog.vue';
import { useAgentOpsStore } from '@/pinia/agentOps';
import McpKeyValueRows from './McpKeyValueRows.vue';
import type { McpConfig } from './mcpConfig';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ serviceId: string }>();
const emit = defineEmits<{ remove: [id: string] }>();
const store = useAgentOpsStore();
const empty = (): McpConfig => ({ name: '', description: '', transport: 'Streamable HTTP', endpoint: '', auth: '无需认证', bearerToken: '', headers: [], timeout: 30 });
const draft = reactive<McpConfig>(empty());
const error = ref('');
watch(open, (value) => {
  if (!value) return;
  const service = store.tools.find((tool) => tool.id === props.serviceId && tool.kind === 'mcp');
  Object.assign(draft, empty(), service ? JSON.parse(JSON.stringify(service)) : {});
  if (draft.auth === 'Bearer Token') {
    draft.auth = '自定义请求头';
    draft.headers = [
      ...draft.headers.filter(row => row.key.trim().toLowerCase() !== 'authorization'),
      { key: 'Authorization', value: `Bearer ${draft.bearerToken.trim()}` },
    ];
    draft.bearerToken = '';
  }
  error.value = '';
});
function save() {
  try {
    store.saveMcp(draft, props.serviceId || undefined);
    open.value = false;
    ElMessage.success(props.serviceId ? 'MCP 服务已更新' : 'MCP 服务已添加');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败，请重试。'; }
}
</script>

<template>
  <AppDialog v-model="open" :title="serviceId ? '编辑 MCP 服务' : '新增 MCP 服务'" width="880px" class="ops-tool-dialog mcp-form-dialog">
    <form id="mcp-service-form" class="mcp-form" @submit.prevent="save">
      <label class="ops-field">名称<input v-model="draft.name" class="ops-input" maxlength="60" placeholder="MCP 服务名称" required /></label>
      <label class="ops-field">Description<textarea v-model="draft.description" class="ops-input" rows="2" placeholder="说明服务用途与适用场景" /></label>
      <label class="ops-field">Transport<select v-model="draft.transport" class="ops-input"><option>Streamable HTTP</option><option>SSE Legacy Transport</option></select></label>
      <label class="ops-field">URL<input v-model="draft.endpoint" class="ops-input" placeholder="https://mcp.example.com/mcp" required /></label>
      <label class="ops-field">认证方式<select v-model="draft.auth" class="ops-input"><option>无需认证</option><option>自定义请求头</option></select></label>
      <McpKeyValueRows v-model="draft.headers" title="请求头" add-label="添加请求头" />
      <label class="ops-field mcp-timeout">超时时间（秒）<input v-model.number="draft.timeout" type="number" class="ops-input" min="1" max="300" step="1" required /></label>
      <p class="mcp-demo-note">配置仅保存在当前演示会话中。保存后可测试连接、同步工具；修改连接信息后需重新同步。</p>
      <p v-if="error" class="mcp-error" role="alert">{{ error }}</p>
    </form>
    <template #footer><div class="mcp-form-footer"><button v-if="serviceId" type="button" class="ops-danger" @click="emit('remove', serviceId)">删除服务</button><div><button type="button" class="ops-secondary" @click="open = false">取消</button><button type="submit" form="mcp-service-form" class="ops-primary">保存</button></div></div></template>
  </AppDialog>
</template>

<style scoped>
.mcp-form { display: flex; flex-direction: column; gap: 20px; color: #334155; }
.mcp-timeout { max-width: 200px; }
.mcp-demo-note { border-top: 1px solid #e2e2dc; padding-top: 14px; font-size: 12px; line-height: 1.8; color: #64748b; }
.mcp-error { color: #b91c1c; font-size: 13px; }
.mcp-form-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.mcp-form-footer > div { display: flex; gap: 8px; margin-left: auto; }
</style>
