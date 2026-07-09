# Frontend

Next.js 16 / React 19 / TypeScript / Tailwind v4 / shadcn/ui (preset `base-nova`).

```bash
npm install
npm run dev
```

Ouvre `http://localhost:3000`. En dev, les appels `/api/*` sont proxyfiés vers
`http://backend:8000` (voir `next.config.ts`) — lance aussi le backend
(`../backend`) ou ajuste la destination du rewrite si tu testes le frontend seul.

## Structure

- `app/page.tsx` — page unique, charge `IsochroneAppClient` (wrapper client-only,
  nécessaire car Leaflet dépend de `window`).
- `components/isochrone-app.tsx` — état global de la page : lieux de travail,
  intersection, marqueurs de logement testés.
- `components/workplace-form.tsx` / `housing-form.tsx` — formulaires.
- `components/map/isochrone-map.tsx` — wrapper Leaflet (carte, couches, marqueurs).
- `lib/api.ts` — appels au backend.
- `lib/geo.ts` — calculs géométriques (Turf.js) : intersection de polygones,
  point-dans-polygone.

Voir `../PRODUCT.md` et `../DESIGN.md` pour le contexte produit et le système de
design (palette, typographie, composants) — à consulter avant toute évolution
visuelle.
