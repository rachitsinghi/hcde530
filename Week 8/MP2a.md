# MP2a declaration

## 1. Problem

People who want to creatively engage with the night sky have no tool that lets them invent personal constellations from imagination and see them mapped onto real stars — so this tool lets anyone draw a shape using **straight-line segments** on a sketch pad, have **each vertex automatically snapped** to the nearest real catalog star, and receive an **AI-generated name** for the constellation they just created.

## 2. Audience

The primary users are the **general public**, **astronomy hobbyists**, and **artists** — people who find the night sky beautiful and want a low-friction, playful, visually rich way to interact with real stellar data without needing any astronomical background. **Educators and science communicators** are a welcome secondary audience but not the primary framing — the tool is built for **curiosity and creative expression** first.

## 3. Data

The tool uses the **HYG v4.2** star catalog pre-filtered to **~9,000 naked-eye-visible stars** (`mag < 6.5`), prepared by a Python script (`prepare_stars.py`) and hosted as **`stars_visible.csv`** with fields: `id`, `ra`, `dec`, `mag`, `ci`, `spect`, `lum`, `proper`, `dist`, `x`, `y`, `z` — loaded **client-side** in the browser; user-generated constellation names are **optionally** checked for global uniqueness against a **Supabase `used_names`** table, but **full constellation records are not persisted**.

## 4. Track

**Design track** — the product is experienced entirely through its interface: the immersive galaxy star map, the straight-line sketch pad, the snap-to-star result projected onto real stars, the **2D/3D toggle**, and the **PNG export**. The computation (vertex normalisation, nearest-neighbour snap, Claude API naming call) is invisible infrastructure in service of the creative experience.

## 5. Platform

**Lovable** — with the **Claude API** called via Lovable's built-in edge function support for AI naming, and **optional Supabase** for a lightweight used-names registry only.

## 6. Rationale

The product's value is almost entirely in how it looks and feels — an immersive **galaxy aesthetic** in **Roboto Mono**, a smooth draw-to-constellation experience, and a beautiful **2D/3D result** — which makes Lovable the right choice because the interface is the product and Lovable deploys a polished React frontend faster than any alternative. The **nearest-neighbour snap** across ~9,000 stars runs fast enough **client-side in JavaScript** without any compute backend, so there is no technical argument for Bolt at this data scale.
