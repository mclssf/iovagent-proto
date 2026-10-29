<script lang="ts" setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import AppDialog from '@/components/AppDialog.vue';
import { Icon } from '@packages/icon';
import { useAgentOpsStore } from '@/pinia/agentOps';
import type { AgentCallableSkill, ManagedTool, ToolKind } from '@/pinia/agentOps';
import type { CodeTool, CodeToolVersion } from '@/pinia/agentOps';
import type { CustomerAgentTarget } from '@/pinia/customerAgents';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';
import McpServiceForm from './McpServiceForm.vue';
import McpServiceStatus from './McpServiceStatus.vue';
import McpToolsDialog from './McpToolsDialog.vue';
import { sensitiveHeader } from './mcpConfig';

const emit = defineEmits<{ editSkill: [skill: AgentCallableSkill]; editCustomerAgent: [target: CustomerAgentTarget] }>();
const store = useAgentOpsStore();
const tab = ref<ToolKind>('mcp');
const search = ref('');
const selectedToolId = ref('');
const selectedTool = computed(() => store.tools.find((tool) => tool.id === selectedToolId.value));
const detailOpen = ref(false);
const draft = ref<CodeTool>();
const editingTool = ref(false);
const historyOpen = ref(false);
const historyId = ref('');
const historical = ref<CodeToolVersion>();
const history = computed(() => [...store.toolVersions(historyId.value)].reverse());
const historyDetailOpen = ref(false);
function openHistory(id: string) { historyId.value = id; historyOpen.value = true; }
function setOutputEnabled(name: string, enabled: boolean) { const param = draft.value?.outputs.find(item => item.name === name); if (param) param.enabled = enabled; }
function saveTool() {
  if (!draft.value) return;
  try {
    store.saveCodeTool(draft.value.id, draft.value.description, draft.value.outputs);
    detailOpen.value = false;
    ElMessage.success('已保存并生成新版本');
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '保存失败'); }
}
function restoreVersion() {
  if (!historical.value) return;
  try {
    store.restoreCodeTool(historyId.value, historical.value.version);
    historyDetailOpen.value = false;
    ElMessage.success('已恢复历史配置，并生成新版本');
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '恢复失败'); }
}
const toolsDialogOpen = ref(false);
const toolsServiceId = ref('');
const toolsService = computed(() => { const tool = store.tools.find(item => item.id === toolsServiceId.value); return tool?.kind === 'mcp' ? tool : undefined; });
const serviceFormOpen = ref(false);
const editingServiceId = ref('');
const deleteOpen = ref(false);
const deletingServiceId = ref('');
const deletingService = computed(() => store.tools.find((tool) => tool.id === deletingServiceId.value));
const deleteUsage = computed(() => store.mcpUsage(deletingServiceId.value));
const deleteError = ref('');
const kinds: { id: ToolKind; label: string }[] = [{ id: 'mcp', label: 'MCP 服务' }, { id: 'code', label: '内置API工具' }];
const filteredTools = computed(() => store.tools.filter((tool) => {
  const query = search.value.trim().toLowerCase();
  return tool.kind === tab.value
    && (!query || `${tool.name} ${tool.id} ${tool.description}`.toLowerCase().includes(query));
}));
const filteredMcps = computed(() => filteredTools.value.filter(tool => tool.kind === 'mcp'));
const filteredCodeTools = computed(() => filteredTools.value.filter(tool => tool.kind === 'code'));
function viewMcpTools(id: string) {
  toolsServiceId.value = id;
  detailOpen.value = false;
  toolsDialogOpen.value = true;
}
function showTool(tool: ManagedTool, edit = false) {
  editingTool.value = edit && tool.kind === 'code';
  draft.value = tool.kind === 'code' ? JSON.parse(JSON.stringify(tool)) : undefined;
  selectedToolId.value = tool.id;
  detailOpen.value = true;
}
function configureSkill(skill: AgentCallableSkill) {
  detailOpen.value = false;
  emit('editSkill', skill);
}
function configureAgent(target: CustomerAgentTarget) {
  detailOpen.value = false;
  emit('editCustomerAgent', target);
}
function editService(id = '') {
  editingServiceId.value = id;
  detailOpen.value = false;
  serviceFormOpen.value = true;
}
function requestDelete(id: string) {
  deletingServiceId.value = id;
  deleteError.value = '';
  deleteOpen.value = true;
}
function deleteService() {
  try {
    store.deleteMcp(deletingServiceId.value);
    deleteOpen.value = false;
    serviceFormOpen.value = false;
    detailOpen.value = false;
    ElMessage.success('MCP 服务已删除，相关加载引用已移除');
  } catch (error) { deleteError.value = error instanceof Error ? error.message : '删除失败，请重试。'; }
}
async function syncCodeTools() {
  try { await store.syncCodeTools(); }
  catch { /* The inline status displays the failure without discarding the catalog. */ }
}
</script>

