# Design : cache POI local pré-rempli (Île-de-France) pour le dev

Date : 2026-08-04 · Statut : approuvé par Arnaud (session brainstorm)

Étend le design [`2026-07-15-poi-overpass-and-cache-design.md`](2026-07-15-poi-overpass-and-cache-design.md).
Objectif : permettre de développer/itérer sur `/pois` en Île-de-France sans
dépendre du projet Supabase distant (qui se met en pause hors activité,
provoquant des délais/erreurs 521 au réveil) ni consommer le quota Geoapify
(`200/day`, partagé avec `/zone` et `/housing`) à chaque session de dev.

## Contexte

`backend/poi_cache.py` (design précédent) sait déjà lire/écrire un cache de
tuiles Postgres via `DATABASE_URL` — connexion optionnelle, dégradation
gracieuse vers le fetch live si absente ou injoignable. Ce `DATABASE_URL`
pointe aujourd'hui vers le projet Supabase distant. Rien dans ce mécanisme
n'est spécifique à Supabase : n'importe quelle instance Postgres compatible
fonctionne.

Ce design n'ajoute **aucune nouvelle table, aucun nouveau format de
données, aucune nouvelle route**. Il ajoute :
1. Un service Postgres local dans `docker-compose.yml` (dev uniquement).
2. Un script one-shot qui pré-remplit ce Postgres local avec les POI
   Overpass de toute l'Île-de-France, via les fonctions existantes.

## Portée

- **Dev uniquement.** La prod continue de pointer `DATABASE_URL` vers
  Supabase, comportement inchangé. Rien dans `docker-compose.yml` n'affecte
  le déploiement prod (qui ne consomme pas ce fichier).
- **Île-de-France uniquement**, pour cette itération — bbox englobante
  approximative `1.45,48.12,3.56,49.24` (lon1,lat1,lon2,lat2). Volontairement
  un peu généreuse (déborde légèrement de la vraie frontière régionale) :
  une tuile de trop en cache ne coûte rien, alors qu'une bbox trop stricte
  risquerait de rater des tuiles en bordure.
- **Overpass uniquement pour le seed**, pas Geoapify — pas de quota
  Overpass côté nous, donc le seed peut tourner (et re-tourner) librement.
  Geoapify continue d'être appelé normalement par `/pois` pour toute requête
  qui tombe sur une tuile hors du cache pré-rempli (hors IDF, ou IDF après
  expiration du TTL 30 jours) — c'est le chemin live déjà existant, inchangé.
- **Le fallback hors-IDF ne demande aucun code nouveau** : `/pois` traite
  déjà "tuile absente du cache" comme un cache miss ordinaire et fetch en
  live. Le seed ne fait que pré-remplir des tuiles ; il ne change pas la
  logique de lecture.

## `docker-compose.yml`

Nouveau service `db` :

```yaml
db:
  image: postgres:17-alpine
  environment:
    POSTGRES_PASSWORD: postgres
  volumes:
    - poi_db_data:/var/lib/postgresql/data
    - ./supabase/migrations:/docker-entrypoint-initdb.d:ro
  ports:
    - "5432:5432"

volumes:
  poi_db_data:
```

