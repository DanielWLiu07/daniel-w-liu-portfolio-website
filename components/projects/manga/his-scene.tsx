'use client'

/**
 * His Blender scene, with the ship as its only object.
 *
 * Everything here is transcribed from
 * ~/Dev/3D/personal_website_assets/scenes/"hatching & manga shaders.blend",
 * scene "Scene". Nothing is chosen for how it looks. The point of this page is
 * that it can be held next to a Blender render and be WRONG, which no other page
 * in this section can: the projects page normalises the rig and re-spaces the
 * hatch because its subject moves, and a look that has been tuned cannot be
 * checked.
 *
 * The one departure, and it is unavoidable: WHERE the ship sits. In his file the
 * ship is parked at world x = +3.95, which is behind frame_camera (camera-space
 * depth -2.1 to -3.0) and flagged hide_render. It is storage, not a composition.
 * So it is translated, unrotated and unscaled, until its bounding-box centre
 * lands on the subject position his scene already has: the one filled_slate
 * occupies, at Blender (-5.0006, -0.0092, 0). The Blender reference render is
 * built by the same rule, so the two are comparable.
 *
 * Reference: tools-side, scratch copy only. His file is never opened for
 * writing.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Line2NodeMaterial, WebGPURenderer } from 'three/webgpu'
import { LineSegments2 } from 'three/examples/jsm/lines/webgpu/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import {
  BLENDER_CREASE_THRESHOLD,
  blenderFovY,
  blenderMatrixToThree,
  blenderToThree,
  compileMaterial,
  graph,
  lineArtEdges,
  lineArtSegments,
  type SketchLight,
} from 'blender-to-threejs'
import { HIS_RIG, hisHatchMaterial } from './hatch-material'
import { fromVideoMaterial, type FromVideoLayer } from './from-video-material'
import { fromVideoIRMaterial } from './from-video-ir'
import { partsBounds, useSpaceshipLocal, useSpaceshipWorld } from './spaceship'

/** scene.render.resolution_x / resolution_y: 5472 x 5006 */
export const BLENDER_ASPECT = 5472 / 5006

/** frame_camera: 50 mm on a 36 x 24 sensor, sensor_fit AUTO */
const LENS = { lens: 50, sensorWidth: 36, sensorHeight: 24, sensorFit: 'AUTO' as const }

/** frame_camera's world position, Blender (1.4, 0, 0.019558) */
const CAM = blenderToThree(1.4, 0, 0.019558)
/**
 * Where it looks. His camera's rotation is (90, 0, 90) degrees, whose matrix
 * puts its local -Z on world -X and its local +Y on world +Z, so it looks along
 * -X with +Z up. Under the Y-up conversion that is -X with +Y up, which is
 * Three's default up, so no roll correction is needed. Checked rather than
 * assumed: his camera's right is world +Y, which converts to Three -Z, and a
 * Three camera looking down -X with up +Y has its right on -Z too.
 */
const LOOK_AT = new THREE.Vector3(CAM.x - 1, CAM.y, CAM.z)

/**
 * THE PROJECTS SCENE.
 *
 * Source: ~/Downloads/"hatching & manga shaders.blend" — a DIFFERENT and much
 * bigger file than the copy in Dev/3D/personal_website_assets/scenes. That copy
 * is a later strip-down: shader balls, and the ship parked behind the camera.
 * This one is the render file the projects background VIDEO came out of: 656
 * objects, a 1920x1080 Scene on Camera.001 over frames 0..75, the station, the
 * city, the character, the PROJECTS sign, and `from video` on all of it.
 *
 * The material is byte-identical between the two files, checked node by node.
 * What is completely different is the SCENE, which is why the port kept looking
 * wrong: it was being lit by the shader-ball rig (one lamp, a white page) rather
 * than this one (three lamps, black space).
 *
 * Frame 55 is the moment the ship reads as the video does, white hull against
 * black. At 40 it is nearly silhouette; the lighting swings a lot as it flies.
 */
const PROJECTS_FRAME = 55
/** ?hand: build the hand-transcribed material instead of the one from the IR */
let HAND_PORT = false
if (typeof window !== 'undefined') HAND_PORT = new URLSearchParams(window.location.search).has('hand')

/**
 * All three of these render, none is light-linked, and TWO carry a per-light
 * Exposure that does not show up in the Power field:
 *   Sun       0.1 W at -0.578735 stops -> 0.066936
 *   Point    12.6 W at +0.451970 stops -> 17.2367
 *   Point.001 10.0 W at 0 stops        -> 10.0
 */
