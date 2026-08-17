import { randomInt } from 'node:crypto'
import type { EyunClientLike } from './eyun-client.ts'
import type { EyunWebhookEvent } from './event-store.ts'

export type DemoIntent = 'location' | 'eta'

interface DemoAutomationOptions {
  targetWcid: string
  detailPageUrl: string
  eyunClient: EyunClientLike
}

interface RouteTemplate {
  origin: string
  destination: string
  totalKm: number
  goods: string
  quantityRange: [number, number]
  quantityUnit: string
  carrier: string
  plateProvince: string
  pois: string[]
}

export interface TransportRecord {
  orderNo: string
  plateNo: string
  carrier: string
  goods: string
  quantity: string
  origin: string
  destination: string
  plannedDeparture: Date
  actualDeparture: Date
  plannedArrival: Date
  estimatedArrival: Date
  actualArrival: string
  currentLocation: string
  lastLocatedAt: Date
  heading: string
  speedKph: number
  totalKm: number
  traveledKm: number
  remainingKm: number
  remainingMinutes: number
  progressPercent: number
  status: string
}

export interface DemoHandleResult {
  handled: boolean
  intent?: DemoIntent
  recipientId?: string
}

const ROUTES: RouteTemplate[] = [
  {
    origin: '上海市嘉定区金隅水泥厂',
    destination: '杭州市临安区青山湖仓',
    totalKm: 286,
    goods: 'P.O 42.5散装水泥',
    quantityRange: [28, 35],
    quantityUnit: '吨',
    carrier: '安捷物流',
    plateProvince: '沪',
    pois: ['G15沈海高速嘉定段', 'G60沪昆高速嘉兴服务区', 'G60沪昆高速桐乡段', '杭州绕城高速西复线', '临安区科技大道'],
  },
  {
    origin: '青岛市城阳区啤酒物流中心',
    destination: '济南市历城区华山配送仓',
    totalKm: 358,
    goods: '青岛啤酒经典装',
    quantityRange: [920, 1480],
    quantityUnit: '箱',
    carrier: '鲁通供应链',
    plateProvince: '鲁',
    pois: ['G20青银高速青岛段', '潍坊西服务区', 'G20青银高速淄博段', '济南东收费站', '历城区荷花路'],
  },
  {
    origin: '邢台市隆尧县今麦郎物流园',
    destination: '郑州市经开区食品配送中心',
    totalKm: 342,
    goods: '今麦郎方便面整箱',
    quantityRange: [760, 1260],
    quantityUnit: '箱',
    carrier: '智链顺达物流',
    plateProvince: '冀',
    pois: ['G4京港澳高速邢台段', '邯郸服务区', 'G4京港澳高速安阳段', '新乡服务区', '郑州南三环东延线'],
  },
  {
    origin: '苏州市工业园区制造基地',
    destination: '合肥市蜀山区零部件中心仓',
    totalKm: 414,
    goods: '汽车精密零部件',
    quantityRange: [18, 32],
    quantityUnit: '托',
    carrier: '华东联运',
    plateProvince: '苏',
    pois: ['G2京沪高速无锡段', '沪蓉高速常州段', '南京绕城高速', '滁州全椒服务区', '合肥绕城高速蜀山出口'],
  },
  {
    origin: '广州市黄埔区快消品仓',
    destination: '厦门市集美区商贸配送中心',
    totalKm: 648,
    goods: '常温饮料组合装',
    quantityRange: [980, 1560],
    quantityUnit: '箱',
    carrier: '南粤快运',
    plateProvince: '粤',
    pois: ['广河高速中新段', '济广高速惠州段', '甬莞高速潮州段', '沈海高速漳州段', '厦门集美大道'],
  },
]

