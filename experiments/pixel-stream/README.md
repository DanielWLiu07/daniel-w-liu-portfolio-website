# Pixel-stream lab

**Start with [ARCHITECTURE.md](ARCHITECTURE.md)** (how it all fits, failure/fallback matrix, costs) and
[deploy/README.md](deploy/README.md) (running it on a Spot GPU instance).

Warm-server cloud-rendering prototype: one Chrome renders the site on this machine's GPU
(assets cached, shaders compiled, table already landed) and streams the tab over WebRTC.
Viewer clicks/drags go back over a data channel and are replayed as real mouse events.

```sh
npx next dev -p 3000                               # the site
SEATS=4 HEADLESS=1 node experiments/pixel-stream/server.mjs  # warm pool → open the printed viewer URL (?lab for stats)
node experiments/pixel-stream/selftest.mjs H264 8000 # automated connect + latency + quality run
node experiments/pixel-stream/bench-sessions.mjs 1 3 5 7   # concurrent sessions per GPU
node experiments/pixel-stream/multitest.mjs 5        # 5 phones vs the pool: seating, queue, hand-off
node experiments/pixel-stream/phonetest.mjs 393 852  # one emulated phone, saves what it sees
node experiments/pixel-stream/e2e-handoff.mjs              # real /resume in "all" mode: handoff, weak stays, device takeover, full → local
node experiments/pixel-stream/e2e-fallback.mjs <pool pid>  # real /resume: stream, full → local, SIGTERM → local
```

Env: `SITE_URL` (default http://localhost:3000/resume), `SIZE` (1280x720), `HEADLESS=1`, `PORT` (8787).
Results land in `results/` (gitignored).

## Findings (Apple M4, localhost, 1280×720, 2026-09-30)

| | |
|---|---|
| Warm server, first page load (scene-ready / table-landed) | 1.8–2.1 s / 7.8 s |
| Connect → first frame (VP8/VP9/AV1) | ~285 ms |
| Connect → first frame (H264, macOS VideoToolbox) | ~3.7 s (encoder start-up quirk) |
| Click-to-photon (H264 hw, 8 Mbps) | 39 ms median, 48 ms p95 — localhost, add real RTT |
| Encode time | 1.4–3.5 ms/frame |
| Quality | 8 Mbps ≈ native at 720p; 1–2 Mbps visibly smears line art / paper grain |
| Sessions per GPU (`?scale=0.75`, idle table, no encode) | 8 sessions ≥ 45 fps |

Headless gotchas: `--use-fake-ui-for-media-stream` breaks tab capture (picks the screen);
headless tab capture defaults to 800×600 and crops ~200 px of the window height, so the
server pads `--window-size` and pins the viewport with `Emulation.setDeviceMetricsOverride`.

## Warm pool (multi-visitor)

Each seat is its own Chrome with /resume loaded to scene-ready and the intro held
(`window.__casinoHoldIntro`, see `components/resume/casino/intro-ready.ts`); held seats
use `frameloop="demand"` so an idle seat costs ~1% CPU. A visitor claims a free seat, the
seat resizes to their screen (portrait phones get the portrait layout) and captures at that
exact size, and the intro is released once their video is playing. On leave the seat reloads
and re-holds (~2.2 s); queued visitors get it as soon as it's warm.

5 phones vs 4 seats on the M4: all 4 seated visitors at 60 fps, 590×1278, ~4.3 Mbps each;
live 1.4–3.8 s when all arrive at once (0.4–0.8 s alone); #5 queued and seated 2.6 s after
someone left.

Headless gotchas: a page frozen with `Page.setWebLifecycleState` can never start a tab
capture again; minimizing a headless window does not pause rendering; `cropTo` is not
implemented headless; starting a tab capture resizes the page, so the server re-applies the
viewport and `applyConstraints` afterwards.
