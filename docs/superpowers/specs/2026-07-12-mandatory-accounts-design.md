# Comptes utilisateurs obligatoires + récupération de mot de passe

## Contexte

La feature "comptes utilisateurs optionnels" (v0.7.0) a été conçue et livrée avec
un principe explicite : l'app reste utilisable sans compte. Ce principe est
inversé par ce spec : **un compte devient obligatoire** pour utiliser l'app carte
(`/app`). En parallèle, on ajoute un flux de récupération de mot de passe oublié,
absent de la version précédente.

Ce changement casse le comportement public existant (l'usage anonyme disparaît) :
c'est un **breaking change**, versionné en conséquence (voir section Versionnage).

## Routes

- **`/`** (landing) : reste publique. Un seul CTA "Ouvrir la carte" → `/app`
  (remplace les deux boutons actuels "Se connecter" + "Ouvrir la carte").
- **`/app`** : au montage, vérifie la session Supabase (`getSession()`). Absente →
  `router.push('/login')`. Présente → charge la carte, données chargées
  exclusivement depuis Supabase (plus de mode anonyme, voir section Données).
- **`/login`** (nouvelle page) : formulaire email/mot de passe (bascule
  connexion/inscription) + bouton Google + lien "Mot de passe oublié ?". Après
  connexion réussie → redirection vers `/app`.
- **`/reset-password`** (nouvelle page) : destination du lien envoyé par email
  lors d'une demande de récupération. Supabase établit une session de
  récupération temporaire à l'arrivée sur cette URL (déclenche l'événement
  `PASSWORD_RECOVERY`) ; la page affiche un formulaire "nouveau mot de passe" →
  `updateUser({password})` → redirection vers `/app`.

### Mécanisme du gate `/app`

Gate côté client (dans `IsochroneApp`, continuité du système `authReady`
existant) : au montage, `getSession()` ; si absente, redirection immédiate vers
`/login` au lieu de continuer à charger la carte.

Alternative écartée : middleware Next.js avec vérification de session côté
serveur (plus robuste, pas de flash "Chargement…") — nécessiterait d'introduire
`@supabase/ssr` et la gestion de cookies, ce que la spec initiale (2026-07-11)
avait explicitement écarté pour rester simple. Pas de raison de revenir dessus
ici.

## Backend

- `GET /isochrone` renommé `GET /zone` (même comportement et mêmes paramètres,
  seul le nom change). `GET /housing` et `GET /pois` gardent leur nom.
- Les trois endpoints exigent désormais un JWT Supabase valide :
  `Authorization: Bearer <token>` absent, invalide, ou expiré → **401** (au lieu
  du palier anonyme 30/jour actuel).
- Rate limiting simplifié : un seul palier, **200 req/jour par `user_id`**,
  partagé entre les trois endpoints (comme dans la version précédente). Plus de
  distinction anonyme/authentifié dans `rate_limit_key`/`rate_limit_value` — le
  préfixe `user:`/`ip:` disparaît, la clé est directement le `user_id` (garanti
  présent puisque authentification obligatoire).
- Ordre d'exécution par requête : la vérification JWT (401 si absent/invalide)
  a lieu **avant** le rate limiting — `get_current_user_id` ne retourne plus
  silencieusement `None`, une dépendance FastAPI dédiée lève `HTTPException(401)`
  si le token est absent ou invalide, avant même d'atteindre le décorateur
  `@limiter.shared_limit`.

## Frontend

### Page `/login`

Réutilise la logique déjà écrite dans `AccountMenu` (bascule
connexion/inscription, bouton Google, message de confirmation après
inscription), en page pleine largeur au lieu d'un popover. Nouveau lien "Mot de
passe oublié ?" sous le formulaire, visible seulement en mode connexion.

`AccountMenu` (utilisé dans le panneau de `/app`) se simplifie : comme `/app`
n'est plus jamais accessible sans être connecté, il n'affiche plus que l'état
connecté (email + déconnexion) — tout le formulaire de connexion/inscription en
sort (il vit désormais uniquement sur `/login`).

`LandingAccountMenu` est supprimé (plus besoin, un seul CTA sur la landing
page).

### Flux de récupération de mot de passe

1. Clic sur "Mot de passe oublié ?" sur `/login` → le formulaire de connexion
   est remplacé par un champ email + bouton "Envoyer le lien".
