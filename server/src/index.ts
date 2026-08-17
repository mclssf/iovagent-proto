import { loadConfig } from './config.ts'
import { DemoWechatAutomation } from './demo-automation.ts'
import { EyunClient } from './eyun-client.ts'
import { createGatewayServer, getWebhookPath } from './server.ts'

const config = loadConfig()
const eyunClient = new EyunClient({
  apiBaseUrl: config.eyunApiBaseUrl,
  auth: config.eyunAuth,
  wid: config.eyunWid,
})
const demoAutomation = config.demoWechatSenderWcid && config.demoDetailPageUrl
  ? new DemoWechatAutomation({
      targetWcid: config.demoWechatSenderWcid,
      detailPageUrl: config.demoDetailPageUrl,
      eyunClient,
    })
  : undefined
const server = createGatewayServer({
  config,
  eyunClient,
  onWebhook: demoAutomation ? (event) => demoAutomation.handle(event) : undefined,
})

server.listen(config.port, config.host, () => {
  console.info(`WeChat gateway listening at http://${config.host}:${config.port}`)
  console.info(`Webhook path: ${getWebhookPath(config)}`)
})

const shutdown = (signal: string): void => {
  console.info(`Received ${signal}, shutting down`)
  server.close((error) => {
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
