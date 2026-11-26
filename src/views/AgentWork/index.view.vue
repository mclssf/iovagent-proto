<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute,useRouter } from 'vue-router';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { ordinaryTasksStorageKey } from '@/pinia/ordinaryTaskPersistence';
import { usePhase1 } from '@/pinia/phase1';

import { useWorkspace } from '@/pinia/workspace';
import { chatRoute, useWorkspaceVisits, useFullWorkspace, viewLabel } from './workspaceVisits';
import { Icon } from '@packages/icon';
import { strokeIconPaths } from './strokeIconPaths';
import MenuComp from './component/menu.comp.vue';
import SkillSummonDialog from './component/skillSummon.dialog.vue';
import { useSkillComposer } from '@/pinia/skillComposer';

const route = useRoute(), router=useRouter(), ws=useWorkspace();
const visits=useWorkspaceVisits();
const {target:returnTarget,back:returnToBusiness}=useFullWorkspace();
const missingChat=computed(()=>route.name===chatRoute && typeof route.query.chat==='string' &&
  !ws.data.threads.some(t=>t.projectId===ws.data.projectId && t.id===route.query.chat));
const pageName=computed(()=>route.name===chatRoute?'AI 工作台':viewLabel(route.name));
const composer = useSkillComposer();
function syncSummon(event: StorageEvent) {
  if(event.key===ordinaryTasksStorageKey && event.newValue && event.newValue===localStorage.getItem(event.key)){
    tasks.syncStoredTasks();return;
  }
  if (event.key !== null && !event.key.startsWith('iovagent-agent-loading-v1:') && event.key !== 'iovagent-skill-versions-v1') return;
  try { composer.refresh(); composer.invalidate(); } catch { /* Opening the picker or sending will surface the read error. */ }
}
onMounted(() => window.addEventListener('storage', syncSummon));
onBeforeUnmount(() => window.removeEventListener('storage', syncSummon));
const isOrderListRoute = computed(() => ['agent-work-orders', 'agent-work-risk'].includes(String(route.name)));
const isFullBleedRoute = computed(() => ['agent-work-agent', 'agent-work-long-tasks', 'agent-work-daily-tasks', 'agent-work-downloads', 'agent-work-detail'].includes(String(route.name)) || isOrderListRoute.value);
const work = agentWorkData();
const tasks = useAgentDailyTasks();
const monitoring = usePhase1();
const monitorDetailKey = computed(() => route.name === 'agent-work-detail'
  ? [ws.data.projectId, route.query.orderId || '', route.query.eventId || ''].join(':') : undefined);
const missingOrder = computed(() => route.name === 'agent-work-detail' && ws.data.projectId &&
  !work.currentProjectOrders.some(order => !route.query.orderId || order.id === route.query.orderId));
watch(() => [monitoring.orders.map(order=>`${order.id}:${order.network?.status}`).join('|'), monitoring.anomalies.filter(item => item.status === 'active').length], () => {
  const project = work.projects.find(item => item.id === 'MONITOR-EAST');
  if (project) { project.total = monitoring.orders.filter(item => item.projectId === project.id).length; project.risk = new Set([...monitoring.orders.filter(order=>order.projectId===project.id&&order.network?.status==='unregistered').map(order=>order.id),...monitoring.anomalies.filter(item => item.status === 'active' && monitoring.orders.some(order => order.id === item.orderId && order.projectId === project.id)).map(item => item.orderId)]).size; }
}, { immediate: true });
watch(() => work.projects, (projects) => tasks.syncProjects(projects, work.ordersSeed), { immediate: true, deep: true });
function alignProject() {
  const state=window.history.state;
  const here=state?.identityPath===route.fullPath;
  const linked=route.query.projectId || visits.entry(route)?.projectId || (here && state.businessProject) || tasks.tasks.find(t=>t.id===route.query.taskId)?.projectId;
  const id=linked || ws.data.projectId;
  const p=work.projects.find(p=>p.id===id);
  if(p && (ws.data.projectId!==p.id || work.currentProjectId!==p.id || !ws.active)) work.switchProject(p);
  else if(!p && id) ws.data.projectId='';
  if(p && route.name===chatRoute){const id=route.query.chat || (here && state.entryChat);const t=ws.data.threads.find(t=>t.projectId===p.id && t.id===id);if(t)ws.open(t);}
  if(p && !here && (!route.query.projectId || (route.name===chatRoute && !route.query.chat))){
    router.options.history.replace(route.fullPath,{identityPath:route.fullPath,businessProject:p.id,entryChat:route.name===chatRoute?ws.active?.id||null:null});
  }
}
function rememberOnReload(){if(route.name!==chatRoute)visits.capture(route,ws.data.projectId);}
onMounted(()=>{alignProject();void visits.restoreScroll(route);window.addEventListener('pagehide',rememberOnReload);});
onBeforeUnmount(()=>window.removeEventListener('pagehide',rememberOnReload));
watch([()=>route.fullPath,()=>visits.businessEntry],()=>{alignProject();void visits.restoreScroll(route);}, {flush:'pre'});
watch(()=>ws.active?.id,id=>{work.currentConversationId=id||'';work.workspaceMode='project';work.rightPanel='overview';},{immediate:true,flush:'sync'});
watch(()=>work.currentProjectId,id=>{if(id!==ws.data.projectId && work.projects.some(p=>p.id===id))ws.select(id);});
watch(()=>work.projects.map(p=>p.id), ids=>{if(!ids.includes(ws.data.projectId))ws.data.projectId='';});
let taskClock: ReturnType<typeof setInterval> | undefined;
onMounted(() => { taskClock = setInterval(() => { tasks.tick(); monitoring.now = Date.now(); monitoring.tick(); }, 1000); });
onBeforeUnmount(() => { if (taskClock) clearInterval(taskClock); });
</script>

