import type { DailyTask, TaskRun } from './dailyTasks';
import type { EmailOrderResult, EmailOrderScenario } from './interface';
import { emailDemoMailbox } from '@/pinia/projectMailboxes';

export { emailDemoMailbox } from '@/pinia/projectMailboxes';
export const emailDemoStepDelay = 1800;
export const emailDemoScenarios: { id: EmailOrderScenario; label: string }[] = [
  { id: 'both', label: '装货、到达时间都有' },
  { id: 'arrival', label: '只有到达时间 · 倒推装货' },
  { id: 'loading', label: '只有装货时间 · 推算到达' },
  { id: 'flexible', label: '未指定时间 · 建议安排' },
  { id: 'duration', label: '装货后 24 小时内到达' },
];

const hour = 3600000;
const day = 24 * hour;
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const clockFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function emailTimeRange(start: number, end: number) {
  if (start === end) return timeFormat.format(start);
  return `${timeFormat.format(start)}–${dateFormat.format(start) === dateFormat.format(end) ? clockFormat.format(end) : timeFormat.format(end)}`;
}

interface MailExample {
  subject: string;
  senderName: string;
  sender: string;
  origin: string;
  destination: string;
  cargo: EmailOrderResult['order']['cargo'];
  handling: string;
  vehicle: string;
  maxWeight: number;
  maxVolume: number;
  drivingHours: number;
  loadingHours: number;
  bufferHours: number;
  market: EmailOrderResult['market'];
}

const examples: Record<Exclude<EmailOrderScenario, 'duration'>, MailExample> = {
  both: {
    subject: '苏州至杭州日用品运输安排', senderName: '陈琳 · 华东商贸', sender: 'chen.lin@customer.example.com',
    origin: '江苏省苏州市相城区 · 华东商贸仓', destination: '浙江省杭州市余杭区 · 良渚配送中心',
    cargo: [{ name: '日用品', quantity: 600, unit: '箱', weight: 6, volume: 24 }, { name: '厨房用品', quantity: 400, unit: '箱', weight: 4, volume: 16 }],
    handling: '纸箱包装，可堆码，需防雨防潮。', vehicle: '9.6 米厢式货车', maxWeight: 12, maxVolume: 50,
    drivingHours: 4, loadingHours: 2, bufferHours: 1,
    market: { availableCount: 9, radius: 30, supply: '充足', difficulty: '容易找车', supplyReason: '周边有 9 辆适配厢车，其中 4 辆预计明早可到场，满足本单 1 辆需求。', price: '与平时基本持平', priceReason: '同线路、同车型近期供需稳定，调车距离较短。' },
  },
  arrival: {
    subject: '宁波至合肥设备配件，请安排明晚前送达', senderName: '周伟 · 甬港机电', sender: 'zhou.wei@customer.example.com',
    origin: '浙江省宁波市北仑区 · 甬港机电仓', destination: '安徽省合肥市肥西县 · 机电产业园',
    cargo: [{ name: '设备配件', quantity: 48, unit: '木箱', weight: 24, volume: 80 }],
    handling: '木箱包装，可堆码，仓库提供叉车装卸。', vehicle: '9.6 米厢式货车', maxWeight: 12, maxVolume: 50,
    drivingHours: 8, loadingHours: 2, bufferHours: 2,
    market: { availableCount: 3, radius: 50, supply: '偏紧', difficulty: '较难找车', supplyReason: '周边适配车辆 3 辆，其中 2 辆可在明早 07:00 前到场，刚好满足本单需求，需提前落实车辆。', price: '略高于平时', priceReason: '早班可用车较少，且有一辆需从约 45 公里外调入。' },
  },
  loading: {
    subject: '上海至南京服装发货，明日上午装车', senderName: '林敏 · 锦程服饰', sender: 'lin.min@customer.example.com',
    origin: '上海市嘉定区 · 锦程服饰仓', destination: '江苏省南京市江宁区 · 服饰分拨仓',
    cargo: [{ name: '成衣', quantity: 320, unit: '箱', weight: 3.2, volume: 18 }],
    handling: '纸箱包装，可堆码，需使用封闭车厢。', vehicle: '6.8 米厢式货车', maxWeight: 6, maxVolume: 30,
    drivingHours: 4, loadingHours: 1, bufferHours: 1,
    market: { availableCount: 8, radius: 30, supply: '充足', difficulty: '容易找车', supplyReason: '周边有 8 辆适配车辆，3 辆为南京方向返程车，明早装货前可到场。', price: '略低于平时', priceReason: '附近有南京方向返程车，可减少空驶，报价预计略低。' },
  },
  flexible: {
    subject: '佛山至东莞包装材料运输', senderName: '黄莉 · 南粤包装', sender: 'huang.li@customer.example.com',
    origin: '广东省佛山市南海区 · 南粤包装厂', destination: '广东省东莞市厚街镇 · 包装材料仓',
    cargo: [{ name: '包装材料', quantity: 800, unit: '箱', weight: 8, volume: 32 }],
    handling: '纸箱包装，可堆码，需防潮。', vehicle: '9.6 米厢式货车', maxWeight: 12, maxVolume: 50,
    drivingHours: 3, loadingHours: 1, bufferHours: 1,
    market: { availableCount: 5, radius: 30, supply: '充足', difficulty: '容易找车', supplyReason: '周边 5 辆适配厢车中，2 辆可安排次日上午到场。', price: '与平时基本持平', priceReason: '线路短途车源稳定，按常规装货时段安排。' },
  },
};

