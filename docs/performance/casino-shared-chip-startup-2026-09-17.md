# Faster time to the first animation frame

The 25 side chips previously used eight separately constructed watercolor material graphs: body and face for each of four denominations. They now share two graphs. Three's object-update uniforms select each mesh's ink and trim at draw time. The two caps share the same face material. The palette still owns and disposes materials once; the hero chip, dice and dealer keep their existing materials.

No warmup readiness gate was removed, and no compilation was moved into the playing intro. Artwork, resolution, geometry, animation and the painted appearance are unchanged. A localhost-only `?separateChipMaterials=1` switch retains the old path for same-build comparisons; production always shares.

## First-frame results

Two paired fresh-profile trials, Chromium hardware WebGPU, 1280×800/DPR 1, 4× CPU slowdown, current network connection, HTTP/shader disk caches disabled. Alternating order: control/candidate, candidate/control.

| Pair | First animation frame, before | After | Saving |
| --- | ---: | ---: | ---: |
| 1 | 10.313 s | 9.486 s | 0.828 s |
| 2 | 11.120 s | 10.233 s | 0.887 s |

Average first-frame saving: 0.857 seconds, approximately 8%. Combined initial colour/all-pass shader preparation fell from 6.171/6.493 seconds to 5.562/5.897 seconds, about 10%. CPU slowdown is a sensitivity test, not a physical-phone measurement. Other browser workloads were active; the small sample does not guarantee these gains on every device. Separate 10 Mbps trials were noisy and did not establish a consistent total-time improvement. No network-load speedup is claimed from material sharing.

An additional dealer-material sharing experiment reduced shader-preparation time but did not reliably shorten first-frame time in its paired runs. It was removed. Three initial automation runs that failed to launch/navigate/finish were excluded, not counted as successful measurements. Stage summaries, including the rejected dealer experiment, are in the adjacent JSON.

## Validation

- Shared-material unit check verifies all eight supported ink/trim combinations in forward and reverse draw order, and confirms cap sharing.
- Actual desktop/phone browser checks found 25 chips using two materials rather than eight, with multiple distinct colours and no page errors.
- Compared desktop screenshot regions for both chip piles and dealer were pixel-identical between the original path and the expanded sharing experiment; the dealer experiment was subsequently reverted.
- Desktop and phone startup flows passed: chip punches, folder open/close, navigation away and scene remount, with no application/WebGPU errors.
- Production build/TypeScript passed for the shared implementation.

Temporary browser harnesses: `/private/tmp/check-chip-sharing.cjs`, `/private/tmp/check-shared-startup-flows.cjs`; profiling harness `/private/tmp/deep-short.cjs`. Local Vercel analytics returns an expected 404 outside Vercel. Earlier pending font/snap edits remain separate from this material comparison and were present in both variants.
