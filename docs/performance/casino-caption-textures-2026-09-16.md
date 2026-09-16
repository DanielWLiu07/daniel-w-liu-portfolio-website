# Caption texture cleanup — 2026-09-16

The four flying-prop captions previously each uploaded a colour canvas and a separate RGBA mask canvas. The mask stored the artwork alpha in its red channel. The caption material now reads the artwork alpha directly and keeps the same independent `captionInk` fade uniform.

## Verified savings

- Caption uploads: 8 → 4. Total external-image uploads during the observed startup: 86 → 82.
- Four 1024×260 RGBA8 textures removed: 4,259,840 bytes at the base level, or 5,678,448 bytes (~5.42 MiB) with their complete mip chains. This is texture payload, excluding driver allocation padding.
- Four CPU mask canvases and their compositing work removed.
- Download payload is essentially unchanged: these canvases are generated locally.
- Shader modules and pipeline counts were unchanged in the observed startup (144 modules, 113 async pipelines). No claim of a measured overall load-time improvement.

## Visual and correctness validation

Captured actual GPU canvas uploads from separate baseline (`4177c46`) and candidate production builds. Recreated the former white-on-black mask from every caption artwork canvas and compared its red channel with the artwork alpha. All 1,064,960 pixels across the four captions matched exactly in each version.

The alpha channel now follows the artwork texture's anisotropic filtering (4) rather than the former mask's default filtering (1); the source coverage is identical, but rendered edge sampling is not promised to be bit-identical. Reviewed before/after screenshots with the flight held at 4.8 seconds: all four words retain their artwork, transparency and placement. Browser error collection was empty for those visual runs. The animated backdrop continues independently, so full-screen screenshots are not a pixel-identical scene comparison.

Production build and TypeScript passed. Detailed upload counts and coverage checks are in `casino-caption-textures-2026-09-16.json`. Temporary browser harnesses: `/private/tmp/portfolio-caption-profile.cjs`, `/private/tmp/check-caption-visual.cjs`, `/private/tmp/check-caption-flows.cjs`. Instrumentation includes CPU pixel reads and is unsuitable for wall-clock speed comparisons.

Desktop (1280×800) and portrait (390×844) browser flows also passed: intro and settled scene, chip interaction, folder open/close, and navigation away/back to verify cached material/uniform reuse. No application/WebGPU errors. These use desktop Chrome/WebGPU, not physical mobile hardware.
