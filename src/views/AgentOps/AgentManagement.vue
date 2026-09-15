<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@packages/icon';
import { agentRoleDescriptions, useAgentOpsStore } from '@/pinia/agentOps';
import type { AgentCapabilities, AgentConfig, ManagedAgent } from '@/pinia/agentOps';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';
import AgentCapabilityConfig from './AgentCapabilityConfig.vue';
import CustomerConflictReport from './CustomerConflictReport.vue';
import { analyzeAgentConflicts, agentConfigurationFingerprint } from './agentConflicts';
import type { AgentConflictReport } from './agentConflicts';
const props = defineProps<{ initialAgentId?: string }>();
const store = useAgentOpsStore();
const emit = defineEmits<{ manageCustomers: []; editingChange: [open: boolean] }>();
const search = ref('');
const editorOpen = ref(false);
const editingId = ref('');
const editorHeading = ref<HTMLElement>();
const savedDraft = ref('');
const draft = reactive<AgentConfig>({ name: '', systemPrompt: '' });
const defaultDraft = ref<AgentCapabilities>({ skillIds: [], toolIds: [] });
const editorTab = ref<'basics' | 'defaults'>('defaults');
const snapshot = () => JSON.stringify({ definition: draft, defaults: defaultDraft.value });
const hasChanges = computed(() => snapshot() !== savedDraft.value);
const reportOpen = ref(false);
const reports = ref<Record<string, AgentConflictReport>>({});
const report = computed(() => reports.value[editingId.value]);
const catalog = computed(() => ({ skills: store.availableSkillsForAgent(editingId.value), tools: store.tools }));
const reportStale = computed(() => !!report.value && report.value.fingerprint !== agentConfigurationFingerprint({ ...draft, ...defaultDraft.value }, catalog.value));
const formError = ref('');
const filteredAgents = computed(() => store.agents.filter((agent) => `${agent.name} ${agent.systemPrompt}`.toLowerCase().includes(search.value.trim().toLowerCase())));
function openEditor(agent: ManagedAgent) {
  editingId.value = agent.id;
  Object.assign(draft, { name: agent.name, systemPrompt: agent.systemPrompt });
  defaultDraft.value = store.agentDefaultConfig(agent.id);
  savedDraft.value = snapshot();
  formError.value = '';
  editorTab.value = 'defaults';
  editorOpen.value = true;
  nextTick(() => editorHeading.value?.focus());
}
async function backToList() {
  if (hasChanges.value) {
    try { await ElMessageBox.confirm('返回后将放弃当前 Agent 未保存的修改。', '放弃未保存的修改？', { confirmButtonText: '放弃修改并返回', cancelButtonText: '继续编辑', type: 'warning' }); }
    catch { return; }
  }
  editorOpen.value = false;
}
function save(andDetect = false) {
  try {
    const agent = store.saveAgent(draft, editingId.value, defaultDraft.value);
    Object.assign(draft, { name: agent.name, systemPrompt: agent.systemPrompt });
    defaultDraft.value = store.agentDefaultConfig(agent.id);
    savedDraft.value = snapshot();
    formError.value = '';
    ElMessage.success(`Agent 配置已保存，${store.defaultFollowers(editingId.value).length} 个客户遵循此默认配置`);
    if (andDetect) {
      reports.value[editingId.value] = analyzeAgentConflicts({ ...draft, ...defaultDraft.value }, catalog.value);
      reportOpen.value = true;
    }
  } catch (error) { formError.value = error instanceof Error ? error.message : '保存失败，请重试。'; }
}
async function syncAgents() { try { await store.syncAgents(); } catch { /* Display retryable inline error. */ } }
watch(editorOpen, (open) => emit('editingChange', open), { flush: 'sync' });
watch(() => props.initialAgentId, id => {
  const agent = store.agents.find(item => item.id === id);
  if (agent) openEditor(agent);
}, { immediate: true });
onBeforeUnmount(() => emit('editingChange', false));
</script>
<template>
  <section v-show="!editorOpen" class="agent-management">
    <div class="agent-page-header">
      <div><h2>Agent 管理</h2><p>维护 Agent 名称、System Prompt 和默认加载能力，供新客户及非定制客户统一使用。</p></div>
      <button type="button" class="ops-primary" :disabled="store.agentSync.busy" @click="syncAgents"><Icon :svg="strokeIconPaths.refresh" :size="15" />{{ store.agentSync.busy ? '同步中…' : '现在同步' }}</button>
    </div>
    <div class="ops-sync-status" :class="{ 'is-error': store.agentSync.error }" :role="store.agentSync.error ? 'alert' : 'status'"><span>{{ store.agentSync.error || store.agentSync.summary || 'Agent 由工程注册，仅支持编辑；同步保留已保存的定义、默认加载与客户自定义配置。' }}</span><span v-if="store.agentSync.lastSyncedAt">上次成功同步：{{ store.agentSync.lastSyncedAt }}</span></div>
    <div class="agent-toolbar"><label class="agent-search"><Icon :svg="strokeIconPaths.search" :size="15" /><input v-model="search" class="ops-input ops-search" aria-label="搜索 Agent" placeholder="搜索 Agent 名称或 System Prompt" /></label><span>{{ filteredAgents.length }} 个 Agent</span></div>
    <div class="agent-list-scroll">
      <div v-if="filteredAgents.length" class="agent-grid">
        <article v-for="agent in filteredAgents" :key="agent.id" class="agent-card" :aria-label="agent.name">
          <div class="agent-card-heading"><Icon :svg="strokeIconPaths.bot" :size="21" /><h3>{{ agent.name }}</h3></div>
          <p class="agent-role-description">{{ agentRoleDescriptions[agent.role] }}</p>
          <div class="agent-card-content"><h4>System Prompt</h4><p class="agent-prompt-preview">{{ agent.systemPrompt }}</p><h4>默认加载配置</h4><div class="agent-tags"><span class="agent-tag">{{ store.agentDefaultConfig(agent.id).skillIds.length }} 个 Skill</span><span class="agent-tag">{{ store.agentDefaultConfig(agent.id).toolIds.length }} 个直接 Tool</span></div><p class="agent-muted mt-5">{{ store.defaultFollowers(agent.id).length }} 个客户遵循默认 · {{ store.customers.length - store.defaultFollowers(agent.id).length }} 个客户自定义</p></div>
          <div class="agent-card-footer"><div class="agent-card-actions"><button type="button" class="ops-secondary" @click="openEditor(agent)"><Icon :svg="strokeIconPaths.settings" :size="14" />编辑 Agent</button><button type="button" class="ops-secondary" @click="emit('manageCustomers')">客户 Agent 配置</button></div><p class="agent-card-meta">{{ agent.updatedBy }} · {{ agent.updatedAt }}</p></div>
        </article>
      </div>
      <div v-else class="agent-empty"><h3>没有匹配的 Agent</h3><p>清除搜索，或同步工程目录获取最新 Agent。</p></div>
    </div>
  </section>
  <section v-if="editorOpen" class="agent-editor-page" aria-label="Agent 配置页面">
    <header class="agent-editor-header">
      <div class="agent-editor-title"><button type="button" class="agent-back" @click="backToList"><Icon :svg="strokeIconPaths.arrowUp" :size="16" svg-class="-rotate-90" />返回 Agent 列表</button><h2 ref="editorHeading" tabindex="-1">{{ store.agents.find(agent => agent.id === editingId)?.name }}<span>Agent 定义与默认配置</span></h2></div>
      <div class="agent-editor-actions"><span :class="{ 'is-dirty': hasChanges }" role="status">{{ hasChanges ? '有未保存的修改' : '配置已保存' }}</span><button type="submit" form="agent-config-form" class="ops-secondary">保存配置</button><button type="button" class="ops-primary" @click="save(true)">保存并检测默认配置</button></div>
      <p v-if="formError" class="agent-form-error" role="alert">{{ formError }}</p>
    </header>
    <div class="agent-definition-tabs" role="tablist" aria-label="Agent 配置内容">
      <button id="agent-defaults-tab" type="button" role="tab" :aria-selected="editorTab === 'defaults'" aria-controls="agent-defaults-panel" @click="editorTab = 'defaults'">默认加载配置</button>
      <button id="agent-basics-tab" type="button" role="tab" :aria-selected="editorTab === 'basics'" aria-controls="agent-basics-panel" @click="editorTab = 'basics'">基本信息与 System Prompt</button>
    </div>
    <div class="agent-editor-scroll"><form id="agent-config-form" class="agent-config-form" novalidate @submit.prevent="save()">
      <section v-show="editorTab === 'basics'" id="agent-basics-panel" role="tabpanel" aria-labelledby="agent-basics-tab">
      <div class="agent-basics"><div class="agent-identity"><h3>基本信息</h3><p>Agent 名称对所有客户生效；默认指令与加载配置仅同步到遵循默认配置的客户。</p><label class="ops-field">Agent 名称<input v-model="draft.name" class="ops-input" maxlength="60" required /></label></div>
      <label class="ops-field">System Prompt<textarea v-model="draft.systemPrompt" class="ops-input agent-prompt-input" rows="12" placeholder="定义 Agent 的职责、适用场景、调用优先级与输出要求" required /></label></div>
      </section>
      <section v-show="editorTab === 'defaults'" id="agent-defaults-panel" role="tabpanel" aria-labelledby="agent-defaults-tab">
        <div class="agent-default-intro"><h3>默认加载配置</h3><p>新客户默认使用此配置。当前 <strong>{{ store.defaultFollowers(editingId).length }}</strong> 个客户遵循默认，保存后自动同步；客户自定义配置保持独立。</p><p>Skill 的私有 Tool 随 Skill 加载；这里配置的是直接加载的 Tool。</p></div>
        <AgentCapabilityConfig v-model="defaultDraft" :agent-id="editingId" :context="`${draft.name} · 默认配置`" />
        <p v-if="report" class="agent-default-report"><button type="button" class="agent-text-link" @click="reportOpen = true">{{ reportStale ? '默认配置已变化 · 查看上次检测结果' : `查看默认配置检测结果 · ${report.findings.length} 项` }}</button></p>
      </section>
      <p class="agent-editor-footnote">配置保存在当前演示会话中。System Prompt 或实际加载能力变动后，相关历史冲突检测结果需重新检测。</p>
    </form></div>
    <CustomerConflictReport :open="reportOpen" :report="report" customer-name="Agent 默认配置" :agent-name="draft.name" :stale="reportStale" @close="reportOpen = false" @rerun="save(true)" />
  </section>
</template>
<style scoped src="./agentManagement.css"></style>
<style scoped>
.agent-definition-tabs { display: flex; flex-shrink: 0; gap: 24px; padding: 0 32px; border-bottom: 1px solid #deded9; overflow-x: auto; }
.agent-definition-tabs button { padding: 16px 0; border-bottom: 2px solid transparent; color: #64748b; font-size: 13px; white-space: nowrap; }
.agent-definition-tabs button[aria-selected="true"] { border-color: #334155; color: #0f172a; font-weight: 600; }
.agent-default-intro { margin-bottom: 24px; }
.agent-default-intro h3 { font-size: 16px; font-weight: 600; color: #0f172a; }
.agent-default-intro p { margin-top: 6px; color: #64748b; font-size: 12px; line-height: 1.8; }
.agent-default-report { margin-top: 20px; }
@media (max-width: 760px) { .agent-definition-tabs { padding: 0 16px; gap: 18px; } }
</style>
