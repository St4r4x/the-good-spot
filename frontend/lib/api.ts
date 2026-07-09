export type TravelMode = "transit" | "walk" | "bicycle" | "drive";

export type IsochroneResult = {
  resolved_address: string;
  lat: number;
  lon: number;
  isochrone: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
};

export type HousingResult = {
  resolved_address: string;
  lat: number;
  lon: number;
  time_to_work1_minutes: number;
  time_to_work2_minutes: number;
};

export class ApiError extends Error {}

async function parseErrorOrThrow(resp: Response): Promise<never> {
  const detail = await resp.json().catch(() => ({}));
  throw new ApiError(detail.detail || `Erreur ${resp.status}`);
}

export async function fetchIsochrone(
  address: string,
  minutes: number,
  mode: TravelMode
): Promise<IsochroneResult> {
  const params = new URLSearchParams({ address, minutes: String(minutes), mode });
  const resp = await fetch(`/api/isochrone?${params}`);
  if (!resp.ok) return parseErrorOrThrow(resp);
  return resp.json();
}

export async function fetchHousing(
  address: string,
  work1: { lat: number; lon: number },
  work2: { lat: number; lon: number },
  mode: TravelMode
): Promise<HousingResult> {
  const params = new URLSearchParams({
    address,
    work1_lat: String(work1.lat),
    work1_lon: String(work1.lon),
    work2_lat: String(work2.lat),
    work2_lon: String(work2.lon),
    mode,
  });
  const resp = await fetch(`/api/housing?${params}`);
  if (!resp.ok) return parseErrorOrThrow(resp);
  return resp.json();
}
