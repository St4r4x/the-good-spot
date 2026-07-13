# Refonte visuelle libre de la landing page

## Contexte

La landing (`app/page.tsx`) vient d'être reconstruite (spec du
2026-07-12 : hero avec capture d'écran de l'app + logo custom, section
récit narrative à 2 colonnes remplaçant les grilles de cartes répétées,
CTA "Trouvez votre lieu"). Le résultat respecte `DESIGN.md` (One Accent
Rule, Flat-By-Default) mais reste jugé trop sage/template.

Une passe de brainstorm avec mockups filaires (fil pointillé traversant
toute la page, en écho au système d'illustration `JourneyIllustration`)
a été explorée puis explicitement rejetée : le motif ne convainc pas,
même mieux exécuté. L'utilisateur souhaite une landing "belle et
dynamique", avec une liberté visuelle qui n'a pas été accordée jusqu'ici
au reste du funnel.

## Objectif

Donner à la landing une identité visuelle plus affirmée et plus vivante,
sans la contrainte du design system restreint qui régit le reste du
funnel (`/login`, `/reset-password`, `/onboarding`, `/app`).

## Décisions

- **Conservé** : structure de sections (Header → Hero → Récit → CTA →
  Footer, pas de refonte structurelle) ; le logo (`public/logo-mark.png`,
  `app/icon.png`) et la capture d'écran de l'app
  (`public/app-preview.webp`) restent les mêmes assets, réutilisés tels
  quels — pas de nouveaux assets à générer pour cette itération.
- **Libéré** : `DESIGN.md` ne s'applique **pas** à la landing pour cette
  refonte — palette, dégradés, ombres, effets ne sont plus limités à
  "un seul accent teal, jamais de dégradé, jamais d'ombre". Le reste du
  funnel (`/login`, `/reset-password`, `/onboarding`, `/app`) reste
  inchangé et continue de suivre `DESIGN.md` normalement ; seule
  `app/page.tsx` change de régime visuel. `DESIGN.md` lui-même n'est pas
  modifié par ce spec (pas de nouvelle règle à y documenter — c'est une
  exception ponctuelle sur une seule page, pas un changement de système).
- **Dynamisme demandé** : à la fois une mise en page énergique (asymétrie,
  contrastes d'échelle typographique, agencement moins prévisible) et du
  mouvement (animations au scroll/reveals, effets de survol marqués,
  transitions) — les deux, pas l'un ou l'autre.
- **Non négociable malgré la liberté créative** : contraste WCAG AA,
  respect de `prefers-reduced-motion` sur toute animation, focus clavier
  visible sur les éléments interactifs, pas de régression de performance
  (pas d'assets lourds non optimisés, pas de librairie d'animation
  supplémentaire si le CSS/Tailwind natif suffit).

## Approche d'implémentation

Pas de mockup filaire supplémentaire au stade brainstorm — deux passes de
maquettes HTML approximatives ont été jugées "moches", ce registre de
fidélité ne rend pas justice à un objectif "beau et dynamique". La suite
se fait directement en code réel (Tailwind v4 + composants existants),
avec le skill `frontend-design` invoqué pendant l'implémentation
(conformément à la règle ajoutée au `SKILL.md` du projet : une refonte
visuelle complète invoque `frontend-design`, pas seulement
`ui-ux-pro-max`), puis itération en conditions réelles dans le
navigateur (serveur de dev + captures d'écran), pas sur des maquettes
statiques.

## Fichiers touchés

**Modifié :**
- `frontend/app/page.tsx` (landing) — seule page concernée.

**Explicitement inchangés :**
- `DESIGN.md`, `PRODUCT.md` — pas de modification.
- `frontend/app/login/page.tsx`, `frontend/app/reset-password/page.tsx`,
  `frontend/app/onboarding/page.tsx`, `frontend/components/isochrone-app.tsx`
  — tout le reste du funnel reste sur le design system existant.
- `frontend/components/auth-layout.tsx`, les illustrations
  (`journey.tsx`/`key.tsx`/`compass.tsx`) — non utilisées par la landing
  dans cette itération (le fil pointillé est abandonné), pas touchées.
- `public/logo-mark.png`, `app/icon.png`, `public/app-preview.webp` —
  assets réutilisés tels quels, pas régénérés.

## Tests

- Pas de logique nouvelle à tester unitairement (page statique de
  présentation). Vérification live navigateur : rendu desktop et mobile,
  `prefers-reduced-motion` respecté (animations désactivées quand actif),
  contraste des textes sur les nouveaux fonds/couleurs, focus clavier
  visible sur les CTA et liens.

## Hors scope

- Toute modification du reste du funnel ou de `DESIGN.md`.
- Nouveaux assets (logo, illustrations, capture d'écran) — itération
  future si besoin, pas couverte ici.
- Réécriture du contenu textuel — seulement si elle sert directement le
  nouveau parti pris visuel, pas un objectif en soi de ce spec.
