<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue';
import { ElDialog, ElMessage } from 'element-plus';
import { useAgentOpsStore } from '@/pinia/agentOps';
import McpKeyValueRows from './McpKeyValueRows.vue';
import type { McpConfig } from './mcpConfig';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ serviceId: string }>();
const emit = defineEmits<{ remove: [id: string] }>();
const store = useAgentOpsStore();
const empty = (): McpConfig => ({ name: '', description: '', transport: 'Streamable HTTP', endpoint: '', args: [], bearerTokenEnvVar: '', headers: [], envHeaders: [], envVars: [], timeout: 30 });
const draft = reactive<McpConfig>(empty());
const error = ref('');
const argumentsText = ref('');
const stdio = computed(() => draft.transport === 'stdio');
watch(open, (value) => {
  if (!value) return;
  const service = store.tools.find((tool) => tool.id === props.serviceId && tool.kind === 'mcp');
  Object.assign(draft, empty(), service ? JSON.parse(JSON.stringify(service)) : {});
  argumentsText.value = draft.args.join('\n');
  error.value = '';
});
function save() {
  try {
    store.saveMcp({ ...draft, args: argumentsText.value.split('\n') }, props.serviceId || undefined);
    open.value = false;
    ElMessage.success(props.serviceId ? 'MCP 服务已更新' : 'MCP 服务已添加');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败，请重试。'; }
}
</script>

<template>
  <ElDialog v-model="open" :title="serviceId ? '编辑 MCP 服务' : '新增 MCP 服务'" width="880px" top="4vh" class="ops-tool-dialog mcp-form-dialog" :close-on-click-modal="false" append-to-body>
    <form id="mcp-service-form" class="mcp-form" @submit.prevent="save">
      <label class="ops-field">名称<input v-model="draft.name" class="ops-input" maxlength="60" placeholder="MCP 服务名称" required /></label>
      <label class="ops-field">Description<textarea v-model="draft.description" class="ops-input" rows="2" placeholder="说明服务用途与适用场景" /></label>
      <label class="ops-field">连接类型<select v-model="draft.transport" class="ops-input" :disabled="!!serviceId"><option>Streamable HTTP</option><option value="stdio">STDIO</option><option v-if="draft.transport === 'SSE'">SSE</option></select></label>
      <p v-if="serviceId" class="mcp-hint">连接类型创建后固定；如需切换，请删除后重新添加。</p>
      <template v-if="stdio">
        <label class="ops-field">启动命令<input v-model="draft.endpoint" class="ops-input" placeholder="例如：npx 或可执行文件路径" required /></label>
        <label class="ops-field">启动参数<textarea v-model="argumentsText" class="ops-input" rows="3" placeholder="每行一个参数" /><span class="mcp-hint">每行作为一个完整参数，按顺序传入。</span></label>
        <McpKeyValueRows v-model="draft.envVars" title="环境变量" add-label="添加环境变量" secret />
      </template>
      <template v-else>
        <label class="ops-field">URL<input v-model="draft.endpoint" class="ops-input" placeholder="https://mcp.example.com/mcp" required /></label>
        <label class="ops-field">Bearer Token 环境变量<input v-model="draft.bearerTokenEnvVar" class="ops-input" placeholder="MCP_BEARER_TOKEN" autocomplete="off" /><span class="mcp-hint">可选。填写保存 Token 的环境变量名。</span></label>
        <McpKeyValueRows v-model="draft.headers" title="请求头" add-label="添加请求头" />
        <McpKeyValueRows v-model="draft.envHeaders" title="环境变量请求头" add-label="添加环境变量请求头" environment />
      </template>
      <label class="ops-field mcp-timeout">超时时间（秒）<input v-model.number="draft.timeout" type="number" class="ops-input" min="1" max="300" step="1" required /></label>
      <p class="mcp-demo-note">演示配置保存在当前会话中，尚未连接真实 MCP 服务。服务方法由连接后发现；新增或修改连接信息后显示“尚未发现方法”。</p>
      <p v-if="error" class="mcp-error" role="alert">{{ error }}</p>
    </form>
    <template #footer><div class="mcp-form-footer"><button v-if="serviceId" type="button" class="ops-danger" @click="emit('remove', serviceId)">删除服务</button><div><button type="button" class="ops-secondary" @click="open = false">取消</button><button type="submit" form="mcp-service-form" class="ops-primary">保存</button></div></div></template>
  </ElDialog>
</template>

<style scoped>
.mcp-form { display: flex; flex-direction: column; gap: 20px; color: #334155; }
.mcp-hint { font-size: 12px; line-height: 1.6; font-weight: 400; color: #64748b; }
.mcp-timeout { max-width: 200px; }
.mcp-demo-note { border-top: 1px solid #e2e2dc; padding-top: 14px; font-size: 12px; line-height: 1.8; color: #64748b; }
.mcp-error { color: #b91c1c; font-size: 13px; }
.mcp-form-footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.mcp-form-footer > div { display: flex; gap: 8px; margin-left: auto; }
</style>
