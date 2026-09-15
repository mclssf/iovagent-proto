<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElTooltip } from 'element-plus';
import { Icon } from '@packages/icon';
import { useAgentOpsStore } from '@/pinia/agentOps';
import type { AgentCapabilities } from '@/pinia/agentOps';
import { resolveAgentTools } from './agentConflicts';
import CustomerCapabilityPicker from './CustomerCapabilityPicker.vue';
import { mergeCapabilitySelection } from './capabilitySelection';
import type { CapabilityOption } from './capabilitySelection';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';
const config = defineModel<AgentCapabilities>({ required: true });
const props = defineProps<{ agentId: string; context: string; readOnly?: boolean }>();
const store = useAgentOpsStore();
const pickerOpen = ref(false);
const pickerKind = ref<'skill' | 'tool'>('skill');
const catalog = computed(() => ({ skills: store.availableSkillsForAgent(props.agentId), tools: store.tools }));
const usages = computed(() => resolveAgentTools({ name: props.context, systemPrompt: '', ...config.value }, catalog.value));
const overlaps = computed(() => usages.value.filter(usage => usage.paths.some(path => path.kind === 'direct') && usage.paths.some(path => path.kind === 'private')));
const selectedSkills = computed(() => config.value.skillIds.map(id => ({ id, skill: catalog.value.skills.find(skill => skill.id === id) })));
const selectedTools = computed(() => config.value.toolIds.map(id => ({ id, tool: store.tools.find(tool => tool.id === id) })));
const toolName = (id: string) => store.tools.find(tool => tool.id === id)?.name ?? `已失效：${id}`;
const privateNames = (ids: string[]) => ids.map(toolName).join('、');
const skillOptions = computed<CapabilityOption[]>(() => catalog.value.skills.map(skill => ({
  id: skill.id, name: skill.name, description: skill.description, group: skill.group, disabled: !skill.enabled,
  detail: skill.privateToolIds.length ? `私有 Tool：${privateNames(skill.privateToolIds)}` : undefined,
})));
const toolOptions = computed<CapabilityOption[]>(() => store.tools.map(tool => ({
  id: tool.id, name: tool.name, description: tool.description, kind: tool.kind,
  warning: usages.value.some(usage => usage.id === tool.id && usage.paths.some(path => path.kind === 'private')) ? '已由所选 Skill 私有加载；直接添加后将存在多条加载路径。' : undefined,
})));
const pickerItems = computed(() => pickerKind.value === 'skill' ? skillOptions.value : toolOptions.value);
const pickerLoadedIds = computed(() => pickerKind.value === 'skill' ? config.value.skillIds : config.value.toolIds);
function openPicker(kind: 'skill' | 'tool') {
  if (props.readOnly) return;
  pickerKind.value = kind;
  pickerOpen.value = true;
}
function addCapabilities(ids: string[]) {
  if (props.readOnly) return;
  const field = pickerKind.value === 'skill' ? 'skillIds' : 'toolIds';
  config.value = { ...config.value, [field]: mergeCapabilitySelection(config.value[field], ids, pickerItems.value) };
  pickerOpen.value = false;
}
function removeCapability(field: keyof AgentCapabilities, id: string) {
  if (!props.readOnly) config.value = { ...config.value, [field]: config.value[field].filter(item => item !== id) };
}
watch(() => [props.agentId, props.readOnly], () => { pickerOpen.value = false; });
</script>
<template>
  <div class="agent-capability-config" :class="{ 'is-readonly': readOnly }">
    <div class="customer-loading-columns">
      <section class="agent-loading-section customer-config-block" aria-label="Skill 加载配置">
        <div class="customer-loading-header"><h3>Skill 加载 <span>当前已选 {{ selectedSkills.length }} 个</span></h3><button v-if="!readOnly" type="button" class="ops-secondary" @click="openPicker('skill')"><Icon :svg="strokeIconPaths.plus" :size="14" />添加 Skill</button></div>
        <p>{{ readOnly ? '当前遵循 Agent 默认配置，Skill 的增减随默认配置同步。' : '通过搜索或按组批量添加 Skill。私有 Tool 随所选 Skill 加载。' }}</p>
        <ul class="customer-selected-tags" aria-label="已选 Skill 加载列表">
          <li v-for="{ id, skill } in selectedSkills" :key="id" class="customer-capability-tag" :class="{ 'is-warning': !skill || !skill.enabled }">
            <ElTooltip placement="top" :show-after="250" :hide-after="0">
              <template #content><div class="customer-tag-details"><strong>{{ skill?.group ?? 'Skill 已失效' }}</strong><p>{{ skill?.description ?? '该 Skill 已失效或不适用于当前 Agent，请移除后保存。' }}</p><p v-if="skill?.privateToolIds.length">私有 Tool：{{ privateNames(skill.privateToolIds) }}</p><p v-if="skill && !skill.enabled">Skill 已停用，暂不可调用。</p></div></template>
              <span class="customer-tag-label" tabindex="0">{{ skill?.name ?? id }}<span v-if="!skill" class="customer-tag-state">已失效</span><span v-else-if="!skill.enabled" class="customer-tag-state">已停用</span></span>
            </ElTooltip>
            <button v-if="!readOnly" type="button" class="customer-tag-remove" :aria-label="`移除 Skill ${skill?.name ?? id}`" @click="removeCapability('skillIds', id)"><Icon :svg="strokeIconPaths.x" :size="13" /></button>
          </li>
        </ul>
        <p v-if="!selectedSkills.length" class="agent-selection-empty">{{ readOnly ? 'Agent 默认配置尚未选择 Skill。' : '尚未选择 Skill。点击“添加 Skill”搜索或按组批量选择。' }}</p>
      </section>
      <section class="agent-loading-section customer-config-block" aria-label="Tool 加载配置">
        <div class="customer-loading-header"><h3>Tool 直接加载 <span>当前已选 {{ selectedTools.length }} 个</span></h3><button v-if="!readOnly" type="button" class="ops-secondary" @click="openPicker('tool')"><Icon :svg="strokeIconPaths.plus" :size="14" />添加 Tool</button></div>
        <p>指定此 Agent 可直接调用的工具，与 Skill 私有加载独立。</p>
        <ul class="customer-selected-tags" aria-label="已选 Tool 加载列表">
          <li v-for="{ id, tool } in selectedTools" :key="id" class="customer-capability-tag" :class="{ 'is-warning': !tool || overlaps.some(usage => usage.id === id) }">
            <ElTooltip placement="top" :show-after="250" :hide-after="0">
              <template #content><div class="customer-tag-details"><strong>{{ !tool ? 'Tool 已失效' : tool.kind === 'mcp' ? 'MCP 服务' : '内置API工具' }}</strong><p>{{ tool?.description ?? '该 Tool 已失效，请移除后保存。' }}</p><p v-if="overlaps.some(usage => usage.id === id)">与所选 Skill 的私有 Tool 重叠，建议通过冲突检测检查调用边界。</p></div></template>
              <span class="customer-tag-label" tabindex="0">{{ tool?.name ?? id }}<span v-if="!tool" class="customer-tag-state">已失效</span><span v-else-if="overlaps.some(usage => usage.id === id)" class="customer-tag-state">多路径</span></span>
            </ElTooltip>
            <button v-if="!readOnly" type="button" class="customer-tag-remove" :aria-label="`移除 Tool ${toolName(id)}`" @click="removeCapability('toolIds', id)"><Icon :svg="strokeIconPaths.x" :size="13" /></button>
          </li>
        </ul>
        <p v-if="!selectedTools.length" class="agent-selection-empty">{{ readOnly ? 'Agent 默认配置尚未指定直接工具。Skill 私有工具仍可随 Skill 调用。' : '尚未指定直接工具。点击“添加 Tool”批量选择；Skill 的私有工具仍可随 Skill 调用。' }}</p>
        <div v-if="overlaps.length" class="agent-notice warning" role="status"><div><strong>{{ overlaps.length }} 个 Tool 存在多条加载路径</strong><p>{{ overlaps.map(usage => toolName(usage.id)).join('、') }}。允许保存，建议通过冲突检测检查调用边界。</p></div></div>
      </section>
    </div>
    <section class="agent-scope-section customer-config-block"><h3>全部可调用的 Tool <span>{{ usages.filter(usage => usage.tool).length }} 个，按工具去重</span></h3><p>范围：{{ context }}。合并直接工具与已启用 Skill 的私有工具。</p><div class="agent-scope-list"><div v-for="usage in usages" :key="usage.id" class="agent-scope-row"><strong>{{ toolName(usage.id) }}</strong><div class="agent-tags"><span v-for="path in usage.paths" :key="path.label" class="agent-tag" :class="{ 'is-private': path.kind === 'private' }">{{ path.label }}</span></div></div><p v-if="!usages.length" class="agent-selection-empty">当前没有可调用的 Tool。</p></div></section>
    <CustomerCapabilityPicker :open="pickerOpen" :kind="pickerKind" :context="context" :items="pickerItems" :loaded-ids="pickerLoadedIds" @close="pickerOpen = false" @add="addCapabilities" />
  </div>
</template>
<style scoped src="./agentManagement.css"></style>
<style scoped>
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
.is-readonly .customer-selected-tags { margin-top: 12px; }
.is-readonly .customer-capability-tag:not(.is-warning) { border-color: #e2e2dc; background: #f7f7f5; }
.is-readonly .customer-tag-label { padding: 5px 10px; line-height: 20px; }
.customer-tag-label:focus-visible { outline: 2px solid #64748b; outline-offset: 2px; border-radius: 3px; }
.customer-tag-state { margin-left: 6px; font-size: 11px; }
.customer-tag-remove { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 28px; height: 28px; margin: 1px 2px; border-radius: 3px; color: inherit; }
.customer-tag-remove:hover { color: #b42318; background: #feece9; }
.customer-tag-details { max-width: min(300px, calc(100vw - 48px)); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.customer-tag-details p { margin-top: 4px; }

@media (max-width: 1100px) { .customer-loading-columns { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .customer-config-block, .customer-config-block.agent-loading-section { padding: 16px; } }
</style>
