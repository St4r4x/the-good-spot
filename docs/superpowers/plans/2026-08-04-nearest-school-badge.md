# Nearest-education-POI badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show "École la plus proche : *nom*, à *N* m" for each tested housing address, in both the map popup and the housing list — only when the Éducation POI filter is active, computed purely client-side from POIs already loaded.

**Architecture:** A new pure function `nearestPoi` (`frontend/lib/pois.ts`) finds the closest POI of a given group to a point, using `turf.distance`. `isochrone-app.tsx` derives one `NearestPoi | null` per housing marker on every render (no new state, no persistence) and passes that array down to `HousingList` and `IsochroneMap`, which render it if present.

**Tech Stack:** TypeScript, `@turf/turf` (existing dependency), Vitest (existing test stack). No backend changes, no Supabase schema changes.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-nearest-school-badge-design.md`
- No `/pois` contract change, no new backend endpoint, no new Supabase column
- The badge never triggers a new `/pois` fetch — if `poiGroups` doesn't include `"education"`, the badge is `null` (hidden), full stop
- Nearest POI is computed fresh on every render from already-loaded `pois` state — never persisted to `housing_searches`
- Distance is straight-line (`turf.distance`), not a real travel time
- The nearest POI can be any POI in the `"education"` group (school, childcare, or music school) — no sub-category distinction
- Displayed in both `HousingList` and the `IsochroneMap` housing marker popup, using the same wording
- Falls back to `poiLabel(poi)` (existing helper) when the POI has no `name` — no new fallback text

## File Structure

- `frontend/lib/pois.ts` — add `NearestPoi` type and `nearestPoi(point, pois, group)`, alongside the existing `poiBbox`/`poisInZone`/`poiLabel` (same module, same responsibility: pure POI-domain logic, no components).
- `frontend/lib/pois.test.ts` — extend with `nearestPoi` test cases.
- `frontend/components/isochrone-app.tsx` — derive `nearestSchools` from `housingMarkers`/`pois`/`poiGroups`, pass to `HousingList` and `IsochroneMap`.
- `frontend/components/housing-list.tsx` — accept `nearestSchools` prop, render the badge line.
- `frontend/components/map/isochrone-map.tsx` — accept `nearestSchools` prop, append the badge line to the housing marker popup.
- `CHANGELOG.md` — one entry for the whole feature, added once the badge is actually visible (Task 2).

---

## Task 1: `nearestPoi` (`frontend/lib/pois.ts`)

**Files:**
- Modify: `frontend/lib/pois.ts`
- Modify: `frontend/lib/pois.test.ts`

**Interfaces:**
- Produces: `export type NearestPoi = { poi: Poi; distanceMeters: number }` and `export function nearestPoi(point: [number, number], pois: Poi[], group: PoiGroup): NearestPoi | null` — consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/lib/pois.test.ts` (the file already imports `turf`, `describe`/`expect`/`it` from vitest, and `type { Poi }` from `./api` — add `nearestPoi` to the existing `import { poiBbox, poiLabel, poisInZone } from "./pois"` line, making it `import { nearestPoi, poiBbox, poiLabel, poisInZone } from "./pois"`):

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run lib/pois.test.ts`
Expected: FAIL — `nearestPoi is not exported` / `nearestPoi is not a function`, not an assertion failure. This confirms the tests exercise code that doesn't exist yet, not a typo in the test itself.

- [ ] **Step 3: Write minimal implementation**

In `frontend/lib/pois.ts`, add after the existing imports (the file already has `import * as turf from "@turf/turf";` and `import type { Poi, PoiGroup } from "./api";` — no new imports needed) and after `poisInZone`:

```typescript
export type NearestPoi = { poi: Poi; distanceMeters: number };

