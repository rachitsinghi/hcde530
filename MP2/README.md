# Twinkle — Draw Your Own Constellation

**Live site:** https://twinkle.ltd  
**Repo:** github.com/rachitsinghi/hcde530/MP2

No install required to try it — open the live site in any browser. The sections below explain what Twinkle is, who it is for, and how to use or run it.

---

## Who is this for?

Twinkle is for anyone curious about the night sky who wants to **invent their own constellation** and see it mapped onto real stars — not just read about astronomy.

- **Hobby stargazers** who have imagined patterns between the stars and want to draw one interactively
- **Artists and makers** looking for a creative, visual tool grounded in real astronomical data
- **Students and educators** exploring how data visualization can feel immersive rather than like a spreadsheet
- **Developers** who want to clone the repo, run it locally, or study how a star catalog powers a web app

You do not need any background in coding or astronomy to use the live site. Developer setup is optional and documented under [Running locally](#running-locally).

---

## What is Twinkle?

Twinkle is an immersive, interactive star map that lets anyone invent their own constellation and see it mapped onto real stars in the night sky.

The star map renders 8,834 real naked-eye visible stars from the HYG v4.2 astronomical catalog, each one sized by its apparent magnitude and colored by its B-V color index — so Betelgeuse appears orange-red and Rigel appears blue-white, exactly as they look in the real sky. Star size uses non-linear scaling on `mag` so bright stars dominate the field the way the human eye perceives them; color follows discrete B-V bands from hot blue through white, yellow, and red. The experience is designed to feel immersive and cinematic, not like a data dashboard.

Toggling to 3D reveals something the flat map hides: constellation lines connect stars at wildly different real distances (in parsecs), so patterns stretch and distort when you rotate the view — a reminder that the shapes we name in the sky are stories we impose on stars that are not actually neighbors in space.

---

## What can you do with it?

- **Draw your own constellation** using a dot-grid sketch pad with straight-line segments
- **Type a description** like "cat face" or "crown" and search the Iconify API (275,000+ icons) for a matching shape, which gets drawn on the pad for you
- **Draw with your finger** using your laptop camera — MediaPipe hand tracking detects your index fingertip and traces your movement onto the sketch pad in real time, with a calibration step that adjusts to your hand distance from the camera
- **Map to real stars** — click MAP TO STARS and each vertex of your drawing snaps to the nearest real catalog star, with brighter stars preferred in tie situations
- **Name your constellation** — describe it in plain text and a Groq-powered AI generates a unique mythological-sounding name
- **View in 2D and 3D** — toggle between a flat sky projection and a true three-dimensional Cartesian view using real distance data from the catalog
- **Download as PNG** — save your constellation as a high resolution image
- **View in AR (mobile only)** — on a touch device, point your phone at the night sky and your constellation overlays on the live camera feed using device orientation and compass heading (directionally approximate without GPS)

---

## How to use it

1. Visit **https://twinkle.ltd** on any device
2. The star map loads automatically — scroll to zoom, drag to pan
3. Choose how to create your constellation:
   - Type a shape description in the IMAGINE box and click IMAGINE to fetch a matching icon from Iconify, or
   - Click on the sketch pad to place vertices manually and connect them with straight lines, or
   - Click DRAW WITH FINGER to open your camera and draw by moving your index finger
4. Click **MAP TO STARS** — your shape snaps to the nearest real stars on the map and the constellation appears as a glowing overlay
5. Type a description of your constellation and click **GET NAME** for an AI-generated name
6. Click **DOWNLOAD PNG** to save your creation
7. On mobile, tap **VIEW IN AR** to see your constellation overlaid on the real night sky through your rear camera (disabled on desktop)

---

## How to install it as an app (mobile)

Twinkle is a Progressive Web App — you can install it on your phone home screen and it works like a native app:

**iPhone:**
1. Open https://twinkle.ltd in Safari
2. Tap the Share button at the bottom
3. Tap "Add to Home Screen"
4. Tap Add

**Android:**
1. Open https://twinkle.ltd in Chrome
2. Tap the three dots menu
3. Tap "Add to Home Screen" or "Install App"

---

## Running locally

Use this if you want to run Twinkle on your own machine instead of the live site.

### Web app

```bash
cd MP2
npm install          # or: bun install
npm run dev          # starts Vite dev server
```

Open the URL printed in your terminal — typically **http://localhost:5173**.

Set `GROQ_API_KEY` in your environment for the **GET NAME** feature. The star map, drawing tools, and MAP TO STARS all work without it.

```bash
npm run build        # production build
npm run preview      # preview production build (URL printed in terminal)
```

### Regenerating the star data

The app reads `public/stars_visible.csv`. To rebuild that file from the raw HYG catalog, run the preprocessing script in the parent repository:

```bash
# From the hcde530 repo root
pip install pandas numpy
python3 "Week 8/prepare_stars.py"
```

Copy the output (`Week 8/stars_visible.csv`) into `MP2/public/`.

### Data notebook

`mp2_notebook.ipynb` explores the star catalog with pandas and matplotlib. Run it from the `MP2/` directory with pandas and matplotlib installed.

---

## Data source

**HYG v4.2 Star Catalog** — a composite of three professional astronomy catalogs:
- Hipparcos (ESA satellite astrometry mission)
- Yale Bright Star Catalog
- Gliese-Jahreiß Nearby Star Catalog

Source: [astronexus.com/hyg](https://astronexus.com/hyg)

Twinkle uses stars brighter than apparent magnitude 6.5 (the human naked-eye limit) with valid distance measurements. The filtered dataset in `public/stars_visible.csv` contains 8,834 stars with twelve fields: `id`, `ra_deg`, `dec`, `mag`, `ci`, `spect`, `lum`, `proper`, `dist`, `x`, `y`, `z`. Right ascension is stored in degrees; Cartesian `x/y/z` coordinates are precomputed in parsecs for the 3D view. About 392 stars carry a proper name (e.g. Sirius, Betelgeuse, Rigel).

---

## For developers

### Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Start, Vite 7, HTML5 Canvas, Three.js |
| UI | Tailwind CSS 4, shadcn/ui (Roboto Mono) |
| Hand tracking | Google MediaPipe Hand Landmarker (CDN) |
| Star rendering | HTML5 Canvas (2D), Three.js (3D) |
| CSV loading | PapaParse |
| Icon shapes | Iconify API (275,000+ icons) |
| AI naming | Groq API (`llama-3.1-8b-instant`) via TanStack Start server route |
| Hosting | Lovable, Cloudflare Workers, custom domain (twinkle.ltd) |
| Data prep | Python (`Week 8/prepare_stars.py` in parent repo) |

### Key source files

| File | Role |
|---|---|
| `src/components/StarMap.tsx` | 2D Canvas rendering, CSV load, snap-to-star logic |
| `src/components/StarMap3D.tsx` | Three.js 3D view with real parsecs |
| `src/components/SketchHUD.tsx` | Sketch pad, IMAGINE, finger drawing, naming UI |
| `src/components/ARSkyView.tsx` | Mobile AR overlay (compass + rear camera) |
| `src/routes/api/name-constellation.ts` | Groq naming API — key stays server-side |
| `public/stars_visible.csv` | Filtered HYG data served as a static asset |
| `wrangler.jsonc` | Cloudflare Workers deployment config |

### Repository structure

```
MP2/
├── public/
│   ├── stars_visible.csv
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   ├── components/
│   └── routes/
│       ├── index.tsx
│       └── api/name-constellation.ts
├── wrangler.jsonc
├── vite.config.ts
├── package.json
└── mp2_notebook.ipynb
```

---

## Course context

Twinkle was built as Mini Project 2 for **HCDE 530** at the University of Washington. It extends an earlier star-catalog analysis (MP1) that used K-Means clustering on the same HYG dataset to explore whether user-defined shapes could map meaningfully onto real stars — the question that became Twinkle's core feature.

Other files in this folder for course submission: `mp2.md` (competency claims), `reflection.md` (project reflection), and `mp2_notebook.ipynb` (data exploration).
