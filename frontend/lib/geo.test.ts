import * as turf from "@turf/turf";
import { describe, expect, it } from "vitest";
import { computeIntersection, computeUnion, isPointInPolygon } from "./geo";

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

describe("computeIntersection", () => {
  it("returns the overlapping area when polygons overlap", () => {
    const a = square(0, 0, 1);
    const b = square(1, 0, 1);
    const result = computeIntersection(a, b);
    expect(result).not.toBeNull();
  });

  it("returns null when polygons do not overlap", () => {
    const a = square(0, 0, 1);
    const b = square(10, 10, 1);
    expect(computeIntersection(a, b)).toBeNull();
  });
});

describe("computeUnion", () => {
  it("returns the same polygon when given a single polygon", () => {
    const a = square(0, 0, 1);
    expect(computeUnion([a])).toBe(a);
  });

  it("merges disjoint polygons into a multi-part union", () => {
    const a = square(0, 0, 1);
    const b = square(10, 10, 1);
    const union = computeUnion([a, b]);
    expect(union.geometry.type).toBe("MultiPolygon");
  });
});

describe("isPointInPolygon", () => {
  it("returns true for a point inside the polygon", () => {
    const a = square(0, 0, 1);
    expect(isPointInPolygon([0, 0], a)).toBe(true);
  });

  it("returns false for a point outside the polygon", () => {
    const a = square(0, 0, 1);
    expect(isPointInPolygon([10, 10], a)).toBe(false);
  });
});
