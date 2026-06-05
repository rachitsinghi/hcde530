# MP2 Competency Claims — Twinkle

**Live site:** https://twinkle.ltd
**Repo:** github.com/rachitsinghi/hcde530/MP2

---

## C6 — Data Visualization

### What it means

Data visualization is the skill of encoding real measurements as visual properties so a viewer understands something true about the data — without needing to read a legend or know the domain first. It is not decoration; it is choosing scales, colors, and projections that match both the data and how humans actually perceive it.

### What counts as evidence

- `public/stars_visible.csv` — 8,834 HYG stars, twelve fields, loaded in the browser
- `src/components/StarMap.tsx` — Canvas 2D rendering, `mag` size formula, `ci` color bands, glow effect
- `src/components/StarMap3D.tsx` — Three.js 3D view using precomputed `x/y/z` in parsecs
- `package.json` — PapaParse 5.5.3, Three.js 0.184.0
- `Week 8/prepare_stars.py` — RA conversion, Cartesian coordinate preprocessing
- `mp2_notebook.ipynb` — magnitude, color-index, and distance distributions explored in pandas
- Live result at https://twinkle.ltd — Betelgeuse orange-red, Rigel blue-white, 3D line distortion on rotation

### Strong vs. weak claim

**Weak:** "I visualized 8,834 stars using React and Three.js."

**Strong:** Naming the exact visual encodings (`mag` → non-linear `Math.max(1, Math.pow(6.5 - mag, 1.5) * 2.5)`; `ci` → discrete hex bands), the files where they live, why Canvas was chosen over SVG for 8,834 glow objects, and what the 2D-to-3D toggle reveals about constellation distance — with a specific MP1 finding (Felis anchor stars 49–411 parsecs apart) made interactive.

### My claim

Twinkle is fundamentally a data visualization project. Every star on screen is a data point from the HYG v4.2 catalog, and every visual property of that star encodes a real physical measurement. This is not decorative rendering — it is direct visual encoding of astronomical data.

The star rendering pipeline works as follows. The app loads `stars_visible.csv` using PapaParse (version 5.5.3, visible in `package.json`) — a streaming CSV parser that handles the 8,834 row file efficiently in the browser without blocking the UI. Each row contains twelve fields from the HYG catalog. Two of those fields drive the entire visual representation:

The `mag` field (apparent magnitude) controls star size. The formula used is `Math.max(1, Math.pow(6.5 - mag, 1.5) * 2.5)` — a non-linear power scaling that makes the brightest stars dramatically larger than dim ones, matching how the human eye actually perceives brightness differences in the night sky. Sirius at magnitude -1.46 renders visually much larger than a star at magnitude 5.0, which is exactly how it looks from Earth.

The `ci` field (B-V color index) controls star color. B-V is a standard astronomical measurement of stellar temperature — negative values indicate hot blue stars, values around zero indicate white stars, and values above 1.0 indicate cool red stars. The mapping used is:

- ci below -0.2 renders as #9bb0ff (hot blue, O-type stars)
- ci 0.0 to 0.3 renders as #cad7ff (white, A-type stars)
- ci 0.6 to 1.0 renders as #fff4ea (yellow, G-type like the Sun)
- ci above 1.5 renders as #ffad60 (red, M-type stars)

This means Betelgeuse (ci around 1.85) appears distinctly orange-red and Rigel (ci around -0.03) appears blue-white, exactly as they look in the real sky. A user who has never heard of color index experiences the correct astrophysical reality without knowing the underlying measurement.

The 3D view uses Three.js (version 0.184.0, in `package.json`) with `THREE.SphereGeometry` for each star, positioned using the precomputed `x`, `y`, `z` Cartesian coordinates from the catalog. These coordinates are in parsecs and were computed during preprocessing using standard spherical to Cartesian conversion: `x = dist * cos(dec_rad) * cos(ra_rad)`. The 3D view is not a stylistic choice — it reveals something real and important about constellations that the 2D view hides. Stars that appear connected in the 2D sky map sit at wildly different real distances in 3D space, which is why the constellation lines stretch and distort when you rotate the 3D view. That finding was first documented in MP1 with the Felis cat constellation (anchor stars at 49 to 411 parsecs apart) and Twinkle makes it interactive and experiential for any user.

The visualization choice of using HTML5 Canvas for 2D and Three.js for 3D was deliberate. Canvas gives direct pixel-level control for the 2D star field — I could apply the glow effect (drawing each bright star twice, once at full opacity and once at 2.5x the radius at 15% opacity) in a way that a CSS or SVG approach would not support at this rendering speed with 8,834 objects. Three.js gave OrbitControls for the 3D rotation interaction without having to implement quaternion math manually.

