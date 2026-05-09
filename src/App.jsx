import React, { useMemo, useState } from 'react';

const projectsSeed = [
  { id: 'P001', name: '华东干线在途监控', status: '已连接', sync: '2分钟前', total: 128, risk: 17 },
  { id: 'P002', name: '冷链城配项目', status: '授权失效', sync: '昨天 23:10', total: 64, risk: 9 },
  { id: 'P003', name: '西南工厂发运项目', status: '连接中', sync: '同步中', total: 83, risk: 6 },
];

const ordersSeed = [
  { id: 'WB20260509001', plate: '沪A12345', driver: '张师傅', carrier: '安捷物流', route: '上海工厂 → 广州仓', factory: '上海一厂', status: '在途', risk: '高风险', issue: '异常停车 / GPS疑似造假', source: '规则预警 + GPS分析', updated: '5分钟前', eta: '明日 02:30' },
  { id: 'WB20260509002', plate: '苏B88231', driver: '李师傅', carrier: '远恒运输', route: '苏州仓 → 杭州仓', factory: '苏州仓', status: '已到货', risk: '低风险', issue: '卸车超时', source: '规则预警', updated: '13分钟前', eta: '已到达' },
  { id: 'WB20260509003', plate: '粤B90877', driver: '王师傅', carrier: '安捷物流', route: '深圳仓 → 厦门仓', factory: '深圳仓', status: '在途', risk: '无风险', issue: '暂无', source: '无', updated: '18分钟前', eta: '今日 21:40' },
  { id: 'WB20260509004', plate: '川A66520', driver: '赵师傅', carrier: '顺达货运', route: '成都工厂 → 重庆仓', factory: '成都工厂', status: '装货中', risk: '高风险', issue: '装车超时', source: '规则预警', updated: '21分钟前', eta: '待发车' },
  { id: 'WB20260509005', plate: '浙C77812', driver: '陈师傅', carrier: '中联物流', route: '宁波港 → 合肥仓', factory: '宁波港', status: '在途', risk: '低风险', issue: '服务区长停', source: '智能轨迹分析', updated: '34分钟前', eta: '今日 23:20' },
  { id: 'WB20260509006', plate: '鲁D43190', driver: '刘师傅', carrier: '远恒运输', route: '青岛仓 → 济南仓', factory: '青岛仓', status: '已完成', risk: '无风险', issue: '暂无', source: '无', updated: '46分钟前', eta: '已完成' },
];

const timelineSeed = [
  { id: 1, type: 'normal', title: '运单创建', time: '08:05', place: '目标 TMS', desc: '系统同步到运单，进入项目运单池。' },
  { id: 2, type: 'normal', title: '加入在途监控', time: '08:07', place: '华东干线在途监控', desc: '符合项目筛选条件，进入在途监控范围。' },
  { id: 3, type: 'normal', title: '到达装货地', time: '09:10', place: '上海一厂', desc: '车辆进入装货地围栏。' },
  { id: 4, type: 'normal', title: '发车离场', time: '10:28', place: '上海一厂', desc: '车辆离开装货地围栏，进入在途阶段。' },
  { id: 5, type: 'stop', title: '异常停车事件', time: '13:42 - 15:21', place: 'G60 高速服务区附近', desc: '停车 99 分钟，超过项目配置阈值。', rule: '停车时长 99 分钟 > 阈值 60 分钟，命中停车异常。', agent: '停车点接近服务区，结合长途线路和同线路历史停车习惯，判定为低风险合理休息。' },
  { id: 6, type: 'stop', title: '异常停车事件', time: '17:06 - 18:40', place: '非目的地物流园', desc: '停车 94 分钟，POI 识别为物流园，非计划卸货地。', rule: '停车时长 94 分钟 > 阈值 60 分钟，命中停车异常。', agent: '停车点为非目的地物流园，距离卸货地 184km，存在疑似非目的地卸货风险。' },
  { id: 7, type: 'risk', title: 'GPS 风险事件', time: '19:12', place: '沪昆高速附近', desc: '轨迹出现断点和速度异常，外部算法输出高风险。' },
  { id: 8, type: 'normal', title: '预计到达卸货地', time: '明日 02:30', place: '广州仓', desc: '按当前速度预计存在 40 分钟延误风险。' },
];

