import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // The shader node system ships TypeScript source rather than a build
  // artifact, so Next compiles it alongside app code — one source of truth,
  // no build step between the two repos.
  //
  // It must be installed with `--install-links` (real files) rather than as a
  // plain `file:` symlink: Turbopack only resolves within the project root,
  // and a symlink resolves to its real path outside it. That fails as an
  // unresolvable module, not as a subtle bug.
  //
  // No `three` alias needed here — `three` is a peerDependency of the node
  // system, so it brings no nested copy and inherits ours. If that ever
  // regresses to a real dependency, two TSL node registries end up in the
  // bundle and materials render blank with no error to trace.
  transpilePackages: ['blender-to-threejs'],

  // Public files default to `max-age=0, must-revalidate`, so every visit re-asks
  // the server about each of /resume's ~40 assets before it can start. Files
  // whose URL carries a content version (`?v=`) never change under that URL;
  // the rest are fresh for a day and refreshed in the background after that.
  // Replacing an unversioned file in place can show the old one for up to a
  // day, so bump its `?v=` (or rename it) when it changes.
  async headers() {
    const asset = '/:path*/:file([^/]+\\.(?:webp|png|jpe?g|svg|avif|gif|glb|gltf|bin|gz|ktx2|woff2?|ttf|otf|webm|mov|mp4|json|wasm|pdf))'
    return [
      { source: asset, headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=2592000' }] },
      { source: asset, has: [{ type: 'query', key: 'v' }], headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ]
  },

  outputFileTracingIncludes: {
    '/api/motion-runtime/*': ['./node_modules/@mediapipe/tasks-vision/vision_bundle.js', './node_modules/@mediapipe/tasks-vision/wasm/**/*'],
  },

};

export default nextConfig;
