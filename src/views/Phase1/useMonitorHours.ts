import { computed, ref, type Ref } from 'vue';
import { usePhase1 } from '@/pinia/phase1';
import type { P1SkillId } from '@/views/AgentWork/interface';
import { monitoringHours } from './hourlyResults';

export function useMonitorHours(projectId: Ref<string>, skillIds: Ref<P1SkillId[]>) {
  const store = usePhase1();
  const revision = ref(0);
  // Only a settled-hour boundary, not every tick of the workspace clock, changes this report.
  const cutoff = computed(() => Math.floor(store.now / 3600000) * 3600000);
  const snapshot = computed(() => ({
    revision: revision.value, now: cutoff.value, orders: store.orders,
    events: store.events, anomalies: store.anomalies, logs: store.logs,
  }));
  const bySkill = computed(() => new Map(skillIds.value.map(id => [id, monitoringHours(snapshot.value, projectId.value, id)])));
  function hours(id: P1SkillId, orderId = '') {
    return orderId ? monitoringHours(snapshot.value, projectId.value, id, orderId) : bySkill.value.get(id) ?? [];
  }
  return { hours, refresh: () => { revision.value++; } };
}