const PROJECTS_LIGHTS: readonly SketchLight[] = [
  // travel direction (-0.37118, 0.90034, 0.22719); surface-to-light is its
  // negation, then Blender (x,y,z) -> Three (x, z, -y)
  { kind: 'sun', dir: new THREE.Vector3(0.37118, -0.22719, 0.90034).normalize(), energy: 0.1, exposure: -0.578735 },
  { kind: 'point', position: blenderToThree(0.88167, -0.13634, 0.49466), power: 12.6, exposure: 0.45197 },
  { kind: 'point', position: blenderToThree(-3.60949, -0.94623, 0.61978), power: 10.0, exposure: 0 },
]

/** Camera.001 at frame 55, still looking -X with +Z up */
const PROJECTS_CAM = blenderToThree(6.04, 0, 0.179558)
const PROJECTS_LOOK = new THREE.Vector3(PROJECTS_CAM.x - 1, PROJECTS_CAM.y, PROJECTS_CAM.z)
/** 1920 x 1080, so sensor_fit AUTO is a HORIZONTAL fit here, unlike the portrait library scene */
const PROJECTS_ASPECT = 1920 / 1080
/** its World is the same 0.0802479 background the other scene uses */
const PROJECTS_WORLD = 0.0802479

/** Cube.010 / Cube.003 world matrix at frame 55, from his file */
const PROJECTS_SHIP = blenderMatrixToThree([
  [0.114944, 0.078537, 0.053172, 0.706712],
  [-0.091275, 0.114301, 0.028486, 0.596692],
  [-0.025771, -0.05454, 0.136267, -0.385073],
  [0, 0, 0, 1],
])

/** filled_slate's origin: the spot his scene puts a subject in. */
const SUBJECT = blenderToThree(-5.00062, -0.009162, 0.0)

/**
 * The lighting half of his material on its own: Diffuse BSDF (0.8, roughness 0)
 * -> Shader to RGB -> Surface.
 *
 * Worth a switch of its own because the finished shader ends in a CONSTANT ramp,
 * which is a hard cut to black or white. That threshold hides every near miss:
 * a rig that is 30 percent out prints an almost identical frame until suddenly
 * it does not. The tone pass is continuous, so it shows the error.
 */
export function toneMaterial(): THREE.Material {
  const g = graph()
  const m = compileMaterial(
    g.shaderToRgb(
      g.diffuseBsdf([0.8, 0.8, 0.8, 1], {
        roughness: 0,
        lights: HIS_RIG.lights,
        worldAmbient: HIS_RIG.worldAmbient,
      }),
    ),
  )
  m.side = THREE.DoubleSide
  return m
}

/**
 * His scene's Grease Pencil Line Art, over the shading.
 *
 * NOT decoration and not my idea of a nice outline: `LineArt` is a renderable
 * object in his scene with a LINEART modifier over the whole scene, contour +
 * crease + intersection on, crease threshold 140 degrees, thickness 25, material
 * "Black". My first reference render excluded it along with the slate, which is
 * why the copy matched a render that did not look like his scene.
 *
 * Intersection lines are not implemented (they need a BVH and a clipper), so a
 * ported frame is missing strokes wherever two of his objects interpenetrate.
 * Here there is one object, so there are none to miss.
 *
 * The strokes are pulled a little toward the eye before drawing. A contour edge
 * lies exactly on the surface it outlines, so at equal depth it z-fights into a
 * dashed line; Blender does not have this problem because Grease Pencil is not
 * competing with the same depth buffer.
 */
