<script lang="ts" setup>
import { ref } from 'vue';
import { usePhase1 } from '@/pinia/phase1';
import type { P1Place, P1Stop } from '@/views/AgentWork/interface';
import { parseLocal } from './catalog';
import { loadAMap } from '@/utils/amap';

interface InputStop { name: string; lat?: number; lon?: number; plannedAt?: string }
interface InputOrder { id: string; plate: string; driver: string; loadType: '整车' | '零担'; vehicles?: string[]; loading: InputStop[]; unloading: InputStop[]; customFields?: Record<string, string> }
const props = defineProps<{ projectId: string }>();
const monitoring = usePhase1();
const mode = ref<'api' | 'table'>('api');
const customFieldNames = ref(localStorage.getItem(`iovagent-v3-custom-fields-${props.projectId}`) || '客户名称、承运商、货物信息');
const payload = ref(JSON.stringify([{ id: 'WB-IMPORT-001', plate: '苏A55888、冀A10203', driver: '张师傅、李师傅', loadType: '零担', vehicles: ['苏A55888', '冀A10203'], loading: [{ name: '苏州工业园集货仓', lat: 31.32, lon: 120.75, plannedAt: '2026-11-14 09:00' }, { name: '无锡新区周转仓', lat: 31.55, lon: 120.3, plannedAt: '2026-11-14 11:00' }], unloading: [{ name: '南京江宁一号仓', lat: 31.95, lon: 118.8, plannedAt: '2026-11-14 16:00' }], customFields: { 客户名称: '演示客户', 货物信息: '家电' } }], null, 2));
const feedback = ref('');
const importing = ref(false);
function saveFieldConfig() { localStorage.setItem(`iovagent-v3-custom-fields-${props.projectId}`, customFieldNames.value); feedback.value = '自定义展示字段已保存；仅对后续导入运单生效。'; }
function stopCell(value: string): InputStop[] { return value.split(';').map(item => item.trim()).filter(Boolean).map(item => { const [name, lat, lon, plannedAt] = item.split('|'); return { name: name?.trim() ?? '', lat: lat ? Number(lat) : undefined, lon: lon ? Number(lon) : undefined, plannedAt: plannedAt?.trim() }; }); }
function rows(): InputOrder[] {
  if (mode.value === 'api') { const parsed: unknown = JSON.parse(payload.value); if (!Array.isArray(parsed)) throw new Error('接口数据需要 JSON 数组。'); return parsed as InputOrder[]; }
  const lines = payload.value.trim().split(/\r?\n/).filter(Boolean);
  const header = lines.shift()?.split('\t') ?? [];
  for (const field of ['id', 'plate', 'driver', 'loadType', 'loading', 'unloading']) if (!header.includes(field)) throw new Error(`表格缺少 ${field} 列。`);
  return lines.map(line => { const cells = line.split('\t'); const get = (field: string) => cells[header.indexOf(field)] ?? ''; return { id: get('id'), plate: get('plate'), driver: get('driver'), loadType: get('loadType') as InputOrder['loadType'], vehicles: get('vehicles') ? get('vehicles').split(/[、,，]/).map(item => item.trim()) : undefined, loading: stopCell(get('loading')), unloading: stopCell(get('unloading')), customFields: get('customFields') ? JSON.parse(get('customFields')) as Record<string,string> : undefined }; });
}
async function resolveStop(stop: InputStop): Promise<P1Place> {
  if (!stop?.name?.trim()) throw new Error('装卸货点名称不能为空。');
  let lat = stop.lat;
  let lon = stop.lon;
  const confirmed = JSON.parse(localStorage.getItem('iovagent-v3-poi-confirmed') || '[]') as { name: string; lat: number; lng: number }[];
  const existing = confirmed.find(item => item.name === stop.name.trim());
  if (existing && (!Number.isFinite(lat) || !Number.isFinite(lon))) { lat = existing.lat; lon = existing.lng; }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const amap = await loadAMap(['AMap.Geocoder']);
    type GeocodeResult = { geocodes?: { location?: { getLat: () => number; getLng: () => number } }[] };
    const geocoder = new (amap as typeof AMap & { Geocoder: new (options: { city: string }) => { getLocation: (name: string, callback: (status: string, result: GeocodeResult) => void) => void } }).Geocoder({ city: '全国' });
    [lon, lat] = await new Promise<[number, number]>((resolve, reject) => geocoder.getLocation(stop.name, (status, result) => { const location = result.geocodes?.[0]?.location; status === 'complete' && location ? resolve([location.getLng(), location.getLat()]) : reject(new Error(`${stop.name} 地址解析失败，请提供坐标后重试。`)); }));
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat!) > 90 || Math.abs(lon!) > 180) throw new Error(`${stop.name} 坐标无效。`);
  return { name: stop.name.trim(), lat: lat!, lon: lon!, radiusMeters: 5000, regionCode: 'DEMO', coordinateSystem: 'gcj02' };
}
function queuePoi(place: P1Place, role: P1Stop['role']) {
  const key = 'iovagent-v3-poi-candidates';
  const confirmed = JSON.parse(localStorage.getItem('iovagent-v3-poi-confirmed') || '[]') as { name: string }[];
  if (confirmed.some(item => item.name === place.name)) return;
  const saved = JSON.parse(localStorage.getItem(key) || '[]') as { id: string; name: string; [key: string]: unknown }[];
  if (saved.some(item => item.name === place.name)) return;
  saved.push({ id: `P-IMPORT-${Date.now()}-${saved.length}`, name: place.name, type: role === 'loading' ? 'shipper' : 'consignee', industry: '待识别', count: 0, lat: place.lat, lng: place.lon, address: '运单导入解析候选', status: '待客户确认', source: '批量导入' });
  localStorage.setItem(key, JSON.stringify(saved));
}
async function importOrders() {
  importing.value = true;
  try {
    const records = rows();
    if (!records.length) throw new Error('没有可导入的运单。');
    const ids = records.map(item => item.id?.trim());
    if (ids.some(id => !id) || new Set(ids).size !== ids.length || ids.some(id => monitoring.orders.some(order => order.id === id))) throw new Error('运单号为空、重复或已存在。');
    const drafts = [];
    for (const record of records) {
      if (!['整车', '零担'].includes(record.loadType) || !record.loading?.length || !record.unloading?.length || !record.plate?.trim()) throw new Error(`${record.id} 缺少配载类型、车辆或装卸货点。`);
      const configured = new Set((localStorage.getItem(`iovagent-v3-custom-fields-${props.projectId}`) || '客户名称、承运商、货物信息').split(/[、,，]/).map(item => item.trim()).filter(Boolean));
      const extraField = Object.keys(record.customFields ?? {}).find(label => !configured.has(label));
      if (extraField) throw new Error(`${record.id} 的扩展字段“${extraField}”尚未配置，请先加入自定义展示字段。`);
      const rawStops = [...record.loading.map(stop => ({ ...stop, role: 'loading' as const })), ...record.unloading.map(stop => ({ ...stop, role: 'unloading' as const }))];
      const stops: P1Stop[] = [];
      for (const [index, stop] of rawStops.entries()) {
        const place = await resolveStop(stop);
        const plannedAt = stop.plannedAt ? parseLocal(stop.plannedAt) : undefined;
        if (plannedAt !== undefined && !Number.isFinite(plannedAt)) throw new Error(`${record.id} 的 ${stop.name} 计划时间无效。`);
        stops.push({ id: `${record.id}-stop-${index + 1}`, sequence: index + 1, role: stop.role, place, plannedAt });
      }
      drafts.push({ id: record.id, projectId: props.projectId, plate: record.plate, plateColor: 2 as const, driver: record.driver || '未提供', source: mode.value === 'api' ? '接口同步演示' : '表格导入演示', origin: stops[0]!.place, destination: stops[stops.length - 1]!.place, plannedDeparture: null, plannedArrival: null, loadType: record.loadType, stops, vehicleSegments: (record.vehicles?.length ? record.vehicles : record.plate.split('、')).map((plate, index) => ({ plate, sequence: index + 1 })), customFields: Object.entries(record.customFields ?? {}).map(([label, value]) => ({ label, value: String(value) })) });
    }
    let count = 0;
    for (const draft of drafts) if (monitoring.createOrder(draft)) { count++; draft.stops.forEach(stop => queuePoi(stop.place, stop.role)); }
    feedback.value = count === drafts.length ? `已导入 ${count} 条运单；装卸货点已加入知识库待确认，零担运单等待调度单统一监控。` : `已导入 ${count} 条；${monitoring.error}`;
  } catch (error) { feedback.value = error instanceof Error ? error.message : '导入数据无法解析。'; }
  finally { importing.value = false; }
}
function switchMode(value: 'api' | 'table') {
  mode.value = value;
  payload.value = value === 'api' ? JSON.stringify([{ id: 'WB-IMPORT-001', plate: '苏A55888', driver: '张师傅', loadType: '零担', loading: [{ name: '苏州工业园集货仓', lat: 31.32, lon: 120.75, plannedAt: '2026-11-14 09:00' }], unloading: [{ name: '南京江宁一号仓', lat: 31.95, lon: 118.8, plannedAt: '2026-11-14 16:00' }], customFields: { 客户名称: '演示客户' } }], null, 2) : 'id\tplate\tdriver\tloadType\tvehicles\tloading\tunloading\tcustomFields\nWB-IMPORT-002\t苏A55888\t张师傅\t零担\t苏A55888\t苏州工业园集货仓|31.32|120.75|2026-11-14 09:00\t南京江宁一号仓|31.95|118.8|2026-11-14 16:00\t{"客户名称":"演示客户"}';
  feedback.value = '';
}
</script>

