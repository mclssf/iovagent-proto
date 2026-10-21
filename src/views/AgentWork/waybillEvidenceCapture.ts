import { Screenshot } from '@amap/screenshot';
import { convertGpsCoordinates, loadAMap, searchDrivingRoute } from '@/utils/amap';
import type { AMapCoordinate } from '@/utils/amap';
import { evidenceTime, evidenceTimes, hasEvidenceMapDetails } from './waybillEvidence';
import type { EvidenceEndpoint, EvidenceInput, EvidenceTrip } from './waybillEvidence';

interface GeocoderApi {
  getLocation(address: string, callback: (status: string, result: { geocodes?: { location: AMap.LngLat }[] }) => void): void;
}
type GeocodingAMap = typeof AMap & { Geocoder: new (options: { city: string }) => GeocoderApi };

export interface EvidenceRenderer {
  render(input: EvidenceInput, index: number, enterprise: string, runId: string): Promise<{ trip: EvidenceTrip; bytes: Uint8Array }>;
  destroy(): void;
}

function bounded<T>(promise: Promise<T>, signal: AbortSignal, milliseconds = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => finish(() => reject(new DOMException('已停止生成', 'AbortError')));
    const timer = setTimeout(() => finish(() => reject(new Error('地图服务超时，请稍后重新执行'))), milliseconds);
    function finish(action: () => void) { clearTimeout(timer); signal.removeEventListener('abort', abort); action(); }
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

const candidateSites: { poi: string; coordinate: AMapCoordinate }[] = [
  { poi: '上海嘉定汽车城物流园（演示候选 POI）', coordinate: [121.176, 31.332] },
  { poi: '杭州钱塘物流园（演示候选 POI）', coordinate: [120.480, 30.307] },
  { poi: '苏州相城物流场站（演示候选 POI）', coordinate: [120.635, 31.493] },
  { poi: '嘉兴南湖物流场站（演示候选 POI）', coordinate: [120.838, 30.723] },
];

function inferredSite(known: AMapCoordinate, index: number) {
  const choices = candidateSites.filter(site => {
    const distance = Math.hypot(site.coordinate[0] - known[0], site.coordinate[1] - known[1]);
    return distance > .3 && distance < 3;
  });
  return (choices.length ? choices[index % choices.length] : undefined) ?? { poi: '轨迹停留候选场站（演示 POI，待核验）', coordinate: [known[0] + (known[0] > 120 ? -.5 : .5), known[1] + (known[1] > 40 ? -.3 : .3)] as AMapCoordinate };
}

function wrapText(context: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, lineHeight: number) {
  let line = '';
  for (const char of value) {
    if (context.measureText(line + char).width > width && line) { context.fillText(line, x, y); y += lineHeight; line = ''; }
    line += char;
  }
  context.fillText(line, x, y);
  return y + lineHeight;
}

function composeEvidence(mapCanvas: HTMLCanvasElement, trip: EvidenceTrip, enterprise: string, runId: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1440; canvas.height = 1330;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持生成轨迹图片');
  function lineCount(value: string, width: number, font: string) {
    ctx.font = font; let lines = 1; let line = '';
    for (const char of value) { if (line && ctx.measureText(line + char).width > width) { lines++; line = ''; } line += char; }
    return lines;
  }
  const companyLines = lineCount(`所属企业：${enterprise}`, 1310, '20px sans-serif');
  const headerOffset = (companyLines - 1) * 26;
  const poiLines = Math.max(lineCount(trip.loading.poi, 620, '21px sans-serif'), lineCount(trip.unloading.poi, 620, '21px sans-serif'));
  const footerOffset = headerOffset + Math.max(0, poiLines - 3) * 30;
  canvas.height = 1330 + footerOffset;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1440, canvas.height);
  ctx.fillStyle = '#1f2933'; ctx.font = '600 32px sans-serif'; ctx.fillText('运单运输轨迹留证', 40, 55);
  ctx.fillStyle = '#2563a5'; ctx.font = '700 29px sans-serif'; ctx.fillText('兴路车联', 1230, 52);
  ctx.fillStyle = '#465663'; ctx.font = '20px sans-serif';
  wrapText(ctx, `所属企业：${enterprise}`, 40, 96, 1310, 26);
  ctx.fillStyle = '#253440'; ctx.font = '600 23px sans-serif'; ctx.fillText(`车牌号 ${trip.plate}    运单号 ${trip.order}`, 40, 145 + headerOffset, 1360);
  ctx.drawImage(mapCanvas, 40, 170 + headerOffset, 1360, 640);
  ctx.save(); ctx.beginPath(); ctx.rect(40, 170 + headerOffset, 1360, 640); ctx.clip();
  ctx.translate(720, 480 + headerOffset); ctx.rotate(-Math.PI / 9); ctx.fillStyle = 'rgba(36, 73, 106, .18)'; ctx.font = '600 29px sans-serif'; ctx.textAlign = 'center';
  const watermark = `${enterprise} · ${trip.plate} · 演示推断`;
  ctx.fillText(watermark, 0, -145, 1200); ctx.fillText(watermark, 0, 30, 1200); ctx.fillText(watermark, 0, 205, 1200); ctx.restore();
  ctx.fillStyle = '#394d5c'; ctx.font = '16px sans-serif'; ctx.fillText('地图：高德地图 JS API 2.0  |  路线：高德驾车规划，非实测 GPS 轨迹', 52, 835 + headerOffset);
  function endpointText(title: string, point: EvidenceTrip['loading'], x: number, color: string) {
    ctx.fillStyle = color; ctx.font = '600 24px sans-serif'; ctx.fillText(`${title} · ${point.inferred ? '规则推断（演示）' : '用户提供'}`, x, 885 + headerOffset);
    ctx.fillStyle = '#253440'; ctx.font = '21px sans-serif';
    const afterPoi = wrapText(ctx, point.poi, x, 927 + headerOffset, 620, 30);
    ctx.font = '19px sans-serif'; ctx.fillText(`经纬度：${point.coordinate.map(value => value.toFixed(6)).join(', ')}（GCJ-02）`, x, afterPoi + 12);
    ctx.fillText(`${title}时间：${evidenceTime(point.time)}`, x, afterPoi + 46);
    ctx.fillStyle = '#5a6570'; ctx.font = '17px sans-serif'; ctx.fillText(`时间来源：${point.timeInferred ? '规则推断（演示）' : '用户提供'}`, x, afterPoi + 77);
  }
  endpointText('装货', trip.loading, 40, '#267457'); endpointText('卸货', trip.unloading, 755, '#b0522e');
  ctx.fillStyle = '#eef3f6'; ctx.fillRect(40, 1100 + footerOffset, 1360, 83);
  ctx.fillStyle = '#253440'; ctx.font = '600 21px sans-serif'; ctx.fillText(`运输时间：${evidenceTime(trip.loading.time)} 至 ${evidenceTime(trip.unloading.time)}（北京时间）`, 60, 1133 + footerOffset);
  ctx.font = '18px sans-serif'; ctx.fillText(`道路里程 ${(trip.distance / 1000).toFixed(1)} km  |  车牌 ${trip.plate}  |  执行编号 ${runId.slice(-8)}`, 60, 1164 + footerOffset);
  ctx.fillStyle = '#6a441b'; ctx.font = '600 19px sans-serif'; ctx.fillText('演示推断，非真实凭证；装卸货地点、时间及模拟轨迹需经原始业务资料核验。', 40, 1223 + footerOffset);
  ctx.fillStyle = '#566571'; ctx.font = '17px sans-serif'; ctx.fillText(`生成时间 ${evidenceTime(Date.now())}（北京时间）  ·  兴路车联文字品牌标识`, 40, 1260 + footerOffset);
  const data = canvas.toDataURL('image/jpeg', .88).split(',')[1]!;
  return Uint8Array.from(atob(data), char => char.charCodeAt(0));
}

