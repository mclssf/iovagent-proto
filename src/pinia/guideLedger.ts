import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { guideOrder, guideTrips } from '@/views/AgentWork/guideScenarios';

const key = 'iovagent-east-dispatch-trips-v1';
export const useGuideLedger = defineStore('eastDispatch', () => {
  let saved: unknown;
  try { saved = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* Start from the dispatch register. */ }
  const known = guideTrips.filter(t => t.shuttle).map(t => t.id);
  const generated = ref<string[]>(Array.isArray(saved) ? known.filter(id => saved.includes(id)) : []);
  const orders = computed(() => guideTrips.filter(t => !t.shuttle || generated.value.includes(t.id)).map(guideOrder));
  function register(ids: string[]) {
    const next = known.filter(id => generated.value.includes(id) || ids.includes(id));
    if (next.length === generated.value.length) return;
    generated.value = next;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Remains available for this session. */ }
  }
  return { orders, register };
});
