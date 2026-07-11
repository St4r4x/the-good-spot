# Landing Page Implementation Plan (PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Plan
> volontairement compact : aucune logique nouvelle (markup server component,
> déplacement de route, un asset image). Le spec
> `docs/superpowers/specs/2026-07-10-ux-overhaul-and-landing-design.md` (§PR 2)
> fait référence.

**Goal:** `/` devient une landing marketing server component ; l'app carte
déménage sur `/app`. Version 0.5.0.

**Global constraints:** tokens existants (`globals.css`), Deep Teal ≤10 % de la
surface, pas de dégradé décoratif, pas d'emoji-icône (Lucide), `motion-reduce:`,
zéro JS Leaflet sur la landing, aucune nouvelle dépendance.

### Task 1: Déplacer l'app sur /app

- Créer `frontend/app/app/page.tsx` = contenu actuel de `app/page.tsx` +
  `export const metadata` propre (title « The Good Spot — carte »).
- `frontend/app/page.tsx` : placeholder temporaire (remplacé Task 3).
- Vérifier `npm run build` (routes `/` et `/app`).

### Task 2: Capture d'écran réelle de l'app

- Temporairement (non committé) : pointer le rewrite `next.config.ts` vers le
  backend local pour rendre les calculs fonctionnels en dev.
- Piloter l'app dans le navigateur : deux adresses réelles (Paris), calcul de
  zone, screenshot viewport desktop → `frontend/public/app-preview.png`.
- Restaurer `next.config.ts`.

### Task 3: Landing page

`frontend/app/page.tsx` (server component, pas de "use client") :
1. nav : wordmark + CTA `Link` « Ouvrir la carte » → `/app` ;
2. hero : h1 promesse + sous-titre + CTA primaire + `next/image` de
   `app-preview.png` (bordure/ombre `shadow-floating`) ;
3. « Comment ça marche » : 3 étapes (icônes Lucide MapPin / Landmark ou
   équivalents, texte court) ;
4. réassurance : vrais temps de trajet (Geoapify), données mémorisées dans le
   navigateur uniquement, gratuit ;
5. CTA final + footer minimal (lien GitHub).
Metadata : title/description + openGraph (title, description, image
`/app-preview.png`).

### Task 4: Docs, changelog, vérifications, PR

- `README.md` : `/` = landing, app sur `/app`.
- `CHANGELOG.md` : section `## [0.5.0] - 2026-07-10`.
- `npm run test && npm run lint && npm run build` + pytest backend.
- /simplify + /security-review sur le diff, PR → main, CI verte, tag v0.5.0.
