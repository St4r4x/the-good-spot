# Design : source POI Overpass (OSM) complémentaire + cache géographique en base

Date : 2026-07-15 · Statut : approuvé par Arnaud (session brainstorm)

Étend le design [`2026-07-11-poi-map-design.md`](2026-07-11-poi-map-design.md).
Objectif : réduire la pression sur le rate limit Geoapify (`200/day`, partagé
entre `/zone`, `/housing`, `/pois`) et améliorer la couverture des POI, sans
changer le contrat `/pois` côté frontend.

## Contexte

`/pois` n'appelle actuellement que Geoapify Places (`/v2/places`), et
`@limiter.shared_limit("200/day", scope="geoapify")` décompte le quota à
chaque appel, cache ou pas — il n'y a aujourd'hui aucun cache. Le backend
(`backend/main.py`) est un unique fichier FastAPI stateless (pas de DB).
Le projet a déjà une instance Supabase (Postgres) utilisée côté frontend
(tables `workplaces`, `housing_search` créées à la main, pas de migration
versionnée dans le repo à ce jour) — c'est la première fois que le backend
lui-même se connecte à une base.

## Architecture générale

`GET /pois` devient, dans l'ordre :

1. Découper la `bbox` demandée en tuiles d'une grille fixe (`bbox_to_tiles`).
2. Pour chaque tuile : lire le cache Postgres (`poi_cache_tiles`). Si absente
   ou plus vieille que 30 jours → cache miss.
3. Pour les tuiles en miss uniquement : fetcher **en parallèle** Geoapify et
   Overpass sur l'étendue de la tuile (pas de la bbox demandée — pour que le
   cache soit réutilisable par d'autres requêtes qui couvrent partiellement
   la même tuile), fusionner+dédupliquer les deux résultats, puis upsert la
   tuile en cache.
4. Agréger les POI de toutes les tuiles couvertes (cache + fraîchement
   fetchées), filtrer par `bbox` exacte (les tuiles dépassent légèrement la
   bbox demandée) et par `groups` demandés.
5. Retourner `{"pois": [{lat, lon, name, group}]}` — **contrat inchangé**,
   aucune modification du frontend n'est nécessaire.

Le rate limit Geoapify n'est décompté que sur cache miss réel (voir section
dédiée) ; Overpass n'a pas de quota chez nous, aucun compteur ne lui est
associé.

## Grille de tuiles et cache (`backend/poi_cache.py`)

- Taille de tuile : 0.01° (~1km à nos latitudes). `tile_x = floor(lon /
  0.01)`, `tile_y = floor(lat / 0.01)`.
- **Chaque tuile fetchée récupère les 8 groupes en une fois**, indépendamment
  des `groups` demandés par la requête courante — sinon deux requêtes sur la
  même zone avec des groupes différents ne partageraient jamais le cache. Le
  filtrage par `groups` se fait après lecture du cache, à l'étape 4
  ci-dessus.
- Table (migration versionnée, voir section Migration) :

  ```sql
  create table poi_cache_tiles (
    tile_x integer not null,
    tile_y integer not null,
    pois jsonb not null,
    fetched_at timestamptz not null default now(),
    primary key (tile_x, tile_y)
  );
  ```

  `pois` stocke `[{lat, lon, name, group, source, osm_id, osm_type}]` —
  `source`/`osm_id`/`osm_type` sont internes au cache (utilisés par le
  dédoublonnage lors d'un refetch), pas exposés dans la réponse `/pois`.
- TTL 30 jours : une tuile dont `fetched_at` a plus de 30 jours est traitée
  comme un cache miss et refetchée (upsert `ON CONFLICT (tile_x, tile_y) DO
  UPDATE`).
- **Connexion DB optionnelle** : nouvelle variable d'env `DATABASE_URL`
  (connection string Postgres du pooler Supabase). Si absente (ex. dev
  local sans DB configurée), `/pois` fonctionne exactement comme avant :
  fetch live à chaque appel, sans cache — ne casse pas le setup existant. Si
  `DATABASE_URL` est défini mais la DB est injoignable au moment de la
  requête, on logue un warning et on retombe sur le fetch live pour cette
  requête plutôt que de faire échouer `/pois`.
- Accès DB via `asyncpg` (nouvelle dépendance), isolé dans des fonctions
  dédiées (`get_cached_tiles`, `upsert_tile`) injectables/mockables en test —
  la suite de tests backend n'a pas besoin d'une vraie Postgres.

## Client Overpass (`backend/overpass.py`)

- Endpoint public `https://overpass-api.de/api/interpreter`, requête
  Overpass QL sur l'étendue de la tuile en cours de fetch, `out center;`
  pour obtenir des coordonnées même sur les `way`/`relation`.
- Mapping tags OSM → mêmes 8 groupes métier que `POI_GROUPS` (Geoapify),
  vérifié en live à l'implémentation (même exigence que pour les catégories
  Geoapify dans le design précédent — aucune valeur de tag inventée) :

  | Groupe | Tags OSM (indicatif, à vérifier en live) |
  |---|---|
  | Éducation | `amenity=school`, `amenity=kindergarten`, `amenity=music_school` |
  | Sport | `leisure=fitness_centre`, `leisure=pitch`, `leisure=sports_centre`, `sport=equestrian` |
  | Commerces du quotidien | `shop=supermarket`, `shop=convenience`, `shop=marketplace` |
  | Santé | `amenity=hospital`, `amenity=clinic`, `amenity=pharmacy` |
  | Parcs & nature | `leisure=park`, `leisure=playground` |
  | Restauration | `amenity=restaurant`, `amenity=cafe`, `amenity=bar` |
  | Transports en commun | `public_transport=*` |
  | Culture & loisirs | `tourism=museum`, `amenity=cinema`, `tourism=attraction` |

