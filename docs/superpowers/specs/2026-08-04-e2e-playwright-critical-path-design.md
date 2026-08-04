# Design : e2e Playwright sur le parcours critique

Date : 2026-08-04 · Statut : approuvé par Arnaud (session brainstorm)

Objectif : couvrir en e2e le parcours cœur du produit (login → saisie des
deux lieux de travail → zone calculée → test d'un logement candidat), qui
n'a aujourd'hui aucune couverture au-delà des tests unitaires Vitest
(`lib/*.test.ts`) et d'un seul test de composant
(`onboarding-wizard.test.tsx`). Aucun test n'ouvre de vrai navigateur ni ne
traverse plusieurs écrans à la suite.

## Contexte

- Le frontend appelle le backend via des chemins relatifs `/api/zone`,
  `/api/housing`, `/api/pois` (`frontend/lib/api.ts`), réécrits par
  `next.config.ts` vers `http://backend:8000/...` — une cible qui n'existe
  que dans le réseau docker-compose. `/api/zone` et `/api/housing`
  consomment le quota Geoapify partagé (`200/day`, voir
  `2026-07-15-poi-overpass-and-cache-design.md`).
- L'auth (`frontend/lib/supabase/client.ts`) et les écrans `/app` (accueil
  carte) et `/onboarding` font des appels **directs** à Supabase
  (`auth.getSession`, `auth.signInWithPassword`, `from("profiles")`,
  `from("workplaces")`, `from("housing_searches")`) — ce n'est pas seulement
  l'onboarding qui touche la base, `IsochroneApp` (`/app`) aussi.
- `/app` redirige vers `/login` si pas de session, puis vers `/onboarding`
  si le profil n'est pas complet (`isOnboardingComplete`,
  `frontend/lib/profile.ts`).
