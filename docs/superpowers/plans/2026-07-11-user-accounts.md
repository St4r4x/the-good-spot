# User Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional user accounts (Supabase Auth: email/password + Google) so logged-in users get their workplace search synced across devices and a persistent housing-search history, and add per-identity rate limiting on the Geoapify-backed endpoints to protect the shared free-tier quota.

**Architecture:** The frontend talks directly to Supabase (client-side `@supabase/supabase-js`, no SSR) for auth and for reading/writing two new Postgres tables (`workplaces`, `housing_searches`), both RLS-protected so a user can only touch their own rows — already applied to the live Supabase project. FastAPI keeps its existing role (Geoapify calls) and gains only a JWT-verification helper used purely for rate-limit keying (`slowapi`), not for authorization of the data tables.

**Tech Stack:** `@supabase/supabase-js` (frontend), `PyJWT` + `slowapi` (backend), Supabase project `wgfcywjykimvxkwpgdob` (Postgres + Auth, already provisioned).

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-07-11-user-accounts-design.md`.
- Projet Supabase déjà créé et son schéma déjà appliqué — ne pas recréer les
  tables, elles existent :
  - `public.workplaces(user_id uuid PK, address1 text, address2 text,
    minutes int, modes text[], updated_at timestamptz)`, RLS
    select/insert/update sur `auth.uid() = user_id`.
  - `public.housing_searches(id uuid PK, user_id uuid, resolved_address
    text, lat float8, lon float8, in_zone bool, time_to_work1_minutes int,
    time_to_work2_minutes int, created_at timestamptz)`, RLS
    select/insert/delete sur `auth.uid() = user_id`.
  - URL projet : `https://wgfcywjykimvxkwpgdob.supabase.co`.
  - Clé publiable (safe côté client) : `sb_publishable_Kqhf3XYt3o0uQNFe52mojQ_4Ev4NOxu`.
- Compte **optionnel** partout : toute nouvelle logique doit être un no-op
  gracieux quand il n'y a pas de session (comportement anonyme = identique
  à avant ce plan).
- `SUPABASE_JWT_SECRET` (backend) doit être lu avec `os.environ.get(...)`
  (jamais `os.environ[...]`) — contrairement à `GEOAPIFY_API_KEY`, son
  absence ne doit jamais faire planter l'app ; ça doit juste désactiver la
  vérification JWT (tout le monde traité comme anonyme).
- Limites de débit : anonyme 30 requêtes/jour (par IP), connecté 200
  requêtes/jour (par `user_id`), cumulées sur `/isochrone` + `/housing` +
  `/pois`.
- Style frontend : tokens `DESIGN.md` existants (`var(--primary)`,
  `shadow-floating`, etc.), `cursor-pointer`, `motion-reduce:`, cibles
  tactiles ≥44 px, `role="alert"` pour les erreurs — mêmes conventions que
  le reste de l'app (voir `frontend/components/workplace-form.tsx`).
- Commandes de vérification (depuis `frontend/`) : `npm run test`,
  `npm run lint`, `npm run build`. Depuis la racine du repo (`.venv`
  activé) : `python -m pytest backend/tests/ -q`.
- Import order Python : stdlib → tiers → local, alphabétique dans chaque
  groupe (voir `backend/main.py` existant).

---

### Task 1: Backend — vérification JWT + rate limiting

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/main.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: rien de nouveau (même pattern que le reste de `main.py`).
- Produces:
  - `def get_current_user_id(request: Request) -> str | None`
  - `def rate_limit_key(request: Request) -> str`
  - `def rate_limit_value(request: Request) -> str`
  - `limiter: Limiter` (état `app.state.limiter`)
  - Les endpoints `/isochrone`, `/housing`, `/pois` gagnent chacun un
    paramètre `request: Request` et le décorateur `@limiter.limit(rate_limit_value)`.

- [ ] **Step 1: Ajouter les dépendances**

Dans `backend/requirements.txt`, ajouter à la fin :

```
pyjwt
slowapi
```

Run: `pip install -r backend/requirements.txt` (depuis la racine, `.venv`
activé) — ou `.venv/bin/pip install pyjwt slowapi`.

- [ ] **Step 2: Écrire les tests qui échouent**

Dans `backend/tests/conftest.py`, remplacer tout le fichier par :

