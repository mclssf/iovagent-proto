import type { Order, P1Stop } from './interface';

export function waybillStops(order: Pick<Order, 'stops'>) {
  const stops = order.stops ?? [];
  return {
    loading: stops.filter(stop => stop.role === 'loading').sort((a, b) => a.sequence - b.sequence),
    unloading: stops.filter(stop => stop.role === 'unloading').sort((a, b) => a.sequence - b.sequence),
  };
}

export function waybillPlanWindow(order: Pick<Order, 'stops'>) {
  const { loading, unloading } = waybillStops(order);
  const planned = (stops: P1Stop[]) => stops.map(stop => stop.plannedAt).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const starts = planned(loading);
  const ends = planned(unloading);
  return {
    start: starts.length ? Math.min(...starts) : undefined,
    end: ends.length ? Math.max(...ends) : undefined,
  };
}

export function waybillVehicles(order: Pick<Order, 'plate' | 'vehicleSegments'>) {
  const segments = order.vehicleSegments?.length
    ? [...order.vehicleSegments].sort((a, b) => a.sequence - b.sequence)
    : order.plate.split('、').filter(Boolean).map((plate, index) => ({ plate, sequence: index + 1 }));
  return segments.map(segment => segment.plate);
}