const quickPrompts = ['查看今日高风险运单', '查看所有运单', '只看沪A12345异常停车事件', '下载今天异常运单', '生成今日异常报告'];

function getRiskOrders(list) {
  return list.filter((item) => item.risk === '高风险' || item.risk === '低风险');
}

function runPrototypeTests() {
  const riskOrders = getRiskOrders(ordersSeed);
  console.assert(ordersSeed.length === 6, '运单列表应展示全部运单');
  console.assert(riskOrders.length === 4, '异常运单列表应展示高风险和低风险运单');
  console.assert(riskOrders.every((item) => item.risk !== '无风险'), '异常运单列表不得包含无风险运单');
  console.assert(timelineSeed.filter((item) => item.type === 'stop').length === 2, '异常停车筛选结果应为 2 条');
}
runPrototypeTests();

const iconPaths = {
  bot: 'M12 8V4m-4 4h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4Zm-1 5H8m8 0h-3',
  check: 'M20 6 9 17l-5-5',
  chevron: 'M9 18l6-6-6-6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6',
  filter: 'M3 5h18l-7 8v5l-4 2v-7z',
  gauge: 'M4 14a8 8 0 0 1 16 0M12 14l4-4M6 18h12',
  map: 'M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Zm0 0V3m6 18V6',
  msg: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M21 12a9 9 0 0 1-15 6.7M3 12a9 9 0 0 1 15-6.7M18 3v5h-5M6 21v-5h5',
  search: 'M21 21l-4.3-4.3M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M4.9 4.9 7 7m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17m10-10 2.1-2.1',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm0-14v5m0 4h.01',
  truck: 'M3 7h11v10H3zM14 11h4l3 3v3h-7zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  x: 'M18 6 6 18M6 6l12 12',
  zap: 'M13 2 3 14h8l-1 8 10-12h-8z',
  user: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
};

function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name] || iconPaths.file} />
    </svg>
  );
}

