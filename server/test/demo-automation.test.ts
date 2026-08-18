import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DemoWechatAutomation,
  detectDemoIntent,
  detectDemoRequest,
  extractQueryIdentity,
  generateTransportRecord,
} from '../src/demo-automation.ts'
import type {
  EyunClientLike,
  EyunOnlineData,
  EyunResponse,
  EyunSentMessage,
} from '../src/eyun-client.ts'

const sentMessages: Array<{ recipientId: string; content: string }> = []
const fakeClient: EyunClientLike = {
  async isOnline(): Promise<EyunResponse<EyunOnlineData>> {
    return { code: '1000', message: 'success', data: { isOnline: true } }
  },
  async sendText(recipientId: string, content: string): Promise<EyunResponse<EyunSentMessage>> {
    sentMessages.push({ recipientId, content })
    return {
      code: '1000',
      message: 'success',
      data: { type: 1, msgId: 1, newMsgId: 2, createTime: 3, wcId: recipientId },
    }
  },
  async setWebhook(): Promise<EyunResponse<null>> {
    return { code: '1000', message: 'success', data: null }
  },
}

const createAutomation = (delays: number[] = [], randomDelayMs = 4200): DemoWechatAutomation =>
  new DemoWechatAutomation({
    targetWcid: 'mengchen272091',
    detailPageUrl: 'https://example.com/demo/transport',
    eyunClient: fakeClient,
    delay: async (milliseconds) => {
      delays.push(milliseconds)
    },
    randomDelayMs: () => randomDelayMs,
  })

test('recognizes location and ETA query variants', () => {
  assert.equal(detectDemoIntent('帮我查询订单YT202608170001现在到哪了'), 'location')
  assert.equal(detectDemoIntent('查一下运单还剩多少公里'), 'eta')
  assert.equal(detectDemoIntent('查询沪A12345预计多久到达'), 'eta')
  assert.equal(detectDemoIntent('今天天气怎么样'), undefined)

  assert.deepEqual(detectDemoRequest('查询订单位置'), { kind: 'followUp', intent: 'location' })
  assert.deepEqual(detectDemoRequest('帮我查运单还剩多少公里'), { kind: 'followUp', intent: 'eta' })
})

test('preserves the reference type and value from the user query', () => {
  assert.deepEqual(extractQueryIdentity('查询订单DD202608180001当前位置')?.businessReference, {
    kind: '订单号',
    value: 'DD202608180001',
  })
  assert.deepEqual(extractQueryIdentity('查询运单YD202608180001还有多远')?.businessReference, {
    kind: '运单号',
    value: 'YD202608180001',
  })
  assert.deepEqual(extractQueryIdentity('查询货单HD202608180001进度')?.businessReference, {
    kind: '货单号',
    value: 'HD202608180001',
  })
  assert.equal(extractQueryIdentity('查询沪A12345当前定位')?.plateNo, '沪A12345')
})

test('generated transport values remain internally reasonable', () => {
  const now = new Date('2026-08-17T12:00:00+08:00')
  const record = generateTransportRecord('查询订单YT202608170001的位置', now)

  assert.equal(record.orderNo, 'YT202608170001')
  assert.ok(record.traveledKm > 0)
  assert.ok(record.remainingKm > 0)
  assert.equal(record.traveledKm + record.remainingKm, record.totalKm)
  assert.ok(record.progressPercent >= 24 && record.progressPercent <= 84)
  assert.ok(record.actualDeparture.getTime() < now.getTime())
  assert.ok(record.estimatedArrival.getTime() > now.getTime())
})