The deepest insight from building Twinkle's visual layer is that good data visualization does not explain itself — it makes the right thing feel obvious before the viewer knows why. Encoding magnitude with non-linear scaling and color index with discrete temperature bands was not about showing off the HYG catalog; it was about respecting how humans actually perceive the night sky. The 2D-to-3D toggle taught me something sharper: every projection is a lie of convenience, and the most honest visualization is sometimes the one that breaks the illusion on purpose. When constellation lines stretch apart in 3D, users do not need to understand parsecs to grasp that the patterns we name in the sky are stories we impose on depthless dots — and that is a visualization insight no chart title could deliver.

---

## C7 — Critical Evaluation and Professional Judgment

### What it means

Critical evaluation is the skill of catching when a tool, dataset, or AI output looks correct but is substantively wrong — and making a concrete judgment about whether to ship it, replace it, or redesign it. Professional judgment means knowing what question you are actually trying to answer before accepting an answer.

### What counts as evidence

- `src/components/SketchHUD.tsx` — IMAGINE via Iconify SVG path parsing; MediaPipe finger drawing with palm-size calibration
- `src/routes/api/name-constellation.ts` — Groq used only for naming (not geometry)
- `wrangler.jsonc` — Cloudflare Workers config used during Quick Draw edge-function workaround
- Documented iteration path: LLM coordinate generation → Quick Draw + CORS → Iconify
- Specific thresholds and results: 15px → 35px → `adjusted_threshold = 55 * (calibrated_palm_size / 80)`; Quick Draw latency 2–8s vs Iconify under 500ms
- The exact failed Groq prompt for coordinate generation (quoted in Moment 1 below)

### Strong vs. weak claim

**Weak:** "I evaluated AI output and fixed bugs before submitting."

**Strong:** Naming three specific failures (coordinate hallucination, CORS + unreliable latency, twitchy fixed pixel threshold), the exact prompt or URL involved, the architectural decision each one produced, and the measurable result that justified the switch (e.g. Iconify under 500ms vs Quick Draw 2–8 seconds).

### My claim

This project involved more moments of catching and correcting AI output than any other assignment so far. Three are worth documenting specifically because each one changed the architecture of a core feature.

**Moment 1: The coordinate generation failure.**
The original plan for the IMAGINE feature was to send a text description like "cat face" to the Groq API and ask it to return a JSON array of x,y coordinates tracing that shape. The prompt used was: Return ONLY a JSON array of 8 to 12 coordinate pairs, each being [x, y] values between 0.05 and 0.95, that trace the outline of a cat face as a simple connected polyline.
The output was random lines with no resemblance to a cat. A second attempt added few-shot examples of known shapes (triangle, arrow, crown) as reference in the prompt, which improved results slightly but still failed for anything beyond the exact shapes shown. The root cause was clear once identified: large language models are trained on text, not geometry. They have no reliable spatial reasoning about coordinate systems. Asking a language model to generate coordinates is like asking a cartographer to write a novel — the tool is wrong for the job.

The fix was to stop asking the AI to do geometry and instead use it only for text matching, which it is genuinely good at. The Iconify API (iconify.design) provides 275,000 SVG icons searchable by keyword. When a user types "cat face," Groq's only job is to generate a good search query for Iconify. Iconify returns a real SVG path. The app then parses the SVG `d` attribute, extracts all M (moveto) and L (lineto) commands which represent straight lines, ignores curves entirely, normalises the coordinates from the SVG viewBox to 0.05-0.95 space, and plots them as vertices. The result looks like a recognisable icon shape every time because it is a real professionally designed icon, not a hallucinated coordinate array. In the shipped version in `SketchHUD.tsx`, the user's description is passed directly to `api.iconify.design/search` — Groq is reserved for constellation naming via `/api/name-constellation`, not shape search.

**Moment 2: The Quick Draw CORS failure.**
Before landing on Iconify, one approach tried was Google's Quick Draw dataset — 50 million human-drawn sketches in 345 categories stored as ndjson files at `storage.googleapis.com/quickdraw_dataset/full/simplified/`. The plan was to fetch the first line of the relevant category file at runtime (each line is one complete drawing), parse the stroke data, and plot it. This would have given real human-drawn shapes rather than generated coordinates.

