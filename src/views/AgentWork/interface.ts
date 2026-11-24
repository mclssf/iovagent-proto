import type { AreaType } from './views/knowledgeBase/mockData';

/** 对话内待确认的敏感区域点位（由用户输入的经纬度 + 范围解析而来） */
export interface SensitiveAreaDraft {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** 敏感半径（米） */
  radiusM: number;
  areaType: AreaType;
  stayThresholdMin: number;
  region: string;
  address: string;
  remark: string;
  /** pending 待用户确认｜confirmed 已入库｜cancelled 已取消 */
  resolveState: 'pending' | 'confirmed' | 'cancelled';
  /** 原始输入，便于追溯 */
  rawInput: string;
  /** 来源：text 对话文本｜file Excel/CSV 附件 */
  origin: 'text' | 'file';
  /** Excel 行号（origin=file 时有值），便于对账 */
  sourceRow?: number;
  /** 与批次内哪一条坐标重复（1 起，0 表示不重复） */
  duplicateOf?: number;
  /** 解析失败原因（有值时该条不参与入库，仅在卡片里列出供人工核对） */
  parseError?: string;
}

export interface Project {
  id: string;
  name: string;
  status: string;
  sync: string;
  total: number;
  risk: number;
  tmsUrl: string;
  tmsUser: string;
  keyword: string;
  statusFilter: string;
  skillIds?: string[];
}

export interface AgentConversation {
  id: string;
  messages: ChatMessage[];
  title: string;
  updatedAt: string;
}

export type AgentWorkspaceMode = 'conversation' | 'project';

export type TmsSyncCustomerStatus = '已处理' | '未处理';

export interface TmsSyncCustomer {
  account: string;
  enterpriseCid: string;
  id: string;
  password: string;
  processedAt?: string;
  processedBy?: string;
  status: TmsSyncCustomerStatus;
  submittedAt: string;
  systemUrl: string;
  userPhone: string;
}

export type PageId = 'agent' | 'analytics' | 'detail' | 'downloads' | 'knowledgeBase' | 'knowledgeBaseEmpty' | 'longTasks' | 'orders' | 'projectCreate' | 'projects' | 'risk';
export type Tone = 'blue' | 'gray' | 'green' | 'orange' | 'purple' | 'red';

export interface Order {
  id: string;
  plate: string;
  driver: string;
  carrier: string;
  route: string;
  factory: string;
  status: string;
  risk: string;
  issue: string;
  source: string;
  startTime: string;
  updated: string;
  eta: string;
}

export interface TimelineEvent {
  id: number;
  type: 'normal' | 'risk' | 'stop';
  title: string;
  time: string;
  place: string;
  desc: string;
  rule?: string;
  agent?: string;
  stopPlace?: string;
  agentVerdict?: string;
  agentTone?: Tone;
}

export interface ChatMessage {
  role: 'agent' | 'user';
  text: string;
  title?: string;
  status?: string;
  result?: string;
  activeStepIndex?: number;
  file?: AgentResultFile;
  link?: AgentResultLink;
  progressMode?: boolean;
  sources?: { name: string; summary: string; format?: string }[];
  /** 敏感区域录入：对话内嵌确认卡的数据（数组，支持一次批量十几个点位） */
  sensitiveAreaDrafts?: SensitiveAreaDraft[];
  steps?: {
    title: string;
    text: string;
    skill?: string;
  }[];
}

export interface AgentResultLink {
  description?: string;
  kind?: 'analysisReport' | 'externalH5';
  label: string;
  prompt?: string;
  title: string;
  topic?: string;
  url: string;
}

export interface AgentResultFile {
  name: string;
  url: string;
}

export interface DownloadTask {
  scope: string;
  status: string;
  progress: number;
}