- `WorkplaceForm` et `HousingForm` vivent tous les deux directement dans
  `/app` (pas seulement dans l'onboarding), pré-remplis si des valeurs
  existent déjà, toujours modifiables.

## Architecture

Playwright pilote un navigateur réel contre le frontend Next.js lancé seul
(`npm run dev`, piloté par `playwright.config.ts` via `webServer`) — **pas
de docker-compose, pas de backend, pas de Postgres réel requis**.

Deux catégories d'appels réseau, traitées différemment :

1. **Auth + données applicatives (Supabase)** : un vrai compte de test
   Supabase, déjà onboardé (profil + un couple de lieux de travail
   existant, peu important lesquels — le test les écrase à l'étape 2).
   Playwright se logue réellement via le formulaire `/login`. Ces appels
   sont rapides, gratuits, non quotifiés — aucune raison de les mocker, et
   les mocker exigerait de reproduire le format exact des réponses
   auth/postgrest de Supabase (fragile, pas de valeur ajoutée ici).
2. **Backend Geoapify/Overpass (`/api/zone`, `/api/housing`, `/api/pois`)** :
   interceptés au niveau réseau du navigateur via `page.route()`, qui
   court-circuite la requête *avant* qu'elle ne parte — peu importe que le
   backend tourne ou non, et peu importe la cible de la réécriture Next.js.
   Réponses canned déterministes, zéro appel réel à Geoapify/Overpass.

Identifiants du compte de test dans `frontend/.env.test.local` (gitignored,
jamais commité) : `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`. Réutilise les
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` déjà présents
dans `frontend/.env.local` pour que l'app fonctionne.

**Setup manuel préalable (une fois, documenté dans le README, pas
automatisé)** : créer ce compte dans le projet Supabase (signup normal via
`/login`), puis compléter l'onboarding une fois à la main, pour qu'`/app`
ne redirige jamais vers `/onboarding` pendant le test.

## Scénario testé (`frontend/e2e/critical-path.spec.ts`)

Un seul scénario, linéaire :

1. **Login** : aller sur `/login`, remplir `Email`/`Mot de passe` avec les
   identifiants du compte de test, cliquer sur « Se connecter ». Attendre
   la redirection vers `/app`.
2. **Lieux de travail** : dans `WorkplaceForm`, remplir « Lieu de travail 1 »
   et « Lieu de travail 2 » avec deux adresses de test (peu importe si
   elles sont réelles — le géocodage est mocké), garder « Transports »
   sélectionné, laisser 30 min, cliquer « Calculer la zone ». Les deux
   appels `/api/zone` (un par lieu) renvoient chacun un isochrone canned
   sous forme de petits polygones qui se chevauchent, avec une
   `resolved_address` distincte par lieu. Vérifier que les deux adresses
   résolues s'affichent sous chaque champ (élément `<p>` avec l'icône
   `Check`, texte = la `resolved_address` mockée).
3. **Test d'un logement** : dans `HousingForm` (devenu actif), remplir
   « Adresse d'un logement à tester », cliquer « Tester ce logement ». Le
   mock `/api/housing` renvoie une `resolved_address`, `time_to_work1_minutes`
   et `time_to_work2_minutes` fixes. Vérifier dans `HousingList` que la
   nouvelle entrée affiche : l'adresse résolue, le statut « Dans la zone »
   (le mock place le logement dans l'intersection), et les deux temps de
   trajet mockés dans le texte `Lieu 1 : X min · Lieu 2 : Y min`.

Pas d'assertion sur le rendu visuel de la carte Leaflet elle-même (canvas,
pas de DOM stable à interroger) — les assertions portent sur les éléments
de texte/formulaire autour, qui reflètent fidèlement l'état de
l'application.

## Mocks réseau (`frontend/e2e/mocks.ts`)

Une fonction `installApiMocks(page)` posant les 3 `page.route()` avant
toute navigation, appelée dans un hook `test.beforeEach` du spec :

- `**/api/zone**` → répond selon le paramètre `address` de la query string
  (pour renvoyer une `resolved_address`/un polygone différent pour le lieu
  1 et le lieu 2)
- `**/api/housing**` → réponse fixe unique (un seul logement testé dans ce
  scénario)
- `**/api/pois**` → réponse vide (`{"pois": []}`) — pas dans le périmètre du
  parcours testé, mais `PoiFilters`/la carte peuvent déclencher l'appel au
  chargement ; sans mock, en local sans backend, ce serait une requête qui
  échoue silencieusement (pas bloquant pour le scénario, mais mieux
  d'avoir une réponse propre que de laisser fuiter une requête non
  interceptée).

## Fichiers

- `frontend/playwright.config.ts` — projet `chromium` uniquement,
  `webServer: { command: "npm run dev", url: "http://localhost:3000" }`,
  `testDir: "./e2e"`
- `frontend/e2e/critical-path.spec.ts`
- `frontend/e2e/mocks.ts`
- `frontend/vitest.config.ts` — ajoute `test.exclude` couvrant `e2e/**` (en
  plus des exclusions par défaut de Vitest), pour qu'il n'essaie pas
  d'exécuter les specs Playwright
- `frontend/package.json` — devDependency `@playwright/test`, script
  `"test:e2e": "playwright test"`
- `.gitignore` (racine, `frontend/` n'a pas son propre `.gitignore`) —
  ajoute `/frontend/test-results/`, `/frontend/playwright-report/`,
  `/frontend/.env.test.local`
- `README.md` — section « Tests e2e » : setup du compte de test (une fois),
  `.env.test.local`, puis `npx playwright install chromium && npm run
  test:e2e`

## Hors scope (explicite)

- Wizard d'onboarding (déjà couvert par un test de composant unitaire)
- Intégration dans la CI GitHub Actions (secrets du compte de test à créer
  manuellement d'abord ; viendra dans une itération séparée une fois le
  test stabilisé en local)
- Autres navigateurs que Chromium
- Connexion Google (OAuth)
- Filtres POI, interactions carte (zoom/pan), cas d'erreur (adresse
  invalide, zone vide, 429)
