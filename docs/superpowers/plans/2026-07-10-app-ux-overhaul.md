# App UX Overhaul Implementation Plan (PR 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre l'UX de l'app carte : panneau latéral flottant (bottom-sheet sur mobile), formulaire étapé avec chips de transport, liste des logements testés, légende carte, accueil intégré, fix de la police Figtree.

**Architecture:** La carte Leaflet reste plein écran ; tout le chrome UI migre dans un composant `Panel` flottant (gauche sur desktop, bottom-sheet repliable au tap sur mobile). La logique pure (persistance localStorage, construction/suppression des entrées logement) est extraite dans `frontend/lib/` et testée avec Vitest (env node — pas de DOM, donc pas de test de composant).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui (base-ui), Leaflet, lucide-react, Vitest.

## Global Constraints

- Style : `DESIGN.md` fait loi — accent unique Deep Teal `oklch(55% 0.09 200)`, ombre Floating Panel `0 2px 12px oklch(22% 0.01 220 / 0.12)`, coins 8 px, flat-by-default, pas de dégradé décoratif, pas d'emoji comme icône.
- Couleurs carte inchangées : zone 1 `#0d7373`, zone 2 `#3f7d3f`, zone commune `#b3452e`, logement dans zone `#38b28a`, hors zone `#b8bcbc`.
- Aucune nouvelle dépendance npm/pip.
- Transitions 150–200 ms + `motion-reduce:transition-none` ; `cursor-pointer` sur tout cliquable ; cibles tactiles ≥ 44 px ; jamais couleur seule pour un état (icône ou texte en plus).
- Textes UI en français, code/commentaires en anglais, commits conventional commits en anglais.
- `frontend/AGENTS.md` : ce Next.js peut différer du connu — consulter `node_modules/next/dist/docs/` avant d'utiliser une API Next inhabituelle (ce plan n'en introduit aucune).
- Vitest tourne en env node : **aucun test ne doit toucher `window`/`localStorage`** — ne tester que des fonctions pures.
- Icônes lucide-react : si un nom d'import n'existe pas dans la version installée (`Bus`, `Footprints`, `Bike`, `Car`, `Check`, `X`, `ChevronDown`, `CircleCheck`, `CircleAlert`), utiliser l'alias historique (`CheckCircle2`, `AlertCircle`…) — vérifier avec l'autocomplete TS, ne pas deviner.
- Commandes de vérification (depuis `frontend/`) : `npm run test`, `npm run lint`, `npm run build`.

---

### Task 1: Fix Figtree font wiring

**Files:**
- Modify: `frontend/app/layout.tsx:5-8`

**Interfaces:**
- Consumes: rien.
- Produces: la variable CSS `--font-sans` définie par next/font, consommée par le mapping existant `@theme inline { --font-sans: var(--font-sans); }` de `globals.css` (qui devient fonctionnel au lieu de circulaire).

- [ ] **Step 1: Renommer la variable next/font**

Dans `frontend/app/layout.tsx`, remplacer :

```tsx
const figtree = Figtree({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
```

par :

```tsx
const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
});
```

- [ ] **Step 2: Vérifier le build**

Run: `cd frontend && npm run build`
Expected: build OK sans erreur.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/layout.tsx
git commit -m "fix: wire Figtree font variable to --font-sans so it actually applies"
```

---

### Task 2: Extract workplace persistence into lib (TDD)

**Files:**
- Create: `frontend/lib/workplaces.ts`
- Create: `frontend/lib/workplaces.test.ts`
- Modify: `frontend/components/workplace-form.tsx` (remplacer `readSavedWorkplaces` local et le `localStorage.setItem` inline)

**Interfaces:**
- Consumes: `TravelMode` depuis `@/lib/api`.
- Produces:
  - `type SavedWorkplaces = { address1: string; address2: string; minutes: string; modes: TravelMode[] }`
  - `const WORKPLACES_STORAGE_KEY = "isochrone-workplaces"`
  - `parseSavedWorkplaces(raw: string | null): SavedWorkplaces`
  - `serializeWorkplaces(w: SavedWorkplaces): string`

- [ ] **Step 1: Écrire les tests qui échouent**

`frontend/lib/workplaces.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { parseSavedWorkplaces, serializeWorkplaces } from "./workplaces";

