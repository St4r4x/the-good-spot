import * as turf from "@turf/turf";

export type PolygonFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

export function computeIntersection(
  polygon1: PolygonFeature,
  polygon2: PolygonFeature
): PolygonFeature | null {
  return turf.intersect(turf.featureCollection([polygon1, polygon2])) ?? null;
}

export function computeUnion(polygons: PolygonFeature[]): PolygonFeature {
  if (polygons.length === 1) return polygons[0];
  return turf.union(turf.featureCollection(polygons)) ?? polygons[0];
}

export function isPointInPolygon(
  point: [number, number],
  polygon: PolygonFeature
): boolean {
  return turf.booleanPointInPolygon(point, polygon);
}
