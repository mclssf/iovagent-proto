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
}
export type PageId = 'agent' | 'analytics' | 'detail' | 'downloads' | 'orders' | 'projects' | 'risk';
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
  steps?: {
    title: string;
    text: string;
  }[];
}

export interface DownloadTask {
  scope: string;
  status: string;
  progress: number;
}
