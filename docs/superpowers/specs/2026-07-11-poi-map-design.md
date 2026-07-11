# Design : points d'intérêt (POI) sur la carte, avec filtre anti-surcharge

Date : 2026-07-11 · Statut : approuvé par Arnaud (session brainstorm)

Étend `TODO.md` (« prochaine phase : points d'intérêt ») avec un périmètre plus
large que prévu à l'origine (écoles/sport/musique → écoles, sport, commerces,
santé, parcs, restauration, transports, culture) et une architecture révisée
suite à un écart identifié avec l'implémentation actuelle (voir « Écart avec
TODO.md » ci-dessous).

## Périmètre

Non bloquant, comme prévu par `TODO.md` : les POI enrichissent la comparaison
mais ne filtrent jamais la zone commune calculée par les isochrones.

Les POI cochés s'affichent dans **toute la zone commune** (l'intersection
rouge) dès qu'elle existe — pas besoin de tester une adresse de logement
précise au préalable. Cette intersection est recalculée côté client (Turf.js)
à chaque nouveau calcul de zone ; les POI se rafraîchissent avec elle.

## Groupes de catégories (vérifiés en live contre l'API Geoapify)

8 groupes, chacun une chip multi-sélection dans le panneau, mappés vers des
catégories Geoapify Places confirmées fonctionnelles (aucune inventée —
chaque chaîne ci-dessous a été testée par un appel réel à `/v2/places`) :

| Groupe | Catégories Geoapify |
|---|---|
| Éducation | `education.school`, `childcare.kindergarten`, `education.music_school` |
| Sport | `sport.fitness`, `sport.pitch`, `sport.sports_centre`, `sport.horse_riding`, `activity.sport_club` |
| Commerces du quotidien | `commercial.supermarket`, `commercial.convenience`, `commercial.food_and_drink`, `commercial.marketplace` |
| Santé | `healthcare.hospital`, `healthcare.clinic_or_praxis`, `healthcare.pharmacy` |
| Parcs & nature | `leisure.park`, `leisure.playground` |
| Restauration | `catering.restaurant`, `catering.cafe`, `catering.bar` |
| Transports en commun | `public_transport` |
| Culture & loisirs | `entertainment.culture`, `entertainment.museum`, `entertainment.cinema`, `tourism.sights` |

Pour le sport en particulier : le sport précis d'un lieu (tennis, foot,
padel...) n'est pas filtrable côté serveur Geoapify — il ressort en
post-traitement via `properties.datasource.raw.sport` (tag OSM `sport=*`) sur
les catégories `sport.pitch`. Cette première version n'exploite pas encore ce
sous-tag (juste le groupe « Sport » générique) ; à affiner plus tard si
besoin (ex. sous-filtre « tennis » dans le popup).

## Écart avec TODO.md : pas de `filter=geometry:<id>`

`TODO.md` prévoyait de réutiliser l'`id` de géométrie renvoyé par l'appel
Isoline Geoapify (`filter=geometry:<id>`) pour chercher directement dans la
zone déjà calculée côté serveur Geoapify. Ça ne marche plus tel quel :
depuis, `computeUnion` (plusieurs modes de transport combinés) et
`computeIntersection` (zone commune des deux lieux) sont des calculs **Turf.js
côté client** — ce ne sont plus des géométries Geoapify avec un `id`
réutilisable dès qu'on sélectionne plus d'un mode de transport.

