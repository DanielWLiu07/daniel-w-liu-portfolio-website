# Loading and colour-fringe investigation

The retained change splits Fredericka into a common-text font and an extended font selected by CSS unicode ranges. The original 209,716-byte file remains available. Initial casino loading now fetches the 149,016-byte common file, saving 60,700 bytes (29% of that font, about 2% of the whole page). Extended characters remain supported through a 103,328-byte on-demand file; a page needing both subsets downloads more than the original single font. Outlines and horizontal metrics are preserved for all 226 supported characters. The casino explicitly requests its display text; other callers can still request the full family.

`python3 scripts/split-casino-outline-font.py` regenerates the two subsets and verifies every outline/advance against the original. `scripts/check-casino-font-loader.ts` checks concurrent loading, reuse, selective CSS loading and the full-family fallback. A fresh browser checked that only the common subset loads initially, that extended characters request the extended subset, and that 102 common/extended test characters render pixel-for-pixel identically to the original. No page errors. Production build/TypeScript passed.

## Experiments not retained

The apparent chromatic aberration is the watercolor recipe's per-channel bleed, rather than a separate spherical-aberration pass. A local-only variant gave all three colour channels the same sample radius. It did not consistently shorten startup: ordinary scene material preparation remained roughly 1.8–2.6 seconds, and the largest generated shader changed only from 129,388 to 128,920 characters. The rest of the watercolor graph remains expensive. This is a startup test, not a GPU timing measurement of the effect's per-frame cost. The variant was removed and the original look remains.

Early colour compilation while models downloaded was also tested, retaining the final all-actor/all-pass preparation and GPU fence. Two alternating pairs measured scene readiness at 8.361 → 7.335 seconds and 5.883 → 6.296 seconds. Early work sometimes competed with asset/actor setup and increased total shader work. This did not establish a repeatable gain; the experiment was removed.

## Measurement limits

Tests used a local Next production server, Chromium hardware WebGPU, 1280×800 at DPR 1, a fresh browser profile, disabled HTTP/shader disk caches, and a simulated 10 Mbps connection with 40 ms latency. OS/driver caches can persist. Other active browser workloads made timings noisy; these numbers are not promises for production or physical phones. The initial three normal-path measurements reached scene readiness at 6.664, 5.827 and 5.774 seconds. The first completed non-analytics download at 3.443 seconds; shader preparation then accounted for roughly 2.9 seconds. Downloads and setup overlap, so stage durations are not additive.

Raw stage summaries are in `casino-loading-followup-2026-09-16.json`. Temporary detailed profiles are `/private/tmp/portfolio-deep-*.json` and `.cpuprofile`. Local analytics returns an expected 404 outside Vercel.

The definite gain is the font-byte reduction. No large overall loading-time improvement is claimed. Existing card recordings, shader readiness gates, image quality, and the latest horizontal-to-upright snap are preserved.

Two final uncontaminated fresh-load checks reached readiness at 4.946 and 6.720 seconds and transferred about 3.244 MB. Host workload changed during testing, so the timing difference from earlier baselines is not attributed to the font change. An intervening run was excluded because a preview reload caused a second navigation and doubled its resource accounting.
