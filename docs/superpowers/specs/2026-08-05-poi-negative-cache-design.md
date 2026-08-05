# Design : ne plus cacher 30 jours les tuiles POI dont le fetch Overpass a échoué

Date : 2026-08-05 · Statut : approuvé par Arnaud (session brainstorm)

Étend le design [`2026-07-15-poi-overpass-and-cache-design.md`](2026-07-15-poi-overpass-and-cache-design.md).

## Contexte

`backend/main.py::pois()` cache toute tuile issue d'un fetch live via
`upsert_tiles`, y compris quand le résultat est une liste vide, avec le même
TTL de 30 jours (`poi_cache.py::TILE_TTL_DAYS`) que les tuiles ayant de vrais
résultats.

`backend/overpass.py::fetch_overpass_pois` avale actuellement
`httpx.HTTPError`, `KeyError` et `ValueError` et retourne `[]` dans tous les
cas — un échec réseau/timeout/parsing est donc **indiscernable** d'une
requête qui a réellement abouti sans trouver aucun POI dans la bbox.

Incident du 2026-08-05 : une requête `/pois` sur une bbox large (isochrone
Vincennes) a subi un timeout Overpass silencieux, et Geoapify (limite `500`
partagée sur 8 catégories) a très peu couvert la zone. Résultat : 928 tuiles
mises en cache avec 0 POI, alors qu'un appel direct de
`fetch_overpass_pois` sur la même bbox retourne 1106 POI réels (177 rien
qu'en sport, vérifiés existants sur Google Maps). Une zone dense s'est
retrouvée invisible dans l'app pendant 30 jours à cause d'un seul échec
transitoire.

Geoapify, lui, échoue déjà bruyamment (`geoapify_resp.raise_for_status()` à
`main.py:318`) — toute la requête `/pois` lève avant d'atteindre
`upsert_tiles`. Le bug de negative caching ne concerne donc que le chemin
Overpass. Le manque de couverture Geoapify (limite `500` partagée) est un
problème différent, non traité ici.

## Portée

- **Uniquement la distinction "fetch Overpass a échoué" vs "fetch Overpass a
  réussi et trouvé 0 POI"**, et son effet sur le cache.
- **Hors scope** : le découpage des requêtes Overpass trop grosses (ticket
  séparé, référencé en session comme task_72f5b590). Découper les requêtes
  peut réduire la fréquence des timeouts, mais ne garantit pas leur
  disparition — ce fix reste nécessaire indépendamment. Les deux tickets
  restent volontairement séparés.
- **Aucune migration de schéma.** `poi_cache.py` (`get_cached_tiles`,
  `upsert_tiles`, `TILE_TTL_DAYS`) n'est pas modifié. La table
  `poi_cache_tiles` n'est pas modifiée.
- Le comportement existant pour une tuile légitimement vide (ex. zone rurale
  sans aucun établissement taggé) est préservé à l'identique : `[]` reste
  cachée 30 jours, comme aujourd'hui.

## Design

### 1. `backend/overpass.py` — signal explicite d'échec

`fetch_overpass_pois` change de signature :
`list[dict]` → `list[dict] | None`.

- Sur les exceptions actuellement capturées (`httpx.HTTPError`, `KeyError`,
  `ValueError`) : retourne `None` (au lieu de `[]`).
- Sur une réponse Overpass valide sans élément correspondant : retourne `[]`
  (comportement inchangé).

C'est la distinction manquante : `None` = "on ne sait pas ce qu'il y a dans
cette zone", `[]` = "on a vérifié, il n'y a rien".

### 2. `backend/main.py::pois()` — ne pas persister un batch incomplet

Après le `asyncio.gather(geoapify_task, overpass_task)` :

- `overpass_ok = overpass_pois is not None`
- si `overpass_pois is None`, traiter comme `[]` pour la suite du calcul
  (construction de `pois_by_tile`, extension de `all_pois`) — la requête en
  cours renvoie quand même à l'utilisateur ce que Geoapify a trouvé, comme
  aujourd'hui.
- `upsert_tiles(_db_pool, pois_by_tile)` n'est appelé **que si**
  `overpass_ok` est vrai. Si Overpass a échoué, les tuiles manquantes restent
  simplement non cachées et seront retentées en fetch live à la prochaine
  requête qui les touche.

Aucun nouveau TTL, aucun état "négatif de courte durée" — l'absence de cache
suffit à obtenir un retry naturel.

### Compromis assumé

Pendant une panne Overpass prolongée, chaque requête touchant les tuiles
concernées réessaie Overpass en live (pas de répit apporté par le cache)
jusqu'à ce que le service revienne. C'est strictement meilleur que le bug
actuel (30 jours de données fausses), et le découpage des requêtes
(task_72f5b590) reste la vraie réponse aux timeouts chroniques — pas ce
ticket-ci.

### Tests

- `backend/tests/test_overpass.py` : les trois tests existants
  (`test_fetch_overpass_pois_returns_empty_list_on_timeout`,
  `..._on_http_error`, `..._on_invalid_json`) assertent aujourd'hui
  `result == []` — à mettre à jour pour `result is None`, et les renommer en
  conséquence (`..._returns_none_on_timeout`, etc.). Le test
  `test_fetch_overpass_pois_maps_tags_to_groups` (cas de succès) est
  inchangé.
- `backend/tests/test_main.py` (ou équivalent existant pour `/pois`) :
  nouveau cas où `fetch_overpass_pois` échoue (mock `respx` en erreur) —
  vérifier que la réponse contient toujours les POI Geoapify, et qu'aucune
  tuile de la bbox manquante ne se retrouve dans `poi_cache_tiles` après
  l'appel (i.e. `upsert_tiles`/le pool n'a pas été sollicité pour ces
  tuiles).
