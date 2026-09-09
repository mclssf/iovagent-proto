<script lang="ts" setup>
import { computed, ref } from 'vue';
import { ElDialog, ElMessage } from 'element-plus';
import { Icon } from '@packages/icon';
import { useAgentOpsStore } from '@/pinia/agentOps';
import type { ManagedSkill, ManagedTool, ToolKind } from '@/pinia/agentOps';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';

type LoadingFilter = 'all' | 'global' | 'private' | 'mixed' | 'unloaded';
const emit = defineEmits<{ editSkill: [skill: ManagedSkill] }>();
const store = useAgentOpsStore();
const tab = ref<ToolKind>('mcp');
const search = ref('');
const loadingFilter = ref<LoadingFilter>('all');
const selectedToolId = ref('');
const selectedTool = computed(() => store.tools.find((tool) => tool.id === selectedToolId.value));
const detailOpen = ref(false);
const configOpen = ref(false);
const draftGlobalLoading = ref(false);
const kinds: { id: ToolKind; label: string }[] = [{ id: 'mcp', label: 'MCP 服务' }, { id: 'code', label: '代码工具' }];
const filteredTools = computed(() => store.tools.filter((tool) => {
  const query = search.value.trim().toLowerCase();
  const skills = store.skillsForTool(tool.id).map((skill) => skill.name).join(' ');
  const loading = store.getToolLoading(tool.id);
  return tool.kind === tab.value && (loadingFilter.value === 'all' || loading[loadingFilter.value])
    && (!query || `${tool.name} ${tool.id} ${tool.description} ${skills}`.toLowerCase().includes(query));
}));
function showTool(tool: ManagedTool) {
  selectedToolId.value = tool.id;
  detailOpen.value = true;
}
function configureLoading(tool: ManagedTool) {
  selectedToolId.value = tool.id;
  draftGlobalLoading.value = store.getToolLoading(tool.id).global;
  detailOpen.value = false;
  configOpen.value = true;
}
function configureSkill(skill: ManagedSkill) {
  detailOpen.value = false;
  configOpen.value = false;
  emit('editSkill', skill);
}
function saveLoading() {
  if (!selectedTool.value) return;
  store.setToolGlobalLoading(selectedTool.value.id, draftGlobalLoading.value);
  configOpen.value = false;
  ElMessage.success('加载配置已保存');
}
</script>

