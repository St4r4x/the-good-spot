import type { Page, Route } from "@playwright/test";
import type { HousingResult, IsochroneResult, Poi } from "../lib/api";

export const ADDRESS_1 = "10 Rue de Rivoli, 75001 Paris";
export const ADDRESS_2 = "20 Avenue Foch, 75116 Paris";
export const HOUSING_ADDRESS = "5 Rue du Temple, 75004 Paris";

export const RESOLVED_1 = "10 Rue de Rivoli, 75001 Paris, France";
export const RESOLVED_2 = "20 Avenue Foch, 75116 Paris, France";
export const RESOLVED_HOUSING = "5 Rue du Temple, 75004 Paris, France";

function squareZone(
  resolvedAddress: string,
  lat: number,
  lon: number,
  ring: [number, number][]
): IsochroneResult {
  return {
    resolved_address: resolvedAddress,
    lat,
    lon,
    isochrone: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [ring] },
        },
      ],
    },
  };
}

const ZONE_1 = squareZone(RESOLVED_1, 48.87, 2.32, [
  [2.3, 48.85],
  [2.34, 48.85],
  [2.34, 48.89],
  [2.3, 48.89],
  [2.3, 48.85],
]);

const ZONE_2 = squareZone(RESOLVED_2, 48.87, 2.34, [
  [2.32, 48.85],
  [2.36, 48.85],
  [2.36, 48.89],
  [2.32, 48.89],
  [2.32, 48.85],
]);

const HOUSING_RESULT: HousingResult = {
  resolved_address: RESOLVED_HOUSING,
  lat: 48.87,
  lon: 2.33,
  time_to_work1_minutes: 12,
  time_to_work2_minutes: 18,
};

export async function installApiMocks(page: Page): Promise<void> {
  await page.route("**/api/zone**", (route: Route) => {
    const address = new URL(route.request().url()).searchParams.get("address");
    if (address === ADDRESS_1) return route.fulfill({ json: ZONE_1 });
    if (address === ADDRESS_2) return route.fulfill({ json: ZONE_2 });
    return route.fulfill({ status: 400, json: { detail: `unexpected address: ${address}` } });
  });

  await page.route("**/api/housing**", (route: Route) => route.fulfill({ json: HOUSING_RESULT }));

  await page.route("**/api/pois**", (route: Route) =>
    route.fulfill({ json: { pois: [] satisfies Poi[] } })
  );
}
