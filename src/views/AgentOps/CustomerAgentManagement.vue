<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, ElOption, ElSelect } from 'element-plus';
import { Icon } from '@packages/icon';
import { skillGroups, useAgentOpsStore } from '@/pinia/agentOps';
import type { SkillGroup } from '@/pinia/agentOps';
import { selectSkillGroup } from '@/pinia/customerAgents';
import type { ActivatedCustomer, CustomerAgentBinding, CustomerAgentTarget } from '@/pinia/customerAgents';
import { agentConfigurationFingerprint, resolveAgentTools } from './agentConflicts';
import CustomerConflictReport from './CustomerConflictReport.vue';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';

const props = defineProps<{ initialTarget?: CustomerAgentTarget }>();
const emit = defineEmits<{ editingChange: [open: boolean] }>();
const store = useAgentOpsStore();
const search = ref('');
const typeFilter = ref('全部');
const editingId = ref('');
const selectedAgentId = ref('');
const editorHeading = ref<HTMLElement>();
const draft = reactive<Record<string, CustomerAgentBinding>>({});
const enabledAgentIds = ref<string[]>([]);
const savedDraft = ref('');
const formError = ref('');
const skillSearch = ref('');
const pendingTool = ref('');
const reportOpen = ref(false);
const customer = computed(() => store.customers.find(item => item.id === editingId.value));
const activeAgent = computed(() => store.agents.find(agent => agent.id === selectedAgentId.value));
const activeBinding = computed(() => draft[selectedAgentId.value]);
const activeEnabled = computed(() => enabledAgentIds.value.includes(selectedAgentId.value));
const draftConfigs = computed(() => enabledAgentIds.value.map(id => draft[id]!).filter(Boolean));
const fingerprint = () => JSON.stringify(draftConfigs.value);
const hasChanges = computed(() => fingerprint() !== savedDraft.value);
const filteredCustomers = computed(() => store.customers.filter(item => item.name.toLowerCase().includes(search.value.trim().toLowerCase()) && (typeFilter.value === '全部' || item.activationType === typeFilter.value)));
const catalog = computed(() => ({ skills: store.availableSkillsForAgent(selectedAgentId.value), tools: store.tools }));
const filteredSkills = computed(() => catalog.value.skills.filter(skill => `${skill.name} ${skill.description} ${skill.group}`.toLowerCase().includes(skillSearch.value.trim().toLowerCase())));
const loadConfig = computed(() => ({ name: activeAgent.value?.name ?? '', systemPrompt: activeAgent.value?.systemPrompt ?? '', skillIds: activeEnabled.value ? activeBinding.value?.skillIds ?? [] : [], toolIds: activeEnabled.value ? activeBinding.value?.toolIds ?? [] : [] }));
const usages = computed(() => resolveAgentTools(loadConfig.value, catalog.value));
const overlaps = computed(() => usages.value.filter(usage => usage.paths.some(path => path.kind === 'direct') && usage.paths.some(path => path.kind === 'private')));
const toolOptions = computed(() => store.tools.filter(tool => !activeBinding.value?.toolIds.includes(tool.id)));
const invalidSkills = computed(() => activeBinding.value?.skillIds.filter(id => !catalog.value.skills.some(skill => skill.id === id)) ?? []);
const invalidAgents = computed(() => enabledAgentIds.value.filter(id => !store.agents.some(agent => agent.id === id)));
const report = computed(() => store.customerReports[editingId.value]?.[selectedAgentId.value]);
const reportStale = computed(() => !!report.value && report.value.fingerprint !== agentConfigurationFingerprint(loadConfig.value, catalog.value));
const agentName = (id: string) => store.agents.find(agent => agent.id === id)?.name ?? `已失效：${id}`;
const toolName = (id: string) => store.tools.find(tool => tool.id === id)?.name ?? `已失效：${id}`;
const privateNames = (ids: string[]) => ids.map(toolName).join('、');
function openCustomer(item: ActivatedCustomer, agentId?: string) {
  Object.keys(draft).forEach(id => delete draft[id]);
  store.agents.forEach(agent => { draft[agent.id] = { agentId: agent.id, skillIds: [], toolIds: [] }; });
  item.agentConfigs.forEach(binding => { draft[binding.agentId] = { agentId: binding.agentId, skillIds: [...binding.skillIds], toolIds: [...binding.toolIds] }; });
  enabledAgentIds.value = item.agentConfigs.map(binding => binding.agentId);
  selectedAgentId.value = agentId || item.agentConfigs[0]?.agentId || store.agents[0]?.id || '';
  savedDraft.value = fingerprint();
  formError.value = '';
  editingId.value = item.id;
  nextTick(() => editorHeading.value?.focus());
}
function toggleAgent(id: string, enabled: boolean) {
  enabledAgentIds.value = enabled ? [...new Set([...enabledAgentIds.value, id])] : enabledAgentIds.value.filter(item => item !== id);
  if (enabled) selectedAgentId.value = id;
}
function groupState(group: SkillGroup) {
  const members = catalog.value.skills.filter(skill => skill.group === group && skill.enabled);
  const selected = members.filter(skill => activeBinding.value?.skillIds.includes(skill.id)).length;
  return { total: members.length, selected, checked: !!members.length && selected === members.length, partial: selected > 0 && selected < members.length };
}
function toggleGroup(group: SkillGroup, checked: boolean) {
  if (activeBinding.value) activeBinding.value.skillIds = selectSkillGroup(activeBinding.value.skillIds, group, catalog.value.skills, checked);
}
function toggleSkill(id: string, checked: boolean) {
  if (!activeBinding.value) return;
  activeBinding.value.skillIds = checked ? [...new Set([...activeBinding.value.skillIds, id])] : activeBinding.value.skillIds.filter(item => item !== id);
}
function addTool(id: string) {
  if (id && activeBinding.value && !activeBinding.value.toolIds.includes(id)) activeBinding.value.toolIds.push(id);
  pendingTool.value = '';
}
function save(andDetect = false) {
  try {
    store.saveCustomerAgents(editingId.value, draftConfigs.value);
    savedDraft.value = fingerprint();
    formError.value = '';
    ElMessage.success(`${customer.value?.name}的 Agent 能力配置已保存`);
    if (andDetect) { store.detectCustomerAgentConflicts(editingId.value, selectedAgentId.value); reportOpen.value = true; }
  } catch (error) { formError.value = error instanceof Error ? error.message : '保存失败，请重试。'; }
}
async function backToList() {
  if (hasChanges.value) {
    try { await ElMessageBox.confirm('当前客户有未保存的 Agent 能力配置，返回后将放弃这些修改。', '放弃未保存的修改？', { confirmButtonText: '放弃修改并返回', cancelButtonText: '继续编辑', type: 'warning' }); }
    catch { return; }
  }
  editingId.value = '';
}
watch(editingId, id => emit('editingChange', !!id), { flush: 'sync' });
watch(selectedAgentId, () => { skillSearch.value = ''; pendingTool.value = ''; reportOpen.value = false; });
watch(() => props.initialTarget, target => {
  const item = store.customers.find(customer => customer.id === target?.customerId);
  if (item) openCustomer(item, target?.agentId);
}, { immediate: true });
onBeforeUnmount(() => emit('editingChange', false));
</script>

