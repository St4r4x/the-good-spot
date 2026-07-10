# Changelog

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [semver](https://semver.org/lang/fr/).

## [Unreleased]

## [0.5.0] - 2026-07-10

### Added
- Page d'accueil marketing sur `/` : hero avec capture réelle de l'app,
  « Comment ça marche » en 3 étapes, réassurance (vrais temps de trajet,
  données locales au navigateur, gratuit), CTA vers la carte, metadata
  SEO/OpenGraph.

### Changed
- L'app carte est déplacée de `/` vers `/app`.

## [0.4.0] - 2026-07-10

### Added
- Panneau latéral flottant (bottom-sheet repliable sur mobile) regroupant les
  deux étapes : lieux de travail puis test de logement.
- Liste des logements testés dans le panneau : statut dans/hors zone, temps
  vers chaque lieu, suppression, recentrage de la carte au clic.
- Légende des zones sur la carte.
- État d'accueil à la première visite expliquant le fonctionnement en 3 étapes.

### Changed
- Modes de transport en boutons-toggles avec icônes (au lieu de checkboxes).
- Adresses résolues affichées sous chaque champ ; erreurs affichées inline
  dans le panneau.
- Popups de la carte stylés, sans emoji.

### Fixed
- La police Figtree est maintenant réellement appliquée (variable CSS
  `--font-sans` jamais branchée).
- Le contenu des popups Leaflet est échappé (adresse résolue externe).

## [0.3.0] - 2026-07-10

### Added
- Job CI `secrets` (gitleaks) qui bloque le merge si un secret est détecté
  dans le diff.
- Règle de bump semver explicite (major/minor/patch) dans le skill
  `new-feature` et `CONTRIBUTING.md`, pour ne plus laisser le choix de
  version à l'interprétation.

## [0.2.1] - 2026-07-10

### Changed
- Le skill `new-feature` et `CONTRIBUTING.md` décident maintenant la version
  et écrivent l'entrée `CHANGELOG.md` finale dans la PR de la feature
  elle-même, avant merge — plus de PR séparée de bump changelog après coup.

## [0.2.0] - 2026-07-10

### Added
- Pipeline de contribution : tests (pytest, Vitest), CI GitHub Actions,
  skill Claude Code `new-feature`, `CONTRIBUTING.md`.
- Protection de la branche `main` : merge bloqué si la CI n'est pas verte.

## [0.1.0] - 2026-07-10

### Added
- Calcul de zone commune de logement à partir de deux lieux de travail
  (isochrone + intersection).
- Test d'une adresse de logement candidate contre la zone commune.
- Choix multiple de moyens de transport (transports en commun, marche, vélo,
  voiture), combinés par union des isochrones.
- Mémorisation des lieux de travail et modes choisis en `localStorage`.

### Changed
- Renommage du projet en « The Good Spot ».
