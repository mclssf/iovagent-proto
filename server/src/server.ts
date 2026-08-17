import { timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { GatewayConfig } from './config.ts'
import { EyunApiError, type EyunClientLike } from './eyun-client.ts'
import { type EyunWebhookEvent, WebhookEventStore } from './event-store.ts'

const JSON_BODY_LIMIT = 1024 * 1024

class RequestError extends Error {
  readonly status: number

  constructor(
    message: string,
    status = 400,
  ) {
    super(message)
    this.name = 'RequestError'
    this.status = status
  }
}

interface GatewayDependencies {
  config: GatewayConfig
  eyunClient: EyunClientLike
  eventStore?: WebhookEventStore
  onWebhook?: (event: EyunWebhookEvent) => Promise<unknown>
}

const transportDemoPage = new URL('../public/transport.html', import.meta.url)

export const getWebhookPath = (config: GatewayConfig): string =>
  `/webhooks/eyun/${encodeURIComponent(config.webhookPathToken)}`

export const createGatewayServer = ({
  config,
  eyunClient,
  eventStore = new WebhookEventStore(),
  onWebhook,
}: GatewayDependencies): Server =>
  createServer(async (request, response) => {
    const startedAt = Date.now()

    try {
      const url = new URL(request.url || '/', 'http://localhost')

      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, {
          ok: true,
          service: 'wechat-message-gateway',
          timestamp: new Date().toISOString(),
        })
        return
      }

      if (request.method === 'GET' && url.pathname === '/demo/transport') {
        const html = await readFile(transportDemoPage, 'utf8')
        sendHtml(response, 200, html)
        return
      }

      if (request.method === 'POST' && url.pathname === getWebhookPath(config)) {
        const payload = await readJsonObject(request)
        const stored = eventStore.add(payload as EyunWebhookEvent)
        const messageId = payload.data && typeof payload.data === 'object'
          ? (payload.data as Record<string, unknown>).newMsgId
          : undefined

        sendJson(response, 200, { ok: true, duplicate: stored.duplicate })
        log('info', 'webhook_received', {
          messageType: payload.messageType ?? 'unknown',
          messageId: messageId ?? 'none',
          duplicate: stored.duplicate,
          durationMs: Date.now() - startedAt,
        })

        if (!stored.duplicate && onWebhook) {
          setImmediate(() => {
            void onWebhook(payload as EyunWebhookEvent).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Unknown automation error'
              log('error', 'webhook_automation_failed', { message })
            })
          })
        }
        return
      }

      if (url.pathname.startsWith('/api/')) {
        requireLocalAuthorization(request, config.localApiToken)
      }

      if (request.method === 'GET' && url.pathname === '/api/wechat/status') {
        const result = await eyunClient.isOnline()
        sendJson(response, 200, result)
        return
      }

      if (request.method === 'GET' && url.pathname === '/api/wechat/events') {
        const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10)
        const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50
        sendJson(response, 200, { ok: true, data: eventStore.list(limit) })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/wechat/messages/text') {
        const body = await readJsonObject(request)
        const content = readRequiredString(body, 'content')
        const recipientId = readOptionalString(body, 'recipientId') || config.eyunDefaultWcid

        if (!recipientId) {
          throw new RequestError('recipientId is required when EYUN_DEFAULT_WCID is not configured')
        }

        const result = await eyunClient.sendText(recipientId, content)
        sendJson(response, 200, result)
        log('info', 'text_message_sent', {
          recipientId: maskIdentifier(recipientId),
          messageId: result.data?.newMsgId ?? result.data?.msgId ?? 'unknown',
        })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/wechat/webhook/configure') {
        const body = await readJsonObject(request)
        const callbackUrl = readRequiredString(body, 'url')
        assertPublicHttpUrl(callbackUrl)
        const result = await eyunClient.setWebhook(callbackUrl)
        sendJson(response, 200, result)
        log('info', 'webhook_configured', { host: new URL(callbackUrl).host })
        return
      }

      sendJson(response, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      handleError(response, error)
    }
  })

const readJsonObject = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length

    if (size > JSON_BODY_LIMIT) {
      throw new RequestError('JSON body exceeds 1 MB', 413)
    }

    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    throw new RequestError('JSON body is required')
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new RequestError('JSON body must be an object')
    }

    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof RequestError) {
      throw error
    }

    throw new RequestError('Invalid JSON body')
  }
}

const readRequiredString = (body: Record<string, unknown>, field: string): string => {
  const value = readOptionalString(body, field)

  if (!value) {
    throw new RequestError(`${field} is required`)
  }

  return value
}

const readOptionalString = (body: Record<string, unknown>, field: string): string | undefined => {
  const value = body[field]

  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new RequestError(`${field} must be a string`)
  }

  return value.trim() || undefined
}

const requireLocalAuthorization = (request: IncomingMessage, expectedToken: string): void => {
  const authorization = request.headers.authorization
  const prefix = 'Bearer '
  const providedToken = authorization?.startsWith(prefix) ? authorization.slice(prefix.length) : ''
  const providedBuffer = Buffer.from(providedToken)
  const expectedBuffer = Buffer.from(expectedToken)

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new RequestError('Unauthorized', 401)
  }
}

const assertPublicHttpUrl = (value: string): void => {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new RequestError('url must be a valid HTTP or HTTPS URL')
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new RequestError('url must use HTTP or HTTPS')
  }
}

const handleError = (response: ServerResponse, error: unknown): void => {
  if (response.headersSent) {
    response.end()
    return
  }

  if (error instanceof RequestError) {
    sendJson(response, error.status, { ok: false, error: error.message })
    return
  }

  if (error instanceof EyunApiError) {
    log('error', 'eyun_api_error', { status: error.status, message: error.message })
    sendJson(response, 502, {
      ok: false,
      error: 'Eyun API request failed',
      details: error.responseBody,
    })
    return
  }

  const message = error instanceof Error ? error.message : 'Unknown error'
  log('error', 'unhandled_error', { message })
  sendJson(response, 500, { ok: false, error: 'Internal server error' })
}

const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

const sendHtml = (response: ServerResponse, status: number, body: string): void => {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(body)
}

const maskIdentifier = (value: string): string =>
  value.length <= 8 ? '***' : `${value.slice(0, 4)}***${value.slice(-4)}`

const log = (level: 'info' | 'error', event: string, details: Record<string, unknown>): void => {
  console[level](JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...details,
  }))
}
