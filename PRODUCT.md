# Product

## Register

product

## Users

Des personnes (souvent en couple) qui cherchent un logement en tenant compte de deux
lieux de travail différents. Ils saisissent deux adresses de travail et une durée
max de trajet en transport en commun, obtiennent une carte de la zone atteignable
depuis les deux, puis testent des adresses de logement candidates contre cette zone.
Usage ponctuel et répété (recherche de logement étalée sur plusieurs semaines), pas
un outil du quotidien — la mémorisation des lieux de travail entre les visites compte.

## Product Purpose

Remplacer le calcul mental approximatif ("c'est à peu près à 20 min de chez moi") par
une zone de recherche fiable basée sur de vrais temps de trajet transport en commun +
marche, pour aider un couple à choisir un logement équitable pour les deux trajets
domicile-travail.

## Brand Personality

Chaleureux, rassurant, accessible. Le sujet (chercher où vivre ensemble) est personnel
et parfois stressant ; l'outil doit inspirer confiance sans être froid ou corporate.

## Anti-references

Éviter le style SaaS générique/crème (palette beige AI-cliché, cartes identiques
répétées, dégradés décoratifs, boutons interchangeables). Éviter aussi le look
dashboard analytics sombre/technique — ce n'est pas un outil pro pour experts.

Référence positive : applications carte grand public modernes (type Citymapper,
Google Maps) — la carte est l'élément central, l'UI autour reste minimale, la couleur
est réservée à ce qui porte l'information (zones, trajets), le reste est neutre.

## Design Principles

- La carte est le produit : l'UI de formulaire ne doit jamais rivaliser visuellement
  avec elle.
- Chaque couleur sur la carte porte un sens précis (lieu 1, lieu 2, zone commune,
  logement dans/hors zone) — jamais de couleur décorative.
- Rassurer sur l'incertitude : toujours confirmer l'adresse résolue par le
  géocodage, jamais laisser l'utilisateur deviner si sa saisie a été comprise.
- Réduire la friction d'un usage répété : mémoriser les lieux de travail, éviter les
  re-saisies.

## Accessibility & Inclusion

Bonnes pratiques standard : contraste WCAG AA, respect de `prefers-reduced-motion`,
focus clavier visible sur tous les éléments interactifs. Pas d'exigence
supplémentaire au-delà de ce standard.
