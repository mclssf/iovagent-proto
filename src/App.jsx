import React, { useMemo, useState } from "react";

/**
 * 修复记录
 * - 移除 lucide-react：原错误来自沙箱构建器尝试从 jsdelivr 拉取 lucide 单个 icon 文件失败。
 * - 移除 framer-motion：减少外部依赖，避免受限网络环境再次构建失败。
 * - 使用本文件内置 SvgIcon，所有图标都在本文件内渲染。
 * - 增加 validateMockData 轻量测试，校验原型核心 mock 数据是否完整。
 */

const ICON_PATHS = {
  search: "M11 19a8 8 0 1 1 5.657-13.657A8 8 0 0 1 11 19Zm6-2 4 4",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9.5 20a2.5 2.5 0 0 0 5 0",
  mapPinned: "M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3ZM9 3v15M15 6v15M18 8a3 3 0 1 1-6 0a3 3 0 0 1 6 0Z",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  fileText: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h8M8 9h2",
  chart: "M4 19V5M4 19h17M8 17V9M13 17V6M18 17v-4",
  settings: "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8ZM3 12h3M18 12h3M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1",
  route: "M5 5a3 3 0 1 0 0 6c3 0 6-3 9-3a5 5 0 1 1-5 5M5 5v0M19 19v0",
  bot: "M12 6V3M7 8h10a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4ZM8 14h.01M16 14h.01M9 18h6",
  truck: "M3 6h11v9H3ZM14 10h4l3 3v2h-7ZM7 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4",
  alert: "M12 3 2 21h20L12 3ZM12 9v5M12 17h.01",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9c4.5-1 8-4 8-9V6l-8-3ZM12 8v5M12 16h.01",
  chevronRight: "M9 18l6-6-6-6",
  plus: "M12 5v14M5 12h14",
  refresh: "M21 12a9 9 0 0 1-15 6.7L3 16M3 16v5h5M3 12A9 9 0 0 1 18 5.3L21 8M21 8V3h-5",
  user: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4",
  message: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z",
  clipboard: "M9 4h6M9 4a3 3 0 0 1 6 0M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M9 12h6M9 16h6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6",
  database: "M4 6c0-2 4-4 8-4s8 2 8 4-4 4-8 4-8-2-8-4ZM4 6v6c0 2 4 4 8 4s8-2 8-4V6M4 12v6c0 2 4 4 8 4s8-2 8-4v-6",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  dot: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  map: "M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3ZM9 3v15M15 6v15",
};

