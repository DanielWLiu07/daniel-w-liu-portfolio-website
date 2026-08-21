'use client'

/**
 * The round poker table: a Meshy preview mesh (see CASINO-GENERATION.md, table
 * v1) imported per the spec (flat normals, no textures) and shaded by ONE
 * material graph that decides by geometry: the flat top inside the rail radius
 * is felt (feltMaterialGraph), everything else prints as ink. Thresholds come
 * from the mesh's own bounds so a regenerated table keeps working.
 *
 * Reports the felt height so props can land on it.
 */
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CASINO_PALETTE, compileMaterial, feltMaterialGraph, graph, growFromImpact, materialUniforms, revealMask } from 'blender-to-threejs'
import type { ImpactFx } from './hero-chip'

export const TABLE_URL = '/models/casino-table-v1.glb'
const [INK_BLACK, , INK_GREEN] = CASINO_PALETTE.inks

export interface TableFit {
  /** world y of the felt surface */
  feltY: number
  /** world radius of the felt disc */
  feltR: number
}

export default function RoundTable({
  diameter = 7,
  onFit,
  reveal,
  fx,
}: {
  diameter?: number
  onFit?: (fit: TableFit) => void
  /** paint the table in from this world XZ when the chip lands (pomme's uGrow beat) */
  reveal?: [number, number]
  fx?: MutableRefObject<ImpactFx>
}) {
  const { scene } = useGLTF(TABLE_URL)
  const materials = useRef<THREE.Material[]>([])

  const { model, feltY, feltR, mats } = useMemo(() => {
    const mats: THREE.Material[] = []
    const root = scene.clone(true)
    // flat normals + geometry-split material, one graph per mesh (thresholds in the mesh's own units)
    const bounds = new THREE.Box3().setFromObject(root)
    const size = bounds.getSize(new THREE.Vector3())
    const centre = bounds.getCenter(new THREE.Vector3())
    const topY = bounds.max.y
    const rTop = Math.max(size.x, size.z) / 2
    // normalise first: diameter across x/z, resting on y = 0, centred at the origin
    const s = diameter / Math.max(size.x, size.z)
    const feltYw = (topY - bounds.min.y) * s
    const feltRw = rTop * 0.82 * s
    const heightW = size.y * s
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const flat = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      flat.computeVertexNormals()
      o.geometry = flat
      o.castShadow = true
      o.receiveShadow = true
      // classify in WORLD space: the glb node is rotated (Z-up geometry), so
      // object-space "up" is not +y; the table sits at the origin after normalisation
      const g = graph()
      const p = g.position('world')
      const n = g.normal('world')
      const up = g.greaterThan(g.separate(n, 'y'), 0.85)
      const nearTop = g.greaterThan(g.separate(p, 'y'), feltYw - heightW * 0.12)
      const px = g.separate(p, 'x')
      const pz = g.separate(p, 'z')
      const r = g.math('SQRT', g.add(g.multiply(px, px), g.multiply(pz, pz)))
      const inside = g.greaterThan(feltRw, r)
      const isFelt = g.multiply(g.multiply(up, nearTop), inside)
      const felt = feltMaterialGraph(g, g.rgb(...INK_GREEN))
      const lift = g.mapRange(g.separate(n, 'y'), { from: [-1, 1], to: [0.75, 1.15], clamp: true })
      const ink = g.multiplyColor(1, g.rgb(...INK_BLACK), g.combine(lift, lift, lift))
      let col = g.blend(isFelt, ink, felt)
      if (reveal) {
        // paint-in from the landing point: soaked darker rim at the wet front, cut out where unpainted.
        // A cutout (alphaTest) rather than blending: the table stays opaque and depth-correct, so the
        // pedestal and interior faces never show through the half-painted top; the noisy field gives
        // the ink-blot edge and the compositor bleed softens it
        // below the felt the field runs 4x slower, so the pedestal paints after the top around it
        const drop = g.math('MAXIMUM', g.subtract(feltYw, g.separate(p, 'y')), 0)
        const rv = revealMask(g, { centre: reveal, reach: diameter * 1.2, extraDistance: g.multiply(drop, 4) })
        col = g.blend(g.multiply(rv.rim, 0.35), col, g.multiplyColor(1, col, g.rgb(0.55, 0.5, 0.6)))
        o.material = compileMaterial(col, { opacity: rv.mask, alphaTest: 0.5 })
      } else {
        o.material = compileMaterial(col)
      }
      mats.push(o.material as THREE.Material)
    })
    root.scale.setScalar(s)
    root.position.set(-centre.x * s, -bounds.min.y * s, -centre.z * s)
    return { model: root, feltY: feltYw, feltR: feltRw, mats }
  }, [scene, diameter, reveal])
  useLayoutEffect(() => {
    materials.current = mats
  }, [mats])

  // drive the grow uniform from the chip's impact time (pomme's kick + soak curve)
  useFrame(() => {
    if (!reveal || !fx) return
    const grow = growFromImpact(fx.current.impactAge)
    for (const m of materials.current) {
      const u = materialUniforms(m as unknown as { userData: Record<string, unknown> }).grow
      if (u) u.value = grow
    }
  })

  useLayoutEffect(() => {
    onFit?.({ feltY, feltR })
  }, [feltY, feltR, onFit])

  return <primitive object={model} />
}

useGLTF.preload(TABLE_URL)
