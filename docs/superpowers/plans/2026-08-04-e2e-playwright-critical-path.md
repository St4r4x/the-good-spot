# e2e Playwright on the critical path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Playwright e2e test covering the app's critical path (login → set two workplace addresses → shared zone appears → test a candidate housing address → result appears), running against the frontend alone with the Geoapify/Overpass-backed backend calls mocked at the network layer.

**Architecture:** Playwright drives Chromium against `next dev` (no backend, no docker-compose). Auth and all Supabase reads/writes (`profiles`, `workplaces`, `housing_searches`) go through a real, dedicated Supabase test account — fast, free, not worth mocking. The three backend-proxied, Geoapify/Overpass-backed calls (`/api/zone`, `/api/housing`, `/api/pois`) are intercepted via `page.route()` and answered with fixed JSON, so the test never touches the real backend or burns Geoapify quota.

**Tech Stack:** `@playwright/test` (new devDependency), Chromium only, existing Vitest/TypeScript/ESLint toolchain unchanged.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-e2e-playwright-critical-path-design.md`
- No backend, no docker-compose, no real Postgres — the frontend runs standalone via `npm run dev`
- `/api/zone`, `/api/housing`, `/api/pois` are always intercepted with `page.route()` in every e2e test — never a real network call to the backend or to Geoapify/Overpass
- Auth and all `profiles`/`workplaces`/`housing_searches` reads/writes go through a real Supabase test account — never mocked
- Test credentials (`E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`) come from environment variables, read from `frontend/.env.test.local` (already covered by the existing `.env*` line in `frontend/.gitignore` — no gitignore change needed for that file) — never hardcoded, never committed
- If the credentials aren't set, the critical-path test must `test.skip` with a clear message pointing at the README setup section — it must never hang or produce a confusing failure
- Vitest must not attempt to run Playwright's spec files, and vice versa
- Onboarding wizard e2e, CI wiring, non-Chromium browsers, Google OAuth login, POI filters, map pan/zoom, and error-path scenarios (invalid address, empty zone, 429) are explicitly out of scope for this plan

## File Structure

- `frontend/playwright.config.ts` — Playwright config: `testDir: "./e2e"`, `webServer` auto-starts `npm run dev`, Chromium project only.
- `frontend/e2e/mocks.ts` — the three canned fixtures (two overlapping isochrone squares + one housing result) and `installApiMocks(page)`, which installs the three `page.route()` handlers. Typed against `IsochroneResult`/`HousingResult`/`Poi` from `frontend/lib/api.ts` so a fixture/type mismatch is a compile error, not a runtime surprise.
- `frontend/e2e/smoke.spec.ts` — trivial "the app boots" test with no login/mocks, proving the Playwright harness itself works independently of Supabase credentials.
- `frontend/e2e/critical-path.spec.ts` — the real scenario, consuming `mocks.ts`.
- `frontend/vitest.config.ts` — modified to exclude `e2e/**` from Vitest's run, using `configDefaults.exclude` as the base so Vitest's own default excludes aren't lost.
- `frontend/package.json` — new devDependency `@playwright/test`, new script `test:e2e`.
- `frontend/.gitignore` — add `/test-results/` and `/playwright-report/` next to the existing `/coverage` entry.
- `README.md` — new "Tests e2e" section: one-time Supabase test account setup, `.env.test.local` contents, how to run.
- `CHANGELOG.md` — new entry under `[Unreleased]` (per this repo's convention of updating the changelog before every commit with code changes).

---

## Task 1: Playwright scaffolding + smoke test

**Files:**
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/smoke.spec.ts`
- Modify: `frontend/vitest.config.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/.gitignore`

**Interfaces:**
- Produces: a working `npx playwright test` command that later tasks' spec files run under, and a `test:e2e` npm script.

- [ ] **Step 1: Write the failing check**

There's no test code to make fail here in the usual red/green sense — the "red" state is that `@playwright/test` isn't installed yet. Confirm that first:

Run: `cd frontend && npx playwright test 2>&1 | head -5`
Expected: an error that `playwright` isn't found (e.g. `npm error could not determine executable to run` or similar "package not found" message) — proving there's nothing to accidentally pass against right now.

- [ ] **Step 2: Install Playwright and its browser**

```bash
cd frontend
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 3: Write `frontend/playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 4: Write `frontend/e2e/smoke.spec.ts`**

```typescript
import { expect, test } from "@playwright/test";

test("the landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/The Good Spot/);
});
```

- [ ] **Step 5: Exclude `e2e/**` from Vitest**

Replace the full contents of `frontend/vitest.config.ts`:

```typescript
import path from "path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
```

- [ ] **Step 6: Add the `test:e2e` script**

In `frontend/package.json`, in `"scripts"`, add (alongside the existing `"test": "vitest run"` entry):

```json
    "test:e2e": "playwright test",
```

- [ ] **Step 7: Update `frontend/.gitignore`**

In the `# testing` section, next to the existing `/coverage` line, add:

```
/test-results/
/playwright-report/
```

- [ ] **Step 8: Run the smoke test — verify it passes**

Run: `cd frontend && npm run test:e2e`
Expected: PASS — `1 passed`. This proves Playwright itself, the config, and the dev-server bootstrapping all work, independent of any Supabase credentials (the smoke test never logs in).

- [ ] **Step 9: Verify Vitest still only runs its own tests**

Run: `cd frontend && npm run test`
Expected: PASS — same `7 passed (7)` / `28 passed (28)` as before this change (no Playwright spec picked up, no new failures).

- [ ] **Step 10: Commit**

```bash
git add frontend/playwright.config.ts frontend/e2e/smoke.spec.ts frontend/vitest.config.ts frontend/package.json frontend/package-lock.json frontend/.gitignore
git commit -m "test: add Playwright e2e harness with a smoke test"
```

---

## Task 2: Critical-path scenario

**Files:**
- Create: `frontend/e2e/mocks.ts`
- Create: `frontend/e2e/critical-path.spec.ts`

**Interfaces:**
- Consumes: `IsochroneResult`, `HousingResult`, `Poi` types from `frontend/lib/api.ts` (already defined, unchanged by this plan).
- Produces: `installApiMocks(page: Page): Promise<void>` and the exported fixture constants (`ADDRESS_1`, `ADDRESS_2`, `HOUSING_ADDRESS`, `RESOLVED_1`, `RESOLVED_2`, `RESOLVED_HOUSING`) from `mocks.ts`, consumed by `critical-path.spec.ts`.

**Why the fixture coordinates are what they are:** `WorkplaceForm`'s submit handler (`frontend/components/isochrone-app.tsx`, `handleWorkplaceSubmit`) turns each `/api/zone` response's `isochrone.features[0]` polygon into `work1`/`work2`, then computes their intersection with `turf.intersect` (`frontend/lib/geo.ts`, `computeIntersection`). When you later submit `HousingForm`, `buildHousingMarker` (`frontend/lib/housing.ts`) decides `inZone` by testing the housing point against that *computed* intersection — not against anything the mocked `/api/housing` response says. So the two zone-square fixtures and the housing point below are chosen so the housing point genuinely falls inside the intersection turf computes from them:

- Zone 1 (mocked for `ADDRESS_1`): the square `lon [2.30, 2.34] × lat [48.85, 48.89]`.
- Zone 2 (mocked for `ADDRESS_2`): the square `lon [2.32, 2.36] × lat [48.85, 48.89]`.
- Their intersection is the strip `lon [2.32, 2.34] × lat [48.85, 48.89]`.
- The housing fixture's point is `lon 2.33, lat 48.87` — inside that strip.

- [ ] **Step 1: Write `frontend/e2e/mocks.ts`**

```typescript
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
```

- [ ] **Step 2: Write `frontend/e2e/critical-path.spec.ts`**

```typescript
import { expect, test } from "@playwright/test";
import {
  ADDRESS_1,
  ADDRESS_2,
  HOUSING_ADDRESS,
  RESOLVED_1,
  RESOLVED_2,
  RESOLVED_HOUSING,
  installApiMocks,
} from "./mocks";

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.skip(
  !EMAIL || !PASSWORD,
  "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not set — see README's \"Tests e2e\" section for one-time setup"
);

test("login, compute a shared zone, and test a candidate housing address", async ({ page }) => {
  await installApiMocks(page);

  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel("Mot de passe").fill(PASSWORD!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.getByLabel("Lieu de travail 1").fill(ADDRESS_1);
  await page.getByLabel("Lieu de travail 2").fill(ADDRESS_2);
  await page.getByLabel("Temps de trajet max").fill("30");

  // handleWorkplaceSubmit sets work1/work2 (which enables HousingForm) BEFORE
  // it awaits the real Supabase `workplaces` upsert, and only sets
  // `intersection` (which buildHousingMarker's in-zone check depends on)
  // AFTER that upsert resolves. Waiting for the upsert's response here,
  // wrapped with the click to avoid missing it, is what makes the later
  // "Dans la zone" assertion deterministic instead of a race.
  await Promise.all([
    page.waitForResponse((resp) => resp.url().includes("/rest/v1/workplaces")),
    page.getByRole("button", { name: "Calculer la zone" }).click(),
  ]);

  await expect(page.getByText(RESOLVED_1)).toBeVisible();
  await expect(page.getByText(RESOLVED_2)).toBeVisible();

  await page.getByLabel("Adresse d'un logement à tester").fill(HOUSING_ADDRESS);
  await page.getByRole("button", { name: "Tester ce logement" }).click();

  await expect(page.getByText(RESOLVED_HOUSING)).toBeVisible();
  await expect(page.getByText("Dans la zone")).toBeVisible();
  await expect(page.getByText("Lieu 1 : 12 min · Lieu 2 : 18 min")).toBeVisible();
});
```

- [ ] **Step 3: Type-check without credentials**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS, no errors. This is the compile-time check that `mocks.ts`'s fixtures genuinely match `IsochroneResult`/`HousingResult`/`Poi` — a shape mismatch (wrong field name, wrong nesting) is a type error here, not a confusing runtime failure later.

- [ ] **Step 4: Run the suite without credentials — verify the skip guard works**

Run: `cd frontend && npm run test:e2e`
Expected: `1 passed, 1 skipped` (the Task 1 smoke test passes; `critical-path.spec.ts`'s single test is skipped with the message from `test.skip`, not a timeout or a login failure). This is the only verification possible without real Supabase test credentials — the full scenario itself is verified manually in Task 3, once those credentials exist.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/mocks.ts frontend/e2e/critical-path.spec.ts
git commit -m "test: add e2e coverage for the critical user path"
```

---

## Task 3: Docs + one-time setup + manual verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:** none (docs only). This task also includes a manual verification step that cannot be automated (see Step 4) — it requires a human with access to the project's Supabase dashboard.

- [ ] **Step 1: Add a "Tests e2e" section to `README.md`**

Add a new section, after the existing `## API backend` section:

```markdown
## Tests e2e

`frontend/e2e/` contient un test Playwright du parcours critique (login →
zone commune → test d'un logement). Il tourne contre le frontend seul
(`npm run dev`) — pas de backend, pas de docker-compose : les appels
`/api/zone`, `/api/housing`, `/api/pois` sont mockés au niveau réseau
(`frontend/e2e/mocks.ts`).

**Setup, une seule fois** :
1. Créer un compte dans le projet Supabase du `.env.local` (signup normal
   via `/login` avec un email/mot de passe dédiés aux tests).
2. Compléter l'onboarding une fois à la main avec ce compte, en ne
   cochant **que** « Transports » comme moyen de transport (le test
   suppose que ce mode est déjà sélectionné à l'ouverture de `/app`).
3. Créer `frontend/.env.test.local` :
   ```
   E2E_TEST_EMAIL=<email du compte de test>
   E2E_TEST_PASSWORD=<mot de passe du compte de test>
   ```

**Lancer le test** :
```bash
cd frontend
npx playwright install chromium   # une fois
npm run test:e2e
```

Sans `.env.test.local` (ou sans les deux variables), le test du parcours
critique est *skip* proprement — seul le test de fumée (chargement de la
page d'accueil) s'exécute.

Chaque exécution écrit une nouvelle ligne dans `housing_searches` pour ce
compte (le formulaire de test de logement insère à chaque soumission,
comme en usage normal) — sans conséquence sur le test lui-même, mais à
savoir si vous inspectez ce compte dans Supabase.
```

- [ ] **Step 2: Add a CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]`:

```markdown
### Added
- Test e2e Playwright du parcours critique (login → zone commune → test
  d'un logement), `frontend/e2e/` — voir la section « Tests e2e » du
  README pour le setup.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document e2e Playwright setup for the critical path"
```

- [ ] **Step 4: Manual verification (not automatable by an implementer without Supabase dashboard access)**

Once a human with access to the project's Supabase dashboard has completed
the one-time setup from Step 1 above:

Run: `cd frontend && npm run test:e2e`
Expected: `2 passed` (smoke test + critical-path test, no longer skipped).
If it fails, the most likely causes, in order of likelihood, are: the test
account's saved travel mode isn't "Transports" only (re-check Step 1's
setup instructions), or a selector text in `critical-path.spec.ts` has
drifted from the actual component copy (re-diff against
`frontend/components/workplace-form.tsx`/`housing-form.tsx`/`housing-list.tsx`).