<template>
  <section class="waybill-import-demo" aria-label="接口和表格运单导入演示">
    <div class="waybill-import-head"><strong>接口 / 表格运单导入演示</strong><span>仅在本地原型中生成运单，不连接客户系统</span></div>
    <label>数据格式<select :value="mode" @change="switchMode(($event.target as HTMLSelectElement).value as 'api' | 'table')"><option value="api">接口 JSON</option><option value="table">表格粘贴（制表符分隔）</option></select></label>
    <label>自定义展示字段（用顿号分隔）<span class="waybill-import-config"><input v-model="customFieldNames" aria-label="自定义展示字段" placeholder="客户名称、承运商、货物信息" /><button type="button" @click="saveFieldConfig">保存字段配置</button></span></label>
    <label>运单数据<textarea v-model="payload" rows="7" spellcheck="false" aria-label="运单导入数据" /></label>
    <p>装卸货点支持多点顺序及各点计划时间；车辆按输入顺序记录；自定义字段仅用于展示和问答。只有地点名称时尝试高德地址解析，候选 POI 待客户确认。</p>
    <div><button type="button" :disabled="importing" @click="importOrders">{{ importing ? '正在解析…' : '演示导入' }}</button><span v-if="feedback" role="status">{{ feedback }}</span></div>
  </section>
</template>

<style scoped>
.waybill-import-demo{display:grid;gap:10px;padding:14px 16px;border-bottom:1px solid #e2e2dc;background:#fbfcfd;font-size:12px;color:#334155}.waybill-import-head{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}.waybill-import-head span,.waybill-import-demo p{color:#64748b;font-size:11px}.waybill-import-demo label{display:grid;gap:5px}.waybill-import-demo select,.waybill-import-demo textarea{border:1px solid #cbd5e1;border-radius:5px;background:#fff;padding:7px;color:#172b4d}.waybill-import-demo textarea{width:100%;font:11px/1.5 ui-monospace,monospace;resize:vertical}.waybill-import-demo>div:last-child{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.waybill-import-demo button{border:1px solid #2563eb;border-radius:5px;background:#2563eb;color:#fff;padding:6px 12px}.waybill-import-demo button:disabled{opacity:.55}
.waybill-import-config{display:flex;gap:8px}.waybill-import-config input{min-width:0;flex:1;border:1px solid #cbd5e1;border-radius:5px;padding:6px 8px}.waybill-import-config button{white-space:nowrap}
</style>