function LineArt({
  parts,
  widthPx,
  nudge,
  eye = CAM,
  crease = BLENDER_CREASE_THRESHOLD,
}: {
  parts: THREE.BufferGeometry[]
  widthPx: number
  nudge: number
  eye?: THREE.Vector3
  /** radians; Blender's own is 140 degrees. Lower means FEWER creases qualify. */
  crease?: number
}) {
  const { size } = useThree()
  const object = useMemo(() => {
    const edges = lineArtEdges(parts, { creaseThreshold: crease })
    const seg = lineArtSegments(edges, eye)
    // toward the eye, proportional to distance so the bias is constant on screen
    const pulled = new Float32Array(seg.length)
    const v = new THREE.Vector3()
    for (let i = 0; i < seg.length; i += 3) {
      v.set(eye.x - seg[i], eye.y - seg[i + 1], eye.z - seg[i + 2])
      const inv = nudge / Math.max(v.length(), 1e-6)
      pulled[i] = seg[i] + v.x * inv
      pulled[i + 1] = seg[i + 1] + v.y * inv
      pulled[i + 2] = seg[i + 2] + v.z * inv
    }
    const g = new LineSegmentsGeometry()
    g.setPositions(pulled)
    const m = new Line2NodeMaterial({ color: 0x000000, linewidth: widthPx, worldUnits: false })
    m.depthTest = true
    const o = new LineSegments2(g, m)
    // it is one object with no transform of its own; the segments are already
    // in the same space the meshes are
    o.frustumCulled = false
    const w = window as unknown as Record<string, unknown>
    w.__lineArt = { ...edges.stats, drawn: seg.length / 6, widthPx, nudge }
    return o
  }, [parts, widthPx, nudge])

  // The WebGPU line material reads the viewport itself, so unlike the WebGL
  // LineMaterial there is no `resolution` uniform to keep in sync; the width
  // stays in pixels across a resize on its own. `size` is still a dependency so
  // the material is revisited if that ever stops being true.
  useEffect(() => {
    const m = object.material as Line2NodeMaterial
    m.linewidth = widthPx
    m.needsUpdate = true
  }, [object, size.width, size.height, widthPx])

  useEffect(() => () => {
    object.geometry.dispose()
    ;(object.material as THREE.Material).dispose()
  }, [object])

  return <primitive object={object} />
}

function Ship({
  material,
  lineArt,
  lineWidth,
  nudge,
  crease,
}: {
  material: THREE.Material
  lineArt: boolean
  lineWidth: number
  nudge: number
  crease: number
}) {
  const world = useSpaceshipWorld()
  const parts = useMemo(() => {
    const cloned = world.map((g) => g.clone())
    const centre = partsBounds(cloned).getCenter(new THREE.Vector3())
    const delta = SUBJECT.clone().sub(centre)
    const m = new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z)
    for (const g of cloned) {
      g.applyMatrix4(m)
      g.computeBoundingBox()
      g.computeBoundingSphere()
    }
    // What the page ACTUALLY built, published so a capture can read it back.
    // A frame that is too bright has many possible causes and staring at it
    // separates none of them; the numbers do.
    const box = partsBounds(cloned)
    const lit = HIS_RIG.lights[0]
    const w = window as unknown as Record<string, unknown>
    w.__ref = {
      parts: cloned.length,
      bboxMin: box.min.toArray().map((v) => +v.toFixed(4)),
      bboxMax: box.max.toArray().map((v) => +v.toFixed(4)),
      centre: box.getCenter(new THREE.Vector3()).toArray().map((v) => +v.toFixed(4)),
      subject: SUBJECT.toArray(),
      camera: CAM.toArray(),
      rig: HIS_RIG.lights,
      worldAmbient: HIS_RIG.worldAmbient,
      lightToCentre:
        lit && 'position' in lit
          ? +lit.position.distanceTo(box.getCenter(new THREE.Vector3())).toFixed(4)
          : null,
    }
    return cloned
  }, [world])
  return (
    <>
      {parts.map((g, i) => (
        <mesh key={i} geometry={g} material={material} />
      ))}
      {lineArt && <LineArt parts={parts} widthPx={lineWidth} nudge={nudge} />}
    </>
  )
}

/**
 * The camera, driven rather than declared.
 *
 * r3f's `camera` prop takes a fov and leaves the rest to defaults, and the two
 * things that have to be exact here are the field of view (Blender states it on
 * the sensor's LONG axis, Three always wants the vertical one) and the look
 * direction. Both are recomputed on resize, because the canvas is aspect-locked
 * but not size-locked.
 */
/**
 * The ship wearing `from video`, kept UNBAKED so each part has its own local
 * space.
 *
 * Blender's Generated coordinate (the orco) is per-OBJECT and pre-transform,
 * normalised into that object's own bounding box, and this shader reads it in
 * four places. Baking world matrices into the geometry, which useSpaceshipWorld
 * does for the Line Art path, replaces each object's box with the world one and
 * gives every part a different pattern than Blender draws.
 */
/**
 * His Line Art over the from-video ship. The strokes are traced from the SAME
 * placed geometry the shaded meshes use, so they land on it rather than beside
 * it: the baked path is the right source for this even though the shading path
 * is not, because Line Art is a world-space tracer with no use for orco.
 */