<template>
  <section v-show="!customer" class="agent-management customer-list">
    <div class="agent-page-header"><div><h2>客户 Agent 配置</h2><p>为已开通大卡数字人的客户，配置可用 Agent 及每个 Agent 的 Skill、Tool。</p></div><span class="customer-total">{{ store.customers.length }} 个已开通客户</span></div>
    <div class="agent-toolbar"><label class="agent-search"><Icon :svg="strokeIconPaths.search" :size="15" /><input v-model="search" class="ops-input ops-search" aria-label="搜索客户" placeholder="搜索客户名称" /></label><select v-model="typeFilter" class="ops-input customer-type-filter" aria-label="开通类型"><option>全部</option><option>正式</option><option>试用</option></select><span>共 {{ filteredCustomers.length }} 个客户</span></div>
    <div class="customer-table-scroll"><table class="customer-table"><thead><tr><th>客户</th><th>开通周期（合同开始 — 合同结束）</th><th>开通类型</th><th>可用 Agent</th><th>操作</th></tr></thead><tbody>
      <tr v-for="item in filteredCustomers" :key="item.id"><td><strong>{{ item.name }}</strong></td><td class="customer-dates">{{ item.contractStart }} <span>—</span> {{ item.contractEnd }}</td><td><span class="agent-status" :class="item.activationType === '试用' ? 'is-warning' : 'is-success'">{{ item.activationType }}</span></td><td><div class="agent-tags"><span v-for="binding in item.agentConfigs" :key="binding.agentId" class="agent-tag">{{ agentName(binding.agentId) }}</span><span v-if="!item.agentConfigs.length" class="agent-muted">待配置</span></div></td><td><button type="button" class="ops-secondary" :aria-label="`配置 ${item.name}`" @click="openCustomer(item)">配置</button></td></tr>
    </tbody></table><div v-if="!filteredCustomers.length" class="agent-empty"><h3>没有匹配的客户</h3><p>尝试其他名称或开通类型。</p><button class="ops-secondary" @click="search = ''; typeFilter = '全部'">清除筛选</button></div></div>
    <p class="customer-footnote">客户与合同为演示数据。配置保存在当前演示会话中。</p>
  </section>

  <section v-if="customer" class="agent-editor-page" aria-label="客户 Agent 配置页面">
    <header class="agent-editor-header">
      <div class="agent-editor-title"><button type="button" class="agent-back" @click="backToList"><Icon :svg="strokeIconPaths.arrowUp" :size="16" svg-class="-rotate-90" />返回客户列表</button><h2 ref="editorHeading" tabindex="-1">{{ customer.name }}<span>客户 Agent 配置</span></h2><p class="customer-contract">{{ customer.activationType }} · {{ customer.contractStart }} — {{ customer.contractEnd }}</p></div>
      <div class="agent-editor-actions"><span :class="{ 'is-dirty': hasChanges }" role="status">{{ hasChanges ? '有未保存的修改' : '配置已保存' }}</span><button type="button" class="ops-secondary" @click="save()">保存配置</button><button type="button" class="ops-primary" :disabled="!activeEnabled || !activeAgent" @click="save(true)">保存并检测当前 Agent</button></div>
      <p v-if="formError" class="agent-form-error" role="alert">{{ formError }}</p>
    </header>
    <div class="customer-editor-body">
      <aside class="customer-agent-nav" aria-label="选择客户可用 Agent"><h3>可用 Agent <span>{{ enabledAgentIds.length }} / {{ store.agents.length }}</span></h3><p>勾选授权，点击名称配置能力。</p>
        <div v-for="agent in store.agents" :key="agent.id" class="customer-agent-option" :class="{ selected: selectedAgentId === agent.id }"><input type="checkbox" :checked="enabledAgentIds.includes(agent.id)" :aria-label="`允许使用 ${agent.name}`" @change="toggleAgent(agent.id, ($event.target as HTMLInputElement).checked)" /><button type="button" :aria-pressed="selectedAgentId === agent.id" @click="selectedAgentId = agent.id"><strong>{{ agent.name }}</strong><span>{{ enabledAgentIds.includes(agent.id) ? `${draft[agent.id]?.skillIds.length ?? 0} Skill · ${draft[agent.id]?.toolIds.length ?? 0} 直接 Tool` : '未授权使用' }}</span></button></div>
        <div v-for="id in invalidAgents" :key="id" class="agent-notice warning"><div><p>{{ agentName(id) }}</p><button class="agent-text-link" @click="toggleAgent(id, false)">移除失效 Agent</button></div></div>
        <p v-if="!enabledAgentIds.length" class="agent-inline-warning">保存后，该客户将没有可用的 Agent。</p>
        <p class="customer-nav-note">当前修改仅作用于 {{ customer.name }}。切换 Agent 会保留本页未保存的配置。</p>
      </aside>
      <div class="agent-editor-scroll customer-config-scroll">
        <div v-if="activeAgent && activeBinding" class="customer-config-content">
          <div class="customer-agent-heading"><div><h3>{{ activeAgent.name }}</h3><p>{{ activeAgent.role === 'data-employee' ? '从数据员工配置中选择采集与映射 Skill。' : '从 Skill 管理中选择该客户需要的能力。' }}</p></div><span class="agent-status" :class="activeEnabled ? 'is-success' : ''">{{ activeEnabled ? '已授权使用' : '未授权使用' }}</span></div>
          <details class="customer-prompt"><summary>查看 System Prompt · 由 Agent 管理统一维护</summary><pre>{{ activeAgent.systemPrompt }}</pre></details>
          <div v-if="!activeEnabled" class="agent-empty"><h3>该客户尚未启用此 Agent</h3><p>启用后，可单独配置此 Agent 的 Skill 和直接加载的 Tool。</p><button class="ops-primary" @click="toggleAgent(selectedAgentId, true)">允许该客户使用</button></div>
          <template v-else>
            <div class="customer-loading-columns">
              <section class="agent-loading-section"><h3>Skill 加载 <span>已选 {{ activeBinding.skillIds.length }} 个</span></h3><p>按组批量选择，也可逐项调整。私有 Tool 随所选 Skill 加载。</p>
                <div class="customer-skill-groups"><label v-for="group in skillGroups" :key="group" class="customer-group"><input type="checkbox" :checked="groupState(group).checked" :indeterminate="groupState(group).partial" :disabled="!groupState(group).total" :aria-label="`批量选择 ${group}`" @change="toggleGroup(group, ($event.target as HTMLInputElement).checked)" /><span>{{ group }}<small>{{ groupState(group).selected }} / {{ groupState(group).total }}</small></span></label></div>
                <p class="customer-group-help">批量选择当前组内可用 Skill；后续新增或调整分组不会自动改变客户配置。</p>
                <input v-model="skillSearch" class="ops-input" placeholder="搜索 Skill 名称或描述" aria-label="搜索可加载 Skill" />
                <div class="customer-skills" aria-label="可加载 Skill 列表"><label v-for="skill in filteredSkills" :key="skill.id" class="customer-skill-row"><input type="checkbox" :checked="activeBinding.skillIds.includes(skill.id)" :disabled="!skill.enabled && !activeBinding.skillIds.includes(skill.id)" :aria-label="`加载 Skill ${skill.name}`" @change="toggleSkill(skill.id, ($event.target as HTMLInputElement).checked)" /><span><strong>{{ skill.name }}</strong><span class="agent-tag">{{ skill.group }}</span><span v-if="!skill.enabled" class="agent-inline-warning">已停用</span><p>{{ skill.description }}</p><p v-if="skill.privateToolIds.length" class="customer-private">私有 Tool：{{ privateNames(skill.privateToolIds) }}</p></span></label><p v-if="!filteredSkills.length" class="agent-selection-empty">没有匹配的 Skill。</p></div>
                <div v-for="id in invalidSkills" :key="id" class="agent-notice warning"><span>已失效或不适用的 Skill：{{ id }}</span><button class="agent-text-link" @click="toggleSkill(id, false)">移除</button></div>
              </section>
              <section class="agent-loading-section"><h3>Tool 直接加载 <span>已选 {{ activeBinding.toolIds.length }} 个</span></h3><p>指定该客户下此 Agent 可直接调用的工具，与 Skill 私有加载独立。</p>
                <ElSelect v-model="pendingTool" filterable class="agent-picker" placeholder="添加 MCP 服务或代码工具" aria-label="添加直接加载 Tool" @change="addTool"><ElOption v-for="tool in toolOptions" :key="tool.id" :value="tool.id" :label="`${tool.name} · ${tool.kind === 'mcp' ? 'MCP' : '代码工具'}`" /></ElSelect>
                <ul class="agent-selected-list"><li v-for="id in activeBinding.toolIds" :key="id"><div><strong>{{ toolName(id) }}</strong><p>{{ store.tools.find(tool => tool.id === id)?.description }}</p><p v-if="overlaps.some(usage => usage.id === id)" class="agent-inline-warning">与所选 Skill 的私有 Tool 重叠</p></div><button type="button" class="agent-remove" :aria-label="`移除 Tool ${toolName(id)}`" @click="activeBinding.toolIds = activeBinding.toolIds.filter(item => item !== id)"><Icon :svg="strokeIconPaths.x" :size="15" /></button></li></ul><p v-if="!activeBinding.toolIds.length" class="agent-selection-empty">尚未指定直接工具。Skill 的私有工具仍可随 Skill 调用。</p>
                <div v-if="overlaps.length" class="agent-notice warning" role="status"><div><strong>{{ overlaps.length }} 个 Tool 存在多条加载路径</strong><p>{{ overlaps.map(usage => toolName(usage.id)).join('、') }}。允许保存，建议通过冲突检测检查调用边界。</p></div></div>
                <div class="customer-detection"><h4>当前客户 · 当前 Agent 的冲突检测</h4><p>检查加载路径、功能描述及工具 Schema 的疑似歧义。</p><button v-if="report" class="agent-text-link" @click="reportOpen = true">{{ reportStale ? '配置已变化 · 查看上次检测结果' : `查看检测结果 · ${report.findings.length} 项` }}</button><p v-else>尚未检测。点击页首“保存并检测当前 Agent”开始。</p></div>
              </section>
            </div>
            <section class="agent-scope-section"><h3>全部可调用的 Tool <span>{{ usages.filter(usage => usage.tool).length }} 个，按工具去重</span></h3><p>范围：{{ customer.name }} → {{ activeAgent.name }}。合并直接工具与已启用 Skill 的私有工具。</p><div class="agent-scope-list"><div v-for="usage in usages" :key="usage.id" class="agent-scope-row"><strong>{{ toolName(usage.id) }}</strong><div class="agent-tags"><span v-for="path in usage.paths" :key="path.label" class="agent-tag" :class="{ 'is-private': path.kind === 'private' }">{{ path.label }}</span></div></div><p v-if="!usages.length" class="agent-selection-empty">当前没有可调用的 Tool。</p></div></section>
          </template>
        </div>
        <div v-else class="agent-empty"><h3>请选择有效的 Agent</h3><p>已失效的 Agent 可从左侧移除；最新目录在 Agent 管理中同步。</p></div>
        <p class="agent-editor-footnote">配置保存在当前演示会话中。Skill 定义与私有工具绑定继续在对应 Skill 中维护。</p>
      </div>
    </div>
    <CustomerConflictReport :open="reportOpen" :report="report" :customer-name="customer.name" :agent-name="activeAgent?.name ?? ''" :stale="reportStale" @close="reportOpen = false" @rerun="save(true)" />
  </section>