<template>
  <section class="tool-management flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#e2e2dc] px-5 py-4">
      <div><h2 class="text-base font-semibold">Tool 管理</h2><p class="mt-1 text-xs leading-5 text-slate-500">{{ tab === 'mcp' ? '管理 MCP 服务连接，测试连接并同步工具定义。' : '管理内置API工具的描述、输出参数及历史版本。' }}</p></div>
      <button v-if="tab === 'mcp'" type="button" class="ops-primary" @click="editService()"><Icon :svg="strokeIconPaths.plus" :size="15" />新增 MCP 服务</button>
      <button v-else type="button" class="ops-primary" :disabled="store.codeToolSync.busy" @click="syncCodeTools"><Icon :svg="strokeIconPaths.refresh" :size="15" />{{ store.codeToolSync.busy ? '同步中…' : '现在同步' }}</button>
    </div>
    <div class="flex shrink-0 gap-6 border-b border-[#e2e2dc] px-5" role="tablist" aria-label="Tool 类型">
      <button v-for="kind in kinds" :key="kind.id" type="button" role="tab" :aria-selected="tab === kind.id" :class="['tool-tab', { active: tab === kind.id }]" @click="tab = kind.id">
        {{ kind.label }}<span class="ml-2 text-xs tabular-nums text-slate-500">{{ store.tools.filter((tool) => tool.kind === kind.id).length }}</span>
      </button>
    </div>
    <div v-if="tab === 'code'" class="ops-sync-status" :class="{ 'is-error': store.codeToolSync.error }" :role="store.codeToolSync.error ? 'alert' : 'status'" aria-live="polite"><span>{{ store.codeToolSync.error || store.codeToolSync.summary || '同步读取演示工程中的最新内置API工具，保留加载配置。' }}</span><span v-if="store.codeToolSync.lastSyncedAt">上次成功同步：{{ store.codeToolSync.lastSyncedAt }}</span></div>
    <div class="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#e2e2dc] px-5 py-3">
      <label class="relative w-full min-w-0 sm:max-w-[360px] sm:flex-1"><Icon :svg="strokeIconPaths.search" :size="15" svg-class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input v-model="search" class="ops-input ops-search" aria-label="搜索 Tool" placeholder="搜索名称、ID 或描述" /></label>
      <span class="text-xs text-slate-500">{{ filteredTools.length }} 个{{ tab === 'mcp' ? '服务' : '工具' }}</span>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <div v-if="tab === 'mcp'" class="mcp-service-grid">
        <article v-for="service in filteredMcps" :key="service.id" class="mcp-service-card" :aria-label="service.name">
          <header class="mcp-card-header"><div><h3><button type="button" @click="showTool(service)">{{ service.name }}</button></h3><p>{{ service.description || '暂无描述' }}</p></div><div class="mcp-card-edit"><button type="button" :aria-label="`查看 ${service.name}`" @click="showTool(service)">详情</button><button type="button" :aria-label="`编辑 ${service.name}`" @click="editService(service.id)">编辑</button><button type="button" class="mcp-delete" :aria-label="`删除 ${service.name}`" @click="requestDelete(service.id)">删除</button></div></header>
          <p class="mcp-card-endpoint">{{ service.endpoint }}</p>
          <McpServiceStatus :service="service" @view-tools="viewMcpTools(service.id)" />
        </article>
      </div>
      <table v-else class="tool-table">
        <thead><tr><th>工具名称 / Description</th><th class="w-48 whitespace-nowrap">操作</th></tr></thead>
        <tbody>
          <tr v-for="tool in filteredCodeTools" :key="tool.id">
            <td><button type="button" class="font-medium text-slate-950 hover:underline" @click="showTool(tool)">{{ tool.name }}</button><div class="mt-1 break-all font-mono text-xs text-slate-500">{{ tool.id }}</div><p class="mt-2 text-xs leading-5 text-slate-600">{{ tool.description }}</p></td>
            <td><div class="flex items-center gap-4 whitespace-nowrap text-xs"><button type="button" class="text-slate-700 hover:underline" :aria-label="`查看 ${tool.name}`" @click="showTool(tool)">详情</button><button type="button" :aria-label="`编辑 ${tool.name}`" @click="showTool(tool, true)">编辑</button><button type="button" @click="openHistory(tool.id)">历史记录</button></div></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!filteredTools.length" class="px-5 py-16 text-center"><p class="text-sm text-slate-600">未找到符合条件的 Tool</p><button class="mt-3 text-xs underline" type="button" @click="search = ''">清空筛选</button></div>
    </div>

    <AppDialog v-model="detailOpen" :title="`${selectedTool?.name || ''}${editingTool ? ' · 编辑' : ' · 详情'}`" width="960px" class="ops-tool-dialog">
      <div v-if="selectedTool" class="space-y-6 text-slate-700">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <code class="text-xs">{{ selectedTool.id }}</code>
            <span v-if="store.getToolLoading(selectedTool.id).direct" class="loading-badge direct">Agent 直接加载</span>
            <span v-if="store.getToolLoading(selectedTool.id).private" class="loading-badge private">私有化加载</span>
            <span v-if="store.getToolLoading(selectedTool.id).unloaded" class="loading-badge unloaded">未配置加载</span>
            <span class="text-xs text-slate-500">{{ selectedTool.kind === 'code' ? '工程更新于' : '更新于' }} {{ selectedTool.updatedAt }}</span>
          </div>
          <p class="mt-3 text-xs leading-5 text-slate-500">{{ selectedTool.kind === 'code' ? (editingTool ? '可编辑描述、输出参数说明及启用状态，保存后生成历史版本。' : '当前为只读详情，可在列表点击“编辑”修改配置。') : '连接属性可编辑，工具定义从 MCP 服务同步。' }}</p>
          <div class="mt-4 flex items-center gap-3"><h3 class="text-xs font-semibold">Description</h3></div><label v-if="draft && editingTool" class="ops-field mt-2"><span class="sr-only">Description</span><textarea v-model="draft.description" class="ops-input" rows="3" maxlength="200" aria-label="Description" /><span class="text-right text-xs text-slate-500">{{ draft.description.length }}/200</span></label>
          <p v-else class="mt-1 whitespace-pre-wrap text-sm leading-6">{{ selectedTool.description }}</p>
        </div>
        <template v-if="selectedTool.kind === 'mcp'">
          <McpServiceStatus :service="selectedTool" @view-tools="viewMcpTools(selectedTool.id)" />
          <section><h3 class="mb-3 font-semibold">连接信息</h3><dl class="tool-properties"><dt>服务地址</dt><dd class="font-mono">{{ selectedTool.endpoint }}</dd><dt>服务名称</dt><dd>{{ selectedTool.provider || '尚未协商' }}</dd><dt>服务版本</dt><dd>{{ selectedTool.version || '尚未协商' }}</dd><dt>超时时间</dt><dd>{{ selectedTool.timeout }} 秒</dd></dl></section>
          <section><h3 class="mb-3 font-semibold">请求头</h3><dl v-if="selectedTool.headers.length" class="tool-properties"><template v-for="row in selectedTool.headers" :key="row.key"><dt class="break-all">{{ row.key }}</dt><dd class="font-mono">{{ sensitiveHeader(row.key) ? '••••••••' : row.value }}</dd></template></dl><p v-else class="text-xs text-slate-500">未配置</p></section>
        </template>
        <template v-else>
          <dl class="tool-properties"><dt>运行环境</dt><dd>{{ selectedTool.runtime }}</dd><dt>代码入口</dt><dd class="font-mono">{{ selectedTool.entrypoint }}</dd></dl>
          <section v-for="direction in (['inputs', 'outputs'] as const)" :key="direction"><h3 class="mb-3 font-semibold">{{ direction === 'inputs' ? '输入参数' : '输出参数' }}（{{ selectedTool[direction].length }}）</h3><table class="tool-table"><thead><tr><th>参数名称</th><th>类型</th><th v-if="direction === 'inputs'">必填</th><th>说明</th><th v-if="direction === 'outputs'">状态</th></tr></thead><tbody><tr v-for="param in (direction === 'outputs' && draft ? draft.outputs : selectedTool[direction])" :key="param.name"><td class="font-mono text-xs">{{ param.name }}</td><td class="font-mono text-xs">{{ param.type }}</td><td v-if="direction === 'inputs'">{{ param.required ? '是' : '否' }}</td><td><textarea v-if="direction === 'outputs' && editingTool" v-model="param.description" class="ops-input" rows="2" :aria-label="`${param.name} 参数说明`" /><span v-else>{{ param.description }}</span></td><td v-if="direction === 'outputs'"><label class="flex items-center gap-2 whitespace-nowrap text-xs"><input v-if="editingTool" type="checkbox" :checked="param.enabled !== false" :aria-label="`${param.name} 启用`" @change="setOutputEnabled(param.name, ($event.target as HTMLInputElement).checked)" />{{ param.enabled !== false ? '已启用' : '已禁用' }}</label></td></tr></tbody></table><p v-if="!selectedTool[direction].length" class="py-4 text-xs text-slate-500">无{{ direction === 'inputs' ? '输入' : '输出' }}参数</p></section>
        </template>
        <section><h3 class="mb-3 font-semibold">Agent 默认配置</h3><div class="flex flex-wrap gap-2"><span v-for="agent in store.agentsUsingToolByDefault(selectedTool.id)" :key="agent.id" class="skill-link">{{ agent.name }}</span><p v-if="!store.agentsUsingToolByDefault(selectedTool.id).length" class="text-xs text-slate-500">未配置默认直接加载。</p></div></section>
        <section><h3 class="mb-3 font-semibold">直接加载的客户 Agent（{{ store.customerAgentsForTool(selectedTool.id).length }}）</h3><div class="flex flex-wrap gap-2"><button v-for="agent in store.customerAgentsForTool(selectedTool.id)" :key="agent.id" class="skill-link" type="button" @click="configureAgent(agent)">{{ agent.name }} · {{ agent.mode === 'default' ? '遵循默认' : '自定义' }}</button></div><p v-if="!store.customerAgentsForTool(selectedTool.id).length" class="text-xs text-slate-500">暂无 客户 Agent 直接加载，可在客户 Agent 配置页中添加。</p></section>
        <section><h3 class="mb-3 font-semibold">私有化加载的 Skill（{{ store.skillsForTool(selectedTool.id).length }}）</h3><div class="flex flex-wrap gap-2"><button v-for="skill in store.skillsForTool(selectedTool.id)" :key="skill.id" class="skill-link" type="button" @click="configureSkill(skill)">{{ skill.name }} · {{ skill.enabled ? '已启用' : '已禁用' }}</button></div><p v-if="!store.skillsForTool(selectedTool.id).length" class="text-xs text-slate-500">尚未关联 Skill，可在 Skill 管理中添加私有加载绑定。</p></section>
      </div>
      <template #footer><div class="flex flex-wrap justify-end gap-2"><button class="ops-secondary" type="button" @click="detailOpen = false">{{ editingTool ? '取消' : '关闭' }}</button><button v-if="draft && editingTool" class="ops-primary" type="button" @click="saveTool">保存</button><button v-if="selectedTool?.kind === 'mcp'" class="ops-secondary" type="button" @click="editService(selectedTool.id)">编辑服务</button></div></template>
    </AppDialog>

    <AppDialog v-model="historyOpen" title="工具历史记录" width="760px">
      <table class="tool-table"><thead><tr><th>版本</th><th>保存时间</th><th>操作</th><th>操作人</th><th>详情</th></tr></thead><tbody><tr v-for="version in history" :key="version.version"><td>V{{ version.version }}{{ version.version === history[0]?.version ? '（当前）' : '' }}</td><td>{{ version.savedAt }}</td><td>{{ version.action }}</td><td>{{ version.savedBy || (version.version === 1 ? '系统初始化' : '当前运营用户') }}</td><td><button type="button" class="underline" @click="historical = version; historyDetailOpen = true">查看详情</button></td></tr></tbody></table>
      <template #footer><button type="button" class="ops-secondary" @click="historyOpen = false">关闭</button></template>
    </AppDialog>
    <AppDialog v-model="historyDetailOpen" :title="`${historical?.tool.name || ''} · V${historical?.version || ''}`" width="900px">
      <div v-if="historical" class="space-y-5 text-sm text-slate-700">
        <p class="text-xs text-slate-500">{{ historical.savedAt }} · {{ historical.action }}</p>
        <section><h3 class="font-semibold">Description</h3><p class="mt-2 whitespace-pre-wrap break-words">{{ historical.tool.description }}</p></section>
        <dl class="tool-properties"><dt>运行环境</dt><dd>{{ historical.tool.runtime }}</dd><dt>代码入口</dt><dd>{{ historical.tool.entrypoint }}</dd></dl>
        <section v-for="direction in (['inputs', 'outputs'] as const)" :key="direction"><h3 class="mb-2 font-semibold">{{ direction === 'inputs' ? '输入参数' : '输出参数' }}</h3><table class="tool-table"><thead><tr><th>参数名称</th><th>类型</th><th>说明</th><th>{{ direction === 'inputs' ? '必填' : '状态' }}</th></tr></thead><tbody><tr v-for="param in historical.tool[direction]" :key="param.name"><td>{{ param.name }}</td><td>{{ param.type }}</td><td class="whitespace-pre-wrap">{{ param.description }}</td><td>{{ direction === 'inputs' ? (param.required ? '是' : '否') : (param.enabled !== false ? '已启用' : '已禁用') }}</td></tr></tbody></table><p v-if="!historical.tool[direction].length" class="py-3 text-xs text-slate-500">无参数</p></section>
        <p class="text-xs text-slate-500">恢复将应用该版本的 Description、输出参数说明和启用状态，并保留现有历史记录。</p>
      </div>
      <template #footer><div class="flex justify-end gap-2"><button type="button" class="ops-secondary" @click="historyDetailOpen = false">关闭</button><button type="button" class="ops-primary" :disabled="historical?.version === history[0]?.version" @click="restoreVersion">恢复此版本</button></div></template>
    </AppDialog>
    <McpToolsDialog v-model="toolsDialogOpen" :service="toolsService" />
    <McpServiceForm v-model="serviceFormOpen" :service-id="editingServiceId" @remove="requestDelete" />
    <AppDialog v-model="deleteOpen" title="删除 MCP 服务" width="620px" class="ops-tool-dialog">
      <div v-if="deletingService" class="space-y-4 text-sm leading-6 text-slate-700">
        <p>确定删除「{{ deletingService.name }}」？以下加载引用将一并移除：</p>
        <dl class="tool-properties"><dt>Agent 默认配置</dt><dd><ul v-if="deleteUsage.defaults.length"><li v-for="agent in deleteUsage.defaults" :key="agent.id">{{ agent.name }}</li></ul><span v-else>无默认加载</span></dd><dt>Skill 私有加载</dt><dd><ul v-if="deleteUsage.skills.length"><li v-for="skill in deleteUsage.skills" :key="skill.id">{{ skill.name }}{{ skill.enabled ? '' : '（已禁用）' }}</li></ul><span v-else>无关联 Skill</span></dd><dt>Agent 直接加载</dt><dd><ul v-if="deleteUsage.agents.length"><li v-for="agent in deleteUsage.agents" :key="agent.id">{{ agent.name }}</li></ul><span v-else>无直接加载的客户 Agent</span></dd></dl>
        <p class="text-xs text-slate-500">使用上述 Skill 的 Agent 也将失去对应私有工具路径。Skill 和 Agent 本身保留，已有检测结果需重新检测。</p>
        <p v-if="deleteError" role="alert" class="text-red-700">{{ deleteError }}</p>
      </div>
      <template #footer><button type="button" class="ops-secondary mr-2" @click="deleteOpen = false">取消</button><button type="button" class="ops-danger" @click="deleteService">确认删除</button></template>
    </AppDialog>
  </section>
