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
  mailbox?: ProjectMailbox;
}

export interface ProjectMailbox {
  address: string;
  status: 'bound';
  boundAt: number;
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
  | 'cargoSources'
  | 'cargoQuotes'
  | 'privateCapacity'
  | 'dailyTasks'
  | 'detail'
  | 'downloads'
  | 'knowledgeBase'
  | 'knowledgeBaseEmpty'
  | 'longTasks'
  | 'events'
  | 'phaseConfig'
  | 'orders'
  | 'projectCreate'
  | 'projects'
  | 'risk';
export type Tone = 'blue' | 'gray' | 'green' | 'orange' | 'purple' | 'red';

export type CargoSourceType = '客户系统' | 'Excel导入';
export type CargoStatus = '待完善' | '待发布' | '发布中' | '同步异常' | '已下架' | '已派车';
export type CargoPublishPlatform = '大卡' | '满帮';
export type CargoPublishStatus = '未发布' | '发布中' | '已下架' | '发布失败';

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
  recentOrderCount30: number;
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
  dailyTaskId?: string;
  pendingAsyncPrompt?: string;
  pendingCompliancePrompt?: string;
  pendingExperienceRoutePrompt?: string;
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
  description?: string;
  name: string;
  url: string;
}

export interface DownloadTask {
  scope: string;
  status: string;
  progress: number;
}
export type EmailOrderScenario = 'both' | 'arrival' | 'loading' | 'flexible' | 'duration';

export interface EmailOrderResult {
  scenario: EmailOrderScenario;
  subject: string;
  sender: string;
  senderName: string;
  mailbox: string;
  receivedAt: number;
  originalBody: string;
  order: {
    number?: string;
    origin: string;
    destination: string;
    cargo: { name: string; quantity: number; unit: string; weight: number; volume: number }[];
    handling: string;
    loadingTime?: string;
    arrivalRequirement?: string;
  };
  dispatch: {
    vehicle: string;
    count: number;
    totalWeight: number;
    totalVolume: number;
    allocation: string;
    reason: string;
  };
  market: {
    availableCount: number;
    radius: number;
    supply: string;
    difficulty: string;
    supplyReason: string;
    price: string;
    priceReason: string;
  };
  timing: {
    loadingStart: number;
    loadingEnd: number;
    arrivalStart: number;
    arrivalEnd: number;
    latestLoadingAt?: number;
    loadingSource: '客户要求' | '预计安排';
    arrivalSource: '客户要求' | '预计安排';
    basis: string;
  };
  reply: { subject: string; body: string; sentAt?: number };
}

export type P1SkillId = 'p1-status' | 'p1-parking' | 'p1-offline' | 'p1-deviation' | 'p1-late' | 'p1-weather';
export type P1State = 'pending' | 'loading' | 'in_transit' | 'arrived' | 'completed';
export type P1EventType = 'fence' | 'parking' | 'offline' | 'deviation' | 'weather';
export interface P1Config {
 version:number; selectedSkills:P1SkillId[];weather:{enabled:boolean};
 deviation:{enabled:boolean;radiusMeters:number;repeatMinutes:number};
 offline:{enabled:boolean;thresholdMinutes:number;repeatMinutes:number};
 parking:{enabled:boolean;thresholdMinutes:number;repeatMinutes:number};
 fenceTargets:('origin'|'destination')[];
 lateDeparture:{enabled:boolean;graceMinutes:number};lateArrival:{enabled:boolean;graceMinutes:number};
 statusUpdates:Exclude<P1State,'pending'>[];
}
export interface P1Place {name:string;lat:number;lon:number;radiusMeters:number;regionCode:string}
export interface P1Correction {at:number;reason:string;before:string;after:string;operator:string}
export interface P1Order {
 id:string;projectId:string;plate:string;plateColor:1|2;driver:string;source:string;
 origin:P1Place;destination:P1Place;plannedDeparture:number|null;plannedArrival:number|null;
 milestoneMethods?:Partial<Record<P1State,string>>;corrections?:P1Correction[];
 createdAt:number;state:P1State;enteredAt?:number;departedAt?:number;arrivedAt?:number;completedAt?:number;
 weatherRequestedAt?:number;weatherEffectiveAt?:number;weatherActiveLogged?:boolean;
 expiresAt:number;activateAt:number;config:P1Config;
 providerMode:'mock'|'whitepaper';
 session:'subscribing'|'active'|'paused'|'stopped'|'cleanup_pending';endReason:string;
 cleanupWillFail:boolean;cleanupAttempts:number;subscriptionRevision:number;deviationBlocked:boolean;
}
export interface P1Event {
 id:string;orderId:string;projectId:string;type:P1EventType;phase:'started'|'recovered'|'enter'|'exit';
 occurredAt:number;receivedAt:number;address:string;durationMinutes:number;distanceMeters:number;
 weatherType?:string;message?:string;sourceMessageId?:string;
 originalResult?:string;corrections?:P1Correction[];target?:'origin'|'destination';result:string;taskIds:P1SkillId[];configVersion:number;
}
export interface P1Anomaly {
 id:string;orderId:string;kind:'超时停车'|'在途离线'|'线路偏离'|'晚发'|'晚到'|'恶劣天气';
 status:'active'|'recovered'|'corrected';firstAt:number;lastAt:number;nextReminderAt:number;
 originalReason?:string;corrections?:P1Correction[];repeatCount:number;reason:string;deadlineAt?:number;eventId?:string;configVersion:number;taskId:P1SkillId;
}
export interface P1Log {id:string;projectId:string;orderId:string;taskId:P1SkillId;at:number;kind:'开始'|'基础事件'|'结果'|'提醒'|'恢复'|'结束'|'配置'|'失败';text:string}
