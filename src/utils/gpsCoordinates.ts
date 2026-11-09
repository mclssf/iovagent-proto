export type GpsPoint = [number, number];
type ConversionResult = { info?: string; locations?: AMap.LngLat[] } | string;
const cache = new Map<string, GpsPoint>();
let queue: Promise<unknown> = Promise.resolve();
let lastStartedAt = 0;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function requestBatch(amap: typeof AMap, batch: GpsPoint[]) {
  return new Promise<GpsPoint[]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GPS坐标转换超时，请重试')), 12000);
    try {
      // The SDK replaces array entries with LngLat objects; retain our tuples for caching/retries.
      amap.convertFrom(batch.map(point => [point[0], point[1]] as GpsPoint), 'gps', (status: string, data: ConversionResult) => {
        clearTimeout(timer);
        if (status !== 'complete' || typeof data === 'string' || data.info?.toLowerCase() !== 'ok' || data.locations?.length !== batch.length) {
          const reason = typeof data === 'string' ? data : data.info || status;
          reject(new Error(`GPS坐标转换失败：${reason}`)); return;
        }
        resolve(data.locations.map(p => [p.getLng(), p.getLat()]));
      });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}

export async function convertGpsBatch(amap: typeof AMap, points: GpsPoint[], cancelled: () => boolean = () => false): Promise<GpsPoint[]> {
  const key = (point: GpsPoint) => point.join(',');
  const job = async () => {
    if (cancelled()) throw new Error('已取消旧页面的坐标转换');
    const missing = [...new Map(points.filter(p => !cache.has(key(p))).map(p => [key(p), p])).values()];
    for (let i = 0; i < missing.length; i += 40) {
      const batch = missing.slice(i, i + 40);
      let converted: GpsPoint[] | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (cancelled()) throw new Error('已取消旧页面的坐标转换');
        await pause(Math.max(0, lastStartedAt + 650 - Date.now()));
        if (cancelled()) throw new Error('已取消旧页面的坐标转换');
        lastStartedAt = Date.now();
        try { converted = await requestBatch(amap, batch); break; }
        catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (attempt === 3 || !/QPS|LIMIT|超时/i.test(message)) throw error;
          await pause(1000 * 2 ** attempt);
        }
      }
      if (!converted) throw new Error('GPS坐标转换未完成');
      converted.forEach((point, index) => cache.set(key(batch[index]!), point));
    }
    const result = points.map(point => cache.get(key(point))!);
    // Bound memory without changing the current result or persisting vehicle coordinates.
    while (cache.size > 12000) cache.delete(cache.keys().next().value!);
    return result;
  };
  const result = queue.then(job, job);
  queue = result.catch(() => {});
  return result;
}
