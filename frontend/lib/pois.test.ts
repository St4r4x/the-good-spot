import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { Poi } from "./api";
import { nearestPoi, poiBbox, poiLabel, poisInZone } from "./pois";

const square = (cx: number, cy: number, half: number) =>
  turf.polygon([
    [
      [cx - half, cy - half],
      [cx - half, cy + half],
      [cx + half, cy + half],
      [cx + half, cy - half],
      [cx - half, cy - half],
    ],
  ]);

describe("poiBbox", () => {
  it("returns [minLon, minLat, maxLon, maxLat] for the zone", () => {
    expect(poiBbox(square(0, 0, 2))).toEqual([-2, -2, 2, 2]);
  });
});

describe("poisInZone", () => {
  const zone = square(0, 0, 1);
  const poi = (over: Partial<Poi>): Poi => ({
    lat: 0,
    lon: 0,
    name: "Test",
    group: "sport",
    ...over,
  });

  it("keeps only POIs inside the zone", () => {
    const inside = poi({ lat: 0, lon: 0 });
    const outside = poi({ lat: 10, lon: 10 });
    expect(poisInZone([inside, outside], zone)).toEqual([inside]);
  });
});

describe("poiLabel", () => {
  it("returns the POI name when present", () => {
    expect(
      poiLabel({ lat: 0, lon: 0, name: "École Jules Ferry", group: "education" })
    ).toBe("École Jules Ferry");
  });

  it("falls back to the group's default label when name is absent", () => {
    expect(poiLabel({ lat: 0, lon: 0, name: null, group: "sport" })).toBe(
      "Lieu de sport"
    );
  });
});

describe("nearestPoi", () => {
  const poi = (over: Partial<Poi>): Poi => ({
    lat: 0,
    lon: 0,
    name: "Test",
    group: "education",
    ...over,
  });

  it("returns null when there is no POI of the given group", () => {
    expect(nearestPoi([0, 0], [poi({ group: "sport" })], "education")).toBeNull();
  });

  it("returns the nearest POI of the given group with its distance in meters", () => {
    const near = poi({ name: "École Proche", lat: 0.001, lon: 0 });
    const far = poi({ name: "École Loin", lat: 0.01, lon: 0 });
    const result = nearestPoi([0, 0], [far, near], "education");
    expect(result?.poi).toEqual(near);
    expect(result?.distanceMeters).toBeGreaterThan(0);
    expect(result?.distanceMeters).toBeLessThan(200);
  });

  it("ignores POIs from other groups", () => {
    const school = poi({ group: "education", lat: 0.01, lon: 0 });
    const gym = poi({ group: "sport", lat: 0.0001, lon: 0 });
    expect(nearestPoi([0, 0], [school, gym], "education")?.poi).toEqual(school);
  });
});
