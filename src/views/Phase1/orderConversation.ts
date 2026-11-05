import type { ChatMessage, Order, P1Order, P1State } from '@/views/AgentWork/interface';
import { usePhase1 } from '@/pinia/phase1';
import { dateText, parseLocal, sessionNames, stateNames } from './catalog';

const states: P1State[] = ['pending', 'loading', 'in_transit', 'arrived', 'completed'];
const signature = (o: P1Order) => JSON.stringify([o.state, o.enteredAt, o.departedAt, o.arrivedAt, o.completedAt]);
const reply = (text: string): ChatMessage => ({ role: 'agent', text });
function detail(o: Order) {
  const tracked=usePhase1().orders.find(order=>order.id===o.id);
  const facts=tracked?`\n计划出发：${dateText(tracked.plannedDeparture)}；计划到达：${dateText(tracked.plannedArrival)}\n装货：${dateText(tracked.enteredAt)}；发车：${dateText(tracked.departedAt)}；到达：${dateText(tracked.arrivedAt)}；完成：${dateText(tracked.completedAt)}\n监听：${sessionNames[tracked.session]}；截止${dateText(tracked.expiresAt)}`:'';
  return `${o.id} · ${o.plate}\n${o.route}\n状态：${o.status}；风险：${[...(o.risk==='无风险'&&o.riskTags?.length?[]:[o.risk]), ...(o.riskTags ?? [])].join('、')}\n异常：${o.issue}\n来源：${o.source}${o.billingExempt ? '；免计费' : ''}${facts}`;
}
export function projectOrderConversation(raw: string, projectId: string, orders: Order[], history: ChatMessage[]): ChatMessage | null {
  const store = usePhase1();
  const latest = [...history].reverse().find(m => m.orderAction)?.orderAction;
  if (/^(?:确认更新|取消更新)/.test(raw.trim())) {
    if (!latest || latest.projectId !== projectId || latest.status !== 'pending' || !raw.includes(latest.id)) return reply('这次确认已失效或不属于当前项目，请重新描述要修改的运单。');
    if (raw.startsWith('取消')) { latest.status = 'canceled'; return reply('已取消，运单状态和时间未改变。'); }
    const order = store.orders.find(o => o.id === latest.orderId && o.projectId === projectId);
    if (!order || store.now > latest.expiresAt || signature(order) !== latest.fingerprint) { latest.status = 'failed'; return reply('运单已更新或确认已过期，本次未保存。请重新查询后操作。'); }
    const error = store.updateConversationState(order.id, latest.target, latest.at);
    latest.status = error ? 'failed' : 'done';
    return reply(error ? `未保存：${error}` : `${order.id} · ${order.plate}\n已从${stateNames[latest.before]}更新为${stateNames[order.state]}；节点时间：${dateText(latest.at)}。\n触发方式：对话更新。监听：${sessionNames[order.session]}。${order.billingExempt ? '本单仍免计费，不恢复监听。' : ''}\n已执行当前配置下的经过记录及时效检查，未生成进出围栏事实。`);
  }
  const mutation = /(?:改为|改成|更新为|修改为|标记为|设置为|确认发车|确认到达|确认完成|这单发车了)/.test(raw) && !/^(?:查|查询|查看|是否|看看)/.test(raw.trim());
  const hasSubject = /运单|这单|那单|订单|哪些车|未入网|LD260|WB-MON|[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/i.test(raw) || orders.some(o => raw.toUpperCase().includes(o.id.toUpperCase()));
  if (!hasSubject || !mutation && !/查|看|哪些|多少|什么|状态|情况|未入网/.test(raw)) return null;
  if (!projectId) return reply('请先进入项目智能体工作台，再查询或修改该项目运单。');
  let matched = orders.filter(o => new RegExp(`(?:^|[^A-Z0-9-])${o.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Z0-9-])`, 'i').test(raw));
  const explicitId = /(?:LD\d+|WB-[A-Z0-9-]+|V\d+-WB\d+)/i.test(raw);
  const plate = raw.match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/i)?.[0];
  if (!matched.length && plate && !explicitId) matched = orders.filter(o => o.plate.toUpperCase() === plate.toUpperCase());
  if (!matched.length && /这单|那单|刚才/.test(raw) && !explicitId && !plate) {
    const id = [...history].reverse().find(m => m.orderQueryId)?.orderQueryId;
    matched = orders.filter(o => o.id === id);
    if (!matched.length) return reply('请提供运单号，当前对话没有唯一可指向的运单。');
  }
  if (!matched.length && !explicitId && !plate && !/这单|那单/.test(raw)) matched = orders;
  if (mutation) {
    if (/所有|全部|这些|批量/.test(raw) || matched.length !== 1) return reply(matched.length ? `请指定一张运单，本次未修改。当前匹配：${matched.map(o => o.id).join('、')}` : '当前项目未找到匹配运单，本次未修改。');
    const selected = matched[0]!;
    const target = /已完成|确认完成/.test(raw) ? 'completed' : /已到达|已到货|确认到达/.test(raw) ? 'arrived' : /在途|确认发车|发车了/.test(raw) ? 'in_transit' : /装货中/.test(raw) ? 'loading' : /待发车/.test(raw) ? 'pending' : undefined;
    if (!target) return reply('请说明要改成哪个运输状态：待发车、装货中、在途、已到达或已完成。');
    const order = store.orders.find(o => o.id === selected.id && o.projectId === projectId);
    if (!order) return reply(`${selected.id}尚未接入本期运单状态更新流程，本次未修改。`);
    if (states.indexOf(target) <= states.indexOf(order.state)) return reply(`当前为${stateNames[order.state]}，本次不回退或重复推进。时间纠正请使用运单详情中的状态纠正入口。`);
    let at = store.now;
    const time = raw.match(/(?:(\d{4}-\d{2}-\d{2})|(?:今天|昨天))?\s*(\d{1,2})(?::(\d{2})|点(\d{1,2})?)/);
    if (time) {
      const day = time[1] || dateText(store.now - (raw.includes('昨天') ? 86400000 : 0)).slice(0, 10);
      at = parseLocal(`${day} ${String(time[2]).padStart(2, '0')}:${String(time[3] || time[4] || '0').padStart(2, '0')}`);
    } else if (/时间|上午|下午|昨天|今天|刚才/.test(raw)) return reply('请补充明确的节点时间，例如“今天10:20”；本次未修改。');
    if (time && (+time[2] > 23 || +(time[3] || time[4] || '0') > 59) || !Number.isFinite(at) || at < order.createdAt || at > store.now) return reply('节点时间无效，须在运单创建时间与当前时间之间，本次未修改。');
    for (const action of history.map(m => m.orderAction).filter(Boolean)) if (action!.status === 'pending') action!.status = 'canceled';
    const action: NonNullable<ChatMessage['orderAction']> = { id: `UPDATE-${Date.now()}-${store.next('Q')}`, projectId, orderId: order.id, plate: order.plate, before: order.state, target, at, fingerprint: signature(order), expiresAt: store.now + 600000, status: 'pending' };
    return { ...reply(`${order.id} · ${order.plate}\n${stateNames[order.state]} → ${stateNames[target]}\n节点时间：${dateText(at)}${time ? '' : '（采用当前时间）'}。确认后保存，仅更新数字人，不回写灵动。${target === 'completed' ? '完成后结束本单监听。' : ''}`), orderAction: action, orderQueryId: order.id };
  }
  if (/未入网/.test(raw)) matched = matched.filter(o => o.riskTags?.includes('车辆未入网'));
  const state = /在途/.test(raw) ? '在途' : /已完成/.test(raw) ? '已完成' : /已到达/.test(raw) ? '已到达' : /装货中/.test(raw) ? '装货中' : /待发车/.test(raw) ? '待发车' : '';
  if (state && !explicitId && !plate && !/这单|那单|刚才/.test(raw)) matched = matched.filter(o => o.status === state);
  if (/晚到|晚发/.test(raw)) matched = matched.filter(o => o.issue.includes(raw.includes('晚到') ? '晚到' : '晚发'));
  if (/今天/.test(raw)) {
    const day = dateText(store.now).slice(0, 10);
    matched = matched.filter(o => /晚到/.test(raw) ? o.eta.startsWith(day) : o.startTime.startsWith(day));
  }
  if (!matched.length) return reply('当前项目未找到符合条件的运单。');
  const rows = matched.slice(0, 20).map(detail).join('\n\n');
  return { ...reply(`查询结果：${matched.length}单；${new Set(matched.map(o => o.plate)).size}辆车。数据截至${dateText(store.now)}。${matched.length > 20 ? '本次展示前20单，可到运单列表继续筛选。' : ''}\n${rows}`), orderQueryId: matched.length === 1 ? matched[0]!.id : undefined };
}
