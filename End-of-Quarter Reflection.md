# End-of-Quarter Reflection

HCDE 530 | Rachit Singhi

When I started this quarter I thought of coding as something other people did, and I came in as a UX researcher and designer who could read a chart but not really build one. Looking back through my repo now, the commits, the notebooks, the two major projects, I can see the actual shape of what changed. It was not that I learned to write a lot of code. It was that I learned to be the person who decides whether the code, and the data behind it, can be trusted. Below I make the case for three of the eight domains, with specific evidence you can open and check, and then one thing I picked up that was not on the syllabus.

I chose C5, C7, and C8 because together they trace the real arc of my quarter: learning to ask a dataset a question (C5), learning to not believe an answer just because it looks finished (C7), and learning to ship something a stranger can actually use (C8). I left C2 out on purpose. My own `Week 3/week3.md` admits my early commit messages like "Fixed 2 bugs" were too vague, and the git log proves it, so I would rather show you the domains where the evidence is strong than stretch a weak one.

---

## C5 — Data Analysis with Pandas

**Where to look:** `Week 5/MP1/a5_analysis.ipynb`, `MP1/mp1.md`, and the summary table in `README.md`.

For MP1 I worked with the HYG v4.2 star catalog, which is about 119,626 real stars, and I used pandas to answer three connected questions: can stars be grouped into constellation-like clusters by position, do a few bright stars anchor each cluster, and do different clusters hold different kinds of stars. I used all five operations from class, but the part I am proud of is not that I called them, it is that I chose them on purpose.

The clearest example is the filtering step. Before any clustering, I ran `df[df['mag'] < 6.5]` to cut the catalog down to roughly 9,000 naked-eye-visible stars. That was not a formatting move, it was the decision the whole project rested on. If I had run K-Means on all 119,626 rows, the clusters would have been dominated by stars too faint to ever see, and a "constellation generator" built on invisible stars would be meaningless. Choosing the right filter was choosing what question I was actually answering.

A second moment came from `df.isnull().sum()`, which showed me that around 3,000 stars were missing spectral class data. I would never have caught that from `df.head()` alone, and it directly changed how I scoped the spectral composition work so I was not quietly analyzing blanks. Then `groupby('cluster')` on the magnitude column showed the real finding: nearly every cluster had the same right-skewed shape, two to four genuinely bright anchor stars sitting in a crowd of dim filler stars. The pattern holding across clusters, not in just one lucky patch of sky, was the actual result. That consistency is a structural fact about the night sky, and I would not have seen it without grouping and comparing.

What this shows about my capability: I can take a large, real, imperfect dataset and turn a vague curiosity into a specific, testable question, then pick the pandas operation that answers that exact question instead of running everything and hoping. I also learned to run `describe()` early, which is how I caught a 100,000-parsec sentinel value that would have thrown impossible points into a later 3D chart and made it look broken for a reason that is very hard to diagnose after the fact. Reading data before plotting it is now a habit, not a step I skip.

---

## C7 — Critical Evaluation and Professional Judgment

**Where to look:** `Week 6/MP1/week6.md`, `MP1/mp1.md` (C7 section), and `MP2/mp2.md` (C7 section, three documented moments).

This is the domain where I changed the most, and it shows up in both projects, which is why I picked it. I have more than one example, so I will give the ones that each forced a real decision.

In MP1 I started with three CSV files I had pulled together and asked Claude to merge them into one star catalog. The merged file came back looking perfect, every row filled in, no errors. But Claude flagged that the three files shared no common key, which meant the physical properties had been randomly paired to positions they had nothing to do with. A hot blue star could land at a cool red star's coordinates. The output looked finished and was substantively wrong. Instead of accepting it because it was tidy, I treated the flag as a real problem, looked at the recommended HYG database, and spot-checked it against published values for Sirius and Betelgeuse before trusting it. Then I threw the synthetic file away and started over. A pretty table with invented relationships is worse than no table, because it fails silently.

In MP1b there was a second moment. Cursor built me a 3D version of my cat constellation exactly as I asked, and it ran with no errors, but the cat was unrecognizable because the real stars sit between 49 and 411 parsecs away and the lines stretched along the line of sight. The code worked and the result was useless. I kept that failed chart in the notebook as Chart 1b on purpose, next to the 2D version that actually works, because the failure is itself the finding: constellations are projections from where we stand, not real shapes in space. A third moment was catching that a Plotly drag-to-draw widget ran fine on my machine but would not render on GitHub, where the notebook had to be graded, so I rewrote it into a pattern that works in any viewer.

