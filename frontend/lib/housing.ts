import type { HousingResult } from "./api";
import { isPointInPolygon, type PolygonFeature } from "./geo";

export type HousingMarker = {
  id?: string;
  lat: number;
  lon: number;
  inZone: boolean;
  resolvedAddress: string;
  timeToWork1Minutes: number;
  timeToWork2Minutes: number;
};

export function buildHousingMarker(
  results: HousingResult[],
  intersection: PolygonFeature | null
): HousingMarker {
  const first = results[0];
  return {
    lat: first.lat,
    lon: first.lon,
    resolvedAddress: first.resolved_address,
    inZone: intersection ? isPointInPolygon([first.lon, first.lat], intersection) : false,
    timeToWork1Minutes: Math.min(...results.map((r) => r.time_to_work1_minutes)),
    timeToWork2Minutes: Math.min(...results.map((r) => r.time_to_work2_minutes)),
  };
}

export function removeHousingAt(list: HousingMarker[], index: number): HousingMarker[] {
  return list.filter((_, i) => i !== index);
}
