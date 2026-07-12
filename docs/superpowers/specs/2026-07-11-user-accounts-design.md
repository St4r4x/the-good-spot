# Design : comptes utilisateurs optionnels (sync, historique, anti-abus)

Date : 2026-07-11 · Statut : approuvé par Arnaud (session brainstorm)

Ce document couvre le premier des deux chantiers identifiés en amont d'un
déploiement en production : la gestion d'utilisateurs. Le second chantier
(audit pré-déploiement — hébergement Railway, monitoring, etc.) est traité
séparément, après celui-ci.

## Pourquoi

Trois besoins, tous couverts par la même fondation (compte + base de
données) :
1. **Synchroniser** les recherches (lieux de travail) entre appareils.
2. **Limiter l'abus** de l'API Geoapify gratuite (3000 crédits/jour partagés
   entre tous les visiteurs).
3. **Sauvegarder l'historique** des logements testés — aujourd'hui perdu au
   rechargement de la page (state client volatile, `housingMarkers` dans
   `isochrone-app.tsx`).

## Principe : compte optionnel

L'app reste utilisable sans compte, exactement comme aujourd'hui
(`localStorage`, historique perdu au rechargement). Se connecter ajoute :
- le pré-remplissage du formulaire lieux de travail depuis le compte,
- la persistance de l'historique des logements testés,
- un quota de requêtes plus généreux (voir anti-abus).

Décidé pour rester cohérent avec le ton « outil ponctuel, sans friction »
de `PRODUCT.md` — jamais de compte obligatoire pour un usage simple.

## Fournisseur : Supabase

