# MP2a declaration

*Submitted text for the course. **Implementation scope** may differ — see **Build decisions** in `Week 8/.cursorrules` (straight-line sketch pad, PNG-only export, optional Supabase for names only, audience: public + hobbyists + artists).*

## 1. Problem

People who want to creatively engage with the night sky have no tool that lets them invent personal constellations from imagination and see them mapped onto real stars — so this tool lets anyone draw a shape freehand, have it geometrically matched to real catalog stars, and receive an AI-generated name for the constellation they just created.

## 2. Audience

The primary users are curious non-experts — students, amateur astronomers, and people who find the night sky beautiful but existing planetarium tools too passive or technical to engage with creatively. Secondary beneficiaries are educators and science communicators who want a visually immersive, low-barrier entry point into real stellar data that requires no astronomical background to enjoy.

## 3. Data

The tool uses the HYG v4.2 star catalog pre-filtered to ~9,000 naked-eye-visible stars (mag < 6.5), hosted as a static CSV loaded client-side, where each record contains right ascension, declination, apparent magnitude, B-V color index, spectral class, luminosity, and proper name — and produces user-generated constellation records (a shape path, the matched star IDs, and an AI-generated name) saved to a Supabase database so constellations can be retrieved, shared, and downloaded.

## 4. Track

Design track — the product is experienced through its interface: the immersive star map, the drawing canvas, the geometric matching result projected onto real stars, and the 2D/3D toggle. The computation (SVG path normalisation, star-position matching, Claude API naming call) is entirely in service of the interface experience.

## 5. Platform

Lovable — with Supabase for constellation persistence and the Claude API called via Lovable's built-in edge function support for AI naming.

## 6. Rationale

The product's value is almost entirely in how it looks and feels — an immersive star map, a smooth drawing-to-constellation experience, and a beautiful 2D/3D result — which makes Lovable the right choice because the interface is the product and Lovable deploys a polished React frontend faster than any alternative. The geometric matching computation (normalising the drawn SVG path and finding the best-fitting stars from a 9,000-row client-side dataset) runs fast enough in the browser without a backend, so the one argument for Bolt doesn't apply at this data scale.
