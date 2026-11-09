import { convertGpsBatch } from '@/utils/gpsCoordinates';
import type { VehicleTelemetry } from './interface';

type Point = [number, number];
export async function prepareTelemetryMap(amap: typeof AMap, telemetry: VehicleTelemetry, cancelled: () => boolean = () => false) {
  // Preserve discontinuities before reducing display points. Never join across a 30-minute gap.
  const groups: VehicleTelemetry['track'][] = [];
  for (const point of telemetry.track) {
    const lastGroup = groups[groups.length - 1];
    const previous = lastGroup?.[lastGroup.length - 1];
    if (!previous || Date.parse(point.timestamp) - Date.parse(previous.timestamp) > 30 * 60000) groups.push([]);
    groups[groups.length - 1]!.push(point);
  }
  const step = Math.max(1, Math.ceil(telemetry.track.length / 400));
  const sampled = groups.map(group => group.filter((_, i) => i % step === 0 || i === group.length - 1));
  const all = sampled.flatMap(group => group.map(p => p.coordinate));
  const points = await convertGpsBatch(amap, all, cancelled);
  let offset = 0;
  const paths = sampled.map(group => { const path = points.slice(offset, offset + group.length); offset += group.length; return path; });
  return { paths, displayed: sampled.flat().length };
}

export function drawTelemetry(amap: typeof AMap, map: AMap.Map, telemetry: VehicleTelemetry, prepared: Awaited<ReturnType<typeof prepareTelemetryMap>>, color: string, options: { weight?: number; zIndex?: number } = {}) {
  const lines: AMap.Polyline[] = [];
  for (const path of prepared.paths) {
    if (path.length >= 2) {
      const line = new amap.Polyline({ path, strokeColor: color, strokeWeight: options.weight ?? 5, zIndex: options.zIndex ?? 50, showDir: true, isOutline: true, outlineColor: '#ffffff', borderWeight: 1 });
      map.add(line);
      lines.push(line);
    }
    else if (path[0]) map.add(new amap.Marker({ position: path[0], title: '独立GPS上报点' }));
  }
  return lines;
}
