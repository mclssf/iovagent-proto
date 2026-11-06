本源码同时发布于 GitHub `263` 分支，基于 260 的新增需求见 [263 更新说明](README-263.md)。

# V2.4 · main 分支本地版本

- 来源：`https://github.com/mclssf/iovagent-proto.git` 的 `main` 分支。
- 基线提交：`8339d80dc15ecfb622c3cefbe2e4c4a96f9985df`；拉取日期：2026-11-05。
- 本地目录：`versions/v2.4`；独立端口：5810。
- 版本入口：http://127.0.0.1:5800 ，选择 V2.4。
- 直接访问：http://127.0.0.1:5810/index/orders 。

在本目录执行 `pnpm install --frozen-lockfile`、`pnpm dev`；构建使用 `pnpm build`。

业务代码沿用远程 main；本地只调整版本号与启动端口，并添加版本来源记录。高德 Key 使用 `VITE_AMAP_KEY`，安全密钥使用服务端变量 `AMAP_SECURITY_CODE`，配置存放在 Git 忽略的 `.env.local`，请求经同源 `/_AMapService` 代理。迁移到其他电脑时需单独配置凭据。