The fetch failed with a CORS error in the browser. Google's Cloud Storage bucket does not include the `Access-Control-Allow-Origin` header that browsers require for cross-origin requests. The next step was to route the fetch through a Lovable edge function (a serverless function running on Cloudflare Workers, visible in `wrangler.jsonc` which specifies `"compatibility_flags": ["nodejs_compat"]`). The edge function fetched the ndjson URL server-side where CORS restrictions do not apply, read only the first line using a streaming reader, parsed the stroke data, and returned the normalised coordinates to the client.

This worked in testing but proved unreliable in production. The ndjson files range from 50MB to 300MB and even reading just the first newline character requires the server to receive the beginning of a very large HTTP response before it can close the connection. Latency was inconsistent (2 to 8 seconds) and some category files returned errors. The evaluation here was: even when a technical approach works, it needs to work reliably enough for a user-facing feature. Inconsistent latency on a creative tool breaks the experience. Iconify was faster (under 500ms), more reliable, and did not require the edge function overhead for this particular task.

**Moment 3: The finger tracking sensitivity calibration.**
The MediaPipe hand tracking feature initially placed a new vertex on every tiny hand tremor. The first threshold was 15px minimum movement before placing a vertex. That was too sensitive. Increasing it to 35px helped but was still twitchy. The problem was that the threshold needed to be relative to the user's hand size and distance from the camera, not an absolute pixel value. A hand held close to the camera occupies more pixels than a hand held far away, so the same physical movement produces different pixel displacements.

The solution was a calibration step. When the camera opens, the app samples MediaPipe's landmark positions for 3 seconds, measuring the pixel distance between landmark 0 (wrist) and landmark 9 (middle finger base) — the palm size proxy. The threshold then scales proportionally: `adjusted_threshold = 55 * (calibrated_palm_size / 80)` where 80px is the assumed baseline palm size at a comfortable drawing distance. A user holding their hand close (larger palm size in pixels) gets a higher threshold so small tremors are ignored. A user with their hand further away (smaller palm size) gets a lower threshold so their deliberately larger movements still register. The key insight was that the AI tool produced a working feature but evaluating it against actual use revealed a calibration problem that required understanding the underlying technology (landmark-based hand detection) well enough to design an adaptive threshold, not just pick a better fixed number.

Across all three moments, the recurring lesson was that professional judgment is not skepticism for its own sake — it is knowing what question you are actually trying to answer before you accept an answer. The coordinate generation failure taught me to separate what AI is good at (language, retrieval, query formulation) from what it merely sounds confident about (geometry, spatial reasoning). The Quick Draw detour taught me that a demo that works once is not a product; reliability and latency are part of the design, not afterthoughts. The finger-tracking calibration taught me that AI-generated code can get you to eighty percent, but the last twenty percent requires sitting with the real-world variability — different bodies, distances, tremors — that no prompt can anticipate. Critical evaluation, I came to understand, is less about catching mistakes and more about developing the instinct to ask: is this the right tool, is this fast enough, and does this actually feel right when a human uses it?

---

## C8 — Building and Deploying a Complete Tool

### What it means

Building and deploying a complete tool means shipping something a real user can access end to end — not a prototype with broken steps. It includes architecture decisions, scope cuts, data pipelines, API security, and knowing where the seams are in what you shipped.

### What counts as evidence

- Live deployment: https://twinkle.ltd (custom domain, public access)
- Full user flow: draw → MAP TO STARS → GET NAME → DOWNLOAD PNG → VIEW IN AR (mobile)
- `package.json` — React 19, TanStack Start, Vite 7
- `vite.config.ts` — plugin constraint comment (duplicate plugins break the build)
- `src/routes/api/name-constellation.ts` + `wrangler.jsonc` — Groq API key server-side on Cloudflare Workers
- `components.json`, `tsconfig.json`, `bunfig.toml` — shadcn/ui, strict TypeScript, 24h npm release-age guard
- `Week 8/prepare_stars.py` → `public/stars_visible.csv` — independent Python data pipeline
- `public/manifest.webmanifest`, `public/sw.js` — PWA install support
- Scope decision: Supabase constellation persistence cut from MP2a plan
- Known seam documented: AR view approximate without GPS (`ARSkyView.tsx`, `deviceorientationabsolute`)

### Strong vs. weak claim

**Weak:** "I deployed my project to a website and it works."

**Strong:** Naming the live URL, every step of the working user journey, specific files that implement each layer (preprocessing script, static CSV, server route for API key, Workers config), one scope cut with reasoning (Supabase removed), and one honest limitation you would fix next (AR needs geolocation for astronomical accuracy).