export function createEmailOrder(scenario: EmailOrderScenario, receivedAt: number, sequence: number, mailbox = emailDemoMailbox): EmailOrderResult {
  const example = scenario === 'duration' ? { ...examples.loading, subject: '上海至南京服装运输，装货后 24 小时内到达' } : examples[scenario];
  const tomorrow = new Date(`${dateFormat.format(receivedAt + day)}T00:00:00+08:00`).getTime();
  const durationHours = example.loadingHours + example.drivingHours + example.bufferHours;
  const deadline = tomorrow + 20 * hour;
  const loadingEnd = scenario === 'arrival' ? deadline - durationHours * hour : tomorrow + (scenario === 'both' ? 11 : 10) * hour;
  const loadingStart = scenario === 'arrival' ? loadingEnd - hour : tomorrow + 9 * hour;
  const timing: EmailOrderResult['timing'] = {
    loadingStart, loadingEnd,
    arrivalStart: scenario === 'both' ? deadline : loadingStart + durationHours * hour,
    arrivalEnd: scenario === 'both' ? deadline : loadingEnd + durationHours * hour,
    loadingSource: scenario === 'both' || scenario === 'loading' || scenario === 'duration' ? '客户要求' : '预计安排',
    arrivalSource: scenario === 'both' || scenario === 'arrival' ? '客户要求' : '预计安排',
    latestLoadingAt: scenario === 'arrival' ? loadingEnd : undefined,
    basis: scenario === 'both' ? '按客户约定的装货时段和最晚到达时间安排车辆。'
      : scenario === 'duration' ? `按客户要求，装货后 24 小时内到达；以 ${timeFormat.format(loadingStart)} 开始装货计算，最晚 ${timeFormat.format(loadingStart + day)} 到达。预计装货 ${example.loadingHours} 小时、运输 ${example.drivingHours} 小时、途中停留及机动预留 ${example.bufferHours} 小时，共 ${durationHours} 小时。`
      : `${scenario === 'arrival' ? '从最晚到达时间倒推：' : scenario === 'flexible' ? '按附近车辆次日上午可到场安排：' : '从客户装货时段顺推：'}装货 ${example.loadingHours} 小时，运输 ${example.drivingHours} 小时，途中停留及机动预留 ${example.bufferHours} 小时，共 ${durationHours} 小时。`,
  };
  const totalWeight = Number(example.cargo.reduce((sum, item) => sum + item.weight, 0).toFixed(1));
  const totalVolume = example.cargo.reduce((sum, item) => sum + item.volume, 0);
  const count = Math.max(Math.ceil(totalWeight / example.maxWeight), Math.ceil(totalVolume / example.maxVolume));
  const cargoText = example.cargo.map(item => `${item.name} ${item.quantity} ${item.unit}，${item.weight} 吨 / ${item.volume} 立方米`).join('；');
  const order: EmailOrderResult['order'] = {
    number: scenario === 'loading' || scenario === 'flexible' ? undefined : `KH-${dateFormat.format(receivedAt).replace(/-/g, '')}-${String(sequence).padStart(3, '0')}`,
    origin: example.origin, destination: example.destination, cargo: example.cargo.map(item => ({ ...item })), handling: example.handling,
    loadingTime: timing.loadingSource === '客户要求' ? emailTimeRange(loadingStart, loadingEnd) : undefined,
    arrivalRequirement: scenario === 'duration' ? '装货后 24 小时内到达' : timing.arrivalSource === '客户要求' ? `${timeFormat.format(deadline)} 前到达` : undefined,
  };
  const dispatch: EmailOrderResult['dispatch'] = {
    vehicle: example.vehicle, count, totalWeight, totalVolume,
    allocation: count === 1 ? `全部货物由 1 辆车承运，共 ${totalWeight} 吨 / ${totalVolume} 立方米。` : `每车装 ${example.cargo[0]!.quantity / count} 木箱，约 ${totalWeight / count} 吨 / ${totalVolume / count} 立方米。`,
    reason: `按演示车型单车可装 ${example.maxWeight} 吨、${example.maxVolume} 立方米测算，货物可堆码，${count} 辆可满足重量和容积要求；封闭车厢便于防雨防潮。`,
  };
  const originalLoading = order.loadingTime ? `明天 ${clockFormat.format(loadingStart)}–${clockFormat.format(loadingEnd)}` : '';
  const originalArrival = scenario === 'duration' ? order.arrivalRequirement : order.arrivalRequirement ? `明天 ${clockFormat.format(deadline)} 前到达` : '';
  const originalBody = `您好，\n\n请安排以下运输${order.number ? `，订单号：${order.number}` : ''}。\n装货地：${order.origin}\n卸货地：${order.destination}\n货物：${cargoText}。\n${order.handling}\n${originalLoading ? `装货时间：${originalLoading}。\n` : ''}${originalArrival ? `到达要求：${originalArrival}。\n` : ''}\n请回复用车和运输安排，谢谢。\n${example.senderName}`;
  const loadingText = `${timing.loadingSource === '客户要求' ? '按您要求，装货时间为' : '建议装货时间为'} ${emailTimeRange(loadingStart, loadingEnd)}${timing.latestLoadingAt ? `，最晚请于 ${timeFormat.format(timing.latestLoadingAt)} 开始装货` : ''}。`;
  const arrivalText = scenario === 'duration' ? `已收到装货后 24 小时内到达的要求，将按此安排车辆；预计 ${emailTimeRange(timing.arrivalStart, timing.arrivalEnd)} 到达。` : order.arrivalRequirement ? `已记录到达要求：${order.arrivalRequirement}，将按此要求安排。` : `预计 ${emailTimeRange(timing.arrivalStart, timing.arrivalEnd)} 到达。`;
  const reply = `您好，\n\n已收到${order.number ? `订单 ${order.number}` : '本次运输需求'}：从${order.origin}发往${order.destination}。\n货物为${cargoText}，合计 ${totalWeight} 吨、${totalVolume} 立方米。\n\n拟安排 ${count} 辆${dispatch.vehicle}。${dispatch.allocation}\n${dispatch.reason.replace('按演示车型', '按车型')}\n\n装货地附近车源${example.market.supply}，${example.market.difficulty}。${example.market.supplyReason}\n预计运价${example.market.price}，比较口径为相近线路、相同车型近期常规时段运价。${example.market.priceReason}\n\n${loadingText}\n${arrivalText}\n${timing.basis}\n\n派车确定后，我们会通过邮件告知车牌号、司机姓名、联系电话及预计到场时间，方便安排进场装货。\n\n物流运营团队`;
  return { scenario, subject: example.subject, sender: example.sender, senderName: example.senderName, mailbox, receivedAt, originalBody, order, dispatch, market: { ...example.market }, timing, reply: { subject: `Re: ${example.subject}`, body: reply } };
}