2. Soumission → `supabase.auth.resetPasswordForEmail(email, { redirectTo:
   \`${origin}/reset-password\` })` → message "Email envoyé, vérifie ta boîte
   mail."
3. L'utilisateur clique sur le lien reçu → arrive sur `/reset-password`. Le SDK
   détecte le token de récupération dans l'URL et établit une session
   temporaire.
4. La page affiche un formulaire "Nouveau mot de passe" (+ confirmation) →
   `supabase.auth.updateUser({ password })` → succès → redirection vers `/app`.
5. Erreur (lien expiré/invalide) → message d'erreur clair avec un lien retour
   vers `/login`.

### Simplification de la couche de données

- Suppression complète du chemin anonyme dans `isochrone-app.tsx` : plus de
  `localStorage` pour les lieux de travail (`WORKPLACES_STORAGE_KEY`,
  `parseSavedWorkplaces`/`serializeWorkplaces`), plus de `hydrateFromAccount`
  conditionnel — au montage, si une session existe (elle existe toujours
  puisque `/app` est gated), on charge directement `workplaces` +
  `housing_searches` depuis Supabase comme unique source de vérité.
- Suppression du ref `lastHydratedUserId` et de sa logique anti-boucle de
  rechargement au `SIGNED_IN` : elle n'a plus lieu d'être puisqu'on ne peut plus
  arriver sur `/app` sans session déjà établie (plus de transition
  anonyme → connecté sur la même page ; connexion et inscription se font
  uniquement sur `/login`, avant d'arriver sur `/app`).
- `handleWorkplaceSubmit`/`handleHousingSubmit`/`handleRemoveHousing` : les
  branches `if (user)` deviennent inconditionnelles.
- `frontend/lib/workplaces.ts` (localStorage) et son test associé
  (`workplaces.test.ts`) deviennent probablement inutiles — à vérifier en
  implémentation si un autre usage subsiste avant suppression.

## Copie et documentation

- **Landing page** (`app/page.tsx`) : le bloc réassurance actuel ("Vos données
  restent chez vous... aucun compte requis", "Gratuit... sans inscription ni
  paiement") devient faux et doit être reformulé — mettre en avant la
  synchronisation multi-appareils et l'historique persistant à la place du
  "sans compte".
- **README.md** : la section "Pour activer les comptes utilisateurs
  (optionnel...)" devient un prérequis obligatoire pour lancer l'app, pas une
  config à part.
- **DESIGN.md** : nouvelle sous-section pour la page `/login` (mise en page
  pleine page vs popover) et `/reset-password`, cohérente avec le système de
  design existant (One Accent Rule, etc.).
- **CHANGELOG.md** : nouvelle entrée `## [1.0.0]` documentant le breaking
  change.

## Tests

- Backend : remplacer les tests de palier anonyme
  (`test_isochrone_anonymous_rate_limit`) par des tests 401 (sans token, avec
  token invalide) sur les 3 endpoints ; garder le test de limite 200/jour
  authentifié ; adapter les tests existants au renommage `/isochrone` → `/zone`.
- Frontend : tests unitaires pour le nouveau flux de reset password (mock
  Supabase) ; suppression des tests localStorage devenus obsolètes si
  `workplaces.ts` disparaît ; test du guard de redirection `/app` → `/login`.
- Vérification live (navigateur) : signup → confirmation email → connexion →
  accès `/app` ; tentative d'accès `/app` sans session → redirection `/login` ;
  flux mot de passe oublié de bout en bout (dans la limite du rate-limit email
  Supabase déjà rencontré en session précédente).

## Versionnage

**1.0.0** — premier breaking change du projet : un changement de comportement
public incompatible (l'usage anonyme disparaît) justifie un major en semver
strict, même si le projet n'est pas « publié » au sens package.

## Hors scope

- Migration de données anonymes existantes : aucune donnée serveur n'existe
  pour l'usage anonyme (tout vivait en `localStorage` côté navigateur), donc
  rien à migrer.
- Modification du fournisseur Google OAuth (toujours en attente de
  configuration manuelle côté utilisateur, indépendant de ce spec).
- Rate limiting ou quotas différenciés par plan (un seul palier 200/jour pour
  tout compte authentifié, pas de notion de tiers).