function SvgIcon({ name, size = 18, className = "" }) {
  const d = ICON_PATHS[name] || ICON_PATHS.dot;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const I = (name) => function IconComponent(props) { return <SvgIcon name={name} {...props} />; };

const Search = I("search");
const Bell = I("bell");
const MapPinned = I("mapPinned");
const Download = I("download");
const FileText = I("fileText");
const BarChart3 = I("chart");
const Settings = I("settings");
const Route = I("route");
const Bot = I("bot");
const Truck = I("truck");
const AlertTriangle = I("alert");
const ShieldAlert = I("shield");
const ChevronRight = I("chevronRight");
const Plus = I("plus");
const RefreshCw = I("refresh");
const User = I("user");
const LogOut = I("logout");
const SlidersHorizontal = I("sliders");
const MessageSquareText = I("message");
const ClipboardList = I("clipboard");
const Eye = I("eye");
const Database = I("database");
const Activity = I("activity");
const CircleDot = I("dot");

const projects = [
  { id: "P001", name: "华东冷链在途监控", status: "已连接", statusTone: "green", monitored: 238, alerts: 31, sync: "2分钟前", tms: "https://tms.customer-a.com" },
  { id: "P002", name: "华南干线运输项目", status: "连接异常", statusTone: "orange", monitored: 156, alerts: 18, sync: "36分钟前", tms: "https://tms.customer-b.com" },
  { id: "P003", name: "全国大客户配送项目", status: "已连接", statusTone: "green", monitored: 428, alerts: 46, sync: "刚刚", tms: "https://tms.customer-c.com" },
];

const waybills = [
  { id: "WB20260508001", plate: "沪A12345", carrier: "安捷物流", route: "上海嘉定 → 广州黄埔", factory: "上海一厂", cargo: "冷链食品", status: "在途", alert: "停车异常", alertLevel: "高", rule: "停车 126 分钟 > 阈值 60 分钟", smart: "规则预警，智能分析认为合理", poi: "G60 嘉兴服务区", poiType: "服务区", gpsRisk: "低风险", eta: "预计延误 42 分钟", latest: "2026-05-08 14:32" },
  { id: "WB20260508002", plate: "粤B66889", carrier: "远成运输", route: "深圳龙岗 → 长沙望城", factory: "深圳二厂", cargo: "电子配件", status: "装货中", alert: "装车超时", alertLevel: "中", rule: "装货地停留 218 分钟 > 阈值 180 分钟", smart: "疑似工厂排队导致，建议关注工厂作业效率", poi: "深圳龙岗仓库", poiType: "工厂/仓库", gpsRisk: "无风险", eta: "未发车", latest: "2026-05-08 13:58" },
  { id: "WB20260508003", plate: "苏E88991", carrier: "星河货运", route: "苏州昆山 → 武汉东西湖", factory: "昆山工厂", cargo: "家电", status: "在途", alert: "GPS高风险", alertLevel: "高", rule: "普通规则未命中", smart: "发现轨迹跳点与异常补点，建议人工复核", poi: "未知区域", poiType: "未识别POI", gpsRisk: "高风险", eta: "预计准时", latest: "2026-05-08 14:41" },
  { id: "WB20260508004", plate: "浙C23331", carrier: "安捷物流", route: "杭州萧山 → 合肥经开", factory: "杭州工厂", cargo: "包装材料", status: "到达未卸", alert: "卸车超时", alertLevel: "中", rule: "卸货地停留 196 分钟 > 阈值 120 分钟", smart: "卸货地等待，暂无非目的地卸货风险", poi: "合肥经开仓", poiType: "目的地仓库", gpsRisk: "无风险", eta: "已到达", latest: "2026-05-08 14:20" },
];

const messages = [
  { role: "agent", type: "alert", title: "今日在途异常摘要", content: "当前项目共有 238 单加入在途监控，31 单触发普通规则预警。其中停车异常 12 单、装车超时 8 单、卸车超时 7 单、GPS 高风险 4 单。" },
  { role: "user", type: "text", content: "查一下今天所有高风险异常，并生成下载入口" },
  { role: "agent", type: "task", title: "已拆解任务并调用 Skill", content: "已识别为异常查询 + Excel 下载任务。筛选条件：日期=今天，项目=华东冷链在途监控，风险等级=高。右侧已生成异常列表和下载任务。" },
];

const timeline = [
  { time: "07:20", title: "运单加入监控", desc: "匹配项目关键词与运单状态筛选" },
  { time: "08:05", title: "到达装货地", desc: "进入上海嘉定装货地围栏" },
  { time: "09:12", title: "完成装货并发车", desc: "离开装货地围栏，状态更新为在途" },
  { time: "11:48", title: "停车开始", desc: "G60 嘉兴服务区，POI 类型：服务区" },
  { time: "13:54", title: "触发停车异常", desc: "停车 126 分钟，超过项目阈值 60 分钟" },
  { time: "14:02", title: "智能轨迹分析", desc: "判断为合理休息停车，建议不作为高风险处理" },
];

const quickCommands = ["查看今日异常运单", "下载本周停车异常 Excel", "分析本月承运商预警排名", "生成昨日异常报告", "查看预警上升原因"];

const stats = [
  { label: "监控运单", value: "238", desc: "较昨日 +12", icon: Truck },
  { label: "规则预警", value: "31", desc: "预警率 13.0%", icon: AlertTriangle },
  { label: "智能确认异常", value: "18", desc: "规则误报 9 单", icon: Bot },
  { label: "GPS高风险", value: "4", desc: "需人工复核", icon: ShieldAlert },
];

const navItems = [
  { key: "workspace", label: "智能体工作台", icon: Bot },
  { key: "projects", label: "项目管理", icon: Database },
  { key: "waybills", label: "运单列表", icon: ClipboardList },
  { key: "detail", label: "运单详情", icon: Eye },
  { key: "map", label: "地图轨迹", icon: MapPinned },
  { key: "analytics", label: "统计归因", icon: BarChart3 },
  { key: "report", label: "每日报告", icon: FileText },
  { key: "download", label: "Excel 下载", icon: Download },
  { key: "threshold", label: "阈值建议", icon: SlidersHorizontal },
];

function validateMockData() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`Mock data test failed: ${message}`);
  };
  assert(projects.length >= 3, "should have at least 3 projects");
  assert(waybills.length >= 4, "should have at least 4 waybills");
  assert(navItems.every((n) => n.key && n.label && n.icon), "each nav item should have key, label and icon");
  assert(waybills.every((w) => w.id && w.plate && w.route && w.alert && w.gpsRisk), "each waybill should have required fields");
  assert(messages.some((m) => m.type === "task"), "messages should include agent task decomposition");
  assert(Object.keys(ICON_PATHS).length >= 20, "local icon registry should be available");
  return true;
}
validateMockData();

function cn(...classes) { return classes.filter(Boolean).join(" "); }

