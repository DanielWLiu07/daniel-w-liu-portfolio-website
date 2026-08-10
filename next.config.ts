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

};

export default nextConfig;