function LineArtOverShip({ widthPx, nudge, eye, crease }: { widthPx: number; nudge: number; eye: THREE.Vector3; crease: number }) {
  const local = useSpaceshipLocal()
  const parts = useMemo(() => {
    // the tracer works in world space, so the geometry is baked to the frame-55
    // pose here; the SHADING path deliberately does not bake, because Generated
    // needs each part's own local box
    const cloned = local.map((p) => p.geometry.clone())
    for (const g of cloned) {
      g.applyMatrix4(PROJECTS_SHIP)
      g.computeBoundingBox()
      g.computeBoundingSphere()
    }
    return cloned
  }, [local])
  return <LineArt parts={parts} widthPx={widthPx} nudge={nudge} eye={eye} crease={crease} />
}

function ShipFromVideo({ layer }: { layer: FromVideoLayer }) {
  const parts = useSpaceshipLocal()
  const materials = useMemo(
    () =>
      // `?hand` builds the hand-transcribed port instead, so the two can be put
      // next to each other and next to Blender
      parts.map((p) =>
        layer === 'all' && !HAND_PORT
          ? fromVideoIRMaterial({ lights: PROJECTS_LIGHTS, worldAmbient: PROJECTS_WORLD, bounds: p.bounds })
          : fromVideoMaterial({ lights: PROJECTS_LIGHTS, worldAmbient: PROJECTS_WORLD, bounds: p.bounds, layer }),
      ),
    [parts, layer],
  )

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__ref = {
      shader: 'video',
      built: HAND_PORT ? 'hand' : 'ir',
      frame: PROJECTS_FRAME,
      parts: parts.map((p) => ({ name: p.name, bounds: p.bounds })),
      rig: PROJECTS_LIGHTS,
      worldAmbient: PROJECTS_WORLD,
      shipMatrix: PROJECTS_SHIP.elements,
    }
    return () => {
      for (const m of materials) m.dispose()
    }
  }, [parts, materials])

  // Both parts share one world matrix in his file (Cube.003 sits on Cube.010
  // with an identity local), so the frame-55 matrix is applied to each mesh
  // directly rather than through the glTF's own node transforms.
  return (
    <>
      {parts.map((p, i) => (
        <mesh
          key={i}
          geometry={p.geometry}
          material={materials[i]}
          matrixAutoUpdate={false}
          matrix={PROJECTS_SHIP}
        />
      ))}
    </>
  )
}

function Rig({ eye, target }: { eye: THREE.Vector3; target: THREE.Vector3 }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.position.copy(eye)
    cam.up.set(0, 1, 0)
    cam.lookAt(target)
    cam.fov = blenderFovY(LENS, size.width / size.height)
    cam.near = 0.1
    cam.far = 1000
    cam.updateProjectionMatrix()
    const w = window as unknown as Record<string, unknown>
    w.__refCam = {
      size: [size.width, size.height],
      aspect: +(size.width / size.height).toFixed(5),
      fovY: +cam.fov.toFixed(4),
      position: cam.position.toArray(),
      lookAt: LOOK_AT.toArray(),
    }
  }, [camera, size.width, size.height, eye, target])
  return null
}

/**
 * The page. `?tone` swaps the finished ink for the lighting pass underneath it;
 * `?bg=<css colour>` paints behind the transparent film his render also has.
 */
/**
 * A flat linear grey, filling the frame. Not a look: a check on the OUTPUT
 * PIPELINE, which has to be eliminated before any tone difference can be blamed
 * on the shading. Blender's Standard view transform is a plain sRGB encode, and
 * so is Three's default output colour space, but "should be" is how the last
 * four wrong answers started. Feed a known linear value in, read the pixel out.
 */
export function constMaterial(v: number): THREE.Material {
  const g = graph()
  const m = compileMaterial(g.rgb(v, v, v))
  m.side = THREE.DoubleSide
  return m
}

/**
 * The light term alone: world 0, and an albedo of 0.2 rather than 1 purely so
 * the result stays inside 0..1 and survives an 8-bit screenshot without
 * clipping. The frame is then 0.2 * sum(E * N.L) / pi and nothing else, which
 * isolates geometry and rig from the ambient and the ramp chain above them.
 */
export const SHADE_ALBEDO = 0.2
export function shadeMaterial(): THREE.Material {
  const g = graph()
  const m = compileMaterial(
    g.shaderToRgb(
      g.diffuseBsdf([SHADE_ALBEDO, SHADE_ALBEDO, SHADE_ALBEDO, 1], {
        roughness: 0,
        lights: HIS_RIG.lights,
        worldAmbient: 0,
      }),
    ),
  )
  m.side = THREE.DoubleSide
  return m
}

