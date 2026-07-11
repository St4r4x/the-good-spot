# Phase suivante : affiner les points d'intérêt

Les points d'intérêt de base sont en place (8 groupes filtrables, voir
`docs/superpowers/specs/2026-07-11-poi-map-design.md`). Pistes restantes,
non décidées :

- Sous-filtre par sport précis (tennis/padel/foot) dans le groupe Sport,
  via le tag `datasource.raw.sport` déjà présent dans les réponses
  Geoapify Places (non exploité pour l'instant).
- Distance ou temps de trajet réel vers chaque POI affiché (coûterait un
  appel Routing API par POI — impact sur le budget de crédits gratuits à
  vérifier si beaucoup de POI sont affichés).
- Afficher « école la plus proche : X, à Y m » dans le popup d'un
  logement déjà testé, en plus du statut dans/hors zone actuel — à
  confirmer avec l'utilisateur, pas décidé.
