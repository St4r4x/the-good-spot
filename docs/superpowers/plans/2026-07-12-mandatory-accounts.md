# Comptes utilisateurs obligatoires + récupération de mot de passe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre un compte Supabase obligatoire pour utiliser `/app` (redirection vers `/login` sinon), ajouter un flux de récupération de mot de passe, renommer `GET /isochrone` en `GET /zone`, faire rejeter (401) par le backend toute requête sans JWT valide, et supprimer tout le chemin anonyme/`localStorage` devenu mort.

**Architecture:** Frontend Next.js : deux nouvelles pages publiques (`/login`, `/reset-password`) portant toute la logique d'authentification Supabase ; `/app` devient gated côté client (vérifie la session au montage, redirige sinon) et charge ses données exclusivement depuis Supabase. Backend FastAPI : chaque endpoint gagne une dépendance `Depends(require_user_id)` qui renvoie 401 avant même que le rate limiter ne s'exécute ; un seul palier de rate limiting (200/jour) puisqu'il n'y a plus de trafic anonyme légitime.

**Tech Stack:** Next.js 16 / React 19 / TypeScript (frontend), FastAPI / Python (backend), Supabase Auth (`@supabase/supabase-js` côté client, `PyJWT` côté serveur), `slowapi` pour le rate limiting.

## Global Constraints

- `GET /isochrone` devient `GET /zone` — même comportement, mêmes paramètres, seul le nom change. `GET /housing` et `GET /pois` gardent leur nom.
- Les trois endpoints backend exigent un JWT Supabase valide (`Authorization: Bearer <token>`) : absent, invalide ou expiré → **401**.
- Rate limiting : un seul palier, **200 req/jour par `user_id`**, partagé entre les trois endpoints (`@limiter.shared_limit(RATE_LIMIT, scope="geoapify")`, déjà en place — ne pas changer le `scope`).
- Aucune donnée serveur n'existe pour l'usage anonyme précédent (tout vivait en `localStorage` côté navigateur) — rien à migrer.
- Le gate d'authentification de `/app` est **côté client** (pas de middleware Next.js, pas de `@supabase/ssr` — cohérent avec la spec initiale de la feature comptes utilisateurs).
- Toute donnée persistante (lieux de travail, historique de logements) vit exclusivement dans Supabase — plus de `localStorage` pour ces données.
- Version cible : **1.0.0** (breaking change).

---

### Task 1: Backend — renommer l'endpoint, exiger l'authentification, simplifier le rate limiting

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_main.py`

**Interfaces:**
- Consumes: rien de nouveau (fonctions existantes `get_current_user_id`, `geocode`, `travel_time_seconds`, `validate_mode`, `validate_groups`, `parse_bbox`, `group_for_categories` inchangées).
- Produces: `GET /zone` (remplace `GET /isochrone`), `require_user_id(request: Request) -> str` (dépendance FastAPI, lève `HTTPException(401)` si pas de JWT valide), `RATE_LIMIT: str = "200/day"`.

- [ ] **Step 1: Réécrire `backend/tests/test_main.py` pour refléter le nouveau contrat**

Remplacer tout le contenu du fichier par :

```python
import httpx
import pytest
import respx

from main import GEOCODE_URL, ISOLINE_URL, PLACES_URL, ROUTING_URL, validate_mode

GEOCODE_MATCH = {
    "features": [
        {
            "geometry": {"coordinates": [2.3522, 48.8566]},
            "properties": {"formatted": "Paris, France"},
        }
    ]
}


def test_validate_mode_accepts_known_modes() -> None:
    for mode in ["transit", "walk", "bicycle", "drive"]:
        validate_mode(mode)


def test_validate_mode_rejects_unknown_mode() -> None:
    with pytest.raises(Exception):
        validate_mode("teleport")


@respx.mock
def test_zone_requires_auth(client) -> None:
    resp = client.get("/zone", params={"address": "Paris", "minutes": 15})
    assert resp.status_code == 401