```python
import os

os.environ.setdefault("GEOAPIFY_API_KEY", "test-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")

import pytest
from fastapi.testclient import TestClient

from main import app, limiter


@pytest.fixture
def client() -> TestClient:
    limiter.reset()
    return TestClient(app)


@pytest.fixture
def auth_headers():
    import time

    import jwt

    def _make(user_id: str = "11111111-1111-1111-1111-111111111111") -> dict[str, str]:
        token = jwt.encode(
            {
                "sub": user_id,
                "aud": "authenticated",
                "role": "authenticated",
                "exp": int(time.time()) + 3600,
            },
            os.environ["SUPABASE_JWT_SECRET"],
            algorithm="HS256",
        )
        return {"Authorization": f"Bearer {token}"}

    return _make
```

Ajouter à la fin de `backend/tests/test_main.py` :

```python
def test_get_current_user_id_returns_none_without_header(client) -> None:
    from fastapi import Request
    from main import get_current_user_id

    scope = {"type": "http", "headers": []}
    request = Request(scope)
    assert get_current_user_id(request) is None


def test_get_current_user_id_returns_sub_for_valid_token(client, auth_headers) -> None:
    from fastapi import Request
    from main import get_current_user_id

    headers = auth_headers("22222222-2222-2222-2222-222222222222")
    scope = {
        "type": "http",
        "headers": [(b"authorization", headers["Authorization"].encode())],
    }
    request = Request(scope)
    assert get_current_user_id(request) == "22222222-2222-2222-2222-222222222222"


def test_get_current_user_id_returns_none_for_invalid_token() -> None:
    from fastapi import Request
    from main import get_current_user_id

    scope = {
        "type": "http",
        "headers": [(b"authorization", b"Bearer not-a-real-token")],
    }
    request = Request(scope)
    assert get_current_user_id(request) is None


@respx.mock
def test_isochrone_anonymous_rate_limit(client) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )

    for _ in range(30):
        resp = client.get(
            "/isochrone", params={"address": "Paris", "minutes": 15, "mode": "walk"}
        )
        assert resp.status_code == 200

    resp = client.get(
        "/isochrone", params={"address": "Paris", "minutes": 15, "mode": "walk"}
    )
    assert resp.status_code == 429


@respx.mock
def test_isochrone_authenticated_has_higher_limit(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )
    headers = auth_headers()

    for _ in range(30):
        resp = client.get(
            "/isochrone",
            params={"address": "Paris", "minutes": 15, "mode": "walk"},
            headers=headers,
        )
        assert resp.status_code == 200
```

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `python -m pytest backend/tests/test_main.py -k "user_id or rate_limit" -v`
Expected: FAIL — `get_current_user_id`/`limiter` introuvables dans `main`.

- [ ] **Step 4: Implémenter dans `backend/main.py`**