function Badge({ children, tone = 'gray' }) {
  const cls = {
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-slate-50 text-slate-600 border-slate-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function PageTitle({ icon = 'file', title, desc, action }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-slate-900 p-2 text-white"><Icon name={icon} size={18} /></div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><Icon name="x" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AppShell() {
  const [page, setPage] = useState('agent');
  const [projects, setProjects] = useState(projectsSeed);
  const [currentProject, setCurrentProject] = useState(projectsSeed[0]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [toast, setToast] = useState('');
  const [downloadTask, setDownloadTask] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(ordersSeed[0]);

  const navs = [
    { id: 'agent', label: '智能体工作台', icon: 'bot' },
    { id: 'orders', label: '运单列表', icon: 'list' },
    { id: 'risk', label: '异常运单列表', icon: 'shield' },
    { id: 'detail', label: '运单详情与地图', icon: 'map' },
    { id: 'analytics', label: '统计归因', icon: 'gauge' },
    { id: 'report', label: '每日报告', icon: 'file' },
    { id: 'projects', label: '项目管理', icon: 'settings' },
    { id: 'downloads', label: '下载任务', icon: 'download' },
  ];

  function showToast(text) {
    setToast(text);
    window.setTimeout(() => setToast(''), 1800);
  }

  function openOrderDetail(order) {
    setSelectedOrder(order);
    setPage('detail');
  }

  function createDownload(scope) {
    setDownloadTask({ scope, status: '生成中', progress: 35 });
    setPage('downloads');
    showToast('已创建下载任务');
    window.setTimeout(() => setDownloadTask({ scope, status: '已完成', progress: 100 }), 1200);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {toast && <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white"><Icon name="truck" size={21} /></div>
          <div>
            <div className="font-semibold">在途物流智能体</div>
            <div className="text-xs text-slate-500">TMS 连接 · 在途监控 · 异常分析</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Badge tone={currentProject.status === '已连接' ? 'green' : currentProject.status === '授权失效' ? 'orange' : 'blue'}>{currentProject.status}</Badge>
          <span>{currentProject.name}</span>
          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Icon name="user" size={14} /> alfred</span>
        </div>
      </header>

      <div className="grid grid-cols-[260px_1fr]">
        <aside className="min-h-[calc(100vh-64px)] border-r border-slate-200 bg-white p-4">
          <button onClick={() => setShowProjectModal(true)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800">
            <Icon name="plus" size={16} /> 新建项目
          </button>

          <div className="mb-5 space-y-2">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">项目</div>
            {projects.map((p) => (
              <button key={p.id} onClick={() => { setCurrentProject(p); showToast(`已切换到：${p.name}`); }} className={`w-full rounded-2xl border p-3 text-left transition ${currentProject.id === p.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900">{p.name}</div>
                  <Icon name="chevron" size={15} className="text-slate-400" />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span>{p.total} 单</span><span>·</span><span>{p.risk} 异常</span>
                </div>
                <div className="mt-2"><Badge tone={p.status === '已连接' ? 'green' : p.status === '授权失效' ? 'orange' : 'blue'}>{p.status}</Badge></div>
              </button>
            ))}
          </div>

          <nav className="space-y-1">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">菜单</div>
            {navs.map((n) => (
              <button key={n.id} onClick={() => setPage(n.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${page === n.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icon name={n.icon} size={17} /> {n.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="p-6">
          {page === 'agent' && <AgentPage setPage={setPage} createDownload={createDownload} openOrderDetail={openOrderDetail} />}
          {page === 'orders' && <OrdersPage openOrderDetail={openOrderDetail} createDownload={createDownload} />}
          {page === 'risk' && <RiskOrdersPage openOrderDetail={openOrderDetail} createDownload={createDownload} />}
          {page === 'detail' && <DetailMapPage order={selectedOrder} />}
          {page === 'analytics' && <AnalyticsPage setPage={setPage} />}
          {page === 'report' && <ReportPage setPage={setPage} createDownload={createDownload} />}
          {page === 'projects' && <ProjectsPage projects={projects} setProjects={setProjects} setShowProjectModal={setShowProjectModal} showToast={showToast} />}
          {page === 'downloads' && <DownloadsPage downloadTask={downloadTask} createDownload={createDownload} />}
        </main>
      </div>

      {showProjectModal && (
        <Modal title="新建项目" onClose={() => setShowProjectModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="项目名称" />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="目标 TMS 地址" />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="TMS 登录用户" />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="运单关键词" />
              <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option>在途</option><option>装货中</option><option>已到货</option></select>
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="停车阈值，例如 60 分钟" />
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              首次创建项目需要完成用户授权的目标 TMS 系统连接。连接成功后，系统将持续同步目标 TMS 运单并加入在途监控。
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowProjectModal(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">取消</button>
              <button onClick={() => { setProjects((prev) => [{ id: `P00${prev.length + 1}`, name: '新建演示项目', status: '已连接', sync: '刚刚', total: 0, risk: 0 }, ...prev]); setShowProjectModal(false); showToast('项目创建成功'); }} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">创建并连接</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AgentPage({ setPage, createDownload, openOrderDetail }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'agent', text: '今日已同步 128 单，已加入在途监控 128 单。当前高风险 6 单、低风险 11 单。' },
    { role: 'agent', text: '发现 2 单非目的地物流园长停、1 单 GPS 轨迹疑似造假，建议优先复核。' },
  ]);
  const [panel, setPanel] = useState('overview');

  function send(text = input) {
    if (!text.trim()) return;
    const next = [...messages, { role: 'user', text }];
    let reply = '已处理你的请求。';
    if (text.includes('所有运单')) { reply = '已查询当前项目全部运单。'; setPanel('orders'); setPage('orders'); }
    if (text.includes('异常') || text.includes('高风险')) { reply = '已筛选今日高风险和低风险运单，高风险已置顶。'; setPanel('risk'); setPage('risk'); }
    if (text.includes('停车') || text.includes('沪A12345')) { reply = '已定位到沪A12345的异常停车事件。'; setPanel('detail'); openOrderDetail(ordersSeed[0]); }
    if (text.includes('下载')) { reply = '已按“今日异常运单”创建 Excel 下载任务。'; setPanel('download'); createDownload('今日异常运单'); }
    if (text.includes('报告')) { reply = '已生成今日异常报告摘要。'; setPanel('report'); setPage('report'); }
    setMessages([...next, { role: 'agent', text: reply }]);
    setInput('');
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <Card className="flex h-[calc(100vh-112px)] flex-col overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <PageTitle icon="msg" title="智能体工作台" desc="查询、筛选、分析、下载和报告生成" />
        </div>
        <div className="flex-1 space-y-4 overflow-auto bg-slate-50 p-5">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === 'user' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>{m.text}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {quickPrompts.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-900 hover:text-slate-900">{s}</button>)}
          </div>
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="输入查询，例如：今天有哪些异常运单" />
            <button onClick={() => send()} className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white">发送</button>
          </div>
        </div>
      </Card>

      <RightPanel panel={panel} setPanel={setPanel} setPage={setPage} openOrderDetail={openOrderDetail} createDownload={createDownload} />
    </div>
  );
}

function RightPanel({ panel, setPanel, setPage, openOrderDetail, createDownload }) {
  const visiblePanel = ['overview', 'risk', 'report'].includes(panel) ? panel : 'overview';

  return (
    <Card className="flex h-[calc(100vh-112px)] flex-col overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">输出结果</h2>
            <p className="mt-1 text-sm text-slate-500">预警汇总、运单结果、分析结论</p>
          </div>
          <Badge tone="green">实时同步</Badge>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Metric label="监控运单" value="128" />
          <Metric label="异常运单" value="17" tone="red" />
          <Metric label="高风险" value="6" tone="red" />
          <Metric label="低风险" value="11" tone="orange" />
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
          {[
            ['overview', '概览'],
            ['risk', '异常运单'],
            ['report', '日报摘要'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setPanel(key)} className={`flex-1 rounded-lg px-3 py-2 ${visiblePanel === key ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 p-5">
        {visiblePanel === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-sm font-semibold">今日异常趋势</div>
                <div className="flex h-36 items-end gap-2 rounded-xl bg-slate-50 p-3">
                  {[8, 12, 9, 15, 17, 13, 20].map((h, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded-t-lg bg-slate-900" style={{ height: h * 4 }} />
                      <span className="text-[10px] text-slate-400">D{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-sm font-semibold">风险来源</div>
                <div className="space-y-3 text-sm">
                  <Progress label="规则预警" value="9" width="72%" />
                  <Progress label="智能轨迹分析" value="5" width="48%" />
                  <Progress label="GPS 造假分析" value="3" width="32%" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">智能体结论</div>
                <button onClick={() => setPage('analytics')} className="text-xs font-medium text-slate-900">查看统计归因</button>
              </div>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="rounded-xl bg-red-50 p-3 text-red-700">今日异常率 13.3%，较昨日上升 2.1 个百分点。</div>
                <div className="rounded-xl bg-orange-50 p-3 text-orange-700">异常主要集中在安捷物流和上海工厂 → 广州仓线路。</div>
                <div className="rounded-xl bg-slate-50 p-3">建议优先复核非目的地物流园长停，以及 GPS 高风险轨迹段。</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setPage('risk')} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">查看异常运单</button>
              <button onClick={() => setPage('orders')} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">查看全部运单</button>
            </div>
          </div>
        )}

        {visiblePanel === 'risk' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">异常运单</div>
                <button onClick={() => setPage('risk')} className="text-xs font-medium text-slate-900">进入列表</button>
              </div>
              <div className="space-y-3">
                {getRiskOrders(ordersSeed).map((o) => (
                  <button key={o.id} onClick={() => openOrderDetail(o)} className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{o.plate} · {o.id}</div>
                        <div className="mt-1 text-sm text-slate-500">{o.route}</div>
                      </div>
                      <Badge tone={o.risk === '高风险' ? 'red' : 'orange'}>{o.risk}</Badge>
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{o.issue}</div>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => createDownload('今日异常运单')} className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">下载今日异常运单</button>
          </div>
        )}

        {visiblePanel === 'report' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">每日异常报告</div>
                  <div className="mt-1 text-xs text-slate-500">2026-05-09 · 华东干线在途监控</div>
                </div>
                <Badge tone="blue">已生成</Badge>
              </div>
              <div className="space-y-3 text-sm text-slate-700">
                <div className="rounded-xl bg-slate-50 p-3"><b>核心结论：</b>异常率上升，主要来自安捷物流和华东干线。</div>
                <div className="rounded-xl bg-slate-50 p-3"><b>风险建议：</b>优先处理 2 单非目的地物流园长停。</div>
                <div className="rounded-xl bg-slate-50 p-3"><b>阈值建议：</b>服务区停车误报较多，可评估长途线路阈值。</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setPage('report')} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">查看完整报告</button>
              <button onClick={() => createDownload('今日报告明细')} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">下载报告明细</button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Progress({ label, value, width }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500"><span>{label}</span><span>{value} 单</span></div>
      <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-slate-900" style={{ width }} /></div>
    </div>
  );
}

function OrdersPage({ openOrderDetail, createDownload }) {
  const [risk, setRisk] = useState('全部');
  const [status, setStatus] = useState('全部');
  const [keyword, setKeyword] = useState('');
  const filtered = useMemo(() => ordersSeed.filter((o) => (risk === '全部' || o.risk === risk) && (status === '全部' || o.status === status) && (keyword === '' || `${o.id}${o.plate}${o.carrier}${o.route}`.includes(keyword))), [risk, status, keyword]);

  return <ListPage title="运单列表" desc="当前项目全部运单" list={filtered} openOrderDetail={openOrderDetail} createDownload={() => createDownload('当前运单列表筛选结果')} controls={<>
    <Select label="风险状态" value={risk} onChange={setRisk} options={['全部', '高风险', '低风险', '无风险']} />
    <Select label="运单状态" value={status} onChange={setStatus} options={['全部', '在途', '装货中', '已到货', '已完成']} />
    <SearchBox value={keyword} onChange={setKeyword} />
  </>} />;
}

function RiskOrdersPage({ openOrderDetail, createDownload }) {
  const [risk, setRisk] = useState('全部异常');
  const [source, setSource] = useState('全部来源');
  const list = useMemo(() => getRiskOrders(ordersSeed).filter((o) => risk === '全部异常' || o.risk === risk).filter((o) => source === '全部来源' || o.source.includes(source)), [risk, source]);

  return <ListPage title="异常运单列表" desc="高风险、低风险运单" list={list} openOrderDetail={openOrderDetail} createDownload={() => createDownload('当前异常运单筛选结果')} controls={<>
    <Select label="风险分组" value={risk} onChange={setRisk} options={['全部异常', '高风险', '低风险']} />
    <Select label="风险来源" value={source} onChange={setSource} options={['全部来源', '规则预警', '智能轨迹分析', 'GPS分析']} />
  </>} />;
}

function Select({ label, value, onChange, options }) {
  return <label className="text-xs text-slate-500"><span className="mb-1 block">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{options.map((o) => <option key={o}>{o}</option>)}</select></label>;
}

function SearchBox({ value, onChange }) {
  return <label className="min-w-[280px] flex-1 text-xs text-slate-500"><span className="mb-1 block">关键词</span><div className="flex items-center rounded-xl border border-slate-200 bg-white px-3"><Icon name="search" size={15} className="text-slate-400" /><input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-2 text-sm outline-none" placeholder="运单号 / 车牌 / 承运商 / 线路" /></div></label>;
}

function ListPage({ title, desc, list, controls, openOrderDetail, createDownload }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <PageTitle icon="list" title={title} desc={desc} action={<button onClick={createDownload} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"><Icon name="download" size={15} className="mr-1 inline" /> 下载当前结果</button>} />
        <div className="grid grid-cols-4 gap-3">
          <Metric label="全部" value={ordersSeed.length} />
          <Metric label="高风险" value={ordersSeed.filter((o) => o.risk === '高风险').length} tone="red" />
          <Metric label="低风险" value={ordersSeed.filter((o) => o.risk === '低风险').length} tone="orange" />
          <Metric label="无风险" value={ordersSeed.filter((o) => o.risk === '无风险').length} tone="green" />
        </div>
      </Card>
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">{controls}</div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">运单</th><th className="p-3">线路</th><th className="p-3">状态</th><th className="p-3">风险</th><th className="p-3">异常说明</th><th className="p-3">预计到达</th><th className="p-3">操作</th></tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {list.map((o) => <tr key={o.id} className="hover:bg-slate-50"><td className="p-3"><div className="font-medium">{o.id}</div><div className="text-xs text-slate-500">{o.plate} · {o.driver}</div></td><td className="p-3"><div>{o.route}</div><div className="text-xs text-slate-500">{o.carrier}</div></td><td className="p-3"><Badge tone="blue">{o.status}</Badge></td><td className="p-3"><Badge tone={o.risk === '高风险' ? 'red' : o.risk === '低风险' ? 'orange' : 'green'}>{o.risk}</Badge></td><td className="p-3 text-slate-600"><div>{o.issue}</div><div className="text-xs text-slate-400">{o.source}</div></td><td className="p-3 text-slate-600">{o.eta}</td><td className="p-3"><button onClick={() => openOrderDetail(o)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-900 hover:text-white">查看详情</button></td></tr>)}
              {list.length === 0 && <tr><td colSpan="7" className="p-8 text-center text-slate-400">暂无符合条件的数据</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, tone = 'gray' }) {
  const toneCls = { red: 'text-red-600', orange: 'text-orange-600', green: 'text-emerald-600', gray: 'text-slate-900' }[tone];
  return <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div></div>;
}

function DetailMapPage({ order }) {
  const [view, setView] = useState('rule');
  const [onlyStop, setOnlyStop] = useState(false);
  const events = onlyStop ? timelineSeed.filter((e) => e.type === 'stop') : timelineSeed;
  const current = order || ordersSeed[0];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <PageTitle icon="map" title="运单详情与地图轨迹" desc={`${current.id} · ${current.plate}`} />
        <div className="grid grid-cols-6 gap-3 text-sm">
          <Info label="运单" value={current.id} />
          <Info label="车牌" value={current.plate} />
          <Info label="司机" value={current.driver} />
          <Info label="承运商" value={current.carrier} />
          <Info label="状态" value={current.status} />
          <Info label="风险" value={current.risk} danger={current.risk === '高风险'} />
        </div>
      </Card>

      <div className="grid grid-cols-[1.15fr_0.85fr] gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div className="font-semibold">地图轨迹</div>
            <div className="flex gap-2"><Badge tone="red">异常停车点 2</Badge><Badge tone="purple">GPS 风险段 1</Badge></div>
          </div>
          <div className="relative h-[590px] bg-[radial-gradient(circle_at_20%_20%,#dbeafe,transparent_28%),radial-gradient(circle_at_80%_50%,#fee2e2,transparent_24%),linear-gradient(135deg,#f8fafc,#e2e8f0)] p-5">
            <div className="absolute left-10 top-20 rounded-2xl bg-white px-3 py-2 text-xs shadow">装货地 · 上海一厂</div>
            <div className="absolute bottom-16 right-10 rounded-2xl bg-white px-3 py-2 text-xs shadow">卸货地 · 广州仓</div>
            <div className="absolute left-[18%] top-[26%] h-2 w-2 rounded-full bg-slate-900" />
            <div className="absolute left-[24%] top-[33%] h-2 w-2 rounded-full bg-slate-900" />
            <div className="absolute left-[34%] top-[41%] h-4 w-4 rounded-full border-4 border-red-500 bg-white shadow-lg" />
            <div className="absolute left-[52%] top-[54%] h-4 w-4 rounded-full border-4 border-red-500 bg-white shadow-lg" />
            <div className="absolute left-[68%] top-[63%] h-4 w-4 rounded-full border-4 border-purple-500 bg-white shadow-lg" />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 590" fill="none"><path d="M90 110 C180 160, 240 190, 300 230 S440 310, 520 335 S630 390, 715 500" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 10" /></svg>
            <div className="absolute left-[35%] top-[45%] rounded-xl bg-white p-3 text-xs shadow-xl"><b>异常停车</b><br />G60 服务区附近<br />规则：异常 · 智能体：低风险合理休息</div>
            <div className="absolute left-[53%] top-[58%] rounded-xl bg-white p-3 text-xs shadow-xl"><b>异常停车</b><br />非目的地物流园<br />智能体：高风险，建议复核</div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="font-semibold">事件 Timeline</div>
            <button onClick={() => setOnlyStop(!onlyStop)} className={`rounded-xl px-3 py-2 text-xs font-medium ${onlyStop ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon name="filter" size={14} className="mr-1 inline" /> 只看异常停车事件</button>
          </div>
          <div className="mb-4 flex rounded-xl bg-slate-100 p-1 text-xs">
            <button onClick={() => setView('rule')} className={`flex-1 rounded-lg px-3 py-2 ${view === 'rule' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>规则判断</button>
            <button onClick={() => setView('agent')} className={`flex-1 rounded-lg px-3 py-2 ${view === 'agent' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>智能体判断</button>
          </div>
          <div className="max-h-[530px] space-y-3 overflow-auto pr-1">
            {events.map((e) => <div key={e.id} className={`rounded-2xl border p-3 ${e.type === 'stop' ? 'border-red-200 bg-red-50' : e.type === 'risk' ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between"><div className="font-medium text-sm">{e.title}</div><div className="text-xs text-slate-500">{e.time}</div></div>
              <div className="mt-1 text-xs text-slate-500">{e.place}</div>
              <div className="mt-2 text-sm text-slate-600">{e.desc}</div>
              {e.type === 'stop' && <div className="mt-3 rounded-xl bg-white p-3 text-xs leading-5 text-slate-700">{view === 'rule' ? e.rule : e.agent}</div>}
            </div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value, danger }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 truncate text-sm font-semibold ${danger ? 'text-red-600' : 'text-slate-900'}`}>{value}</div></div>;
}

function AnalyticsPage({ setPage }) {
  return (
    <div className="space-y-4">
      <Card className="p-5"><PageTitle icon="gauge" title="统计归因" desc="按时间、承运商、线路、工厂和风险来源分析异常变化" />
        <div className="grid grid-cols-4 gap-3"><Metric label="今日异常" value="17" tone="red" /><Metric label="高风险" value="6" tone="red" /><Metric label="低风险" value="11" tone="orange" /><Metric label="异常率" value="13.3%" /></div>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4"><div className="mb-4 font-semibold">异常趋势</div><div className="flex h-60 items-end gap-3 rounded-2xl bg-slate-50 p-4">{[8, 12, 9, 15, 17, 13, 20].map((h, i) => <div key={i} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-xl bg-slate-900" style={{ height: h * 7 }} /><span className="text-xs text-slate-400">D{i + 1}</span></div>)}</div></Card>
        <Card className="p-4"><div className="mb-4 font-semibold">异常归因</div><div className="space-y-3 text-sm text-slate-600"><div className="rounded-xl bg-red-50 p-3 text-red-700">安捷物流异常增量占比 42%，高于项目平均水平。</div><div className="rounded-xl bg-orange-50 p-3 text-orange-700">上海工厂 → 广州仓线路服务区长停增加。</div><div className="rounded-xl bg-slate-50 p-3">异常数量和异常率同步上升，非单纯运单量增加导致。</div><button onClick={() => setPage('risk')} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">查看异常运单</button></div></Card>
      </div>
      <Card className="p-4"><div className="mb-3 font-semibold">承运商异常排名</div><div className="space-y-3">{['安捷物流', '远恒运输', '顺达货运', '中联物流'].map((name, index) => <div key={name} className="flex items-center gap-3"><div className="w-20 text-sm text-slate-600">{name}</div><div className="h-3 flex-1 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-slate-900" style={{ width: `${76 - index * 14}%` }} /></div><div className="w-10 text-right text-sm font-medium">{17 - index * 3}</div></div>)}</div></Card>
    </div>
  );
}

function ReportPage({ setPage, createDownload }) {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <PageTitle icon="file" title="每日在途异常报告" desc="2026-05-09 · 华东干线在途监控" action={<button onClick={() => createDownload('今日报告异常明细')} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">下载明细</button>} />
        <div className="mb-5 grid grid-cols-4 gap-3"><Metric label="全部运单" value="128" /><Metric label="异常运单" value="17" tone="red" /><Metric label="高风险" value="6" tone="red" /><Metric label="低风险" value="11" tone="orange" /></div>
        <div className="space-y-3 text-sm text-slate-700">
          <div className="rounded-2xl bg-slate-50 p-4"><b>核心结论：</b>今日异常率 13.3%，较昨日上升 2.1 个百分点，主要集中在安捷物流和上海工厂 → 广州仓线路。</div>
          <div className="rounded-2xl bg-slate-50 p-4"><b>风险建议：</b>优先复核 2 单非目的地物流园异常停车，关注 GPS 高风险轨迹段。</div>
          <div className="rounded-2xl bg-slate-50 p-4"><b>阈值建议：</b>服务区停车误报较多，可单独评估长途线路停车阈值。</div>
        </div>
        <div className="mt-6 flex gap-3"><button onClick={() => setPage('risk')} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">查看异常运单</button><button onClick={() => setPage('orders')} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">查看全部运单</button></div>
      </Card>
    </div>
  );
}

function ProjectsPage({ projects, setProjects, setShowProjectModal, showToast }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <PageTitle icon="settings" title="项目管理" desc="项目连接、同步状态和监控条件" action={<button onClick={() => setShowProjectModal(true)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white"><Icon name="plus" size={15} className="mr-1 inline" /> 新建项目</button>} />
        <div className="space-y-3">{projects.map((p, i) => <div key={p.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4"><div><div className="font-medium">{p.name}</div><div className="mt-1 text-sm text-slate-500">最近同步：{p.sync} · {p.total} 单 · 异常 {p.risk} 单</div></div><div className="flex items-center gap-2"><Badge tone={p.status === '已连接' ? 'green' : p.status === '授权失效' ? 'orange' : 'blue'}>{p.status}</Badge><button onClick={() => showToast('连接状态已刷新')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><Icon name="refresh" size={13} className="mr-1 inline" />刷新</button><button onClick={() => { setProjects((prev) => prev.filter((_, idx) => idx !== i)); showToast('项目已删除'); }} className="rounded-xl border border-red-200 px-3 py-2 text-xs text-red-600">删除</button></div></div>)}</div>
      </Card>
    </div>
  );
}

function DownloadsPage({ downloadTask, createDownload }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <PageTitle icon="download" title="下载任务" desc="Excel 文件生成与下载" action={<button onClick={() => createDownload('今日异常运单')} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">新建下载</button>} />
        {!downloadTask && <div className="rounded-2xl bg-slate-50 p-10 text-center text-slate-500"><Icon name="download" size={28} className="mx-auto mb-3" />暂无下载任务</div>}
        {downloadTask && <div className="rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between"><div><div className="font-semibold">{downloadTask.scope}.xlsx</div><div className="mt-1 text-sm text-slate-500">范围：{downloadTask.scope}</div></div><Badge tone={downloadTask.status === '已完成' ? 'green' : 'blue'}>{downloadTask.status}</Badge></div><div className="mt-5 h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-slate-900 transition-all" style={{ width: `${downloadTask.progress}%` }} /></div><div className="mt-5 flex gap-2"><button disabled={downloadTask.status !== '已完成'} className={`rounded-xl px-4 py-2 text-sm ${downloadTask.status === '已完成' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>下载文件</button><button onClick={() => createDownload(downloadTask.scope)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">重新生成</button></div></div>}
      </Card>
    </div>
  );
}

export default function LogisticsIntransitAgentPrototype() {
  return <AppShell />;
}