`/docker-entrypoint-initdb.d` est un mécanisme natif de l'image officielle
`postgres` : tout `.sql` de ce dossier est exécuté automatiquement au premier
démarrage (volume de données vide). Monter `./supabase/migrations` dessus
applique `0001_poi_cache_tiles.sql` sans outillage de migration
supplémentaire — ce fichier ne contient que du SQL Postgres standard (pas
d'extension spécifique à Supabase), donc compatible tel quel avec une image
`postgres` vanilla.

Le service `backend` reçoit une variable d'environnement explicite,
prioritaire sur `.env` (précédence Compose : `environment:` > `env_file:`) :

```yaml
backend:
  build: ./backend
  env_file: .env
  environment:
    DATABASE_URL: postgresql://postgres:postgres@db:5432/postgres
  depends_on:
    - db
```

Ainsi `docker compose up --build` active le cache local par défaut pour
tout le monde, sans configuration manuelle par développeur.

## `backend/seed_idf_pois.py` (nouveau)

Script autonome, exécuté manuellement (pas dans le lifecycle de l'app) :

```
python backend/seed_idf_pois.py
```

Logique :

1. `IDF_BBOX = "1.45,48.12,3.56,49.24"` (constante).
2. `split_bbox(bbox, cols=3, rows=3) -> list[str]` — nouvelle fonction pure
   dans le script, découpe une bbox en grille régulière `cols × rows` par
   interpolation linéaire des coordonnées. Chaque cellule de la grille IDF
   fait ~330 km² — dans l'ordre de grandeur des tuiles/bbox déjà servies par
   `/pois` en usage normal (voir design précédent, "bbox d'isochrone
   typique... 100+ tuiles"), donc pas de raison qu'Overpass s'étouffe dessus
   plus qu'il ne le fait déjà en prod.
   - Pourquoi une grille calculée plutôt qu'une vraie liste de bbox par
     département : évite de coder en dur des frontières administratives
     (risque d'erreur factuelle, maintenance) pour un gain nul — le seed n'a
     besoin que de couvrir la zone, pas de respecter les limites
     départementales.
3. Pour chaque cellule de la grille :
   - `fetch_overpass_pois(client, cell_bbox)` (fonction existante, inchangée)
   - Bucket les POI retournés par tuile via `tile_for_point` (existant)
   - `upsert_tiles(pool, pois_by_tile)` (existant)
4. Connexion via `create_pool(os.environ["DATABASE_URL"])` (existant). Le
   script est un outil de dev lancé à la main : si `DATABASE_URL` est absent,
   il échoue immédiatement avec un message clair plutôt que de dégrader
   silencieusement (contrairement à `/pois`, où la dégradation gracieuse a
   du sens en prod).
5. Idempotent : `upsert_tiles` fait `ON CONFLICT (tile_x, tile_y) DO UPDATE`,
   donc relancer le script (après les 30 jours de TTL, ou après une
   interruption) est sans risque.

**Chevauchement entre cellules de la grille** : une cellule voisine peut
re-couvrir une tuile déjà écrite par la cellule précédente. `upsert_tiles`
remplace le contenu de la tuile (pas de fusion), donc la dernière cellule à
toucher une tuile "gagne" — sans conséquence pratique puisque les deux
cellules interrogent la même zone géographique et obtiennent essentiellement
le même résultat Overpass pour cette tuile. Accepté tel quel (juste un peu
de requêtage Overpass redondant en bordure de cellule, pas un bug).

**Pas de nettoyage de POI supprimés côté OSM** : comme le cache existant
(TTL 30 jours, pas d'invalidation anticipée), un POI disparu d'OSM entre deux
seeds reste en cache jusqu'à expiration. Cohérent avec le comportement déjà
accepté dans le design précédent.

## Tests

- `backend/tests/test_seed_idf_pois.py` (nouveau) : `split_bbox` — grille
  3×3 sur une bbox connue produit 9 cellules bien formées (bornes
  croissantes, pas de chevauchement de bornes, union des cellules ≥ bbox
  d'origine), cas `cols=1, rows=1` renvoie la bbox telle quelle.
- Le reste du script orchestre des appels déjà testés
  (`fetch_overpass_pois`, `tile_for_point`, `upsert_tiles`,
  `create_pool`) — pas de nouveau test d'intégration réseau/DB pour la
  fonction `main()` elle-même (glue code, pas de logique propre à vérifier).
- Suites existantes (pytest backend, Vitest frontend) restent vertes sans
  modification.

## Docs

- `README.md` : nouvelle sous-section sous « Lancer le projet » —
  « Peupler le cache POI local (Île-de-France) », avec la commande du script
  et une phrase sur le TTL 30 jours (relancer le script si besoin).
- `CHANGELOG.md` : entrée `### Added` — service Postgres local + script de
  seed IDF pour développer `/pois` sans dépendance réseau en Île-de-France.

## Hors scope (explicite)

- Couverture au-delà de l'Île-de-France (France entière, monde) — évoqué en
  brainstorm, explicitement reporté.
- Utilisation de ce cache local en production — la prod garde Supabase.
- Rafraîchissement automatique/planifié du seed (cron, CI) — relance
  manuelle uniquement pour cette itération.
- Toute donnée Geoapify dans le seed — Overpass seul, pour rester à zéro
  quota consommé par le seed.