export function createEmailRun(task: DailyTask, scenario: EmailOrderScenario, receivedAt = Date.now()): TaskRun {
  const email = createEmailOrder(scenario, receivedAt, task.runs.length + 1, task.mailbox?.address);
  return {
    id: `mail-run-${crypto.randomUUID()}`, source: 'email', status: 'running', startedAt: receivedAt,
    prompt: task.prompt, result: '', activeStep: 0, nextStepAt: receivedAt + emailDemoStepDelay, emailOrder: email,
    steps: [
      { title: '收到订单邮件', text: `${email.senderName}：${email.subject}。收件邮箱 ${email.mailbox}。`, tool: '邮箱连接' },
      { title: '识别订单信息', text: `${email.order.origin} → ${email.order.destination}；${email.dispatch.totalWeight} 吨、${email.dispatch.totalVolume} 立方米。`, tool: '货源解析' },
      { title: '确定车型和车辆数', text: `拟安排 ${email.dispatch.count} 辆${email.dispatch.vehicle}。${email.dispatch.allocation}` },
      { title: '查看车源与运价', text: `车源${email.market.supply}，${email.market.difficulty}；预计运价${email.market.price}。`, tool: '运力与货源' },
      { title: '安排装货与到达时间', text: email.timing.basis, tool: '物流路线规划' },
      { title: '生成客户回复', text: '整理订单、用车和时间安排，告知后续将通过邮件通知车辆进场信息。', tool: '运营助手' },
      { title: '回复邮件并保存结果', text: `模拟向 ${email.sender} 回复，保留原始邮件与完整回复。`, tool: '邮件回复' },
    ],
  };
}

