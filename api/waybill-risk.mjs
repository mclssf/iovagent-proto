const parse = value => value ? Date.parse(value.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(value) ? '' : '+08:00')) : NaN;
const format = time => new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
const pointValid = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
const pending = (name, evidence, rule) => ({ name, status: '待核实', risk: '待核实', evidence, rule });

export async function verifyWaybill(order, input, query) {
  const fields = order.customerRecord.fields;
  const checkedAt = new Date().toISOString();
  const items = [];
  const start = parse(fields['发车时间'] || fields['签到时间'] || fields['预约提货时间']);
  const finish = parse(fields['到货确认时间'] || fields['签收时间'] || fields['预约送货时间']);
  const end = Math.min(Date.now(), finish);
  const origin = pointValid(input.origin) ? input.origin : null;
  const destination = pointValid(input.destination) ? input.destination : null;
  const color = ['1', '2', '3'].includes(String(input.color)) ? String(input.color) : '2';
  const rule = '车牌按客户单据；颜色暂按黄牌；装卸围栏1000米；允许延误0秒。晚发暂按预约提货时限复核，需业务确认。';
  const segments = [];
  if (Number.isFinite(start) && Number.isFinite(end) && start < end && start >= Date.now() - 7 * 86400000) {
    for (let cursor = start; cursor < end; cursor += 86400000) segments.push([cursor, Math.min(end, cursor + 86400000)]);
  }
  const qualities = [], failures = [];
  for (const [begin, finish] of segments) {
    try { qualities.push(await query('trackDistinguish', { vno: `${order.plate}_${color}`, offTime: '30', qryBtm: format(begin), qryEtm: format(finish) })); }
    catch (error) { failures.push(error.message); }
  }
  const codes = new Set(qualities.flatMap(q => String(q.compareResults || '').split(',')));
  const pointSize = qualities.reduce((n, q) => n + (Number(q.pointSize) || 0), 0);
  const jumps = qualities.reduce((n, q) => n + (Number(q.jpNum) || 0), 0);
  const abnormal = codes.has('1') || codes.has('4');
  if (abnormal) items.push({ name: '轨迹漂移', status: '异常', risk: '高风险', evidence: `甄别结果${[...codes].join(',')}，接口分段报告跳点${jumps}个（边界可能重复），需复核；跳点不等于造假。`, rule: '轨迹甄别识别漂移与离线跳点，按24小时分段，查询仅支持近一周。' });
  else if (qualities.length && pointSize > 0 && !failures.length && codes.size === 1 && codes.has('3')) items.push({ name: '轨迹漂移', status: '正常', risk: '无风险', evidence: `${segments.length}个查询区间均返回正常；分段点位计数${pointSize}（边界可能重复），未检出跳点。`, rule: '仅证明所查时间范围的轨迹质量，不证明运单真实完成。' });
  else items.push(pending('轨迹漂移', !segments.length ? '起止时间不完整、异常或超出近一周查询范围，未作甄别' : failures.length ? `部分或全部查询失败：${[...new Set(failures)].join('；')}` : `甄别返回${[...codes].join(',') || '无有效结果'}，缺少完整有效轨迹，不能判正常`, '无数据、离线或未入网不等于造假。'));
  items.push(pending('线路偏离', '缺少已确认的计划道路线路/监控行程ID，不能用两点直线或GPS漂移结果代替线路偏离判断', '须对比本运单有效运输区间与已确认计划道路；不自动创建外部线路订阅。'));
  const apiResults = {};
  for (const [kind, name, api, planField, actualField, coordinate] of [
    ['departure', '晚发', 'lateDepartureBacktrack', '预约提货时间', '发车时间', origin],
    ['arrival', '晚到', 'lateArrivalBacktrack', '预约送货时间', '到货确认时间', destination],
  ]) {
    const planned = parse(fields[planField]);
    const reported = parse(fields[actualField] || (kind === 'arrival' ? fields['签收时间'] : ''));
    const hint = Number.isFinite(planned) && Number.isFinite(reported) && reported > planned ? `；单据时间晚于${planField}${Math.round((reported - planned) / 60000)}分钟（单据提示，尚未经GPS核实）` : '';
    if (!Number.isFinite(planned)) { items.push(pending(name, `缺少${planField}，无法比较`, rule)); continue; }
    if (planned > Date.now()) { items.push({ name, status: '未到计划时间', risk: '无风险', evidence: `${planField}为${fields[planField]}，尚未到期`, rule }); continue; }
    if (!coordinate) { items.push(pending(name, `缺少已解析的${kind === 'departure' ? '提货' : '送货'}点坐标，未执行围栏回溯${hint}`, rule)); continue; }
    try {
      // The service looks +/-36h around queryTime; never submit a future query interval.
      const center = Math.min(planned, Date.now() - 36 * 3600000);
      if (planned - center > 36 * 3600000) throw new Error('计划时间不在有效查询区间');
      const data = await query(api, { vehiclePlateNumber: order.plate, vehiclePlateColor: color, specifiedTime: fields[planField], longitude: String(coordinate[0]), latitude: String(coordinate[1]), radius: '1000', queryTime: format(center), intervalTime: '72', allowedDuration: '0' });
      apiResults[kind] = data;
      if (!['0', '1', '-1'].includes(String(data.result))) throw new Error('接口业务结果格式未识别');
      if (String(data.result) === '-1') items.push(pending(name, `回溯未检出经过${kind === 'departure' ? '提货' : '送货'}点，无法判断${name}${hint}`, rule));
      else items.push({ name, status: String(data.result) === '1' ? '异常' : '正常', risk: String(data.result) === '1' ? '低风险' : '无风险', evidence: `围栏回溯时间${data.eventTime || '未返回'}；${name}${Math.round(Number(data.timeSize || 0) / 60)}分钟；对比${planField}：${fields[planField]}`, rule });
    } catch (error) { items.push(pending(name, `回溯调用失败：${error.message}${hint}`, rule)); }
  }
  const bothPassed = ['departure', 'arrival'].every(k => ['0', '1'].includes(String(apiResults[k]?.result)));
  if (bothPassed && !abnormal && !failures.length && pointSize > 0 && codes.size === 1 && codes.has('3')) items.push({ name: '运单真实性', status: '轨迹支持', risk: '无风险', evidence: '本车轨迹质量检查未见异常，且起终点回溯均检出经过记录；支持该运输行程，不替代货物交接/签收凭证。', rule: '车辆、时间、起终点经过证据联合校验；不以GPS正常认定货物交付真实。' });
  else items.push(pending('运单真实性', `现有证据不足：${!bothPassed ? '缺少起终点有效经过记录；' : ''}${abnormal ? '存在跳点待复核；' : ''}轨迹数据不能单独证明本运单履约，不判定虚假运单`, '车辆、运输区间、装卸点经过和交接单据共同验证。'));
  const risk = items.some(i => i.risk === '高风险') ? '高风险' : items.some(i => i.status === '异常') ? '低风险' : items.some(i => i.status === '待核实') ? '待核实' : '无风险';
  return { orderId: order.id, plate: order.plate, checkedAt, risk, items, origin, destination, color, summary: [...items].sort((a, b) => (a.status === '异常' ? 0 : a.status === '待核实' ? 1 : 2) - (b.status === '异常' ? 0 : b.status === '待核实' ? 1 : 2)).map(i => `${i.name}：${i.status}（${i.evidence}）`).join('；') };
}
