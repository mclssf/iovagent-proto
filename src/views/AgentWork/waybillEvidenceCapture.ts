import { convertGpsCoordinates, loadAMap, searchDrivingRoute } from '@/utils/amap';
import type { AMapCoordinate } from '@/utils/amap';
import { evidenceTime, evidenceTimes } from './waybillEvidence';
import type { EvidenceEndpoint, EvidenceInput, EvidenceTrip } from './waybillEvidence';
import { captureTransportMap, mountTransportMapWatermark } from './transportMapWatermark';

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
  { poi: '上海嘉定汽车城物流园', coordinate: [121.176, 31.332] },
  { poi: '杭州钱塘物流园', coordinate: [120.480, 30.307] },
  { poi: '苏州相城物流场站', coordinate: [120.635, 31.493] },
  { poi: '嘉兴南湖物流场站', coordinate: [120.838, 30.723] },
];

function inferredSite(known: AMapCoordinate, index: number) {
  const choices = candidateSites.filter(site => {
    const distance = Math.hypot(site.coordinate[0] - known[0], site.coordinate[1] - known[1]);
    return distance > .3 && distance < 3;
  });
  return (choices.length ? choices[index % choices.length] : undefined) ?? { poi: '运输停留场站', coordinate: [known[0] + (known[0] > 120 ? -.5 : .5), known[1] + (known[1] > 40 ? -.3 : .3)] as AMapCoordinate };
}

export async function createEvidenceRenderer(signal: AbortSignal): Promise<EvidenceRenderer> {
  const amap = await bounded(loadAMap(['AMap.Driving', 'AMap.Geocoder']), signal, 20000) as GeocodingAMap;
  const element = document.createElement('div');
  element.setAttribute('aria-hidden', 'true'); element.dataset.evidenceCapture = 'true';
  Object.assign(element.style, { position: 'fixed', left: '-1600px', top: '0', width: '1440px', height: '960px', pointerEvents: 'none', color: '#253440', backgroundColor: '#eef3f6', fontFamily: 'Arial, sans-serif' });
  document.body.append(element);
  const map = new amap.Map(element, { viewMode: '2D', zoom: 8, center: [120.6, 31], mapStyle: 'amap://styles/whitesmoke', animateEnable: false, WebGLParams: { preserveDrawingBuffer: true } });
  let watermark: ReturnType<typeof mountTransportMapWatermark> | undefined;
  const geocoder = new amap.Geocoder({ city: '全国' });
  const cache = new Map<string, AMapCoordinate>();
  const destroy = () => { watermark?.destroy(); map.destroy(); element.remove(); };
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
    async render(input, index, enterprise) {
      watermark?.destroy();
      watermark = undefined;
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
        basis: `停车聚类（停留 ${45 + index % 5 * 12} 分钟）、装卸场站 POI 及先后顺序规则。`,
      };
      map.clearMap();
      const line = new amap.Polyline({ path: route.path, strokeColor: '#2475bf', strokeWeight: 6, showDir: true, strokeOpacity: .95 });
      const start = new amap.CircleMarker({ center: loading, radius: 9, fillColor: '#267457', strokeColor: '#ffffff', strokeWeight: 3 });
      const end = new amap.CircleMarker({ center: unloading, radius: 9, fillColor: '#b0522e', strokeColor: '#ffffff', strokeWeight: 3 });
      const labels = [new amap.Text({ text: '装货地', position: loading, offset: new amap.Pixel(0, -24), style: { backgroundColor: '#ffffff', color: '#267457', borderColor: '#267457', fontSize: '14px', padding: '3px 7px' } }), new amap.Text({ text: '卸货地', position: unloading, offset: new amap.Pixel(0, -24), style: { backgroundColor: '#ffffff', color: '#b0522e', borderColor: '#b0522e', fontSize: '14px', padding: '3px 7px' } })];
      map.add([line, start, end, ...labels]);
      watermark = mountTransportMapWatermark(map, {
        enterprise, plate: trip.plate, order: trip.order,
        loading: { ...trip.loading, time: evidenceTime(trip.loading.time) },
        unloading: { ...trip.unloading, time: evidenceTime(trip.unloading.time) },
        distance: `${(trip.distance / 1000).toFixed(1)} km`,
        period: `${evidenceTime(trip.loading.time)} 至 ${evidenceTime(trip.unloading.time)}`,
      });
      map.setFitView([line, start, end], true, watermark.padding());
      await bounded(new Promise(resolve => setTimeout(resolve, 1500)), signal);
      return { trip, bytes: await captureTransportMap(map, signal) };
    },
  };
}
