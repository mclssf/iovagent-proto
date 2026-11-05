import { defineStore } from 'pinia';
import type { P1Order, Project } from '@/views/AgentWork/interface';
import { usePhase1 } from './phase1';

export interface LingdongOrder {
  customerId: string; orderId: string; plate: string; driver: string; updatedAt: number;
  origin: P1Order['origin']; destination: P1Order['destination']; plannedDeparture: number; plannedArrival: number;
  network: 'registered' | 'unregistered' | 'unknown';
}
const sourcePlace = (name: string, lat: number, lon: number, regionCode: string) => ({ name, lat, lon, regionCode, radiusMeters: 5000, coordinateSystem: 'gcj02' as const });
// 只读接口适配器样例，不包含向灵动创建、修改或回写运单的能力。
export function readLingdongSample(batch: number, at: number): LingdongOrder[] {
  const numbers = batch === 0 ? [1, 2, 3] : [batch + 3];
  return numbers.map(n => ({ customerId: 'CUSTOMER-CURRENT', orderId: `LD260${String(n).padStart(3, '0')}`, plate: `鲁B${62000 + n}`, driver: `运输司机${n}`, updatedAt: at,
    origin: sourcePlace('青岛黄岛装货仓', 35.96, 120.17, '370211'), destination: sourcePlace('济南历城配送仓', 36.68, 117.10, '370112'),
    plannedDeparture: at + 3600000, plannedArrival: at + 7 * 3600000, network: n === 3 ? 'unregistered' : 'registered' }));
}
export const useLingdongSync = defineStore('lingdong-inbound-v260', {
  state: () => ({ defaultProjectId: '', batch: 0, lastSyncAt: 0, busy: false, error: '', summary: '', records: {} as Record<string, { orderId: string; projectId: string; snapshot: LingdongOrder }>, failed: [] as string[] }),
  actions: {
    setDefault(projectId: string, projects: Project[]) {
      if (!projects.some(project => project.id === projectId)) return '项目不存在，未修改默认项目';
      this.defaultProjectId = projectId; this.error = ''; return '';
    },
    ensureDefault(projects: Project[]) {
      if (this.defaultProjectId) return;
      this.defaultProjectId = projects.find(project => project.id === 'MONITOR-EAST')?.id ?? projects[0]?.id ?? '';
    },
    ingest(rows: LingdongOrder[], projects: Project[]) {
      if (!projects.some(project => project.id === this.defaultProjectId)) { this.error = '请先设置有效的默认项目，未分配运单'; return false; }
      const monitoring = usePhase1();
      if(!monitoring.configs[this.defaultProjectId])monitoring.configs[this.defaultProjectId]=monitoring.config(this.defaultProjectId);
      let created = 0, updated = 0, unchanged = 0;
      this.failed = [];
      for (const row of rows) {
        const key = `${row.customerId}:${row.orderId}`;
        if (!row.customerId || !row.orderId || !Number.isFinite(row.updatedAt)) { this.failed.push(`${row.orderId || '未知运单'}：缺少源单标识或更新时间`); continue; }
        const existing = this.records[key];
        if (existing) {
          if (row.updatedAt <= existing.snapshot.updatedAt) { unchanged++; continue; }
          existing.snapshot = structuredClone(row);
          const local = monitoring.orders.find(order => order.id === existing.orderId);
          if (local) {
            local.sourceUpdatedAt = row.updatedAt;
            if (row.network === 'unregistered') monitoring.identifyUnregistered(local.id, '灵动车辆入网查询', '明确返回车辆未入网');
            monitoring.allLog(local, '配置', '已获取灵动源单新版本，保留源字段快照；本地状态、实际节点、路线及原项目归属不变，不回写灵动。');
          }
          updated++; continue;
        }
        const ok = monitoring.createOrder({ id: row.orderId, projectId: this.defaultProjectId, plate: row.plate, plateColor: 2, driver: row.driver, source: '灵动同步', sourceKey: key, sourceUpdatedAt: row.updatedAt,
          origin: row.origin, destination: row.destination, plannedDeparture: row.plannedDeparture, plannedArrival: row.plannedArrival,
          network: { status: row.network, checkedAt: monitoring.now, source: '灵动车辆入网查询', reason: row.network === 'unregistered' ? '明确返回车辆未入网' : '源接口返回车辆入网信息' } });
        if (!ok) { this.failed.push(`${row.orderId}：${monitoring.error}`); continue; }
        this.records[key] = { orderId: row.orderId, projectId: this.defaultProjectId, snapshot: structuredClone(row) }; created++;
      }
      this.lastSyncAt = monitoring.now; this.error = this.failed.length ? `${this.failed.length}条运单同步失败，详见失败原因` : '';
      this.summary = `新增${created}单，源单更新${updated}单，无变化${unchanged}单，失败${this.failed.length}单`;
      return !this.failed.length;
    },
    syncLatest(projects: Project[]) {
      if (this.busy) return false;
      this.busy = true;
      try { const ok = this.ingest(readLingdongSample(this.batch, usePhase1().now), projects); if (ok) this.batch++; return ok; }
      finally { this.busy = false; }
    },
  },
});
