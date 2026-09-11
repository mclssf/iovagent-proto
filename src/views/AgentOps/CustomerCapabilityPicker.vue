<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElDialog } from 'element-plus';
import { Icon } from '@packages/icon';
import { skillGroups } from '@/pinia/agentOps';
import type { SkillGroup, ToolKind } from '@/pinia/agentOps';
import { filterCapabilityOptions, mergeCapabilitySelection } from './capabilitySelection';
import type { CapabilityOption } from './capabilitySelection';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';

const props = defineProps<{
  open: boolean;
  kind: 'skill' | 'tool';
  context: string;
  items: readonly CapabilityOption[];
  loadedIds: readonly string[];
}>();
const emit = defineEmits<{ close: []; add: [ids: string[]] }>();
const search = ref('');
const groups = ref<SkillGroup[]>([]);
const toolKind = ref<'all' | ToolKind>('all');
const pendingIds = ref<string[]>([]);
const onlyPending = ref(false);
const noun = computed(() => props.kind === 'skill' ? 'Skill' : 'Tool');
const isLoaded = (id: string) => props.loadedIds.includes(id);
const pending = computed(() => props.items.filter(item => pendingIds.value.includes(item.id) && !isLoaded(item.id) && !item.disabled));
const filtered = computed(() => filterCapabilityOptions(props.items, search.value, groups.value, toolKind.value)
  .filter(item => !onlyPending.value || pending.value.some(selected => selected.id === item.id)));
const selectable = computed(() => filtered.value.filter(item => !item.disabled && !isLoaded(item.id)));
const checkedCount = computed(() => selectable.value.filter(item => pendingIds.value.includes(item.id)).length);
const allChecked = computed(() => selectable.value.length > 0 && checkedCount.value === selectable.value.length);
const someChecked = computed(() => checkedCount.value > 0 && !allChecked.value);
function toggleGroup(group: SkillGroup) {
  groups.value = groups.value.includes(group) ? groups.value.filter(item => item !== group) : [...groups.value, group];
}
function toggleItem(id: string, checked: boolean) {
  pendingIds.value = checked ? mergeCapabilitySelection(pendingIds.value, [id], props.items) : pendingIds.value.filter(item => item !== id);
}
function toggleResults(checked: boolean) {
  const ids = selectable.value.map(item => item.id);
  pendingIds.value = checked ? mergeCapabilitySelection(pendingIds.value, ids, props.items) : pendingIds.value.filter(id => !ids.includes(id));
}
function clearFilters() { search.value = ''; groups.value = []; toolKind.value = 'all'; onlyPending.value = false; }
watch(() => [props.open, props.kind, props.context], () => { clearFilters(); pendingIds.value = []; });
</script>

<template>
  <ElDialog :model-value="open" :title="`添加 ${noun}`" width="960px" top="5vh" class="ops-tool-dialog capability-picker-dialog" append-to-body :close-on-click-modal="false" @update:model-value="emit('close')">
    <div class="capability-picker">
      <p class="picker-context">{{ context }}</p>
      <p class="picker-help">{{ kind === 'skill' ? '按组筛选后可批量勾选，也可搜索并逐项选择。已加载的 Skill 不会重复添加。' : '搜索并勾选 MCP 服务或代码工具，一次添加多个。Skill 私有加载的工具仍可独立选择。' }}</p>
      <div v-if="kind === 'skill'" class="picker-groups" aria-label="筛选 Skill 分组">
        <span>Skill 分组</span>
        <button type="button" :aria-pressed="!groups.length" @click="groups = []">全部</button>
        <button v-for="group in skillGroups" :key="group" type="button" :aria-pressed="groups.includes(group)" @click="toggleGroup(group)">{{ group }}<span>{{ items.filter(item => item.group === group).length }}</span></button>
        <small>可多选</small>
      </div>
      <div class="picker-search-row">
        <label class="picker-search"><Icon :svg="strokeIconPaths.search" :size="15" /><input v-model="search" class="ops-input ops-search" :aria-label="`搜索待添加 ${noun}`" :placeholder="`搜索 ${noun} 名称、描述或标识`" /></label>
        <select v-if="kind === 'tool'" v-model="toolKind" class="ops-input picker-type" aria-label="筛选 Tool 类型"><option value="all">全部类型</option><option value="mcp">MCP 服务</option><option value="code">代码工具</option></select>
      </div>
      <div class="picker-selection-bar">
        <label><input type="checkbox" :checked="allChecked" :indeterminate="someChecked" :disabled="!selectable.length" aria-label="全选当前筛选结果" @change="toggleResults(($event.target as HTMLInputElement).checked)" />全选当前结果 <span>（可添加 {{ selectable.length }} 项）</span></label>
        <button type="button" class="picker-pending-toggle" :aria-pressed="onlyPending" @click="onlyPending = !onlyPending">{{ onlyPending ? '查看全部候选' : '仅看本次勾选' }}<span>{{ pending.length }}</span></button>
      </div>
      <ul class="picker-results" :aria-label="`待添加 ${noun} 列表`">
        <li v-for="item in filtered" :key="item.id" :class="{ 'is-unavailable': isLoaded(item.id) || item.disabled }">
          <label class="picker-option"><input type="checkbox" :checked="isLoaded(item.id) || pending.some(selected => selected.id === item.id)" :disabled="isLoaded(item.id) || item.disabled" :aria-label="`勾选 ${noun} ${item.name}`" @change="toggleItem(item.id, ($event.target as HTMLInputElement).checked)" />
            <span class="picker-option-content"><span class="picker-option-title"><strong>{{ item.name }}</strong><span class="picker-badge">{{ item.group ?? (item.kind === 'mcp' ? 'MCP 服务' : '代码工具') }}</span><span v-if="isLoaded(item.id)" class="picker-state">已在加载列表</span><span v-else-if="item.disabled" class="picker-state">已停用</span></span>
              <span class="picker-description">{{ item.description }}</span><span v-if="item.detail" class="picker-detail">{{ item.detail }}</span><span v-if="item.warning" class="picker-warning">{{ item.warning }}</span>
            </span>
          </label>
        </li>
      </ul>
      <div v-if="!filtered.length" class="picker-empty"><p>{{ onlyPending ? '当前筛选下没有本次勾选项。' : '没有匹配的能力，请调整搜索或筛选条件。' }}</p><button type="button" @click="clearFilters">清除筛选</button></div>
      <p v-if="kind === 'skill'" class="picker-footnote">按组添加当前所选 Skill，后续新增或调整分组不会自动改变客户配置。</p>
    </div>
    <template #footer>
      <div class="picker-footer"><div><span role="status">本次勾选 {{ pending.length }} 个 {{ noun }}</span><button v-if="pending.length" type="button" class="picker-clear" @click="pendingIds = []">清空勾选</button><p>勾选跨搜索和筛选保留；添加后请保存客户配置。</p></div><div class="picker-actions"><button type="button" class="ops-secondary" @click="emit('close')">取消</button><button type="button" class="ops-primary" :disabled="!pending.length" @click="emit('add', pending.map(item => item.id))">添加已勾选（{{ pending.length }}）</button></div></div>
    </template>
  </ElDialog>