export function nearestPoi(
  point: [number, number],
  pois: Poi[],
  group: PoiGroup
): NearestPoi | null {
  const candidates = pois.filter((p) => p.group === group);
  if (candidates.length === 0) return null;
  let nearest = candidates[0];
  let nearestDistance = turf.distance(point, [nearest.lon, nearest.lat], { units: "meters" });
  for (const candidate of candidates.slice(1)) {
    const distance = turf.distance(point, [candidate.lon, candidate.lat], { units: "meters" });
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return { poi: nearest, distanceMeters: Math.round(nearestDistance) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run lib/pois.test.ts`
Expected: PASS, all `nearestPoi` cases green, and the pre-existing `poiBbox`/`poisInZone`/`poiLabel` cases in the same file still pass unchanged.

- [ ] **Step 5: Run the full frontend check suite**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run test`
Expected: all clean/PASS — `tsc` has no errors, lint is clean, Vitest shows `7 passed (7)` files / `31 passed (31)` tests (28 pre-existing + 3 new `nearestPoi` cases).

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/pois.ts frontend/lib/pois.test.ts
git commit -m "feat: add nearestPoi helper for finding the closest POI of a group"
```

---

## Task 2: Wire the badge into the app and both display surfaces

**Files:**
- Modify: `frontend/components/isochrone-app.tsx`
- Modify: `frontend/components/housing-list.tsx`
- Modify: `frontend/components/map/isochrone-map.tsx`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `nearestPoi`, `NearestPoi` from `frontend/lib/pois.ts` (Task 1).
- Produces: no new public interface — this task only threads a derived `(NearestPoi | null)[]` (one entry per `housingMarkers[i]`) from `isochrone-app.tsx` down to `HousingList` and `IsochroneMap`, both of which gain a new required `nearestSchools` prop.

- [ ] **Step 1: Modify `frontend/components/isochrone-app.tsx`**

Change the import line:

```typescript
import { poiBbox, poisInZone } from "@/lib/pois";
```

to:

```typescript
import { nearestPoi, poiBbox, poisInZone } from "@/lib/pois";
```

Right before the `return (` statement (after `handleHousingSubmit`'s closing brace, before the JSX), add:

```typescript
const nearestSchools = housingMarkers.map((h) =>
  poiGroups.includes("education") ? nearestPoi([h.lon, h.lat], pois, "education") : null
);
```

Update the `<IsochroneMap>` element to add the new prop:

```tsx
<IsochroneMap
  work1={work1}
  work2={work2}
  intersection={intersection}
  housingMarkers={housingMarkers}
  focus={focus}
  pois={pois}
  nearestSchools={nearestSchools}
/>
```

Update the `<HousingList>` element to add the new prop:

```tsx
<HousingList
  items={housingMarkers}
  nearestSchools={nearestSchools}
  onRemove={handleRemoveHousing}
  onFocus={handleFocusHousing}
/>
```

- [ ] **Step 2: Modify `frontend/components/housing-list.tsx`**

Replace the file's imports and component signature:

```tsx
"use client";

import type { HousingMarker } from "@/lib/housing";
import type { NearestPoi } from "@/lib/pois";
import { poiLabel } from "@/lib/pois";
import { cn } from "@/lib/utils";
import { CircleAlert, CircleCheck, GraduationCap, X } from "lucide-react";

type HousingListProps = {
  items: HousingMarker[];
  nearestSchools: (NearestPoi | null)[];
  onRemove: (index: number) => void;
  onFocus: (index: number) => void;
};

export function HousingList({ items, nearestSchools, onRemove, onFocus }: HousingListProps) {
```

Add the badge line right after the existing travel-times `<p>` (which reads `Lieu 1 : {h.timeToWork1Minutes} min · Lieu 2 : {h.timeToWork2Minutes} min`), still inside the same `<li>`:

```tsx
          {nearestSchools[i] && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <GraduationCap aria-hidden className="size-3.5 shrink-0" />
              École la plus proche : {poiLabel(nearestSchools[i]!.poi)}, à{" "}
              {nearestSchools[i]!.distanceMeters} m
            </p>
          )}
```

(The `.map((h, i) => (` on this file already provides `i` — no change needed there.)

- [ ] **Step 3: Modify `frontend/components/map/isochrone-map.tsx`**

Add to the existing `import { POI_GROUP_ICONS, POI_GROUP_LABELS, poiLabel } from "@/lib/pois";` line — it already imports `poiLabel`, just add the type import right after it:

```typescript
import { POI_GROUP_ICONS, POI_GROUP_LABELS, poiLabel } from "@/lib/pois";
import type { NearestPoi } from "@/lib/pois";
```

Add `nearestSchools` to `IsochroneMapProps`:

```typescript
type IsochroneMapProps = {
  work1: WorkResult | null;
  work2: WorkResult | null;
  intersection: PolygonFeature | null;
  housingMarkers: HousingMarker[];
  focus: { index: number; token: number } | null;
  pois: Poi[];
  nearestSchools: (NearestPoi | null)[];
};
```

Destructure it in the component signature (add `nearestSchools` next to the existing `pois` in the function's parameter list).

Replace the housing markers block inside the map-building `useEffect`:

```typescript
    housingMarkers.forEach((h, i) => {
      const nearestSchool = nearestSchools[i];
      const marker = L.circleMarker([h.lat, h.lon], {
        radius: 9,
        color: h.inZone ? MAP_COLORS.zone1 : "#8a8f8f",
        fillColor: h.inZone ? MAP_COLORS.housingIn : MAP_COLORS.housingOut,
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(
          `<strong>${escapeHtml(h.resolvedAddress)}</strong><br>` +
            `<span style="color:${h.inZone ? MAP_COLORS.zone1 : "#8a5230"};font-weight:600">` +
            `${h.inZone ? "Dans la zone" : "Hors zone"}</span><br>` +
            `Trajet lieu 1 : ${h.timeToWork1Minutes} min<br>` +
            `Trajet lieu 2 : ${h.timeToWork2Minutes} min` +
            (nearestSchool
              ? `<br>École la plus proche : ${escapeHtml(poiLabel(nearestSchool.poi))}, à ${nearestSchool.distanceMeters} m`
              : "")
        );
      layersRef.current.push(marker);
      housingLayersRef.current.push(marker);
      bounds = bounds.extend([h.lat, h.lon]);
    });

    map.fitBounds(bounds, { padding: [24, 24] });
  }, [work1, work2, intersection, housingMarkers, nearestSchools]);
```

(Only the `.forEach((h) =>` → `.forEach((h, i) =>`, the new `nearestSchool` line, the appended popup segment, and `nearestSchools` added to the dependency array actually change — everything else in this block is unchanged from the current file, shown here in full only so the exact insertion points are unambiguous.)

- [ ] **Step 4: Run the full frontend check suite**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run test`
Expected: all clean/PASS. `tsc` catches any prop-shape mismatch immediately (e.g. a missing `nearestSchools` prop on either consumer) — pay attention to its output specifically, since this task has no dedicated new automated test of its own (the display wiring is thin prop-threading over already-tested logic from Task 1; this repo's existing convention doesn't add component tests for `WorkplaceForm`/`HousingForm`-style presentational components either).

- [ ] **Step 5: Manual visual check (recommended, not automated by this plan)**

Run `cd frontend && npm run dev`, log in, set two workplace addresses with "Éducation" checked in the POI filters, test a candidate housing address inside the zone, and confirm "École la plus proche : …, à … m" appears both in the housing list item and in the map marker's popup. Uncheck "Éducation" and test another address — confirm the badge is absent both places. This step requires a real Supabase session (same setup as `frontend/e2e/`'s critical-path test) — skip it if that isn't available in your environment and rely on Step 4's checks instead; note in your report either way.

- [ ] **Step 6: Update `CHANGELOG.md`**

Under `## [Unreleased]`, add (or extend the existing `### Added` list if one is already there under `[Unreleased]`):

```markdown
- Badge « école la plus proche » (distance à vol d'oiseau) sur un logement
  testé, affiché dans la liste et le popup carte — visible seulement si le
  filtre POI « Éducation » est actif ; aucune donnée persistée, aucun appel
  API supplémentaire.
```

- [ ] **Step 7: Commit**

```bash
git add frontend/components/isochrone-app.tsx frontend/components/housing-list.tsx frontend/components/map/isochrone-map.tsx CHANGELOG.md
git commit -m "feat: show nearest-education-POI badge on tested housing results"
```