export async function createEvidenceRenderer(signal: AbortSignal): Promise<EvidenceRenderer> {
  const amap = await bounded(loadAMap(['AMap.Driving', 'AMap.Geocoder']), signal, 20000) as GeocodingAMap;
  const element = document.createElement('div');
  element.setAttribute('aria-hidden', 'true'); element.dataset.evidenceCapture = 'true';
  Object.assign(element.style, { position: 'fixed', left: '-1600px', top: '0', width: '1020px', height: '480px', pointerEvents: 'none', color: '#253440', backgroundColor: '#eef3f6', fontFamily: 'Arial, sans-serif' });
  document.body.append(element);
  const map = new amap.Map(element, { viewMode: '2D', zoom: 8, center: [120.6, 31], mapStyle: 'amap://styles/whitesmoke', animateEnable: false, WebGLParams: { preserveDrawingBuffer: true } });
  const shot = new Screenshot(map);
  const geocoder = new amap.Geocoder({ city: '全国' });
  const cache = new Map<string, AMapCoordinate>();
  const destroy = () => { shot.destroy(); map.destroy(); element.remove(); };
  try {
    await bounded(new Promise<void>(resolve => map.on('complete', () => resolve())), signal, 20000);
  } catch (error) { destroy(); throw error; }
  async function coordinate(point: EvidenceEndpoint, gps: boolean): Promise<AMapCoordinate | null> {
    if (point.coordinate) {
      if (!gps) return [...point.coordinate];
      const converted = (await bounded(convertGpsCoordinates(amap, [point.coordinate]), signal))[0]!;
      if (point.coordinate[0] > 73 && point.coordinate[0] < 135 && point.coordinate[1] > 18 && point.coordinate[1] < 54 && converted.every((value, index) => value === point.coordinate![index])) throw new Error('GPS 坐标转换失败，请检查地图服务或提供 GCJ-02 坐标');
      return converted;
    }
    if (!point.poi) return null;
    if (cache.has(point.poi)) return cache.get(point.poi)!;
    const position = await bounded(new Promise<AMapCoordinate>((resolve, reject) => geocoder.getLocation(point.poi, (status, result) => {
      if (status !== 'complete' || !result.geocodes?.[0]) { reject(new Error(`无法解析已知地点“${point.poi}”，请补充详细地址或经纬度`)); return; }
      if (result.geocodes.length > 1) { reject(new Error(`已知地点“${point.poi}”存在多个候选，请补充详细地址或经纬度`)); return; }
      resolve(result.geocodes[0].location.toArray());
    })), signal);
    cache.set(point.poi, position); return position;
  }
  return {
    destroy,
    async render(input, index, enterprise, runId) {
      const knownLoading = await coordinate(input.loading, input.gps);
      const knownUnloading = await coordinate(input.unloading, input.gps);
      const candidate = inferredSite((knownLoading ?? knownUnloading)!, index);
      const loading = knownLoading ?? candidate.coordinate;
      const unloading = knownUnloading ?? candidate.coordinate;
      const route = await bounded(searchDrivingRoute(amap, [loading, unloading]), signal);
      if (route.distance <= 0 || route.duration <= 0) throw new Error('道路路线距离或耗时无效，未生成留证图片');
      const times = evidenceTimes(input, route.duration, index);
      const trip: EvidenceTrip = {
        order: input.order, plate: input.plate, distance: route.distance, duration: route.duration, path: route.path,
        loading: { poi: input.loading.poi || (knownLoading ? `已知装货坐标 ${loading.join(', ')}` : candidate.poi), coordinate: loading, time: times.loading, inferred: !knownLoading, timeInferred: input.loading.time === null },
        unloading: { poi: input.unloading.poi || (knownUnloading ? `已知卸货坐标 ${unloading.join(', ')}` : candidate.poi), coordinate: unloading, time: times.unloading, inferred: !knownUnloading, timeInferred: input.unloading.time === null },
        basis: `模拟停车聚类（停留 ${45 + index % 5 * 12} 分钟）、装卸场站 POI 及先后顺序规则；路线采用高德道路规划，不是实测车辆轨迹。`,
      };
      map.clearMap();
      const line = new amap.Polyline({ path: route.path, strokeColor: '#2475bf', strokeWeight: 6, showDir: true, strokeOpacity: .95 });
      const start = new amap.CircleMarker({ center: loading, radius: 9, fillColor: '#267457', strokeColor: '#ffffff', strokeWeight: 3 });
      const end = new amap.CircleMarker({ center: unloading, radius: 9, fillColor: '#b0522e', strokeColor: '#ffffff', strokeWeight: 3 });
      const labels = [new amap.Text({ text: '装货地', position: loading, offset: new amap.Pixel(0, -24), style: { backgroundColor: '#ffffff', color: '#267457', borderColor: '#267457', fontSize: '14px', padding: '3px 7px' } }), new amap.Text({ text: '卸货地', position: unloading, offset: new amap.Pixel(0, -24), style: { backgroundColor: '#ffffff', color: '#b0522e', borderColor: '#b0522e', fontSize: '14px', padding: '3px 7px' } })];
      map.add([line, start, end, ...labels]); map.setFitView([line, start, end], true, [55, 65, 55, 65]);
      await bounded(new Promise(resolve => setTimeout(resolve, 1500)), signal);
      for (let attempt = 0; attempt < 2; attempt++) {
        const mapCanvas = await bounded(shot.toCanvas() as Promise<HTMLCanvasElement>, signal);
        const context = mapCanvas.getContext('2d');
        if (!context || !mapCanvas.width || !mapCanvas.height) throw new Error('地图截图为空，请重新执行');
        const pixels = context.getImageData(0, 0, mapCanvas.width, mapCanvas.height).data;
        // Colored route/markers and bottom attribution are not proof of a loaded base map.
        if (hasEvidenceMapDetails(pixels, mapCanvas.width, mapCanvas.height)) return { trip, bytes: composeEvidence(mapCanvas, trip, enterprise, runId) };
        // Tile labels may finish after the first frame; allow one bounded retry.
        if (!attempt) await bounded(new Promise(resolve => setTimeout(resolve, 2000)), signal);
      }
      throw new Error('地图底图未完整加载，请检查高德域名白名单；未生成留证图片');
    },
  };
}