Ajouter aux imports (respecter l'ordre stdlib → tiers → local) :

```python
import asyncio
import os

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
```

Après `PLACES_URL = ...` et avant `POI_GROUPS`, ajouter :

```python
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
ANONYMOUS_RATE_LIMIT = "30/day"
AUTHENTICATED_RATE_LIMIT = "200/day"
```

Après la fonction `group_for_categories`, ajouter :

```python
def get_current_user_id(request: Request) -> str | None:
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer ") or not SUPABASE_JWT_SECRET:
        return None
    token = auth_header.removeprefix("Bearer ")
    try:
        payload = jwt.decode(
            token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated"
        )
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


def rate_limit_key(request: Request) -> str:
    user_id = get_current_user_id(request)
    if user_id:
        return user_id
    return request.client.host if request.client else "unknown"


def rate_limit_value(request: Request) -> str:
    return AUTHENTICATED_RATE_LIMIT if get_current_user_id(request) else ANONYMOUS_RATE_LIMIT
```

Remplacer `app = FastAPI()` par :

```python
limiter = Limiter(key_func=rate_limit_key)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

Modifier les trois endpoints pour ajouter `request: Request` et le
décorateur (ordre des décorateurs : `@app.get` en premier, `@limiter.limit`
juste après, comme l'exige `slowapi`) :

```python
@app.get("/isochrone")
@limiter.limit(rate_limit_value)
async def isochrone(request: Request, address: str, minutes: int, mode: str = "transit") -> dict:
```

```python
@app.get("/housing")
@limiter.limit(rate_limit_value)
async def housing(
    request: Request,
    address: str,
    work1_lat: float,
    work1_lon: float,
    work2_lat: float,
    work2_lon: float,
    mode: str = "transit",
) -> dict:
```

```python
@app.get("/pois")
@limiter.limit(rate_limit_value)
async def pois(request: Request, bbox: str, groups: str) -> dict:
```

(Le corps de chaque fonction ne change pas — seule la signature gagne
`request: Request` en premier paramètre.)

- [ ] **Step 5: Vérifier que les tests passent**

Run: `python -m pytest backend/tests/ -q`
Expected: tous les tests passent (existants + nouveaux). Note : le test
`test_isochrone_anonymous_rate_limit` fait 31 requêtes réelles à travers
`TestClient` (mocké via respx, pas de vrai réseau) — reste rapide (<1s).

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/main.py backend/tests/conftest.py backend/tests/test_main.py
git commit -m "feat: add Supabase JWT verification and per-identity rate limiting"
```

---

### Task 2: Frontend — client Supabase + logique pure de synchro (TDD)

**Files:**
- Modify: `frontend/package.json` (dépendance)
- Create: `frontend/lib/supabase/client.ts`
- Create: `frontend/lib/sync.ts`
- Create: `frontend/lib/sync.test.ts`
- Modify: `frontend/lib/housing.ts` (étendre `HousingMarker`)

**Interfaces:**
- Consumes: `SavedWorkplaces` (`@/lib/workplaces`), `HousingMarker`
  (`@/lib/housing`), `TravelMode` (`@/lib/api`).
- Produces:
  - `supabase: SupabaseClient` (export de `lib/supabase/client.ts`)
  - `type WorkplacesRow`, `type HousingSearchRow`
  - `function workplacesRowToSaved(row: WorkplacesRow): SavedWorkplaces`
  - `function savedToWorkplacesUpsert(saved: SavedWorkplaces, userId: string): Record<string, unknown>`
  - `function housingSearchRowToMarker(row: HousingSearchRow): HousingMarker`
  - `function markerToHousingSearchInsert(marker: HousingMarker, userId: string): Record<string, unknown>`
  - `HousingMarker` gagne un champ optionnel `id?: string` (id de la ligne
    Supabase quand persistée, absent sinon).

- [ ] **Step 1: Installer la dépendance**

Run (depuis `frontend/`) :
```bash
npm install @supabase/supabase-js@^2.110.2
```

- [ ] **Step 2: Étendre `HousingMarker` dans `frontend/lib/housing.ts`**

Remplacer :

```ts
export type HousingMarker = {
  lat: number;
  lon: number;
  inZone: boolean;
  resolvedAddress: string;
  timeToWork1Minutes: number;
  timeToWork2Minutes: number;
};
```

par :

```ts
export type HousingMarker = {
  id?: string;
  lat: number;
  lon: number;
  inZone: boolean;
  resolvedAddress: string;
  timeToWork1Minutes: number;
  timeToWork2Minutes: number;
};
```

(`buildHousingMarker` n'a pas besoin de changer — `id` reste `undefined`
tant qu'une ligne n'a pas été insérée côté Supabase, câblé en Task 5.)

- [ ] **Step 3: Écrire les tests qui échouent**

`frontend/lib/sync.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  housingSearchRowToMarker,
  markerToHousingSearchInsert,
  savedToWorkplacesUpsert,
  workplacesRowToSaved,
  type HousingSearchRow,
  type WorkplacesRow,
} from "./sync";
import type { HousingMarker } from "./housing";
import type { SavedWorkplaces } from "./workplaces";

describe("workplacesRowToSaved", () => {
  it("maps a Postgres row to the app's SavedWorkplaces shape", () => {
    const row: WorkplacesRow = {
      user_id: "u1",
      address1: "1 rue A",
      address2: "2 rue B",
      minutes: 45,
      modes: ["transit", "walk"],
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
```

- [ ] **Step 4: Vérifier l'échec**

Run: `cd frontend && npm run test`
Expected: FAIL — `./sync` introuvable.

- [ ] **Step 5: Créer `frontend/lib/supabase/client.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

- [ ] **Step 6: Créer `frontend/lib/sync.ts`**

```ts
import type { HousingMarker } from "./housing";
import type { SavedWorkplaces } from "./workplaces";

export type WorkplacesRow = {
  user_id: string;
  address1: string;
  address2: string;
  minutes: number;
  modes: string[];
  updated_at: string;
};

export type HousingSearchRow = {
  id: string;
  user_id: string;
  resolved_address: string;
  lat: number;
  lon: number;
  in_zone: boolean;
  time_to_work1_minutes: number;
  time_to_work2_minutes: number;
  created_at: string;
};

export function workplacesRowToSaved(row: WorkplacesRow): SavedWorkplaces {
  return {
    address1: row.address1,
    address2: row.address2,
    minutes: String(row.minutes),
    modes: row.modes as SavedWorkplaces["modes"],
  };
}

export function savedToWorkplacesUpsert(saved: SavedWorkplaces, userId: string) {
  return {
    user_id: userId,
    address1: saved.address1,
    address2: saved.address2,
    minutes: Number(saved.minutes),
    modes: saved.modes,
  };
}

export function housingSearchRowToMarker(row: HousingSearchRow): HousingMarker {
  return {
    id: row.id,
    lat: row.lat,
    lon: row.lon,
    inZone: row.in_zone,
    resolvedAddress: row.resolved_address,
    timeToWork1Minutes: row.time_to_work1_minutes,
    timeToWork2Minutes: row.time_to_work2_minutes,
  };
}

export function markerToHousingSearchInsert(marker: HousingMarker, userId: string) {
  return {
    user_id: userId,
    resolved_address: marker.resolvedAddress,
    lat: marker.lat,
    lon: marker.lon,
    in_zone: marker.inZone,
    time_to_work1_minutes: marker.timeToWork1Minutes,
    time_to_work2_minutes: marker.timeToWork2Minutes,
  };
}
```

- [ ] **Step 7: Vérifier que les tests passent**

Run: `cd frontend && npm run test`
Expected: PASS (toutes les suites, y compris `sync.test.ts`).

- [ ] **Step 8: Ajouter les variables d'environnement de dev**

Ajouter à `frontend/.env.local` (fichier non versionné — le créer s'il
n'existe pas ; sinon ajouter ces deux lignes) :

```
NEXT_PUBLIC_SUPABASE_URL=https://wgfcywjykimvxkwpgdob.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Kqhf3XYt3o0uQNFe52mojQ_4Ev4NOxu
```

- [ ] **Step 9: Vérifier lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: vert.

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/lib/supabase/client.ts frontend/lib/sync.ts frontend/lib/sync.test.ts frontend/lib/housing.ts
git commit -m "feat: add Supabase client and workplaces/housing sync mapping logic"
```

(`.env.local` reste non commité — déjà couvert par `.gitignore` standard
Next.js, à vérifier au Step 9 de la Task 6.)

---

### Task 3: Frontend — `AccountMenu` + en-tête `Authorization`

**Files:**
- Modify: `frontend/lib/api.ts`
- Create: `frontend/components/account-menu.tsx`
- Modify: `frontend/components/panel.tsx`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase/client`, Task 2).
- Produces:
  - `fetchIsochrone`/`fetchHousing`/`fetchPois` attachent désormais
    `Authorization: Bearer <access_token>` quand une session existe.
  - `AccountMenu({ email }: { email: string | null })` — composant
    consommé par `Panel` dans cette même tâche, et par `isochrone-app.tsx`
    (qui devra passer la prop `email`) en Task 4.
  - `Panel` accepte une nouvelle prop `accountEmail: string | null` et
    rend `<AccountMenu email={accountEmail} />` dans son en-tête.

- [ ] **Step 1: Ajouter l'en-tête `Authorization` dans `frontend/lib/api.ts`**

Ajouter en tête de fichier (après le type `Poi`, avant `ApiError`) :

```ts
import { supabase } from "./supabase/client";
```

Avant `export class ApiError`, ajouter :

```ts
async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}
```

Modifier les trois fonctions pour passer les en-têtes :

```ts
export async function fetchIsochrone(
  address: string,
  minutes: number,
  mode: TravelMode
): Promise<IsochroneResult> {
  const params = new URLSearchParams({ address, minutes: String(minutes), mode });
  const resp = await fetch(`/api/isochrone?${params}`, { headers: await authHeaders() });
  if (!resp.ok) return parseErrorOrThrow(resp);
  return resp.json();
}
```

```ts
export async function fetchHousing(
  address: string,
  work1: { lat: number; lon: number },
  work2: { lat: number; lon: number },
  mode: TravelMode
): Promise<HousingResult> {
  const params = new URLSearchParams({
    address,
    work1_lat: String(work1.lat),
    work1_lon: String(work1.lon),
    work2_lat: String(work2.lat),
    work2_lon: String(work2.lon),
    mode,
  });
  const resp = await fetch(`/api/housing?${params}`, { headers: await authHeaders() });
  if (!resp.ok) return parseErrorOrThrow(resp);
  return resp.json();
}
```

```ts
export async function fetchPois(
  bbox: [number, number, number, number],
  groups: PoiGroup[]
): Promise<Poi[]> {
  const params = new URLSearchParams({
    bbox: bbox.join(","),
    groups: groups.join(","),
  });
  const resp = await fetch(`/api/pois?${params}`, { headers: await authHeaders() });
  if (!resp.ok) return parseErrorOrThrow(resp);
  const data = await resp.json();
  return data.pois;
}
```

Pas de nouveau test — ces fonctions ne sont pas unit-testées (même choix
que l'existant, un simple wrapper fetch).

- [ ] **Step 2: Créer `frontend/components/account-menu.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { Popover } from "@base-ui/react/popover";
import { LogOut, User as UserIcon } from "lucide-react";
import { useState } from "react";

