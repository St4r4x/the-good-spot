# Changelog

Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage [semver](https://semver.org/lang/fr/).

## [Unreleased]

### Added
- Pipeline de contribution : tests (pytest, Vitest), CI GitHub Actions,
  skill Claude Code `new-feature`, `CONTRIBUTING.md`.

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
