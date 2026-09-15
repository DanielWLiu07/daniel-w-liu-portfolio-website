# Shader runtime snapshot

`blender-to-threejs-1.0.0-depth-layers.tgz` contains the installed shader runtime's
`package.json` and `src/` at preview preparation time. It replaces the
machine-specific sibling-directory dependency so clean remote builds use
exactly the same shader implementation as this portfolio.

Source project: https://github.com/DanielWLiu07/blender-to-threejs (ISC).
No demo assets, development tools, environment files or credentials are bundled.

The snapshot adds `Compositor.setPositionDepth(node)`, allowing the position
AOV to use the same depth ordering as the scene's card layers. Retain this
method when refreshing the archive; no additional render pass is introduced.

To update, copy the intended runtime's `package.json` and `src/` into an empty
temporary directory, run `npm pack <directory> --ignore-scripts --pack-destination vendor`,
then update the lockfile with `npm install --package-lock-only --ignore-scripts`.