describe("parseSavedWorkplaces", () => {
  it("returns defaults for null", () => {
    expect(parseSavedWorkplaces(null)).toEqual({
      address1: "",
      address2: "",
      minutes: "30",
      modes: ["transit"],
    });
  });

  it("returns defaults for corrupt JSON", () => {
    expect(parseSavedWorkplaces("{not json")).toEqual(parseSavedWorkplaces(null));
  });

  it("falls back to default modes when modes is empty or missing", () => {
    expect(parseSavedWorkplaces('{"modes":[]}').modes).toEqual(["transit"]);
    expect(parseSavedWorkplaces('{"address1":"a"}').modes).toEqual(["transit"]);
  });

  it("round-trips through serializeWorkplaces", () => {
    const w = {
      address1: "1 rue A",
      address2: "2 rue B",
      minutes: "45",
      modes: ["walk", "bicycle"] as const,
    };
    expect(parseSavedWorkplaces(serializeWorkplaces({ ...w, modes: [...w.modes] }))).toEqual(w);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd frontend && npm run test`
Expected: FAIL — `./workplaces` introuvable.

- [ ] **Step 3: Implémenter `frontend/lib/workplaces.ts`**

```ts
import type { TravelMode } from "./api";

export type SavedWorkplaces = {
  address1: string;
  address2: string;
  minutes: string;
  modes: TravelMode[];
};

export const WORKPLACES_STORAGE_KEY = "isochrone-workplaces";

const DEFAULTS: SavedWorkplaces = {
  address1: "",
  address2: "",
  minutes: "30",
  modes: ["transit"],
};

export function parseSavedWorkplaces(raw: string | null): SavedWorkplaces {
  if (!raw) return { ...DEFAULTS, modes: [...DEFAULTS.modes] };
  try {
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) };
    if (!Array.isArray(parsed.modes) || parsed.modes.length === 0) {
      parsed.modes = [...DEFAULTS.modes];
    }
    return parsed;
  } catch {
    // localStorage content is user-editable; corrupt values fall back to defaults.
    return { ...DEFAULTS, modes: [...DEFAULTS.modes] };
  }
}

export function serializeWorkplaces(w: SavedWorkplaces): string {
  return JSON.stringify(w);
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd frontend && npm run test`
Expected: PASS (suites geo + workplaces).

- [ ] **Step 5: Brancher le formulaire sur lib/workplaces**

Dans `frontend/components/workplace-form.tsx` : supprimer le type `SavedWorkplaces` local, la constante `STORAGE_KEY` et la fonction `readSavedWorkplaces` ; importer depuis la lib et remplacer :

```tsx
import {
  WORKPLACES_STORAGE_KEY,
  parseSavedWorkplaces,
  serializeWorkplaces,
} from "@/lib/workplaces";

// initialisation de l'état :
const [saved] = useState(() =>
  parseSavedWorkplaces(
    typeof window === "undefined" ? null : localStorage.getItem(WORKPLACES_STORAGE_KEY)
  )
);

// dans handleSubmit :
localStorage.setItem(
  WORKPLACES_STORAGE_KEY,
  serializeWorkplaces({ address1, address2, minutes, modes })
);
```

- [ ] **Step 6: Vérifier tests + lint + build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/workplaces.ts frontend/lib/workplaces.test.ts frontend/components/workplace-form.tsx
git commit -m "refactor: extract workplace persistence into tested lib module"
```

---

### Task 3: Housing marker logic in lib (TDD)

**Files:**
- Create: `frontend/lib/housing.ts`
- Create: `frontend/lib/housing.test.ts`
- Modify: `frontend/components/map/isochrone-map.tsx:14-21` (le type `HousingMarker` devient un ré-export depuis la lib)
- Modify: `frontend/components/isochrone-app.tsx:74-93` (utiliser `buildHousingMarker`)

**Interfaces:**
- Consumes: `HousingResult` depuis `@/lib/api`, `isPointInPolygon`/`PolygonFeature` depuis `@/lib/geo`.
- Produces:
  - `type HousingMarker = { lat: number; lon: number; inZone: boolean; resolvedAddress: string; timeToWork1Minutes: number; timeToWork2Minutes: number }` (déménagé ici, ré-exporté par `isochrone-map.tsx` pour ne pas casser les imports)
  - `buildHousingMarker(results: HousingResult[], intersection: PolygonFeature | null): HousingMarker`
  - `removeHousingAt(list: HousingMarker[], index: number): HousingMarker[]`

- [ ] **Step 1: Écrire les tests qui échouent**

`frontend/lib/housing.test.ts` :

```ts
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
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd frontend && npm run test`
Expected: FAIL — `./housing` introuvable.

- [ ] **Step 3: Implémenter `frontend/lib/housing.ts`**

```ts
import type { HousingResult } from "./api";
import { isPointInPolygon, type PolygonFeature } from "./geo";

export type HousingMarker = {
  lat: number;
  lon: number;
  inZone: boolean;
  resolvedAddress: string;
  timeToWork1Minutes: number;
  timeToWork2Minutes: number;
};

export function buildHousingMarker(
  results: HousingResult[],
  intersection: PolygonFeature | null
): HousingMarker {
  const first = results[0];
  return {
    lat: first.lat,
    lon: first.lon,
    resolvedAddress: first.resolved_address,
    inZone: intersection ? isPointInPolygon([first.lon, first.lat], intersection) : false,
    timeToWork1Minutes: Math.min(...results.map((r) => r.time_to_work1_minutes)),
    timeToWork2Minutes: Math.min(...results.map((r) => r.time_to_work2_minutes)),
  };
}

export function removeHousingAt(list: HousingMarker[], index: number): HousingMarker[] {
  return list.filter((_, i) => i !== index);
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `cd frontend && npm run test`
Expected: PASS.

- [ ] **Step 5: Brancher map et app sur la lib**

Dans `frontend/components/map/isochrone-map.tsx`, remplacer la définition locale du type par :

```ts
export type { HousingMarker } from "@/lib/housing";
import type { HousingMarker } from "@/lib/housing";
```

Dans `frontend/components/isochrone-app.tsx`, remplacer le corps du `try` de `handleHousingSubmit` par :

```ts
const results = await Promise.all(
  modes.map((m) => fetchHousing(address, work1, work2, m))
);
setHousingMarkers((prev) => [...prev, buildHousingMarker(results, intersection)]);
```

avec l'import `import { buildHousingMarker } from "@/lib/housing";` (et retirer l'import devenu inutile de `isPointInPolygon`).

- [ ] **Step 6: Vérifier tests + lint + build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/housing.ts frontend/lib/housing.test.ts frontend/components/map/isochrone-map.tsx frontend/components/isochrone-app.tsx
git commit -m "refactor: extract housing marker logic into tested lib module"
```

---

### Task 4: Panel shell (desktop float / mobile bottom-sheet) + full-screen map

**Files:**
- Create: `frontend/lib/map-colors.ts`
- Create: `frontend/components/panel.tsx`
- Modify: `frontend/app/page.tsx` (suppression du header)
- Modify: `frontend/components/isochrone-app.tsx` (rendu dans le Panel)

**Interfaces:**
- Consumes: `cn` depuis `@/lib/utils`.
- Produces:
  - `Panel({ children }: { children: React.ReactNode })` — shell responsive avec brand header intégré ; toggle repli mobile interne.
  - `MAP_COLORS = { zone1: "#0d7373", zone2: "#3f7d3f", intersection: "#b3452e", housingIn: "#38b28a", housingOut: "#b8bcbc" }` (utilisé par la carte en Task 7 et la légende).

- [ ] **Step 1: Créer `frontend/lib/map-colors.ts`**

```ts
// Functional map colors — independent from the chrome's One Accent Rule (DESIGN.md).
export const MAP_COLORS = {
  zone1: "#0d7373",
  zone2: "#3f7d3f",
  intersection: "#b3452e",
  housingIn: "#38b28a",
  housingOut: "#b8bcbc",
} as const;
```

- [ ] **Step 2: Créer `frontend/components/panel.tsx`**

```tsx
"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function Panel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70dvh] flex-col rounded-t-xl bg-card shadow-[0_2px_12px_oklch(22%_0.01_220/0.12)] md:inset-x-auto md:top-4 md:bottom-auto md:left-4 md:max-h-[calc(100dvh-2rem)] md:w-[380px] md:rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 md:pointer-events-none md:pb-1"
      >
        <span className="text-left">
          <span className="block text-base font-semibold text-foreground">The Good Spot</span>
          <span className="block text-xs text-muted-foreground">
            où vivre à mi-chemin, en vrais temps de trajet
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none md:hidden",
            open ? "rotate-0" : "rotate-180"
          )}
        />
        <span className="sr-only">{open ? "Replier le panneau" : "Déplier le panneau"}</span>
      </button>
      <div className={cn("overflow-y-auto", open ? "block" : "hidden", "md:block")}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Passer la page en carte plein écran**

`frontend/app/page.tsx` devient :

```tsx
import { IsochroneAppClient } from "@/components/isochrone-app-client";

export default function Home() {
  return (
    <main className="relative h-dvh">
      <IsochroneAppClient />
    </main>
  );
}
```

Le `<h1>` déménage dans le Panel (Step 2) — la page n'a plus de header.

- [ ] **Step 4: Envelopper les formulaires dans le Panel**

Dans `frontend/components/isochrone-app.tsx`, remplacer le bloc `<div className="absolute inset-x-0 top-0 …">…</div>` (Card + resolvedLabel + error) par :

```tsx
<Panel>
  <WorkplaceForm onSubmit={handleWorkplaceSubmit} isLoading={isLoadingWorkplaces} />
  <HousingForm
    onSubmit={handleHousingSubmit}
    isLoading={isLoadingHousing}
    disabled={!work1 || !work2}
  />
</Panel>
```

Garder temporairement `resolvedLabel` et `error` rendus en bas du Panel (dans un `<div className="px-4 pb-4 text-sm text-muted-foreground">`) — ils sont redistribués proprement en Tasks 5–6. Le root du composant passe de `relative flex-1` à `relative h-full`. Imports `Card`/`Badge` supprimés s'ils ne servent plus.

- [ ] **Step 5: Vérifier lint + build + visuel**

Run: `cd frontend && npm run lint && npm run build`
Expected: vert. Optionnel : `docker compose up` et vérifier panneau gauche (desktop) / sheet repliable (viewport 375 px).

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/map-colors.ts frontend/components/panel.tsx frontend/app/page.tsx frontend/components/isochrone-app.tsx
git commit -m "feat: floating side panel with mobile bottom-sheet, full-screen map"
```

---

### Task 5: Workplace form redesign (chips, vertical, resolved addresses, inline error)

**Files:**
- Modify: `frontend/components/workplace-form.tsx` (réécriture du rendu)
- Modify: `frontend/components/isochrone-app.tsx` (nouvelles props, split des états)

**Interfaces:**
- Consumes: `Panel` (Task 4), lib workplaces (Task 2).
- Produces — nouvelles props de `WorkplaceForm` :

```ts
type WorkplaceFormProps = {
  onSubmit: (address1: string, address2: string, minutes: number, modes: TravelMode[]) => void;
  isLoading: boolean;
  resolved1: string | null; // adresse résolue du lieu 1, null avant calcul
  resolved2: string | null;
  error: string | null; // erreur de l'étape 1, affichée inline role="alert"
};
```

- [ ] **Step 1: Réécrire le rendu de `workplace-form.tsx`**

Conserver toute la logique d'état/persistance (Task 2). Nouveau rendu :

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TravelMode } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  WORKPLACES_STORAGE_KEY,
  parseSavedWorkplaces,
  serializeWorkplaces,
} from "@/lib/workplaces";
import { Bike, Bus, Car, Check, Footprints } from "lucide-react";
import { useState } from "react";

const TRAVEL_MODES: { value: TravelMode; label: string; Icon: typeof Bus }[] = [
  { value: "transit", label: "Transports", Icon: Bus },
  { value: "walk", label: "Marche", Icon: Footprints },
  { value: "bicycle", label: "Vélo", Icon: Bike },
  { value: "drive", label: "Voiture", Icon: Car },
];

type WorkplaceFormProps = {
  onSubmit: (address1: string, address2: string, minutes: number, modes: TravelMode[]) => void;
  isLoading: boolean;
  resolved1: string | null;
  resolved2: string | null;
  error: string | null;
};

export function WorkplaceForm({ onSubmit, isLoading, resolved1, resolved2, error }: WorkplaceFormProps) {
  const [saved] = useState(() =>
    parseSavedWorkplaces(
      typeof window === "undefined" ? null : localStorage.getItem(WORKPLACES_STORAGE_KEY)
    )
  );
  const [address1, setAddress1] = useState(saved.address1);
  const [address2, setAddress2] = useState(saved.address2);
  const [minutes, setMinutes] = useState(saved.minutes);
  const [modes, setModes] = useState<TravelMode[]>(saved.modes);

  function toggleMode(value: TravelMode) {
    setModes((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (modes.length === 0) return;
    localStorage.setItem(
      WORKPLACES_STORAGE_KEY,
      serializeWorkplaces({ address1, address2, minutes, modes })
    );
    onSubmit(address1, address2, Number(minutes), modes);
  }

  const resolvedFor = (resolved: string | null) =>
    resolved && (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Check aria-hidden className="size-3 shrink-0 text-primary" />
        {resolved}
      </p>
    );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-4 pb-4">
      <h2 className="text-sm font-semibold text-foreground">1 · Vos lieux de travail</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address1">Lieu de travail 1</Label>
        <Input
          id="address1"
          value={address1}
          onChange={(e) => setAddress1(e.target.value)}
          placeholder="Adresse du 1er lieu de travail"
          required
        />
        {resolvedFor(resolved1)}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address2">Lieu de travail 2</Label>
        <Input
          id="address2"
          value={address2}
          onChange={(e) => setAddress2(e.target.value)}
          placeholder="Adresse du 2e lieu de travail"
          required
        />
        {resolvedFor(resolved2)}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Moyens de transport</Label>
        <div className="flex flex-wrap gap-2">
          {TRAVEL_MODES.map(({ value, label, Icon }) => {
            const selected = modes.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleMode(value)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="minutes">Temps de trajet max</Label>
        <div className="flex items-center gap-2">
          <Input
            id="minutes"
            type="number"
            min={1}
            max={60}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-24"
            required
          />
          <span className="text-sm text-muted-foreground">min</span>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading || modes.length === 0}>
        {isLoading && (
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
        )}
        {isLoading ? "Calcul…" : "Calculer la zone"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Adapter `isochrone-app.tsx`**

Splitter les états : remplacer `resolvedLabel`/`error` par :

```ts
const [resolved1, setResolved1] = useState<string | null>(null);
const [resolved2, setResolved2] = useState<string | null>(null);
const [workplaceError, setWorkplaceError] = useState<string | null>(null);
const [housingError, setHousingError] = useState<string | null>(null);
```

Dans `handleWorkplaceSubmit` : `setWorkplaceError(null)` au début, `setResolved1(results1[0].resolved_address)` / `setResolved2(results2[0].resolved_address)` au succès, `setWorkplaceError(...)` dans le catch et pour le cas « aucune zone commune ». Dans `handleHousingSubmit` : idem avec `setHousingError`. Rendu :

```tsx
<WorkplaceForm
  onSubmit={handleWorkplaceSubmit}
  isLoading={isLoadingWorkplaces}
  resolved1={resolved1}
  resolved2={resolved2}
  error={workplaceError}
/>
```

Supprimer le rendu temporaire `resolvedLabel` de la Task 4 et les imports morts.

- [ ] **Step 3: Vérifier tests + lint + build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/workplace-form.tsx frontend/components/isochrone-app.tsx
git commit -m "feat: step-based workplace form with transport chips and inline feedback"
```

---

### Task 6: Housing step, tested-housing list, focus wiring

**Files:**
- Create: `frontend/components/housing-list.tsx`
- Modify: `frontend/components/housing-form.tsx`
- Modify: `frontend/components/isochrone-app.tsx`

**Interfaces:**
- Consumes: `HousingMarker`/`removeHousingAt` (Task 3).
- Produces:
  - `HousingList({ items, onRemove, onFocus }: { items: HousingMarker[]; onRemove: (index: number) => void; onFocus: (index: number) => void })`
  - Props `HousingForm` étendues : `{ onSubmit; isLoading; disabled; error: string | null }`
  - État `focus: { index: number; token: number } | null` dans `isochrone-app`, passé à la carte en Task 7 (prop `focus` de `IsochroneMap`).

- [ ] **Step 1: Créer `frontend/components/housing-list.tsx`**

```tsx
"use client";

import type { HousingMarker } from "@/lib/housing";
import { cn } from "@/lib/utils";
import { CircleAlert, CircleCheck, X } from "lucide-react";

type HousingListProps = {
  items: HousingMarker[];
  onRemove: (index: number) => void;
  onFocus: (index: number) => void;
};

export function HousingList({ items, onRemove, onFocus }: HousingListProps) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2 px-4 pb-4">
      {items.map((h, i) => (
        <li key={`${h.lat},${h.lon},${i}`} className="rounded-lg border border-border p-2.5 text-sm">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onFocus(i)}
              className="cursor-pointer text-left font-medium transition-colors duration-150 hover:text-primary motion-reduce:transition-none"
            >
              {h.resolvedAddress}
            </button>
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Supprimer ${h.resolvedAddress}`}
              className="cursor-pointer p-1 text-muted-foreground transition-colors duration-150 hover:text-destructive motion-reduce:transition-none"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-xs font-medium",
              h.inZone ? "text-primary" : "text-muted-foreground"
            )}
          >
            {h.inZone ? (
              <CircleCheck aria-hidden className="size-3.5" />
            ) : (
              <CircleAlert aria-hidden className="size-3.5" />
            )}
            {h.inZone ? "Dans la zone" : "Hors zone"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lieu 1 : {h.timeToWork1Minutes} min · Lieu 2 : {h.timeToWork2Minutes} min
          </p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Mettre à jour `housing-form.tsx`**

Ajouter le titre d'étape, le hint quand désactivé, l'erreur inline, bouton pleine largeur :

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type HousingFormProps = {
  onSubmit: (address: string) => void;
  isLoading: boolean;
  disabled: boolean;
  error: string | null;
};

export function HousingForm({ onSubmit, isLoading, disabled, error }: HousingFormProps) {
  const [address, setAddress] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(address);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border px-4 py-4">
      <h2 className="text-sm font-semibold text-foreground">2 · Tester un logement</h2>
      {disabled && (
        <p className="text-xs text-muted-foreground">
          Calculez d&apos;abord la zone commune avec vos deux lieux de travail.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="housing">Adresse d&apos;un logement à tester</Label>
        <Input
          id="housing"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Adresse du logement"
          disabled={disabled}
          required
        />
      </div>
      <Button type="submit" variant="secondary" className="w-full" disabled={disabled || isLoading}>
        {isLoading ? "Test…" : "Tester ce logement"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Câbler liste, suppression et focus dans `isochrone-app.tsx`**

```ts
const [focus, setFocus] = useState<{ index: number; token: number } | null>(null);

function handleRemoveHousing(index: number) {
  setHousingMarkers((prev) => removeHousingAt(prev, index));
  setFocus(null);
}

function handleFocusHousing(index: number) {
  setFocus({ index, token: Date.now() });
}
```

Rendu dans le Panel, après `HousingForm` :

```tsx
<HousingList
  items={housingMarkers}
  onRemove={handleRemoveHousing}
  onFocus={handleFocusHousing}
/>
```

Passer `error={housingError}` à `HousingForm`. `focus` est passé à `IsochroneMap` en Task 7 — d'ici là l'état existe mais n'est pas consommé (suffixer d'un commentaire `// consumed by the map in the next commit` si le lint se plaint d'une variable morte, ou passer la prop dès maintenant si Task 7 est faite dans la foulée).

- [ ] **Step 4: Vérifier tests + lint + build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/housing-list.tsx frontend/components/housing-form.tsx frontend/components/isochrone-app.tsx
git commit -m "feat: tested-housing list with remove and focus-on-map actions"
```

---

### Task 7: Map polish — legend, styled popups, no emoji, flyTo focus, HTML escaping

**Files:**
- Create: `frontend/components/map/map-legend.tsx`
- Modify: `frontend/components/map/isochrone-map.tsx`
- Modify: `frontend/app/globals.css` (styles popup Leaflet)
- Modify: `frontend/components/isochrone-app.tsx` (rendu légende + prop focus)

**Interfaces:**
- Consumes: `MAP_COLORS` (Task 4), état `focus` (Task 6).
- Produces:
  - `MapLegend()` — légende présentationnelle, positionnée par le parent.
  - `IsochroneMap` accepte la prop `focus: { index: number; token: number } | null`.

- [ ] **Step 1: Créer `frontend/components/map/map-legend.tsx`**

```tsx
import { MAP_COLORS } from "@/lib/map-colors";

const ENTRIES = [
  { color: MAP_COLORS.zone1, label: "Zone lieu 1" },
  { color: MAP_COLORS.zone2, label: "Zone lieu 2" },
  { color: MAP_COLORS.intersection, label: "Zone commune" },
  { color: MAP_COLORS.housingIn, label: "Logement dans la zone" },
  { color: MAP_COLORS.housingOut, label: "Logement hors zone" },
];

export function MapLegend() {
  return (
    <div className="rounded-lg bg-card/95 px-3 py-2 text-xs text-foreground shadow-[0_2px_12px_oklch(22%_0.01_220/0.12)]">
      <ul className="flex flex-col gap-1">
        {ENTRIES.map(({ color, label }) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Mettre à jour `isochrone-map.tsx`**

1. Importer `MAP_COLORS` et remplacer les couleurs en dur des styles `L.geoJSON`/`L.circleMarker` par les constantes.
2. Ajouter la prop `focus` et un ref des marqueurs logement :

```ts
type IsochroneMapProps = {
  work1: WorkResult | null;
  work2: WorkResult | null;
  intersection: PolygonFeature | null;
  housingMarkers: HousingMarker[];
  focus: { index: number; token: number } | null;
};
```

```ts
const housingLayersRef = useRef<L.CircleMarker[]>([]);
```

Dans l'effet principal, vider `housingLayersRef.current = []` au début (à côté du reset de `layersRef`) et pousser chaque circleMarker : `housingLayersRef.current.push(marker)`.

3. Popup sans emoji, contenu échappé :

```ts
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}
```

```ts
.bindPopup(
  `<strong>${escapeHtml(h.resolvedAddress)}</strong><br>` +
    `<span style="color:${h.inZone ? MAP_COLORS.zone1 : "#8a5230"};font-weight:600">` +
    `${h.inZone ? "Dans la zone" : "Hors zone"}</span><br>` +
    `Trajet lieu 1 : ${h.timeToWork1Minutes} min<br>` +
    `Trajet lieu 2 : ${h.timeToWork2Minutes} min`
)
```

(idem pour les popups « Lieu de travail 1 / 2 », inchangés sur le fond.)

4. Effet de focus :

```ts
useEffect(() => {
  const map = mapRef.current;
  if (!map || !focus) return;
  const layer = housingLayersRef.current[focus.index];
  if (!layer) return;
  map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 13));
  layer.openPopup();
}, [focus]);
```

- [ ] **Step 3: Styles popup dans `globals.css`**

Ajouter en fin de fichier :

```css
.leaflet-container {
  font-family: var(--font-sans), system-ui, sans-serif;
}

.leaflet-popup-content-wrapper {
  border-radius: 8px;
  box-shadow: 0 2px 12px oklch(22% 0.01 220 / 0.12);
}
```

- [ ] **Step 4: Rendre la légende et passer `focus` dans `isochrone-app.tsx`**

```tsx
<IsochroneMap
  work1={work1}
  work2={work2}
  intersection={intersection}
  housingMarkers={housingMarkers}
  focus={focus}
/>

{work1 && work2 && (
  <div className="absolute top-3 right-3 z-10 md:top-auto md:bottom-8">
    <MapLegend />
  </div>
)}
```

- [ ] **Step 5: Vérifier tests + lint + build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/map/map-legend.tsx frontend/components/map/isochrone-map.tsx frontend/app/globals.css frontend/components/isochrone-app.tsx
git commit -m "feat: map legend, styled emoji-free popups, focus fly-to, escaped popup HTML"
```

---

### Task 8: Integrated welcome state

**Files:**
- Create: `frontend/components/welcome.tsx`
- Modify: `frontend/components/isochrone-app.tsx`

**Interfaces:**
- Consumes: `parseSavedWorkplaces`/`WORKPLACES_STORAGE_KEY` (Task 2).
- Produces: `Welcome()` — contenu statique, aucune prop.

- [ ] **Step 1: Créer `frontend/components/welcome.tsx`**

```tsx
export function Welcome() {
  return (
    <div className="border-b border-border px-4 pb-4">
      <h2 className="text-lg font-semibold text-foreground">
        Trouvez où vivre à mi-chemin
      </h2>
      <ol className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
        <li>1. Renseignez vos deux adresses de travail</li>
        <li>2. Découvrez la zone atteignable depuis les deux</li>
        <li>3. Testez des adresses de logement candidates</li>
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Condition d'affichage dans `isochrone-app.tsx`**

```ts
const [showWelcome, setShowWelcome] = useState(() => {
  if (typeof window === "undefined") return false;
  const saved = parseSavedWorkplaces(localStorage.getItem(WORKPLACES_STORAGE_KEY));
  return !saved.address1 && !saved.address2;
});
```

Au succès de `handleWorkplaceSubmit` (après `setIntersection(computed)`) : `setShowWelcome(false);`.
Rendu en tête de Panel : `{showWelcome && <Welcome />}`.

- [ ] **Step 3: Vérifier tests + lint + build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/welcome.tsx frontend/components/isochrone-app.tsx
git commit -m "feat: first-visit welcome state in the panel"
```

---

### Task 9: Final pass — a11y/motion audit, full test suites, changelog 0.4.0

**Files:**
- Modify: `frontend/app/layout.tsx` (si nécessaire : classes body)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: branche prête pour /simplify, /security-review et PR.

- [ ] **Step 1: Audit rapide**

Vérifier dans les fichiers touchés : chaque `transition-*` a `motion-reduce:transition-none` (ou `motion-reduce:animate-none` pour le spinner) ; chaque élément cliquable non-Button a `cursor-pointer` ; les icônes seules ont `aria-hidden` + texte ou `aria-label` ; plus aucune référence à `min-h-screen` dans `page.tsx`.

- [ ] **Step 2: Suites complètes**

Run:
```bash
cd frontend && npm run test && npm run lint && npm run build
cd ../backend && python3 -m venv .venv 2>/dev/null; .venv/bin/pip install -q -r requirements.txt -r requirements-dev.txt && .venv/bin/python -m pytest tests/ -q
```
Expected: tout vert (le backend n'est pas touché par ce PR mais doit rester vert).

- [ ] **Step 3: Changelog**

Dans `CHANGELOG.md`, sous `## [Unreleased]`, insérer :

```markdown
## [0.4.0] - 2026-07-10

### Added
- Panneau latéral flottant (bottom-sheet repliable sur mobile) regroupant les
  deux étapes : lieux de travail puis test de logement.
- Liste des logements testés dans le panneau : statut dans/hors zone, temps
  vers chaque lieu, suppression, recentrage de la carte au clic.
- Légende des zones sur la carte.
- État d'accueil à la première visite expliquant le fonctionnement en 3 étapes.

### Changed
- Modes de transport en boutons-toggles avec icônes (au lieu de checkboxes).
- Adresses résolues affichées sous chaque champ ; erreurs affichées inline
  dans le panneau.
- Popups de la carte stylés, sans emoji.

### Fixed
- La police Figtree est maintenant réellement appliquée (variable CSS
  `--font-sans` jamais branchée).
- Le contenu des popups Leaflet est échappé (adresse résolue externe).
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md frontend
git commit -m "docs: changelog for 0.4.0 UX overhaul"
```

---

## Après le plan (workflow new-feature, hors tasks)

1. `/simplify` sur le diff, appliquer sauf conflit avec le design approuvé.
2. `/security-review` sur le diff (attention : contenu externe dans les popups, pas de fuite de clé côté client).
3. PR `feature/app-ux-overhaul` → `main` via superpowers:finishing-a-development-branch ; attendre CI verte.
4. Après merge : tag `v0.4.0` + release GitHub (le repo tague — voir tags existants).
