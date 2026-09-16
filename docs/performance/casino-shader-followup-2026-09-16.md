# Shader startup follow-up — 2026-09-16

The startup implementation at `a986121` was already on main. All earlier profiling reports were pushed in `22764ba`; both Vercel contexts succeeded.

## Experiment

Temporarily raised the colour-preparation pipeline concurrency from 8 to 16. Kept the yielding node compiler, all-pass preparation, real covered render and GPU completion fence unchanged. Tested separate production builds, three fresh-browser trials per condition/version, alternating version order. Chrome HTTP and shader disk caches disabled; Apple M4, 1280×800, DPR 1. CPU throttling is a simulated sensitivity test, not a phone.

A live Chrome window was open for user testing during these trials. Absolute times are substantially noisier/slower than the earlier quiet-machine measurements and should not be compared with that report. This is a screening experiment, not evidence of a precise percentage gain.

| Median of 3 | 8 jobs | 16 jobs |
|---|---:|---:|
| Desktop scene ready | 2.833 s | 2.531 s |
| Desktop shader preparation | 1.535 s | 1.365 s |
| 4× CPU scene ready | 9.049 s | 9.416 s |
| 4× CPU shader preparation | 5.835 s | 5.569 s |

The desktop aggregate looks faster, but two of the three paired desktop runs were slower at 16. CPU-throttled total readiness was also slower in two of three pairs. This does not establish a repeatable overall benefit. Reverted the experiment; the shipped concurrency remains 8. No shader or visual-quality change was retained.

The CPU profile still spends substantial preparation time in node build/generate/analyze/cache traversal, texture upload and garbage collection. More GPU jobs do not remove that CPU work. Future work should target measured duplicate graph construction or simplify expensive graphs with visual comparison, rather than moving readiness earlier and letting compilation interrupt the intro.

## Validation

All nine focused checks passed: card artwork cache, pass discovery, compilation batching/failure restoration, warmup state restoration, card render layers, chip collisions, dealer handoff, intro readiness and shader-buffer canonicalization. Production build and TypeScript passed after restoring concurrency to 8.

The first build attempt exposed stale dependencies in the main working directory (Next 16.1.1 and missing analytics). `npm ci` restored the committed lockfile dependencies, including Next 16.3.3; subsequent experimental and final builds passed. No dependency manifest or lockfile change was needed.

Raw timings and stage measurements for all 12 samples are in `casino-shader-followup-2026-09-16.json`. Detailed temporary CPU profiles are `/private/tmp/portfolio-shader-*.cpuprofile`.

Live desktop and portrait (390×844) browser checks passed with no application/WebGPU errors: intro, settled scene, chip punches, folder open/close and client navigation away/back. Reviewed both remount screenshots. These use a desktop GPU, not physical mobile hardware.

One final fresh-profile production observation: 3.122 MB transferred, final non-analytics download at 1.163 s, scene ready at 3.360 s, no browser errors. This is one observation, not a guaranteed load time.
