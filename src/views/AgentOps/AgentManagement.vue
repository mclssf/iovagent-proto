<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Icon } from '@packages/icon';
import { agentRoleDescriptions, useAgentOpsStore } from '@/pinia/agentOps';
import type { AgentConfig, ManagedAgent } from '@/pinia/agentOps';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';
const store = useAgentOpsStore();
const emit = defineEmits<{ manageCustomers: []; editingChange: [open: boolean] }>();
const search = ref('');
const editorOpen = ref(false);
const editingId = ref('');
const editorHeading = ref<HTMLElement>();
const savedDraft = ref('');
const draft = reactive<AgentConfig>({ name: '', systemPrompt: '' });
const hasChanges = computed(() => JSON.stringify(draft) !== savedDraft.value);
const formError = ref('');
const filteredAgents = computed(() => store.agents.filter((agent) => `${agent.name} ${agent.systemPrompt}`.toLowerCase().includes(search.value.trim().toLowerCase())));
function openEditor(agent: ManagedAgent) {
  editingId.value = agent.id;
  Object.assign(draft, { name: agent.name, systemPrompt: agent.systemPrompt });
  savedDraft.value = JSON.stringify(draft);
  formError.value = '';
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
function save() {
  try {
    const agent = store.saveAgent(draft, editingId.value);
    Object.assign(draft, { name: agent.name, systemPrompt: agent.systemPrompt });
    savedDraft.value = JSON.stringify(draft);
    formError.value = '';
    ElMessage.success('Agent 定义已保存，对配置了此 Agent 的客户生效');
  } catch (error) { formError.value = error instanceof Error ? error.message : '保存失败，请重试。'; }
}
async function syncAgents() { try { await store.syncAgents(); } catch { /* Display retryable inline error. */ } }
watch(editorOpen, (open) => emit('editingChange', open), { flush: 'sync' });
onBeforeUnmount(() => emit('editingChange', false));
</script>
<template>
  <section v-show="!editorOpen" class="agent-management">
    <div class="agent-page-header">
      <div><h2>Agent 管理</h2><p>统一维护 Agent 名称与 System Prompt。每个客户的能力加载在客户 Agent 配置中管理。</p></div>
      <button type="button" class="ops-primary" :disabled="store.agentSync.busy" @click="syncAgents"><Icon :svg="strokeIconPaths.refresh" :size="15" />{{ store.agentSync.busy ? '同步中…' : '现在同步' }}</button>
    </div>
    <div class="ops-sync-status" :class="{ 'is-error': store.agentSync.error }" :role="store.agentSync.error ? 'alert' : 'status'"><span>{{ store.agentSync.error || store.agentSync.summary || 'Agent 由工程注册，仅支持编辑；同步保留已保存的定义，不改变客户的加载配置。' }}</span><span v-if="store.agentSync.lastSyncedAt">上次成功同步：{{ store.agentSync.lastSyncedAt }}</span></div>
    <div class="agent-toolbar"><label class="agent-search"><Icon :svg="strokeIconPaths.search" :size="15" /><input v-model="search" class="ops-input ops-search" aria-label="搜索 Agent" placeholder="搜索 Agent 名称或 System Prompt" /></label><span>{{ filteredAgents.length }} 个 Agent</span></div>
    <div class="agent-list-scroll">
      <div v-if="filteredAgents.length" class="agent-grid">
        <article v-for="agent in filteredAgents" :key="agent.id" class="agent-card" :aria-label="agent.name">
          <div class="agent-card-heading"><Icon :svg="strokeIconPaths.bot" :size="21" /><h3>{{ agent.name }}</h3></div>
          <p class="agent-role-description">{{ agentRoleDescriptions[agent.role] }}</p>
          <div class="agent-card-content"><h4>System Prompt</h4><p class="agent-prompt-preview">{{ agent.systemPrompt }}</p><p class="agent-muted mt-5">已供 {{ store.customers.filter(customer => customer.agentConfigs.some(binding => binding.agentId === agent.id)).length }} 个客户使用</p></div>
          <div class="agent-card-footer"><div class="agent-card-actions"><button type="button" class="ops-secondary" @click="openEditor(agent)"><Icon :svg="strokeIconPaths.settings" :size="14" />编辑 Agent</button><button type="button" class="ops-secondary" @click="emit('manageCustomers')">客户 Agent 配置</button></div><p class="agent-card-meta">{{ agent.updatedBy }} · {{ agent.updatedAt }}</p></div>
        </article>
      </div>
      <div v-else class="agent-empty"><h3>没有匹配的 Agent</h3><p>清除搜索，或同步工程目录获取最新 Agent。</p></div>
    </div>
  </section>
  <section v-if="editorOpen" class="agent-editor-page" aria-label="Agent 配置页面">
    <header class="agent-editor-header">
      <div class="agent-editor-title"><button type="button" class="agent-back" @click="backToList"><Icon :svg="strokeIconPaths.arrowUp" :size="16" svg-class="-rotate-90" />返回 Agent 列表</button><h2 ref="editorHeading" tabindex="-1">{{ store.agents.find(agent => agent.id === editingId)?.name }}<span>编辑 Agent 定义</span></h2></div>
      <div class="agent-editor-actions"><span :class="{ 'is-dirty': hasChanges }" role="status">{{ hasChanges ? '有未保存的修改' : '配置已保存' }}</span><button type="submit" form="agent-config-form" class="ops-primary">保存配置</button></div>
      <p v-if="formError" class="agent-form-error" role="alert">{{ formError }}</p>
    </header>
    <div class="agent-editor-scroll"><form id="agent-config-form" class="agent-config-form" @submit.prevent="save">
      <div class="agent-basics"><div class="agent-identity"><h3>基本信息</h3><p>此处定义对使用该 Agent 的所有客户生效。每个客户的 Skill 和 Tool 加载由客户 Agent 配置单独管理。</p><label class="ops-field">Agent 名称<input v-model="draft.name" class="ops-input" maxlength="60" required /></label></div>
      <label class="ops-field">System Prompt<textarea v-model="draft.systemPrompt" class="ops-input agent-prompt-input" rows="16" placeholder="定义 Agent 的职责、适用场景、调用优先级与输出要求" required /></label></div>
      <p class="agent-editor-footnote">配置保存在当前演示会话中。修改 System Prompt 后，客户配置中的历史冲突检测结果需要重新检测。</p>
    </form></div>
  </section>
</template>
<style scoped src="./agentManagement.css"></style>
