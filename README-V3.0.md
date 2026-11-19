# V3.0 · V2.4 增强调度单版本

- 基线：`versions/v2.4`。
- 增量：加入 V2.3 的调度单、关联运单和扩展信息能力。
- 本地目录：`versions/v3.0`；独立端口：5830。
- 版本入口：http://127.0.0.1:5800，选择 V3.0。
- 调度单列表：http://127.0.0.1:5830/index/dispatches 。

在本目录执行 `pnpm install --frozen-lockfile`、`pnpm dev`；构建使用 `pnpm build`。

V3.0 保留 V2.4 的运单详情页样式和状态口径；调度单详情沿用地图左侧、信息右侧的详情结构。高德 Key 使用 `VITE_AMAP_KEY`，安全密钥使用服务端变量 `AMAP_SECURITY_CODE`，配置存放在 Git 忽略的 `.env.local`，请求经同源 `/_AMapService` 代理。迁移到其他电脑时需单独配置凭据。
