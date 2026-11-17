import { ensureMapSamples } from './views/Phase1/mapSamples';
import { useLingdongSync } from './pinia/lingdongSync';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { usePhase1 } from './pinia/phase1';
import { agentWorkData } from './pinia/agentWork';
import { phaseSkills } from './views/Phase1/catalog';
import { persistMonitoringProjects } from './views/Phase1/persistence';

import App from './App.vue';
import { handleRouter } from './router';

import './styles/tailwind.css';
import './styles/dialogs.css';
import './styles/selects.css';
import 'animate.css';

async function bootstrap(_namespace = 'iovagent') {
  const app = createApp(App);
  const router = handleRouter([]);

  app.use(createPinia());
  const monitoring = usePhase1();
  try {
    const saved = JSON.parse(localStorage.getItem('iovagent-transport-monitoring') || 'null');
    if (saved?.schema === 1 && Array.isArray(saved.state?.orders) && saved.state?.configs && Array.isArray(saved.state.events) && Array.isArray(saved.state.anomalies) && Array.isArray(saved.state.logs)) monitoring.$patch(saved.state);
  } catch { /* Keep a usable workspace when saved data is unavailable. */ }
  monitoring.now = Date.now();
  monitoring.seed();
  monitoring.tick();
  const work = agentWorkData();
  const syncSkills = () => {
    for (const project of work.projects) {
      const config = monitoring.configs[project.id];
      if (config) {
        const ids = [...(project.skillIds ?? []).filter(id => !phaseSkills.some(skill => skill.id === id)), ...config.selectedSkills];
        if (JSON.stringify(project.skillIds) !== JSON.stringify(ids)) project.skillIds = ids;
      }
    }
  };
  syncSkills();
  persistMonitoringProjects(work.projects);
  work.$subscribe((_mutation, state) => {
    persistMonitoringProjects(state.projects);
    for (const order of monitoring.orders) if (!state.projects.some(project => project.id === order.projectId)) monitoring.stop(order.id, '所属项目已删除，结束监听');
  }, { detached: true });
  monitoring.$subscribe((_mutation, state) => {
    syncSkills();
    try { localStorage.setItem('iovagent-transport-monitoring', JSON.stringify({ schema: 1, state })); } catch { /* Active state remains available. */ }
  }, { detached: true });
  const inbound = useLingdongSync();
  try { const saved=JSON.parse(localStorage.getItem('iovagent-lingdong-inbound-v260')||'null');if(saved?.schema===1&&saved.state&&typeof saved.state.defaultProjectId==='string'&&saved.state.records)inbound.$patch({...saved.state,busy:false}); } catch { /* Use initial inbound state. */ }
  inbound.ensureDefault(work.projects);
  const persistInbound=()=>{try{localStorage.setItem('iovagent-lingdong-inbound-v260',JSON.stringify({schema:1,state:inbound.$state}));}catch{/* Keep current session. */}};
  inbound.$subscribe(persistInbound,{detached:true});
  if(!inbound.lastSyncAt)inbound.syncLatest(work.projects);
  persistInbound();
  ensureMapSamples(work.projects);
  app.use(router);
  app.mount('#app');
}

export { bootstrap };