### My claim

Twinkle is deployed at https://twinkle.ltd on a custom domain and is accessible to anyone with a browser. The full user flow works end to end: choose an input method, create a shape, map it to real stars, get an AI-generated name, download a PNG, and on mobile view the constellation overlaid on the real night sky through the rear camera.

The architecture is worth describing because several decisions were made for specific reasons rather than defaults.

The frontend runs on React 19 with TanStack Start (visible in `package.json` as `@tanstack/react-start: ^1.167.50`). TanStack Start is a full-stack React framework that supports server-side rendering and Cloudflare Workers deployment. The build system uses Vite 7 with the `@lovable.dev/vite-tanstack-config` plugin, which the `vite.config.ts` file is careful not to duplicate — the comment at the top explicitly lists which plugins are already included by that config (tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare) and warns that adding them manually would break the build. That comment is a real constraint I had to understand to avoid breaking the app when requesting customisations.

The Groq API calls for constellation naming run through a Cloudflare Workers edge function rather than directly from the browser. This is required for two reasons: the API key cannot be exposed in client-side code (it would be visible in browser developer tools), and Cloudflare's edge network runs the function close to the user geographically which reduces latency. The `wrangler.jsonc` file configures the Cloudflare Workers deployment with `"compatibility_flags": ["nodejs_compat"]` which enables Node.js APIs inside the Worker environment, necessary for the fetch calls to the Groq API.

The UI component system uses shadcn/ui (configured in `components.json` with the "new-york" style and slate base color) on top of Tailwind CSS 4. The `tsconfig.json` has strict mode enabled (`"strict": true`) with the path alias `@/*` mapped to `./src/*`, which means every component import uses `@/components/` rather than relative paths. The supply chain security configuration in `bunfig.toml` is also notable — it sets a 24-hour minimum release age for all packages, meaning newly published npm packages cannot be installed until they are at least a day old. This is a guard against supply chain attacks where malicious packages are published and pulled quickly.

The data pipeline is a separate Python script (`prepare_stars.py`) that runs independently of the frontend build. It reads the raw HYG catalog, filters to mag < 6.5, removes the Sun, converts RA from hours to degrees (HYG stores RA in hours, the web renderer needs degrees, so `ra_deg = ra * 15`), computes Cartesian coordinates for the 3D view, fills missing values with safe defaults (ci defaults to 0.0 for white, spect defaults to "Unknown"), and saves a clean 12-column CSV to `public/` where Vite serves it as a static asset. The script itself lives at `Week 8/prepare_stars.py` in the parent repo and outputs to `Week 8/stars_visible.csv` before the file is copied into `MP2/public/`.

The biggest scope change from the MP2a declaration was removing full Supabase constellation persistence. The original plan included saving every user's constellation as a database record with a shareable URL. This was descoped to an optional name-uniqueness check only, and ultimately not implemented at all in the shipped version. The reason was honest: adding Supabase row-level security, authentication, and a share-by-slug URL system would have taken two to three weeks of additional work and the core creative experience did not require it. A user can download their constellation as a PNG and share that. The decision to cut a planned feature and ship a working product without it is itself a product judgment worth noting.

What I would build differently: the AR sky view uses compass heading from `deviceorientationabsolute` to map the phone's direction to a region of the sky. Without GPS coordinates, the star positions are only approximately correct because the mapping from compass heading to right ascension depends on where on Earth you are standing and what time it is. Adding a one-time `navigator.geolocation` permission request and using the user's latitude, longitude, and local sidereal time would make the AR view astronomically accurate rather than directionally approximate. That is the one feature I would build properly if I had another week.

Building and shipping Twinkle changed how I think about what "complete" means. A complete tool is not every feature from the original plan — it is every step of the user journey working reliably, from data preprocessing in Python to static asset serving in Vite to API keys hidden behind edge functions to a custom domain anyone can open on a phone. I learned that architecture is really a chain of constraints: the comment in `vite.config.ts` warning against duplicate plugins, the `bunfig.toml` release-age guard, the RA-to-degrees conversion that has to happen before the renderer ever runs. Each layer only works if the one below it is honest about its assumptions. Cutting Supabase persistence was uncomfortable, but it clarified the real product: a creative instrument, not a social platform. And naming what I would build differently — the AR view's missing geolocation — is part of shipping too. A deployed tool is a statement of what you valued with the time you had, and knowing exactly where the seams are is what separates a finished project from a finished illusion.
