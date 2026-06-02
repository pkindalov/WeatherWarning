# WheatherWarning

Radar storm-alert PWA — React + TypeScript (Vite). Converted from the original
vanilla-JS app kept in [.skeleton/](.skeleton/) for reference.

## What it does

Watches the sky over your saved locations and warns you when a dangerous storm
cell is overhead or closing in: status banner, in-app alert pop, browser
notification, alarm sound, and vibration. Bulgarian (default) + English.

## Architecture

- **Map + radar — [Leaflet](https://leafletjs.com/) + [RainViewer](https://www.rainviewer.com/).**
  A free CARTO/OpenStreetMap basemap with an animated RainViewer radar overlay.
  No API key, free to use in production. The app draws its own location pin,
  alert-radius circle, and storm-cell marker on top. See
  [src/components/MapView.tsx](src/components/MapView.tsx).
- **Warning analysis — RainViewer tile sampling.** The dBZ math that powers the
  alerts (overhead value, nearest cell, trend, ETA) samples RainViewer radar
  tiles pixel-by-pixel. See [src/lib/radar.ts](src/lib/radar.ts).

Other pieces: [src/lib/core.ts](src/lib/core.ts) (geo + colour→dBZ math),
[src/lib/notify.ts](src/lib/notify.ts) (notifications/sound/vibration/SW),
[src/i18n/](src/i18n/) (translations), [src/store/](src/store/)
(localStorage-backed settings + locations).

## Setup

```bash
npm install
npm run dev
```

No API keys or environment variables are required.

## Deploying to Vercel

It's a static Vite app, so Vercel works out of the box:

- **Build command:** `npm run build`
- **Output directory:** `dist`

Vercel auto-detects Vite; just import the repo. All map/radar/geocoding
services used (RainViewer, CARTO, OpenStreetMap/Nominatim) are free and need no
keys.

## Scripts

- `npm run dev` — dev server
- `npm run build` — type-check + production build to `dist/`
- `npm run preview` — preview the production build