MP2 pushed this further. The honest write-up in `MP2/mp2.md` documents three failures I had to catch and redirect. I asked Groq to return coordinate arrays that traced a shape, and the output was random lines, because a language model has no real spatial reasoning, so I stopped asking AI to do geometry and used it only for the text matching it is genuinely good at. I tried Google's Quick Draw data and hit a CORS wall and then unreliable two to eight second latency, so I judged that a demo that works once is not a feature a user can depend on, and switched to something under 500ms. And the MediaPipe finger drawing placed a vertex on every tiny tremor until I built a palm-size calibration step so the threshold scales to how far the hand is from the camera.

What this shows about my capability: I can tell the difference between output that looks correct and output that is correct, and I can name the test I would use to check. That is the part of working with AI that a stakeholder actually pays for. I am not impressed by something just because it compiled or rendered. I ask what question it was supposed to answer, and whether I would put my name on it in front of a client.

---

## C8 — Building and Deploying a Complete Tool

**Where to look:** the live site at https://twinkle.ltd, plus `MP2/mp2.md`, `MP2/reflection.md`, `Week 8/prepare_stars.py`, and the `MP2/src/` components.

Twinkle is my MP2. It is deployed on a custom domain and anyone with a browser can use it. A person draws a shape, each point snaps to the nearest real star from the HYG catalog, an AI names the constellation, and they can download it or, on a phone, hold it up against the real sky. The whole user journey works end to end, which is what "complete" turned out to mean.

The evidence I want to point at is the chain of layers, because each one was a real decision. The data does not come from the app, it comes from a separate Python script, `Week 8/prepare_stars.py`, which filters the catalog to magnitude under 6.5, removes the Sun, converts right ascension from hours to degrees, precomputes x, y, z coordinates for the 3D view, and fills missing values with safe defaults before writing a clean CSV. The Groq naming call runs through a Cloudflare Workers edge function, not the browser, because the API key cannot be exposed in client code where anyone can read it in dev tools. That is the same API-key discipline I first practiced in Week 4 with the Pexels pipeline and the `.env` file, now carried into a public deployment.

The part I think matters most for this domain is what I cut. My `Week 8/MP2a.md` declaration promised full Supabase persistence so every constellation would be saved with a shareable link. I removed it. Adding row-level security, auth, and share-by-slug would have taken weeks, and the core experience, create and download, does not need a database. Cutting a feature I had already announced was uncomfortable, but it clarified what the product actually is: a creative instrument, not a social platform. I also know exactly where the seam is that I did not finish. The AR view uses compass heading without GPS, so the sky is directionally close but not astronomically exact, and in `MP2/reflection.md` I say plainly that the fix is a one-time location permission and local sidereal time.

What this shows about my capability: I can scope a real project for a real use case, make the architecture decisions that keep it working for a stranger and not just on my laptop, and be honest about the trade-offs. I can cut the right thing under a deadline, and I can name the limitation I shipped with instead of hiding it. Knowing where the seams are is, to me, the difference between a finished project and a project that just looks finished.

---

## One thing I learned that was not in the objectives

The syllabus taught me tools. The thing I did not expect to learn was how to manage one.

By the end of the quarter I stopped treating AI like an oracle that hands me answers and started treating it like a fast, confident junior collaborator that I am responsible for supervising. That sounds small but it changed how I work day to day. I now assume that anything it gives me is a draft, and that my job is to find the one place it went quietly wrong. The merged star CSV taught me this first, because it was the moment I realized "looks complete" and "is correct" are two different things, and only one of them is my problem to verify.

The habit that came out of this is that I always look for the check. Before I trust a dataset I find a known value and confirm it, the way I checked HYG against Sirius and Betelgeuse. Before I trust a chart I look at whether it actually reads the way a human would expect, the way I caught the 3D cat. Before I trust a feature I imagine a real person using it in a worse situation than mine, a shaky hand far from the camera, a phone with no location. None of that was a lesson with a slide. It came from getting burned by polished output enough times that I built the reflex.

I think this is the most useful thing I am leaving the quarter with, because it transfers. It is not about stars or pandas or Cloudflare. It is a way of working where I stay accountable for the output no matter how it was produced, and I can explain to someone exactly what I checked and why I believe it. For a researcher and designer who now builds things, that judgment is worth more than any single tool I learned to use.
