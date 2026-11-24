# iovagent

物流通用智能体前端演示原型 — 面向物流运营场景的 ToB 产品演示。

> 本项目为演示原型：界面与交互真实可操作，业务数据均为本地 Mock，未接通任何生产服务。

## ✨ 功能

- 智能体工作台：自由对话 + 项目工作台双上下文
- 运单列表 / 运单详情 / 轨迹地图 / 异常事件时间线
- 在途预警、异常停车、车辆定位等演示流程
- 知识库与平台数据资产页（车辆使用 / 运单量 / 路线地图 / 起终点企业）
- 运营配置后台（数据员工 / Skill / TMS 同步客户）

## 🚀 快速开始

```bash
pnpm install
pnpm dev        # 本地开发，默认 http://localhost:5173
pnpm build      # 生产构建，输出到 dist/
pnpm preview    # 预览构建产物
```

默认入口 `/` 跳转 `/login`；用户侧核心路径 `/index/agent`；运营配置后台 `/agent-ops`。

## 🧱 技术栈

Vue 3 · TypeScript · Vite · Pinia · Vue Router · Element Plus · Tailwind CSS 4 · Leaflet

## 📁 项目结构

```
src/
  views/AgentWork/      用户侧工作台（工作台 / 运单 / 项目 / 知识库）
  views/AgentOpsConfig.vue  运营配置后台
  pinia/agentWork.ts    演示数据与交互状态
  router/index.ts       路由表
public/                 静态资源
```

## 📄 License

MIT © 2026
