import type { Material } from 'three'
import type { Renderer } from 'three/webgpu'

type RenderObject = (this: unknown, object: object, scene: { overrideMaterial: Material | null }, ...rest: unknown[]) => void
type OverrideRenderer = { _currentSourceMaterial: Material | null; renderObject: RenderObject; info: { frame: number } }

/**
 * r185's override pass (shadow maps, position prepasses) copies each object's
 * alphaTest onto ONE shared scene.overrideMaterial. Material's alphaTest setter
 * bumps `version` whenever the value crosses 0, and this scene mixes cutouts
 * (table, rail, marks, dealer reveal) with opaque meshes, so the shared material's
 * version changes many times per pass. Every later object then misses its cached
 * render object and rebuilds the full material cache key: about a fifth of a frame.
 *
 * Per (object, override) render object, cutout-ness only changes when the object
 * gets another material or its material changes (which bumps that material's
 * version). So on override materials the copy bumps the version only for a
 * material an object takes on after its first frame (multi-material meshes
 * register each group's material during that frame), or a material whose version
 * moved since its last copy. Draw output is unchanged.
 * Keep in sync with Renderer.renderObject when reviewing a Three upgrade.
 */
export function installStableOverrideMaterials(renderer: Renderer) {
  const r = renderer as unknown as OverrideRenderer
  const patched = new WeakSet<Material>()
  let current: object | null = null
  const stabilize = (override: Material) => {
    patched.add(override)
    const seen = new WeakMap<object, { frame: number; versions: WeakMap<Material, number> }>()
    let value = override.alphaTest
    Object.defineProperty(override, 'alphaTest', {
      configurable: true,
      get: () => value,
      set: (next: number) => {
        const source = r._currentSourceMaterial
        if (source && current) {
          let drawn = seen.get(current)
          if (!drawn) seen.set(current, drawn = { frame: r.info.frame, versions: new WeakMap() })
          const last = drawn.versions.get(source)
          if (last === undefined ? drawn.frame !== r.info.frame : last !== source.version) override.needsUpdate = true
          drawn.versions.set(source, source.version)
        } else if (value > 0 !== next > 0) override.needsUpdate = true
        value = next
      },
    })
  }
  const renderObject = r.renderObject
  r.renderObject = function (this: unknown, object, scene, ...rest) {
    const override = scene.overrideMaterial
    if (override && !patched.has(override)) stabilize(override)
    current = object
    try { return renderObject.call(this, object, scene, ...rest) } finally { current = null }
  }
}
