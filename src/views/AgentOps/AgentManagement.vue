<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElDialog, ElMessage, ElMessageBox, ElOption, ElSelect } from 'element-plus';
import { Icon } from '@packages/icon';
import { agentRoleDescriptions, useAgentOpsStore } from '@/pinia/agentOps';
import type { AgentConfig, ManagedAgent } from '@/pinia/agentOps';
import { agentConfigurationFingerprint, resolveAgentTools } from './agentConflicts';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';

const store = useAgentOpsStore();
const props = defineProps<{ initialAgentId?: string }>();
const emit = defineEmits<{ manageDataSkills: []; editingChange: [open: boolean] }>();
const search = ref('');
const editorOpen = ref(false);
const editingId = ref('');
const editorHeading = ref<HTMLElement>();
const savedDraft = ref('');
const hasChanges = computed(() => JSON.stringify(draft) !== savedDraft.value);
const formError = ref('');
const pendingSkill = ref('');
const pendingTool = ref('');
const draft = reactive<AgentConfig>({ name: '', systemPrompt: '', skillIds: [], toolIds: [] });
const reportOpen = ref(false);
const reportAgentId = ref('');
const findingFilter = ref('all');
const catalog = computed(() => ({ skills: store.agentCallableSkills, tools: store.tools }));
const isDataEmployee = computed(() => store.agents.find((agent) => agent.id === editingId.value)?.role === 'data-employee');
const filteredAgents = computed(() => store.agents.filter((agent) => `${agent.name} ${agent.systemPrompt}`.toLowerCase().includes(search.value.trim().toLowerCase())));
const agentCards = computed(() => filteredAgents.value.map((agent) => ({
  agent, usages: resolveAgentTools(agent, catalog.value), report: store.agentReports[agent.id], stale: isStale(agent),
})));
const skillOptions = computed(() => store.availableSkillsForAgent(editingId.value).filter((skill) => !draft.skillIds.includes(skill.id)));
const toolOptions = computed(() => store.tools.filter((tool) => !draft.toolIds.includes(tool.id)));
const draftUsages = computed(() => resolveAgentTools(draft, catalog.value));
const draftOverlaps = computed(() => draftUsages.value.filter((usage) => usage.paths.some((path) => path.kind === 'direct') && usage.paths.length > 1));
const reportAgent = computed(() => store.agents.find((agent) => agent.id === reportAgentId.value));
const report = computed(() => store.agentReports[reportAgentId.value]);
const reportStale = computed(() => reportAgent.value ? isStale(reportAgent.value) : false);
const reportFindings = computed(() => report.value?.findings.filter((finding) => findingFilter.value === 'all' || (findingFilter.value === 'ambiguity' ? ['intent', 'schema'].includes(finding.kind) : finding.kind === findingFilter.value)) ?? []);
const reportHighCount = computed(() => report.value?.findings.filter((finding) => finding.severity === 'high').length ?? 0);
const findSkill = (id: string) => store.agentCallableSkills.find((skill) => skill.id === id);
const skillName = (id: string) => findSkill(id)?.name ?? `已失效：${id}`;
const toolName = (id: string) => store.tools.find((tool) => tool.id === id)?.name ?? `已失效：${id}`;
const skillPrivateNames = (id: string) => findSkill(id)?.privateToolIds.map(toolName).join('、') || '无私有工具';
function isStale(agent: ManagedAgent) {
  const saved = store.agentReports[agent.id];
  return !!saved && saved.fingerprint !== agentConfigurationFingerprint(agent, catalog.value);
}
function openEditor(agent: ManagedAgent) {
  editingId.value = agent.id;
  Object.assign(draft, { name: agent.name, systemPrompt: agent.systemPrompt, skillIds: [...agent.skillIds], toolIds: [...agent.toolIds] });
  savedDraft.value = JSON.stringify(draft);
  formError.value = '';
  pendingSkill.value = '';
  pendingTool.value = '';
  reportOpen.value = false;
  editorOpen.value = true;
  nextTick(() => editorHeading.value?.focus());
}
function addSkill(id: string) {
  if (id && !draft.skillIds.includes(id)) draft.skillIds.push(id);
  pendingSkill.value = '';
}
function addTool(id: string) {
  if (id && !draft.toolIds.includes(id)) draft.toolIds.push(id);
  pendingTool.value = '';
}
async function confirmLeave() {
  if (!editorOpen.value || !hasChanges.value) return true;
  try {
    await ElMessageBox.confirm('当前 Agent 配置有未保存的修改，返回后将放弃这些修改。', '放弃未保存的修改？', { confirmButtonText: '放弃修改并返回', cancelButtonText: '继续编辑', type: 'warning' });
    return true;
  } catch { return false; }
}
async function backToList() {
  if (!await confirmLeave()) return;
  editorOpen.value = false;
}
async function manageDataSkills() {
  if (!await confirmLeave()) return;
  editorOpen.value = false;
  emit('manageDataSkills');
}
function save(andDetect = false) {
  try {
    const agent = store.saveAgent(draft, editingId.value);
    Object.assign(draft, { name: agent.name, systemPrompt: agent.systemPrompt, skillIds: [...agent.skillIds], toolIds: [...agent.toolIds] });
    savedDraft.value = JSON.stringify(draft);
    formError.value = '';
    ElMessage.success('Agent 配置已保存');
    if (andDetect) detect(agent);
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '保存失败，请重试。';
  }
}
function detect(agent: ManagedAgent) {
  store.detectAgentConflicts(agent.id);
  showReport(agent.id);
}
function showReport(id: string) {
  reportAgentId.value = id;
  findingFilter.value = 'all';
  reportOpen.value = true;
}
async function syncAgents() {
  try { await store.syncAgents(); }
  catch { /* The inline status retains the failure and permits retry. */ }
}
watch(editorOpen, (open) => emit('editingChange', open), { flush: 'sync' });
watch(() => props.initialAgentId, (id) => {
  const agent = store.agents.find((item) => item.id === id);
  if (agent) openEditor(agent);
}, { immediate: true });
onBeforeUnmount(() => emit('editingChange', false));
</script>

