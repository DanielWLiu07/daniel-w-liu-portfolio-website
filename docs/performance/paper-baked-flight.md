# Baked card burst

The 67-card burst is simulated offline with Rapier, recorded at 30 Hz for six seconds, then played using interpolated rigid poses. Production loads no physics engine for the burst. Chips and dice retain their interaction-triggered physics imports.

Desktop and portrait have separate launch fixtures. The page downloads only the matching recording: 68,265 and 67,950 bytes respectively. These are additional animation data, replacing the previous roughly 726 KB compressed physics-runtime requirement. Positions and quaternions are quantized to 16 bits, second-differenced by channel, and gzip-compressed. Decompression and reconstruction happen once; playback reads two poses per card with linear position interpolation and quaternion slerp.

The recording is transformed as a whole into the launch frame. Each card and its attached lettering are scaled together to the recorded collision footprint, so responsive changes cannot enlarge stock beyond its tested bounds. The pre-launch blend joins the first recorded pose without a jump. Reverse scrubbing directly samples the same recording. Playback holds the last frame after the cards have fallen out of view; there is no catch-up simulation.

## Rebuild

- `npx tsx scripts/bake-paper-flight.ts` recreates both assets from the checked-in launch fixtures. The offline solver lives in `scripts/lib/paper-bake-solver.ts`; application code must never import it.
- `npx tsx scripts/check-paper-recording.ts` checks compressed/interpolated playback, transformed layouts, responsive card scaling, launch continuity, lettering attachment and replay.
- `npx tsx scripts/check-paper-flight.ts` checks the isolated analytic authoring fallback.
- Run `npm run build` after changing the runtime or format.

When the wall choreography or geometry changes, start a local production preview and run `node scripts/capture-paper-bake.cjs` first. Set `PREVIEW_URL`, `CHROME_PATH` and `PUPPETEER_MODULE` if needed. The capture requests `paperBake=1`, a localhost-only switch that uses the authored launch instead of feeding an existing recording back into the bake. The default preview is localhost:3144. Commit the updated fixtures and recordings together. Increment the recording URL version when publishing changed assets.

## Validation for the initial recording

- Both recordings: 1,594,131 pair checks each at 120 Hz before writing the compressed asset; no intersections.
- Runtime playback: 19,116,306 pair checks at 240 Hz across desktop/portrait and scales 0.4, 1 and 2.5, including rotated/translated parents and resized carriers; no intersections.
- Actual rendered ultrawide (2560×1080) and phone (390×844) scenes: 1,019,271 pair checks across 461 captured frames; no intersections or browser errors. Each requested exactly its matching asset.
- 1920×1050 Chromium, 4× CPU slowdown, intro seconds 3–7: median frame interval 16.7 ms, p95 33.3 ms, maximum 33.4 ms (224 frames). These are measurements from this machine, not a guarantee for all GPUs.
- Local decoder microbenchmark: 2.6 ms initial reconstruction and approximately 0.011 ms to sample all 67 cards per frame, excluding scene transforms and drawing.

The bake validates this authored burst and its uniform spatial/time transforms; arbitrary new choreography needs a new bake. Foreground royal-flush cards retain their separate existing depth-stack choreography.
