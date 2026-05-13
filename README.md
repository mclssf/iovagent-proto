# 在途物流智能体原型

Vue3 + TypeScript + Vite + Ant Design Vue + TailwindCSS。

## 本地运行

```bash
npm ci
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。

## Vercel 部署

如果整个仓库提交到 GitHub，Vercel 导入项目时需要将 Root Directory 设置为：

```text
logistics-agent-prototype
```

推荐配置：

```text
Framework Preset: Vite
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
```

当前原型为纯前端静态应用，无服务端 API 依赖，可直接在 Vercel 环境部署。
