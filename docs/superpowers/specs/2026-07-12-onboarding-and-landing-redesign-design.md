# Refonte du parcours d'inscription et de la page d'accueil

## Contexte

Depuis la feature "comptes obligatoires" (v1.0.0), le funnel public (landing →
`/login` → `/reset-password`) fonctionne mais reste visuellement froid et
factuel — il ne porte pas la personnalité de marque définie dans `PRODUCT.md`
("chaleureux, rassurant, accessible"). La landing viole en outre deux règles
explicites de `DESIGN.md` ("Don't répéter des cartes UI identiques comme
scaffolding par défaut") avec ses sections "Comment ça marche" et
"réassurance", toutes deux en grilles de 3 cartes icône+titre+texte
identiques.

Par ailleurs, la première connexion d'un nouveau compte atterrit directement
sur `/app` avec un panneau vide (`Welcome`) et aucun guidage : l'utilisateur
doit deviner qu'il faut remplir le formulaire "lieux de travail" avant de
pouvoir faire quoi que ce soit. Aucune information personnelle (prénom) ni
préférence (centres d'intérêt POI) n'est collectée à l'inscription, alors que
ces données existent déjà comme concepts dans le produit (POI groups) ou
seraient utiles pour personnaliser l'expérience dès le premier accès.

Ce spec couvre une refonte visuelle et fonctionnelle de tout le funnel
public + un nouveau parcours d'onboarding structuré en étapes après
inscription, qui remplace l'accueil silencieux actuel de `/app`.

## Objectif

- Faire porter à la landing et à tout le funnel d'authentification le ton
  chaleureux/rassurant défini dans `PRODUCT.md`, via une nouvelle direction
  visuelle (illustrations SVG line-art réutilisées comme fil conducteur) et
  une réécriture complète de la copy.
- Remplacer l'accueil silencieux de `/app` par un onboarding en étapes qui
  collecte prénom, lieux de travail, et centres d'intérêt — pour que `/app`
  s'ouvre déjà personnalisé et pré-rempli à la première utilisation réelle.

## Portée

**Inclus :** landing (`/`), `/login`, `/reset-password`, nouveau
`/onboarding`, le gate de premier accès à `/app` (redirection vers
`/onboarding` si profil incomplet).

**Explicitement hors scope :** la carte, le panneau (`Panel`), et les
formulaires de `/app` en usage courant (`WorkplaceForm`, `HousingForm`,
`PoiFilters`) restent visuellement inchangés — le wizard les *réutilise*
tels quels, il ne les redessine pas. Le backend FastAPI n'est pas concerné :
toutes les nouvelles données (profil, préférences POI) sont écrites
directement en Supabase depuis le frontend, comme `workplaces` aujourd'hui.

## Système d'illustration

Trois scènes SVG line-art mono-couleur (`currentColor`, hérite de
`--primary`), dessinées à la main comme composants React dans
`frontend/components/illustrations/` — pas de librairie externe, pas
d'image générée, cohérent avec la Named Rule "One Accent Rule" de
`DESIGN.md` (aucune nouvelle couleur introduite) :

- **`JourneyIllustration`** : deux points reliés par un itinéraire en
  pointillés convergeant vers une silhouette de maison. Utilisée sur la
  landing (hero) et `/login` (modes signin/signup).
- **`KeyIllustration`** : clé stylisée + porte. Utilisée sur `/reset-password`
  et le mode "mot de passe oublié" de `/login`.
- **`CompassIllustration`** : boussole / pin de carte. Utilisée sur
  `/onboarding`.

`DESIGN.md` gagne une sous-section "Illustrations" sous "5. Components"
documentant cette règle : SVG line-art mono-couleur uniquement, jamais de
dégradé ou de deuxième couleur, réutilisées comme fil visuel identifiable à
travers tout le funnel.

## Layout partagé : `AuthLayout`

Nouveau composant `frontend/components/auth-layout.tsx`, utilisé par
`/login`, `/reset-password`, et `/onboarding` :

- **Desktop (≥768px) :** grille 2 colonnes. Colonne gauche : logo/wordmark
  "The Good Spot" (lien vers `/`) + le contenu de la page (formulaire ou
  étape de wizard). Colonne droite : fond teinté `--primary` à faible
  opacité, scène illustrée centrée + une phrase de réassurance courte,
  variable selon le contexte (props `illustration` et `caption`).
- **Mobile (<768px) :** la colonne droite devient un bandeau compact en
  haut de page (scène réduite + phrase), le contenu suit en dessous. Pas de
  scroll horizontal, respecte `min-h-dvh` (déjà la convention du projet, voir
  `login/page.tsx` actuel).

## Landing page (`app/page.tsx`)

Structure Header → Hero → Récit (avec ligne de confiance intégrée) → CTA
final → Footer :

1. **Header** : inchangé structurellement (logo + CTA "Ouvrir la carte").
2. **Hero** : titre et sous-titre entièrement réécrits (carte blanche sur la
   copy, ton chaleureux/personnel plutôt que factuel). `JourneyIllustration`
   remplace le screenshot produit (`public/app-preview.webp`, retiré) comme
   visuel principal du hero.
3. **Récit** : remplace les deux blocs à cartes répétées ("Comment ça
   marche" en 3 cartes, "réassurance" en 3 items) par un bloc narratif en 2
   colonnes asymétriques (texte court racontant le scénario concret d'un
   couple à deux trajets différents + petite scène illustrée), suivi d'une
   seule ligne de confiance condensée (ex. "Vrais temps de trajet · Compte
   gratuit · Synchronisé partout" — texte final à écrire en implémentation,
   pas de nouvelle grille de cartes).
4. **CTA final** : conservé, reformulé pour ne pas répéter mot pour mot le
   CTA du hero.
5. **Footer** : inchangé.

## `/login`

Reconstruit sur `AuthLayout`. Logique fonctionnelle inchangée (signin /
signup / forgot via `supabase.auth`), mais avec ces corrections UX
concrètes, indépendantes du restyle :

- Toggle afficher/masquer mot de passe sur le champ password (tous modes).
- `autoComplete="email"` sur le champ email ; `"current-password"` en mode
  signin, `"new-password"` en mode signup.
- Séparateur "ou" explicite (texte, pas juste une bordure) avant le bouton
  "Continuer avec Google".
- Message de succès (email de confirmation envoyé) visuellement distinct de
  l'erreur : icône + couleur `--primary` au lieu de réutiliser la même
  classe neutre que l'erreur.

`caption` de l'`AuthLayout` varie par mode (signin / signup / forgot),
`illustration` bascule entre `JourneyIllustration` (signin/signup) et
`KeyIllustration` (forgot).

## `/reset-password`

Reconstruit sur `AuthLayout` avec `KeyIllustration`. Logique fonctionnelle
inchangée (détection `PASSWORD_RECOVERY`, timeout 8s + retry déjà en place
depuis le fix précédent) — uniquement le layout et la copy changent.

## Onboarding (`/onboarding`)

### Gate de premier accès

Dans `IsochroneApp` (`components/isochrone-app.tsx`), au montage, une fois la
session confirmée : si `profiles` n'a pas de ligne pour cet utilisateur OU si
`workplaces` n'a pas de ligne → `router.replace("/onboarding")` au lieu de
continuer à charger la carte. Ce remplace le mécanisme actuel `showWelcome`
(affichage du composant `Welcome` dans le panneau) : `/app` n'affiche plus
jamais d'état "vide", il redirige systématiquement un profil incomplet vers
le wizard. `components/welcome.tsx` est supprimé.

### Étapes

Composant `OnboardingWizard` (`frontend/components/onboarding-wizard.tsx`),
rendu par `app/onboarding/page.tsx` (page cliente, gated comme `/app` — si
pas de session, redirection vers `/login`). State local par étape, écriture
en base validée à la fin de chaque étape (pas seulement à la toute fin) pour
ne rien perdre si l'utilisateur abandonne en cours de route et revient plus
tard.

Indicateur de progression (1/3, 2/3, 3/3) + bouton retour visible dès
l'étape 2, cohérent avec la règle `multi-step-progress` (afficher un
indicateur d'étapes, permettre de revenir en arrière) :

1. **Prénom** — champ prénom (requis) + nom (optionnel). Validation minimale
   (non vide). Écrit dans `profiles` à la validation. Pas d'étape "skip"
   possible (nécessaire pour personnaliser l'app).
2. **Vos deux lieux de travail** — réutilise le composant `WorkplaceForm`
   existant tel quel (2 adresses, minutes, modes de transport). Écrit dans
   `workplaces` (table existante, schéma inchangé pour ces colonnes) à la
   validation. **Ne déclenche pas de géocodage/calcul de zone à ce stade** —
   comme pour un utilisateur qui revient sur `/app` avec des `workplaces`
   déjà en base aujourd'hui, seules les valeurs brutes sont stockées ; le
   calcul de zone (bouton "Calculer la zone") reste une action explicite une
   fois sur `/app`, pas automatisée dans l'onboarding. Pas de "skip" possible
   (nécessaire — `/app` sans lieux de travail n'a pas de sens).
3. **Centres d'intérêt** — réutilise le composant `PoiFilters` existant, en
   mode toujours actif (sans le `disabled` lié à l'absence de zone calculée,
   qui n'a pas de sens ici — c'est une sélection de préférence, pas un filtre
   sur des résultats déjà affichés). Bouton "Passer, je choisirai plus tard"
   visible, qui valide l'étape avec une sélection vide. Écrit dans la
   nouvelle colonne `workplaces.default_poi_groups` à la validation (ou vide
   si skip).

### Fin du wizard

Après l'étape 3 (complétée ou skippée) → `router.push("/app")`. `/app`
charge alors les données déjà en base : `WorkplaceForm` est pré-rempli via
`initialWorkplaces` (mécanisme déjà existant), et `PoiFilters` est
pré-sélectionné avec `default_poi_groups` au lieu de démarrer à vide (nouveau
comportement — `poiGroups` state dans `IsochroneApp` est initialisé depuis
cette colonne au lieu de `[]`).

### Accueil `/app` pour un profil déjà complet

Un utilisateur avec un profil déjà complet (reconnexion) n'est jamais
redirigé vers `/onboarding` — le gate ne se déclenche que si `profiles` ou
`workplaces` manque. C'est le même mécanisme que le gate `/app` → `/login`
existant, appliqué à un second niveau de complétude.

## Schéma Supabase (migration)

Nouvelle table `profiles` :

```sql
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "users manage own profile" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Nouvelle colonne sur `workplaces` (table existante) :

```sql
alter table workplaces add column default_poi_groups text[] not null default '{}';
```

*(Rattachée à `workplaces` plutôt qu'une nouvelle table : les centres
d'intérêt par défaut sont conceptuellement un réglage du même "profil de
recherche" que les adresses de travail, pas un concept métier séparé —
évite une table supplémentaire pour une seule colonne.)*

`frontend/lib/profile.ts` (nouveau, miroir de `sync.ts`) porte le type
`Profile` et les fonctions de mapping ligne Supabase ↔ type frontend.
`frontend/lib/sync.ts` gagne `default_poi_groups` dans `WorkplacesRow` et
les fonctions de mapping `workplaces` existantes.

## Fichiers touchés

**Nouveaux :**
- `frontend/components/illustrations/journey.tsx`
- `frontend/components/illustrations/key.tsx`
- `frontend/components/illustrations/compass.tsx`
- `frontend/components/auth-layout.tsx`
- `frontend/app/onboarding/page.tsx`
- `frontend/components/onboarding-wizard.tsx`
- `frontend/lib/profile.ts`
- Migration SQL (nom de fichier à trancher en implémentation selon la
  convention Supabase du projet)

**Modifiés :**
- `frontend/app/page.tsx` (landing)
- `frontend/app/login/page.tsx`
- `frontend/app/reset-password/page.tsx`
- `frontend/components/isochrone-app.tsx` (gate onboarding, suppression
  `showWelcome`/`Welcome`, initialisation `poiGroups` depuis
  `default_poi_groups`)
- `frontend/lib/sync.ts` (colonne `default_poi_groups`)
- `DESIGN.md` (sous-section Illustrations)
- `CHANGELOG.md`

**Supprimés :**
- `frontend/components/welcome.tsx`
- `frontend/public/app-preview.webp` (plus référencé)

## Tests

- Frontend : tests unitaires pour le mapping `profile.ts` (miroir des tests
  existants de `sync.ts`) ; test du gate `/app` → `/onboarding` (profil
  incomplet) et `/app` → carte normale (profil complet) ; test que
  `PoiFilters` en mode wizard n'est jamais `disabled`.
- Vérification live (navigateur) : inscription email/mdp → confirmation
  email → connexion → redirection `/onboarding` → 3 étapes (avec skip sur la
  3e à tester séparément d'un parcours complet) → `/app` pré-rempli ;
  reconnexion d'un compte déjà complet → accès direct à `/app` sans passer
  par l'onboarding.

## Hors scope

- Toute modification du backend FastAPI (aucun nouvel endpoint — lecture/
  écriture directe Supabase comme pour `workplaces`/`housing_searches`
  aujourd'hui).
- Support de plus de 2 adresses de travail ou d'un profil "utilisateur seul"
  (le produit reste conçu pour un couple à 2 lieux de travail fixes, comme
  avant ce spec).
- Édition du profil (prénom, centres d'intérêt) depuis `/app` après
  l'onboarding — seule la création initiale via le wizard est couverte ; une
  page de gestion de compte reste hors scope, à spécifier séparément si
  besoin.
- Redesign visuel de `/app` (carte, panneau, formulaires en usage courant) —
  uniquement leur réutilisation telle quelle dans le wizard.