**Solution retenue** : le backend interroge Geoapify avec
`filter=rect:lon1,lat1,lon2,lat2` sur le rectangle englobant (bbox, via
`turf.bbox`) de la zone commune, avec un `limit=500` (max autorisé par
l'API, vérifié en live). Le frontend filtre ensuite précisément avec
`isPointInPolygon` (déjà dans `frontend/lib/geo.ts`) pour ne garder que les
POI réellement dans l'intersection, pas juste dans le rectangle englobant.

## Anti-surcharge de la carte

- Multi-sélection des 8 groupes (chips, même pattern que les modes de
  transport dans `workplace-form.tsx`).
- **Clustering Leaflet** (`leaflet.markercluster`, nouvelle dépendance) : les
  marqueurs proches se regroupent en cluster numéroté, se détaillent au zoom.
  Une icône Lucide distincte par groupe (nom exact vérifié à l'implémentation
  contre la version installée, comme fait pour les icônes de transport).

## Backend

Nouvel endpoint `GET /pois?bbox=lon1,lat1,lon2,lat2&groups=education,sport,...`
dans `backend/main.py`, même pattern que `/isochrone`/`/housing` (clé API
Geoapify côté serveur uniquement) :
- Concatène les catégories Geoapify de tous les groupes demandés en **un
  seul appel** `/v2/places` (`filter=rect:...`, `limit=500`) — pas un appel
  par groupe, pour limiter la latence et la consommation de crédits.
- Réponse : liste de POI bruts `{ lat, lon, name, group }`. Le `group` est
  déterminé en comparant `properties.categories` renvoyées par Geoapify à
  nos listes de catégories par groupe ci-dessus ; si une catégorie
  chevauche deux groupes (cas non observé en test mais possible), on garde
  le premier groupe dans l'ordre du tableau ci-dessus — simplification
  documentée, pas un cas testé en pratique.
- `name` peut être absent (beaucoup de `sport.pitch`/`sport.sports_centre`
  n'ont pas de nom sur OSM) — le frontend affiche un libellé générique par
  groupe dans ce cas : Éducation → « École », Sport → « Lieu de sport »,
  Commerces du quotidien → « Commerce », Santé → « Établissement de santé »,
  Parcs & nature → « Parc », Restauration → « Restauration », Transports en
  commun → « Arrêt de transport », Culture & loisirs → « Lieu culturel ».
- Si aucun groupe n'est coché : aucun appel `/pois` n'est déclenché, aucun
  POI ne s'affiche — pas un cas d'erreur.

## Frontend

- Nouveau composant `PoiFilters` (chips multi-sélection, même pattern que
  les modes de transport) dans le panneau, sous l'étape 1 — actif
  seulement quand la zone commune existe, désactivé sinon avec un hint
  (même pattern que `HousingForm` désactivé avant calcul).
- Logique pure extraite dans `frontend/lib/pois.ts` (testée Vitest, même
  pattern que `lib/housing.ts`) : construction du bbox, filtrage
  `isPointInPolygon`, regroupement/libellé par défaut si `name` absent.
- Nouveau composant carte (dans `frontend/components/map/`) qui affiche les
  POI filtrés via `leaflet.markercluster`, une icône Lucide par groupe.
  Appel `/pois` déclenché dès qu'un groupe est coché/décoché ou que la zone
  commune change (nouveau calcul de zone) — recalcul complet à chaque fois
  avec l'ensemble des groupes actuellement cochés (pas de cache incrémental
  par groupe ; le backend batch déjà tous les groupes en un seul appel
  Geoapify, donc pas de gain réel à optimiser ça dans cette première
  version).
- Popup au clic : nom du POI (ou libellé générique) + groupe. Pas de
  distance/temps réel dans cette première version — un temps de trajet réel
  coûterait un appel Routing par POI affiché, hors scope (cohérent avec
  l'incertitude déjà notée dans `TODO.md`).

## Erreurs & cas vides

- Si `/pois` échoue : erreur inline dans le panneau à côté des chips
  filtres (`role="alert"`, même pattern que les erreurs existantes),
  n'affecte pas la zone/logements déjà affichés sur la carte.
- Si un groupe coché ne retourne aucun POI dans la zone : pas d'erreur,
  juste rien sur la carte pour ce groupe — pas un état à signaler
  spécifiquement.

## Tests

- Backend : `backend/tests/test_main.py` — nouveau test pour `/pois` (mock
  Geoapify, vérifie la construction du `filter=rect:...`, le regroupement
  par catégorie, et la gestion de `name` absent).
- Frontend : `frontend/lib/pois.test.ts` (Vitest) pour la logique pure
  (bbox, filtrage point-dans-polygone, libellé par défaut). Pas de test de
  composant pour le rendu carte/clustering (comme le reste de la carte
  Leaflet existante).
- Suites existantes (Vitest frontend, pytest backend) doivent rester
  vertes.

## Hors scope (explicite)

- Sous-filtre par sport précis (tennis/padel/foot) dans le groupe Sport.
- Distance/temps de trajet réel vers chaque POI (Routing API par POI).
- Affichage « école la plus proche » dans le popup d'un logement testé —
  déjà noté « à confirmer » dans `TODO.md`, reste non décidé.
- Mise à jour de `DESIGN.md` avec les nouvelles icônes/couleurs de
  marqueurs POI — à faire en même temps que l'implémentation (icônes
  choisies dans la palette neutre existante, pas de nouvelle couleur
  fonctionnelle nécessaire si les icônes suffisent à distinguer les
  groupes).
