# 物流通用智能体 V1.3 独立源码

此目录由现有 `versions/v1.3` 复制，包含可继续编辑的 Vue 3 / TypeScript 源码、公共资源、脚本、部署配置和 `pnpm-lock.yaml`。不依赖原仓库其他版本。原始版本信息见 `V1.3-BASELINE.json`。

## 开始编辑

要求 Node.js 20+、pnpm 10.24.0。

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

默认访问 `http://127.0.0.1:5808`。如 5808 已被占用，可修改 `package.json` 中 `dev` 脚本的端口。生产构建运行 `pnpm build`，结果在 `dist/`。

地图需要在 `.env.local` 中填写自己的 `VITE_AMAP_KEY` 和 `AMAP_SECURITY_CODE`；部署域名还须加入对应高德 Key 的安全域名白名单。未填写时其他页面可编辑和构建，地图会提示缺少配置。MCP 接口如需演示，按实际环境另行配置。

此共享源码不含原项目的环境变量文件、依赖安装目录和构建产物。请勿把个人密钥或客户账号写入源码或发给其他人。
