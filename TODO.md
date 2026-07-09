# Phase suivante : points d'intérêt (écoles, sport, musique...)

## Objectif

Ajouter des critères de recherche supplémentaires, **non bloquants** — ils
enrichissent la comparaison entre logements candidats mais ne filtrent jamais la
zone commune calculée par les isochrones. Un logement hors de portée d'une école
reste affichable, avec juste l'info en moins ou une distance plus grande.

## Ce qui est déjà vérifié

Geoapify (déjà notre fournisseur pour géocodage/isoline/routing) a une **Places
API** au même endpoint family, avec le même crédit gratuit journalier :

```
GET https://api.geoapify.com/v2/places?categories=...&filter=...&apiKey=...
```

- `categories` : catégories pertinentes repérées — `education.school`,
  `education.music_school`, `sport.sports_centre`, `activity.sport_club`,
  `leisure.park`. À vérifier/étendre à l'implémentation (liste complète des
  catégories sur la doc Geoapify, elle évolue).
- `filter=geometry:<id>` : recherche directement **dans la zone déjà calculée**,
  en réutilisant l'`id` renvoyé par l'appel Isoline (`properties.id` dans la
  réponse `/isochrone` actuelle) — évite de refaire un filtre géométrique
  côté backend ou client.
- Alternative : `filter=circle:lon,lat,radiusMeters` autour d'un logement précis,
  utile pour "quelles écoles à moins de 800m de ce logement candidat".
- Tarif : "20 places = 1 crédit", donc négligeable comparé aux appels
  isoline/routing déjà en place.

## Découpage proposé

1. **Backend** : nouvel endpoint `GET /pois?geometry_id=...&categories=...`
   (ou `?lat=&lon=&radius=` pour la variante logement-précis) qui appelle
   `/v2/places` et retourne les résultats bruts (nom, catégorie, coordonnées,
   distance si dispo). Suivre le pattern existant de `backend/main.py`
   (une fonction `geocode`/`travel_time_seconds`-like par type d'appel Geoapify).
2. **Backend** : décider si l'`id` de géométrie de l'isoline doit être conservé
   en mémoire (actuellement le frontend ne garde que le GeoJSON, pas l'`id`
   Geoapify) — probablement le plus simple : renvoyer aussi `properties.id`
   dans la réponse `/isochrone` existante pour que le frontend puisse le
   repasser tel quel à `/pois`.
3. **Frontend — critères** : UI à définir (checkboxes ou multi-select) pour
   choisir quelles catégories de POI afficher : écoles, clubs de sport, écoles
   de musique, etc. Pas de blocage : cocher une catégorie ajoute des marqueurs
   sur la carte, ne retire jamais la zone rouge existante.
4. **Frontend — affichage** : nouveaux marqueurs sur la carte (icône distincte
   par catégorie, cohérente avec la palette restrained du DESIGN.md — probablement
   des icônes lucide-react déjà dans les dépendances plutôt que de nouvelles
   images). Popup avec nom + distance/temps si calculable.
5. **Frontend — logement testé** : dans le popup d'un logement déjà testé
   (`HousingMarker`), envisager d'afficher "école la plus proche : X, à Y m" en
   plus du statut dans/hors zone actuel — À CONFIRMER avec l'utilisateur, pas
   décidé.

## Points à trancher avec l'utilisateur avant de coder

- Liste exacte des catégories à supporter au lancement (écoles, clubs de sport,
  écoles de musique — d'autres ? crèches, commerces, médecins ?).
- Le critère se règle-t-il une fois pour toute la zone, ou par logement testé ?
- Faut-il une distance à vol d'oiseau (rapide, gratuit) ou un vrai temps de
  trajet (`Routing API`, plus précis mais un appel de plus par POI × par
  logement — vérifier l'impact sur le budget de crédits gratuits si beaucoup de
  logements sont testés).

## Ne pas oublier

- Mettre à jour `DESIGN.md` si de nouvelles couleurs/icônes de marqueurs sont
  introduites (actuellement : bleu-teal = accent unique, la carte porte ses
  propres couleurs fonctionnelles indépendamment de cette règle).
- Mettre à jour ce README (`README.md` à la racine) avec le nouvel endpoint une
  fois implémenté.