<template>
  <section class="tool-management flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[#deded9] bg-white">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#e2e2dc] px-5 py-4">
      <div><h2 class="text-base font-semibold">Tool 管理</h2><p class="mt-1 text-xs text-slate-500">查看工程中定义的工具属性，管理全局加载与 Skill 私有加载关系。</p></div>
      <span class="text-xs text-slate-500">工程属性只读</span>
    </div>
    <div class="flex shrink-0 gap-6 border-b border-[#e2e2dc] px-5" role="tablist" aria-label="Tool 类型">
      <button v-for="kind in kinds" :key="kind.id" type="button" role="tab" :aria-selected="tab === kind.id" :class="['tool-tab', { active: tab === kind.id }]" @click="tab = kind.id">
        {{ kind.label }}<span class="ml-2 text-xs tabular-nums text-slate-500">{{ store.tools.filter((tool) => tool.kind === kind.id).length }}</span>
      </button>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#e2e2dc] px-5 py-3">
      <label class="relative min-w-0 flex-1 sm:max-w-[360px]"><Icon :svg="strokeIconPaths.search" :size="15" svg-class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input v-model="search" class="ops-input ops-search" aria-label="搜索 Tool" placeholder="搜索名称、描述或关联 Skill" /></label>
      <select v-model="loadingFilter" class="ops-input !w-auto" aria-label="筛选加载方式"><option value="all">全部加载方式</option><option value="global">全局加载</option><option value="private">私有化加载</option><option value="mixed">同时全局与私有加载</option><option value="unloaded">未加载</option></select>
      <span class="text-xs text-slate-500">{{ filteredTools.length }} 个{{ tab === 'mcp' ? '服务' : '工具' }}</span>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <table class="tool-table min-w-[850px]">
        <thead><tr><th class="w-[27%]">{{ tab === 'mcp' ? 'MCP 服务 / Description' : '工具名称 / Description' }}</th><th class="w-[25%]">{{ tab === 'mcp' ? '服务属性' : '输入 / 输出参数' }}</th><th class="w-[14%]">加载方式</th><th class="w-[25%]">私有化加载的 Skill</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="tool in filteredTools" :key="tool.id">
            <td><button type="button" class="font-medium text-slate-950 hover:underline" @click="showTool(tool)">{{ tool.name }}</button><div class="mt-1 break-all font-mono text-xs text-slate-500">{{ tool.id }}</div><p class="mt-2 text-xs leading-5 text-slate-600">{{ tool.description }}</p></td>
            <td>
              <template v-if="tool.kind === 'mcp'"><div class="text-xs text-slate-700">{{ tool.transport }} · v{{ tool.version }}</div><p class="mt-1 break-all font-mono text-xs leading-5 text-slate-500">{{ tool.endpoint }}</p><p class="mt-1 text-xs text-slate-500">{{ tool.auth }} · {{ tool.methods.length }} 个方法</p></template>
              <template v-else><div class="text-xs leading-5"><span class="text-slate-500">输入 {{ tool.inputs.length }}</span><p class="break-all font-mono text-slate-700">{{ tool.inputs.map((item) => item.name).join(', ') || '无输入参数' }}</p></div><div class="mt-2 text-xs leading-5"><span class="text-slate-500">输出 {{ tool.outputs.length }}</span><p class="break-all font-mono text-slate-700">{{ tool.outputs.map((item) => item.name).join(', ') || '无输出参数' }}</p></div></template>
            </td>
            <td>
              <div class="flex flex-wrap gap-1.5">
                <span v-if="store.getToolLoading(tool.id).global" class="loading-badge global">全局加载</span>
                <span v-if="store.getToolLoading(tool.id).private" class="loading-badge private">私有化加载</span>
                <span v-if="store.getToolLoading(tool.id).unloaded" class="loading-badge unloaded">未加载</span>
              </div>
              <p v-if="store.getToolLoading(tool.id).mixed" class="mt-2 text-xs leading-5 text-amber-700">同时加载，不推荐</p>
              <p v-else class="mt-2 text-xs leading-5 text-slate-500">{{ store.getToolLoading(tool.id).global ? '已加入全局工具列表' : store.getToolLoading(tool.id).private ? '由关联 Skill 按需加载' : '未开启全局，也未关联 Skill' }}</p>
            </td>
            <td><div v-if="store.skillsForTool(tool.id).length" class="flex flex-wrap gap-1.5"><button v-for="skill in store.skillsForTool(tool.id)" :key="skill.id" type="button" class="skill-link" @click="configureSkill(skill)">{{ skill.name }}<span v-if="!skill.enabled" class="text-slate-500">（已禁用）</span></button></div><p v-else class="text-xs leading-5 text-slate-500">未关联 Skill</p></td>
            <td><div class="flex flex-col items-start gap-2 text-xs"><button type="button" class="text-slate-700 hover:underline" :aria-label="`查看 ${tool.name}`" @click="showTool(tool)">详情</button><button type="button" class="text-slate-700 hover:underline" :aria-label="`配置 ${tool.name}`" @click="configureLoading(tool)">加载配置</button></div></td>
          </tr>
        </tbody>
      </table>
      <div v-if="!filteredTools.length" class="px-5 py-16 text-center"><p class="text-sm text-slate-600">未找到符合条件的 Tool</p><button class="mt-3 text-xs underline" type="button" @click="search = ''; loadingFilter = 'all'">清空筛选</button></div>
    </div>
    <footer class="border-t border-[#e2e2dc] bg-[#fbfbfa] px-5 py-3 text-xs leading-5 text-slate-500">所有工具默认不勾选全局加载。Skill 绑定与全局加载互相独立；同时开启可能导致 Agent 调用工具混乱，不推荐同时使用。</footer>

    <ElDialog v-model="detailOpen" :title="selectedTool?.name" width="960px" top="5vh" class="ops-tool-dialog" :close-on-click-modal="false">
      <div v-if="selectedTool" class="space-y-6 text-slate-700">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <code class="text-xs">{{ selectedTool.id }}</code>
            <span v-if="store.getToolLoading(selectedTool.id).global" class="loading-badge global">全局加载</span>
            <span v-if="store.getToolLoading(selectedTool.id).private" class="loading-badge private">私有化加载</span>
            <span v-if="store.getToolLoading(selectedTool.id).unloaded" class="loading-badge unloaded">未加载</span>
            <span class="text-xs text-slate-500">工程更新于 {{ selectedTool.updatedAt }}</span>
          </div>
          <p class="mt-3 text-xs text-slate-500">以下属性由研发在工程中维护，页面只读展示。</p>
          <h3 class="mt-4 text-xs font-semibold">Description</h3><p class="mt-1 text-sm leading-6">{{ selectedTool.description }}</p>
          <p v-if="store.getToolLoading(selectedTool.id).mixed" class="mt-3 text-xs leading-5 text-amber-700">当前同时开启全局加载与 Skill 私有加载，可能导致 Agent 调用工具混乱，不推荐同时使用。</p>
        </div>
        <template v-if="selectedTool.kind === 'mcp'">
          <section><h3 class="mb-3 font-semibold">MCP 服务属性</h3><dl class="tool-properties"><dt>传输协议</dt><dd>{{ selectedTool.transport }}</dd><dt>服务版本</dt><dd>{{ selectedTool.version }}</dd><dt>{{ selectedTool.transport === 'stdio' ? '启动命令' : '服务地址' }}</dt><dd class="font-mono">{{ selectedTool.endpoint }}</dd><dt>提供方</dt><dd>{{ selectedTool.provider }}</dd><dt>认证方式</dt><dd>{{ selectedTool.auth }}</dd><dt>超时时间</dt><dd>{{ selectedTool.timeout }} 秒</dd></dl></section>
          <section><h3 class="mb-3 font-semibold">可调用方法（{{ selectedTool.methods.length }}）</h3><table class="tool-table"><thead><tr><th>方法名称</th><th>Description</th></tr></thead><tbody><tr v-for="method in selectedTool.methods" :key="method.name"><td class="font-mono text-xs">{{ method.name }}</td><td>{{ method.description }}</td></tr></tbody></table></section>
        </template>
        <template v-else>
          <dl class="tool-properties"><dt>运行环境</dt><dd>{{ selectedTool.runtime }}</dd><dt>代码入口</dt><dd class="font-mono">{{ selectedTool.entrypoint }}</dd></dl>
          <section v-for="direction in (['inputs', 'outputs'] as const)" :key="direction"><h3 class="mb-3 font-semibold">{{ direction === 'inputs' ? '输入参数' : '输出参数' }}（{{ selectedTool[direction].length }}）</h3><table class="tool-table"><thead><tr><th>参数名称</th><th>类型</th><th v-if="direction === 'inputs'">必填</th><th>说明</th></tr></thead><tbody><tr v-for="param in selectedTool[direction]" :key="param.name"><td class="font-mono text-xs">{{ param.name }}</td><td class="font-mono text-xs">{{ param.type }}</td><td v-if="direction === 'inputs'">{{ param.required ? '是' : '否' }}</td><td>{{ param.description }}</td></tr></tbody></table><p v-if="!selectedTool[direction].length" class="py-4 text-xs text-slate-500">无{{ direction === 'inputs' ? '输入' : '输出' }}参数</p></section>
        </template>
        <section><h3 class="mb-3 font-semibold">私有化加载的 Skill（{{ store.skillsForTool(selectedTool.id).length }}）</h3><div class="flex flex-wrap gap-2"><button v-for="skill in store.skillsForTool(selectedTool.id)" :key="skill.id" class="skill-link" type="button" @click="configureSkill(skill)">{{ skill.name }} · {{ skill.enabled ? '已启用' : '已禁用' }}</button></div><p v-if="!store.skillsForTool(selectedTool.id).length" class="text-xs text-slate-500">尚未关联 Skill，可在 Skill 管理中添加私有加载绑定。</p></section>
      </div>
      <template #footer><button class="ops-secondary mr-2" type="button" @click="detailOpen = false">关闭</button><button v-if="selectedTool" class="ops-primary" type="button" @click="configureLoading(selectedTool)">加载配置</button></template>
    </ElDialog>

    <ElDialog v-model="configOpen" title="Tool 加载配置" width="640px" top="8vh" class="ops-tool-dialog" :close-on-click-modal="false">
      <form v-if="selectedTool" id="tool-loading-form" class="space-y-5 text-slate-700" @submit.prevent="saveLoading">
        <div>
          <h3 class="text-sm font-semibold text-slate-950">{{ selectedTool.name }}</h3>
          <p class="mt-1 break-all font-mono text-xs text-slate-500">{{ selectedTool.id }} · {{ selectedTool.kind === 'mcp' ? 'MCP 服务' : '代码工具' }}</p>
          <p class="mt-2 text-sm leading-6">{{ selectedTool.description }}</p>
        </div>
        <section class="border-t border-[#e2e2dc] pt-5">
          <label class="flex cursor-pointer items-center gap-2 text-sm font-medium"><input v-model="draftGlobalLoading" type="checkbox" class="h-4 w-4 accent-slate-900" />全局加载</label>
          <p class="mt-2 text-xs leading-5 text-slate-500">默认不勾选。勾选后加入 Agent 的全局工具列表；取消勾选后，仅由已绑定的 Skill 私有加载。</p>
        </section>
        <section class="border-t border-[#e2e2dc] pt-5">
          <h3 class="text-sm font-semibold">私有加载的 Skill（{{ store.skillsForTool(selectedTool.id).length }}）</h3>
          <p class="mt-2 text-xs leading-5 text-slate-500">由 Skill 管理中的私有工具列表决定，不受全局加载勾选状态影响。</p>
          <div class="mt-3 flex flex-wrap gap-2"><button v-for="skill in store.skillsForTool(selectedTool.id)" :key="skill.id" class="skill-link" type="button" @click="configureSkill(skill)">{{ skill.name }}<span v-if="!skill.enabled">（已禁用）</span></button></div>
          <p v-if="!store.skillsForTool(selectedTool.id).length" class="text-xs text-slate-500">尚未关联 Skill{{ draftGlobalLoading ? '。保存后将全局加载。' : '，未开启全局加载时，该工具暂不加载。' }}</p>
        </section>
        <p v-if="draftGlobalLoading && store.skillsForTool(selectedTool.id).length" role="status" class="rounded-md bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">保存后将同时全局加载和由上述 Skill 私有加载。允许这样配置，但不推荐，可能导致 Agent 调用工具混乱。</p>
      </form>
      <template #footer><button class="ops-secondary mr-2" type="button" @click="configOpen = false">取消</button><button class="ops-primary" type="submit" form="tool-loading-form">保存</button></template>
    </ElDialog>
  </section>
