<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, ElTooltip } from 'element-plus';
import { Icon } from '@packages/icon';
import { useAgentOpsStore } from '@/pinia/agentOps';
import type { ActivatedCustomer, CustomerAgentBinding, CustomerAgentTarget } from '@/pinia/customerAgents';
import { agentConfigurationFingerprint, resolveAgentTools } from './agentConflicts';
import CustomerConflictReport from './CustomerConflictReport.vue';
import CustomerCapabilityPicker from './CustomerCapabilityPicker.vue';
import { mergeCapabilitySelection } from './capabilitySelection';
import type { CapabilityOption } from './capabilitySelection';
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
const pickerOpen = ref(false);
const pickerKind = ref<'skill' | 'tool'>('skill');
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
const loadConfig = computed(() => ({ name: activeAgent.value?.name ?? '', systemPrompt: activeAgent.value?.systemPrompt ?? '', skillIds: activeEnabled.value ? activeBinding.value?.skillIds ?? [] : [], toolIds: activeEnabled.value ? activeBinding.value?.toolIds ?? [] : [] }));
const usages = computed(() => resolveAgentTools(loadConfig.value, catalog.value));
const overlaps = computed(() => usages.value.filter(usage => usage.paths.some(path => path.kind === 'direct') && usage.paths.some(path => path.kind === 'private')));
const selectedSkills = computed(() => (activeBinding.value?.skillIds ?? []).map(id => ({ id, skill: catalog.value.skills.find(skill => skill.id === id) })));
const selectedTools = computed(() => (activeBinding.value?.toolIds ?? []).map(id => ({ id, tool: store.tools.find(tool => tool.id === id) })));
const skillOptions = computed<CapabilityOption[]>(() => catalog.value.skills.map(skill => ({
  id: skill.id, name: skill.name, description: skill.description, group: skill.group, disabled: !skill.enabled,
  detail: skill.privateToolIds.length ? `私有 Tool：${privateNames(skill.privateToolIds)}` : undefined,
})));
const toolOptions = computed<CapabilityOption[]>(() => store.tools.map(tool => ({
  id: tool.id, name: tool.name, description: tool.description, kind: tool.kind,
  warning: usages.value.some(usage => usage.id === tool.id && usage.paths.some(path => path.kind === 'private')) ? '已由所选 Skill 私有加载；直接添加后将存在多条加载路径。' : undefined,
})));
const pickerItems = computed(() => pickerKind.value === 'skill' ? skillOptions.value : toolOptions.value);
const pickerLoadedIds = computed(() => (pickerKind.value === 'skill' ? activeBinding.value?.skillIds : activeBinding.value?.toolIds) ?? []);
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
function openPicker(kind: 'skill' | 'tool') {
  pickerKind.value = kind;
  pickerOpen.value = true;
}
function addCapabilities(ids: string[]) {
  if (!activeEnabled.value || !activeBinding.value) return;
  const field = pickerKind.value === 'skill' ? 'skillIds' : 'toolIds';
  activeBinding.value[field] = mergeCapabilitySelection(activeBinding.value[field], ids, pickerItems.value);
  pickerOpen.value = false;
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
watch([selectedAgentId, editingId, activeEnabled], () => { pickerOpen.value = false; reportOpen.value = false; });
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
      <tr v-for="item in filteredCustomers" :key="item.id"><td><strong>{{ item.name }}</strong><p class="customer-cid">CID：{{ item.cid }}</p></td><td class="customer-dates">{{ item.contractStart }} <span>—</span> {{ item.contractEnd }}</td><td><span class="agent-status" :class="item.activationType === '试用' ? 'is-warning' : 'is-success'">{{ item.activationType }}</span></td><td><div class="agent-tags"><span v-for="binding in item.agentConfigs" :key="binding.agentId" class="agent-tag">{{ agentName(binding.agentId) }}</span><span v-if="!item.agentConfigs.length" class="agent-muted">待配置</span></div></td><td><button type="button" class="ops-secondary" :aria-label="`配置 ${item.name}`" @click="openCustomer(item)">配置</button></td></tr>
    </tbody></table><div v-if="!filteredCustomers.length" class="agent-empty"><h3>没有匹配的客户</h3><p>尝试其他名称或开通类型。</p><button class="ops-secondary" @click="search = ''; typeFilter = '全部'">清除筛选</button></div></div>
    <p class="customer-footnote">客户与合同为演示数据。配置保存在当前演示会话中。</p>
  </section>

  <section v-if="customer" class="agent-editor-page" aria-label="客户 Agent 配置页面">
    <header class="agent-editor-header">
      <div class="agent-editor-title"><button type="button" class="agent-back" @click="backToList"><Icon :svg="strokeIconPaths.arrowUp" :size="16" svg-class="-rotate-90" />返回客户列表</button><h2 ref="editorHeading" tabindex="-1">{{ customer.name }}<span>客户 Agent 配置</span></h2><dl class="customer-contract"><div><dt>CID：</dt><dd>{{ customer.cid }}</dd></div><div><dt>开通类型：</dt><dd>{{ customer.activationType }}</dd></div><div><dt>合同周期：</dt><dd>{{ customer.contractStart }} — {{ customer.contractEnd }}</dd></div></dl></div>
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
          <div v-if="!activeEnabled" class="agent-empty"><h3>该客户尚未启用此 Agent</h3><p>启用后，可单独配置此 Agent 的 Skill 和直接加载的 Tool。</p><button class="ops-primary" @click="toggleAgent(selectedAgentId, true)">允许该客户使用</button></div>
          <template v-else>
            <div class="customer-loading-columns">
              <section class="agent-loading-section customer-config-block" aria-label="Skill 加载配置">
                <div class="customer-loading-header"><h3>Skill 加载 <span>当前已选 {{ selectedSkills.length }} 个</span></h3><button type="button" class="ops-secondary" @click="openPicker('skill')"><Icon :svg="strokeIconPaths.plus" :size="14" />添加 Skill</button></div>
                <p>通过搜索或按组批量添加 Skill。私有 Tool 随所选 Skill 加载。</p>
                <ul class="customer-selected-tags" aria-label="已选 Skill 加载列表">
                  <li v-for="{ id, skill } in selectedSkills" :key="id" class="customer-capability-tag" :class="{ 'is-warning': !skill || !skill.enabled }">
                    <ElTooltip placement="top" :show-after="250" :hide-after="0">
                      <template #content><div class="customer-tag-details"><strong>{{ skill?.group ?? 'Skill 已失效' }}</strong><p>{{ skill?.description ?? '该 Skill 已失效或不适用于当前 Agent，请移除后保存。' }}</p><p v-if="skill?.privateToolIds.length">私有 Tool：{{ privateNames(skill.privateToolIds) }}</p><p v-if="skill && !skill.enabled">Skill 已停用，暂不可调用。</p></div></template>
                      <span class="customer-tag-label" tabindex="0">{{ skill?.name ?? id }}<span v-if="!skill" class="customer-tag-state">已失效</span><span v-else-if="!skill.enabled" class="customer-tag-state">已停用</span></span>
                    </ElTooltip>
                    <button type="button" class="customer-tag-remove" :aria-label="`移除 Skill ${skill?.name ?? id}`" @click="activeBinding.skillIds = activeBinding.skillIds.filter(item => item !== id)"><Icon :svg="strokeIconPaths.x" :size="13" /></button>
                  </li>
                </ul>
                <p v-if="!selectedSkills.length" class="agent-selection-empty">尚未选择 Skill。点击“添加 Skill”搜索或按组批量选择。</p>
              </section>
              <section class="agent-loading-section customer-config-block" aria-label="Tool 加载配置">
                <div class="customer-loading-header"><h3>Tool 直接加载 <span>当前已选 {{ selectedTools.length }} 个</span></h3><button type="button" class="ops-secondary" @click="openPicker('tool')"><Icon :svg="strokeIconPaths.plus" :size="14" />添加 Tool</button></div>
                <p>指定该客户下此 Agent 可直接调用的工具，与 Skill 私有加载独立。</p>
                <ul class="customer-selected-tags" aria-label="已选 Tool 加载列表">
                  <li v-for="{ id, tool } in selectedTools" :key="id" class="customer-capability-tag" :class="{ 'is-warning': !tool || overlaps.some(usage => usage.id === id) }">
                    <ElTooltip placement="top" :show-after="250" :hide-after="0">
                      <template #content><div class="customer-tag-details"><strong>{{ !tool ? 'Tool 已失效' : tool.kind === 'mcp' ? 'MCP 服务' : '代码工具' }}</strong><p>{{ tool?.description ?? '该 Tool 已失效，请移除后保存。' }}</p><p v-if="overlaps.some(usage => usage.id === id)">与所选 Skill 的私有 Tool 重叠，建议通过冲突检测检查调用边界。</p></div></template>
                      <span class="customer-tag-label" tabindex="0">{{ tool?.name ?? id }}<span v-if="!tool" class="customer-tag-state">已失效</span><span v-else-if="overlaps.some(usage => usage.id === id)" class="customer-tag-state">多路径</span></span>
                    </ElTooltip>
                    <button type="button" class="customer-tag-remove" :aria-label="`移除 Tool ${toolName(id)}`" @click="activeBinding.toolIds = activeBinding.toolIds.filter(item => item !== id)"><Icon :svg="strokeIconPaths.x" :size="13" /></button>
                  </li>
                </ul>
                <p v-if="!selectedTools.length" class="agent-selection-empty">尚未指定直接工具。点击“添加 Tool”批量选择；Skill 的私有工具仍可随 Skill 调用。</p>
                <div v-if="overlaps.length" class="agent-notice warning" role="status"><div><strong>{{ overlaps.length }} 个 Tool 存在多条加载路径</strong><p>{{ overlaps.map(usage => toolName(usage.id)).join('、') }}。允许保存，建议通过冲突检测检查调用边界。</p></div></div>
              </section>
            </div>
            <section class="customer-detection customer-config-block" aria-label="当前 Agent 冲突检测"><h3>当前客户 · 当前 Agent 的冲突检测</h3><p>检查加载路径、功能描述及工具 Schema 的疑似歧义。</p><button v-if="report" class="agent-text-link" @click="reportOpen = true">{{ reportStale ? '配置已变化 · 查看上次检测结果' : `查看检测结果 · ${report.findings.length} 项` }}</button><p v-else>尚未检测。点击页首“保存并检测当前 Agent”开始。</p></section>
            <section class="agent-scope-section customer-config-block"><h3>全部可调用的 Tool <span>{{ usages.filter(usage => usage.tool).length }} 个，按工具去重</span></h3><p>范围：{{ customer.name }} → {{ activeAgent.name }}。合并直接工具与已启用 Skill 的私有工具。</p><div class="agent-scope-list"><div v-for="usage in usages" :key="usage.id" class="agent-scope-row"><strong>{{ toolName(usage.id) }}</strong><div class="agent-tags"><span v-for="path in usage.paths" :key="path.label" class="agent-tag" :class="{ 'is-private': path.kind === 'private' }">{{ path.label }}</span></div></div><p v-if="!usages.length" class="agent-selection-empty">当前没有可调用的 Tool。</p></div></section>
          </template>
        </div>
        <div v-else class="agent-empty"><h3>请选择有效的 Agent</h3><p>已失效的 Agent 可从左侧移除；最新目录在 Agent 管理中同步。</p></div>
        <p class="agent-editor-footnote">配置保存在当前演示会话中。Skill 定义与私有工具绑定继续在对应 Skill 中维护。</p>
      </div>
    </div>
    <CustomerCapabilityPicker :open="pickerOpen" :kind="pickerKind" :context="`${customer.name} · ${activeAgent?.name ?? ''}`" :items="pickerItems" :loaded-ids="pickerLoadedIds" @close="pickerOpen = false" @add="addCapabilities" />
    <CustomerConflictReport :open="reportOpen" :report="report" :customer-name="customer.name" :agent-name="activeAgent?.name ?? ''" :stale="reportStale" @close="reportOpen = false" @rerun="save(true)" />
  </section>
</template>
<style scoped src="./agentManagement.css"></style>
<style scoped>
.customer-agent-nav input[type="checkbox"] { width: 15px; height: 15px; flex-shrink: 0; accent-color: #334155; cursor: pointer; }
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
.customer-cid { margin-top: 6px; color: #64748b; font-size: 11px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.customer-dates { font-variant-numeric: tabular-nums; white-space: nowrap; }
.customer-dates span { color: #94a3b8; margin: 0 4px; }
.customer-footnote { border-top: 1px solid #e2e2dc; padding: 12px 20px; color: #64748b; font-size: 12px; }
.customer-contract { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; font-size: 12px; line-height: 1.7; color: #64748b; font-variant-numeric: tabular-nums; }
.customer-contract > div { display: flex; min-width: 0; }
.customer-contract dt { flex-shrink: 0; }
.customer-contract dd { overflow-wrap: anywhere; }
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
.customer-agent-heading { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 20px; margin-bottom: 24px; border-bottom: 1px solid #e2e2dc; }
.customer-agent-heading h3 { font-size: 18px; color: #0f172a; font-weight: 600; }
.customer-agent-heading p { margin-top: 6px; font-size: 12px; color: #64748b; }
.customer-agent-heading > span { align-self: start; white-space: nowrap; }
.customer-loading-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.customer-config-block { min-width: 0; padding: 20px; border: 1px solid #deded9; border-radius: 6px; }
.customer-config-block > p { line-height: 1.8; }
.customer-config-block.agent-scope-section { margin-top: 20px; }
.customer-loading-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.customer-loading-header h3 span { display: block; margin: 6px 0 0; }
.customer-loading-header button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.customer-selected-tags { display: flex; flex-wrap: wrap; align-items: start; gap: 8px; margin-top: 18px; }
.customer-selected-tags:empty { display: none; }
.customer-capability-tag { display: inline-flex; align-items: center; max-width: 100%; border: 1px solid #dce1e7; border-radius: 4px; background: #f4f6f8; color: #334155; font-size: 12px; line-height: 1.7; }
.customer-capability-tag.is-warning { color: #92400e; background: #fff7e5; border-color: #e8ce9f; }
.customer-tag-label { min-width: 0; padding: 4px 2px 4px 10px; overflow-wrap: anywhere; cursor: help; }
.customer-tag-label:focus-visible { outline: 2px solid #64748b; outline-offset: 2px; border-radius: 3px; }
.customer-tag-state { margin-left: 6px; font-size: 11px; }
.customer-tag-remove { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 28px; height: 28px; margin: 1px 2px; border-radius: 3px; color: inherit; }
.customer-tag-remove:hover { color: #b42318; background: #feece9; }
.customer-tag-details { max-width: min(300px, calc(100vw - 48px)); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.customer-tag-details p { margin-top: 4px; }
.customer-detection { margin-top: 20px; font-size: 12px; line-height: 1.8; }
.customer-detection h3 { font-size: 14px; font-weight: 600; color: #0f172a; }
.customer-detection p { color: #64748b; margin: 6px 0; }
@media (max-width: 1100px) { .customer-agent-nav { flex-basis: 220px; padding: 20px 12px; } .customer-loading-columns { grid-template-columns: 1fr; } }
@media (max-width: 760px) {
  .customer-table { min-width: 840px; }
  .customer-editor-body { display: block; overflow: auto; }
  .customer-agent-nav { overflow: visible; border-right: 0; border-bottom: 1px solid #e2e2dc; padding: 16px; }
  .customer-agent-option { display: inline-flex; width: 100%; padding: 6px 10px; margin-bottom: 4px; }
  .customer-agent-nav > p { margin-bottom: 10px; }
  .customer-agent-nav .customer-nav-note { display: none; }
  .customer-config-scroll { overflow: visible; }
  .customer-config-block, .customer-config-block.agent-loading-section { padding: 16px; }
}
</style>