</template>

<style scoped>
.mcp-service-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 16px; padding: 20px; }
.mcp-service-card { min-width: 0; padding: 20px; border: 1px solid #deded9; border-radius: 6px; }
.mcp-card-header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
.mcp-card-header > div:first-child { min-width: 0; }
.mcp-card-header h3 { font-size: 15px; font-weight: 600; color: #0f172a; overflow-wrap: anywhere; }
.mcp-card-header h3 button { text-align: left; }
.mcp-card-header p { font-size: 12px; line-height: 1.8; margin-top: 8px; color: #64748b; }
.mcp-card-edit { display: flex; flex-shrink: 0; gap: 12px; font-size: 12px; color: #475569; }
.mcp-card-edit button { min-height: 24px; }
.mcp-card-edit .mcp-delete { color: #b42318; }
.mcp-card-endpoint { font-size: 12px; color: #64748b; overflow-wrap: anywhere; line-height: 1.7; margin: 10px 0 18px; }
@media (max-width: 1100px) { .mcp-service-grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .mcp-service-grid { padding: 12px; } .mcp-service-card { padding: 16px; } }

.tool-tab { padding: 14px 0; border-bottom: 2px solid transparent; color: #64748b; font-size: 14px; }
.tool-tab.active { border-color: #0f172a; color: #0f172a; font-weight: 600; }
.tool-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
.tool-table th { position: sticky; top: 0; padding: 12px 16px; background: #f7f7f5; color: #64748b; font-size: 12px; font-weight: 600; }
.tool-table td { padding: 16px; border-bottom: 1px solid #ededea; vertical-align: top; overflow-wrap: anywhere; }
.tool-table tbody tr:hover { background: #fbfbfa; }
.loading-badge { display: inline-block; white-space: nowrap; border-radius: 4px; padding: 3px 7px; font-size: 12px; }
.loading-badge.direct { background: #edf6f0; color: #21623b; }
.loading-badge.unloaded { background: #f7f7f5; color: #64748b; }
.loading-badge.private { background: #f1f5f9; color: #475569; }
.skill-link { border: 1px solid #deded9; border-radius: 4px; padding: 4px 7px; color: #475569; text-align: left; font-size: 12px; }
.skill-link:hover { background: #f1f5f9; color: #0f172a; }
.tool-properties { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 12px 16px; font-size: 13px; }
.tool-properties dt { color: #64748b; }
.tool-properties dd { overflow-wrap: anywhere; }
</style>

<style>
.ops-input { width: 100%; height: 36px; min-width: 0; border: 1px solid #deded9; border-radius: 6px; background: #fbfbfa; padding: 0 10px; font-size: 13px; color: #334155; outline: none; }
.ops-input.ops-search { padding-left: 36px; }
textarea.ops-input { height: auto; padding: 8px 10px; }
.ops-input:focus { border-color: #64748b; }
.ops-input:disabled { background: #f1f5f9; color: #64748b; }
.ops-input::placeholder { color: #64748b; }
.ops-primary, .ops-secondary { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: 6px; border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
.ops-primary { background: #0f172a; color: white; border: 1px solid #0f172a; }
.ops-primary:hover { background: #1e293b; }
.ops-secondary { border: 1px solid #deded9; background: white; color: #475569; }
.ops-secondary:hover { background: #f7f7f5; }
.ops-danger { display: inline-flex; align-items: center; min-height: 36px; border: 1px solid #fecaca; border-radius: 6px; padding: 6px 12px; font-size: 13px; color: #b91c1c; background: #fff; }
.ops-danger:hover { background: #fef2f2; }
.ops-sync-status { display: flex; flex-shrink: 0; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; padding: 10px 20px; border-bottom: 1px solid #e2e2dc; font-size: 12px; line-height: 1.7; color: #64748b; background: #fbfbfa; }
.ops-sync-status.is-error { color: #b91c1c; background: #fff7f7; }
.ops-primary:disabled, .ops-secondary:disabled { cursor: not-allowed; opacity: .45; }
.ops-field { display: flex; flex-direction: column; gap: 7px; font-size: 12px; font-weight: 500; }
.tool-management button:focus-visible, .ops-tool-dialog button:focus-visible, .skill-config-dialog button:focus-visible { outline: 2px solid #64748b; outline-offset: 3px; }
</style>
