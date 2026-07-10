import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { HousingResult } from "./api";
import { buildHousingMarker, removeHousingAt } from "./housing";

const zone = turf.polygon([
  [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ],
]);

const result = (over: Partial<HousingResult>): HousingResult => ({
  resolved_address: "1 rue Test",
  lat: 0,
  lon: 0,
  time_to_work1_minutes: 20,
  time_to_work2_minutes: 30,
  ...over,
});

describe("buildHousingMarker", () => {
  it("keeps the best (minimum) time per workplace across modes", () => {
    const marker = buildHousingMarker(
      [
        result({ time_to_work1_minutes: 25, time_to_work2_minutes: 10 }),
        result({ time_to_work1_minutes: 15, time_to_work2_minutes: 40 }),
      ],
      zone
    );
    expect(marker.timeToWork1Minutes).toBe(15);
    expect(marker.timeToWork2Minutes).toBe(10);
  });

  it("flags inZone from the intersection polygon", () => {
    expect(buildHousingMarker([result({})], zone).inZone).toBe(true);
    expect(buildHousingMarker([result({ lat: 10, lon: 10 })], zone).inZone).toBe(false);
  });

  it("is out of zone when there is no intersection", () => {
    expect(buildHousingMarker([result({})], null).inZone).toBe(false);
  });
});

describe("removeHousingAt", () => {
  it("removes exactly the item at the given index", () => {
    const a = buildHousingMarker([result({ resolved_address: "A" })], null);
    const b = buildHousingMarker([result({ resolved_address: "B" })], null);
    expect(removeHousingAt([a, b], 0)).toEqual([b]);
    expect(removeHousingAt([a, b], 5)).toEqual([a, b]);
  });
});
