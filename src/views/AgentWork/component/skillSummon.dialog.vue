<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon } from '@packages/icon';
import AppDialog from '@/components/AppDialog.vue';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentOpsStore } from '@/pinia/agentOps';
import { summonIcon, useSkillComposer } from '@/pinia/skillComposer';
import { strokeIconPaths } from '../strokeIconPaths';

const route = useRoute(), router = useRouter();
const work = agentWorkData(), ops = useAgentOpsStore(), composer = useSkillComposer();
const target = ref(''), project = ref(''), query = ref(''), error = ref('');
const loading = ref(false), focusAfterClose = ref(false);
const isChat = computed(() => route.name === 'agent-work-agent');
const projectPage = computed(() => ['agent-work-orders','agent-work-detail','agent-work-risk','agent-work-cargo-sources','agent-work-cargo-quotes','agent-work-private-capacity'].includes(String(route.name))
  || (route.name === 'agent-work-daily-tasks' && route.query.scope !== 'personal' && work.workspaceMode === 'project'));
const locked = computed(() => isChat.value || projectPage.value);
const agents = computed(() => ops.customers.some(c => c.id === composer.customerId) ? ops.agents : []);
const skills = computed(() => target.value ? ops.summonSkills(composer.customerId, target.value) : []);
const shown = computed(() => skills.value.filter(s => (s.name + ' ' + s.description).toLowerCase().includes(query.value.trim().toLowerCase())));
const selectedId = computed(() => composer.get(composer.scopeFor(target.value, project.value, !isChat.value)).skillId);
let generation = 0;
async function reload() {
  const version = ++generation;
  error.value = ''; loading.value = true;
  try {
    await nextTick();
    composer.refresh();
  } catch { if (version === generation) error.value = '技能配置读取失败，请重试。'; }
  finally { if (version === generation) loading.value = false; }
}
watch(() => composer.panel, open => {
  if (!open) return;
  query.value = ''; focusAfterClose.value = open === 'composer' || isChat.value;
  target.value = isChat.value ? composer.agentId : projectPage.value ? 'project-chat-agent' : agents.value.length === 1 ? agents.value[0].id : '';
  project.value = locked.value ? work.currentProjectId : '';
  void reload();
});
async function summon(id: string) {
  try {
    composer.refresh();
    if (!skills.value.some(s => s.id === id)) throw new Error('该技能已不可用，请重新选择。');
    if (!isChat.value) {
      if (target.value === 'project-chat-agent') {
        const destination = work.projects.find(p => p.id === project.value);
        if (!destination) throw new Error('请选择目标项目。');
        if (work.workspaceMode !== 'project' || work.currentProjectId !== destination.id) work.switchProject(destination);
        if (work.isChatOutputBusy) throw new Error('项目正在回复，请稍后再创建对话。');
        const prior = composer.draft;
        if (work.splitProjectConversation()) Object.assign(composer.draft, { ...prior, files: [...prior.files] });
      } else work.startNewConversation(target.value);
      await router.push({ name: 'agent-work-agent' });
    }
    composer.bind(id);
    focusAfterClose.value = true;
    composer.panel = null;
  } catch (e) { error.value = e instanceof Error ? e.message : '技能加载失败，请重试。'; }
}
</script>
<template>
  <AppDialog :model-value="!!composer.panel" title="数字人技能" width="840px" class="summon-dialog"
    @update:model-value="composer.panel = null" @closed="focusAfterClose && composer.focusRequest++">
    <div class="summon-tools">
      <label v-if="!locked" class="summon-select">智能体<select v-model="target" aria-label="目标智能体"><option value="" disabled>选择智能体</option><option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option></select></label>
      <label v-if="!locked && target === 'project-chat-agent'" class="summon-select">项目<select v-model="project" aria-label="目标项目"><option value="" disabled>选择项目</option><option v-for="p in work.projects" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
      <span v-if="locked" class="summon-context">{{ agents.find(a => a.id === target)?.name }}</span>
      <label class="summon-search"><Icon :svg="strokeIconPaths.search" :size="15" /><input v-model="query" class="dialog-inline-input" type="search" placeholder="搜索技能名称或简介" aria-label="搜索技能名称或简介" /></label>
    </div>
    <div v-if="loading" class="summon-empty" role="status">正在加载技能…</div>
    <div v-else-if="error" class="summon-empty" role="alert">{{ error }} <button type="button" @click="reload">重试</button></div>
    <div v-else-if="!agents.length || (target && !skills.length)" class="summon-empty">当前智能体暂无可用技能，请联系管理员配置。</div>
    <div v-else-if="!target || (target === 'project-chat-agent' && !project)" class="summon-empty">{{ !target ? '请选择目标智能体' : '请选择目标项目' }}</div>
    <div v-else-if="!shown.length" class="summon-empty">没有匹配的技能</div>
    <section v-else class="summon-grid" aria-label="可召唤技能">
      <article v-for="skill in shown" :key="skill.id" class="summon-card" :class="{ selected: selectedId === skill.id }">
        <div class="summon-card-heading"><span class="summon-icon"><Icon :svg="strokeIconPaths[summonIcon(skill)]" :size="17" /></span>
          <div><h3>{{ skill.name }}</h3><small>{{ skill.category }}</small></div>
          <button type="button" class="summon-action" :aria-label="(selectedId === skill.id ? '已召唤 ' : '召唤 ') + skill.name" @click="summon(skill.id)">
            <Icon :svg="selectedId === skill.id ? strokeIconPaths.check : strokeIconPaths.plus" :size="13" />{{ selectedId === skill.id ? '已召唤' : '召唤' }}
          </button>
        </div>
        <p>{{ skill.description }}</p>
      </article>
    </section>
  </AppDialog>
</template>
<style scoped>
.summon-tools,.summon-select,.summon-search,.summon-action,.summon-icon{display:flex;align-items:center;gap:7px}
.summon-tools{flex-wrap:wrap;justify-content:space-between;margin:0 0 16px;font-size:13px}
.summon-select select,.summon-search{height:34px;border:1px solid #deded9;border-radius:6px;background:#fff}
.summon-select select{max-width:180px;padding-inline:8px 28px}.summon-search{padding:0 10px;min-width:0}.summon-search input{min-width:0;width:165px;outline:none}
.summon-search:focus-within{border-color:#2563eb}.summon-context,.summon-select{color:#475569}
.summon-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,285px),1fr));gap:10px;max-height:55vh;overflow:auto}
.summon-card{padding:14px;border:1px solid #deded9;border-radius:8px;background:#fff}.summon-card.selected{border-color:#9cbbed}
.summon-card-heading{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:start;gap:9px}.summon-icon{height:32px;justify-content:center;border-radius:6px;background:#edf3fc;color:#34588d}
.summon-card h3{font-size:14px;font-weight:600;line-height:20px;overflow-wrap:anywhere;color:#202a37}.summon-card small{font-size:12px;color:#64748b}
.summon-action{align-self:start;border:1px solid #d4dbe5;border-radius:5px;padding:4px 8px;font-size:12px;line-height:17px;color:#34588d}.summon-action:hover,.selected .summon-action{background:#eff6ff}
.summon-card p{font-size:13px;line-height:20px;color:#475569;margin:10px 0 0;overflow-wrap:anywhere}.summon-empty{text-align:center;padding:34px 8px;color:#64748b;font-size:13px}.summon-empty button{color:#2563eb}
</style>