Nouveau projet Supabase dédié créé pour ce projet (isolé des autres projets
Supabase personnels d'Arnaud) :
- **Ref** : `wgfcywjykimvxkwpgdob`
- **URL** : `https://wgfcywjykimvxkwpgdob.supabase.co`
- **Région** : `eu-west-1`
- Coût confirmé : plan gratuit, 0 $/mois.

Auth + Postgres managés, Row Level Security pour l'isolation par
utilisateur. Le frontend Next.js parle **directement** à Supabase (client
JS `@supabase/supabase-js`) pour l'auth et les données utilisateur — Supabase
expose déjà une API REST protégée par RLS, pas besoin de recoder du CRUD
dans FastAPI. FastAPI garde son rôle actuel (appels Geoapify) et gagne
uniquement la vérification du JWT Supabase, pour le rate limiting.

### Méthodes de connexion

- Email + mot de passe (géré entièrement par Supabase Auth : hashage,
  reset de mot de passe).
- Google OAuth, dès cette première version. **Dépendance externe
  manuelle** : nécessite de créer des identifiants OAuth dans Google Cloud
  Console (étape hors de portée des outils automatisés — instructions
  données à l'implémentation, client ID/secret à configurer ensuite dans
  Supabase Auth → Providers → Google). Le bouton « Continuer avec Google »
  peut être codé et déployé avant que les identifiants existent ; il ne
  fonctionnera simplement pas tant que le provider n'est pas configuré côté
  Supabase — aucun code à changer une fois les identifiants ajoutés.
  Deuxième dépendance externe manuelle liée : l'URL de redirection OAuth
  (Supabase Auth → URL Configuration → Site URL / Redirect URLs) doit
  pointer vers le domaine réel de déploiement une fois connu (chantier
  audit pré-déploiement, séparé) — en développement local,
  `http://localhost:3000` suffit et fonctionne déjà par défaut sur un
  nouveau projet Supabase.

## Schéma de données (Postgres, schéma `public`)

### `workplaces`

Une ligne par utilisateur (remplace la synchro `localStorage` quand
connecté).

| Colonne | Type | Note |
|---|---|---|
| `user_id` | `uuid` | PK, FK vers `auth.users(id)`, `on delete cascade` |
| `address1` | `text` | |
| `address2` | `text` | |
| `minutes` | `int` | |
| `modes` | `text[]` | ex. `{transit,walk}` |
| `updated_at` | `timestamptz` | `default now()`, mis à jour à chaque sauvegarde |

RLS : `select`/`insert`/`update` autorisés seulement si `user_id = auth.uid()`.
Pas de `delete` exposé (une ligne par utilisateur, écrasée par upsert).

### `housing_searches`

Plusieurs lignes par utilisateur (historique des logements testés et
sauvegardés).

| Colonne | Type | Note |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `user_id` | `uuid` | FK vers `auth.users(id)`, `on delete cascade` |
| `resolved_address` | `text` | |
| `lat` | `double precision` | |
| `lon` | `double precision` | |
| `in_zone` | `boolean` | |
| `time_to_work1_minutes` | `int` | |
| `time_to_work2_minutes` | `int` | |
| `created_at` | `timestamptz` | `default now()` |

RLS : `select`/`insert`/`delete` autorisés seulement si `user_id = auth.uid()`.

## Flux frontend

- **Chargement** : si une session Supabase existe, lire
  `workplaces` (pré-remplir le formulaire, écrasant la valeur
  `localStorage` locale) et `housing_searches` (hydrater la liste des
  logements testés, vide sinon comme aujourd'hui).
- **Sauvegarde lieux de travail** : au submit du formulaire étape 1, si
  connecté, `upsert` dans `workplaces` en plus de l'écriture
  `localStorage` existante (le `localStorage` reste utilisé pour l'état
  anonyme et comme cache instantané).
- **Logement testé** : à l'ajout d'un logement (succès de l'étape 3), si
  connecté, `insert` une ligne dans `housing_searches`. À la suppression
  (bouton existant dans `HousingList`), `delete` la ligne correspondante.
  Non connecté : comportement inchangé (perdu au rechargement).
- **UI compte** : petit contrôle (connexion / inscription / déconnexion)
  dans l'en-tête du `Panel`, à côté du titre « The Good Spot ». Formulaire
  email/mot de passe + bouton « Continuer avec Google ». Cohérent avec
  `DESIGN.md` (accent teal unique, flat-by-default, pas de nouvelle
  couleur fonctionnelle).

## Anti-abus (rate limiting backend)

- Librairie `slowapi` (standard FastAPI, pas de logique maison) sur
  `/isochrone`, `/housing`, `/pois`.
- Nouvelle dépendance FastAPI `get_current_user_id` : lit l'en-tête
  `Authorization: Bearer <jwt>` si présent, vérifie le JWT Supabase
  (`SUPABASE_JWT_SECRET`, nouvelle variable d'env backend), retourne
  l'`user_id` (`sub` du JWT) ou `None` si absent/invalide.
- Clé de limite `slowapi` : `user_id` si authentifié, sinon l'IP de la
  requête.
- Câblage frontend : `lib/api.ts` (`fetchIsochrone`, `fetchHousing`,
  `fetchPois`) ajoute l'en-tête `Authorization: Bearer <access_token>` à
  chaque appel quand une session Supabase existe (`supabase.auth.getSession()`),
  aucun en-tête sinon — FastAPI traite l'absence d'en-tête comme anonyme.
- Limites (valeurs de départ, ajustables sans changement de code — juste
  la config `slowapi`) :
  - **Anonyme** : 30 requêtes/jour (cumulées sur les 3 endpoints).
  - **Connecté** : 200 requêtes/jour.
  - But : empêcher qu'une seule IP ou qu'un seul compte épuise le quota
    Geoapify partagé (3000 crédits/jour) — pas un calcul fin du coût réel
    en crédits par requête (raffinement possible plus tard, noté en hors
    scope).
- Dépassement de la limite → `429 Too Many Requests`, message inline dans
  le panneau (même pattern d'erreur que les erreurs API existantes).

## Frontend : nouvelles dépendances

- `@supabase/supabase-js` — pas `@supabase/ssr`: aucune donnée d'auth n'est lue côté serveur (tout est en client component, comme le reste de l'app), le client navigateur seul suffit.

## Tests

- Backend (`backend/tests/test_main.py` ou nouveau fichier
  `test_auth.py`) :
  - vérification JWT : token valide → `user_id` extrait ; absent → `None` ;
    invalide/expiré → `None` (jamais d'exception qui casserait l'endpoint
    pour un anonyme).
  - rate limiting : dépasser la limite anonyme déclenche un `429` ; un
    utilisateur authentifié avec un JWT valide a une limite différente de
    l'anonyme (test avec un token de test signé avec le même secret).
- Frontend : logique pure de synchro (mapping ligne Postgres ↔ types
  `SavedWorkplaces`/`HousingMarker` existants) testée en Vitest si assez
  de logique pour le justifier ; pas de test de composant pour l'UI
  d'authentification (cohérent avec le reste du projet — aucun composant
  React n'est unit-testé ailleurs).

## Erreurs & cas limites

- Session Supabase expirée pendant l'usage : les appels Supabase directs
  échouent silencieusement en repassant en mode anonyme pour l'affichage
  (pas d'erreur bloquante) ; les appels FastAPI retombent sur la limite
  anonyme (JWT invalide → `None`).
- Échec réseau vers Supabase au chargement (lecture `workplaces`/
  `housing_searches`) : l'app démarre avec les valeurs `localStorage`/vide
  comme si non connecté, pas d'erreur bloquante affichée pour ne pas casser
  le chargement initial.
- Un compte supprimé (hors scope de build une UI de suppression de compte
  dans cette version) : `on delete cascade` sur les deux tables suffit à
  ne pas laisser de données orphelines si un compte est supprimé
  manuellement depuis le dashboard Supabase.

## Hors scope (explicite)

- Suppression de compte depuis l'UI (gérable depuis le dashboard Supabase
  en attendant).
- Réinitialisation de mot de passe dans l'UI custom (Supabase Auth le
  gère nativement via son propre flux, pas de développement supplémentaire
  nécessaire côté app pour la V1 — à revisiter si l'UX par défaut ne
  convient pas).
- Rate limiting proportionnel au coût réel en crédits Geoapify par type de
  requête (actuellement un compteur de requêtes brut, pas pondéré).
- Partage de recherche entre plusieurs comptes (ex. le couple qui cherche
  ensemble) — chaque compte reste indépendant pour l'instant.
- L'audit pré-déploiement plus large (hébergement, monitoring, pages
  légales) — chantier séparé, après celui-ci.
