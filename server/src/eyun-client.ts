export interface EyunResponse<T> {
  code: string
  message: string
  data: T
}

export interface EyunOnlineData {
  isOnline: boolean
}

export interface EyunSentMessage {
  type: number
  msgId: number
  newMsgId: number
  createTime: number
  wcId: string
}

export interface EyunClientLike {
  isOnline(): Promise<EyunResponse<EyunOnlineData>>
  sendText(recipientId: string, content: string): Promise<EyunResponse<EyunSentMessage>>
  setWebhook(url: string): Promise<EyunResponse<null>>
}

export class EyunApiError extends Error {
  readonly status: number
  readonly responseBody: unknown

  constructor(
    message: string,
    status: number,
    responseBody: unknown,
  ) {
    super(message)
    this.name = 'EyunApiError'
    this.status = status
    this.responseBody = responseBody
  }
}

interface EyunClientOptions {
  apiBaseUrl: string
  auth: string
  wid: string
  fetchImpl?: typeof fetch
}

export class EyunClient implements EyunClientLike {
  private readonly options: EyunClientOptions
  private readonly fetchImpl: typeof fetch

  constructor(options: EyunClientOptions) {
    this.options = options
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  isOnline(): Promise<EyunResponse<EyunOnlineData>> {
    return this.request('/isOnline', { wId: this.options.wid })
  }

  sendText(recipientId: string, content: string): Promise<EyunResponse<EyunSentMessage>> {
    return this.request('/sendText', {
      wId: this.options.wid,
      wcId: recipientId,
      content,
    })
  }

  setWebhook(url: string): Promise<EyunResponse<null>> {
    return this.request('/setHttpCallbackUrl', {
      httpUrl: url,
      type: 2,
    })
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<EyunResponse<T>> {
    const response = await this.fetchImpl(`${this.options.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    const responseBody = await this.readResponseBody(response)

    if (!response.ok) {
      throw new EyunApiError(`Eyun API returned HTTP ${response.status}`, response.status, responseBody)
    }

    if (!this.isEyunResponse(responseBody)) {
      throw new EyunApiError('Eyun API returned an invalid response', response.status, responseBody)
    }

    if (responseBody.code !== '1000') {
      throw new EyunApiError(responseBody.message || 'Eyun API request failed', response.status, responseBody)
    }

    return responseBody as EyunResponse<T>
  }

  private async readResponseBody(response: Response): Promise<unknown> {
    const text = await response.text()

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  private isEyunResponse(value: unknown): value is EyunResponse<unknown> {
    return Boolean(
      value &&
        typeof value === 'object' &&
        typeof (value as Record<string, unknown>).code === 'string' &&
        typeof (value as Record<string, unknown>).message === 'string',
    )
  }
}
