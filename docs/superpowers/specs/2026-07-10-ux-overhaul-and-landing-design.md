# Design : refonte UX/UI de l'app + landing marketing

Date : 2026-07-10 · Statut : approuvé par Arnaud (session brainstorm)

Deux PRs séquentiels. Ce document couvre les deux ; le PR 2 ne démarre qu'après
merge du PR 1. Le style suit strictement `DESIGN.md` (accent unique Deep Teal,
neutres teintés froids, Figtree, flat-by-default, la carte est le produit) et
`PRODUCT.md` (ton chaleureux, anti-références SaaS crème / dashboard sombre).

---

## PR 1 — `feature/app-ux-overhaul` (version 0.4.0)

### Layout

- Suppression du header horizontal ; la carte occupe tout l'écran (`min-h-dvh`).
- Desktop (≥768 px) : panneau flottant à gauche, largeur ~380 px, ombre
  « Floating Panel » (`0 2px 12px oklch(22% 0.01 220 / 0.12)`), coins arrondis,
  scroll interne si contenu trop haut. Contenu : logo + tagline, accueil intégré
  (voir plus bas), étape 1, étape 2, liste des logements testés.
- Mobile (<768 px) : le même panneau devient un bottom-sheet fixé en bas,
  repliable/dépliable **au tap** sur une poignée (pas de gesture de drag, pas de
  lib). Déplié : `max-height ~70dvh`, scroll interne. Replié : en-tête seul
  (titre de l'app + poignée).

### Étape 1 · Vos lieux de travail

- Inputs adresse 1 / adresse 2 empilés verticalement.
- Modes de transport : chips-toggles avec icônes Lucide (transit, marche, vélo,
  voiture), multi-sélection, état sélectionné = fond teal léger + bordure teal,
  cible tactile ≥44 px. Remplace les checkboxes natives.
- Minutes : input number conservé (1–60), suffixe « min ».
- Après calcul réussi : l'adresse résolue par le géocodage s'affiche sous chaque
  champ (icône check + texte Muted Slate). Remplace la card flottante
  concaténée actuelle.
- Bouton « Calculer la zone » pleine largeur du panneau, spinner en chargement.
- Persistance `localStorage` inchangée (adresses, minutes, modes).

### Étape 2 · Tester un logement

- Désactivée avec hint explicite tant que la zone commune n'est pas calculée.
- Chaque logement testé alimente une liste dans le panneau :
  adresse résolue, badge dans/hors zone (couleur **+** icône, jamais couleur
  seule), temps vers lieu 1 et lieu 2, bouton supprimer.
- Supprimer un item retire aussi son marqueur de la carte.
- Clic sur un item : la carte recentre sur le marqueur et ouvre son popup.

### Carte

- Légende flottante (zone lieu 1 teal `#0d7373`, zone lieu 2 vert `#3f7d3f`,
  zone commune `#b3452e`, logement dans/hors zone), visible seulement quand des
  zones existent. Bas-droite sur desktop, au-dessus du sheet sur mobile.
- Popups Leaflet stylés (Figtree, coins 8 px) ; les emojis ✅/⚠️ sont remplacés
  par texte + couleur (règle no-emoji-icons).
- Erreurs : inline dans le panneau sous le formulaire concerné, `role="alert"`.
  Le Badge destructive flottant disparaît.

### Accueil intégré

- Tant qu'aucune zone n'est calculée ET que `localStorage` ne contient pas déjà
  des adresses : mini-hero en tête de panneau — titre « Trouvez où vivre à
  mi-chemin » + 3 puces (deux adresses de travail → zone atteignable par les
  deux → testez des logements candidats).
- Disparaît après le premier calcul ; jamais montré à un utilisateur récurrent.

### Polish

- Fix du câblage de la police : `layout.tsx` déclare `--font-geist-sans` mais
  `globals.css` mappe `--font-sans: var(--font-sans)` (circulaire) — Figtree
  n'est jamais appliquée. Corriger en nommant la variable next/font
  `--font-sans`.
- Transitions 150–200 ms sur hover/focus, `motion-reduce:` partout.
- `cursor-pointer` sur tout élément cliquable ; focus ring visible.
- Le bloc `.dark` de `globals.css` reste inchangé (inutilisé, hors scope).

### Tests

- Pas de nouvelle dépendance (pas de testing-library). La logique pure est
  extraite dans `lib/` et testée avec Vitest à côté de `geo.test.ts` :
  - persistance workplaces (lecture avec fallback sur valeur corrompue,
    round-trip save/read) ;
  - gestion de la liste des logements (ajout, suppression par index/id).
- Les suites existantes (Vitest frontend, pytest backend) restent vertes.

---

## PR 2 — `feature/landing-page` (version 0.5.0)

- `/` devient une landing server component, zéro JS Leaflet :
  1. nav minimale (logo + CTA « Ouvrir la carte » → `/app`) ;
  2. hero : promesse + capture d'écran réelle de la nouvelle app avec zones
     affichées (générée une fois via navigateur, stockée dans `public/`) ;
  3. « Comment ça marche » en 3 étapes ;
  4. courte réassurance (vrais temps de trajet Geoapify, données mémorisées
     dans le navigateur uniquement, gratuit) ;
  5. CTA final + footer minimal.
- L'app carte déménage sur `/app` (les composants existants bougent tels quels).
- Metadata SEO + OpenGraph sur la landing.
- Style : mêmes tokens que l'app, pattern « Product Demo » (hero + aperçu
  produit), pas de dégradé décoratif, accent teal ≤10 % de la surface.

---

## Hors scope (explicite)

- Points d'intérêt (TODO.md) — phase suivante indépendante.
- Mode sombre.
- Autocomplete d'adresses, drag du bottom-sheet, i18n.