type AccountMenuProps = {
  email: string | null;
};

export function AccountMenu({ email }: AccountMenuProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [formEmail, setFormEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: formEmail, password })
        : await supabase.auth.signUp({ email: formEmail, password });
    setIsLoading(false);
    if (error) setError(error.message);
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({ provider: "google" });
  }

  if (email) {
    return (
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
        aria-label={`Se déconnecter (${email})`}
      >
        <LogOut aria-hidden className="size-4" />
        <span className="hidden md:inline">{email}</span>
      </button>
    );
  }

  return (
    <Popover.Root>
      <Popover.Trigger className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none">
        <UserIcon aria-hidden className="size-4" />
        Se connecter
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end">
          <Popover.Popup className="w-64 rounded-lg border border-border bg-card p-4 shadow-floating">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-email">Email</Label>
                <Input
                  id="account-email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account-password">Mot de passe</Label>
                <Input
                  id="account-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "…" : mode === "signin" ? "Se connecter" : "S'inscrire"}
              </Button>
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {mode === "signin" ? "Créer un compte" : "J'ai déjà un compte"}
              </button>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </form>
            <div className="mt-3 border-t border-border pt-3">
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
                Continuer avec Google
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 3: Câbler `AccountMenu` dans `frontend/components/panel.tsx`**

Remplacer le contenu de `panel.tsx` par :

```tsx
"use client";

import { AccountMenu } from "@/components/account-menu";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

type PanelProps = {
  accountEmail: string | null;
  children: React.ReactNode;
};

export function Panel({ accountEmail, children }: PanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70dvh] flex-col rounded-t-xl bg-card shadow-floating md:inset-x-auto md:top-4 md:bottom-auto md:left-4 md:max-h-[calc(100dvh-2rem)] md:w-[380px] md:rounded-xl">
      <div className="flex items-center justify-between gap-2 px-4 py-3 md:pb-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 cursor-pointer items-center justify-between gap-2 md:pointer-events-none"
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
        <div className="md:pointer-events-auto">
          <AccountMenu email={accountEmail} />
        </div>
      </div>
      <div className={cn("overflow-y-auto", open ? "block" : "hidden", "md:block")}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: erreur attendue — `<Panel>` est appelé dans `isochrone-app.tsx`
sans la prop `accountEmail`, désormais requise. C'est normal, câblé en
Task 4 ; si cette tâche est exécutée seule, ajouter temporairement
`accountEmail={null}` à l'appel existant de `<Panel>` dans
`isochrone-app.tsx` pour que le build passe isolément, et laisser la
Task 4 le remplacer par la vraie valeur.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts frontend/components/account-menu.tsx frontend/components/panel.tsx
git commit -m "feat: add AccountMenu (email/password + Google) and Authorization header wiring"
```

---

### Task 4: Frontend — état d'auth et hydratation des données

**Files:**
- Modify: `frontend/components/isochrone-app.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 2), `workplacesRowToSaved`,
  `housingSearchRowToMarker` (Task 2), `serializeWorkplaces` (`@/lib/workplaces`,
  existant), `AccountMenu`/`Panel` (Task 3).
- Produces: état `user: { id: string; email: string } | null` et
  `authReady: boolean` consommés par Task 5 (écriture) dans ce même
  fichier.

- [ ] **Step 1: Ajouter les imports et l'état**

Ajouter aux imports de `frontend/components/isochrone-app.tsx` :

```tsx
import { supabase } from "@/lib/supabase/client";
import { housingSearchRowToMarker, workplacesRowToSaved, type HousingSearchRow } from "@/lib/sync";
import { serializeWorkplaces } from "@/lib/workplaces";
```

Ajouter avec les autres `useState` :

```tsx
const [user, setUser] = useState<{ id: string; email: string } | null>(null);
const [authReady, setAuthReady] = useState(false);
```

- [ ] **Step 2: Ajouter l'effet d'initialisation et l'écoute des changements d'auth**

Ajouter un nouvel effet, avant l'effet POI existant :

```tsx
useEffect(() => {
  let cancelled = false;

  async function hydrateFromAccount(userId: string) {
    const [{ data: workplacesRow }, { data: housingRows }] = await Promise.all([
      supabase.from("workplaces").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("housing_searches")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ]);
    if (workplacesRow) {
      localStorage.setItem(
        WORKPLACES_STORAGE_KEY,
        serializeWorkplaces(workplacesRowToSaved(workplacesRow))
      );
    }
    if (housingRows) {
      setHousingMarkers((housingRows as HousingSearchRow[]).map(housingSearchRowToMarker));
    }
  }

  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (cancelled) return;
    if (session?.user.email) {
      try {
        await hydrateFromAccount(session.user.id);
        if (cancelled) return;
        setUser({ id: session.user.id, email: session.user.email });
      } catch {
        // Network/Supabase failure on initial load: fall back to the
        // anonymous view (localStorage/empty history) instead of getting
        // stuck on the loading state — matches the spec's "pas d'erreur
        // bloquante" requirement for this case.
      }
    }
    if (!cancelled) setAuthReady(true);
  });

  const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" && session?.user.email) {
      try {
        await hydrateFromAccount(session.user.id);
        setUser({ id: session.user.id, email: session.user.email });
        window.location.reload();
      } catch {
        // Same fallback as above: stay on the current (anonymous-looking)
        // view rather than throwing past this handler.
      }
    } else if (event === "SIGNED_OUT") {
      setUser(null);
      setHousingMarkers([]);
    }
  });

  return () => {
    cancelled = true;
    subscription.subscription.unsubscribe();
  };
}, []);
```

- [ ] **Step 3: Passer `accountEmail` à `Panel` et attendre `authReady`**

Remplacer :

```tsx
      <Panel>
        {showWelcome && <Welcome />}
