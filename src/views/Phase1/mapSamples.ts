import { usePhase1 } from '@/pinia/phase1';
import type { Project } from '@/views/AgentWork/interface';
import { readLingdongSample } from '@/pinia/lingdongSync';

// 固定业务样例，只在首次缺失时写入，不覆盖用户状态或已有轨迹。
export function ensureMapSamples(projects: Project[]) {
  const store = usePhase1();
  if (!projects.some(project => project.id === 'P001')) return;
  if (!store.configs.P001) store.configs.P001 = store.config('P001');
  const at = store.now;
  for (const [id, registered] of [['V260-NET001', false], ['V260-TRACK001', true]] as const) {
    if (store.orders.some(order => order.id === id)) continue;
    const row = readLingdongSample(0, at)[registered ? 0 : 2]!;
    const ok = store.createOrder({ id, projectId: 'P001', plate: registered ? '鲁B62601' : '鲁B62603', plateColor: 2, driver: registered ? '王师傅' : '李师傅', source: '手动导入',
      origin: row.origin, destination: row.destination, plannedDeparture: at - 3 * 3600000, plannedArrival: at + 4 * 3600000,
      network: { status: registered ? 'registered' : 'unregistered', checkedAt: at, source: '车辆入网查询', reason: registered ? '车辆已入网' : '明确返回车辆未入网' } });
    if (!ok || !registered) continue;
    const order = store.orders.find(item => item.id === id)!;
    // GCJ02定位样例按采集时间排列，停在当前位置，不补齐到目的地。
    order.actualTrack = [[120.17,35.96],[120.12,36.01],[120.05,36.08],[119.99,36.16],[119.9,36.25],[119.78,36.33],[119.65,36.39]].map(([lon,lat],index) => ({ lon:lon!,lat:lat!,at:at-(6-index)*20*60000 }));
  }
}