test('only the configured private sender triggers an automatic reply', async () => {
  sentMessages.length = 0
  const delays: number[] = []
  const automation = createAutomation(delays)
  const ignored = await automation.handle({
    messageType: '60001',
    msgType: 'PRIVATE_TEXT',
    data: { fromUser: 'another-user', content: '查询订单位置', self: false },
  })
  const handled = await automation.handle({
    messageType: '60001',
    msgType: 'PRIVATE_TEXT',
    data: { fromUser: 'mengchen272091', content: '查询订单YT202608170001当前位置', self: false },
  })

  assert.equal(ignored.handled, false)
  assert.equal(handled.handled, true)
  assert.equal(handled.intent, 'location')
  assert.equal(sentMessages.length, 2)
  assert.equal(sentMessages[0].recipientId, 'mengchen272091')
  assert.match(sentMessages[0].content, /正在核对订单号【YT202608170001】/)
  assert.match(sentMessages[1].content, /订单号：YT202608170001/)
  assert.doesNotMatch(sentMessages[1].content, /运单号：YT202608170001/)
  assert.match(sentMessages[1].content, /计划发车/)
  assert.match(sentMessages[1].content, /https:\/\/example.com\/demo\/transport/)
  assert.deepEqual(delays, [4200])
})

test('ETA intent returns remaining distance and arrival details', async () => {
  sentMessages.length = 0
  const delays: number[] = []
  const automation = createAutomation(delays, 3500)

  await automation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '帮我查货单HD202608180001还要多久到达', self: false },
  })

  assert.equal(sentMessages.length, 2)
  assert.match(sentMessages[0].content, /正在结合货单号【HD202608180001】/)
  assert.match(sentMessages[1].content, /货单号：HD202608180001/)
  assert.match(sentMessages[1].content, /剩余里程/)
  assert.match(sentMessages[1].content, /预计还需/)
  assert.match(sentMessages[1].content, /预计到达/)
  assert.deepEqual(delays, [3500])
})

test('asks for an order, freight bill, or plate before a location lookup', async () => {
  sentMessages.length = 0
  const automation = createAutomation()

  const result = await automation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '帮我查询订单当前位置', self: false },
  })

  assert.equal(result.followUp, true)
  assert.equal(result.intent, 'location')
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].content, /订单号、货单号或车牌号/)
})

test('continues a pending lookup when the user only supplies the missing reference', async () => {
  sentMessages.length = 0
  const delays: number[] = []
  const automation = createAutomation(delays, 3800)

  await automation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '查询当前运输位置', self: false },
  })
  const result = await automation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '订单号：DD202608180088', self: false },
  })

  assert.equal(result.handled, true)
  assert.equal(result.intent, 'location')
  assert.equal(result.followUp, undefined)
  assert.equal(sentMessages.length, 3)
  assert.match(sentMessages[1].content, /订单号【DD202608180088】/)
  assert.match(sentMessages[2].content, /订单号：DD202608180088/)
  assert.deepEqual(delays, [3800])
})

test('asks for an order, waybill, or freight bill before an ETA lookup', async () => {
  sentMessages.length = 0
  const automation = createAutomation()

  const result = await automation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '查一下运单还剩多少公里', self: false },
  })

  assert.equal(result.followUp, true)
  assert.equal(result.intent, 'eta')
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].content, /订单号、运单号或货单号/)
})

test('keeps a queried plate unchanged in both processing and result messages', async () => {
  sentMessages.length = 0
  const automation = createAutomation([], 5000)

  await automation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '查询沪A12345的运输情况', self: false },
  })

  assert.equal(sentMessages.length, 2)
  assert.match(sentMessages[0].content, /车牌号【沪A12345】/)
  assert.match(sentMessages[1].content, /车牌号：沪A12345/)
  assert.doesNotMatch(sentMessages[1].content, /运单号：/)
})

test('clamps the enforced delay between processing and result messages to 3-5 seconds', async () => {
  sentMessages.length = 0
  const shortDelays: number[] = []
  const longDelays: number[] = []

  const shortAutomation = createAutomation(shortDelays, 1000)
  await shortAutomation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '查询订单DD202608180001位置', self: false },
  })

  const longAutomation = createAutomation(longDelays, 9000)
  await longAutomation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '查询运单YD202608180001预计到达时间', self: false },
  })

  assert.deepEqual(shortDelays, [3000])
  assert.deepEqual(longDelays, [5000])
})
