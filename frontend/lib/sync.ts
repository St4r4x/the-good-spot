import type { HousingMarker } from "./housing";
import type { TravelMode } from "./api";

export type SavedWorkplaces = {
  address1: string;
  address2: string;
  minutes: string;
  modes: TravelMode[];
};

export type WorkplacesRow = {
  user_id: string;
  address1: string;
  address2: string;
  minutes: number;
  modes: string[];
  updated_at: string;
};

export type HousingSearchRow = {
  id: string;
  user_id: string;
  resolved_address: string;
  lat: number;
  lon: number;
  in_zone: boolean;
  time_to_work1_minutes: number;
  time_to_work2_minutes: number;
  created_at: string;
};

export function workplacesRowToSaved(row: WorkplacesRow): SavedWorkplaces {
  return {
    address1: row.address1,
    address2: row.address2,
    minutes: String(row.minutes),
    modes: row.modes as SavedWorkplaces["modes"],
  };
}

export function savedToWorkplacesUpsert(saved: SavedWorkplaces, userId: string) {
  return {
    user_id: userId,
    address1: saved.address1,
    address2: saved.address2,
    minutes: Number(saved.minutes),
    modes: saved.modes,
  };
}

export function housingSearchRowToMarker(row: HousingSearchRow): HousingMarker {
  return {
    id: row.id,
    lat: row.lat,
    lon: row.lon,
    inZone: row.in_zone,
    resolvedAddress: row.resolved_address,
    timeToWork1Minutes: row.time_to_work1_minutes,
    timeToWork2Minutes: row.time_to_work2_minutes,
  };
}

export function markerToHousingSearchInsert(marker: HousingMarker, userId: string) {
  return {
    user_id: userId,
    resolved_address: marker.resolvedAddress,
    lat: marker.lat,
    lon: marker.lon,
    in_zone: marker.inZone,
    time_to_work1_minutes: marker.timeToWork1Minutes,
    time_to_work2_minutes: marker.timeToWork2Minutes,
  };
}