<template>
  <div class="grid h-screen grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-[#f7f7f6] text-slate-900" :class="{  'navigation-collapsed':ws.data.navCollapsed, 'knowledge-base-layout': ['agent-work-knowledge-base', 'agent-work-knowledge-base-empty'].includes(String(route.name)), 'daily-tasks-layout': route.name === 'agent-work-daily-tasks', 'downloads-layout': route.name === 'agent-work-downloads', 'agent-workbench-layout': route.name === 'agent-work-agent', 'project-create-layout': route.name === 'agent-work-project-create', 'order-detail-layout': route.name === 'agent-work-detail', 'order-list-layout': isOrderListRoute }">
    <div class="compact-navigation"><button class="nav-control" type="button" aria-label="展开导航" title="展开导航" @click="ws.data.navCollapsed=false;ws.menu=true"><Icon :svg="strokeIconPaths.list" :size="16"/></button><button class="truncate" aria-label="切换工作项目" @click="ws.picker=true">{{ws.data.projectId?work.currentProject.name:'选择项目'}}</button><span class="truncate text-slate-500">/ {{pageName}}</span></div>
    <MenuComp class="project-navigation" :class="{'mobile-open':ws.menu}" />
    <SkillSummonDialog />

    <div class="workspace-content"><main data-business-view class="h-full min-w-0 flex-1 overflow-hidden" :class="isFullBleedRoute ? 'bg-[#fcfcfc] p-0' : 'bg-[#f7f7f5] p-3'">
      <div v-if="ws.data.projectId && route.query.projectId && route.query.projectId!==ws.data.projectId" role="status" class="grid h-full place-content-center text-sm text-slate-600">正在切换项目…</div>
      <div v-else-if="missingOrder" class="grid h-full place-content-center text-sm text-slate-600">当前项目没有可查看的对应运单。</div>
      <RouterView v-else-if="!missingChat && (ws.data.projectId || (route.name==='agent-work-daily-tasks' && route.query.scope==='personal') || ['agent-work-projects','agent-work-project-create'].includes(String(route.name)))" :key="(monitorDetailKey || (String(route.name)+':'+ws.data.projectId))+':'+visits.businessEntry" />
      <div v-else class="grid h-full place-content-center gap-2 text-center text-sm text-slate-600">
        <p v-if="missingChat && ws.data.projectId">这条对话已删除或不可访问。</p>
        <p v-else-if="returnTarget">当前项目已不可访问。</p>
        <button v-if="returnTarget" class="rounded-md border bg-white px-4 py-2" @click="returnToBusiness">{{returnTarget.label}}</button>
        <button v-else-if="!ws.data.projectId" class="rounded-md border bg-white px-4 py-2" @click="ws.picker=true">选择工作项目</button>
      </div>
    </main>
    </div>
    <small v-if="ws.storageError" role="alert">{{ws.storageError}}</small>
  </div>
</template>

<style lang="scss" scoped>
:global(html:has(.order-list-layout)), :global(body:has(.order-list-layout)) { min-width: 0; }

@media (max-width: 1000px) {
  :global(html:has(.order-detail-layout)), :global(body:has(.order-detail-layout)) { min-width: 0; }
  .order-detail-layout { grid-template-columns: minmax(0, 1fr); height: 100dvh; }
  .order-detail-layout > .project-navigation { display: none; }
}

@media (max-width: 700px) {
  :global(html:has(.knowledge-base-layout)), :global(body:has(.knowledge-base-layout)), :global(html:has(.downloads-layout)), :global(body:has(.downloads-layout)), :global(html:has(.project-create-layout)), :global(body:has(.project-create-layout)) { min-width: 0; }
  .knowledge-base-layout, .daily-tasks-layout, .downloads-layout, .agent-workbench-layout, .project-create-layout, .order-list-layout { grid-template-columns: minmax(0, 1fr); height: 100dvh; }
  .knowledge-base-layout > .project-navigation, .daily-tasks-layout > .project-navigation, .downloads-layout > .project-navigation, .agent-workbench-layout > .project-navigation, .project-create-layout > .project-navigation, .order-list-layout > .project-navigation { display: none; }
}

.workspace-content {position:relative;display:flex;min-width:0;min-height:0;overflow:hidden}
.compact-navigation{display:none}
.nav-control{display:inline-grid;place-items:center;width:32px;height:32px}
.navigation-collapsed,.grid:has(.compact-navigation):not(:has(.project-navigation)){grid-template-columns:minmax(0,1fr);grid-template-rows:36px minmax(0,1fr)}
.navigation-collapsed>.project-navigation{display:none}
.navigation-collapsed>.compact-navigation{display:flex}
.compact-navigation{align-items:center;gap:8px;padding:0 12px;font-size:12px;border-bottom:1px solid #e2e2dc}
@media(max-width:1000px){:global(html:has(.workspace-content)),:global(body:has(.workspace-content)){min-width:0}.grid:has(.workspace-content){grid-template-columns:minmax(0,1fr);grid-template-rows:36px minmax(0,1fr);height:100dvh}.compact-navigation{display:flex}.project-navigation{display:none}.project-navigation.mobile-open{display:flex;position:fixed;inset:0 auto 0 0;width:min(280px,95vw);z-index:50}}
</style>