export type RefMode = 'ink' | 'tone' | 'shade' | 'const'

/**
 * Which of his shaders the ship wears.
 *
 * 'video' is the ship's OWN material, `from video`, which is the one the
 * projects-page background was rendered with. 'hatch' is
 * "3. Cross hatching shader", which lives on his shader BALLS and was never on
 * this model; it was put here by earlier work because it was the shader under
 * study, and the result looked nothing like his scene for exactly that reason.
 */
export type ShaderName = 'video' | 'hatch'

export default function HisScene({
  mode,
  shader,
  layer,
  constant,
  background,
  lineArt,
  lineWidth,
  nudge,
  crease,
}: {
  mode: RefMode
  shader: ShaderName
  layer: FromVideoLayer
  constant: number
  background?: string
  lineArt: boolean
  lineWidth: number
  nudge: number
  crease: number
}) {
  const material = useMemo(() => {
    if (mode === 'const') return constMaterial(constant)
    if (mode === 'shade') return shadeMaterial()
    if (mode === 'tone') return toneMaterial()
    return hisHatchMaterial()
  }, [mode, constant])
  const ref = useRef<HTMLDivElement>(null)
  // the from-video shader belongs to the PROJECTS scene and is meaningless under
  // the shader-ball rig; the cross-hatch shader belongs to the other one
  const projects = mode === 'ink' && shader === 'video'
  const eye = projects ? PROJECTS_CAM : CAM
  const target = projects ? PROJECTS_LOOK : LOOK_AT
  const ar = projects ? PROJECTS_ASPECT : BLENDER_ASPECT
  const bg = background ?? (projects ? '#000000' : '#ffffff')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: bg,
        display: 'grid',
        placeItems: 'center',
        // above the site chrome, which sits at z-[10000]. This page is a
        // measurement, and chrome in the frame is pixels being compared against
        // a Blender render that has no chrome. The first attempt used 100 and
        // lost, which showed up as a silhouette mask running the full height of
        // the frame rather than as anything that looked wrong.
        zIndex: 100000,
      }}
    >
      <div
        ref={ref}
        data-capture="stage"
        style={{
          aspectRatio: String(ar),
          width: `min(100vw, calc(100vh * ${ar}))`,
          height: `min(100vh, calc(100vw / ${ar}))`,
          background: bg,
        }}
      >
        <Canvas
          dpr={1}
          /**
           * `flat` is NOT cosmetic and NOT optional.
           *
           * react-three-fiber sets toneMapping to ACESFilmic on the renderer
           * AFTER the gl factory returns, so setting NoToneMapping inside the
           * factory is overwritten and nothing warns. Measured through this
           * page's own ?const mode, a linear 0.05 came back as 0.0319, 0.5 as
           * 0.5583 and 0.8 as 0.7084, which is Three's ACES curve to four
           * decimals: darks crushed, mids lifted, highlights rolled off. Against
           * Blender's Standard view transform that is a 2.3x error in the darks
           * and it looks like a shader bug, which is where I went looking.
           * `flat` sets NoToneMapping and survives.
           */
          flat
          gl={async (props) => {
            const renderer = new WebGPURenderer({
              canvas: props.canvas as HTMLCanvasElement,
              antialias: true,
              alpha: true,
            })
            await renderer.init()
            // Blender's view transform is Standard and its display device sRGB,
            // which is a plain sRGB encode of the linear value with no curve.
            // Three's default output colour space is the same encode; the tone
            // mapping is what has to be turned off, or every value above about
            // 0.6 comes back rolled off and the comparison is meaningless.
            renderer.toneMapping = THREE.NoToneMapping
            renderer.outputColorSpace = THREE.SRGBColorSpace
            return renderer as unknown as never
          }}
        >
          <Rig eye={eye} target={target} />
          {mode === 'ink' && shader === 'video' ? (
            <>
              <ShipFromVideo layer={layer} />
              {lineArt && <LineArtOverShip widthPx={lineWidth} nudge={nudge} eye={PROJECTS_CAM} crease={crease} />}
            </>
          ) : mode === 'const' ? (
            // a quad on the near plane, so the frame is nothing but the value
            <mesh material={material} position={[CAM.x - 0.5, CAM.y, CAM.z]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[10, 10]} />
            </mesh>
          ) : (
            <Ship material={material} lineArt={lineArt} lineWidth={lineWidth} nudge={nudge} crease={crease} />
          )}
        </Canvas>
      </div>
    </div>
  )
}
