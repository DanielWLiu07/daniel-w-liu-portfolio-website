import type { Camera, Material, Object3D } from 'three'
import { cameraFar, cameraNear, positionView, uniform, viewZToPerspectiveDepth } from 'three/tsl'
import type { NodeMaterial } from 'three/webgpu'

/** Real render layers, independent of physical intersections with the table.
 * Depth remains monotonic within each layer, so tumbling stock self-occludes.
 * No extra scene pass, geometry displacement, fading or disabled depth tests.
 */
export function cardRenderLayer(object: Object3D | null): number {
  return explicitLayer(object) ?? 0
}

function explicitLayer(object: Object3D | null): number | undefined {
  for (let o = object; o; o = o.parent) {
    if (o.userData.cardRenderLayer !== undefined) return o.userData.cardRenderLayer as number
  }
  return undefined
}

export function createCardLayerDepth(viewCamera?: Camera) {
  const layer = uniform(0).onObjectUpdate(({ object, camera }) =>
    !viewCamera || camera === viewCamera ? cardRenderLayer(object) : 0)
  const native = viewZToPerspectiveDepth(positionView.z, cameraNear, cameraFar)
  // Smooth bounded distance gives far better intra-card precision than squeezing
  // already nonlinear camera depth near 1 into a narrow interval.
  const distance = positionView.z.negate().max(0)
  const order = distance.div(distance.add(20))
  return layer.equal(1).select(order.mul(.2).add(.2),
    layer.equal(2).select(order.mul(.15), native))
}

export class CardRenderLayers {
  readonly depth: ReturnType<typeof createCardLayerDepth>
  private installed = new WeakSet<Material>()

  constructor(camera?: Camera) {
    // Shadow cameras keep physical depth; only the viewing camera gets layers.
    this.depth = createCardLayerDepth(camera)
  }

  prepare(root: Object3D) {
    root.traverse(object => {
      const value = (object as Object3D & { material?: Material | Material[] }).material
      if (!value || explicitLayer(object) === undefined) return
      const materials = Array.isArray(value) ? value : [value]
      for (const material of materials) {
        const nodeMaterial = material as NodeMaterial
        if (!nodeMaterial.isNodeMaterial || this.installed.has(material)) continue
        nodeMaterial.depthNode = this.depth
        nodeMaterial.needsUpdate = true
        this.installed.add(material)
      }
    })
  }
}