- Si Overpass timeout ou renvoie une erreur (HTTP ou JSON invalide) : on
  logue un warning et on continue avec le résultat Geoapify seul pour cette
  tuile — une source indisponible ne fait pas échouer `/pois`.

## Déduplication (`backend/poi_dedup.py`)

Ne compare jamais deux POI de groupes différents.

1. **Match par identité OSM** : Geoapify expose `properties.datasource.raw.osm_id`
   /`osm_type` (même source amont OSM) ; Overpass expose nativement `id`/
   `type`. Si les deux sont présents et identiques → doublon certain, on
   garde la version Geoapify (déjà le format canonique de `/pois`).
2. **Fallback distance + nom** (quand l'un des deux osm_id est absent) :
   distance haversine < 30m **et** noms normalisés (accents/casse retirés)
   avec un ratio de similarité `difflib.SequenceMatcher` ≥ 0.8 (stdlib,
   aucune nouvelle dépendance) → doublon, on garde la version Geoapify.
3. Sinon : les deux POI sont conservés (couverture élargie, c'est l'objectif
   de la fusion des sources).

Cette déduplication ne s'applique qu'à l'intérieur d'une tuile, au moment de
la fusion Geoapify+Overpass avant écriture en cache — pas entre tuiles
voisines (une tuile de 1km ne coupe un POI en deux copies qu'à sa frontière
exacte, cas jugé négligeable, non traité dans cette version).

## Rate limit Geoapify

- Retrait du décorateur `@limiter.shared_limit` sur `/pois` uniquement
  (`/zone` et `/housing` gardent le décorateur existant, inchangés).
- Appel manuel dans le handler `/pois` :
  `limiter.limiter.hit(limits.parse(RATE_LIMIT), rate_limit_key(request),
  "geoapify", cost=n)` où `n` = nombre de tuiles ayant déclenché un vrai
  appel Geoapify pendant cette requête (0 si toutes les tuiles venaient du
  cache → aucune consommation de quota). Si `n == 0`, `hit` n'est pas appelé
  du tout.
- Si le quota est dépassé (`hit` renvoie `False`) : `/pois` renvoie 429,
  même comportement observable qu'avant pour l'utilisateur qui déclenche
  réellement des appels Geoapify.

## Migration Supabase (`supabase/migrations/0001_poi_cache_tiles.sql`)

Nouveau dossier versionné dans le repo (première migration SQL du projet).
Contient le `CREATE TABLE poi_cache_tiles` ci-dessus. Documenté dans
`README.md` : comment appliquer la migration (CLI Supabase ou copier-coller
dans le SQL editor), et la nouvelle variable d'env `DATABASE_URL` (backend
uniquement, jamais exposée au frontend).

## Frontend

**Aucun changement.** `frontend/lib/api.ts` (`fetchPois`, types `Poi`/
`PoiGroup`) et les composants consommateurs (`isochrone-map.tsx`,
`poi-filters.tsx`) continuent de fonctionner sans modification — le contrat
`/pois` est strictement le même qu'avant ce design.

## Tests

- `backend/tests/test_poi_cache.py` : `bbox_to_tiles` (bbox alignée/non
  alignée sur la grille, bbox couvrant plusieurs tuiles) ; lecture/écriture
  cache avec un fake de connexion DB ; expiration TTL 30 jours ; DB absente
  → fallback live.
- `backend/tests/test_overpass.py` : mock `respx` (même outil que le reste
  de la suite) pour la requête Overpass QL, cas succès et cas
  timeout/erreur → dégradation gracieuse (résultat Geoapify seul).
- `backend/tests/test_poi_dedup.py` : doublon par osm_id identique, doublon
  par fallback distance+nom, non-doublon (groupes différents, trop loin,
  nom différent).
- `backend/tests/test_main.py` : nouveau test d'intégration `/pois` — deux
  sources mockées avec un POI en commun, vérifie la fusion sans doublon
  dans la réponse, et que `limiter.limiter.hit` n'est appelé (donc le
  quota décompté) que lorsqu'il y a un vrai cache miss Geoapify.
- Suites existantes (pytest backend, Vitest frontend) doivent rester
  vertes sans modification.

## Hors scope (explicite)

- Dédoublonnage entre tuiles voisines pour un POI à cheval sur une
  frontière de tuile.
- Invalidation manuelle/anticipée du cache avant les 30 jours (ex. si un
  commerce ferme) — le TTL est la seule mécanique de fraîcheur.
- Rate limiting ou quota dédié pour Overpass (l'instance publique
  `overpass-api.de` a son propre fair-use, non modélisé côté backend — un
  usage abusif y serait simplement rejeté par Overpass, dégradation
  gracieuse déjà couverte ci-dessus).
- Migration des tables Supabase existantes (`workplaces`, `housing_search`)
  vers le nouveau dossier `supabase/migrations/` — seule la nouvelle table
  `poi_cache_tiles` y est versionnée dans cette itération.
