# The Good Spot

Trouve une zone de logement équitable pour un couple avec deux lieux de travail
différents, en se basant sur de vrais temps de trajet porte-à-porte (transport en
commun, marche, vélo ou voiture — pas une estimation à vol d'oiseau).

1. Renseigne les deux adresses de travail + un temps de trajet max (jusqu'à 60 min)
   + un ou plusieurs moyens de transport (transports en commun, marche, vélo,
   voiture).
2. L'app calcule l'isochrone de chaque lieu pour chaque moyen de transport coché
   (via l'Isoline API de Geoapify), les combine (union — atteignable par au moins
   un des moyens choisis), et affiche l'intersection des deux lieux sur la carte :
   c'est la zone où habiter satisfait les deux trajets.
3. Teste une adresse de logement candidate : l'app géocode l'adresse, vérifie si
   elle tombe dans la zone, et calcule le meilleur temps de trajet réel (parmi les
   moyens de transport choisis) vers chacun des deux lieux de travail.

Les deux lieux de travail, la durée et les moyens de transport choisis sont
mémorisés dans le navigateur (`localStorage`) pour ne pas avoir à les retaper à
chaque visite.

## Stack

- **Backend** : FastAPI (`backend/`), un seul rôle : appeler l'API Geoapify
  (géocodage, isoline, routing) avec la clé API côté serveur, jamais exposée au
  navigateur.
- **Frontend** : Next.js 16 / React 19 / TypeScript / Tailwind v4 / shadcn/ui
  (`frontend/`), carte Leaflet + calculs géométriques Turf.js (intersection de
  polygones, test point-dans-polygone) faits côté client.
- **Fournisseur cartographique** : [Geoapify](https://www.geoapify.com/) — plan
  gratuit (3000 crédits/jour, sans CB). Limite connue : isochrones plafonnées à
  60 min par l'API elle-même (pas une limite qu'on a mise nous-mêmes).

## Lancer le projet

```bash
cp .env.example .env
# renseigner GEOAPIFY_API_KEY dans .env (clé gratuite sur myprojects.geoapify.com)
docker compose up --build
```

Ouvrir `http://localhost:8080` — la page d'accueil présente le produit, l'app
carte est sur `/app`.

## Structure

```
.
├── backend/           FastAPI : /isochrone, /housing
├── frontend/           Next.js : formulaire + carte
├── docker-compose.yml
├── PRODUCT.md          contexte produit (register, users, brand personality)
├── DESIGN.md           système de design (couleurs, typo, composants)
└── TODO.md             prochaine phase : points d'intérêt
```

`PRODUCT.md` et `DESIGN.md` sont lus par le skill `impeccable` pour garder les
futures évolutions d'UI cohérentes avec le ton et la palette déjà choisis — à
mettre à jour si le positionnement ou le style visuel changent.

## API backend

- `GET /isochrone?address=...&minutes=1-60&mode=transit|walk|bicycle|drive` →
  géocode l'adresse, retourne l'isochrone du mode choisi en GeoJSON (`mode`
  optionnel, défaut `transit`).
- `GET /housing?address=...&work1_lat=...&work1_lon=...&work2_lat=...&work2_lon=...&mode=transit|walk|bicycle|drive`
  → géocode l'adresse candidate, retourne le temps de trajet réel (API
  Routing, même mode) vers chacun des deux points.
- `GET /pois?bbox=lon1,lat1,lon2,lat2&groups=education,sport,commerce,health,parks,catering,public_transport,culture`
  → retourne les points d'intérêt Geoapify dans le rectangle englobant,
  groupés par catégorie (`name` peut être `null`).
