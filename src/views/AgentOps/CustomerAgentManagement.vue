<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@packages/icon';
import { useAgentOpsStore } from '@/pinia/agentOps';
import { defaultAgentBinding } from '@/pinia/customerAgents';
import type { AgentCapabilities } from '@/pinia/agentOps';
import type { ActivatedCustomer, AgentConfigurationMode, CustomerAgentBinding, CustomerAgentTarget } from '@/pinia/customerAgents';
import { agentConfigurationFingerprint } from './agentConflicts';
import CustomerConflictReport from './CustomerConflictReport.vue';
import AgentCapabilityConfig from './AgentCapabilityConfig.vue';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';

const props = defineProps<{ initialTarget?: CustomerAgentTarget }>();
const emit = defineEmits<{ editingChange: [open: boolean]; editAgentDefault: [agentId: string] }>();
const store = useAgentOpsStore();
const search = ref('');
const typeFilter = ref('全部');
const editingId = ref('');
const selectedAgentId = ref('');
const editorHeading = ref<HTMLElement>();
const draft = reactive<Record<string, CustomerAgentBinding>>({});
const savedDraft = ref('');
const formError = ref('');
const reportOpen = ref(false);
const customer = computed(() => store.customers.find(item => item.id === editingId.value));
const activeAgent = computed(() => store.agents.find(agent => agent.id === selectedAgentId.value));
const activeBinding = computed(() => draft[selectedAgentId.value]);
const isDefault = computed(() => activeBinding.value?.mode === 'default');
const effectiveCapabilities = computed(() => store.resolveAgentCapabilities(selectedAgentId.value, activeBinding.value));
const draftConfigs = computed(() => Object.values(draft));
const fingerprint = () => JSON.stringify(draftConfigs.value);
const hasChanges = computed(() => fingerprint() !== savedDraft.value);
const filteredCustomers = computed(() => store.customers.filter(item => item.name.toLowerCase().includes(search.value.trim().toLowerCase()) && (typeFilter.value === '全部' || item.activationType === typeFilter.value)));
const catalog = computed(() => ({ skills: store.availableSkillsForAgent(selectedAgentId.value), tools: store.tools }));
const loadConfig = computed(() => ({ name: activeAgent.value?.name ?? '', systemPrompt: store.resolveAgentSystemPrompt(selectedAgentId.value, activeBinding.value), ...effectiveCapabilities.value }));
const invalidAgents = computed(() => Object.keys(draft).filter(id => !store.agents.some(agent => agent.id === id)));
const report = computed(() => store.customerReports[editingId.value]?.[selectedAgentId.value]);
const reportStale = computed(() => !!report.value && report.value.fingerprint !== agentConfigurationFingerprint(loadConfig.value, catalog.value));
const agentName = (id: string) => store.agents.find(agent => agent.id === id)?.name ?? `已失效：${id}`;
function openCustomer(item: ActivatedCustomer, agentId?: string) {
  Object.keys(draft).forEach(id => delete draft[id]);
  store.customerAgentBindings(item.id).forEach(binding => { draft[binding.agentId] = binding; });
  selectedAgentId.value = agentId || store.agents[0]?.id || '';
  savedDraft.value = fingerprint();
  formError.value = '';
  editingId.value = item.id;
  nextTick(() => editorHeading.value?.focus());
}
function setMode(mode: AgentConfigurationMode) {
  if (!activeBinding.value || activeBinding.value.mode === mode) return;
  draft[selectedAgentId.value] = mode === 'default' ? defaultAgentBinding(selectedAgentId.value)
    : { agentId: selectedAgentId.value, mode, systemPrompt: store.resolveAgentSystemPrompt(selectedAgentId.value, activeBinding.value), ...effectiveCapabilities.value };
}
function setCustomCapabilities(config: AgentCapabilities) {
  if (!isDefault.value && activeBinding.value) Object.assign(activeBinding.value, config);
}
function bindingSummary(agentId: string) {
  const binding = draft[agentId];
  const config = store.resolveAgentCapabilities(agentId, binding);
  return `${binding?.mode === 'custom' ? '自定义' : '遵循默认'} · ${config.skillIds.length} Skill · ${config.toolIds.length} Tool`;
}
async function editDefaults() {
  if (hasChanges.value) {
    try { await ElMessageBox.confirm('前往 Agent 管理将放弃本页未保存的客户配置。', '放弃未保存的修改？', { confirmButtonText: '放弃修改并前往', cancelButtonText: '继续编辑', type: 'warning' }); }
    catch { return; }
  }
  emit('editAgentDefault', selectedAgentId.value);
}
function save(andDetect = false) {
  try {
    store.saveCustomerAgents(editingId.value, draftConfigs.value);
    store.customerAgentBindings(editingId.value).forEach(binding => { draft[binding.agentId] = binding; });
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
watch([selectedAgentId, editingId], () => { reportOpen.value = false; });
watch(() => props.initialTarget, target => {
  const item = store.customers.find(customer => customer.id === target?.customerId);
  if (item) openCustomer(item, target?.agentId);
}, { immediate: true });
onBeforeUnmount(() => emit('editingChange', false));
</script>

<template>
  <section v-show="!customer" class="agent-management customer-list">
    <div class="agent-page-header"><div><h2>客户 Agent 配置</h2><p>配置客户的 Agent 指令与加载能力。</p></div><span class="customer-total">{{ store.customers.length }} 个已开通客户</span></div>
    <div class="agent-toolbar"><label class="agent-search"><Icon :svg="strokeIconPaths.search" :size="15" /><input v-model="search" class="ops-input ops-search" aria-label="搜索客户" placeholder="搜索客户名称" /></label><select v-model="typeFilter" class="ops-input customer-type-filter" aria-label="开通类型"><option>全部</option><option>正式</option><option>试用</option></select><span>共 {{ filteredCustomers.length }} 个客户</span></div>
    <div class="customer-table-scroll"><table class="customer-table"><thead><tr><th>客户</th><th>开通周期（合同开始 — 合同结束）</th><th>开通类型</th><th>Agent 配置方式</th><th>操作</th></tr></thead><tbody>
      <tr v-for="item in filteredCustomers" :key="item.id"><td><strong>{{ item.name }}</strong><p class="customer-cid">CID：{{ item.cid }}</p></td><td class="customer-dates">{{ item.contractStart }} <span>—</span> {{ item.contractEnd }}</td><td><span class="agent-status" :class="item.activationType === '试用' ? 'is-warning' : 'is-success'">{{ item.activationType }}</span></td><td><div class="agent-tags"><span v-for="binding in store.customerAgentBindings(item.id)" :key="binding.agentId" class="agent-tag">{{ agentName(binding.agentId) }} · {{ binding.mode === 'default' ? '遵循默认' : '自定义' }}</span></div></td><td><button type="button" class="ops-secondary" :aria-label="`配置 ${item.name}`" @click="openCustomer(item)">配置</button></td></tr>
    </tbody></table><div v-if="!filteredCustomers.length" class="agent-empty"><h3>没有匹配的客户</h3><p>尝试其他名称或开通类型。</p><button class="ops-secondary" @click="search = ''; typeFilter = '全部'">清除筛选</button></div></div>
    <p class="customer-footnote">客户与合同为演示数据。配置保存在当前演示会话中。</p>
  </section>

  <section v-if="customer" class="agent-editor-page" aria-label="客户 Agent 配置页面">
    <header class="agent-editor-header">
      <div class="agent-editor-title"><button type="button" class="agent-back" @click="backToList"><Icon :svg="strokeIconPaths.arrowUp" :size="16" svg-class="-rotate-90" />返回客户列表</button><h2 ref="editorHeading" tabindex="-1">{{ customer.name }}<span>客户 Agent 配置</span></h2><dl class="customer-contract"><div><dt>CID：</dt><dd>{{ customer.cid }}</dd></div><div><dt>开通类型：</dt><dd>{{ customer.activationType }}</dd></div><div><dt>合同周期：</dt><dd>{{ customer.contractStart }} — {{ customer.contractEnd }}</dd></div></dl></div>
      <div class="agent-editor-actions"><span :class="{ 'is-dirty': hasChanges }" role="status">{{ hasChanges ? '有未保存的修改' : '配置已保存' }}</span><button type="button" class="ops-secondary" @click="save()">保存配置</button><button type="button" class="ops-primary" :disabled="!activeAgent" @click="save(true)">保存并检测当前 Agent</button></div>
      <p v-if="formError" class="agent-form-error" role="alert">{{ formError }}</p>
    </header>
    <div class="customer-editor-body">
      <aside class="customer-agent-nav" aria-label="选择客户 Agent"><h3>固定开通 Agent <span>{{ store.agents.length }} / {{ store.agents.length }}</span></h3>
        <div v-for="agent in store.agents" :key="agent.id" class="customer-agent-option" :class="{ selected: selectedAgentId === agent.id }"><input type="checkbox" checked disabled :aria-label="`已固定开通 ${agent.name}`" /><button type="button" :aria-pressed="selectedAgentId === agent.id" @click="selectedAgentId = agent.id"><strong>{{ agent.name }}</strong><span>{{ bindingSummary(agent.id) }}</span></button></div>
        <div v-for="id in invalidAgents" :key="id" class="agent-notice warning"><div><p>{{ agentName(id) }}</p><button class="agent-text-link" @click="delete draft[id]">移除失效 Agent</button></div></div>
      </aside>
      <div class="agent-editor-scroll customer-config-scroll">
        <div v-if="activeAgent && activeBinding" class="customer-config-content">
          <div class="customer-agent-heading"><h3>{{ activeAgent.name }}</h3><span class="agent-status is-success">已固定开通</span></div>
          <section class="customer-config-mode customer-config-block" aria-label="配置方式">
            <h3 id="customer-mode-label">配置方式</h3>
            <div class="customer-mode-options" role="radiogroup" aria-labelledby="customer-mode-label">
              <label><input type="radio" name="agent-config-mode" :checked="isDefault" @change="setMode('default')" />遵循默认配置</label>
              <label><input type="radio" name="agent-config-mode" :checked="!isDefault" @change="setMode('custom')" />自定义配置</label>
            </div>
            <button type="button" class="agent-text-link" @click="editDefaults">编辑默认配置</button>
          </section>
          <section v-if="!isDefault" class="customer-prompt customer-config-block" aria-label="自定义 System Prompt">
            <div class="customer-prompt-heading"><label for="customer-system-prompt">System Prompt</label><span>仅对当前客户生效</span></div>
            <textarea id="customer-system-prompt" v-model="activeBinding.systemPrompt" class="ops-input" rows="5" placeholder="填写当前客户使用此 Agent 时的指令" required />
          </section>
          <AgentCapabilityConfig :model-value="effectiveCapabilities" :agent-id="selectedAgentId" :context="`${customer.name} → ${activeAgent.name}`" :read-only="isDefault" @update:model-value="setCustomCapabilities" />
            <section class="customer-detection customer-config-block" aria-label="当前 Agent 冲突检测"><h3>调用冲突检测</h3><button v-if="report" class="agent-text-link" @click="reportOpen = true">{{ reportStale ? '配置已变化 · 查看上次检测结果' : `查看检测结果 · ${report.findings.length} 项` }}</button><p v-else>尚未检测，可在页首保存并检测。</p></section>
        </div>
        <div v-else class="agent-empty"><h3>请选择有效的 Agent</h3><p>已失效的 Agent 可从左侧移除；最新目录在 Agent 管理中同步。</p></div>
        <p class="agent-editor-footnote">配置保存在当前演示会话中。</p>
      </div>
    </div>
    <CustomerConflictReport :open="reportOpen" :report="report" :customer-name="customer.name" :agent-name="activeAgent?.name ?? ''" :stale="reportStale" @close="reportOpen = false" @rerun="save(true)" />
  </section>
</template>
<style scoped src="./agentManagement.css"></style>
<style scoped>
.customer-agent-nav input[type="checkbox"] { width: 15px; height: 15px; flex-shrink: 0; accent-color: #334155; cursor: default; }
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
.customer-agent-nav h3 { font-size: 14px; font-weight: 600; margin-bottom: 16px; }
.customer-agent-nav h3 span { margin-left: 6px; font-weight: 400; color: #64748b; }
.customer-agent-option { display: flex; gap: 10px; align-items: center; padding: 12px; margin-bottom: 10px; border: 1px solid transparent; border-radius: 6px; }
.customer-agent-option.selected { background: white; border-color: #bdc4cd; }
.customer-agent-option button { flex: 1; text-align: left; min-width: 0; }
.customer-agent-option strong { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.customer-agent-option button span { display: block; color: #64748b; font-size: 11px; margin-top: 5px; }
.customer-config-content { max-width: 1320px; margin: 0 auto; }
.customer-agent-heading { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 20px; margin-bottom: 24px; border-bottom: 1px solid #e2e2dc; }
.customer-agent-heading h3 { font-size: 18px; color: #0f172a; font-weight: 600; }
.customer-agent-heading > span { align-self: start; white-space: nowrap; }
.customer-config-block { min-width: 0; padding: 20px; border: 1px solid #deded9; border-radius: 6px; }
.customer-config-mode { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; padding-block: 12px; margin-bottom: 20px; }
.customer-config-mode h3 { font-size: 14px; font-weight: 600; color: #0f172a; }
.customer-config-mode > button { margin-left: auto; font-size: 12px; min-height: 32px; }
.customer-mode-options { display: flex; flex-wrap: wrap; gap: 4px 20px; }
.customer-mode-options label { display: flex; align-items: center; gap: 7px; min-height: 32px; font-size: 13px; cursor: pointer; }
.customer-mode-options input { width: 14px; height: 14px; margin: 0; accent-color: #334155; }
.customer-prompt { margin-bottom: 20px; }
.customer-prompt-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin-bottom: 12px; }
.customer-prompt-heading label { font-size: 14px; font-weight: 600; color: #0f172a; }
.customer-prompt-heading span { font-size: 12px; color: #64748b; }
.customer-prompt textarea { display: block; width: 100%; min-height: 136px; resize: vertical; line-height: 1.7; }
.customer-detection { margin-top: 20px; font-size: 12px; line-height: 1.8; }
.customer-detection h3 { font-size: 14px; font-weight: 600; color: #0f172a; }
.customer-detection p { color: #64748b; margin: 6px 0; }
@media (max-width: 1100px) { .customer-agent-nav { flex-basis: 220px; padding: 20px 12px; } }
@media (max-width: 760px) {
  .customer-table { min-width: 840px; }
  .customer-editor-body { display: block; overflow: auto; }
  .customer-agent-nav { overflow: visible; border-right: 0; border-bottom: 1px solid #e2e2dc; padding: 16px; }
  .customer-agent-option { display: inline-flex; width: 100%; padding: 6px 10px; margin-bottom: 4px; }
  .customer-config-scroll { overflow: visible; }
  .customer-config-block, .customer-config-block.agent-loading-section { padding: 16px; }
}
</style>
