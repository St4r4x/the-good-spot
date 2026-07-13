import { describe, expect, it } from "vitest";
import {
  housingSearchRowToMarker,
  markerToHousingSearchInsert,
  savedToWorkplacesUpsert,
  workplacesRowToDefaultPoiGroups,
  workplacesRowToSaved,
  type HousingSearchRow,
  type WorkplacesRow,
} from "./sync";
import type { HousingMarker } from "./housing";
import type { SavedWorkplaces } from "./sync";

describe("workplacesRowToSaved", () => {
  it("maps a Postgres row to the app's SavedWorkplaces shape", () => {
    const row: WorkplacesRow = {
      user_id: "u1",
      address1: "1 rue A",
      address2: "2 rue B",
      minutes: 45,
      modes: ["transit", "walk"],
      default_poi_groups: ["sport", "health"],
      updated_at: "2026-07-11T00:00:00Z",
    };
    expect(workplacesRowToSaved(row)).toEqual({
      address1: "1 rue A",
      address2: "2 rue B",
      minutes: "45",
      modes: ["transit", "walk"],
    });
  });
});

describe("workplacesRowToDefaultPoiGroups", () => {
  it("maps a Postgres row's default_poi_groups to PoiGroup[]", () => {
    const row: WorkplacesRow = {
      user_id: "u1",
      address1: "1 rue A",
      address2: "2 rue B",
      minutes: 45,
      modes: ["transit", "walk"],
      default_poi_groups: ["sport", "health"],
      updated_at: "2026-07-11T00:00:00Z",
    };
    expect(workplacesRowToDefaultPoiGroups(row)).toEqual(["sport", "health"]);
  });
});

describe("savedToWorkplacesUpsert", () => {
  it("maps SavedWorkplaces back to a Postgres upsert payload", () => {
    const saved: SavedWorkplaces = {
      address1: "1 rue A",
      address2: "2 rue B",
      minutes: "45",
      modes: ["transit", "walk"],
    };
    expect(savedToWorkplacesUpsert(saved, "u1")).toEqual({
      user_id: "u1",
      address1: "1 rue A",
      address2: "2 rue B",
      minutes: 45,
      modes: ["transit", "walk"],
    });
  });

});

describe("housingSearchRowToMarker", () => {
  it("maps a Postgres row to a HousingMarker with its id", () => {
    const row: HousingSearchRow = {
      id: "abc-123",
      user_id: "u1",
      resolved_address: "10 rue Test",
      lat: 48.85,
      lon: 2.35,
      in_zone: true,
      time_to_work1_minutes: 20,
      time_to_work2_minutes: 30,
      created_at: "2026-07-11T00:00:00Z",
    };
    expect(housingSearchRowToMarker(row)).toEqual({
      id: "abc-123",
      lat: 48.85,
      lon: 2.35,
      inZone: true,
      resolvedAddress: "10 rue Test",
      timeToWork1Minutes: 20,
      timeToWork2Minutes: 30,
    });
  });
});

describe("markerToHousingSearchInsert", () => {
  it("maps a HousingMarker to a Postgres insert payload", () => {
    const marker: HousingMarker = {
      lat: 48.85,
      lon: 2.35,
      inZone: true,
      resolvedAddress: "10 rue Test",
      timeToWork1Minutes: 20,
      timeToWork2Minutes: 30,
    };
    expect(markerToHousingSearchInsert(marker, "u1")).toEqual({
      user_id: "u1",
      resolved_address: "10 rue Test",
      lat: 48.85,
      lon: 2.35,
      in_zone: true,
      time_to_work1_minutes: 20,
      time_to_work2_minutes: 30,
    });
  });
});