@respx.mock
def test_zone_rejects_invalid_token(client) -> None:
    resp = client.get(
        "/zone",
        params={"address": "Paris", "minutes": 15},
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert resp.status_code == 401


@respx.mock
def test_zone_rejects_minutes_out_of_range(client, auth_headers) -> None:
    headers = auth_headers()
    resp = client.get(
        "/zone", params={"address": "Paris", "minutes": 0}, headers=headers
    )
    assert resp.status_code == 400

    resp = client.get(
        "/zone", params={"address": "Paris", "minutes": 61}, headers=headers
    )
    assert resp.status_code == 400


@respx.mock
def test_zone_rejects_unknown_mode(client, auth_headers) -> None:
    resp = client.get(
        "/zone",
        params={"address": "Paris", "minutes": 15, "mode": "teleport"},
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@respx.mock
def test_zone_returns_404_for_unknown_address(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    resp = client.get(
        "/zone",
        params={"address": "Nowhereville", "minutes": 15},
        headers=auth_headers(),
    )
    assert resp.status_code == 404


@respx.mock
def test_zone_happy_path(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )

    resp = client.get(
        "/zone",
        params={"address": "Paris", "minutes": 15, "mode": "walk"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolved_address"] == "Paris, France"
    assert body["lat"] == 48.8566
    assert body["lon"] == 2.3522
    assert body["isochrone"]["features"][0]["type"] == "Feature"

    isoline_request = respx.calls.last.request
    assert isoline_request.url.params["mode"] == "walk"
    assert isoline_request.url.params["range"] == "900"


@respx.mock
def test_housing_requires_auth(client) -> None:
    resp = client.get(
        "/housing",
        params={
            "address": "Paris",
            "work1_lat": 48.85,
            "work1_lon": 2.35,
            "work2_lat": 48.86,
            "work2_lon": 2.36,
        },
    )
    assert resp.status_code == 401


@respx.mock
def test_housing_rejects_unknown_mode(client, auth_headers) -> None:
    resp = client.get(
        "/housing",
        params={
            "address": "Paris",
            "work1_lat": 48.85,
            "work1_lon": 2.35,
            "work2_lat": 48.86,
            "work2_lon": 2.36,
            "mode": "teleport",
        },
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@respx.mock
def test_housing_happy_path(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ROUTING_URL).mock(
        return_value=httpx.Response(
            200, json={"features": [{"properties": {"time": 900}}]}
        )
    )

    resp = client.get(
        "/housing",
        params={
            "address": "Paris",
            "work1_lat": 48.85,
            "work1_lon": 2.35,
            "work2_lat": 48.86,
            "work2_lon": 2.36,
            "mode": "bicycle",
        },
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["time_to_work1_minutes"] == 15
    assert body["time_to_work2_minutes"] == 15

    routing_request = respx.calls.last.request
    assert routing_request.url.params["mode"] == "bicycle"


@respx.mock
def test_pois_requires_auth(client) -> None:
    resp = client.get("/pois", params={"bbox": "2.3,48.8,2.4,48.9", "groups": "sport"})
    assert resp.status_code == 401


@respx.mock
def test_pois_rejects_unknown_group(client, auth_headers) -> None:
    resp = client.get(
        "/pois",
        params={"bbox": "2.3,48.8,2.4,48.9", "groups": "not_a_group"},
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@respx.mock
def test_pois_rejects_invalid_bbox(client, auth_headers) -> None:
    resp = client.get(
        "/pois",
        params={"bbox": "2.3,48.8,2.4", "groups": "sport"},
        headers=auth_headers(),
    )
    assert resp.status_code == 400


@respx.mock
def test_pois_happy_path(client, auth_headers) -> None:
    respx.get(PLACES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "properties": {
                            "name": "École Jules Ferry",
                            "categories": ["education", "education.school"],
                        },
                        "geometry": {"coordinates": [2.35, 48.85]},
                    },
                    {
                        "properties": {"categories": ["sport", "sport.pitch"]},
                        "geometry": {"coordinates": [2.36, 48.86]},
                    },
                ]
            },
        )
    )

    resp = client.get(
        "/pois",
        params={"bbox": "2.3,48.8,2.4,48.9", "groups": "education,sport"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["pois"]) == 2
    assert body["pois"][0] == {
        "lat": 48.85,
        "lon": 2.35,
        "name": "École Jules Ferry",
        "group": "education",
    }
    assert body["pois"][1] == {
        "lat": 48.86,
        "lon": 2.36,
        "name": None,
        "group": "sport",
    }

    request = respx.calls.last.request
    assert "education.school" in request.url.params["categories"]
    assert "sport.pitch" in request.url.params["categories"]
    assert request.url.params["filter"] == "rect:2.3,48.8,2.4,48.9"
    assert request.url.params["limit"] == "500"


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
def test_zone_authenticated_requests_succeed(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )
    headers = auth_headers()

    for _ in range(30):
        resp = client.get(
            "/zone",
            params={"address": "Paris", "minutes": 15, "mode": "walk"},
            headers=headers,
        )
        assert resp.status_code == 200


@respx.mock
def test_rate_limit_is_shared_across_endpoints(client, auth_headers) -> None:
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json=GEOCODE_MATCH))
    respx.get(ISOLINE_URL).mock(
        return_value=httpx.Response(200, json={"features": [{"type": "Feature"}]})
    )
    respx.get(PLACES_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    headers = auth_headers()

    for _ in range(150):
        resp = client.get(
            "/zone",
            params={"address": "Paris", "minutes": 15, "mode": "walk"},
            headers=headers,
        )
        assert resp.status_code == 200
    for _ in range(50):
        resp = client.get(
            "/pois",
            params={"bbox": "2.3,48.8,2.4,48.9", "groups": "sport"},
            headers=headers,
        )
        assert resp.status_code == 200

    resp = client.get(
        "/zone",
        params={"address": "Paris", "minutes": 15, "mode": "walk"},
        headers=headers,
    )
    assert resp.status_code == 429
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `.venv/bin/python -m pytest backend/tests/ -q`
Expected: plusieurs échecs — `404 Not Found` sur `/zone` (n'existe pas encore), tests `_requires_auth`/`_rejects_invalid_token` qui reçoivent `200` au lieu de `401` sur les endpoints existants (`/isochrone`, `/housing`, `/pois` acceptent encore l'anonyme).

- [ ] **Step 3: Modifier `backend/main.py`**

Remplacer les imports, constantes, et fonctions liées à l'auth/rate-limiting :

```python
import asyncio
import os

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

GEOAPIFY_API_KEY = os.environ["GEOAPIFY_API_KEY"]
GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
ISOLINE_URL = "https://api.geoapify.com/v1/isoline"
ROUTING_URL = "https://api.geoapify.com/v1/routing"
PLACES_URL = "https://api.geoapify.com/v2/places"
MAX_MINUTES = 60
TRAVEL_MODES = {"transit", "walk", "bicycle", "drive"}

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
RATE_LIMIT = "200/day"
```

(Le dict `POI_GROUPS` juste après reste identique — ne pas y toucher.)

Remplacer `get_current_user_id`, `rate_limit_key`, `rate_limit_value`, et l'instanciation du limiter par :

```python
def get_current_user_id(request: Request) -> str | None:
    auth_header = request.headers.get("authorization")
    if (
        not auth_header
        or not auth_header.startswith("Bearer ")
        or not SUPABASE_JWT_SECRET
    ):
        return None
    token = auth_header.removeprefix("Bearer ")
    try:
        payload = jwt.decode(
            token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated"
        )
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


def require_user_id(request: Request) -> str:
    user_id = get_current_user_id(request)
    if user_id is None:
        raise HTTPException(401, "Authentification requise.")
    return user_id


def rate_limit_key(request: Request) -> str:
    # require_user_id (dépendance FastAPI déclarée sur chaque endpoint) a déjà
    # rejeté avec 401 toute requête sans JWT valide avant que ce code ne
    # s'exécute — user_id est donc toujours présent ici.
    return f"user:{get_current_user_id(request)}"


limiter = Limiter(key_func=rate_limit_key)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

Les fonctions `geocode`, `travel_time_seconds`, `validate_mode`, `validate_groups`, `parse_bbox`, `group_for_categories` restent identiques.

Renommer et modifier les trois endpoints :

```python
@app.get("/zone")
@limiter.shared_limit(RATE_LIMIT, scope="geoapify")
async def zone(
    request: Request,
    address: str,
    minutes: int,
    mode: str = "transit",
    _user_id: str = Depends(require_user_id),
) -> dict:
    if minutes <= 0 or minutes > MAX_MINUTES:
        raise HTTPException(400, f"minutes doit être entre 1 et {MAX_MINUTES}")
    validate_mode(mode)

    async with httpx.AsyncClient(timeout=30) as client:
        match = await geocode(client, address)
        lon, lat = match["geometry"]["coordinates"]

        isoline_resp = await client.get(
            ISOLINE_URL,
            params={
                "lat": lat,
                "lon": lon,
                "type": "time",
                "mode": mode,
                "range": minutes * 60,
                "apiKey": GEOAPIFY_API_KEY,
            },
        )
        isoline_resp.raise_for_status()
        return {
            "resolved_address": match["properties"]["formatted"],
            "lat": lat,
            "lon": lon,
            "isochrone": isoline_resp.json(),
        }


@app.get("/housing")
@limiter.shared_limit(RATE_LIMIT, scope="geoapify")
async def housing(
    request: Request,
    address: str,
    work1_lat: float,
    work1_lon: float,
    work2_lat: float,
    work2_lon: float,
    mode: str = "transit",
    _user_id: str = Depends(require_user_id),
) -> dict:
    validate_mode(mode)
    async with httpx.AsyncClient(timeout=30) as client:
        match = await geocode(client, address)
        lon, lat = match["geometry"]["coordinates"]

        time1, time2 = await asyncio.gather(
            travel_time_seconds(client, lat, lon, work1_lat, work1_lon, mode),
            travel_time_seconds(client, lat, lon, work2_lat, work2_lon, mode),
        )
        return {
            "resolved_address": match["properties"]["formatted"],
            "lat": lat,
            "lon": lon,
            "time_to_work1_minutes": round(time1 / 60),
            "time_to_work2_minutes": round(time2 / 60),
        }


@app.get("/pois")
@limiter.shared_limit(RATE_LIMIT, scope="geoapify")
async def pois(
    request: Request, bbox: str, groups: str, _user_id: str = Depends(require_user_id)
) -> dict:
    validated_bbox = parse_bbox(bbox)
    group_list = groups.split(",")
    validate_groups(group_list)
    categories = ",".join(cat for g in group_list for cat in POI_GROUPS[g])

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            PLACES_URL,
            params={
                "categories": categories,
                "filter": f"rect:{validated_bbox}",
                "limit": 500,
                "apiKey": GEOAPIFY_API_KEY,
            },
        )
        resp.raise_for_status()
        results = []
        for feature in resp.json()["features"]:
            props = feature["properties"]
            group = group_for_categories(props.get("categories", []), group_list)
            if group is None:
                continue
            lon, lat = feature["geometry"]["coordinates"]
            results.append(
                {"lat": lat, "lon": lon, "name": props.get("name"), "group": group}
            )
        return {"pois": results}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `.venv/bin/python -m pytest backend/tests/ -q`
Expected: tous les tests passent (17 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_main.py
git commit -m "feat: require auth on all endpoints, rename /isochrone to /zone"
```

---

### Task 2: Frontend — page `/login`

**Files:**
- Create: `frontend/app/login/page.tsx`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase/client`, déjà existant, `SupabaseClient | null`).
- Produces: page `/login` accessible publiquement, redirige vers `/app` après connexion réussie ou si une session existe déjà au montage.

- [ ] **Step 1: Créer `frontend/app/login/page.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Mode = "signin" | "signup" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/app");
    });
  }, [router]);

  function resetMessages() {
    setError(null);
    setConfirmationSent(false);
    setResetSent(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);
    if (mode === "signin") {
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      setIsLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/app");
      return;
    }
    const { data, error } = await supabase!.auth.signUp({ email, password });
    setIsLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      setConfirmationSent(true);
    } else {
      router.push("/app");
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResetSent(true);
  }

  async function handleGoogle() {
    await supabase!.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app` },
    });
  }

  if (!supabase) return null;

  if (mode === "forgot") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <form onSubmit={handleForgotSubmit} className="flex w-full max-w-sm flex-col gap-3">
          <h1 className="text-lg font-semibold text-foreground">Mot de passe oublié</h1>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "…" : "Envoyer le lien"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              resetMessages();
            }}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Retour à la connexion
          </button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {resetSent && (
            <p role="status" className="text-sm text-muted-foreground">
              Email envoyé : vérifie ta boîte mail pour réinitialiser ton mot de passe.
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-lg font-semibold text-foreground">
          {mode === "signin" ? "Se connecter" : "Créer un compte"}
        </h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-password">Mot de passe</Label>
          <Input
            id="login-password"
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
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              resetMessages();
            }}
            className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {mode === "signin" ? "Créer un compte" : "J'ai déjà un compte"}
          </button>
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                resetMessages();
              }}
              className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Mot de passe oublié ?
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {confirmationSent && (
          <p role="status" className="text-sm text-muted-foreground">
            Compte créé : vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.
          </p>
        )}
        <div className="mt-3 border-t border-border pt-3">
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
            Continuer avec Google
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier build + lint**

