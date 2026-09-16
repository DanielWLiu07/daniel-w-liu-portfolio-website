# Casino startup optimization — 2026-09-16

Implemented in `a986121`, compared with `3448a94`. Poker branch unchanged.

## Measured results

Medians of three fresh-browser runs per condition and version. Both versions used local Next production servers on the same Apple M4, Chrome 153, headless hardware WebGPU, 1280×800 at DPR 1. HTTP cache and Chrome shader disk caching disabled; OS/driver caches may persist. A throttled CPU is a sensitivity test, not a physical phone. Before/after trials were initially interleaved; the final request-order adjustment was then measured three times in each condition. These local numbers are for the comparison, not a promise of identical production network timing.

Preparation adds the yielding colour, real-pass and remaining colour preparation stages. It excludes earlier JS/asset construction and overlaps downloads. Longest block is a browser long-task measurement before scene readiness.

| Condition | Scene ready, before → after | Shader preparation, before → after | Longest main-thread block, before → after |
|---|---|---|---|
| Desktop / local production server | 2.17s → 1.89s | 0.97s → 0.86s | 0.94s → 0.18s |
| 4× CPU throttling | 6.69s → 5.38s | 4.39s → 3.37s | 4.28s → 0.68s |
| 10 Mbps + 40 ms added latency | 3.89s → 3.71s | 0.92s → 0.80s | 0.88s → 0.17s |

Desktop startup improved about 13%, CPU-throttled startup about 20%, and 10 Mbps startup about 5%. The main-thread block decreased about 80% on desktop and 84% under CPU throttling. Preparation is still real work: this does not eliminate every long task or every shader variant.

## Changes retained

- Side-chip stacks share one body/face material pair per ink, including the same face material for both sides. The owning component controls disposal; deleting a stack does not destroy another stack's material. The hero chip and dealer retain independent materials.
- The intro, flying cards and dealer share immutable artwork texture resources and concurrent requests. Intro cleanup only disposes its own letter canvases; shared card textures survive remounts. Materials remain separately owned.
- Ransom-note title generation skips script-font rasterization, masking and thickening that was previously discarded. A browser comparison of 192 old/new letter artwork images found zero differing pixels.
- Shader warmup builds ordinary colour graphs through Three's yielding compiler before discovering remaining shadow/depth/compositor variants. Card depth layers are installed before that first compilation to avoid duplicate shader variants. The full real-pass preparation, covered first render and GPU completion fence still gate the intro.
- Model URLs live in a data-only module so the route can preload the dealer/folder without importing Three. Critical scene JavaScript is requested before low-priority asset hints. A first preload ordering slightly slowed the 10 Mbps case; explicit JS-first ordering corrected it.
- Folder materials are created after the model load resolves, avoiding discarded material construction on that Suspense retry.

No geometry, card artwork, animation timing or render-resolution settings were reduced. Required render variants were largely retained (roughly 117 before vs 116 after); most savings come from avoiding repeated preparation rather than deleting visual effects.

## Validation

Production build and TypeScript passed. Script checks passed for:

- Shared card artwork: concurrent requests, Suspense, independent prints, remount reuse and rejected loads.
- Compilation batching, pass discovery, restoration/failure draining and scene warmup state restoration.
- Shared shader buffer names, card depth layers and startup readiness gating.
- Chip collisions, including remote punches leaving distant chips asleep.
- Dealer handoff, exact attachment and reverse scrubbing.

Browser checks passed for 1280×800 and 390×844: normal intro, settled scene, chip/dice interaction, folder open/close, client navigation away and back, plus the burst and held-card views. A separate 4× CPU test navigated away during shader preparation and returned successfully. No application/WebGPU errors in completed validation runs. Local Vercel analytics returns an expected 404 outside Vercel. One earlier browser session closed during screenshot capture; standalone and complete reruns passed, so that interrupted run was not counted as a pass.

The portrait check uses a desktop GPU at a phone viewport; Safari and physical mobile GPU performance were not measured.

## Evidence

`casino-startup-optimization-2026-09-16.json` contains stage timings and startup long tasks for all 18 final comparison samples. Detailed temporary CPU profiles and request waterfalls are `/private/tmp/portfolio-ab-*`. Browser screenshots are `/private/tmp/startup-*.png`, `/private/tmp/spade-burst.png` and `/private/tmp/spade-held.png`. Temporary harnesses: `/private/tmp/portfolio-startup-short.cjs`, `/private/tmp/check-startup-flows.cjs`, `/private/tmp/check-startup-cancel.cjs`, `/private/tmp/check-letter-pixels.cjs`.

## Live verification

Both Vercel deployments for `a986121` succeeded. A fresh production load of the custom domain confirmed the new yielding-preparation stage, no browser errors, 3.121 MB transferred, final non-analytics download at 1.343 s, scene ready at 2.388 s, intro start at 2.390 s and table landing at 8.321 s. This is one production observation, separate from the repeated controlled comparison above. Full report: `/private/tmp/portfolio-startup-optimized-live.json`.