</template>

<style scoped>
.tool-tab { padding: 14px 0; border-bottom: 2px solid transparent; color: #64748b; font-size: 14px; }
.tool-tab.active { border-color: #0f172a; color: #0f172a; font-weight: 600; }
.tool-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
.tool-table th { position: sticky; top: 0; padding: 12px 16px; background: #f7f7f5; color: #64748b; font-size: 12px; font-weight: 600; }
.tool-table td { padding: 16px; border-bottom: 1px solid #ededea; vertical-align: top; overflow-wrap: anywhere; }
.tool-table tbody tr:hover { background: #fbfbfa; }
.loading-badge { display: inline-block; white-space: nowrap; border-radius: 4px; padding: 3px 7px; font-size: 12px; }
.loading-badge.global { background: #ecfdf5; color: #047857; }
.loading-badge.unloaded { background: #f7f7f5; color: #64748b; }
.loading-badge.private { background: #f1f5f9; color: #475569; }
.skill-link { border: 1px solid #deded9; border-radius: 4px; padding: 4px 7px; color: #475569; text-align: left; font-size: 12px; }
.skill-link:hover { background: #f1f5f9; color: #0f172a; }
.tool-properties { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 12px 16px; font-size: 13px; }
.tool-properties dt { color: #64748b; }
.tool-properties dd { overflow-wrap: anywhere; }
</style>

<style>
.ops-tool-dialog.el-dialog { max-width: calc(100vw - 24px); border-radius: 8px; padding: 0; overflow: hidden; }
.ops-tool-dialog .el-dialog__header { padding: 20px 24px; margin: 0; border-bottom: 1px solid #e2e2dc; }
.ops-tool-dialog .el-dialog__title { font-size: 16px; font-weight: 600; color: #0f172a; }
.ops-tool-dialog .el-dialog__body { max-height: 70vh; overflow: auto; padding: 24px; }
.ops-tool-dialog .el-dialog__footer { padding: 16px 24px; border-top: 1px solid #e2e2dc; }
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
.ops-primary:disabled, .ops-secondary:disabled { cursor: not-allowed; opacity: .45; }
.ops-field { display: flex; flex-direction: column; gap: 7px; font-size: 12px; font-weight: 500; }
.tool-management button:focus-visible, .ops-tool-dialog button:focus-visible, .skill-config-dialog button:focus-visible { outline: 2px solid #64748b; outline-offset: 3px; }
</style>
