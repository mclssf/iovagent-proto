export interface EyunWebhookEvent {
  account?: string
  messageType?: string
  wcId?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface StoredWebhookEvent {
  receivedAt: string
  duplicate: boolean
  event: EyunWebhookEvent
}

export class WebhookEventStore {
  private readonly events: StoredWebhookEvent[] = []
  private readonly seenIds = new Set<string>()
  private readonly maxEvents: number

  constructor(maxEvents = 100) {
    this.maxEvents = maxEvents
  }

  add(event: EyunWebhookEvent): StoredWebhookEvent {
    const dedupeId = this.getDedupeId(event)
    const duplicate = dedupeId ? this.seenIds.has(dedupeId) : false
    const storedEvent = {
      receivedAt: new Date().toISOString(),
      duplicate,
      event,
    }

    if (!duplicate) {
      this.events.unshift(storedEvent)

      if (dedupeId) {
        this.seenIds.add(dedupeId)
      }

      if (this.events.length > this.maxEvents) {
        const removed = this.events.pop()
        const removedId = removed ? this.getDedupeId(removed.event) : undefined

        if (removedId) {
          this.seenIds.delete(removedId)
        }
      }
    }

    return storedEvent
  }

  list(limit = 50): StoredWebhookEvent[] {
    return this.events.slice(0, Math.max(1, Math.min(limit, this.maxEvents)))
  }

  private getDedupeId(event: EyunWebhookEvent): string | undefined {
    const newMsgId = event.data?.newMsgId

    if (typeof newMsgId === 'string' || typeof newMsgId === 'number') {
      return String(newMsgId)
    }

    return undefined
  }
}