<template>
  <section v-show="!editorOpen" class="agent-management">
    <div class="agent-page-header">
      <div><h2>Agent 管理</h2><p>Agent 由工程注册，支持编辑名称、System Prompt、Skill 和 Tool 加载配置。</p></div>
      <button type="button" class="ops-primary" :disabled="store.agentSync.busy" @click="syncAgents"><Icon :svg="strokeIconPaths.refresh" :size="15" />{{ store.agentSync.busy ? '同步中…' : '现在同步' }}</button>
    </div>
    <div class="ops-sync-status" :class="{ 'is-error': store.agentSync.error }" :role="store.agentSync.error ? 'alert' : 'status'" aria-live="polite">
      <span>{{ store.agentSync.error || store.agentSync.summary || '同步读取演示工程中的全部 Agent，保留已保存的配置。' }}</span><span v-if="store.agentSync.lastSyncedAt">上次成功同步：{{ store.agentSync.lastSyncedAt }}</span>
    </div>
    <div class="agent-toolbar">
      <label class="agent-search"><Icon :svg="strokeIconPaths.search" :size="15" /><input v-model="search" class="ops-input ops-search" aria-label="搜索 Agent" placeholder="搜索 Agent 名称或 System Prompt" /></label>
      <span>{{ filteredAgents.length }} 个 Agent · 分别配置 Skill 与 Tool 加载范围</span>
    </div>
    <div class="agent-list-scroll">
      <div v-if="agentCards.length" class="agent-grid">
        <article v-for="{ agent, usages, report: savedReport, stale } in agentCards" :key="agent.id" class="agent-card" :aria-label="agent.name">
          <div class="agent-card-heading"><Icon :svg="strokeIconPaths.bot" :size="21" /><h3>{{ agent.name }}</h3></div>
          <p class="agent-role-description">{{ agentRoleDescriptions[agent.role] }}</p>
          <div class="agent-card-status">
            <span v-if="!savedReport" class="agent-status">尚未检测</span>
            <button v-else type="button" class="agent-status" :class="stale || savedReport.findings.length ? 'is-warning' : 'is-success'" @click="showReport(agent.id)">{{ stale ? '配置已变化 · 需重新检测' : savedReport.findings.length ? `${savedReport.findings.length} 项检测结果 · 查看` : '未发现冲突 · 查看报告' }}</button>
          </div>
          <div class="agent-card-content">
            <h4>System Prompt</h4><p class="agent-prompt-preview">{{ agent.systemPrompt }}</p>
            <h4>指定加载的 Skill <span>{{ agent.skillIds.length }}</span></h4>
            <p class="agent-skill-source">{{ agent.role === 'data-employee' ? '来源：数据员工配置' : '来源：Skill 管理' }} <button v-if="agent.role === 'data-employee'" type="button" class="agent-text-link" @click="manageDataSkills">管理数据员工 Skill</button></p>
            <div class="agent-tags"><span v-for="id in agent.skillIds" :key="id" class="agent-tag">{{ skillName(id) }}</span><span v-if="!agent.skillIds.length" class="agent-muted">未指定 Skill</span></div>
            <h4>直接加载的 Tool <span>{{ agent.toolIds.length }}</span></h4>
            <div class="agent-tags"><span v-for="id in agent.toolIds" :key="id" class="agent-tag">{{ toolName(id) }}</span><span v-if="!agent.toolIds.length" class="agent-muted">未指定直接工具</span></div>
            <details class="agent-card-scope"><summary>全部可调用 Tool · {{ usages.filter((usage) => usage.tool).length }} 个（去重）</summary><ul><li v-for="usage in usages" :key="usage.id"><strong>{{ usage.tool?.name ?? usage.id }}</strong><span v-for="path in usage.paths" :key="path.label">{{ path.label }}</span></li></ul><p v-if="!usages.length" class="agent-muted">当前没有可调用的 Tool。</p></details>
          </div>
          <div class="agent-card-footer">
            <div class="agent-card-actions"><button type="button" class="ops-secondary" @click="openEditor(agent)"><Icon :svg="strokeIconPaths.settings" :size="14" />配置 Agent</button><button type="button" class="ops-secondary" @click="detect(agent)"><Icon :svg="strokeIconPaths.shield" :size="14" />检测调用冲突</button></div>
            <div class="agent-card-meta"><span>{{ agent.updatedBy }} · {{ agent.updatedAt }}</span></div>
          </div>
        </article>
      </div>
      <div v-else class="agent-empty"><Icon :svg="strokeIconPaths.bot" :size="32" /><h3>{{ search ? '没有匹配的 Agent' : '暂无已注册 Agent' }}</h3><p>{{ search ? '尝试其他名称，或清除搜索条件。' : '点击现在同步，读取工程中注册的 Agent。' }}</p><button type="button" class="ops-secondary" :disabled="store.agentSync.busy" @click="search ? search = '' : syncAgents()">{{ search ? '清除搜索' : '现在同步' }}</button></div>
    </div>
  </section>

  <section v-if="editorOpen" class="agent-editor-page" aria-label="Agent 配置页面">
    <header class="agent-editor-header">
      <div class="agent-editor-title"><button type="button" class="agent-back" @click="backToList"><Icon :svg="strokeIconPaths.arrowUp" :size="16" svg-class="-rotate-90" />返回 Agent 列表</button><h2 ref="editorHeading" tabindex="-1">{{ store.agents.find((agent) => agent.id === editingId)?.name }}<span>配置 Agent</span></h2></div>
      <div class="agent-editor-actions"><span :class="{ 'is-dirty': hasChanges }" role="status">{{ hasChanges ? '有未保存的修改' : '配置已保存' }}</span><button type="submit" form="agent-config-form" class="ops-secondary">保存配置</button><button type="button" class="ops-primary" @click="save(true)">保存并检测冲突</button></div>
      <p v-if="formError" class="agent-form-error" role="alert">{{ formError }}</p>
    </header>
    <div class="agent-editor-scroll">
    <form id="agent-config-form" class="agent-config-form" @submit.prevent="save()">
      <div class="agent-basics">
        <div class="agent-identity"><h3>基本信息</h3><p>{{ agentRoleDescriptions[store.agents.find((agent) => agent.id === editingId)?.role ?? 'custom'] }}</p>
        <label class="ops-field">Agent 名称 <span class="agent-required">必填</span><input v-model="draft.name" class="ops-input" maxlength="60" placeholder="请输入 Agent 名称" required /></label>
        </div>
        <label class="ops-field">System Prompt <span class="agent-required">必填</span><textarea v-model="draft.systemPrompt" class="ops-input agent-prompt-input" rows="9" placeholder="定义 Agent 的职责、适用场景、调用优先级与输出要求" required /></label>
      </div>
      <div class="agent-loading-columns">
        <section class="agent-loading-section">
          <h3>Skill 加载 <span>{{ draft.skillIds.length }}</span></h3>
          <p>{{ isDataEmployee ? '来源：数据员工配置。该页面的所有采集与映射 Skill 均可选择加载，新增 Skill 默认加入此 Agent。' : '来源：Skill 管理。指定此 Agent 可调用的 Skill，私有工具随 Skill 加载。' }}</p>
          <p v-if="isDataEmployee"><button type="button" class="agent-text-link" @click="draft.skillIds = store.availableSkillsForAgent(editingId).map((skill) => skill.id)">加载全部数据员工 Skill</button></p>
          <ElSelect v-model="pendingSkill" aria-label="添加 Skill" placeholder="搜索并添加 Skill" filterable class="agent-picker" @change="addSkill">
            <ElOption v-for="skill in skillOptions" :key="skill.id" :value="skill.id" :label="`${skill.name}${skill.enabled ? '' : '（已停用）'}`" :disabled="!skill.enabled" />
          </ElSelect>
          <ul class="agent-selected-list">
            <li v-for="id in draft.skillIds" :key="id"><div><strong>{{ skillName(id) }}</strong><span v-if="!findSkill(id)?.enabled" class="agent-inline-warning">已停用或失效</span><p>{{ findSkill(id)?.description }}</p><template v-if="findSkill(id)?.source === 'data-employee'"><p class="agent-dependency">{{ findSkill(id)?.sourceConfig?.loginType }} · {{ findSkill(id)?.sourceConfig?.version }}</p><p>接入地址：{{ findSkill(id)?.sourceConfig?.loginUrl }}</p><details class="agent-skill-content"><summary>查看 Skill 文件：{{ findSkill(id)?.fileName }}</summary><pre>{{ findSkill(id)?.content }}</pre></details></template><p v-else class="agent-dependency">私有 Tool：{{ skillPrivateNames(id) }}</p><p v-if="findSkill(id)?.visibility === '指定企业'" class="agent-inline-warning">仅指定企业可见，实际调用遵循企业权限</p></div><button type="button" class="agent-remove" :aria-label="`移除 Skill ${skillName(id)}`" @click="draft.skillIds = draft.skillIds.filter((item) => item !== id)"><Icon :svg="strokeIconPaths.x" :size="15" /></button></li>
          </ul>
          <p v-if="!draft.skillIds.length" class="agent-selection-empty">尚未添加 Skill，可按需添加多个。</p>
        </section>
        <section class="agent-loading-section">
          <h3>Tool 直接加载 <span>{{ draft.toolIds.length }}</span></h3>
          <p>为此 Agent 单独指定 Tool，与 Skill 私有加载配置独立。</p>
          <ElSelect v-model="pendingTool" aria-label="添加直接加载 Tool" placeholder="搜索并添加 MCP 服务或代码工具" filterable class="agent-picker" @change="addTool">
            <ElOption v-for="tool in toolOptions" :key="tool.id" :value="tool.id" :label="`${tool.name} · ${tool.kind === 'mcp' ? 'MCP' : '代码工具'}`" />
          </ElSelect>
          <ul class="agent-selected-list">
            <li v-for="id in draft.toolIds" :key="id"><div><strong>{{ toolName(id) }}</strong><span class="agent-inline-type">{{ store.tools.find((tool) => tool.id === id)?.kind === 'mcp' ? 'MCP 服务' : '代码工具' }}</span><p>{{ store.tools.find((tool) => tool.id === id)?.description }}</p><p v-if="draftUsages.find((usage) => usage.id === id)?.paths.some((path) => path.kind === 'private')" class="agent-inline-warning">与已选 Skill 的私有 Tool 重叠</p></div><button type="button" class="agent-remove" :aria-label="`移除 Tool ${toolName(id)}`" @click="draft.toolIds = draft.toolIds.filter((item) => item !== id)"><Icon :svg="strokeIconPaths.x" :size="15" /></button></li>
          </ul>
          <p v-if="!draft.toolIds.length" class="agent-selection-empty">尚未指定直接加载的 Tool。</p>
        </section>
      </div>
      <div v-if="draftOverlaps.length" class="agent-notice warning" role="status"><Icon :svg="strokeIconPaths.alert" :size="18" /><div><strong>{{ draftOverlaps.length }} 个 Tool 存在多条加载路径</strong><p>{{ draftOverlaps.map((usage) => usage.tool?.name ?? usage.id).join('、') }}。允许保存此配置，建议检查调用边界或保存后检测冲突。</p></div></div>
      <section class="agent-scope-section">
        <h3>全部可调用的 Tool <span>{{ draftUsages.filter((usage) => usage.tool).length }} 个，按工具去重</span></h3>
        <p>合并此 Agent 直接指定的工具，以及已启用 Skill 的私有工具。加载配置仅作用于当前 Agent。</p>
        <div class="agent-scope-list"><div v-for="usage in draftUsages" :key="usage.id" class="agent-scope-row"><div><strong>{{ usage.tool?.name ?? `已失效：${usage.id}` }}</strong><span class="agent-inline-type">{{ usage.tool?.kind === 'mcp' ? 'MCP 服务' : '代码工具' }}</span></div><div class="agent-tags"><span v-for="path in usage.paths" :key="path.label" class="agent-tag" :class="{ 'is-private': path.kind === 'private' }">{{ path.label }}</span></div></div><p v-if="!draftUsages.length" class="agent-selection-empty">暂无可调用的 Tool。可以添加 Skill 或直接加载工具。</p></div>
      </section>
      <p class="agent-editor-footnote">配置保存在当前演示会话中。Skill 私有工具仍由对应 Skill 独立管理。</p>
    </form>
    </div>
  </section>

  <ElDialog v-model="reportOpen" title="调用冲突检测结果" width="1060px" top="4vh" class="ops-tool-dialog agent-report-dialog" append-to-body>
    <div v-if="report && reportAgent" class="agent-report">
      <div class="agent-report-heading"><div><h3>{{ reportAgent.name }}</h3><p>{{ report.checkedAt }} · 基于当前配置的本地规则检测</p></div><span class="agent-status" :class="reportStale || report.findings.length ? 'is-warning' : 'is-success'">{{ reportStale ? '结果已过期' : report.findings.length ? `${report.findings.length} 项需处理或复核` : '本次未发现冲突' }}</span></div>
      <div v-if="reportStale" class="agent-notice warning" role="status"><Icon :svg="strokeIconPaths.alert" :size="18" /><p>Agent、Skill 或工具加载配置已变化。以下为上次检测结果，请重新检测。</p></div>
      <div class="agent-report-stats"><span><strong>{{ report.skillCount }}</strong> 个有效 Skill</span><span><strong>{{ report.toolCount }}</strong> 个 Tool（去重）</span><span><strong>{{ report.candidateCount }}</strong> 个能力检查项</span><span><strong>{{ reportHighCount }}</strong> 项明确路径冲突</span></div>
      <p class="agent-report-explainer">展开所有加载路径，比较 Skill、代码工具及 MCP 方法的功能描述和已声明的输入、输出 Schema。Skill 与其私有工具的执行依赖、多个 Skill 共享同一私有工具，本身不判定为冲突。</p>
      <div class="agent-notice"><Icon :svg="strokeIconPaths.shield" :size="18" /><p>演示检测：使用加载关系、意图关键词和参数规则生成结果，未接入语义模型。System Prompt 中的路由约定需人工复核；“未发现冲突”不代表不存在语义歧义。</p></div>
      <div class="agent-report-filter" aria-label="筛选检测结果"><button v-for="item in [{ id: 'all', label: '全部结果' }, { id: 'duplicate', label: '加载路径' }, { id: 'ambiguity', label: '意图与 Schema' }, { id: 'configuration', label: '配置问题' }]" :key="item.id" type="button" :aria-pressed="findingFilter === item.id" :class="{ active: findingFilter === item.id }" @click="findingFilter = item.id">{{ item.label }}</button></div>
      <div class="agent-findings">
        <article v-for="finding in reportFindings" :key="finding.id" class="agent-finding"><div class="agent-finding-title"><span class="agent-severity" :class="finding.severity">{{ finding.severity === 'high' ? '路径冲突' : '建议复核' }}</span><h4>{{ finding.title }}</h4></div><ul class="agent-route-lines"><li v-for="path in finding.paths" :key="path">{{ path }}</li></ul><h5>检测依据</h5><ul class="agent-evidence"><li v-for="evidence in finding.evidence" :key="evidence">{{ evidence }}</li></ul><p class="agent-suggestion"><strong>调整建议：</strong>{{ finding.suggestion }}</p></article>
        <div v-if="!reportFindings.length" class="agent-report-empty"><Icon :svg="strokeIconPaths.check" :size="22" /><p>{{ report.findings.length ? '此分类下没有检测结果。' : report.candidateCount ? '本次规则检查未发现路径冲突或疑似调用歧义。' : '当前没有可检测的调用入口，请先配置 Skill 或 Tool。' }}</p></div>
      </div>
      <details class="agent-coverage" :open="!report.findings.length"><summary>检测覆盖与限制 · {{ report.schemaCount }} 个代码工具已检查 Schema，{{ report.coverage.length }} 项说明</summary><ul><li v-for="note in report.coverage" :key="note">{{ note }}</li><li v-if="!report.coverage.length">所有已加载工具均提供输入、输出参数定义。</li></ul></details>
    </div>
    <template #footer><div class="agent-dialog-footer"><button v-if="reportAgent" type="button" class="ops-secondary" @click="openEditor(reportAgent)">调整 Agent 配置</button><div><button type="button" class="ops-secondary" @click="reportOpen = false">关闭</button><button v-if="reportAgent" type="button" class="ops-primary" @click="detect(reportAgent)"><Icon :svg="strokeIconPaths.refresh" :size="14" />重新检测</button></div></div></template>
  </ElDialog>
