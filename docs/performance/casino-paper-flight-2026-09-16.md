# Repeatable card launch and contact response — 2026-09-16

The prior launch inferred chip velocity from adjacent rendered frames and selected the impact from a sampled crossing. Frame cadence could therefore change the launch. The previous overlap correction separated bounding boxes with camera-centred scaling; it did not provide physical contact response.

The launch now uses an authored beat derived from the existing flick/rise/delay controls and a deterministic ballistic launch speed. The initial card pose is evaluated at that exact beat even when a frame skips it. All 67 released cards use the already-shipped Rapier runtime, finite cuboid colliders, CCD, friction, restitution and air damping. Overlapping starting stock is packed into separate depths in the wall frame without scaling it. Contact margins keep solver tolerance outside the printed edges. Physics advances at 480 Hz, and rendering interpolates rigid poses. Cards and their word meshes share a rigid transform; card sizes are preserved. Reverse scrubbing rebuilds the same initial conditions. Background-tab catch-up stops simulating after twelve seconds, when the paper is below the set.

Only the released paper cards participate in this simulation. The foreground royal-flush hand, roulette, table and dealer retain their choreography/render layers. Cards are rigid stock; this does not simulate paper bending.

## Verification

- `scripts/check-paper-flight.ts`: identical output across regular frames, large frame gaps and reverse scrubbing; visible stock intersection checks across sampled motion; contact response differs from isolated free flight; attached word transforms and card scales preserved; bounded background catch-up.
- Existing composition, render-layer, intro-readiness and dealer-handoff checks passed.
- Production build and TypeScript passed.
- Real scene held at 4.8 s in normal Chrome and 4× CPU-throttled Chrome: all 67 world matrices matched exactly (maximum element difference 0). All 2,211 card pairs at that captured frame had no visible-stock OBB intersections.
- Desktop and portrait browser flows passed for intro, settled scene, chip interaction, folder open/close and navigation away/back. No application/WebGPU errors.
- Reviewed the upward, apex and falling views. Physical contact changes the old pre-authored trajectories by design.

Temporary evidence: `/private/tmp/paper-browser-{1,4}.json`, `/private/tmp/check-paper-browser.cjs`, `/private/tmp/check-paper-contacts.mts`, `/private/tmp/paper-{rise,apex,fall}.png`. Viewport tests use a desktop GPU, not physical mobile hardware. Timing-specific browser checks used local production builds; no claim of a startup-speed gain.

Final moving-sequence validation captured 365 frames and checked 807,015 card pairs: zero visible-stock OBB intersections, zero rounded-face intersections, and no browser errors. Earlier candidates exposed brief starting/edge contacts; those candidates were not deployed. The final normal/4× CPU runs again matched all 67 world matrices exactly. Full temporary sequence: `/private/tmp/paper-sequence.json`; validator: `/private/tmp/check-paper-sequence-contacts.mts`. Final held view: `/private/tmp/paper-final-1.png`.
