# 多装多卸原型发布

前端保留 20 张客户运单、9 张排线单及独立标识的模拟运输时间、轨迹和时效风险。

运行 `pnpm build` 后执行 `node scripts/build-hosted-proto.mjs`，生成 Sites Worker 入口 `dist/server/index.js`。`.openai/hosting.json` 记录该原型的站点标识。

构建时通过 `VITE_AMAP_KEY` 提供高德 JS Key。运行时通过托管平台的机密环境变量 `AMAP_SECURITY_CODE` 配置安全密钥；不得把安全密钥提交至 GitHub 或打包到前端。部署域名需在高德控制台获准。

`demo-evidence.json` 仅保留运单关联的仓库坐标，不携带车辆原始轨迹、接口返回、凭据或历史核验结论。线上原型不连接本机的公司接口凭据。
