# WeChat Message Gateway

Node.js + TypeScript gateway for receiving Eyun Webhook events and sending WeChat text messages.

## Run

The real credentials live in the ignored root `.env.local` file. Copy `.env.example` when configuring another environment. The tracked `.env` remains available to the existing frontend and is loaded first.

```bash
pnpm server:check
pnpm server:test
pnpm server:dev
```

The service listens on `http://127.0.0.1:8787` by default.

## Endpoints

| Method | Path | Authorization | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | None | Service health check |
| `GET` | `/demo/transport` | None | Static transport detail demo page |
| `POST` | `/webhooks/eyun/:token` | Secret path | Receive Eyun optimized Webhook events |
| `GET` | `/api/wechat/status` | Local bearer token | Query whether the WeChat instance is online |
| `GET` | `/api/wechat/events` | Local bearer token | Read recent non-duplicate Webhook events |
| `POST` | `/api/wechat/messages/text` | Local bearer token | Send a text message |
| `POST` | `/api/wechat/webhook/configure` | Local bearer token | Configure Eyun's optimized Webhook callback |

Management endpoints use `Authorization: Bearer <LOCAL_API_TOKEN>`.

Send a text message using the default recipient from `.env.local`:

```bash
curl -X POST http://127.0.0.1:8787/api/wechat/messages/text \
  -H "Authorization: Bearer $LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from the local gateway"}'
```

To send to another friend, file helper, or group, include `recipientId` in the JSON body.

## Eyun contract

- API base: `https://www.eyunz.com/wx-api`
- API authentication: `Authorization: Bearer <Auth>`
- Text API: `POST /sendText`
- Online status API: `POST /isOnline`
- Webhook configuration API: `POST /setHttpCallbackUrl` with `type: 2`
- Webhook deduplication: `data.newMsgId`

Never expose `.env`, Eyun Auth, or the local management token to browser code or source control.

## WeChat demo automation

When `DEMO_WECHAT_SENDER_WCID` and `DEMO_DETAIL_PAGE_URL` are configured, private text messages from that sender can trigger two demo replies:

- Location and progress queries, such as `查询订单当前位置` or `查一下沪A12345到哪了`.
- Remaining distance and ETA queries, such as `查询运单还剩多少公里` or `查货单预计多久到达`.

Other senders and unmatched messages are stored normally but never receive an automatic reply.