```

par :

```tsx
      <Panel accountEmail={user?.email ?? null}>
        {!authReady ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <>
            {showWelcome && <Welcome />}
```

Et juste avant la fermeture `</Panel>`, fermer le fragment ajouté :

```tsx
          </>
        )}
      </Panel>
```

(Le reste du contenu du `Panel` — `WorkplaceForm`, `PoiFilters`,
`HousingForm`, `HousingList` — reste inchangé entre les deux, juste
englobé dans le fragment conditionnel.)

- [ ] **Step 4: Vérifier lint + build**

Run: `cd frontend && npm run lint && npm run build`
Expected: vert.

- [ ] **Step 5: Vérification manuelle (navigateur)**

Avec un dev server + backend réel (voir Task 6 pour les variables
d'environnement), vérifier : l'app charge normalement sans compte (aucun
délai perceptible, `authReady` passe à `true` quasi instantanément sans
session) ; créer un compte via le popover, se déconnecter/reconnecter,
vérifier que la page recharge après connexion et qu'aucune erreur console
n'apparaît.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/isochrone-app.tsx
git commit -m "feat: hydrate workplaces/housing history from Supabase on login"
```

---

### Task 5: Frontend — écriture des données (upsert / insert / delete)

**Files:**
- Modify: `frontend/components/isochrone-app.tsx`

