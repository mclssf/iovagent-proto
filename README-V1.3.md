# V1.3 · main 分支本地版本

- 来源：`https://github.com/mclssf/iovagent-proto.git` 的 `main` 分支。
- 基线提交：`bfd810e2a3e734185905da7293053c5c98ca347c`；拉取日期：2026-10-29。
- 本地目录：`versions/v1.3`；独立端口：5808。
- 版本入口：http://127.0.0.1:5800 ，选择 V1.3。
- 直接访问：http://127.0.0.1:5808/index/orders 。

## 运行

在本目录执行 `pnpm install --frozen-lockfile`，再执行 `pnpm dev`。构建使用 `pnpm build`。

本地仅将 package.json 版本号记录为 1.3.0，并将启动地址设置为本机 5808 端口；业务源代码保持远程 main 基线。环境文件沿用远程版本，不覆盖为其他本地版本的配置。后续同步请先比较本目录改动，避免覆盖本地工作。