</template>

<style scoped>
.agent-management { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; border: 1px solid #deded9; border-radius: 6px; background: #fff; color: #334155; font-size: 13px; }
.agent-page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px; border-bottom: 1px solid #e2e2dc; }
.agent-page-header h2 { font-size: 16px; font-weight: 600; color: #0f172a; }
.agent-page-header p { margin-top: 6px; color: #64748b; font-size: 12px; line-height: 1.7; }
.agent-page-header > button { flex-shrink: 0; }
.agent-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 14px 20px; border-bottom: 1px solid #e2e2dc; font-size: 12px; color: #64748b; }
.agent-search { position: relative; width: 350px; max-width: 100%; }
.agent-search > :first-child { position: absolute; left: 12px; top: 10px; }
.agent-list-scroll { flex: 1; min-height: 0; overflow: auto; padding: 20px; background: #f7f7f5; }
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr)); align-items: start; gap: 16px; }
.agent-card { min-width: 0; border: 1px solid #deded9; border-radius: 6px; background: white; overflow: hidden; }
.agent-card-heading { display: flex; align-items: start; gap: 10px; padding: 20px 18px 0; }
.agent-card-heading > :first-child { flex-shrink: 0; margin-top: 1px; }
.agent-card h3 { font-size: 15px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; color: #0f172a; }
.agent-card-status { padding: 10px 18px 0; }
.agent-role-description { margin: 8px 18px 0; color: #64748b; font-size: 12px; line-height: 1.7; }
.agent-skill-source { margin-bottom: 8px; color: #64748b; font-size: 11px; }
.agent-text-link { color: #334155; text-decoration: underline; text-underline-offset: 3px; }
.agent-skill-content { margin-top: 6px; color: #475569; font-size: 12px; }
.agent-skill-content summary { cursor: pointer; overflow-wrap: anywhere; }
.agent-skill-content pre { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 8px; padding: 10px; background: #f7f7f5; font-size: 11px; line-height: 1.8; }
.agent-status { display: inline-block; padding: 3px 7px; border-radius: 4px; background: #f2f2ef; color: #475569; font-size: 11px; line-height: 1.6; text-align: left; }
.agent-status.is-warning { background: #fff7e5; color: #92400e; }
.agent-status.is-success { background: #edf6f0; color: #21623b; }
.agent-card-content { padding: 0 18px 18px; }
.agent-card h4 { margin: 18px 0 8px; font-size: 12px; font-weight: 500; color: #64748b; }
.agent-card h4 span { padding-left: 5px; font-variant-numeric: tabular-nums; }
.agent-prompt-preview { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; min-height: 63px; font-size: 12px; line-height: 21px; white-space: pre-line; overflow-wrap: anywhere; }
.agent-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.agent-tag { padding: 3px 7px; background: #f3f3f0; color: #475569; border-radius: 4px; font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.agent-tag.is-private { background: #eff4f8; color: #39566f; }
.agent-muted { font-size: 12px; color: #64748b; }
.agent-card-scope { margin-top: 20px; font-size: 12px; color: #475569; }
.agent-card-scope summary { cursor: pointer; line-height: 1.8; }
.agent-card-scope li { padding: 9px 0; border-bottom: 1px solid #e9e9e4; }
.agent-card-scope li span { display: block; margin-top: 3px; color: #64748b; font-size: 11px; }
.agent-card-footer { border-top: 1px solid #e2e2dc; padding: 14px 18px 12px; }
.agent-card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.agent-card-actions button { flex: 1; white-space: nowrap; }
.agent-card-meta { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-top: 12px; font-size: 10px; color: #64748b; line-height: 1.6; }
.agent-empty { display: flex; flex-direction: column; align-items: center; padding: 72px 16px; gap: 12px; text-align: center; }
.agent-empty h3 { font-size: 15px; font-weight: 600; }
.agent-empty p { color: #64748b; }
.agent-config-form, .agent-report { color: #334155; font-size: 13px; line-height: 1.65; }
.agent-basics { display: grid; grid-template-columns: minmax(220px, 0.6fr) minmax(0, 1.7fr); gap: 40px; align-items: start; }
.agent-identity h3 { color: #0f172a; font-size: 15px; font-weight: 600; }
.agent-identity > p { margin: 8px 0 24px; color: #64748b; font-size: 13px; line-height: 1.8; }
.agent-required { color: #64748b; font-weight: 400; font-size: 11px; }
.agent-basics .ops-field { display: block; }
.agent-basics .ops-input { display: block; margin-top: 8px; }
.agent-prompt-input { resize: vertical; min-height: 240px; line-height: 1.7; }
.agent-loading-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; margin-top: 36px; padding-top: 32px; border-top: 1px solid #e2e2dc; }
.agent-loading-section h3, .agent-scope-section h3 { color: #0f172a; font-size: 14px; font-weight: 600; }
.agent-loading-section h3 span, .agent-scope-section h3 span { color: #64748b; font-size: 12px; font-weight: 400; margin-left: 6px; }
.agent-loading-section > p, .agent-scope-section > p { color: #64748b; font-size: 12px; margin-top: 5px; }
.agent-picker { width: 100%; margin-top: 12px; }
.agent-selected-list { margin-top: 8px; }
.agent-selected-list li { display: flex; align-items: start; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e9e9e4; }
.agent-selected-list li > div { min-width: 0; overflow-wrap: anywhere; }
.agent-selected-list p { margin-top: 4px; font-size: 12px; color: #64748b; }
.agent-selected-list .agent-dependency { color: #475569; }
.agent-inline-type { margin-left: 7px; color: #64748b; font-size: 11px; font-weight: 400; }
.agent-selected-list .agent-inline-warning, .agent-inline-warning { color: #92400e; font-size: 11px; }
span.agent-inline-warning { margin-left: 8px; }
.agent-remove { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 4px; flex-shrink: 0; color: #64748b; }
.agent-remove:hover { background: #f3f3f0; color: #b42318; }
.agent-selection-empty { padding: 20px 0; font-size: 12px; color: #64748b; }
.agent-notice { display: flex; align-items: start; gap: 9px; padding: 12px; margin-top: 18px; background: #f3f3f0; border-radius: 4px; color: #475569; font-size: 12px; line-height: 1.7; }
.agent-notice > :first-child { flex-shrink: 0; }
.agent-notice.warning { background: #fff7e5; color: #92400e; }
.agent-notice p { margin: 0; }
.agent-scope-section { margin-top: 28px; }
.agent-scope-list { margin-top: 12px; border-top: 1px solid #e2e2dc; }
.agent-scope-row { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.7fr); gap: 16px; padding: 12px 0; border-bottom: 1px solid #e9e9e4; font-size: 12px; overflow-wrap: anywhere; }
.agent-form-error { width: 100%; color: #b42318; font-size: 13px; }
.agent-dialog-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.agent-dialog-footer > span { font-size: 12px; color: #64748b; }
.agent-dialog-footer > div { display: flex; flex-wrap: wrap; gap: 8px; }
.agent-report-heading { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.agent-report-heading h3 { font-size: 16px; font-weight: 600; color: #0f172a; overflow-wrap: anywhere; }
.agent-report-heading p { color: #64748b; font-size: 12px; margin-top: 4px; }
.agent-report-stats { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 22px 0 12px; padding-bottom: 14px; border-bottom: 1px solid #e2e2dc; font-size: 12px; }
.agent-report-stats strong { font-size: 18px; margin-right: 4px; color: #0f172a; font-variant-numeric: tabular-nums; }
.agent-report-explainer { font-size: 12px; line-height: 1.8; color: #64748b; }
.agent-report-filter { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e2dc; }
.agent-report-filter button { font-size: 12px; padding: 5px 9px; border-radius: 4px; color: #475569; }
.agent-report-filter button:hover { background: #f3f3f0; }
.agent-report-filter button.active { background: #0f172a; color: #fff; }
.agent-finding { padding: 20px 0; border-bottom: 1px solid #e2e2dc; overflow-wrap: anywhere; }
.agent-finding-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.agent-finding h4 { font-size: 13px; font-weight: 600; color: #0f172a; }
.agent-severity { flex-shrink: 0; padding: 2px 6px; font-size: 11px; border-radius: 4px; }
.agent-severity.high { background: #fff0ee; color: #b42318; }
.agent-severity.review { background: #fff7e5; color: #92400e; }
.agent-route-lines { margin-top: 12px; background: #f7f7f5; padding: 8px 12px; font-size: 12px; line-height: 1.9; }
.agent-finding h5 { font-size: 12px; font-weight: 600; margin-top: 14px; }
.agent-evidence { list-style: disc; padding-left: 18px; margin-top: 5px; font-size: 12px; line-height: 1.9; }
.agent-suggestion { font-size: 12px; margin-top: 12px; line-height: 1.9; }
.agent-report-empty { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 35px 12px; color: #475569; font-size: 13px; }
.agent-report-empty > :first-child { flex-shrink: 0; }
.agent-coverage { margin-top: 20px; color: #64748b; font-size: 12px; line-height: 1.9; }
.agent-coverage summary { cursor: pointer; color: #475569; }
.agent-coverage ul { list-style: disc; padding-left: 20px; margin-top: 10px; }
.agent-editor-page button:focus-visible, .agent-management :is(button, summary):focus-visible, .agent-config-form button:focus-visible, .agent-report :is(button, summary):focus-visible, .agent-dialog-footer button:focus-visible { outline: 2px solid #64748b; outline-offset: 3px; }
.agent-management, .agent-config-form, .agent-report { scrollbar-color: #b5b8bc transparent; scrollbar-width: thin; caret-color: #334155; }
.agent-management ::selection, .agent-config-form ::selection, .agent-report ::selection { background: #dce5ed; color: #0f172a; }
.agent-editor-page { display: flex; flex-direction: column; height: 100%; min-height: 0; background: #fff; color: #334155; }
.agent-editor-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 24px; padding: 20px 32px; border-bottom: 1px solid #deded9; }
.agent-editor-title { min-width: 0; }
.agent-back { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; margin-bottom: 8px; font-size: 13px; color: #475569; }
.agent-back:hover { color: #0f172a; text-decoration: underline; text-underline-offset: 3px; }
.agent-editor-title h2 { font-size: 20px; font-weight: 600; color: #0f172a; overflow-wrap: anywhere; }
.agent-editor-title h2 span { margin-left: 16px; color: #64748b; font-weight: 400; font-size: 13px; white-space: nowrap; }
.agent-editor-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.agent-editor-actions > span { font-size: 12px; color: #64748b; }
.agent-editor-actions > span.is-dirty { color: #92400e; }
.agent-editor-scroll { flex: 1; min-height: 0; overflow: auto; padding: 32px; scrollbar-color: #b5b8bc transparent; scrollbar-width: thin; }
.agent-config-form { max-width: 1480px; margin: 0 auto; }
.agent-editor-footnote { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e2dc; font-size: 12px; color: #64748b; }
@media (max-width: 760px) {
  .agent-editor-header { padding: 12px 16px; align-items: start; }
  .agent-editor-title h2 { font-size: 18px; }
  .agent-editor-actions { flex-wrap: wrap; gap: 8px; width: 100%; }
  .agent-editor-actions > span { width: 100%; }
  .agent-editor-scroll { padding: 24px 16px; }
  .agent-loading-columns { margin-top: 28px; padding-top: 24px; }
  .agent-loading-section + .agent-loading-section { border-top: 1px solid #e2e2dc; padding-top: 24px; }

  .agent-page-header { padding: 14px; align-items: start; flex-wrap: wrap; gap: 12px; }
  .agent-toolbar { padding: 12px 14px; }
  .agent-list-scroll { padding: 12px; }
  .agent-grid { gap: 12px; }
  .agent-basics, .agent-loading-columns, .agent-scope-row { grid-template-columns: minmax(0, 1fr); gap: 18px; }
  .agent-scope-row { gap: 8px; }
  .agent-dialog-footer { justify-content: flex-end; }
  .agent-dialog-footer > span { width: 100%; text-align: left; }
}
</style>