**Interfaces:**
- Consumes: `user` (Task 4), `savedToWorkplacesUpsert`,
  `markerToHousingSearchInsert` (`@/lib/sync`, Task 2).
- Produces: rien de nouveau exposé — dernière tâche de câblage de ce
  plan.

- [ ] **Step 1: Ajouter les imports**

Compléter l'import existant de `@/lib/sync` dans
`frontend/components/isochrone-app.tsx` :

```tsx
import {
  housingSearchRowToMarker,
  markerToHousingSearchInsert,
  savedToWorkplacesUpsert,
  workplacesRowToSaved,
  type HousingSearchRow,
} from "@/lib/sync";
```

- [ ] **Step 2: Upsert des lieux de travail à la sauvegarde**

Dans `handleWorkplaceSubmit`, juste après `setResolved2(results2[0].resolved_address);`,
ajouter :

```tsx
      if (user) {
        await supabase
          .from("workplaces")
          .upsert(
            savedToWorkplacesUpsert(
              { address1, address2, minutes: String(minutes), modes: selectedModes },
              user.id
            )
          );
      }
```

- [ ] **Step 3: Insert/delete des logements testés**

Remplacer le corps de `handleHousingSubmit` (le bloc `try`) :

```tsx
    try {
      const results = await Promise.all(
        modes.map((m) => fetchHousing(address, work1, work2, m))
      );
      const marker = buildHousingMarker(results, intersection);
      if (user) {
        const { data } = await supabase
          .from("housing_searches")
          .insert(markerToHousingSearchInsert(marker, user.id))
          .select()
          .single();
        setHousingMarkers((prev) => [
          ...prev,
          data ? housingSearchRowToMarker(data as HousingSearchRow) : marker,
        ]);
      } else {
        setHousingMarkers((prev) => [...prev, marker]);
      }
    } catch (err) {
```

