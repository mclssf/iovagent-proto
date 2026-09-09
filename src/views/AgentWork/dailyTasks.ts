import type { Order } from './interface';

export type MonitorId = 'loading' | 'unloading' | 'parking' | 'offline' | 'deviation' | 'fence';
export type WaybillPhase = '装货前' | '装货开始' | '装货结束' | '行程在途' | '卸货开始' | '卸货结束';
export type EventType = 'loading-start' | 'loading-end' | 'unloading-start' | 'unloading-end' | 'parking' | 'offline' | 'deviation' | 'fence-enter' | 'fence-exit';

export const waybillPhases: WaybillPhase[] = ['装货前', '装货开始', '装货结束', '行程在途', '卸货开始', '卸货结束'];
export const requiredMonitorSkillIds = ['loading-event-expert', 'unloading-event-expert'];
export const ensureRequiredMonitorSkills = (ids: string[] = []) => [...new Set([...requiredMonitorSkillIds, ...ids])];

export const monitorDefinitions: { id: MonitorId; name: string; skillId: string; required: boolean; seconds: number; description: string; icon: 'upload' | 'download' | 'truck' | 'alert' | 'route' | 'locate' }[] = [
  { id: 'loading', name: '装货事件判断', skillId: 'loading-event-expert', required: true, seconds: 60, description: '识别装货开始、结束，驱动运单进入行程在途状态。', icon: 'upload' },
  { id: 'unloading', name: '卸货事件判断', skillId: 'unloading-event-expert', required: true, seconds: 60, description: '识别卸货开始、结束，完成运单状态流转。', icon: 'download' },
  { id: 'parking', name: '在途停车异常判断', skillId: 'parking-event-expert', required: false, seconds: 120, description: '分析在途停靠时长和地点，产生停车异常事件。', icon: 'truck' },
  { id: 'offline', name: '车机掉线判断', skillId: 'device-offline-expert', required: false, seconds: 180, description: '核验最后定位和设备心跳，产生车机掉线事件。', icon: 'alert' },
  { id: 'deviation', name: '轨迹偏移判断', skillId: 'route-deviation-expert', required: false, seconds: 120, description: '对比计划路线与有效轨迹，产生轨迹偏移事件。', icon: 'route' },
  { id: 'fence', name: '自定义围栏判断', skillId: 'custom-fence-expert', required: false, seconds: 0, description: '订阅车辆进入、离开自定义区域的围栏事件。', icon: 'locate' },
];

export const eventDefinitions: { id: EventType; name: string; monitor: MonitorId }[] = [
  { id: 'parking', name: '在途停车异常', monitor: 'parking' },
  { id: 'offline', name: '车辆车机掉线', monitor: 'offline' },
  { id: 'loading-start', name: '装货开始', monitor: 'loading' },
  { id: 'loading-end', name: '装货结束', monitor: 'loading' },
  { id: 'unloading-start', name: '卸货开始', monitor: 'unloading' },
  { id: 'unloading-end', name: '卸货结束', monitor: 'unloading' },
  { id: 'deviation', name: '轨迹偏移', monitor: 'deviation' },
  { id: 'fence-enter', name: '进入自定义围栏', monitor: 'fence' },
  { id: 'fence-exit', name: '离开自定义围栏', monitor: 'fence' },
];

export interface ProjectFence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

export interface MonitorRuntime {
  id: MonitorId;
  runs: number;
  events: number;
  lastRun: number | null;
  nextRun: number;
}

export interface MonitoredOrder {
  id: string;
  plate: string;
  driver: string;
  phone: string;
  route: string;
  phase: WaybillPhase;
  phaseChangedAt: number;
}

export interface WaybillEvent {
  id: string;
  projectId: string;
  type: EventType;
  occurredAt: number;
  source: 'poll' | 'callback' | 'test';
  order: MonitoredOrder;
  detail: string;
  value: number;
  fenceId?: string;
}

export interface DailyTaskDraft {
  name: string;
  trigger: 'event' | 'schedule';
  eventType: EventType;
  threshold: number;
  fenceId: string;
  time: string;
  prompt: string;
  confirmBeforeSend: boolean;
}

export interface DailyTask extends DailyTaskDraft {
  id: string;
  projectId: string;
  enabled: boolean;
  createdAt: number;
  lastScheduledDay: string;
  runs: TaskRun[];
}

export interface TaskRun {
  id: string;
  startedAt: number;
  finishedAt?: number;
  source: 'event' | 'schedule' | 'test';
  status: 'running' | 'waiting' | 'complete' | 'cancelled';
  event?: WaybillEvent;
  prompt: string;
  steps: { title: string; text: string; tool?: string }[];
  activeStep: number;
  nextStepAt: number;
  result: string;
  action?: { channel: '短信' | '邮件'; recipient: string; content: string; status: 'pending' | 'sent' | 'cancelled' };
}

export interface ProjectTaskRuntime {
  projectId: string;
  connected: boolean;
  total: number;
  skillIds: string[];
  startedAt: number;
  monitors: MonitorRuntime[];
  fences: ProjectFence[];
  orders: MonitoredOrder[];
  events: WaybillEvent[];
  processedEventIds: string[];
}

export function createMonitoredOrders(orders: Order[]): MonitoredOrder[] {
  return orders.slice(0, 6).map((order, index) => ({
    id: order.id, plate: order.plate, driver: order.driver, route: order.route,
    phone: `138****${String(6200 + index * 113)}`,
    phase: waybillPhases[index % waybillPhases.length]!,
    phaseChangedAt: Date.now(),
  }));
}

export const eventLabel = (type: EventType) => eventDefinitions.find((event) => event.id === type)?.name ?? type;
export const isThresholdEvent = (type: EventType) => ['parking', 'offline', 'deviation'].includes(type);

export function triggerLabel(task: DailyTaskDraft, fences: ProjectFence[] = []) {
  if (task.trigger === 'schedule') return `每天 ${task.time}`;
  const threshold = isThresholdEvent(task.eventType) ? ` ≥ ${task.threshold} ${task.eventType === 'deviation' ? '公里' : '分钟'}` : '';
  const fence = task.eventType.startsWith('fence-') ? ` · ${fences.find((item) => item.id === task.fenceId)?.name ?? '未配置围栏'}` : '';
  return `${eventLabel(task.eventType)}${threshold}${fence}`;
}

export function formatTaskTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(value);
}

export function taskDuration(milliseconds: number) {
  if (milliseconds < 60000) return `${Math.max(0, Math.round(milliseconds / 1000))} 秒`;
  if (milliseconds < 3600000) return `${Math.floor(milliseconds / 60000)} 分钟`;
  if (milliseconds < 86400000) return `${Math.floor(milliseconds / 3600000)} 小时`;
  return `${Math.floor(milliseconds / 86400000)} 天`;
}
