import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DemoWechatAutomation,
  detectDemoIntent,
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

test('recognizes location and ETA query variants', () => {
  assert.equal(detectDemoIntent('帮我查询订单YT202608170001现在到哪了'), 'location')
  assert.equal(detectDemoIntent('查一下运单还剩多少公里'), 'eta')
  assert.equal(detectDemoIntent('查询沪A12345预计多久到达'), 'eta')
  assert.equal(detectDemoIntent('今天天气怎么样'), undefined)
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
  const automation = new DemoWechatAutomation({
    targetWcid: 'mengchen272091',
    detailPageUrl: 'https://example.com/demo/transport',
    eyunClient: fakeClient,
  })
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
  assert.equal(sentMessages.length, 1)
  assert.equal(sentMessages[0].recipientId, 'mengchen272091')
  assert.match(sentMessages[0].content, /计划发车/)
  assert.match(sentMessages[0].content, /https:\/\/example.com\/demo\/transport/)
})

test('ETA intent returns remaining distance and arrival details', async () => {
  sentMessages.length = 0
  const automation = new DemoWechatAutomation({
    targetWcid: 'mengchen272091',
    detailPageUrl: 'https://example.com/demo/transport',
    eyunClient: fakeClient,
  })

  await automation.handle({
    messageType: '60001',
    data: { fromUser: 'mengchen272091', content: '帮我查货单还要多久到达', self: false },
  })

  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].content, /剩余里程/)
  assert.match(sentMessages[0].content, /预计还需/)
  assert.match(sentMessages[0].content, /预计到达/)
})