Remplacer `handleRemoveHousing` :

```tsx
  function handleRemoveHousing(index: number) {
    const removed = housingMarkers[index];
    setHousingMarkers((prev) => removeHousingAt(prev, index));
    setFocus(null);
    if (removed?.id) {
      supabase.from("housing_searches").delete().eq("id", removed.id);
    }
  }
```

- [ ] **Step 4: Vérifier tests + lint + build**

Run: `cd frontend && npm run test && npm run lint && npm run build`
Expected: tout vert.

- [ ] **Step 5: Vérification manuelle (navigateur)**

Avec un dev server + backend réel : connecté, calculer une zone, tester un
logement, vérifier dans le dashboard Supabase (table editor) que les
lignes `workplaces`/`housing_searches` apparaissent bien avec le bon
`user_id` ; supprimer le logement dans l'UI, vérifier que la ligne
disparaît côté Supabase aussi ; se déconnecter/reconnecter (ou recharger),
vérifier que le formulaire et l'historique se restaurent.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/isochrone-app.tsx
git commit -m "feat: sync workplace saves and housing search history to Supabase"
```

---

### Task 6: Passe finale — env, docs, changelog 0.7.0

**Files:**
- Modify: `.env.example`
- Modify: `backend/.env` (local, non commité — juste pour vérifier)
- Modify: `README.md`
- Modify: `DESIGN.md`
- Modify: `CHANGELOG.md`
- Verify only: `frontend/.gitignore` (déjà couvert par le pattern `.env*`
  existant — pas de modification attendue, juste une vérification)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: branche prête pour /simplify, /security-review et PR.

- [ ] **Step 1: Vérifier `.gitignore`**

Run: `git check-ignore frontend/.env.local`
Expected: affiche le chemin (déjà ignoré par le pattern `.env*` standard
de Next.js). Si la commande ne renvoie rien, ajouter `**/.env.local` à
`.gitignore` à la racine.

- [ ] **Step 2: Mettre à jour `.env.example`**

Ajouter à la fin :

```
SUPABASE_JWT_SECRET=
```

(Les variables `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
vivent dans `frontend/.env.local`, pas dans le `.env` racine consommé par
le backend — garder la séparation existante entre les deux fichiers.)

- [ ] **Step 3: Ajouter `SUPABASE_JWT_SECRET` au `.env` local**