</template>

<style scoped>
.capability-picker { color: #334155; font-size: 13px; }
.picker-context { font-weight: 600; color: #0f172a; overflow-wrap: anywhere; }
.picker-help, .picker-footnote { margin-top: 6px; color: #64748b; font-size: 12px; line-height: 1.8; }
.picker-groups { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 20px 0 16px; font-size: 12px; }
.picker-groups > span { margin-right: 4px; }
.picker-groups button, .picker-pending-toggle { border: 1px solid #deded9; border-radius: 4px; padding: 7px 10px; background: white; color: #475569; }
.picker-groups button[aria-pressed="true"], .picker-pending-toggle[aria-pressed="true"] { background: #f1f5f9; border-color: #64748b; color: #0f172a; }
.picker-groups button span, .picker-pending-toggle span { margin-left: 6px; font-variant-numeric: tabular-nums; }
.picker-groups small { color: #64748b; }
.picker-search-row { display: flex; gap: 12px; margin-top: 16px; }
.picker-search { position: relative; flex: 1; min-width: 0; }
.picker-search > :first-child { position: absolute; left: 12px; top: 10px; color: #64748b; }
.picker-type { width: 140px; }
.picker-selection-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 14px 0; border-bottom: 1px solid #e2e2dc; font-size: 12px; }
.picker-selection-bar label { display: flex; align-items: center; cursor: pointer; }
.picker-selection-bar label span { color: #64748b; }
.capability-picker input[type="checkbox"] { width: 15px; height: 15px; margin-right: 10px; flex-shrink: 0; accent-color: #334155; cursor: pointer; }
.capability-picker input:disabled { cursor: not-allowed; }
.picker-results { max-height: 350px; overflow: auto; scrollbar-width: thin; scrollbar-color: #b5b8bc transparent; }
.picker-results li { border-bottom: 1px solid #e9e9e4; }
.picker-results li:hover { background: #fafaf8; }
.picker-option { display: flex; align-items: start; padding: 14px 4px; cursor: pointer; }
.picker-option input { margin-top: 3px; }
.picker-option-content { display: block; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.picker-option-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.picker-option-title strong { font-size: 13px; font-weight: 600; }
.picker-badge { border-radius: 4px; padding: 2px 6px; font-size: 11px; background: #f3f3f0; color: #475569; }
.picker-state { margin-left: auto; font-size: 11px; color: #64748b; }
.picker-description, .picker-detail, .picker-warning { display: block; margin-top: 5px; font-size: 12px; line-height: 1.7; }
.picker-description { color: #64748b; }
.picker-detail { color: #475569; }
.picker-warning { color: #92400e; }
.is-unavailable .picker-option { cursor: default; }
.is-unavailable strong { color: #64748b; }
.picker-empty { padding: 30px 12px; color: #64748b; text-align: center; font-size: 12px; }
.picker-empty button { margin-top: 12px; text-decoration: underline; text-underline-offset: 3px; }
.picker-footnote { margin-top: 12px; }
.picker-footer { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; text-align: left; color: #475569; font-size: 12px; }
.picker-footer p { margin-top: 6px; font-size: 11px; color: #64748b; }
.picker-clear { margin-left: 12px; text-decoration: underline; text-underline-offset: 3px; }
.picker-actions { display: flex; gap: 8px; }
.capability-picker :is(button, input, select):focus-visible { outline: 2px solid #64748b; outline-offset: 2px; }
@media (max-width: 600px) {
  .picker-search-row { flex-wrap: wrap; gap: 8px; }
  .picker-search { flex-basis: 100%; }
  .picker-groups { gap: 6px; }
  .picker-groups > span { flex-basis: 100%; }
  .picker-results { max-height: 300px; }
  .picker-actions { width: 100%; justify-content: flex-end; }
}
</style>
