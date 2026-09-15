import { valueNoise, type CompGraph, type CompInput, type CompNode } from 'blender-to-threejs'

const isNode = (v: CompInput): v is CompNode => typeof v === 'object' && v !== null && 'type' in v

/** Reuse the recipe's normal paint before its afterimage/impact treatment; no second scene or paint pass. */
export function withImpactReveal(c: CompGraph, painted: CompInput): CompInput {
  const seen = new Set<CompNode>()
  let normal: CompInput | undefined
  const visit = (v: CompInput) => {
    if (!isNode(v) || seen.has(v)) return
    seen.add(v)
    const factor = v.inputs[0]
    if (v.type === 'CompositorNodeMixRGB' && isNode(factor) && factor.params.uniform === 'after') {
      normal = v.inputs[1]
    }
    v.inputs.forEach(visit)
  }
  visit(painted)
  // Keep this dependency explicit if the upstream watercolor recipe changes its final treatment.
  if (normal === undefined) throw new Error('Watercolor recipe has no normal-paint input before its afterimage')

  return c.setAlpha(c.blend(impactRevealMask(c), painted, normal), 1)
}

/** Shared by the scene's paint return and the dealer's body, in the same screen coordinates. */
export function impactRevealMask(c: CompGraph): CompNode {
  const progress = c.uniform('impactReturn', 0)
  const amount = c.math('MINIMUM', 5, c.math('MAXIMUM', 0, c.uniform('impactNoise', 3)))
  // Equal units on both axes keep the texture consistent on wide and tall screens.
  const uv = c.coords('uniform')
  const x = c.separate(uv, 'r'), y = c.separate(uv, 'g')
  const radius = c.math('SQRT', c.add(c.mul(x, x), c.mul(y, y)))
  // Broad ink lobes with a smaller ragged edge. The pattern stays anchored as its strength
  // grows, so the reveal begins at a tiny centre point even with noise turned all the way up.
  const broad = c.subtract(valueNoise(c, uv, 3.8, [3.1, 7.7]), 0.5)
  const fine = c.subtract(valueNoise(c, uv, 18, [11.2, 4.6]), 0.5)
  const texture = c.add(c.mul(broad, 0.8), c.mul(fine, 0.2))
  const growingAmount = c.mul(amount, progress)
  const roughRadius = c.add(radius, c.mul(c.mul(c.math('MINIMUM', radius, 0.35), texture), growingAmount))
  // Start at zero size. Grow the noise allowance along with the boundary, clearing every
  // corner at completion. Front minus roughRadius always increases (minimum slope 0.6
  // at noise 5), so this ramp cannot cover an already-revealed pixel again.
  const reach = c.add(1.475, c.mul(growingAmount, 0.175))
  const t = c.math('DIVIDE', c.subtract(c.mul(progress, reach), roughRadius), 0.026, 0, { clamp: true })
  const mask = c.mul(c.mul(t, t), c.subtract(3, c.mul(t, 2)))
  return mask
}
