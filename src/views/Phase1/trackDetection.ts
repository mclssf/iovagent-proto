import type { P1TrackPoint, P1VehicleSegment } from '@/views/AgentWork/interface';

export interface TransferCandidate {
  fromPlate: string;
  toPlate: string;
  at: number;
  distanceMeters: number;
  overlapMinutes: number;
  point: P1TrackPoint;
}

function distanceMeters(a: P1TrackPoint, b: P1TrackPoint) {
  const lat = (a.lat + b.lat) / 2 * Math.PI / 180;
  return Math.hypot((a.lon - b.lon) * 111320 * Math.cos(lat), (a.lat - b.lat) * 110540);
}

function parkingWindows(points: P1TrackPoint[], plate: string, radiusMeters: number) {
  const vehiclePoints = points.filter(point => point.vehiclePlate === plate).sort((a, b) => a.at - b.at);
  const windows: { start: number; end: number; point: P1TrackPoint }[] = [];
  let run: P1TrackPoint[] = [];
  const flush = () => {
    if (run.length > 1 && run[run.length - 1]!.at > run[0]!.at) windows.push({ start: run[0]!.at, end: run[run.length - 1]!.at, point: run[run.length - 1]! });
    run = [];
  };
  for (const point of vehiclePoints) {
    if (point.speedKmh !== undefined && point.speedKmh > 5) { flush(); continue; }
    if (run.length && distanceMeters(run[0]!, point) > radiusMeters) flush();
    run.push(point);
  }
  flush();
  return windows;
}

export function detectVehicleTransfers(points: P1TrackPoint[], segments: P1VehicleSegment[], config: { distanceMeters: number; overlapMinutes: number }, start: number, end: number): TransferCandidate[] {
  const history = points.filter(point => point.at >= start && point.at <= end);
  const ordered = [...segments].sort((a, b) => a.sequence - b.sequence);
  const candidates: TransferCandidate[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const fromPlate = ordered[index - 1]!.plate;
    const toPlate = ordered[index]!.plate;
    const fromWindows = parkingWindows(history, fromPlate, config.distanceMeters);
    const toWindows = parkingWindows(history, toPlate, config.distanceMeters);
    const matches = fromWindows.flatMap(from => toWindows.map(to => {
      const overlapMinutes = Math.max(0, (Math.min(from.end, to.end) - Math.max(from.start, to.start)) / 60000);
      const distance = distanceMeters(from.point, to.point);
      return overlapMinutes >= config.overlapMinutes && distance <= config.distanceMeters
        ? { fromPlate, toPlate, at: Math.min(from.end, to.end), distanceMeters: Math.round(distance), overlapMinutes: Math.floor(overlapMinutes), point: to.point }
        : null;
    }).filter((candidate): candidate is TransferCandidate => candidate !== null));
    matches.sort((a, b) => b.at - a.at);
    if (matches[0]) candidates.push(matches[0]);
  }
  return candidates.sort((a, b) => a.at - b.at);
}

export function detectHighwayTransitions(points: P1TrackPoint[], start: number, end: number) {
  const grouped = new Map<string, P1TrackPoint[]>();
  for (const point of points.filter(point => point.at >= start && point.at <= end && point.onHighway !== undefined)) {
    const plate = point.vehiclePlate ?? '';
    grouped.set(plate, [...(grouped.get(plate) ?? []), point]);
  }
  const transitions: { point: P1TrackPoint; phase: '驶入高速' | '驶离高速' }[] = [];
  for (const vehiclePoints of grouped.values()) {
    vehiclePoints.sort((a, b) => a.at - b.at);
    for (let index = 1; index < vehiclePoints.length; index++) {
      if (vehiclePoints[index]!.onHighway !== vehiclePoints[index - 1]!.onHighway) transitions.push({ point: vehiclePoints[index]!, phase: vehiclePoints[index]!.onHighway ? '驶入高速' : '驶离高速' });
    }
  }
  return transitions.sort((a, b) => a.point.at - b.point.at);
}
