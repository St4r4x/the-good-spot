<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: The Good Spot
description: Trouvez où vivre à mi-chemin, en vrais temps de trajet transport en commun.
---

# Design System: The Good Spot

## 1. Overview

**Creative North Star: "The Shared Commute Map"**

L'interface s'efface derrière la carte. Comme Citymapper, la carte est l'objet
principal et porteur de sens ; le chrome autour (formulaires, boutons, libellés)
reste discret pour ne jamais rivaliser visuellement avec elle. Comme Airbnb, le ton
est chaleureux et rassurant — chercher un logement à deux est une décision
personnelle, pas une tâche technique. Comme Notion, la palette reste sobre : un seul
accent bleu-teal porte toute l'identité visuelle, tout le reste est neutre.

Ce système rejette explicitement le look SaaS générique/crème (palette beige
AI-cliché, cartes identiques répétées, dégradés décoratifs) et le look dashboard
analytics sombre/technique — ce n'est pas un outil pro pour experts, c'est un outil
grand public pour un couple qui cherche où vivre.

**Key Characteristics:**
- Neutres teintés (pas de crème/beige) + un accent bleu-teal unique, ≤10% de la surface
- Sans-serif humaniste unique, chaleureux et lisible
- Motion responsive : feedback sur interaction, jamais de chorégraphie
- La carte porte la couleur fonctionnelle (zones, trajets) ; le chrome reste neutre

## 2. Colors

Palette restrained : neutres légèrement teintés + un seul accent qui porte toute
l'action (boutons, liens, focus).

### Primary
- **Deep Teal** (`oklch(55% 0.09 200)` / #0d7373 approx.) : boutons primaires, liens actifs, focus ring. Utilisé sur ≤10% de la surface — c'est sa rareté qui lui donne du poids.

### Neutral
- **Warm White** (`oklch(98% 0.004 220)`) : fond principal — tinté très légèrement froid (vers le teal), jamais crème/beige.
- **Ink** (`oklch(22% 0.01 220)`) : texte principal, contraste ≥4.5:1 garanti sur Warm White.
- **Muted Slate** (`oklch(55% 0.015 220)`) : texte secondaire, libellés, placeholders — jamais un gris trop clair (placeholder doit garder 4.5:1).
- **Border Mist** (`oklch(90% 0.006 220)`) : bordures, séparateurs discrets.

### Named Rules
**The One Accent Rule.** Le Deep Teal est la seule couleur non-neutre du chrome UI. La carte a ses propres couleurs fonctionnelles (zone 1, zone 2, intersection, marqueurs) qui sont indépendantes de cette règle.

## 3. Typography

**Body Font:** [sans-serif humaniste à choisir à l'implémentation — ex. Inter, General Sans, Figtree]

**Character:** Une seule famille, chaleureuse et très lisible à toutes les tailles, sans personnalité technique ou froide.

### Hierarchy
- **Title** (600, 1.25rem–1.5rem, 1.3) : titre de section (ex. "Vos lieux de travail").
- **Body** (400, 1rem, 1.5) : texte courant, labels de formulaire.
- **Label** (500, 0.875rem, 1.4) : libellés de champs, badges de statut ("dans la zone").

[Tailles exactes et empilement de fallback à résoudre à l'implémentation.]

## 4. Elevation

Motion responsive → système globalement plat au repos. La profondeur vient de la
superposition de la carte plein écran et d'un chrome flottant léger par-dessus, pas
de fausses ombres décoratives.

### Shadow Vocabulary
- **Floating Panel** (`box-shadow: 0 2px 12px oklch(22% 0.01 220 / 0.12)`) : utilisé uniquement sur le panneau de formulaire flottant au-dessus de la carte, pour le détacher visuellement du fond de carte.

### Named Rules
**The Flat-By-Default Rule.** Rien n'a d'ombre au repos sauf le panneau flottant qui doit se distinguer de la carte en dessous. Pas d'ombre sur boutons, inputs, ou badges.

## 5. Components

[Composants à synthétiser à l'implémentation à partir des primitives ci-dessous —
seed mode ne fabrique pas de composants avant qu'il y ait du code.]

### Buttons
- **Shape:** coins doucement arrondis (8px), jamais pilule ni carré strict.
- **Primary:** fond Deep Teal, texte Warm White, padding généreux.
- **Hover / Focus:** transition douce (150-200ms) vers une teinte légèrement plus profonde ; focus ring visible (accessibilité clavier).

### Inputs / Fields
- **Style:** fond Warm White, bordure Border Mist 1px, coins 8px.
- **Focus:** bordure Deep Teal + ring léger, jamais de glow décoratif.

### POI Markers
- **Neutral Style:** fond carte inchangé, bordure légère (Border Mist), icône `muted-foreground` — jamais de couleur fonctionnelle spécifique par groupe.
- **Clustering:** cercle cluster entièrement teal — anneau externe à 30% d'opacité (`color-mix(in oklch, var(--primary) 30%, transparent)`) + cercle interne `var(--primary)` avec texte `var(--primary-foreground)` ; remplace les couleurs par défaut de leaflet.markercluster.
- **Visual Hierarchy:** distinction entre groupes POI (éducation, sport, santé, etc.) par icône uniquement, pas par couleur — la carte porte ses couleurs fonctionnelles indépendamment de The One Accent Rule.

### Account Menu
- **Connecté uniquement** : `/app` n'est jamais accessible sans compte, donc
  `AccountMenu` n'affiche que l'email (masqué sur mobile) et une icône de
  déconnexion, style discret cohérent avec la One Accent Rule.
- **Page `/login`** : formulaire email/mot de passe + bouton Google en page
  pleine largeur (plus de popover), lien « Mot de passe oublié ? » sous le
  formulaire de connexion.
- **Page `/reset-password`** : même style de formulaire centré, un seul champ
  mot de passe + confirmation.

## 6. Do's and Don'ts

### Do:
- **Do** garder la carte comme élément visuellement dominant ; le chrome UI reste discret autour.
- **Do** limiter le Deep Teal aux actions et états actifs — sa rareté est le point (The One Accent Rule).
- **Do** confirmer toujours l'adresse résolue par géocodage à l'utilisateur, jamais laisser deviner si la saisie a été comprise.
- **Do** respecter `prefers-reduced-motion` sur toutes les transitions.

### Don't:
- **Don't** utiliser une palette beige/crème AI-cliché (tokens comme "cream", "sand", "parchment").
- **Don't** répéter des cartes UI identiques (icône + titre + texte) comme scaffolding par défaut.
- **Don't** utiliser de dégradé décoratif sur texte ou boutons.
- **Don't** ajouter d'ombre lourde ou de glassmorphism décoratif sur les composants du chrome.
- **Don't** viser un look dashboard analytics sombre/technique — ce n'est pas un outil pro pour experts.
