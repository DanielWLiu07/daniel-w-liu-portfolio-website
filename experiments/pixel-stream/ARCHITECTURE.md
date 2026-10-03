# Cloud-rendered résumé: architecture

`/resume` can **start** as a video stream of the casino rendered on a GPU server
(WebRTC, like cloud gaming) while the visitor's own device prepares the real
thing. Capable devices take over locally before the show starts. Weak devices
stay streamed. If anything about streaming fails, the visitor gets today's local
casino, so streaming can only make the page faster, never broken.

Design rules:
1. **Never worse than local.** Every failure path ends in local rendering.
2. **Seats are short-lived.** Capable visitors hold a seat for seconds (until
   local is ready), so a few seats serve many visitors.
3. **Pay for GPUs only when people are around.** Servers sleep, with everything
   pre-installed, and wake on demand. An optional keep-on window covers business
   hours.
4. **No database.** The front door re-reads the truth (EC2 state plus each
   server's seat counts) on every request.

## The whole system

```
                        ┌──────────────────────── Vercel: your site ────────────────────────┐
  visitor's browser     │                                                                    │
 ┌────────────────────┐ │  every page:  StreamWarmup ──(real visitor, 5 s)──┐                │
 │ any page           │─┼──────────────────────────────────────────────────▶│                │
 │                    │ │                                                   ▼                │
 │ /resume            │─┼── GET /api/stream/seat ──────────▶ front door (route handler)      │
 │  StreamSession     │ │                                     • list fleet (EC2 tags)        │
 │   ├ local casino   │ │   { url } or { url: null }          • read each server's seats     │
 │   │  (held, warming│◀┼─────────────────────────────────    • decide(): pick + start more  │
 │   │   underneath)  │ │                                     • StartInstances when low      │
 │   └ <iframe>       │ └──────────────────────────────────────────────┬─────────────────────┘
 │      viewer.html   │                                                │ ec2:Describe/StartInstances
 └────────┬───────────┘                                                ▼  (least-privilege IAM user)
          │ HTTPS: signaling (SSE + POST)      ┌──────────── AWS ca-central-1 ───────────────┐
          ├───────────────────────────────────▶│ stream-1  (g4dn Spot, tag StreamFleet)      │
          │ UDP 10000-10999: video ↓ taps ↑     │  Caddy :443 → server.mjs (pool manager)     │
          └◀──────────────────────────────────▶│  Chrome seat × N: /resume?stream=0, held    │
             (direct, or via Cloudflare TURN)   │  streamer.js: capture → crop → WebRTC       │
                                                │ stream-2  (stopped until needed) …          │
                                                └──────────────────────────────────────────────┘
```

| Piece | Where | Role |
|---|---|---|
| `components/resume/stream/stream-config.ts` | site | mode, weak-device test, `requestSeat`, device id, `canHandOff` |
| `components/resume/stream/stream-session.tsx` | site | one visit's state machine: stream, local warming underneath, handoff, fallback |
| `components/resume/stream/stream-embed.tsx` | site | the iframe: `live`/`intro`/`fallback`/`navigate` events in; `allowIntro`/`release` out |
| `components/resume/stream/stream-warmup.tsx` | site (layout) | early wake: one `?wake=1` per session after 5 visible seconds |
| `app/resume/page.tsx` | site | chooses: streamed session (capable or weak) or plain local |
| `components/resume/casino/intro-ready.ts` | site | `useIntroHold`: hold the intro at frame 0 (seat or background warm-up) |
| `app/api/stream/seat/route.ts`, `lib/stream/fleet.ts` | site (server) | the front door: fleet listing, `decide()`, waking servers |
| `server.mjs` | GPU server | pool manager: seats, signaling, device rule, limits, idle reclaim, self-stop, Spot drain |
| `streamer.js` | each seat page | tab capture, locate the page in the frame, crop, WebRTC sender, link forwarding |
| `viewer.html` | iframe | plays the stream, sends input, reports to the site; `?lab` for measurements |
| `deploy/` | your machine | EC2 launch/control/deploy for a numbered fleet, first-boot setup, IAM policy |

## A visit

```
                 capable device                                   weak device
 /resume ─▶ local casino starts downloading (held)       nothing downloads yet
         ─▶ GET /api/stream/seat ─┬─ url ─▶ iframe ─▶ stream live (~0.5 s, opening frame)
                                  └─ null ─▶ local                     │
                                                                       ▼
 local ready before the stream's show starts?           stream plays the show, stays
   yes ─▶ fade to local, it plays the show itself         streamed; local only if the
          seat released (held ~1-4 s)                     stream fails
   no  ─▶ stream plays the show; stay streamed
```

1. **Decide.** `wantsStream` uses the mode (`off`, `opt-in` = `?stream=1`, `weak`,
   `all`) and the device. A capable device starts the local casino download
   immediately, in parallel, so streaming never delays it.
2. **Seat.** `GET /api/stream/seat` (≤1.5 s, else local) returns a server URL
   with a warm seat. As a side effect it starts more servers if seats run low.
3. **Stream.** The iframe connects. The seat matches the visitor's screen shape
   (portrait phones get the portrait layout), captures, locates the page in the
   frame, crops it, and streams. First picture in ~0.5 s. The page transition
   reveals on `live`.
4. **Grace.** A capable device gets up to `LOCAL_GRACE_MS` (4 s) after `live`
   for its local copy to be ready. Meanwhile the visitor sees the live opening
   frame.
5. **Handoff or show.** If local is ready first, the stream fades out, local
   plays the show from the top, and the seat goes back to the pool. Otherwise
   the stream starts the show (once 20 smooth frames have arrived and bandwidth
   has ramped to ≥3 Mbps) and the visitor stays streamed.

**Why no handoff mid-show:** starting the local scene N seconds into the intro
(shifting the shared intro clock) renders without the table, dealer and title.
Measured: it never recovers, because some intro actors advance frame by frame
rather than from the clock. Mid-show handoff would need the intro reworked to be
fully clock-driven. Until then, a capable device whose local copy is late stays
streamed, and a mid-show failure restarts the show locally from the top.

## The front door and scaling

`decide(servers, { minFreeSeats, maxServers, seatsPerServer })` is a pure
function covered by `scripts/check-stream-decision.ts`:
- **Pick:** stream from the healthy (running, answering, not draining) server
  with the most warm seats.
- **Count free seats:** warm seats left after this visitor, plus `seatsPerServer`
  for each server still booting.
- **Scale up early:** if free seats < `minFreeSeats` and running+booting <
  `maxServers`, start the next stopped server. With nothing running, that's the
  wake-up.
- **Early wake:** any page's `StreamWarmup` sends one `?wake=1` per session after
  5 visible seconds. Crawlers and link previews don't trigger it. A server takes
  ~1–2 min to wake, roughly the time people take to reach `/resume`.

Scaling down is each server's own job (below). The front door never stops
anything.

## A render server

**Seat lifecycle**
```
 boot ─▶ loading ─▶ hot (intro held at frame 0, ~1% CPU) ─claim─▶ streaming ─leave─▶ (rearm if the show ran) ─▶ hot
              └─ never ready (90 s) ─▶ failed           chrome crash ─▶ dead (its visitor falls back)
```

**Rules**
| Rule | Behaviour |
|---|---|
| One seat per device | A second tab or reload with the same device id takes the seat over and keeps the show. The old tab falls back (`replaced`) |
| Per-IP cap | `MAX_SEATS_PER_CLIENT` (3), lenient because offices share an IP |
| Embeds never queue | No seat means `fallback: full`, and the site renders locally. Only direct viewers queue |
| Idle reclaim | Only while the pool is full: no input for `IDLE_MS` (2 min) → "Still there?" (20 s) → seat freed |
| Hidden tab | A viewer in a background tab gives its seat back after 15 s |
| Self-stop | No visitors for `SELF_STOP_IDLE_MIN` (30), outside `KEEP_ON_DAYS`/`HOURS` (Mon–Fri 9–21 Toronto) → OS shutdown = EC2 stop. Linux only |
| Spot drain | IMDS interruption notice (~2 min ahead) or SIGTERM → no new seats, current visitors fall back |

**Capture geometry.** Headless Chrome's tab capture doesn't reliably match the
page. The frame can be the page at 2×, or the whole window with the page in a
corner, or clipped. So each seat **measures** instead of assuming:
- It flashes magenta marker pixels at the viewport's corners and finds them in
  one raw frame (~0.1 s).
- It crops each frame to that rect (zero-copy `VideoFrame.visibleRect`).
- It sets `scaleResolutionDownBy` so the encoder sends exactly the page's pixel
  grid.
- A clipped capture (a corner missing) is captured again.
- The seat window is set once, large (`SURFACE`), and never resized, because
  resizing doesn't reach an already-loaded headless page.

## When the visitor gets local rendering

| Situation | Detected by | Result |
|---|---|---|
| Mode `off`, `?stream=0`, or not chosen by the mode | page | local, no request made |
| Front door unconfigured, slow (>1.5 s), errors, or no warm seat | page | local (servers may be waking for later visitors) |
| Seat taken between the check and `start` | server → `fallback: full` | local |
| Same device opened a newer tab | server → `fallback: replaced` | local in the old tab |
| WebRTC can't connect | viewer → `fallback: network` | local |
| No picture within 10 s (12 s on the site side) | viewer, then site | local |
| Spot interruption, shutdown, idle self-stop | server drains → `fallback: server-ending` | local, the show restarts locally |
| Seat's Chrome crashes | server → `fallback: seat-crashed` | local |

## Security model

- **IAM is for operators only.**
  - Your admin user (`portfolio-stream` CLI profile) creates and manages servers.
  - A separate **front-door IAM user**, whose keys live in Vercel's environment,
    can only `DescribeInstances` and `StartInstances` on instances tagged
    `StreamFleet=portfolio-stream` (`deploy/front-door-policy.json`). It can't
    stop, terminate or create anything.
- **Visitors are anonymous.** Their limits are application rules (seats, device,
  IP, idle). `frame-ancestors` and CORS restrict embedding to `EMBED_ORIGINS`,
  and lab endpoints need `LAB_TOKEN`.
- **Network.** The security group allows 80/443, UDP 10000–10999 and SSH from
  the launching IP. The pool server and Chrome DevTools listen on localhost only.
- **What seats can do.** They render your public site with `?stream=0`. Visitor
  input is only mouse moves, clicks and wheel. Links open on the visitor's side,
  not in the seat.

## Cost (ca-central-1; check current pricing)

| Item | Price |
|---|---|
| g4dn.2xlarge Spot (T4, 8 vCPU) | ~$0.30–0.36/hr (on-demand $0.752) |
| Per server, always: disk (~$0.09/GB-mo) + Elastic IP ($3.60) | ~$12/mo, even while stopped |
| Data out | first 100 GB/mo free, then $0.09/GB (≈ $0.32 per streamed viewer-hour at 8 Mbps) |
| Cloudflare TURN | first 1 TB/mo free |
| Front door | Vercel function invocations, within the plan |

| Tier | Setting | ~Per month |
|---|---|---|
| Wake on demand only | `KEEP_ON_DAYS=` (empty) | $35–50 |
| **Business hours + wake on demand** (default) | `KEEP_ON_DAYS=1-5`, `KEEP_ON_HOURS=9-21` | $100–130 |
| Always on, 1 server | `SELF_STOP=0` | ~$250 |
| Always on, 5 seats (+ scale to a 2nd server) | g4dn.4xlarge, `STREAM_MAX_SERVERS=2` | ~$300–380 |

## Testing

| Check | What it proves |
|---|---|
| `npx tsx scripts/check-stream-decision.ts` | who streams; handoff rule; front-door decisions (wake, pick, scale before the limit, draining, max servers) |
| `npx tsx scripts/check-casino-intro-ready.ts` | the intro gate still behaves for normal visitors |
| `experiments/pixel-stream/e2e-handoff.mjs` | capable visitor → stream → local handoff, seat returned; late local copy stays streamed; weak device stays streamed; same device takes over; full pool → local |
| `experiments/pixel-stream/e2e-fallback.mjs` | streamed, full → local, SIGTERM (Spot) → local, server gone → local |
| `multitest.mjs`, `phonetest.mjs`, `selftest.mjs`, `lagtest.mjs` | concurrency, phone shapes and capture geometry, latency/quality, per-second render/encode timeline |

All pass locally against the 2-seat pool (October 2026).

## Known risks / to verify on the first AWS launch

1. **Software video encoding on Linux.** Chrome has no NVENC path for WebRTC, and
   the card burst stressed even an M4's encoder. If it stutters: fewer `SEATS`,
   `CODEC=VP8` vs `H264`, or a Windows GPU instance (Chrome uses the NVIDIA
   hardware encoder there).
2. **WebGPU on headless Linux renders but never shows** (measured on the first
   launch). The T4 is found (nvidia/turing), but Chrome reports
   `gpu_compositing: disabled_software` and `webgpu: enabled_readback`. A WebGPU
   canvas cleared to red composites as the page background, while WebGL works.
   So Linux seats load `?renderer=webgl` (via `SEAT_RENDERER`), which uses
   three's WebGL 2 backend; checked side by side, it looks identical. The proper
   upgrade is a real display: an NVIDIA X server with Chrome windowed, for GPU
   compositing. That would also be faster; today it's ~35–45 fps delivered and
   ~125 ms click-to-picture.
3. **Capture geometry on Linux.** It's measured per visitor (markers), so it
   should hold, but check the `streaming` log lines on the first launch.
4. **`SITE_URL`** must be a deployment with `useIntroHold` and without Vercel
   deployment protection.
5. **Phones can't swipe-scroll inside the stream** (drags move dice and chips),
   and mid-show handoff waits on making the intro fully clock-driven.
6. **One region.** The West Coast and Europe get more latency. A second region is
   just another tagged server; the front door could prefer the nearest one later.

## Runbook

See `deploy/README.md`.
