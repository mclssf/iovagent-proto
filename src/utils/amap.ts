let loaderPromise: Promise<void> | null = null;
let amapPromise: Promise<typeof AMap> | null = null;

export type AMapCoordinate = [number, number];

interface DrivingResult {
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
    callback: (status: string, result: DrivingResult) => void,
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
  if (coordinates.length === 0) return [];
  return new Promise<AMapCoordinate[]>((resolve) => {
    amap.convertFrom(coordinates, 'gps', (status: string, result: { info?: string; locations?: AMap.LngLat[] }) => {
      if (status === 'complete' && result.info === 'ok' && result.locations?.length === coordinates.length) {
        resolve(result.locations.map((location) => location.toArray()));
        return;
      }
      resolve(coordinates);
    });
  });
}

export async function searchDrivingRoute(
  amap: typeof AMap,
  coordinates: AMapCoordinate[],
  policy = 0,
) {
  if (coordinates.length < 2) throw new Error('驾车路线至少需要起点和终点');
  const drivingApi = amap as AMapWithDriving;
  const driving = new drivingApi.Driving({ policy, showTraffic: false });
  const [start, ...rest] = coordinates;
  const end = rest.pop()!;

  return new Promise<{ distance: number; duration: number; path: AMapCoordinate[] }>((resolve, reject) => {
    driving.search(start!, end, { waypoints: rest }, (status, result) => {
      const route = result.routes?.[0];
      const path = route?.steps?.flatMap((step) => step.path ?? []).map((point) => point.toArray()) ?? [];
      if (status !== 'complete' || path.length < 2) {
        reject(new Error('高德驾车路线规划失败'));
        return;
      }
      resolve({
        distance: route?.distance ?? 0,
        duration: route?.time ?? 0,
        path,
      });
    });
  });
}
