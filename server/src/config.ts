export interface GatewayConfig {
  host: string
  port: number
  eyunApiBaseUrl: string
  eyunAuth: string
  eyunWid: string
  eyunDefaultWcid?: string
  localApiToken: string
  webhookPathToken: string
  demoWechatSenderWcid?: string
  demoDetailPageUrl?: string
}

const requireValue = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): GatewayConfig => {
  const rawPort = env.WECHAT_GATEWAY_PORT?.trim() || '8787'
  const port = Number.parseInt(rawPort, 10)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('WECHAT_GATEWAY_PORT must be an integer between 1 and 65535')
  }

  return {
    host: env.WECHAT_GATEWAY_HOST?.trim() || '127.0.0.1',
    port,
    eyunApiBaseUrl: requireValue(env, 'EYUN_API_BASE_URL').replace(/\/$/, ''),
    eyunAuth: requireValue(env, 'EYUN_AUTH'),
    eyunWid: requireValue(env, 'EYUN_WID'),
    eyunDefaultWcid: env.EYUN_DEFAULT_WCID?.trim() || undefined,
    localApiToken: requireValue(env, 'LOCAL_API_TOKEN'),
    webhookPathToken: requireValue(env, 'WEBHOOK_PATH_TOKEN'),
    demoWechatSenderWcid: env.DEMO_WECHAT_SENDER_WCID?.trim() || undefined,
    demoDetailPageUrl: env.DEMO_DETAIL_PAGE_URL?.trim() || undefined,
  }
}
