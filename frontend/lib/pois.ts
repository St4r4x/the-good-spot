import * as turf from "@turf/turf";
import {
  BusFront,
  Dumbbell,
  GraduationCap,
  Landmark,
  ShoppingBasket,
  Stethoscope,
  Trees,
  UtensilsCrossed,
} from "lucide-react";
import type { Poi, PoiGroup } from "./api";
import { isPointInPolygon, type PolygonFeature } from "./geo";

export const POI_GROUPS_ORDER: PoiGroup[] = [
  "education",
  "sport",
  "commerce",
  "health",
  "parks",
  "catering",
  "public_transport",
  "culture",
];

export const POI_GROUP_LABELS: Record<PoiGroup, string> = {
  education: "Éducation",
  sport: "Sport",
  commerce: "Commerces du quotidien",
  health: "Santé",
  parks: "Parcs & nature",
  catering: "Restauration",
  public_transport: "Transports en commun",
  culture: "Culture & loisirs",
};

export const POI_GROUP_ICONS: Record<PoiGroup, typeof Dumbbell> = {
  education: GraduationCap,
  sport: Dumbbell,
  commerce: ShoppingBasket,
  health: Stethoscope,
  parks: Trees,
  catering: UtensilsCrossed,
  public_transport: BusFront,
  culture: Landmark,
};

const DEFAULT_NAMES: Record<PoiGroup, string> = {
  education: "École",
  sport: "Lieu de sport",
  commerce: "Commerce",
  health: "Établissement de santé",
  parks: "Parc",
  catering: "Restauration",
  public_transport: "Arrêt de transport",
  culture: "Lieu culturel",
};

export function poiBbox(zone: PolygonFeature): [number, number, number, number] {
  const [minLon, minLat, maxLon, maxLat] = turf.bbox(zone);
  return [minLon, minLat, maxLon, maxLat];
}

export function poisInZone(pois: Poi[], zone: PolygonFeature): Poi[] {
  return pois.filter((p) => isPointInPolygon([p.lon, p.lat], zone));
}

export function poiLabel(poi: Poi): string {
  return poi.name ?? DEFAULT_NAMES[poi.group];
}
