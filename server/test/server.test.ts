import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import type { GatewayConfig } from '../src/config.ts'
import type {
  EyunClientLike,
  EyunOnlineData,
  EyunResponse,
  EyunSentMessage,
} from '../src/eyun-client.ts'
import { createGatewayServer, getWebhookPath } from '../src/server.ts'

const config: GatewayConfig = {
  host: '127.0.0.1',
  port: 0,
  eyunApiBaseUrl: 'https://example.invalid',
  eyunAuth: 'test-auth',
  eyunWid: 'test-wid',
  eyunDefaultWcid: 'filehelper',
  localApiToken: 'test-local-token',
  webhookPathToken: 'test-webhook-token',
  demoWechatSenderWcid: undefined,
  demoDetailPageUrl: undefined,
}

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

const server = createGatewayServer({ config, eyunClient: fakeClient })
let baseUrl = ''

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
})

test('health endpoint is public', async () => {
  const response = await fetch(`${baseUrl}/health`)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
})

test('transport demo page is public', async () => {
  const response = await fetch(`${baseUrl}/demo/transport`)
  const body = await response.text()

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') || '', /text\/html/)
  assert.match(body, /运输详情/)
})

test('management endpoints require authorization', async () => {
  const unauthorized = await fetch(`${baseUrl}/api/wechat/status`)
  const authorized = await fetch(`${baseUrl}/api/wechat/status`, {
    headers: { Authorization: `Bearer ${config.localApiToken}` },
  })
  const body = await authorized.json()

  assert.equal(unauthorized.status, 401)
  assert.equal(authorized.status, 200)
  assert.equal(body.data.isOnline, true)
})

test('webhook receives and deduplicates events by newMsgId', async () => {
  const event = {
    messageType: '60001',
    wcId: 'wxid_receiver',
    data: {
      content: 'hello',
      fromUser: 'wxid_sender',
      newMsgId: 123456,
    },
  }
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }
  const first = await fetch(`${baseUrl}${getWebhookPath(config)}`, options)
  const second = await fetch(`${baseUrl}${getWebhookPath(config)}`, options)
  const events = await fetch(`${baseUrl}/api/wechat/events`, {
    headers: { Authorization: `Bearer ${config.localApiToken}` },
  })
  const body = await events.json()

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(body.data.length, 1)
})

test('text endpoint sends through the configured default recipient', async () => {
  const response = await fetch(`${baseUrl}/api/wechat/messages/text`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.localApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: 'test message' }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(sentMessages.at(-1), {
    recipientId: 'filehelper',
    content: 'test message',
  })
})