function ToneBadge({ children, tone = "gray" }) {
  const map = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    gray: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", map[tone] || map.gray)}>{children}</span>;
}

function Card({ children, className = "" }) { return <div className={cn("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>; }

function SectionTitle({ icon: Icon, title, desc, action }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && <div className="rounded-2xl bg-slate-900 p-2 text-white"><Icon size={18} /></div>}
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function TopBar({ selectedProject }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm"><Route size={22} /></div>
        <div>
          <div className="text-base font-semibold text-slate-950">在途物流智能体</div>
          <div className="text-xs text-slate-500">当前项目：{selectedProject.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Bell size={18} /><span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" /></button>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700"><User size={16} />运营管理员</div>
        <button className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><LogOut size={18} /></button>
      </div>
    </header>
  );
}

function AppShell({ page, setPage, selectedProject, setSelectedProject, children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar selectedProject={selectedProject} />
      <div className="flex h-[calc(100vh-4rem)]">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-4">
          <button className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-sm"><Plus size={16} /> 新建项目</button>
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = page === item.key;
              return <button key={item.key} onClick={() => setPage(item.key)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition", active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100")}><Icon size={17} />{item.label}</button>;
            })}
          </div>
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="mb-2 px-2 text-xs font-medium text-slate-400">项目列表</div>
            <div className="space-y-2">
              {projects.map((project) => (
                <button key={project.id} onClick={() => setSelectedProject(project)} className={cn("w-full rounded-2xl border p-3 text-left transition", selectedProject.id === project.id ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50")}>
                  <div className="flex items-center justify-between gap-2"><div className="truncate text-sm font-medium text-slate-900">{project.name}</div><CircleDot size={12} className={project.statusTone === "green" ? "text-emerald-500" : "text-orange-500"} /></div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{project.monitored} 单</span><span>{project.alerts} 异常</span></div>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

function LoginPreview() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] grid-cols-2 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between bg-slate-950 p-10 text-white">
        <div><div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Route /></div><h1 className="text-4xl font-semibold leading-tight">面向在途物流场景的智能体产品</h1><p className="mt-4 max-w-md text-sm leading-6 text-slate-300">连接用户授权的目标 TMS 系统，自动获取运单、识别异常、分析轨迹、生成报告和下载清单。</p></div>
        <div className="grid grid-cols-3 gap-3">{[["Skill 编排", Bot], ["轨迹分析", MapPinned], ["异常报告", FileText]].map(([label, Icon]) => <div key={label} className="rounded-2xl bg-white/10 p-4"><Icon size={20} /><div className="mt-3 text-sm">{label}</div></div>)}</div>
      </div>
      <div className="flex items-center justify-center p-10"><Card className="w-full max-w-md p-8"><h2 className="text-2xl font-semibold text-slate-950">用户登录</h2><p className="mt-2 text-sm text-slate-500">登录后进入项目级智能体工作台</p><div className="mt-8 space-y-4"><label className="block"><span className="text-sm font-medium text-slate-700">账号</span><input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-900" placeholder="请输入账号" /></label><label className="block"><span className="text-sm font-medium text-slate-700">密码</span><input type="password" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-slate-900" placeholder="请输入密码" /></label><button className="w-full rounded-2xl bg-slate-950 py-3 text-sm font-medium text-white">登录</button></div><div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">原型说明：正式环境需支持会话过期、权限校验、登录失败提示、登出和多角色入口。</div></Card></div>
    </div>
  );
}

function Workspace({ selectedProject, setPage }) {
  const [input, setInput] = useState("");
  const [rightTab, setRightTab] = useState("alerts");
  return (
    <div className="grid h-full grid-cols-[1fr_460px] gap-6">
      <div className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><SectionTitle icon={Bot} title="智能体对话窗口" desc="理解意图 → 拆解任务 → 调用 Skill → 生成结果 → 右侧可视化展示" action={<ToneBadge tone="green">{selectedProject.status}</ToneBadge>} /><div className="flex flex-wrap gap-2">{quickCommands.map((cmd) => <button key={cmd} onClick={() => setInput(cmd)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-900 hover:text-slate-950">{cmd}</button>)}</div></div>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          {messages.map((m, index) => <div key={index} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}><div className={cn("max-w-[78%] rounded-3xl px-5 py-4 text-sm leading-6", m.role === "user" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700")}>{m.title && <div className={cn("mb-1 font-semibold", m.role === "user" ? "text-white" : "text-slate-950")}>{m.title}</div>}<div>{m.content}</div>{m.type === "alert" && <div className="mt-4 grid grid-cols-3 gap-2"><button onClick={() => setRightTab("alerts")} className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">查看异常</button><button onClick={() => setRightTab("chart")} className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">看统计</button><button onClick={() => setPage("download")} className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">下载 Excel</button></div>}</div></div>)}
        </div>
        <div className="border-t border-slate-200 p-4"><div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-2"><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="例如：下载今天高风险异常运单，并分析预警上升原因" className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none" /><button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white">发送</button></div></div>
      </div>
      <RightResultPanel tab={rightTab} setTab={setRightTab} setPage={setPage} />
    </div>
  );
}

function RightResultPanel({ tab, setTab, setPage }) {
  return <Card className="min-h-0 overflow-hidden"><div className="border-b border-slate-200 p-4"><div className="mb-4 flex items-center justify-between"><div><div className="font-semibold text-slate-950">右侧结果面板</div><div className="text-xs text-slate-500">列表 / 图表 / 地图 / 报告 / 下载统一承载</div></div><button className="rounded-full border border-slate-200 p-2 text-slate-500"><RefreshCw size={16} /></button></div><div className="grid grid-cols-3 gap-2">{[["alerts", "异常列表"], ["chart", "统计分析"], ["download", "下载任务"]].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cn("rounded-xl px-3 py-2 text-xs", tab === key ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600")}>{label}</button>)}</div></div><div className="h-[calc(100vh-13rem)] overflow-auto p-4">{tab === "alerts" && <AlertList setPage={setPage} compact />}{tab === "chart" && <AnalyticsMini />}{tab === "download" && <DownloadMini />}</div></Card>;
}

function AlertList({ setPage, compact = false }) {
  return <div className="space-y-3">{waybills.map((w) => <div key={w.id} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-900"><div className="flex items-start justify-between gap-3"><div><div className="font-medium text-slate-950">{w.plate}</div><div className="mt-1 text-xs text-slate-500">{w.id}</div></div><ToneBadge tone={w.alertLevel === "高" ? "red" : "orange"}>{w.alert}</ToneBadge></div><div className="mt-3 text-sm text-slate-700">{w.route}</div><div className="mt-2 text-xs leading-5 text-slate-500">{w.smart}</div><div className="mt-4 flex gap-2"><button onClick={() => setPage("detail")} className="flex-1 rounded-xl bg-slate-950 px-3 py-2 text-xs text-white">详情</button><button onClick={() => setPage("map")} className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600">地图</button></div></div>)}{!compact && <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">列表页应支持分页、排序、筛选、批量下载和字段配置。</div>}</div>;
}

function AnalyticsMini() {
  const bars = [72, 54, 41, 32, 25];
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Metric label="预警率" value="13.0%" desc="较昨日 +2.4%" /><Metric label="误报疑似" value="9" desc="服务区/加油站" /></div><Card className="p-4"><div className="mb-3 text-sm font-medium">承运商预警排名</div><div className="space-y-3">{["安捷物流", "远成运输", "星河货运", "华通快运", "顺达运输"].map((name, i) => <div key={name}><div className="mb-1 flex justify-between text-xs text-slate-500"><span>{name}</span><span>{bars[i]}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-slate-900" style={{ width: `${bars[i]}%` }} /></div></div>)}</div></Card><Card className="p-4"><div className="text-sm font-medium text-slate-950">归因结论</div><p className="mt-2 text-xs leading-5 text-slate-500">本周预警上升主要来自安捷物流与上海嘉定 → 广州黄埔线路。预警量增加 11 单，其中停车异常贡献 6 单；但智能分析判断其中 4 单为服务区合理停车。</p></Card></div>;
}

function DownloadMini() {
  return <div className="space-y-3">{[["今日高风险异常运单.xlsx", "已完成", "31 条", "green"], ["本周停车异常明细.xlsx", "生成中", "86 条", "blue"], ["GPS高风险运单.xlsx", "失败", "4 条", "red"]].map(([name, status, count, tone]) => <div key={name} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-slate-950">{name}</div><div className="mt-1 text-xs text-slate-500">数据量：{count}</div></div><ToneBadge tone={tone}>{status}</ToneBadge></div><button className="mt-4 w-full rounded-xl bg-slate-950 px-3 py-2 text-xs text-white">下载</button></div>)}</div>;
}

function Metric({ label, value, desc, icon: Icon }) {
  return <Card className="p-4"><div className="flex items-start justify-between"><div><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div><div className="mt-1 text-xs text-slate-500">{desc}</div></div>{Icon && <Icon className="text-slate-400" size={20} />}</div></Card>;
}

function ProjectsPage() {
  return <div><SectionTitle icon={Database} title="项目管理" desc="管理目标 TMS 地址、用户授权连接、运单筛选条件、预警阈值和同步状态。" action={<button className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm text-white"><Plus size={16} /> 新建项目</button>} /><div className="grid grid-cols-3 gap-4">{projects.map((p) => <Card key={p.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-950">{p.name}</div><div className="mt-1 text-xs text-slate-500">{p.tms}</div></div><ToneBadge tone={p.statusTone}>{p.status}</ToneBadge></div><div className="mt-5 grid grid-cols-3 gap-3"><Metric label="监控" value={p.monitored} desc="运单" /><Metric label="预警" value={p.alerts} desc="今日" /><Metric label="同步" value={p.sync} desc="最后" /></div><div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><div className="flex justify-between"><span>关键词筛选</span><span>冷链</span></div><div className="mt-2 flex justify-between"><span>状态筛选</span><span>在途</span></div><div className="mt-2 flex justify-between"><span>停车阈值</span><span>60 分钟</span></div></div><div className="mt-5 flex gap-2"><button className="flex-1 rounded-xl bg-slate-950 px-3 py-2 text-sm text-white">编辑</button><button className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">重新授权</button></div></Card>)}</div><Card className="mt-6 p-6"><SectionTitle icon={Settings} title="创建项目弹窗原型" desc="首次创建项目时，需要发起用户授权的虚拟登录 / 系统连接。" /><div className="grid grid-cols-4 gap-4">{[["1", "填写项目", "项目名称、目标 TMS 地址、登录用户"], ["2", "设置筛选", "关键词条件、运单状态条件；当前仅单一条件"], ["3", "授权连接", "用户名、密码、验证码，验证连接状态"], ["4", "启动同步", "持续获取运单并加入在途监控"]].map(([n, t, d]) => <div key={n} className="rounded-2xl border border-slate-200 p-4"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm text-white">{n}</div><div className="mt-3 font-medium text-slate-950">{t}</div><div className="mt-1 text-xs leading-5 text-slate-500">{d}</div></div>)}</div></Card></div>;
}

function WaybillsPage({ setPage }) {
  return <div><SectionTitle icon={ClipboardList} title="运单列表" desc="支持页面筛选与自然语言筛选口径一致，列表可下钻详情、地图和下载。" action={<button className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm"><Download size={16} /> 导出</button>} /><Card className="mb-5 p-4"><div className="grid grid-cols-6 gap-3">{["日期范围", "车牌/运单号", "承运商", "线路", "异常类型", "风险等级"].map((placeholder) => <div key={placeholder} className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-400"><Search size={15} /> {placeholder}</div>)}</div></Card><Card className="overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["运单号", "车牌", "承运商", "线路", "状态", "规则预警", "智能分析", "GPS风险", "操作"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{waybills.map((w) => <tr key={w.id} className="hover:bg-slate-50"><td className="px-4 py-4 font-medium text-slate-950">{w.id}</td><td className="px-4 py-4">{w.plate}</td><td className="px-4 py-4">{w.carrier}</td><td className="px-4 py-4">{w.route}</td><td className="px-4 py-4"><ToneBadge>{w.status}</ToneBadge></td><td className="px-4 py-4"><ToneBadge tone={w.alertLevel === "高" ? "red" : "orange"}>{w.alert}</ToneBadge></td><td className="max-w-xs px-4 py-4 text-slate-500">{w.smart}</td><td className="px-4 py-4"><ToneBadge tone={w.gpsRisk === "高风险" ? "red" : w.gpsRisk === "低风险" ? "orange" : "green"}>{w.gpsRisk}</ToneBadge></td><td className="px-4 py-4"><div className="flex gap-2"><button onClick={() => setPage("detail")} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs text-white">详情</button><button onClick={() => setPage("map")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">地图</button></div></td></tr>)}</tbody></table></Card></div>;
}

function DetailPage({ setPage }) {
  const w = waybills[0];
  const [tab, setTab] = useState("compare");
  return <div><SectionTitle icon={Eye} title="运单详情 / 异常详情" desc="单运单聚合普通规则预警、智能轨迹分析、GPS 造假分析、地图证据和事件 timeline。" action={<button onClick={() => setPage("map")} className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm text-white"><MapPinned size={16} /> 查看地图</button>} /><div className="grid grid-cols-[1fr_360px] gap-6"><div className="space-y-5"><Card className="p-5"><div className="grid grid-cols-4 gap-4">{[["运单号", w.id], ["车牌号", w.plate], ["承运商", w.carrier], ["线路", w.route], ["货物", w.cargo], ["发货地工厂", w.factory], ["状态", w.status], ["最新轨迹", w.latest]].map(([k, v]) => <div key={k} className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-500">{k}</div><div className="mt-2 text-sm font-medium text-slate-950">{v}</div></div>)}</div></Card><Card className="p-5"><div className="mb-4 flex gap-2">{[["rule", "普通规则预警"], ["smart", "智能分析判断"], ["compare", "差异对比"]].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cn("rounded-xl px-4 py-2 text-sm", tab === key ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600")}>{label}</button>)}</div>{tab === "rule" && <AnalysisBlock title="普通规则预警" icon={AlertTriangle} rows={[["命中规则", w.rule], ["预警类型", w.alert], ["阈值", "停车时长 60 分钟"], ["实际值", "停车 126 分钟"], ["规则结论", "触发停车异常"]]} />}{tab === "smart" && <AnalysisBlock title="智能分析判断" icon={Bot} rows={[["POI 类型", w.poiType], ["停车地点", w.poi], ["合理性", "合理停车"], ["GPS 风险", w.gpsRisk], ["智能结论", "该单为规则预警，但停车点位于服务区，结合时长和行驶路线判断为合理休息"]]} />}{tab === "compare" && <div className="grid grid-cols-2 gap-4"><AnalysisBlock title="规则侧结论" icon={AlertTriangle} rows={[["判断依据", "停车时长 + 阈值"], ["结论", "异常"], ["原因", w.rule]]} /><AnalysisBlock title="智能侧结论" icon={Bot} rows={[["判断依据", "轨迹 + POI + 历史停车场景"], ["结论", "可能为规则误报"], ["原因", "停车点为服务区，路线连续，GPS 风险低"]]} /></div>}</Card></div><Card className="p-5"><SectionTitle icon={Activity} title="事件 Timeline" desc="点击事件后地图应联动定位" /><div className="space-y-4">{timeline.map((t, i) => <div key={t.time} className="flex gap-3"><div className="flex flex-col items-center"><div className={cn("h-3 w-3 rounded-full", i === 4 ? "bg-red-500" : "bg-slate-900")} />{i < timeline.length - 1 && <div className="mt-1 h-12 w-px bg-slate-200" />}</div><div className="pb-2"><div className="text-xs text-slate-500">{t.time}</div><div className="mt-1 text-sm font-medium text-slate-950">{t.title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{t.desc}</div></div></div>)}</div></Card></div></div>;
}

function AnalysisBlock({ title, icon: Icon, rows }) {
  return <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-4 flex items-center gap-2 font-medium text-slate-950"><Icon size={17} />{title}</div><div className="space-y-3">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] gap-3 text-sm"><div className="text-slate-500">{k}</div><div className="text-slate-800">{v}</div></div>)}</div></div>;
}

function MapPage() {
  return <div className="grid h-full grid-cols-[1fr_380px] gap-6"><Card className="relative min-h-[720px] overflow-hidden bg-slate-100"><div className="absolute left-6 top-6 z-10 flex gap-2">{["完整轨迹", "停车点", "POI", "围栏", "GPS风险段"].map((x) => <button key={x} className="rounded-full bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">{x}</button>)}</div><div className="absolute inset-0 opacity-70"><div className="absolute left-[8%] top-[16%] h-24 w-24 rounded-full border border-slate-300" /><div className="absolute right-[12%] bottom-[16%] h-28 w-28 rounded-full border border-slate-300" /><svg className="h-full w-full" viewBox="0 0 1000 700" preserveAspectRatio="none"><path d="M80,540 C210,420 240,210 420,260 S650,520 870,150" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-900" strokeLinecap="round" strokeDasharray="2 18" /><path d="M600,430 C650,390 690,360 730,330" fill="none" stroke="currentColor" strokeWidth="10" className="text-red-400" strokeLinecap="round" /></svg></div>{[["装货地", "上海嘉定", "left-[7%] top-[72%]", "green"], ["停车点", "G60 嘉兴服务区", "left-[38%] top-[34%]", "orange"], ["GPS异常段", "疑似跳点", "left-[61%] top-[56%]", "red"], ["卸货地", "广州黄埔", "right-[9%] top-[18%]", "blue"]].map(([title, desc, pos, tone]) => <div key={title} className={cn("absolute z-20 rounded-2xl bg-white p-3 shadow-lg", pos)}><div className="flex items-center gap-2 text-sm font-medium text-slate-950"><span className={cn("h-2.5 w-2.5 rounded-full", tone === "red" ? "bg-red-500" : tone === "orange" ? "bg-orange-500" : tone === "green" ? "bg-emerald-500" : "bg-blue-500")} />{title}</div><div className="mt-1 text-xs text-slate-500">{desc}</div></div>)}</Card><Card className="overflow-hidden"><div className="border-b border-slate-200 p-5"><SectionTitle icon={MapPinned} title="地图证据面板" desc="轨迹、停车点、POI、合理性、GPS 风险段统一展示" /></div><div className="space-y-3 p-5">{[["G60 嘉兴服务区", "停车 126 分钟", "服务区", "智能判断：合理休息", "orange"], ["异常轨迹段", "11:28 - 11:34", "GPS跳点", "轨迹造假：低风险", "red"], ["广州黄埔仓", "预计 18:45 到达", "目的地", "无非目的地卸货风险", "green"]].map(([a, b, c, d, tone]) => <div key={a} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><div className="font-medium text-slate-950">{a}</div><ToneBadge tone={tone}>{c}</ToneBadge></div><div className="mt-2 text-sm text-slate-600">{b}</div><div className="mt-1 text-xs text-slate-500">{d}</div></div>)}</div></Card></div>;
}

function AnalyticsPage() {
  return <div><SectionTitle icon={BarChart3} title="多维度统计分析与归因" desc="按日/周/月、项目、承运商、线路、发货地工厂分析预警情况和上升原因。" /><div className="mb-5 grid grid-cols-4 gap-4">{stats.map((s) => <Metric key={s.label} label={s.label} value={s.value} desc={s.desc} icon={s.icon} />)}</div><div className="grid grid-cols-[1fr_420px] gap-6"><Card className="p-6"><div className="mb-5 flex items-center justify-between"><div className="font-semibold text-slate-950">近 7 日预警趋势</div><ToneBadge tone="blue">按日统计</ToneBadge></div><div className="flex h-72 items-end gap-4">{[21, 18, 26, 24, 33, 37, 31].map((v, i) => <div key={i} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-2xl bg-slate-900" style={{ height: `${v * 5}px` }} /><div className="text-xs text-slate-500">5/{i + 2}</div><div className="text-xs font-medium">{v}</div></div>)}</div></Card><Card className="p-6"><div className="font-semibold text-slate-950">预警上升归因</div><div className="mt-4 space-y-4">{[["承运商贡献", "安捷物流贡献 +8 单，占增量 42%"], ["线路贡献", "上海嘉定 → 广州黄埔贡献 +6 单"], ["异常类型", "停车异常贡献最大，但服务区合理停车占比较高"], ["策略建议", "可将该线路停车阈值从 60 分钟调整为 90 分钟，并观察 7 天"]].map(([k, v]) => <div key={k} className="rounded-2xl bg-slate-50 p-4"><div className="text-sm font-medium text-slate-950">{k}</div><div className="mt-1 text-xs leading-5 text-slate-500">{v}</div></div>)}</div></Card></div></div>;
}

function ReportPage() {
  return <div><SectionTitle icon={FileText} title="每日报告" desc="每日自动生成，也可由用户自然语言触发。报告包含概览、排名、归因、重点异常和下载入口。" /><Card className="p-6"><div className="flex items-start justify-between border-b border-slate-200 pb-5"><div><div className="text-2xl font-semibold text-slate-950">华东冷链在途监控日报</div><div className="mt-2 text-sm text-slate-500">报告日期：2026-05-08 ｜ 生成时间：18:00</div></div><div className="flex gap-2"><button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm">重新生成</button><button className="rounded-2xl bg-slate-950 px-4 py-2 text-sm text-white">下载报告</button></div></div><div className="mt-6 grid grid-cols-4 gap-4"><Metric label="监控运单" value="238" desc="今日加入" /><Metric label="异常运单" value="31" desc="异常率 13.0%" /><Metric label="高风险" value="8" desc="需人工复核" /><Metric label="规则误报疑似" value="9" desc="智能分析识别" /></div><div className="mt-6 grid grid-cols-2 gap-6"><Card className="p-5 shadow-none"><div className="font-semibold text-slate-950">重点异常</div><div className="mt-4 space-y-3">{waybills.slice(0, 3).map((w) => <div key={w.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><div><div className="text-sm font-medium">{w.plate} ｜ {w.alert}</div><div className="mt-1 text-xs text-slate-500">{w.route}</div></div><ChevronRight size={17} className="text-slate-400" /></div>)}</div></Card><Card className="p-5 shadow-none"><div className="font-semibold text-slate-950">智能体摘要</div><p className="mt-4 text-sm leading-7 text-slate-600">今日异常主要集中在停车异常和装车超时。承运商安捷物流预警数量最高，但其中 4 单为服务区合理停车，建议运营重点关注星河货运的 GPS 高风险运单，以及深圳二厂装车超时问题。</p><div className="mt-5 flex gap-2"><button className="flex-1 rounded-xl bg-slate-950 px-3 py-2 text-sm text-white">查看明细</button><button className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm">下载异常 Excel</button></div></Card></div></Card></div>;
}

function DownloadPage() {
  return <div><SectionTitle icon={Download} title="Excel 下载" desc="用户可用自然语言定义条件范围，下载前回显条件、预计条数和字段范围。" /><div className="grid grid-cols-[420px_1fr] gap-6"><Card className="p-6"><div className="font-semibold text-slate-950">自然语言下载任务</div><textarea className="mt-4 h-32 w-full resize-none rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-slate-950" defaultValue="下载今天所有 GPS 高风险和停车异常超过 2 小时的运单" /><div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><div className="font-medium text-slate-950">条件回显</div><div className="mt-2 space-y-1 text-xs leading-5"><div>日期：今天</div><div>异常类型：GPS 高风险、停车异常</div><div>停车时长：超过 2 小时</div><div>预计条数：12 条</div></div></div><button className="mt-4 w-full rounded-2xl bg-slate-950 py-3 text-sm font-medium text-white">确认生成 Excel</button></Card><Card className="overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["文件名", "条件", "条数", "状态", "创建时间", "操作"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{[["今日高风险异常运单.xlsx", "今天 / 高风险", "31", "已完成", "18:02"], ["本周停车异常明细.xlsx", "本周 / 停车异常", "86", "生成中", "17:48"], ["GPS高风险运单.xlsx", "本月 / GPS高风险", "4", "失败", "16:20"]].map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className="px-4 py-4">{i === 3 ? <ToneBadge tone={c === "已完成" ? "green" : c === "生成中" ? "blue" : "red"}>{c}</ToneBadge> : c}</td>)}<td className="px-4 py-4"><button className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs text-white">下载</button></td></tr>)}</tbody></table></Card></div></div>;
}

function ThresholdPage() {
  return <div><SectionTitle icon={SlidersHorizontal} title="阈值配置与智能建议" desc="智能体先回显当前阈值，再基于历史预警、误报反馈和运单分布给出建议。" /><div className="grid grid-cols-[1fr_420px] gap-6"><Card className="p-6"><div className="grid grid-cols-3 gap-4">{[["停车时长阈值", "60 分钟", "建议调整为 90 分钟"], ["装车超时阈值", "180 分钟", "建议保持不变"], ["卸车超时阈值", "120 分钟", "建议按工厂分层配置"]].map(([k, v, s]) => <div key={k} className="rounded-2xl border border-slate-200 p-5"><div className="text-sm text-slate-500">{k}</div><div className="mt-3 text-3xl font-semibold text-slate-950">{v}</div><div className="mt-3 text-xs leading-5 text-slate-500">{s}</div><button className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">查看建议</button></div>)}</div><Card className="mt-6 p-5 shadow-none"><div className="font-semibold text-slate-950">影响测算</div><div className="mt-4 grid grid-cols-4 gap-4"><Metric label="预计减少预警" value="7" desc="停车异常" /><Metric label="误报减少" value="4" desc="服务区停车" /><Metric label="漏报风险" value="低" desc="需观察 7 天" /><Metric label="影响线路" value="3" desc="长途干线" /></div></Card></Card><Card className="p-6"><div className="flex items-center gap-2 font-semibold text-slate-950"><MessageSquareText size={18} /> 智能体建议</div><p className="mt-4 text-sm leading-7 text-slate-600">当前项目停车阈值为 60 分钟。近 7 天停车异常 58 单，其中 21 单发生在服务区或加油站，智能分析判断合理停车 16 单。建议对长途线路将停车阈值调整为 90 分钟，并保留 GPS 高风险和非目的地卸货独立预警。</p><div className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">应用范围：上海嘉定 → 广州黄埔、苏州昆山 → 武汉东西湖、杭州萧山 → 合肥经开。</div><div className="mt-5 flex gap-2"><button className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white">应用建议</button><button className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm">暂不调整</button></div></Card></div></div>;
}

function App() {
  const [page, setPage] = useState("workspace");
  const [selectedProject, setSelectedProject] = useState(projects[0]);
  const content = useMemo(() => {
    switch (page) {
      case "login": return <LoginPreview />;
      case "workspace": return <Workspace selectedProject={selectedProject} setPage={setPage} />;
      case "projects": return <ProjectsPage />;
      case "waybills": return <WaybillsPage setPage={setPage} />;
      case "detail": return <DetailPage setPage={setPage} />;
      case "map": return <MapPage />;
      case "analytics": return <AnalyticsPage />;
      case "report": return <ReportPage />;
      case "download": return <DownloadPage />;
      case "threshold": return <ThresholdPage />;
      default: return <Workspace selectedProject={selectedProject} setPage={setPage} />;
    }
  }, [page, selectedProject]);
  return <AppShell page={page} setPage={setPage} selectedProject={selectedProject} setSelectedProject={setSelectedProject}>{content}</AppShell>;
}

export default App;
