import { nearestRoutePoint } from './dispatchDemo';
import type { AMapCoordinate } from '@/utils/amap';

interface TollPoi { name?: string; location?: AMap.LngLat }
interface TollSearchResult { poiList?: { pois?: TollPoi[] } }
type AMapWithPlaceSearch = typeof AMap & { PlaceSearch: new (options?: { pageSize?: number }) => {
  searchNearBy(keyword: string, center: AMap.LngLatLike, radius: number, callback: (status: string, result: TollSearchResult | string) => void): void;
} };

export async function findTollStation(amap: typeof AMap, near: AMapCoordinate, path: AMapCoordinate[]) {
  await Promise.race([
    new Promise<void>(resolve => amap.plugin(['AMap.PlaceSearch'], resolve)),
    new Promise<void>(resolve => setTimeout(resolve, 1800)),
  ]);
  const PlaceSearch = (amap as AMapWithPlaceSearch).PlaceSearch;
  if (!PlaceSearch) return undefined;
  const search = new PlaceSearch({ pageSize: 20 });
  return new Promise<{ name: string; position: AMapCoordinate } | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), 4500);
    search.searchNearBy('收费站', near, 12000, (status, result) => {
      clearTimeout(timer);
      if (status !== 'complete' || typeof result === 'string') { resolve(undefined); return; }
      const matches = (result.poiList?.pois ?? []).filter(poi => poi.name && /收费站|收费口/.test(poi.name) && poi.location);
      for (const poi of matches) {
        const location = poi.location!.toArray();
        const position = nearestRoutePoint(path, location);
        if (!position) continue;
        const meters = Math.hypot((position[0] - location[0]) * 85000, (position[1] - location[1]) * 111000);
        if (meters <= 3000) { resolve({ name: poi.name!, position }); return; }
      }
      resolve(undefined);
    });
  });
}