export function completeEmailRun(run: TaskRun, finishedAt: number) {
  const email = run.emailOrder;
  if (!email) return;
  run.status = 'complete';
  run.activeStep = run.steps.length;
  run.finishedAt = finishedAt;
  email.reply.sentAt = finishedAt;
  run.result = `${email.order.origin} → ${email.order.destination}\n拟安排 ${email.dispatch.count} 辆${email.dispatch.vehicle}，承运 ${email.dispatch.totalWeight} 吨 / ${email.dispatch.totalVolume} 立方米。\n附近车源${email.market.supply}，${email.market.difficulty}；运价${email.market.price}。\n装货：${emailTimeRange(email.timing.loadingStart, email.timing.loadingEnd)}；到达：${email.order.arrivalRequirement ?? emailTimeRange(email.timing.arrivalStart, email.timing.arrivalEnd)}。\n已回复客户（演示），派车确定后通过邮件通知车辆信息。`;
}

export function createEmailDemoTask(projectId: string, now = Date.now(), includeHistory = true): DailyTask {
  const task: DailyTask = {
    id: `email-order-${projectId}`, projectId, name: '邮件处理订单', trigger: 'schedule', taskTemplate: 'email-order',
    eventType: 'parking', threshold: 0, fenceId: '', time: '', confirmBeforeSend: false,
    prompt: '接收客户订单邮件，提取装卸货地、货物和时间要求，给出车型、车辆数、车源和运价判断，补充预计装货或到达时间，并通过邮件回复客户。',
    enabled: true, createdAt: includeHistory ? now - day : now, lastScheduledDay: '', runs: [], mailbox: { address: emailDemoMailbox, status: 'bound' },
  };
  if (!includeHistory) return task;
  for (const [index, scenario] of (['both', 'arrival', 'loading'] as const).entries()) {
    const run = createEmailRun(task, scenario, now - (3 - index) * hour);
    completeEmailRun(run, run.startedAt + emailDemoStepDelay * run.steps.length);
    run.readAt = run.finishedAt;
    task.runs.unshift(run);
  }
  return task;
}
