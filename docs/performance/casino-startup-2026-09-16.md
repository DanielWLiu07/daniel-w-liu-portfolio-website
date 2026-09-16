# Casino startup investigation — 2026-09-16

Profiled https://www.danielwliu.com/resume at main commit `3448a94`. No application behavior changed during the investigation.

## Method

Apple M4, Chrome 153.0.8010.48, headless hardware WebGPU, 1280×800, DPR 1. Each run used a new browser profile, disabled HTTP cache and Chrome GPU shader disk caching. This does not guarantee cold OS/driver shader caches. Six baseline runs were sequential to avoid competition between test browsers: three current-connection runs and three at 10 Mbps with 40 ms added latency. Two additional instrumented runs collected CPU samples, long tasks, font loading and GPU API calls; one used 4× CPU throttling. CPU throttling is a sensitivity test, not a measured mobile device. Instrumented runs are not included in baseline medians.

## Baseline results

Seconds from navigation. Download completion is the last finished non-Vercel resource observed through six seconds after the table lands, not an isolated critical-path download timer. Setup overlaps downloads, so subtracting these times does not measure all CPU work.

| Run | Downloads complete | Scene ready | Table lands | Main pipeline-preparation stage |
|---|---:|---:|---:|---:|
| Current connection 1 | 7.35 | 8.86 | 14.79 | 1.04 |
| Current connection 2 | 1.28 | 2.64 | 8.57 | 1.08 |
| Current connection 3 | 1.09 | 2.30 | 8.24 | 0.98 |
| 10 Mbps 1 | 2.95 | 4.18 | 10.11 | 1.07 |
| 10 Mbps 2 | 3.03 | 4.30 | 10.23 | 1.14 |
| 10 Mbps 3 | 2.88 | 4.08 | 10.01 | 1.03 |

Current-connection median scene readiness: 2.64 s, range 2.30–8.86 s. The slow first run had delayed resource delivery (multiple JS/font/image requests started around 3.05 s and completed around 6.49 s), while main preparation remained 1.04 s. Its secondary colour preparation also took 0.51 s versus roughly 0.02–0.03 s normally. Do not exclude this outlier when describing variability. 10 Mbps median readiness: 4.18 s, range 4.08–4.30 s. The scripted intro then takes approximately 5.9 s until the table lands.

The earlier isolated 5.3 s and 6.8 s results were valid individual observations, not stable expected startup times. Nothing was optimized between these measurements.

## What setup actually contains

The `all-pass-pipeline-preparation` label includes synchronous CPU work, texture/geometry upload, and asynchronous pipeline requests. Calling all of it GPU compilation was too broad.

In the instrumented desktop run, scene readiness was 2.56 s. Main preparation was 1.12 s, including a 1.112 s main-thread long task. Approximate exclusive CPU sample attribution within that stage:

| Work | Sampled time |
|---|---:|
| Shader graph traversal/building (`getNodeBuilderState` and descendants) | 688 ms |
| Image-to-texture upload | 111 ms |
| Garbage collection | 76 ms |
| Geometry attribute upload | 31 ms |
| Other preparation | 213 ms |

Before readiness, 145 shader modules were submitted (145 distinct source hashes, about 1.57 million generated source characters) and 117 render pipelines were requested: 113 asynchronous, 4 synchronous. Categories included 54 MeshBasicNodeMaterial pipelines, 17 shadow variants, 13 compositor position variants, 9 MeshBasicMaterial variants, dealer materials and compositor effects. Distinct source hashes do not prove all variants are necessary, nor that they can safely be merged.

GPU API JavaScript call time totalled about 6.7 ms. Async promise elapsed durations cannot be treated as isolated GPU compile times: callbacks were blocked by the long main-thread task. The final covered render took 15 ms and GPU completion fence 7 ms in the instrumented run. These are not the leading desktop bottleneck.

With 4× CPU throttling, main preparation grew to 4.27 s, including a 4.247 s long task; scene readiness grew to 7.61 s and intro-start to 7.64 s. Sampled shader building was approximately 2.90 s, texture upload 0.40 s. This is strong evidence that startup CPU work matters on slower devices.

Other startup costs: dealer rig/material construction was 44–73 ms per invocation on desktop (246 ms under CPU throttling); renderer device initialization 3–20 ms; compositor graph setup 5–9 ms. One baseline run constructed dealer rig/materials twice; investigate the Suspense/remount path before changing it. CPU samples also identify canvas ransom-letter generation and flight-caption rasterization as secondary costs (roughly 96 ms and 60 ms self-time in the desktop startup profile). Model decoding and SVG rasterization were not independently timed, so no precise standalone savings are claimed for them.

## Download cost and dependencies

Measured total transfer: about 3.12 MB, including HTTP overhead.

| Category | Transfer, decimal KB |
|---|---:|
| JavaScript, including analytics | 794 |
| Fonts | 738 |
| Dealer model | 657 |
| Other images | 491 |
| Card artwork | 223 |
| Folder model | 187 |
| Remaining HTML/CSS/etc. | 32 |

Fonts already share a loading registry, and artwork is preloaded after route hydration. The dealer and folder model requests begin later, after scene JavaScript/imports. In one representative fast run, model requests began around 0.6–0.8 s; in the earlier 5.3 s run, the dealer began at 1.62 s and the folder at 1.75 s. Earlier model discovery is a candidate to test, not a guaranteed measured saving. The intro waits for fonts, card textures, dealer and folder actors; then `revealWarmupActors` exposes future actors, and `compileRenderPasses` traverses their real colour/shadow/depth/post-processing passes in one synchronous render call before awaiting pipelines.

## Ranked next steps

1. **Reduce shader graph construction and variant count.** Profile per material/actor, consolidate genuinely equivalent graph/material instances and reuse work across compatible variants. Existing buffer-name canonicalization already removes one source of shader duplication. Preserve bindings, skinning, card render layers, cutouts and shadows; simply sharing material objects has previously caused resource-lifetime errors.
2. **Break up the main-thread warmup task.** Schedule bounded preparation chunks and investigate preparing later actors during the intro. This primarily improves responsiveness; starting early only helps if later pipelines are ready before their first visible frame. Do not simply remove the readiness gate and move stutters into the animation.
3. **Move required model discovery earlier.** Test correctly matched preload requests on the non-Lite route. Compare waterfall and first-animation time, including 10 Mbps; aggressive preload can compete with critical JS/fonts.
4. **Reduce startup texture/canvas work.** Investigate shared texture ownership, reusable letter/caption caches and equivalent pre-baked assets. Measure upload/rasterization and visual quality. Fonts remain significant network cost; further subsetting must preserve all displayed glyphs and editor behavior.
5. **Investigate repeated dealer construction.** Verify whether Suspense retries duplicate disposable rig/material resources. It is secondary to shader graph work.

Further dealer triangle reduction is not the first setup target supported by these results. Neither is optimizing the final GPU fence or first rendered frame. All eight runs reported no page errors.

## Evidence

Compact baseline/stage results: `casino-startup-2026-09-16.json` beside this report. Full network reports, screenshots and CPU profiles remain in `/private/tmp/portfolio-bottleneck-*`. The profiling harness is `/private/tmp/portfolio-startup-profile.cjs`; ordinary baseline harness is `/private/tmp/portfolio-cold-load.cjs`. These temporary artifacts are local, not deployed. No implementation savings are claimed until an A/B change is tested.
