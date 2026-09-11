<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElDialog } from 'element-plus';
import { Icon } from '@packages/icon';
import { strokeIconPaths } from '../AgentWork/strokeIconPaths';
import type { AgentConflictReport } from './agentConflicts';
const props = defineProps<{ open: boolean; report?: AgentConflictReport; customerName: string; agentName: string; stale: boolean }>();
const emit = defineEmits<{ close: []; rerun: [] }>();
const findingFilter = ref('all');
watch(() => props.open, () => { findingFilter.value = 'all'; });
const reportFindings = computed(() => props.report?.findings.filter((finding) => findingFilter.value === 'all' || (findingFilter.value === 'ambiguity' ? ['intent', 'schema'].includes(finding.kind) : finding.kind === findingFilter.value)) ?? []);
const reportHighCount = computed(() => props.report?.findings.filter((finding) => finding.severity === 'high').length ?? 0);
</script>
<template>
  <ElDialog :model-value="open" @update:model-value="emit('close')" title="调用冲突检测结果" width="1060px" top="4vh" class="ops-tool-dialog agent-report-dialog" append-to-body>
    <div v-if="report" class="agent-report">
      <div class="agent-report-heading"><div><h3>{{ customerName }} · {{ agentName }}</h3><p>{{ report.checkedAt }} · 基于当前配置的本地规则检测</p></div><span class="agent-status" :class="stale || report.findings.length ? 'is-warning' : 'is-success'">{{ stale ? '结果已过期' : report.findings.length ? `${report.findings.length} 项需处理或复核` : '本次未发现冲突' }}</span></div>
      <div v-if="stale" class="agent-notice warning" role="status"><Icon :svg="strokeIconPaths.alert" :size="18" /><p>Agent、Skill 或工具加载配置已变化。以下为上次检测结果，请重新检测。</p></div>
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
    <template #footer><button type="button" class="ops-secondary" @click="emit('close')">关闭</button><button type="button" class="ops-primary" @click="emit('rerun')">重新检测</button></template>
  </ElDialog>
</template>
<style scoped src="./agentManagement.css"></style>