const QUERY_PATTERN = /(查询|查一下|查查|帮我查|帮忙查|看一下|看看|追踪|跟踪|了解)/i
const SUBJECT_PATTERN = /(订单|运单|货单|货运单|托运单|运输单|车牌号|车牌|车辆|物流|货物|[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}|(?=[A-Z0-9-]{6,})(?=[A-Z0-9-]*\d)[A-Z0-9-]+)/i
const ETA_PATTERN = /(剩余里程|剩余距离|还剩多少公里|剩多少公里|还有多少公里|还有多少距离|还有多远|还要多久|还多长时间|预计到达时间|预计到达|预计多久到达|预计多久能到|多久到达|多久能到|几点到达|什么时候到达)/i
const LOCATION_PATTERN = /(当前位置|运输位置|实时位置|车辆位置|定位|位置|运输进度|当前进度|进度|运输情况|在途情况|当前情况|运输状态|当前状态|到哪了|走到哪了|现在在哪|在哪里)/i
const PLATE_PATTERN = /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/i
const ORDER_NUMBER_PATTERN = /(?:订单|运单|货单|货运单|托运单|运输单)(?:号|编号)?[：:#\s-]*([A-Z0-9][A-Z0-9-]{4,})/i

export const detectDemoIntent = (content: string): DemoIntent | undefined => {
  const normalized = content.replace(/\s+/g, '').toUpperCase()

  if (!QUERY_PATTERN.test(normalized) || !SUBJECT_PATTERN.test(normalized)) {
    return undefined
  }

  if (ETA_PATTERN.test(normalized)) {
    return 'eta'
  }

  if (LOCATION_PATTERN.test(normalized)) {
    return 'location'
  }

  return undefined
}

export const generateTransportRecord = (query: string, now = new Date()): TransportRecord => {
  const route = pick(ROUTES)
  const progress = randomDecimal(0.24, 0.84)
  const traveledKm = Math.round(route.totalKm * progress)
  const remainingKm = route.totalKm - traveledKm
  const averageCompletedSpeed = randomDecimal(48, 63)
  const elapsedBreakHours = randomDecimal(0.2, route.totalKm > 500 ? 1.8 : 1.1)
  const elapsedHours = traveledKm / averageCompletedSpeed + elapsedBreakHours
  const actualDeparture = addMinutes(now, -Math.round(elapsedHours * 60))
  const departureDelayMinutes = randomInteger(-18, 72)
  const plannedDeparture = addMinutes(actualDeparture, -departureDelayMinutes)
  const plannedTransitHours = route.totalKm / 57 + (route.totalKm > 500 ? 1.4 : 0.7)
  const plannedArrival = addMinutes(plannedDeparture, Math.round(plannedTransitHours * 60))
  const futureSpeed = randomDecimal(50, 67)
  const futureBreakHours = route.totalKm > 500 ? randomDecimal(0.3, 1.2) : randomDecimal(0.1, 0.6)
  const remainingMinutes = Math.max(35, Math.round((remainingKm / futureSpeed + futureBreakHours) * 60))
  const estimatedArrival = addMinutes(now, remainingMinutes)
  const arrivalDeltaMinutes = Math.round((estimatedArrival.getTime() - plannedArrival.getTime()) / 60_000)
  const poiIndex = Math.min(route.pois.length - 1, Math.floor(progress * route.pois.length))

  return {
    orderNo: extractReference(query) || generateOrderNo(now),
    plateNo: PLATE_PATTERN.exec(query)?.[0].toUpperCase() || generatePlateNo(route.plateProvince),
    carrier: route.carrier,
    goods: route.goods,
    quantity: `${randomInteger(route.quantityRange[0], route.quantityRange[1])}${route.quantityUnit}`,
    origin: route.origin,
    destination: route.destination,
    plannedDeparture,
    actualDeparture,
    plannedArrival,
    estimatedArrival,
    actualArrival: '未到达',
    currentLocation: route.pois[poiIndex],
    lastLocatedAt: addMinutes(now, -randomInteger(1, 8)),
    heading: pick(['东向', '东南向', '南向', '西南向', '西向', '北向']),
    speedKph: randomInteger(48, 86),
    totalKm: route.totalKm,
    traveledKm,
    remainingKm,
    remainingMinutes,
    progressPercent: Math.round(progress * 100),
    status: buildStatus(arrivalDeltaMinutes),
  }
}

export const formatLocationReply = (record: TransportRecord, detailPageUrl: string): string => [
  '已查询到在途运输记录',
  `运单号：${record.orderNo}`,
  `车牌号：${record.plateNo}`,
  `承运商：${record.carrier}`,
  `货物：${record.goods}（${record.quantity}）`,
  `装货地：${record.origin}`,
  `卸货地：${record.destination}`,
  `计划发车：${formatDateTime(record.plannedDeparture)}`,
  `实际发车：${formatDateTime(record.actualDeparture)}`,
  `计划到达：${formatDateTime(record.plannedArrival)}`,
  `预计到达：${formatDateTime(record.estimatedArrival)}`,
  `实际到达：${record.actualArrival}`,
  `当前状态：${record.status}`,
  `当前位置：${record.currentLocation}`,
  `定位时间：${formatDateTime(record.lastLocatedAt)}`,
  `行驶方向：${record.heading}，车速约 ${record.speedKph} km/h`,
  `运输进度：${record.traveledKm}/${record.totalKm} km（${record.progressPercent}%）`,
  '',
  `查看运输详情：${detailPageUrl}`,
].join('\n')

export const formatEtaReply = (record: TransportRecord, detailPageUrl: string): string => [
  '已查询到预计到达信息',
  `运单号：${record.orderNo}`,
  `车牌号：${record.plateNo}`,
  `运输线路：${record.origin} → ${record.destination}`,
  `货物：${record.goods}（${record.quantity}）`,
  `当前位置：${record.currentLocation}`,
  `剩余里程：约 ${record.remainingKm} km`,
  `预计还需：${formatDuration(record.remainingMinutes)}`,
  `预计到达：${formatDateTime(record.estimatedArrival)}`,
  `运输状态：${record.status}`,
  `最近定位：${formatDateTime(record.lastLocatedAt)}`,
  '',
  `查看运输详情：${detailPageUrl}`,
].join('\n')

export class DemoWechatAutomation {
  private readonly targetWcid: string
  private readonly detailPageUrl: string
  private readonly eyunClient: EyunClientLike

  constructor(options: DemoAutomationOptions) {
    this.targetWcid = options.targetWcid
    this.detailPageUrl = options.detailPageUrl
    this.eyunClient = options.eyunClient
  }

  async handle(event: EyunWebhookEvent): Promise<DemoHandleResult> {
    const data = event.data
    const fromUser = typeof data?.fromUser === 'string' ? data.fromUser : undefined
    const content = typeof data?.content === 'string' ? data.content : undefined
    const isSelf = data?.self === true
    const isPrivateText = event.messageType === '60001' || event.msgType === 'PRIVATE_TEXT'

    if (!isPrivateText || isSelf || fromUser !== this.targetWcid || !content) {
      return { handled: false }
    }

    const intent = detectDemoIntent(content)

    if (!intent) {
      return { handled: false }
    }

    const record = generateTransportRecord(content)
    const reply = intent === 'eta'
      ? formatEtaReply(record, this.detailPageUrl)
      : formatLocationReply(record, this.detailPageUrl)

    await this.eyunClient.sendText(fromUser, reply)

    return { handled: true, intent, recipientId: fromUser }
  }
}

const extractReference = (query: string): string | undefined => {
  const plate = PLATE_PATTERN.exec(query)?.[0]

  if (plate) {
    return `YT${new Date().getFullYear()}${randomInteger(100000, 999999)}`
  }

  return ORDER_NUMBER_PATTERN.exec(query)?.[1]?.toUpperCase()
}

const generateOrderNo = (now: Date): string => {
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `YT${date}${randomInteger(1000, 9999)}`
}

const generatePlateNo = (province: string): string => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const suffixCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
  const city = letters[randomInteger(0, letters.length - 1)]
  let suffix = ''

  for (let index = 0; index < 5; index += 1) {
    suffix += suffixCharacters[randomInteger(0, suffixCharacters.length - 1)]
  }

  return `${province}${city}${suffix}`
}

const buildStatus = (arrivalDeltaMinutes: number): string => {
  if (arrivalDeltaMinutes > 60) {
    return `运输中 · 预计晚点约 ${Math.min(arrivalDeltaMinutes, 180)} 分钟`
  }

  if (arrivalDeltaMinutes < -30) {
    return `运输中 · 预计提前约 ${Math.min(Math.abs(arrivalDeltaMinutes), 120)} 分钟`
  }

  return '运输中 · 时效正常'
}

const formatDateTime = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours === 0) {
    return `${remainingMinutes} 分钟`
  }

  return `${hours} 小时 ${remainingMinutes} 分钟`
}

const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000)

const randomInteger = (minimum: number, maximum: number): number =>
  randomInt(Math.ceil(minimum), Math.floor(maximum) + 1)

const randomDecimal = (minimum: number, maximum: number): number =>
  minimum + (randomInt(0, 10_001) / 10_000) * (maximum - minimum)

const pick = <T>(values: readonly T[]): T => values[randomInteger(0, values.length - 1)]