Run (depuis `frontend/`): `npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/login/page.tsx
git commit -m "feat: add /login page with sign in, sign up, and forgot password"
```

---

### Task 3: Frontend — page `/reset-password`

**Files:**
- Create: `frontend/app/reset-password/page.tsx`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase/client`).
- Produces: page `/reset-password`, destination du lien envoyé par `resetPasswordForEmail` (Task 2). Redirige vers `/app` après mise à jour réussie du mot de passe.

- [ ] **Step 1: Créer `frontend/app/reset-password/page.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let settled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !settled) {
        settled = true;
        setReady(true);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setReady(true);
      }
    });

    const timeout = setTimeout(() => {
      if (!settled) setExpired(true);
    }, 3000);

    return () => {
      subscription.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setIsLoading(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/app");
  }

  if (!supabase) return null;

  if (expired) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-muted-foreground">
            Ce lien de récupération est invalide ou a expiré.
          </p>
          <a
            href="/login"
            className="mt-3 inline-block text-sm text-primary underline-offset-2 hover:underline"
          >
            Retour à la connexion
          </a>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Vérification du lien…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-lg font-semibold text-foreground">Nouveau mot de passe</h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">Nouveau mot de passe</Label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "…" : "Mettre à jour le mot de passe"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier build + lint**

Run (depuis `frontend/`): `npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/reset-password/page.tsx
git commit -m "feat: add /reset-password page for password recovery"
```

---

### Task 4: Frontend — simplifier `AccountMenu` (état connecté uniquement) et `Panel`

**Files:**
- Modify: `frontend/components/account-menu.tsx`
- Modify: `frontend/components/panel.tsx`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase/client`).
- Produces: `AccountMenu({ email: string })` (email non-nullable — toute la logique connexion/inscription est retirée, elle vit désormais sur `/login`). `Panel({ accountEmail: string, children })`.

- [ ] **Step 1: Réécrire `frontend/components/account-menu.tsx`**

```tsx
"use client";

import { supabase } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

type AccountMenuProps = {
  email: string;
};

export function AccountMenu({ email }: AccountMenuProps) {
  return (
    <button
      type="button"
      onClick={() => supabase?.auth.signOut()}
      className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
      aria-label={`Se déconnecter (${email})`}
    >
      <LogOut aria-hidden className="size-4" />
      <span className="hidden md:inline">{email}</span>
    </button>
  );
}
```

- [ ] **Step 2: Mettre à jour `frontend/components/panel.tsx`**

Changer uniquement le type de la prop (le reste du fichier est inchangé) :

```tsx
type PanelProps = {
  accountEmail: string;
  children: React.ReactNode;
};

export function Panel({ accountEmail, children }: PanelProps) {
```

- [ ] **Step 3: Vérifier build + lint**

Run (depuis `frontend/`): `npm run lint && npm run build`
Expected: des erreurs de type sont attendues à ce stade côté `isochrone-app.tsx` (appelle encore `<Panel accountEmail={user?.email ?? null}>` avec un `string | null`) — normal, corrigé dans la Task 5. Vérifier seulement qu'`account-menu.tsx` et `panel.tsx` eux-mêmes ne produisent pas de nouvelle erreur de syntaxe.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/account-menu.tsx frontend/components/panel.tsx
git commit -m "refactor: simplify AccountMenu to sign-out only (login moves to /login)"
```

---

### Task 5: Frontend — gate d'authentification sur `/app`, suppression du chemin anonyme/`localStorage`

**Files:**
- Modify: `frontend/components/isochrone-app.tsx`
- Modify: `frontend/components/workplace-form.tsx`
- Modify: `frontend/lib/sync.ts`
- Modify: `frontend/lib/sync.test.ts`
- Delete: `frontend/lib/workplaces.ts`
- Delete: `frontend/lib/workplaces.test.ts`

**Interfaces:**
- Consumes: `AccountMenu` (Task 4, `email: string`), `require`/redirect via `useRouter` de `next/navigation`.
- Produces: `SavedWorkplaces` type déplacé dans `@/lib/sync` (mêmes champs : `address1`, `address2`, `minutes`, `modes`). `WorkplaceForm` accepte une prop `initialWorkplaces?: SavedWorkplaces` (plus de lecture/écriture `localStorage` directe).

- [ ] **Step 1: Déplacer le type `SavedWorkplaces` dans `frontend/lib/sync.ts`**

Remplacer le contenu de `frontend/lib/sync.ts` :

```tsx
import type { HousingMarker } from "./housing";
import type { TravelMode } from "./api";

export type SavedWorkplaces = {
  address1: string;
  address2: string;
  minutes: string;
  modes: TravelMode[];
};

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

- [ ] **Step 2: Mettre à jour l'import dans `frontend/lib/sync.test.ts`**

Changer la ligne d'import de `SavedWorkplaces` :

```tsx
import type { SavedWorkplaces } from "./sync";
```

(à la place de `import type { SavedWorkplaces } from "./workplaces";` — retirer cette ligne, le reste du fichier de test est inchangé puisque `SavedWorkplaces` a le même shape.)

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils passent encore**

Run (depuis `frontend/`): `npm run test`
Expected: `sync.test.ts` passe toujours (5 fichiers de test au total à ce stade, `workplaces.test.ts` existe encore mais sera supprimé à l'étape suivante).

- [ ] **Step 4: Supprimer `frontend/lib/workplaces.ts` et `frontend/lib/workplaces.test.ts`**

```bash
git rm frontend/lib/workplaces.ts frontend/lib/workplaces.test.ts
```

- [ ] **Step 5: Réécrire `frontend/components/workplace-form.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TravelMode } from "@/lib/api";
import type { SavedWorkplaces } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Bike, Bus, Car, Check, Footprints } from "lucide-react";
import { useState } from "react";