Récupérer la valeur : dashboard Supabase du projet
`wgfcywjykimvxkwpgdob` → Project Settings → Data API → JWT Settings →
« Legacy JWT secret » (ne jamais l'afficher dans une réponse ou un
commit). Ajouter la ligne `SUPABASE_JWT_SECRET=<valeur>` à `.env` à la
racine (fichier déjà non versionné, déjà utilisé pour
`GEOAPIFY_API_KEY`).

- [ ] **Step 4: Mettre à jour `README.md`**

Dans la section « Lancer le projet », après les lignes concernant
`GEOAPIFY_API_KEY`, ajouter :

```markdown
Pour activer les comptes utilisateurs (optionnel — l'app fonctionne sans) :
renseigner `SUPABASE_JWT_SECRET` dans `.env` (Project Settings → Data API
→ JWT Settings du projet Supabase), et créer `frontend/.env.local` avec :

```
NEXT_PUBLIC_SUPABASE_URL=https://wgfcywjykimvxkwpgdob.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Kqhf3XYt3o0uQNFe52mojQ_4Ev4NOxu
```

La connexion Google nécessite en plus des identifiants OAuth configurés
dans Supabase Auth → Providers → Google (à créer dans Google Cloud
Console).
```

Ajouter aussi une ligne dans la section « API backend » :

```markdown
- `/isochrone`, `/housing`, `/pois` sont limités en débit (30 req/jour par
  IP anonyme, 200 req/jour par compte connecté via un JWT Supabase en
  en-tête `Authorization: Bearer <token>`).
```

- [ ] **Step 5: Mettre à jour `DESIGN.md`**

Sous la section « 5. Components », ajouter une sous-section :

```markdown
### Account Menu
- **Déconnecté** : bouton discret « Se connecter » (icône + texte,
  `muted-foreground`), ouvre un popover avec formulaire email/mot de passe
  et bouton Google.
- **Connecté** : email affiché (masqué sur mobile), icône de déconnexion,
  même style discret — pas de nouvelle couleur fonctionnelle, cohérent
  avec la One Accent Rule.
```

- [ ] **Step 6: Changelog**

Dans `CHANGELOG.md`, sous `## [Unreleased]`, insérer (nouvelle capacité
utilisateur additive → **minor**, prochaine après v0.6.0 → **0.7.0**) :

```markdown
## [0.7.0] - 2026-07-11

### Added
- Comptes utilisateurs optionnels (email/mot de passe + Google via
  Supabase Auth) : synchronisation des lieux de travail entre appareils et
  historique persistant des logements testés.
- Limitation de débit sur `/isochrone`, `/housing`, `/pois` (30 req/jour
  anonyme par IP, 200 req/jour par compte connecté) pour protéger le quota
  Geoapify partagé.
```

- [ ] **Step 7: Suites complètes**

Run:
```bash
cd frontend && npm run test && npm run lint && npm run build
cd .. && .venv/bin/python -m pytest backend/tests/ -q
```
Expected: tout vert.

- [ ] **Step 8: Commit**

```bash
git add .env.example README.md DESIGN.md CHANGELOG.md
git commit -m "docs: document Supabase setup, rate limits, and changelog 0.7.0"
```

---

## Après le plan (workflow new-feature, hors tasks)

1. `/simplify` sur le diff, appliquer sauf conflit avec le design approuvé.
2. `/security-review` sur le diff — attention particulière : le JWT
   `SUPABASE_JWT_SECRET` ne doit jamais fuir côté client (seul le backend
   le lit) ; RLS déjà vérifiée sans lint de sécurité au moment de
   l'application du schéma (`get_advisors` clean) mais à re-vérifier après
   le diff final ; la clé publiable Supabase peut apparaître en clair côté
   client (c'est son usage prévu, comme `NEXT_PUBLIC_*` déjà pour d'autres
   valeurs publiques).
3. PR `feature/user-accounts` → `main` via
   superpowers:finishing-a-development-branch ; attendre CI verte.
4. Après merge : tag `v0.7.0` + release GitHub.
5. **Ne pas oublier** : configurer les identifiants Google OAuth réels dans
   Google Cloud Console + Supabase Auth → Providers → Google (étape
   manuelle hors CI/CD, peut se faire à tout moment avant ou après le
   merge — le bouton Google ne fonctionnera simplement pas tant que ce
   n'est pas fait).
