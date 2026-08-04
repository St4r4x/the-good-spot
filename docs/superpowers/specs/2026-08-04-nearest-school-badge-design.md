# Design : badge « établissement scolaire le plus proche »

Date : 2026-08-04 · Statut : approuvé par Arnaud (session brainstorm)

Une des 3 pistes listées dans `TODO.md` (« Phase suivante : affiner les points
d'intérêt ») : afficher « école la plus proche : X, à Y m » pour un logement
déjà testé, en plus du statut dans/hors zone actuel. Les deux autres pistes
du TODO (sous-filtre sport, distance/temps réel vers chaque POI) restent hors
scope de ce design — chantiers indépendants, non tranchés.

## Contexte

- Les points d'intérêt affichés (`Poi[]`, `frontend/lib/api.ts`) sont chargés
  par `isochrone-app.tsx` via `fetchPois(poiBbox(intersection), poiGroups)`,
  uniquement pour les groupes cochés dans `PoiFilters` — si « Éducation »
  n'est pas coché, aucun POI de ce groupe n'est en mémoire.
- Le groupe `education` (`POI_GROUPS["education"]`, `backend/main.py:31-35`)
  regroupe écoles, crèches et écoles de musique — le type `Poi` côté
  frontend ne porte pas de sous-catégorie, donc rien ne permet aujourd'hui de
  distinguer une école au sens strict d'une crèche.
- Un logement testé devient un `HousingMarker` (`frontend/lib/housing.ts`) :
  `lat`, `lon`, `inZone`, `resolvedAddress`, `timeToWork1Minutes`,
  `timeToWork2Minutes` — affiché à deux endroits qui répètent déjà les mêmes
  informations : le popup Leaflet du marker sur la carte
  (`frontend/components/map/isochrone-map.tsx:112-125`) et l'item de liste
  (`frontend/components/housing-list.tsx`).
- `@turf/turf` est déjà une dépendance frontend, utilisée pour la géométrie
  (`computeIntersection`, `isPointInPolygon` dans `frontend/lib/geo.ts`) —
  `turf.distance` donne une distance à vol d'oiseau, pas un temps de trajet
  réel (ça reste la piste explicitement écartée pour l'instant, coûteuse en
  appels Routing API).

## Décisions

- **Pas de fetch dédié.** Si le groupe Éducation n'est pas coché au moment
  où un logement est testé, le badge ne s'affiche simplement pas — pas
  d'appel `/pois` supplémentaire déclenché juste pour ce badge. Cohérent
  avec le fait que les POI ne sont de toute façon affichés sur la carte que
  dans ce cas.
- **Tout le groupe Éducation**, pas seulement les écoles au sens strict —
  le POI le plus proche du groupe, quel qu'il soit, avec son nom réel
  affiché. Pas de changement du contrat `/pois` (aucune sous-catégorie
  n'est ajoutée) — ce périmètre reste volontairement simple.
- **Distance à vol d'oiseau**, pas un temps de trajet réel.
- **Calcul purement côté client, à chaque rendu** — pas de nouvelle colonne
  Supabase, pas de valeur persistée dans `housing_searches` : le POI le
  plus proche peut changer si les données OSM évoluent, rien ne justifie de
  le figer au moment du test.
- **Affiché aux deux endroits** : popup carte et item de `HousingList`.

## Calcul (`frontend/lib/pois.ts`)

Nouvelle fonction, à côté de `poisInZone`/`poiLabel` (même fichier, même
responsabilité : logique POI pure, pas de composant) :

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

`point` est `[lon, lat]`, cohérent avec la convention déjà utilisée par
`isPointInPolygon` dans le même module de logique géométrique.

## Câblage (`frontend/components/isochrone-app.tsx`)

Après le calcul existant de `pois` (l'effet qui appelle `fetchPois`), dériver
un tableau parallèle à `housingMarkers`, recalculé à chaque rendu (pas de
nouvel état `useState` — dérivé de `housingMarkers`/`pois`/`poiGroups`,
qui sont déjà de l'état) :

```typescript
const nearestSchools = housingMarkers.map((h) =>
  poiGroups.includes("education") ? nearestPoi([h.lon, h.lat], pois, "education") : null
);
```

Passé en prop à `HousingList` (`nearestSchools: (NearestPoi | null)[]`,
même index que `items`) et à `IsochroneMap` (même forme, même index que
`housingMarkers`) — les deux composants restent purement présentationnels,
sans connaître la logique de dépendance au filtre Éducation.

## Affichage

Texte : « École la plus proche : *nom du POI*, à *320* m » (distance déjà
arrondie au mètre par `nearestPoi`). Si `poi.name` est `null`, retomber sur
le libellé générique déjà utilisé ailleurs (`poiLabel(poi)`,
`frontend/lib/pois.ts`) — pas de nouveau texte de repli à inventer.

- **`frontend/components/housing-list.tsx`** : nouvelle ligne conditionnelle
  après le texte des temps de trajet existant (`Lieu 1 : … min · Lieu 2 :
  … min`), même style (`text-xs text-muted-foreground`), icône
  `GraduationCap` (déjà `POI_GROUP_ICONS.education`, `frontend/lib/pois.ts`)
  — cohérent visuellement avec le reste de l'item.
- **`frontend/components/map/isochrone-map.tsx`** : une ligne `<br>`
  supplémentaire dans le popup Leaflet du marker logement
  (`bindPopup`, ligne ~121), après les deux lignes de temps de trajet
  existantes — même échappement HTML (`escapeHtml`) déjà utilisé pour les
  autres champs dynamiques du popup.

## Hors scope (explicite)

- Sous-filtre sport précis, distance/temps réel vers un POI — les deux
  autres pistes du même TODO, chantiers séparés.
- Distinguer école/crèche/école de musique (nécessiterait un changement de
  contrat `/pois`).
- Persister le POI le plus proche en base.
