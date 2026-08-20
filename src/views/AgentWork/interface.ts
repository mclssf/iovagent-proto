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

export type PageId =
  | 'agent'
  | 'analytics'
  | 'cargoQuotes'
  | 'cargoSources'
  | 'detail'
  | 'downloads'
  | 'longTasks'
  | 'orders'
  | 'privateCapacity'
  | 'projectCreate'
  | 'projects'
  | 'risk';
export type Tone = 'blue' | 'gray' | 'green' | 'orange' | 'purple' | 'red';

export type CargoSourceType = '客户系统' | 'Excel导入';
export type CargoStatus = '待完善' | '待发布' | '发布中' | '同步异常' | '已下架' | '已派车';
export type CargoPublishPlatform = '大卡' | '满帮';
export type CargoPublishStatus = '未发布' | '发布中' | '已下架' | '发布失败';
export type CooperationWindowDays = 30 | 60 | 90 | 180;

export interface CargoAddress {
  city: string;
  detail: string;
  district: string;
  latitude: number;
  longitude: number;
  province: string;
  regionCode: string;
}

export interface CargoPrice {
  chargeUnit: '趟' | '吨' | '方';
  depositFen: number;
  depositRefundable: boolean;
  findMode: '电议' | '一口价' | '指定司机';
  freightFen: number;
  paymentType: '到付' | '回单付' | '现付';
  showPrice: boolean;
}

export interface CargoPublication {
  accountName?: string;
  externalCargoId?: string;
  lastError?: string;
  platform: CargoPublishPlatform;
  publishedAt?: string;
  status: CargoPublishStatus;
  updatedAt: string;
}

export interface StandardCargo {
  cargoName: string;
  contactCount: number;
  createdAt: string;
  dispatcherName: string;
  dispatcherPhone: string;
  externalCargoNo: string;
  goodsType: string;
  id: string;
  loadAddresses: CargoAddress[];
  loadTimeEnd: string;
  loadTimeStart: string;
  maxVolume?: number;
  maxWeight?: number;
  minVolume?: number;
  minWeight?: number;
  packageType: string;
  platformPublications: CargoPublication[];
  price: CargoPrice;
  projectId: string;
  quoteCount: number;
  remark: string;
  sourceSystem: string;
  sourceType: CargoSourceType;
  sourceUpdatedAt: string;
  status: CargoStatus;
  syncMessage: string;
  syncStatus: '正常' | '待确认' | '异常';
  tags: string[];
  truckLengths: string[];
  truckNumber: number;
  truckTypes: string[];
  unloadAddresses: CargoAddress[];
  unloadTime?: string;
  updatedAt: string;
}

export interface CargoQuote {
  amountFen?: number;
  cargoId: string;
  comments: string[];
  createdAt: string;
  distanceKm: number;
  driverId: string;
  driverName: string;
  driverPhone: string;
  id: string;
  location: string;
  rating?: number;
  recentOrderCounts: Record<CooperationWindowDays, number>;
  sourcePlatform: CargoPublishPlatform;
  status: '待处理' | '已联系' | '已合作' | '已忽略';
  truckLength: string;
  truckNo: string;
  truckType: string;
  type: '抢单' | '报价' | '电话联系';
}

export interface PrivateCapacity {
  baseCity: string;
  carrierName: string;
  currentLocation: string;
  destinationProbability?: number;
  driverName: string;
  driverPhone: string;
  id: string;
  loadState: '空载' | '满载' | '即将空载' | '即将满载' | '未知';
  loadStateUpdatedAt: string;
  positionTime: string;
  predictedArrivalTime?: string;
  predictedDestination?: string;
  routes: string[];
  source: 'Excel导入';
  truckLength: string;
  truckNo: string;
  truckType: string;
  updatedAt: string;
}

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
