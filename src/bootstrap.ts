import { createApp } from 'vue';
import { createPinia } from 'pinia';

import {usePhase1} from './pinia/phase1';
import {agentWorkData} from './pinia/agentWork';
import {phaseSkills} from './views/Phase1/catalog';
import App from './App.vue';
import { handleRouter } from './router';

import './styles/tailwind.css';
import './styles/dialogs.css';
import 'animate.css';

async function bootstrap(_namespace = 'iovagent') {
  const app = createApp(App);
  const router = handleRouter([]);

  app.use(createPinia());
  const phase=usePhase1();const work=agentWorkData();
  try{const raw=localStorage.getItem('iovagent-v11-phase1');if(raw){const saved=JSON.parse(raw);if(saved.schema===1&&Array.isArray(saved.state?.orders)&&saved.state?.configs)phase.$patch(saved.state);}}
  catch{/* keep usable mock defaults */}
  try{const saved=JSON.parse(localStorage.getItem('iovagent-v11-projects')||'null');if(Array.isArray(saved?.projects)&&saved.projects.every((p:{id?:string;name?:string})=>p.id&&p.name)){work.projects=saved.projects;if(work.projects.some(p=>p.id===saved.currentProjectId))work.currentProjectId=saved.currentProjectId;}}
  catch{/* retain V1 projects */}
  for(const config of Object.values(phase.configs))config.weather??={enabled:false};
  for(const order of phase.orders){order.providerMode ||= 'mock';order.config.weather??={enabled:false};}
  phase.seed();
  for(const project of work.projects){if(!phase.configs[project.id])phase.configs[project.id]={...phase.config(project.id),selectedSkills:[]};if(project.id==='P001')project.skillIds=[...(project.skillIds||[]).filter(id=>!phaseSkills.some(s=>s.id===id)),...phase.config(project.id).selectedSkills];}
  phase.$subscribe((_mutation,state)=>{for(const project of work.projects){if(state.configs[project.id])project.skillIds=[...(project.skillIds||[]).filter(id=>!phaseSkills.some(s=>s.id===id)),...state.configs[project.id]!.selectedSkills];}try{localStorage.setItem('iovagent-v11-phase1',JSON.stringify({schema:1,state}));}catch{/* session stays usable */}},{detached:true});
  work.$subscribe((_mutation,state)=>{try{localStorage.setItem('iovagent-v11-projects',JSON.stringify({projects:state.projects,currentProjectId:state.currentProjectId}));}catch{/* session stays usable */}},{detached:true});
  app.use(router);
  app.mount('#app');
}

export { bootstrap };
