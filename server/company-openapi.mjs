import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import https from 'node:https';
import { verifyWaybill } from './waybill-risk.mjs';

const cache = new Map();
export function signParams(params, secret) {
  return createHmac('sha1', secret).update(Object.entries(params).map(([k, v]) => k + v).sort().join('')).digest('hex').toUpperCase();
}
export function coordinate(raw) {
  if (raw?.lon == null || raw?.lat == null || raw.lon === '' || raw.lat === '') return null;
  const lon = Number(raw.lon) / 600000, lat = Number(raw.lat) / 600000;
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 && (lon !== 0 || lat !== 0) ? [lon, lat] : null;
}
export async function queryApi(path, parameters, credentialPath) {
  const key = path + JSON.stringify(parameters);
  const previous = cache.get(key);
  if (previous && Date.now() - previous.time < 300000) return previous.data;
  let credentials;
  try {
    credentials = JSON.parse(await readFile(credentialPath, 'utf8'));
    if (!credentials.token || !credentials.client_id || !credentials.srt) throw new Error();
  } catch { throw new Error('车辆服务配置缺失或格式错误'); }
  const params = { token: credentials.token, cid: credentials.client_id, ...parameters };
  const body = new URLSearchParams({ ...params, sign: signParams(params, credentials.srt) }).toString();
  const data = await new Promise((resolve, reject) => {
    const request = https.request({ hostname: 'zhiyunopenapi.95155.com', path: '/save/apis/' + path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, response => {
      let text = '';
      response.on('data', chunk => { text += chunk; if (text.length > 12000000) request.destroy(new Error('接口响应过大')); });
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) throw new Error();
          resolve(JSON.parse(text));
        } catch { reject(new Error('公网接口HTTP或响应格式错误')); }
      });
      response.on('error', () => reject(new Error('公网接口响应中断')));
    });
    request.setTimeout(25000, () => request.destroy(new Error('公网接口超时')));
    request.on('error', () => reject(new Error('公网接口连接失败或超时')));
    request.end(body);
  });
  const status = String(data.status);
  if (status !== '1001') {
    const reasons = { '1006': '该查询范围无数据', '1016': 'token失效；未自动登录或刷新', '1011': '出口IP不在白名单', '1014': '没有接口权限', '1017': '账号欠费', '1031': '签名校验失败', '1002': '查询参数不符合接口要求' };
    throw new Error(`车辆服务 ${status}：${reasons[status] || '业务查询未成功'}`);
  }
  cache.set(key, { time: Date.now(), data: data.result });
  return data.result;
}
export async function telemetry(input, credentialPath) {
  if (!input || !/^[\u4e00-\u9fffA-Za-z0-9·]{5,12}$/.test(input.plate) || !['1', '2', '3'].includes(String(input.color))) throw new Error('车牌或车牌颜色无效');
  const start = Date.parse(input.start), end = Date.parse(input.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 31 * 24 * 3600000 || end > Date.now() + 60000) throw new Error('轨迹查询区间必须有效且不超过31天');
  const format = time => new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  const queryHistory = async () => {
    const trackArray = [];
    const errors = [];
    for (let cursor = start; cursor < end; cursor += 72 * 3600000) {
      const finish = Math.min(end, cursor + 72 * 3600000);
      try {
        const result = await queryApi('routerPath', { vclN: input.plate, vco: String(input.color), qryBtm: format(cursor), qryEtm: format(finish), parkMins: '10' }, credentialPath);
        if (Array.isArray(result?.trackArray)) trackArray.push(...result.trackArray);
        else errors.push(`${format(cursor)} 至 ${format(finish)}：未返回轨迹明细`);
      } catch (error) { errors.push(`${format(cursor)} 至 ${format(finish)}：${error.message}`); }
    }
    return { trackArray: [...new Map(trackArray.map(p => [`${p.gtm}:${p.lon}:${p.lat}`, p])).values()], errors };
  };
  const trackResult = await queryHistory().then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));
  const history = trackResult.status === 'fulfilled' ? trackResult.value : null;
  const track = Array.isArray(history?.trackArray) ? history.trackArray.flatMap(p => {
    const point = coordinate(p);
    const m = /^(\d{4})(\d{2})(\d{2})\/(\d{2})(\d{2})(\d{2})$/.exec(String(p.gtm));
    const timestamp = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00` : null;
    const time = Date.parse(timestamp);
    return point && Number.isFinite(time) && time >= start && time <= end ? [{ coordinate: point, timestamp, speed: p.spd == null ? null : Number(p.spd) }] : [];
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)) : [];
  return { plate: input.plate, queriedAt: new Date().toISOString(), start: input.start, end: input.end, color: String(input.color), coordinateSystem: 'WGS84', location: null, track,
    locationError: '',
    trackError: history?.errors?.length ? `轨迹查询不完整：${history.errors.join('；')}` : track.length ? '' : trackResult.status === 'rejected' ? trackResult.reason.message : '该时间范围未返回有效轨迹点',
  };
}

export function companyOpenapiPlugin(env) {
  const inFlight = new Map();
  const snapshots = new Map();
  const riskSnapshots = new Map();
  const directory = new URL('../.local/', import.meta.url);
  const snapshotFile = new URL('company-telemetry.json', directory);
  const ordersFile = new URL('../src/views/AgentWork/customerOrders.json', import.meta.url);
  let saveQueue = Promise.resolve();
  return { name: 'company-openapi', configureServer(server) {
    server.middlewares.use('/api/company-openapi/risk-check', async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      const file = new URL('waybill-risk.json', directory);
      try {
        if (request.method === 'GET') { try { response.end(await readFile(file, 'utf8')); } catch { response.end('[]'); } return; }
        if (request.method !== 'POST') { response.statusCode = 405; response.end('{}'); return; }
        if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) throw new Error('不允许跨站请求');
        let body = '';
        for await (const chunk of request) { body += chunk; if (body.length > 4096) throw new Error('请求过大'); }
        const input = JSON.parse(body);
        const orders = JSON.parse(await readFile(ordersFile, 'utf8'));
        const order = orders.find(o => o.id === input.orderId);
        if (!order) throw new Error('运单未导入');
        // Warm completed checks survive a server restart; credentials and tokens never enter the response.
        if (!riskSnapshots.size) { try { JSON.parse(await readFile(file, 'utf8')).forEach(r => riskSnapshots.set(r.orderId, r)); } catch {} }
        const previous = riskSnapshots.get(order.id);
        const merged = { ...input, origin: input.origin || previous?.origin, destination: input.destination || previous?.destination };
        const key = 'risk:' + JSON.stringify(merged);
        if (!inFlight.has(key)) inFlight.set(key, verifyWaybill(order, merged, (path, params) => queryApi(path, params, env.COMPANY_OPENAPI_CREDENTIALS)).finally(() => inFlight.delete(key)));
        const data = await inFlight.get(key);
        riskSnapshots.set(order.id, data);
        const serialized = JSON.stringify([...riskSnapshots.values()]);
        saveQueue = saveQueue.catch(() => {}).then(async () => { await mkdir(directory, { recursive: true }); await writeFile(file, serialized, 'utf8'); });
        await saveQueue;
        response.end(JSON.stringify(data));
      } catch (error) { response.statusCode = 502; response.end(JSON.stringify({ error: error instanceof Error ? error.message : '运单核验失败' })); }
    });
    server.middlewares.use('/api/company-openapi/telemetry', async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      try {
        if (request.method === 'GET') {
          try { response.end(await readFile(snapshotFile, 'utf8')); }
          catch { response.end('[]'); }
          return;
        }
        if (request.method !== 'POST') { response.statusCode = 405; response.end('{}'); return; }
        const origin = request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) throw new Error('不允许跨站请求');
        let body = '';
        for await (const chunk of request) { body += chunk; if (body.length > 4096) throw new Error('请求过大'); }
        const input = JSON.parse(body);
        const orders = JSON.parse(await readFile(ordersFile, 'utf8'));
        if (!orders.some(order => order.plate === input.plate)) throw new Error('只能查询已导入运单的车辆');
        const key = JSON.stringify(input);
        if (!inFlight.has(key)) inFlight.set(key, telemetry(input, env.COMPANY_OPENAPI_CREDENTIALS).finally(() => inFlight.delete(key)));
        const data = await inFlight.get(key);
        snapshots.set(input.plate, data);
        const serialized = JSON.stringify([...snapshots.values()]);
        saveQueue = saveQueue.catch(() => {}).then(async () => {
          await mkdir(directory, { recursive: true });
          await writeFile(snapshotFile, serialized, 'utf8');
        });
        await saveQueue;
        response.end(JSON.stringify(data));
      } catch (error) { response.statusCode = 502; response.end(JSON.stringify({ error: error instanceof Error ? error.message : '车辆数据查询失败' })); }
    });
  } };
}