const TRAVEL_MODES: { value: TravelMode; label: string; Icon: typeof Bus }[] = [
  { value: "transit", label: "Transports", Icon: Bus },
  { value: "walk", label: "Marche", Icon: Footprints },
  { value: "bicycle", label: "Vélo", Icon: Bike },
  { value: "drive", label: "Voiture", Icon: Car },
];

const DEFAULT_INITIAL_WORKPLACES: SavedWorkplaces = {
  address1: "",
  address2: "",
  minutes: "30",
  modes: ["transit"],
};

type WorkplaceFormProps = {
  onSubmit: (address1: string, address2: string, minutes: number, modes: TravelMode[]) => void;
  isLoading: boolean;
  resolved1: string | null;
  resolved2: string | null;
  error: string | null;
  initialWorkplaces?: SavedWorkplaces;
};

export function WorkplaceForm({
  onSubmit,
  isLoading,
  resolved1,
  resolved2,
  error,
  initialWorkplaces = DEFAULT_INITIAL_WORKPLACES,
}: WorkplaceFormProps) {
  const [address1, setAddress1] = useState(initialWorkplaces.address1);
  const [address2, setAddress2] = useState(initialWorkplaces.address2);
  const [minutes, setMinutes] = useState(initialWorkplaces.minutes);
  const [modes, setModes] = useState<TravelMode[]>(initialWorkplaces.modes);

  function toggleMode(value: TravelMode) {
    setModes((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (modes.length === 0) return;
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

(Seuls changements par rapport à l'existant : suppression de l'`useState(() => parseSavedWorkplaces(...))` remplacé par une prop `initialWorkplaces`, et suppression du `localStorage.setItem(...)` dans `handleSubmit`. Le reste — le JSX, `toggleMode`, `resolvedFor` — est identique.)

- [ ] **Step 6: Réécrire `frontend/components/isochrone-app.tsx`**

```tsx
"use client";

import { HousingForm } from "@/components/housing-form";
import { HousingList } from "@/components/housing-list";
import { MapLegend } from "@/components/map/map-legend";
import { Panel } from "@/components/panel";
import { PoiFilters } from "@/components/poi-filters";
import { Welcome } from "@/components/welcome";
import { WorkplaceForm } from "@/components/workplace-form";
import { ApiError, fetchHousing, fetchIsochrone, fetchPois, type Poi, type PoiGroup, type TravelMode } from "@/lib/api";
import { computeIntersection, computeUnion, type PolygonFeature } from "@/lib/geo";
import { buildHousingMarker, removeHousingAt } from "@/lib/housing";
import { poiBbox, poisInZone } from "@/lib/pois";
import { supabase } from "@/lib/supabase/client";
import {
  housingSearchRowToMarker,
  markerToHousingSearchInsert,
  savedToWorkplacesUpsert,
  workplacesRowToSaved,
  type HousingSearchRow,
  type SavedWorkplaces,
} from "@/lib/sync";
import type { HousingMarker, WorkResult } from "@/components/map/isochrone-map";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const IsochroneMap = dynamic(
  () => import("@/components/map/isochrone-map").then((m) => m.IsochroneMap),
  { ssr: false }
);

export function IsochroneApp() {
  const router = useRouter();
  const [work1, setWork1] = useState<WorkResult | null>(null);
  const [work2, setWork2] = useState<WorkResult | null>(null);
  const [modes, setModes] = useState<TravelMode[]>(["transit"]);
  const [intersection, setIntersection] = useState<PolygonFeature | null>(null);
  const [housingMarkers, setHousingMarkers] = useState<HousingMarker[]>([]);
  const [resolved1, setResolved1] = useState<string | null>(null);
  const [resolved2, setResolved2] = useState<string | null>(null);
  const [workplaceError, setWorkplaceError] = useState<string | null>(null);
  const [housingError, setHousingError] = useState<string | null>(null);
  const [isLoadingWorkplaces, setIsLoadingWorkplaces] = useState(false);
  const [isLoadingHousing, setIsLoadingHousing] = useState(false);
  const [focus, setFocus] = useState<{ index: number; token: number } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [poiGroups, setPoiGroups] = useState<PoiGroup[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [initialWorkplaces, setInitialWorkplaces] = useState<SavedWorkplaces | undefined>(
    undefined
  );

  function handleRemoveHousing(index: number) {
    const removed = housingMarkers[index];
    setHousingMarkers((prev) => removeHousingAt(prev, index));
    setFocus(null);
    if (removed?.id) {
      supabase!.from("housing_searches").delete().eq("id", removed.id);
    }
  }

  function handleFocusHousing(index: number) {
    setFocus({ index, token: Date.now() });
  }

  useEffect(() => {
    if (!supabase) {
      router.replace("/login");
      return;
    }
    let cancelled = false;

    async function hydrate(userId: string) {
      const [{ data: workplacesRow }, { data: housingRows }] = await Promise.all([
        supabase!.from("workplaces").select("*").eq("user_id", userId).maybeSingle(),
        supabase!
          .from("housing_searches")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (workplacesRow) {
        setInitialWorkplaces(workplacesRowToSaved(workplacesRow));
      } else {
        setShowWelcome(true);
      }
      if (housingRows) {
        setHousingMarkers((housingRows as HousingSearchRow[]).map(housingSearchRowToMarker));
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user.email) {
        router.replace("/login");
        return;
      }
      setUser({ id: session.user.id, email: session.user.email });
      hydrate(session.user.id).finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (poiGroups.length === 0 || !intersection) {
      // Reset POI list when filters cleared or zone unavailable; eslint-plugin-react-hooks v6 flags all state-setters in effect regardless of context.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPois([]);
      return;
    }
    let cancelled = false;
    // Clear prior errors before starting new fetch.
    setPoiError(null);
    fetchPois(poiBbox(intersection), poiGroups)
      .then((results) => {
        if (!cancelled) setPois(poisInZone(results, intersection));
      })
      .catch((err) => {
        if (!cancelled) {
          setPoiError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [poiGroups, intersection]);

  async function handleWorkplaceSubmit(
    address1: string,
    address2: string,
    minutes: number,
    selectedModes: TravelMode[]
  ) {
    setWorkplaceError(null);
    setIsLoadingWorkplaces(true);
    setModes(selectedModes);
    try {
      const [results1, results2] = await Promise.all([
        Promise.all(selectedModes.map((m) => fetchIsochrone(address1, minutes, m))),
        Promise.all(selectedModes.map((m) => fetchIsochrone(address2, minutes, m))),
      ]);

      const polygon1 = computeUnion(results1.map((r) => r.isochrone.features[0]));
      const polygon2 = computeUnion(results2.map((r) => r.isochrone.features[0]));

      setWork1({ lat: results1[0].lat, lon: results1[0].lon, polygon: polygon1 });
      setWork2({ lat: results2[0].lat, lon: results2[0].lon, polygon: polygon2 });
      setResolved1(results1[0].resolved_address);
      setResolved2(results2[0].resolved_address);
      await supabase!
        .from("workplaces")
        .upsert(
          savedToWorkplacesUpsert(
            { address1, address2, minutes: String(minutes), modes: selectedModes },
            user!.id
          )
        );
      setHousingMarkers([]);

      const computed = computeIntersection(polygon1, polygon2);
      setIntersection(computed);
      setShowWelcome(false);
      if (!computed) {
        setWorkplaceError(`Aucune zone commune atteignable en ${minutes} min depuis les deux lieux.`);
      }
    } catch (err) {
      setWorkplaceError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setIsLoadingWorkplaces(false);
    }
  }

  async function handleHousingSubmit(address: string) {
    if (!work1 || !work2) {
      setHousingError("Calcule d'abord la zone commune avec les deux lieux de travail.");
      return;
    }
    setHousingError(null);
    setIsLoadingHousing(true);
    try {
      const results = await Promise.all(
        modes.map((m) => fetchHousing(address, work1, work2, m))
      );
      const marker = buildHousingMarker(results, intersection);
      const { data } = await supabase!
        .from("housing_searches")
        .insert(markerToHousingSearchInsert(marker, user!.id))
        .select()
        .single();
      setHousingMarkers((prev) => [
        ...prev,
        data ? housingSearchRowToMarker(data as HousingSearchRow) : marker,
      ]);
    } catch (err) {
      setHousingError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    } finally {
      setIsLoadingHousing(false);
    }
  }

  return (
    <div className="relative h-full">
      <IsochroneMap
        work1={work1}
        work2={work2}
        intersection={intersection}
        housingMarkers={housingMarkers}
        focus={focus}
        pois={pois}
      />

      {work1 && work2 && (
        <div className="absolute top-3 right-3 z-10 md:top-auto md:bottom-8">
          <MapLegend />
        </div>
      )}

      {authReady && user ? (
        <Panel accountEmail={user.email}>
          {showWelcome && <Welcome />}
          <WorkplaceForm
            onSubmit={handleWorkplaceSubmit}
            isLoading={isLoadingWorkplaces}
            resolved1={resolved1}
            resolved2={resolved2}
            error={workplaceError}
            initialWorkplaces={initialWorkplaces}
          />
          <PoiFilters
            selected={poiGroups}
            onChange={setPoiGroups}
            disabled={!intersection}
            error={poiError}
          />
          <HousingForm
            onSubmit={handleHousingSubmit}
            isLoading={isLoadingHousing}
            disabled={!work1 || !work2}
            error={housingError}
          />
          <HousingList
            items={housingMarkers}
            onRemove={handleRemoveHousing}
            onFocus={handleFocusHousing}
          />
        </Panel>
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center rounded-t-xl bg-card p-6 shadow-floating md:inset-x-auto md:top-4 md:left-4 md:rounded-xl">
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </div>
      )}
    </div>
  );
}
```

Notes sur ce qui change par rapport à l'existant :
- Plus de `lastHydratedUserId` (ref) ni de logique `SIGNED_IN` avec `window.location.reload()` : `/app` n'est jamais visité par un utilisateur qui vient de se connecter sur la même page (la connexion a lieu sur `/login`, qui redirige vers `/app` une fois la session établie). Seul `SIGNED_OUT` reste géré (redirection vers `/login`).
- Plus de `WORKPLACES_STORAGE_KEY`/`parseSavedWorkplaces`/`serializeWorkplaces` : `showWelcome` se déduit désormais de l'absence de ligne `workplaces` en base (mis à `true` dans `hydrate` si `workplacesRow` est absent), pas de la présence d'une valeur en `localStorage`.
- `handleWorkplaceSubmit`/`handleHousingSubmit`/`handleRemoveHousing` : les branches `if (user)` disparaissent — `user` et `supabase` sont garantis non-null à ce stade (ces handlers ne sont atteignables que via des formulaires qui ne rendent qu'une fois `authReady && user` vrai).

- [ ] **Step 7: Lancer les suites de tests et vérifier build/lint**

Run (depuis `frontend/`): `npm run test && npm run lint && npm run build`
Expected: tous les tests passent (4 fichiers de test restants : `geo.test.ts`, `pois.test.ts`, `sync.test.ts`, `housing.test.ts` — `workplaces.test.ts` a été supprimé), lint et build sans erreur.

- [ ] **Step 8: Commit**

```bash
git add frontend/components/isochrone-app.tsx frontend/components/workplace-form.tsx frontend/lib/sync.ts frontend/lib/sync.test.ts
git commit -m "feat: gate /app behind auth, remove anonymous localStorage path"
```

---

### Task 6: Frontend — landing page : un seul CTA, reformulation de la réassurance

**Files:**
- Modify: `frontend/app/page.tsx`
- Delete: `frontend/components/landing-account-menu.tsx`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: landing page publique avec un seul CTA "Ouvrir la carte" (redirige vers `/login` via le gate de `/app` si non connecté).

- [ ] **Step 1: Supprimer `frontend/components/landing-account-menu.tsx`**

```bash
git rm frontend/components/landing-account-menu.tsx
```

- [ ] **Step 2: Modifier `frontend/app/page.tsx`**

Retirer l'import et l'usage de `LandingAccountMenu`, et reformuler le bloc réassurance :

```tsx
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, Home, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Good Spot — trouvez où vivre à mi-chemin",
  description:
    "Deux lieux de travail, un temps de trajet max : découvrez la zone où habiter convient aux deux, en vrais temps de trajet (transports, marche, vélo, voiture).",
  openGraph: {
    title: "The Good Spot — trouvez où vivre à mi-chemin",
    description:
      "La zone où habiter convient à vos deux trajets domicile-travail, en vrais temps de trajet.",
    images: ["/app-preview.webp"],
  },
};

const STEPS = [
  {
    Icon: MapPin,
    title: "Vos deux lieux de travail",
    text: "Renseignez les deux adresses, un temps de trajet max et vos moyens de transport.",
  },
  {
    Icon: Clock,
    title: "La zone commune",
    text: "L'app calcule ce qui est réellement atteignable depuis chaque lieu et affiche l'intersection sur la carte.",
  },
  {
    Icon: Home,
    title: "Testez des logements",
    text: "Chaque adresse candidate est vérifiée : dans la zone ou non, avec le vrai temps de trajet vers chaque lieu.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-base font-semibold text-foreground">The Good Spot</span>
        <Link href="/app" className={cn(buttonVariants())}>
          Ouvrir la carte
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-12 text-center md:py-20">
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold text-foreground md:text-5xl">
            Trouvez où vivre à mi-chemin
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Deux lieux de travail, un temps de trajet max : découvrez la zone où
            habiter convient aux deux — en vrais temps de trajet, pas à vol
            d&apos;oiseau.
          </p>
          <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
            Ouvrir la carte
          </Link>
          <div className="mt-12 overflow-hidden rounded-xl border border-border">
            {/* Pre-optimized WebP served as-is; no-img-element rule doesn't apply here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/app-preview.webp"
              width={1440}
              height={900}
              alt="L'application The Good Spot : deux zones de trajet autour de Paris et leur zone commune sur la carte, avec un logement testé dans le panneau"
              className="w-full"
            />
          </div>
        </section>

        <section className="py-12 md:py-16">
          <h2 className="text-center text-2xl font-semibold text-foreground">
            Comment ça marche
          </h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {STEPS.map(({ Icon, title, text }, i) => (
              <li key={title} className="text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-5" />
                </div>
                <h3 className="mt-3 font-semibold text-foreground">
                  {i + 1}. {title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border py-12 md:py-16">
          <ul className="mx-auto grid max-w-3xl gap-6 text-center text-sm text-muted-foreground md:grid-cols-3">
            <li>
              <strong className="block font-medium text-foreground">
                De vrais temps de trajet
              </strong>
              Isochrones et itinéraires calculés par Geoapify, pas une estimation à
              vol d&apos;oiseau.
            </li>
            <li>
              <strong className="block font-medium text-foreground">
                Synchronisé entre appareils
              </strong>
              Un compte gratuit garde vos lieux de travail et l&apos;historique de vos
              logements testés, partout où vous vous connectez.
            </li>
            <li>
              <strong className="block font-medium text-foreground">Gratuit</strong>
              Pensé pour une recherche de logement à deux, sans coût caché.
            </li>
          </ul>
        </section>

        <section className="border-t border-border py-14 text-center md:py-20">
          <h2 className="text-2xl font-semibold text-foreground">
            Prêts à chercher au bon endroit ?
          </h2>
          <Link href="/app" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
            Ouvrir la carte
          </Link>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 text-xs text-muted-foreground">
          <span>The Good Spot</span>
          <a
            href="https://github.com/St4r4x/the-good-spot"
            className="transition-colors duration-150 hover:text-primary motion-reduce:transition-none"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier build + lint**

Run (depuis `frontend/`): `npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.tsx
git rm frontend/components/landing-account-menu.tsx
git commit -m "refactor: single CTA on landing page, reword no-account-required copy"
```

---

### Task 7: Documentation, changelog 1.0.0, passe finale

**Files:**
- Modify: `README.md`
- Modify: `DESIGN.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: branche prête pour PR.

- [ ] **Step 1: Mettre à jour `README.md`**

Remplacer les lignes 18-20 (mémorisation en `localStorage`) :

```markdown
Un compte (email/mot de passe ou Google) est nécessaire pour utiliser l'app —
les lieux de travail et l'historique des logements testés sont synchronisés
entre appareils via Supabase.
```

Remplacer la section entre « Ouvrir `http://localhost:8080` » et « ## Structure » (qui présentait Supabase comme optionnel) par :

```markdown
Ouvrir `http://localhost:8080` — la page d'accueil présente le produit, l'app
carte est sur `/app` (redirige vers `/login` si aucun compte n'est connecté).

Un compte Supabase est nécessaire pour utiliser l'app : renseigner
`SUPABASE_JWT_SECRET` dans `.env` (Project Settings → Data API → JWT Settings
du projet Supabase), et créer `frontend/.env.local` avec :

```
NEXT_PUBLIC_SUPABASE_URL=https://wgfcywjykimvxkwpgdob.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Kqhf3XYt3o0uQNFe52mojQ_4Ev4NOxu
```

La connexion Google nécessite en plus des identifiants OAuth configurés
dans Supabase Auth → Providers → Google (à créer dans Google Cloud
Console).
```

Dans la section « API backend », remplacer la ligne `GET /isochrone...` par :

```markdown
- `GET /zone?address=...&minutes=1-60&mode=transit|walk|bicycle|drive` →
  géocode l'adresse, retourne l'isochrone du mode choisi en GeoJSON (`mode`
  optionnel, défaut `transit`).
```

Et la dernière ligne (rate limiting) par :

```markdown
- `/zone`, `/housing`, `/pois` exigent un JWT Supabase valide en en-tête
  `Authorization: Bearer <token>` (401 sinon), et sont limités à 200 req/jour
  par compte, cumulés sur les trois endpoints.
```

- [ ] **Step 2: Mettre à jour `DESIGN.md`**

Remplacer la sous-section « Account Menu » (sous « 5. Components ») par :

```markdown
### Account Menu
- **Connecté uniquement** : `/app` n'est jamais accessible sans compte, donc
  `AccountMenu` n'affiche que l'email (masqué sur mobile) et une icône de
  déconnexion, style discret cohérent avec la One Accent Rule.
- **Page `/login`** : formulaire email/mot de passe + bouton Google en page
  pleine largeur (plus de popover), lien « Mot de passe oublié ? » sous le
  formulaire de connexion.
- **Page `/reset-password`** : même style de formulaire centré, un seul champ
  mot de passe + confirmation.
```

- [ ] **Step 3: Mettre à jour `CHANGELOG.md`**

Ajouter sous `## [Unreleased]` :

```markdown
## [1.0.0] - 2026-07-12

### Changed
- Un compte (email/mot de passe ou Google) est désormais **obligatoire**
  pour utiliser l'app — l'usage anonyme disparaît (breaking change).
- `GET /isochrone` renommé en `GET /zone` (même comportement).
- Les endpoints `/zone`, `/housing`, `/pois` exigent un JWT Supabase valide
  (401 sinon) ; rate limiting simplifié à un seul palier (200 req/jour par
  compte).

### Added
- Récupération de mot de passe oublié (`/login` → email → `/reset-password`).
```

- [ ] **Step 4: Lancer toutes les suites de tests**

Run :
```bash
cd frontend && npm run test && npm run lint && npm run build && cd ..
.venv/bin/python -m pytest backend/tests/ -q
```
Expected : tous les tests passent, lint et build sans erreur.

- [ ] **Step 5: Commit**

```bash
git add README.md DESIGN.md CHANGELOG.md
git commit -m "docs: document mandatory accounts, /zone rename, changelog 1.0.0"
```
