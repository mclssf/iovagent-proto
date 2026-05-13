export type ProjectStatus = '已连接' | '授权失效' | '连接中';
export type OrderStatus = '在途' | '装货中' | '已到货' | '已完成';
export type RiskLevel = '高风险' | '低风险' | '无风险';
export type RiskSource = '规则预警' | '智能轨迹分析' | 'GPS分析' | '规则预警 + GPS分析' | '无';
export type TimelineType = 'normal' | 'stop' | 'risk' | 'arrive';

export interface ThresholdConfig {
  stopMinutes: number;
  loadingOvertimeMinutes: number;
  unloadingOvertimeMinutes: number;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  sync: string;
  total: number;
  risk: number;
  tmsUrl: string;
  tmsUser: string;
  keyword: string;
  statusFilter: OrderStatus | '全部';
  thresholds: ThresholdConfig;
}

export interface Order {
  id: string;
  projectId: string;
  plate: string;
  driver: string;
  carrier: string;
  route: string;
  factory: string;
  origin: string;
  destination: string;
  status: OrderStatus;
  risk: RiskLevel;
  issue: string;
  issueType: string;
  source: RiskSource;
  updated: string;
  eta: string;
  departTime: string;
  arriveTime?: string;
  delayMinutes: number;
  stopCount: number;
  gpsRiskScore: number;
}

export interface TimelineEvent {
  id: number;
  orderId: string;
  type: TimelineType;
  title: string;
  time: string;
  place: string;
  desc: string;
  rule?: string;
  agent?: string;
  poiType?: string;
  reasonable?: boolean;
}

export interface DownloadTask {
  id: string;
  fileName: string;
  scope: string;
  creator: string;
  status: '生成中' | '已完成' | '失败';
  progress: number;
  createdAt: string;
}

export interface AgentMessage {
  id: string;
  role: 'agent' | 'user';
  text: string;
  skill?: string;
}
