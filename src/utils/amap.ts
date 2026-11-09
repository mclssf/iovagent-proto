import { convertGpsBatch } from './gpsCoordinates';
let loaderPromise: Promise<void> | null = null;
let amapPromise: Promise<typeof AMap> | null = null;

export type AMapCoordinate = [number, number];

interface DrivingResult {
  info?: string;
  routes?: Array<{
    distance?: number;
    steps?: Array<{ path?: AMap.LngLat[] }>;
    time?: number;
  }>;
}

interface DrivingService {
  search(
    start: AMap.LngLatLike,
    end: AMap.LngLatLike,
    options: { waypoints?: AMap.LngLatLike[] },
    callback: (status: string, result: DrivingResult | string) => void,
  ): void;
}

type AMapWithDriving = typeof AMap & {
  Driving: new (options?: { policy?: number; showTraffic?: boolean }) => DrivingService;
};

function resolveServiceHost() {
  return new URL('/_AMapService', window.location.origin).toString();
}

function loadLoaderScript() {
  if (window.AMapLoader) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-iov-amap-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('高德地图加载器加载失败')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://webapi.amap.com/loader.js';
    script.async = true;
    script.dataset.iovAmapLoader = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('高德地图加载器加载失败')), { once: true });
    document.head.append(script);
  });

  return loaderPromise;
}

export async function loadAMap(plugins: string[] = []) {
  const env = import.meta.env as Record<string, string | undefined>;
  const key = env.VITE_AMAP_KEY?.trim();
  if (!key) throw new Error('缺少 VITE_AMAP_KEY，无法加载高德地图');

  window._AMapSecurityConfig = { serviceHost: resolveServiceHost() };
  await loadLoaderScript();
  if (!window.AMapLoader) throw new Error('高德地图加载器未初始化');

  if (!amapPromise) {
    amapPromise = window.AMapLoader.load({ key, version: '2.0', plugins });
  } else if (plugins.length > 0) {
    const amap = await amapPromise;
    await new Promise<void>((resolve) => amap.plugin(plugins, resolve));
  }

  return amapPromise;
}

export async function convertGpsCoordinates(amap: typeof AMap, coordinates: AMapCoordinate[]) {
  return convertGpsBatch(amap, coordinates);
}

export async function searchDrivingRoute(
  amap: typeof AMap,
  coordinates: AMapCoordinate[],
  policy = 0,
  timeoutMs = 15000,
) {
  if (coordinates.length < 2) throw new Error('驾车路线至少需要起点和终点');
  const drivingApi = amap as AMapWithDriving;
  const driving = new drivingApi.Driving({ policy, showTraffic: false });
  const [start, ...rest] = coordinates;
  const end = rest.pop()!;

  return new Promise<{ distance: number; duration: number; path: AMapCoordinate[] }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('高德道路规划请求超时，请重试')), timeoutMs);
    try {
      driving.search(start!, end, { waypoints: rest }, (status, result) => {
        clearTimeout(timer);
        try {
          if (status !== 'complete' || typeof result === 'string') {
            const info = typeof result === 'string' ? result : result.info ?? status;
            reject(new Error(`高德路线规划失败：${info}`));
            return;
          }
          const route = result.routes?.[0];
          const path = route?.steps?.flatMap(step => step.path ?? []).map(point => point.toArray()) ?? [];
          if (path.length < 2) throw new Error('高德返回的道路坐标不足');
          resolve({ distance: route?.distance ?? 0, duration: route?.time ?? 0, path });
        } catch (error) { reject(error); }
      });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}

const warehouseCoordinates = new Map<string, AMapCoordinate>();
export async function resolveWarehouseCoordinates(amap: typeof AMap, stops: { coordinate?: AMapCoordinate; address?: string; name: string }[]) {
  const geocoderApi = amap as typeof AMap & { Geocoder: new () => {
    getLocation(address: string, callback: (status: string, result: unknown) => void): void;
  } };
  const geocoder = new geocoderApi.Geocoder();
  const result: AMapCoordinate[] = [];
  for (const stop of stops) {
    if (stop.coordinate) { result.push(stop.coordinate); continue; }
    const address = (stop.address || stop.name).replace(/1[3-9]\d{9}/g, '').replace(/\/.*$/, '').trim();
    const cached = warehouseCoordinates.get(address);
    if (cached) { result.push(cached); continue; }
    const coordinate = await new Promise<AMapCoordinate>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('仓库地址解析超时')), 12000);
      geocoder.getLocation(address, (status, raw) => {
        clearTimeout(timer);
        const data = raw as { geocodes?: { location: AMap.LngLat }[] };
        const point = data.geocodes?.[0]?.location;
        if (status !== 'complete' || !point) { reject(new Error('仓库地址未能定位，请核对详细地址')); return; }
        resolve([point.getLng(), point.getLat()]);
      });
    });
    warehouseCoordinates.set(address, coordinate);
    result.push(coordinate);
  }
  return result;
}