</template>
<style scoped src="./agentManagement.css"></style>
<style scoped>
.customer-agent-nav input[type="checkbox"], .customer-group input[type="checkbox"], .customer-skill-row input[type="checkbox"] { width: 15px; height: 15px; flex-shrink: 0; accent-color: #334155; cursor: pointer; }
.customer-skill-row input[type="checkbox"] { margin-top: 2px; }
.customer-group input:disabled, .customer-skill-row input:disabled { cursor: not-allowed; }
.customer-total { color: #64748b; white-space: nowrap; font-size: 12px; }
.customer-type-filter { width: 120px; }
.customer-table-scroll { flex: 1; min-height: 0; overflow: auto; }
.customer-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
.customer-table th { background: #f7f7f5; color: #64748b; padding: 13px 20px; font-weight: 500; white-space: nowrap; }
.customer-table td { border-top: 1px solid #e9e9e4; padding: 20px; }
.customer-table th:first-child { min-width: 150px; }
.customer-table td:last-child { width: 100px; }
.customer-table td:last-child button { white-space: nowrap; min-width: 56px; }
.customer-table tr:hover td { background: #fafaf8; }
.customer-dates { font-variant-numeric: tabular-nums; white-space: nowrap; }
.customer-dates span { color: #94a3b8; margin: 0 4px; }
.customer-footnote { border-top: 1px solid #e2e2dc; padding: 12px 20px; color: #64748b; font-size: 12px; }
.customer-contract { margin-top: 8px; font-size: 12px; color: #64748b; }
.customer-editor-body { display: flex; flex: 1; min-height: 0; }
.customer-agent-nav { flex: 0 0 260px; padding: 28px 20px; background: #f7f7f5; border-right: 1px solid #e2e2dc; overflow: auto; }
.customer-agent-nav h3 { font-size: 14px; font-weight: 600; }
.customer-agent-nav h3 span { margin-left: 6px; font-weight: 400; color: #64748b; }
.customer-agent-nav > p { font-size: 12px; line-height: 1.8; color: #64748b; margin: 8px 0 20px; }
.customer-agent-option { display: flex; gap: 10px; align-items: center; padding: 12px; margin-bottom: 10px; border: 1px solid transparent; border-radius: 6px; }
.customer-agent-option.selected { background: white; border-color: #bdc4cd; }
.customer-agent-option button { flex: 1; text-align: left; min-width: 0; }
.customer-agent-option strong { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.customer-agent-option button span { display: block; color: #64748b; font-size: 11px; margin-top: 5px; }
.customer-agent-nav .customer-nav-note { border-top: 1px solid #e2e2dc; padding-top: 20px; margin-top: 24px; }
.customer-config-content { max-width: 1320px; margin: 0 auto; }
.customer-agent-heading { display: flex; justify-content: space-between; gap: 16px; }
.customer-agent-heading h3 { font-size: 18px; color: #0f172a; font-weight: 600; }
.customer-agent-heading p { margin-top: 6px; font-size: 12px; color: #64748b; }
.customer-agent-heading > span { align-self: start; white-space: nowrap; }
.customer-prompt { font-size: 12px; margin: 18px 0 28px; color: #64748b; border-bottom: 1px solid #e2e2dc; padding-bottom: 20px; }
.customer-prompt summary { cursor: pointer; }
.customer-prompt pre { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; margin-top: 12px; background: #f7f7f5; padding: 14px; color: #475569; }
.customer-loading-columns { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 32px; }
.customer-skill-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }
.customer-group { display: flex; gap: 7px; align-items: center; border: 1px solid #deded9; border-radius: 4px; padding: 8px; cursor: pointer; font-size: 11px; }
.customer-group small { display: block; color: #64748b; margin-top: 2px; }
.customer-group-help { font-size: 11px !important; margin: 10px 0 14px !important; line-height: 1.8; }
.customer-skills { max-height: 420px; overflow: auto; margin-top: 8px; border-bottom: 1px solid #e2e2dc; scrollbar-width: thin; }
.customer-skill-row { display: flex; align-items: start; gap: 10px; padding: 13px 0; border-bottom: 1px solid #e9e9e4; cursor: pointer; }
.customer-skill-row > span { min-width: 0; }
.customer-skill-row strong { font-size: 12px; margin-right: 8px; }
.customer-skill-row p { font-size: 11px; color: #64748b; line-height: 1.8; margin-top: 5px; }
.customer-skill-row .customer-private { color: #475569; }
.customer-detection { border-top: 1px solid #e2e2dc; margin-top: 24px; padding-top: 18px; font-size: 12px; line-height: 1.8; }
.customer-detection h4 { font-weight: 600; }
.customer-detection p { color: #64748b; margin: 6px 0; }
@media (max-width: 1100px) { .customer-agent-nav { flex-basis: 220px; padding: 20px 12px; } .customer-loading-columns { grid-template-columns: 1fr; gap: 28px; } }
@media (max-width: 760px) {
  .customer-table { min-width: 840px; }
  .customer-editor-body { display: block; overflow: auto; }
  .customer-agent-nav { overflow: visible; border-right: 0; border-bottom: 1px solid #e2e2dc; padding: 16px; }
  .customer-agent-option { display: inline-flex; width: 100%; padding: 6px 10px; margin-bottom: 4px; }
  .customer-agent-nav > p { margin-bottom: 10px; }
  .customer-agent-nav .customer-nav-note { display: none; }
  .customer-config-scroll { overflow: visible; }
  .customer-skill-groups { gap: 5px; }
  .customer-group { padding: 6px; gap: 5px; }
}
</style>
