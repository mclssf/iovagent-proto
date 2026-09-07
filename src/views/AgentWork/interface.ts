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
