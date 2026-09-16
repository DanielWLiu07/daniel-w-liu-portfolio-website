'use client'

/**
 * The resume folder: Daniel's own Blender model, split into leaves (scratchpad/split_folder.py) and
 * reassembled here so it opens.
 *
 * The export bakes world transforms into the vertices, and the folder stands at an angle in the original
 * scene, so every piece arrives rotated in its own plane. That angle is measured off the back leaf and
 * removed first: only then do bounding boxes mean anything and the crease becomes an axis. The page is the
 * modelled sheet's own footprint given real thickness, lying on the leaf's fitted inner plane, because the
 * leaves are a shallow wedge pinched at the fold and a flat page punches through the cover there.
 *
 * A fully generated folder stays behind ?folder=gen as a fallback.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type Ref } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { bakedSpin, contactPlane, planeAt, planeTilt, unbakeSpin } from 'blender-to-threejs'
import { claimPointer } from './cursor'
import { contactShadowTexture, paperSheet, type Sheet } from './paper'
import { getTune } from './tune'
import { drivePresent } from './materials'
import FolderLeaf, { RESUME_PDF, type LeafFace } from './folder-leaf'
import { folderMaterial, sheetMaterial, stockMaterial } from './materials'
import type { ImpactFx } from './hero-chip'
import { markPropMotion } from './prop-arrival'
import { listenForFolderDismiss } from './folder-dismiss'
import { loadCasinoFont } from './font-loader'

export const RESUME_PAGE = { url: '/resume/resume-page1-lossless.webp', w: 1583, h: 2048 }
/**
 * How long the folder takes to open and to shut. The camera move is driven from the SAME numbers and the
 * same easing (see CameraRig), so the folder and the camera are one move: run them on separate clocks, or
 * put a beat in front of one of them, and the shot reads as two things happening one after the other.
 */
export const FOLDER_TIME = { open: 1.05, shut: 0.75 }
/*
 * How far the cover swings is `fldTurn` on the live tune, and it is NOT 1: opened dead flat the two leaves
 * are one unbroken panel and the crease disappears, which is what made the presented folder read as a
 * printed board rather than a folder. A few degrees short leaves a shallow valley at the fold that catches
 * its own shading, and it is what an open folder actually does, since the card resists the crease.
 *
 * The framing, the lean, the height on screen and the pointer gain are on the tune too (fldFit, fldLean,
 * fldUp, fldTilt): they are proportions of the spread and of the camera's own fov, so they hold on any
 * window shape, and ?tune puts sliders on all of them.
 */
/** Daniel's folder, split into clean leaves in Blender (see scratchpad/split_folder.py) */
export const FOLDER_URL = '/models/resume-folder-split.glb'

// the model's proportions (Blender: leaf 2.0 x 1.837 local, 0.625 scale -> 1.25 x 1.148, thickness 0.028)
const LEAF_W = 1.25
const LEAF_H = 1.148
const LEAF_T = 0.016
const CORNER = 0.05
const TAB_W = 0.36
const TAB_H = 0.075

export interface PageFrameOut {
  centre: THREE.Vector3
  normal: THREE.Vector3
  up: THREE.Vector3
  width: number
  height: number
  open: number
  /** the fold, in world space: the open folder is framed on this so the spread reads symmetrically */
  crease: THREE.Vector3
  /** the whole open spread's extent across the fold, in world units */
  spread: number
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, 0)
  s.lineTo(w / 2 - r, 0)
  s.quadraticCurveTo(w / 2, 0, w / 2, r)
  s.lineTo(w / 2, h - r)
  s.quadraticCurveTo(w / 2, h, w / 2 - r, h)
  s.lineTo(-w / 2 + r, h)
  s.quadraticCurveTo(-w / 2, h, -w / 2, h - r)
  s.lineTo(-w / 2, r)
  s.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0)
  return s
}

/** a leaf: a rounded slab whose crease edge sits at y = 0, extruded along +z */
function leafGeometry(t: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRect(LEAF_W, LEAF_H, CORNER), {
    depth: t,
    bevelEnabled: true,
    bevelThickness: t * 0.25,
    bevelSize: t * 0.25,
    bevelSegments: 1,
    curveSegments: 8,
  })
  g.computeVertexNormals()
  g.computeBoundingBox()
  return g
}

// the font the Blender scene used, loaded once so the cover lettering matches the original render
let labelFont: Promise<void> | null = null
function ensureLabelFont(): Promise<void> {
  if (!labelFont) {
    labelFont = (async () => {
      try {
        await loadCasinoFont('JkWedding', '/shared/fonts/weddingday-font/WeddingdayPersonalUseRegular-1Gvo0.ttf')
      } catch {
        /* falls back to a script face */
      }
    })()
  }
  return labelFont
}

/** the cover's printed lettering: one big "Resume" filling the cover, as in the Blender scene */
function coverLabelTexture(): THREE.CanvasTexture {
  const W = 1024
  const H = Math.round((W * LEAF_H) / LEAF_W)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  x.clearRect(0, 0, W, H)
  const font = "'JkWedding', 'Snell Roundhand', 'Brush Script MT', cursive"
  x.fillStyle = '#26190f'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  // size to fill the cover: measure and scale to the available width
  let size = Math.round(W * 0.42)
  x.font = `${size}px ${font}`
  const target = W * 0.82
  const w0 = x.measureText('Resume').width || target
  size = Math.max(24, Math.round((size * target) / w0))
  x.font = `${size}px ${font}`
  x.fillText('Resume', W * 0.5, H * 0.5)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/**
 * The resume page itself is a click target once the folder is open: it opens the PDF. The page is built
 * imperatively, so the handler lives on a transparent plane that tracks it (r3f only routes events to
 * objects it created). Transparent, so it is a decal to the compositor passes and occludes nothing.
 */
function PageLink({ page, mount, active, size, lift, onHover }: { page: THREE.Mesh; mount: THREE.Object3D | null; active: boolean; size: { w: number; h: number }; lift: number; onHover?: (on: boolean) => void }) {
  const hit = useRef<THREE.Mesh>(null)
  useLayoutEffect(() => {
    const m = hit.current
    if (!m || !mount) return
    mount.add(m)
    return () => {
      mount.remove(m)
    }
    // `active` is here because the mesh is KEYED on it (below): without it this ran once, so after the
    // remount hit.current pointed at a mesh that had never been parented and the page lost its click
  }, [mount, active])
  useFrame(() => {
    const m = hit.current
    if (!m) return
    m.position.copy(page.position)
    // clear of the CURL, not just of the flat page. The sheet bends up to `lift` off its own plane, and
    // the folder group is itself a click target, so a plane sitting on the flat position ends up BEHIND
    // the curled paper: the raycaster hits the folder first, its handler stops propagation, and clicking
    // the resume silently does nothing while still showing a pointer cursor.
    m.position.z += lift
    m.rotation.copy(page.rotation)
  })
  return (
    <mesh
      // Remounted when the folder opens, and that is about EVENTS not drawing. This plane sits in front of
      // the whole folder, so while it was still shut it took a pointerOver that its own handler dropped on
      // !active. r3f had recorded it as hovered by then, so once open no fresh pointerOver ever arrived and
      // the resume showed no pointer cursor until the mouse visited something else and came back. Found by
      // logging in the handler, since the CLICK worked throughout and only the hover was dead.
      key={active ? 'open' : 'shut'}
      ref={hit}
      onPointerOver={(e) => {
        if (!active) return
        // stopped, so this plane owns the cursor; the folder's hover is handed UP instead, because letting
        // the event through to reach it cost this plane its own claim
        e.stopPropagation()
        claimPointer('page', true)
        onHover?.(true)
      }}
      onPointerOut={() => {
        claimPointer('page', false)
        onHover?.(false)
      }}
      onClick={(e) => {
        if (!active) return
        e.stopPropagation()
        window.open(RESUME_PDF, '_blank', 'noopener,noreferrer')
      }}
    >
      <planeGeometry args={[size.w, size.h]} />
      {/* double sided: the page's printed face points down in the model's frame, so a front-sided plane
          copying its rotation presents its BACK to the camera and the raycaster skips it */}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** the master shape of the whole move: smootherstep, zero slope AND zero acceleration at both ends */
/**
 * How far the paper stack is pressed down while the cover is lying on it.
 *
 * Measured: at full height the page's top surface clears the cover's inner face
 * by 0.0013 of a world unit, which the depth buffer cannot hold apart once the
 * folder tilts, and the page speckles through the manila. At 0.28 it clears by
 * 0.0063, and since the cover is on top of it nobody can tell the difference.
 */
const PRESS_SHUT = 0.28

function smoother(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Exponential smoothing that does not care about the frame rate. `1 - exp(-rate * dt)` is the real thing;
 * the `min(1, dt * rate)` shorthand it replaces is its first-order approximation and it BREAKS on a long
 * frame: traced across a hover, one 50 ms frame took the hover a third of the way in a single step and
 * moved the folder 0.027 in ndc at once, which is the snap that read as buggy. This is exact for any dt.
 */
function ease(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt)
}

/** the screen's own axes in the presented pose: local +x runs across the shot, local +z up it */
const AX = new THREE.Vector3(1, 0, 0)
const AZ = new THREE.Vector3(0, 0, 1)
interface Bounds {
  box: THREE.Box3
  tb: THREE.Box3
  mi: THREE.Matrix4
  mm: THREE.Matrix4
}

/**
 * The bounds of a subtree in some ancestor's own frame. Box3.setFromObject only gives WORLD bounds, and a
 * world box turned back into local space is a box drawn around a box: it grows with every rotation between
 * them. This walks the meshes so each one's own bounds land in the frame that matters.
 */
function localBounds(root: THREE.Object3D, inFrame: THREE.Object3D, s: Bounds): THREE.Box3 {
  root.updateWorldMatrix(true, true)
  s.mi.copy(inFrame.matrixWorld).invert()
  s.box.makeEmpty()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.visible) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    s.mm.multiplyMatrices(s.mi, m.matrixWorld)
    s.box.union(s.tb.copy(m.geometry.boundingBox!).applyMatrix4(s.mm))
  })
  return s.box
}

export default function ResumeFolder({
  position = [0, 0, 0],
  length = 3.6,
  yaw = 0,
  groupRef,
  deal,
  fx,
  onOpen,
  onClose,
  interactive = true,
  open = false,
  onPageFrame,
}: {
  position?: [number, number, number]
  length?: number
  yaw?: number
  groupRef?: Ref<THREE.Group>
  deal?: { from: [number, number]; at: number; duration?: number; turns?: number }
  fx?: MutableRefObject<ImpactFx>
  onOpen?: () => void
  onClose?: () => void
  interactive?: boolean
  open?: boolean
  onPageFrame?: (f: PageFrameOut) => void
}) {
  const mats = useMemo(() => ({ body: folderMaterial('body'), tab: folderMaterial('tab'), ink: folderMaterial('ink') }), [])
  const useGenerated = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('folder') === 'gen'
  const { scene: ogScene } = useGLTF(FOLDER_URL)

  const ogBuilt = useMemo(() => {
    if (useGenerated) return null
    const src = ogScene.clone(true)
    src.updateWorldMatrix(true, true)
    const root = new THREE.Group()
    const meshes: THREE.Mesh[] = []
    src.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o)
    })
    // the export bakes world transforms into the vertices, so every piece assembles at identity
    for (const m of meshes) {
      root.add(m)
      m.position.set(0, 0, 0)
      m.quaternion.identity()
      m.scale.set(1, 1, 1)
      const flat = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
      flat.computeVertexNormals()
      flat.computeBoundingBox()
      m.geometry = flat
      m.castShadow = true
    }
    const by = (n: string) => meshes.find((m) => m.name.startsWith(n)) ?? null
    // unrotate the baked in-plane angle so local x is the folder's width, local y its length, and the
    // crease an axis. Measured off the back leaf, then applied to every piece so they stay registered.
    // Measured off the COVER, which is a clean rounded rectangle, rather than the back leaf, which carries
    // the tab. That was a guess at why the page's edges came out 1.38 degrees off the folder's and it was
    // WRONG: measured, the two agree exactly (both 77.470 degrees), so the tab does not drag the fit at all.
    // The cover is still the better reference on principle, and ?fdbg prints all three so the next person
    // does not have to guess either.
    const spinRef = by('folder_cover') ?? by('folder_back')
    if (!spinRef) return null
    const spin = bakedSpin(spinRef.geometry)
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fdbg')) {
      const backRaw = by('folder_back')
      const sheetRaw = by('folder_sheet')
      const deg = (r: number) => ((r * 180) / Math.PI).toFixed(3)
      console.log('FOLDER spin from cover', deg(spin),
        'back', backRaw ? deg(bakedSpin(backRaw.geometry)) : '-',
        'sheet', sheetRaw ? deg(bakedSpin(sheetRaw.geometry)) : '-')
    }
    unbakeSpin(meshes.map((m) => m.geometry), spin)
    const back = by('folder_back')
    const cover = by('folder_cover')
    const tab = by('folder_tab')
    const modelSheet = by('folder_sheet')
    // the cover carries one big script "Resume"; the smaller plate is the name, which he wants off
    const allTexts = meshes.filter((m) => m.name.startsWith('folder_text'))
    const plateArea = (m: THREE.Mesh) => {
      const b = m.geometry.boundingBox!
      return (b.max.x - b.min.x) * (b.max.y - b.min.y)
    }
    const texts = [...allTexts].sort((a, b) => plateArea(b) - plateArea(a)).slice(0, 1)
    for (const t of allTexts) if (!texts.includes(t)) root.remove(t)
    if (!back || !cover) return null
    back.material = mats.body
    cover.material = mats.body
    if (tab) tab.material = mats.tab
    for (const t of texts) {
      // the lettering sits proud of the cover's outer face, which is the face turned up here, so it reads
      // as modelled: no mirroring
      t.material = mats.ink
      t.castShadow = false
    }
    const lb = back.geometry.boundingBox!
    const cb = cover.geometry.boundingBox!
    // the page is the modelled sheet's own footprint, so it fills the folder exactly as in the Blender
    // scene instead of being guessed from an inflated bounding box
    const sb = (modelSheet ?? back).geometry.boundingBox!
    if (modelSheet) root.remove(modelSheet) // rebuilt below with real thickness

    // Paper stock. Measured against the closed cover rather than guessed: the leaf's fitted plane sits at
    // -0.0143 and the cover's inner face at -0.0243, and the top sheet rides 2.45 stock-thicknesses above
    // the plane, so anything past 0.30 of the leaf's depth pushes white through a shut folder. 0.16 was
    // well under that and came out around a pixel on screen, which is no thickness at all.
    const thick = (lb.max.z - lb.min.z) * 0.26
    const tex = new THREE.TextureLoader().load(RESUME_PAGE.url)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    // the same graph the print's own paper goes through (see stockMaterial), so the sheet's cut edges and
    // its printed face are one piece of paper lit by one thing
    const edge = stockMaterial()
    // the page fills the modelled sheet's footprint, clipped inside the cover so no corner peeks out when
    // the folder is shut. The inset has to clear the leaf's ROUNDED corners AND the curl: at 2 percent the
    // page ran flush and its free corner hung out over the felt on any tilt, and even at 4.5 the top margin
    // measured 2 to 3 px against 16 down the middle, because the lifted free corners are nearer the camera
    // and so project larger. Measured round the whole page rather than set by eye. It also gives the paper
    // a manila margin, which is what a document in a folder actually looks like.
    const inset = (cb.max.x - cb.min.x) * 0.068
    const px0 = Math.max(sb.min.x, cb.min.x + inset)
    const px1 = Math.min(sb.max.x, cb.max.x - inset)
    const py0 = Math.max(sb.min.y, cb.min.y + inset)
    const py1 = Math.min(sb.max.y, cb.max.y - inset)
    const pw = px1 - px0
    const ph = py1 - py0
    // world up is model -z here (the cover sits at lower z than the leaf), so the print goes on the box's
    // -z face, looking up out of the folder
    // Printed straight ONTO the sheet, so the painterly pass runs over the resume with everything else and
    // the page is one material throughout. The cost is not small and is worth knowing: the pass smears 8pt
    // type to the point that the resume cannot be read at all, only its name survives. ?sharp puts the
    // print back on its own plane outside the pass, which is legible but is a print laid on a painting.
    const sharp = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sharp')
    const printMat = sheetMaterial(tex, { printed: true, painted: !sharp })
    // world up is model -z here, so the leaf's inner face is its low-z side
    const plane = contactPlane(back.geometry, { along: 'x', at: 'z', side: 'min' })
    const cx = (px0 + px1) / 2
    const cy = (py0 + py1) / 2
    // lie on the leaf's own plane, not flat: the leaves are a wedge, pinched at the fold
    const tilt = planeTilt(plane)
    const lift = (k: number) => planeAt(plane, cx) - thick * k
    // which x edge is the fold: the sheets bend away from it, so this has to be known before they are
    // built rather than only when the hinge is made
    const lcx = lb.getCenter(new THREE.Vector3()).x
    const tabX0 = tab ? tab.geometry.boundingBox!.getCenter(new THREE.Vector3()).x : lb.max.x
    const foldX = tabX0 > lcx ? lb.min.x : lb.max.x
    const foldAt: -1 | 1 = foldX < cx ? -1 : 1
    // how far the free corner lifts at full curl. Scaled off the SHEET, not the stock: paper is thin, so
    // tying the curl to the thickness makes it vanish (measured, it came out at 1.3 percent of the page).
    // The cap is only there so a freak aspect cannot turn a sheet into a roof tile.
    // The rise is what tips the page's free edge away from the leaf's, and that is the corner that reads as
    // not lining up with the folder: measured, the two edges sit within 0.26 degrees of each other at the
    // fold and 3.06 degrees apart at the free end, and cutting only the CORNER term moved that to 2.55, so
    // the plain lift is carrying it. At this rise the divergence is under a degree. The sheet's depth comes
    // from its stock and its contact shadow rather than from a big curl, which is the right trade: paper
    // that lifts far enough to read as curled also stops reading as being IN the folder.
    const rise = Math.min(pw * 0.028, thick * 30)
    /**
     * The angle the cover must be past before the paper may curl at all.
     *
     * The curl lifts the sheet's free corner by 0.94 * rise + 3.35 * thick off
     * the leaf's plane, and that corner sits pw from the hinge, so the cover has
     * to have swung far enough that its inner face is above that height where
     * the corner is. The 2 is the curl's profile: the lift grows faster than
     * linearly toward the free edge, so the tightest point is not the corner
     * itself and a plain asin(h/d) clears the corner while still cutting the
     * sheet nearer the fold.
     *
     * Measured on the real folder this comes out at 4.58 degrees. The gate that
     * was here let the curl start at 0.34, which is where the white page was
     * coming through the manila mid swing.
     */
    const curlClearAngle = Math.asin(Math.min(0.5, (2 * (0.94 * rise + 3.35 * thick)) / Math.max(1e-6, pw)))
    const sheets: Sheet[] = []
    // the shadow the leaf cannot receive: a soft patch on the leaf's own plane, just under the stack
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(pw * 1.16, ph * 1.16),
      new MeshBasicNodeMaterial({ map: contactShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false }),
    )
    // barely offset: a directional shadow left the corner it pointed away from with nothing under it at
    // all, and that was exactly the corner that read as not being on the folder
    shadow.position.set(cx + pw * 0.004, cy - ph * 0.004, lift(0.06))
    shadow.rotation.y = tilt
    shadow.renderOrder = -1
    root.add(shadow)
    // The stack under the resume, INSET and barely fanned. Fanned wide they poked out past the top sheet
    // (measured: 0.018 in y, which lands at 8.7 screen px) and read as a second sheet laid under the first
    // rather than as one document with heft: a cream band along the bottom and side of the white page. They
    // are 3 percent smaller than the top sheet now, which is more than the fan and the lean together can
    // move them, so they can never emerge however the curl or the tilt goes.
    // every sheet's resting height above the leaf's plane, so the stack can be
    // pressed down while the cover is lying on it (see press below)
    const stack: { mesh: THREE.Mesh; base: number }[] = []
    for (let i = 0; i < 2; i++) {
      const u = paperSheet({ w: pw * 0.97, h: ph * 0.97, t: thick }, edge, { across: 'x', foldAt, up: -1, rise: rise * (0.4 + i * 0.25), skew: i === 0 ? 0.08 : -0.06 })
      u.mesh.position.set(cx + 0.003 * (i + 1), cy - 0.003 * (i + 1), lift(0.55 + i * 0.7))
      stack.push({ mesh: u.mesh, base: 0.55 + i * 0.7 })
      u.mesh.rotation.set(0, tilt, (i === 0 ? 1 : -1) * 0.005)
      root.add(u.mesh)
      // nothing is printed on the sheets underneath, so their face plane is simply never added
      sheets.push(u)
    }
    // the stock is plain cream on every face and goes through the painterly pass with the folder; the
    // PRINT rides on its own bent plane and stays out of it (see paperSheet)
    const top = paperSheet(
      { w: pw, h: ph, t: thick },
      sharp ? edge : [edge, edge, edge, edge, edge, printMat],
      { across: 'x', foldAt, up: -1, rise, skew: 0.05, faceInset: sharp ? 0.05 : 0 },
    )
    const page = top.mesh
    if (sharp) {
      top.face.material = printMat
      top.face.userData.compOverlay = true
    }
    sheets.push(top)
    page.name = 'folder_page'
    page.position.set(cx, cy, lift(1.95))
    stack.push({ mesh: page, base: 1.95 })
    page.rotation.y = tilt
    // the face plane is only added in ?sharp: otherwise the print lives on the sheet itself
    if (sharp) {
      top.face.position.copy(page.position)
      top.face.rotation.copy(page.rotation)
      root.add(top.face)
      stack.push({ mesh: top.face, base: 1.95 })
    }

    /**
     * PRESSED FLAT WHILE SHUT.
     *
     * The stack's resting height is 2.45 stock-thicknesses above the leaf's plane
     * and the cover's inner face is 2.81 above it, which leaves 0.0013 of world
     * between the page and the manila lying on it. That is about a thousandth of
     * a unit in a scene twenty-four across: far too little for the depth buffer to
     * keep them apart once the folder lifts off the table and tilts, and the page
     * comes through the cover in speckles. The note above this stack reads "0.16
     * was well under that", but the stock is 0.26 of the leaf's depth now, which
     * is 87 percent of the way to the documented ceiling, so there was no margin
     * left to lose.
     *
     * Height is not a thing that has to be paid for while the folder is shut,
     * because nothing can see it. So the stack is pressed down against the leaf
     * and rises to its full height as the cover comes off, exactly as the stock's
     * own thickness and the curl already do. At p = 0.28 the page's top surface
     * sits 0.0063 clear of the cover instead of 0.0013, and the open folder is
     * unchanged because p reaches 1 with the curl.
     */
    const press = (p: number) => {
      for (const s of stack) s.mesh.position.z = lift(s.base * p)
    }
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fdbg')) {
      const f = (v: number) => v.toFixed(4)
      console.log('FOLDER spin', f(spin), 'tilt', f(tilt))
      for (const [n, b] of [['back', lb], ['cover', cb], ['sheet', sb]] as const)
        console.log('FOLDER', n, 'x', f(b.min.x), f(b.max.x), 'y', f(b.min.y), f(b.max.y), 'z', f(b.min.z), f(b.max.z))
      console.log('FOLDER page', f(pw), 'x', f(ph), 'at', f(cx), f(cy), f(page.position.z), 'plane', f(plane.offset), f(plane.slope))
      console.log('FOLDER paper thick', f(thick), 'rise', f(rise), 'foldAt', foldAt, 'foldX', f(foldX))
    }
    page.userData.sheet = true
    root.add(page)

    // hinge: the fold is the leaf edge away from the tab, on the face the two leaves share (measured
    // above, since the sheets have to bend away from it)
    const cc = cb.getCenter(new THREE.Vector3())
    const pivot = new THREE.Group()
    pivot.name = 'folder_hinge'
    pivot.position.set(foldX, 0, (cb.max.z + lb.min.z) / 2)
    root.add(pivot)
    root.updateWorldMatrix(true, true)
    pivot.updateWorldMatrix(true, false)
    for (const m of [cover, ...texts]) pivot.attach(m)
    // the cover lies on the far side of the fold, so it swings that way: about +y when it extends into +x
    const openSign = cc.x > foldX ? 1 : -1
    // the face the link tokens lie on: the cover's inner side, in the pivot's own frame
    const coverFace: LeafFace = {
      cx: cc.x - pivot.position.x,
      cy: cc.y - pivot.position.y,
      z: cb.max.z - pivot.position.z,
      w: cb.max.x - cb.min.x,
      h: cb.max.y - cb.min.y,
    }
    return { root, pivot, page, sheets, press, curlClearAngle, pageLift: -(rise + thick * 3 + 0.004), pageSize: { w: pw, h: ph }, layoutX: Math.PI / 2, openAxis: 'y' as const, openSign, coverFace, frame: { up: [0, 1, 0] as const, right: [1, 0, 0] as const, normal: [0, 0, -1] as const } }
  }, [ogScene, mats, useGenerated])

  const genBuilt = useMemo(() => {
    const root = new THREE.Group()
    const geo = leafGeometry(LEAF_T)

    // back leaf: crease at y = 0, lying in the xy plane, thickness along +z
    const back = new THREE.Mesh(geo, mats.body)
    back.name = 'folder_back'
    back.castShadow = true
    root.add(back)

    // the tab, on the back leaf's far edge
    const tabGeo = new THREE.ExtrudeGeometry(roundedRect(TAB_W, TAB_H, TAB_H * 0.35), {
      depth: LEAF_T * 0.8,
      bevelEnabled: false,
      curveSegments: 6,
    })
    const tab = new THREE.Mesh(tabGeo, mats.tab)
    tab.name = 'folder_tab'
    tab.position.set(LEAF_W * 0.22, LEAF_H - 0.002, LEAF_T * 0.1)
    tab.castShadow = true
    root.add(tab)

    // the page: inside the back leaf, letter aspect, centred
    const margin = Math.min(LEAF_W, LEAF_H) * 0.055
    const aspect = RESUME_PAGE.w / RESUME_PAGE.h
    // paper sits in a folder with its LONG side along the fold, so the page's long side runs along x
    const pLong = Math.min(LEAF_W - 2 * margin, (LEAF_H - 2 * margin) / aspect)
    const pShort = pLong * aspect
    // real stock: a thin slab with white edges, not a plane, plus a couple of sheets under it so the
    // document has a little heft the way a printed resume does
    const sheetT = LEAF_T * 0.28
    const tex = new THREE.TextureLoader().load(RESUME_PAGE.url)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const edge = stockMaterial()
    // BoxGeometry's +z face carries the print; its UVs run across x and up y, so the print is swapped and
    // flipped to keep its up along the page's long side
    const printMat = sheetMaterial(tex, { printed: true, rotate: true, flipU: true })
    // here the fold is the leaf edge at y = 0, so the sheets bend away along y, and +z is up off the leaf
    const rise = Math.min(pShort * 0.06, sheetT * 30)
    // the same clearance rule as the modelled branch, from this one's own numbers
    const curlClearAngle = Math.asin(Math.min(0.5, (2 * (0.94 * rise + 3.35 * sheetT)) / Math.max(1e-6, pLong)))
    const sheets: Sheet[] = []
    const top = paperSheet({ w: pLong, h: pShort, t: sheetT }, edge, { across: 'y', foldAt: -1, up: 1, rise, skew: 0.05 })
    const page = top.mesh
    top.face.material = printMat
    top.face.userData.compOverlay = true
    sheets.push(top)
    page.name = 'folder_page'
    page.position.set(0, LEAF_H / 2, LEAF_T + 0.012 + sheetT / 2)
    const stack: { mesh: THREE.Mesh; base: number }[] = [
      { mesh: page, base: 0.012 + sheetT / 2 },
      { mesh: top.face, base: 0.012 + sheetT / 2 },
    ]
    page.userData.sheet = true
    root.add(page)
    top.face.position.copy(page.position)
    root.add(top.face)
    // the sheets beneath, barely fanned and pressed flatter by what is on top of them
    for (let i = 1; i <= 2; i++) {
      const u = paperSheet({ w: pLong * 0.97, h: pShort * 0.97, t: sheetT * 0.8 }, edge, { across: 'y', foldAt: -1, up: 1, rise: rise * (0.65 - i * 0.2), skew: i === 1 ? 0.08 : -0.06 })
      u.mesh.position.set(0.003 * i, LEAF_H / 2 - 0.003 * i, LEAF_T + 0.012 - i * sheetT * 0.75)
      stack.push({ mesh: u.mesh, base: 0.012 - i * sheetT * 0.75 })
      u.mesh.rotation.z = (i === 1 ? 1 : -1) * 0.005
      root.add(u.mesh)
      // nothing is printed on the sheets underneath, so their face plane is simply never added
      sheets.push(u)
    }

    // the same press as the modelled branch: the stack lies flat against the leaf
    // while the cover is on it and rises as the cover comes off
    const press = (p: number) => {
      for (const s of stack) s.mesh.position.z = LEAF_T + s.base * p
    }

    // the hinge: the crease edge (y = 0) at the leaves' shared face
    const pivot = new THREE.Group()
    pivot.name = 'folder_hinge'
    pivot.position.set(0, 0, LEAF_T)
    root.add(pivot)

    // cover leaf, sitting on the back leaf when shut
    const cover = new THREE.Mesh(geo, mats.body)
    cover.name = 'folder_cover'
    cover.castShadow = true
    cover.position.set(0, 0, 0)
    pivot.add(cover)

    // the lettering, printed on the cover's outer face
    const labelTex = coverLabelTexture()
    // redraw once the face has loaded (the first draw uses the fallback)
    ensureLabelFont().then(() => {
      const t2 = coverLabelTexture()
      labelTex.image = t2.image
      labelTex.needsUpdate = true
    })
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(LEAF_W * 0.92, LEAF_H * 0.92),
      new MeshBasicNodeMaterial({ map: labelTex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    )
    label.renderOrder = 2
    label.name = 'folder_label'
    label.position.set(0, LEAF_H / 2, LEAF_T + 0.012)
    pivot.add(label)

    return { root, pivot, page, sheets, press, curlClearAngle, pageLift: rise + sheetT * 3 + 0.004, pageSize: { w: pShort, h: pLong }, layoutX: -Math.PI / 2, openAxis: 'x' as const, openSign: -1, coverFace: { cx: 0, cy: LEAF_H / 2, z: 0, w: LEAF_W, h: LEAF_H } as LeafFace, frame: { up: [1, 0, 0] as const, right: [0, 1, 0] as const, normal: [0, 0, 1] as const } }
  }, [mats])

  const built = ogBuilt ?? genBuilt
  const model = built.root
  const parts = useRef(built)
  useEffect(() => {
    parts.current = built
    // Rebuilt sheet geometry starts curled even if the previous model was shut.
    // Invalidate the cached pose so a texture/model refresh presses it flat again.
    curlAt.current = -1
  }, [built])

  useLayoutEffect(() => {
    // lay it flat with the COVER UP. Which turn does that is a property of the build, not a constant: in
    // the imported model the cover sits at LOWER z than the back leaf, so -z is up; the generated leaves
    // extrude along +z, so +z is up. Hardcoding one of them buries the other build's page under its leaf.
    model.rotation.set(built.layoutX, 0, 0)
    model.position.set(0, 0, 0)
    model.scale.setScalar(1)
    model.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const s = length / Math.max(size.x, size.z)
    model.scale.setScalar(s)
    model.updateWorldMatrix(true, true)
    box.setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    const parentPos = new THREE.Vector3()
    model.parent?.getWorldPosition(parentPos)
    const cl = model.parent ? model.parent.worldToLocal(c.clone()) : c
    model.position.set(-cl.x, -(box.min.y - parentPos.y), -cl.z)
  }, [model, length, built.layoutX])

  const outer = useRef<THREE.Group>(null)
  const canvas = useThree((state) => state.gl.domElement)
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    if (!open || !interactive || !onClose || !outer.current) return
    return listenForFolderDismiss(canvas, camera, outer.current, onClose)
  }, [open, interactive, onClose, canvas, camera])
  const swell = useRef<THREE.Group>(null)
  const hover = useRef({ on: false, amt: 0, off: 0 })
  const closing = useRef(false)
  /**
   * The hover is CLAIM-COUNTED, not a boolean, and that is the fidget.
   *
   * The page, the leaf's furniture and the folder itself each stop their own pointer events and report the
   * hover up here. Moving the pointer from the page onto a link mark fires an out and an over from two
   * different objects, and r3f does not promise the order: on the wrong order a boolean goes false and the
   * folder drops its whole 0.055 lift for a frame before the over puts it back. Crossing the furniture, or
   * leaving the folder and coming back, made it twitch every time. With claims, one source releasing while
   * another still holds changes nothing.
   */
  const claimHover = useCallback((id: string, on: boolean) => {
    if (on && closing.current) return
    const c = hoverClaims.current
    if (on) c.add(id)
    else c.delete(id)
    hover.current.on = c.size > 0
  }, [])
  const hoverClaims = useRef<Set<string>>(new Set())
  const pageHover = useCallback((on: boolean) => claimHover('page', on), [claimHover])
  const leafHover = useCallback((on: boolean) => claimHover('leaf', on), [claimHover])
  const openLin = useRef(0)
  const openState = useRef(false)
  const readYaw = useRef<number | null>(null)
  const curlAt = useRef(-1)
  // scratch for the presented pose, so the frame loop allocates nothing
  const pv = useRef({
    n: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    up: new THREE.Vector3(),
    x: new THREE.Vector3(),
    tgt: new THREE.Vector3(),
    off: new THREE.Vector3(),
    lc: new THREE.Vector3(),
    ls: new THREE.Vector3(),
    ndc: new THREE.Vector3(),
    crease: new THREE.Vector3(),
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    qa: new THREE.Quaternion(),
    qb: new THREE.Quaternion(),
    bounds: { box: new THREE.Box3(), tb: new THREE.Box3(), mi: new THREE.Matrix4(), mm: new THREE.Matrix4() } as Bounds,
    /** the pointer, eased: the raw value steps with the mouse and would snap the folder about */
    mx: 0,
    my: 0,
    /** the float's own integrated phase (see the frame loop) */
    phase: 0,
    dist: 0,
  })
  useEffect(() => {
    closing.current = !open && openLin.current > 0
    openState.current = open
    // Drop the hover whenever it opens or closes. The folder moves a long way out from under a STATIONARY
    // cursor on both of those, and r3f only re-raycasts on pointer events: with no mouse movement no
    // pointerOut ever arrives, so the hover sticks on and the folder sits back down on the felt swollen,
    // lifted and still showing a pointer cursor. That is the "it does not go back to its spot" on exit.
    // It re-engages the moment the pointer actually moves, which is the correct source for it anyway.
    hoverClaims.current.clear()
    hover.current.on = false
    hover.current.off = 0.1
    markPropMotion(open ? FOLDER_TIME.open + 0.2 : FOLDER_TIME.shut + 0.2)
  }, [open])

  // ?nosheet hides the paper and leaves the manila standing, which is how you find
  // out whether a pale edge belongs to the page or to the folder itself
  const noSheet = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nosheet')
  // ?fopen=<0..1> pins the open gesture, so the folder holds still at one point of
  // its swing and two runs can be compared pixel for pixel
  const pinOpen = (() => {
    if (typeof window === 'undefined') return null
    const v = new URLSearchParams(window.location.search).get('fopen')
    return v === null ? null : Math.min(1, Math.max(0, Number(v)))
  })()
  useFrame(({ camera, pointer, clock }, dt) => {
    const d = Math.min(dt, 0.05)
    const dur = openState.current ? FOLDER_TIME.open : FOLDER_TIME.shut
    openLin.current = Math.min(1, Math.max(0, openLin.current + (openState.current ? d / dur : -d / dur)))
    const l = pinOpen ?? openLin.current
    // ONE gesture, not two at once. Both the travel and the cover swing used to run off the same value, so
    // they started together, peaked together and stopped together: two different kinds of motion perfectly
    // synchronised, which is exactly what reads as two things happening rather than one movement. The
    // folder now leaves the table first and the cover FOLLOWS THROUGH, finishing a beat after it settles,
    // and on the way back the cover shuts before the folder has finished going down. Same total time.
    const a = smoother(l / 0.84)
    const swing = smoother((l - 0.16) / 0.84)
    if (closing.current && l === 0) {
      closing.current = false
      hoverClaims.current.clear()
      hover.current.on = false
      hover.current.amt = 0
      hover.current.off = 0.1
    }
    const tn = getTune()
    if (parts.current.openAxis === 'y') parts.current.pivot.rotation.y = parts.current.openSign * Math.PI * tn.fldTurn * swing
    else parts.current.pivot.rotation.x = parts.current.openSign * Math.PI * tn.fldTurn * swing

    /**
     * The paper relaxes as the cover comes clear, and it is keyed off the COVER
     * rather than off a schedule that runs alongside it.
     *
     * The intent was always "nothing can bend up into a cover that is still
     * lying on it", but the gate was a fixed 0.12 on `a`, which is a different
     * curve from the one the cover swings on. Worked out: that let the curl
     * start when the cover had turned 0.34 degrees, and the geometry needs 4.58.
     * The sheet lifted into a cover still flat on top of it, and the white page
     * came through the manila for a few frames mid open. That is the clipping.
     *
     * Reading the swing the cover is actually on, and the angle from the paper's
     * own measurements, means the two cannot drift apart again: change the stock,
     * the curl or fldTurn and this follows.
     */
    const clearAt = Math.min(0.6, (parts.current.curlClearAngle ?? 0.08) / Math.max(0.05, Math.PI * tn.fldTurn))
    const cu = Math.min(1, Math.max(0, (swing - clearAt) / Math.max(0.05, 1 - clearAt)))
    const curl = cu * cu * (3 - 2 * cu)
    if (Math.abs(curl - curlAt.current) > 0.004 || (curl !== curlAt.current && (curl === 0 || curl === 1))) {
      for (const sh of parts.current.sheets) sh.curl(curl)
      // and the stack rides up on the same driver, so it is only ever at its full
      // height when there is no cover lying on it to fight with
      parts.current.press(PRESS_SHUT + (1 - PRESS_SHUT) * curl)
      curlAt.current = curl
    }

    // No interior paper is drawable while the cover occupies the same space.
    // Hide the separate sharp-print face too: hiding its stock mesh alone does
    // not remove that sibling from the compositor's overlay pass.
    const paperVisible = !noSheet && swing > clearAt
    for (const sh of parts.current.sheets) {
      sh.mesh.visible = paperVisible
      sh.face.visible = paperVisible
    }

    const h = hover.current
    // and a short grace on RELEASE, on top of the claims: a pointer crossing a gap between two of the
    // folder's own pieces can leave every claim briefly unheld, and without this that still reads as a
    // twitch. Re-entering inside the grace costs nothing at all.
    if (h.on) h.off = 0
    else h.off += d
    const held = !closing.current && (h.on || h.off < 0.1)
    // slower than it was, both ways: the lift is 0.055 of the spread's height and arriving in a tenth of a
    // second reads as a pop rather than as the folder noticing the pointer
    h.amt += ((held ? 1 : 0) - h.amt) * ease(held ? 6 : 3.5, d)
    if (!held && h.amt < 0.001) h.amt = 0
    if (swell.current) {
      // faded out as it presents: a scale INSIDE the group is invisible there, since the framing measures
      // what is actually in the group and simply settles further back. The presented pose runs its own
      // hover response (it comes closer and takes more tilt) instead.
      const sw = closing.current ? 0 : 1 - a
      swell.current.scale.setScalar(1 + 0.06 * h.amt * sw)
      swell.current.position.y = 0.05 * h.amt * sw
    }
    claimPointer('folder', h.on)

    const page = parts.current.page
    if (onPageFrame) {
      page.updateWorldMatrix(true, false)
      const wm = page.matrixWorld
      const m3 = new THREE.Matrix3().setFromMatrix4(wm)
      // the print's own axes on the page, as the build laid it out
      const fr = parts.current.frame
      const up = new THREE.Vector3(...fr.up).applyMatrix3(m3)
      const nrm = new THREE.Vector3(...fr.normal).applyMatrix3(m3)
      const right = new THREE.Vector3(...fr.right).applyMatrix3(m3)
      const upW = up.clone().normalize()
      if (readYaw.current === null && a < 0.02) {
        let delta = Math.PI - Math.atan2(upW.x, upW.z)
        while (delta > Math.PI) delta -= Math.PI * 2
        while (delta < -Math.PI) delta += Math.PI * 2
        readYaw.current = delta
      }
      const pv = parts.current.pivot
      pv.updateWorldMatrix(true, false)
      const crease = new THREE.Vector3().setFromMatrixPosition(pv.matrixWorld)
      const box = new THREE.Box3().setFromObject(parts.current.root)
      const bs = box.getSize(new THREE.Vector3())
      onPageFrame({
        crease,
        spread: Math.max(bs.x, bs.z),
        centre: new THREE.Vector3().setFromMatrixPosition(wm),
        normal: nrm.clone().normalize(),
        up: upW,
        width: parts.current.pageSize.w * right.length(),
        height: parts.current.pageSize.h * up.length(),
        open: a,
      })
    }

    const g = outer.current
    // Presented folder and hero chip share one depth band, so the folder can
    // physically occlude the chip on every viewport without hiding either actor.
    if (g) g.userData.cardRenderLayer = a > .01 ? 2 : 0
    if (!g) return
    if (deal && fx) {
      const ia = fx.current.impactAge
      const dur2 = deal.duration ?? 1.1
      const turns = deal.turns ?? 1.5
      const t = ia < 0 ? 0 : Math.min(1, Math.max(0, (ia - deal.at) / dur2))
      const e = 1 - Math.pow(1 - t, 3)
      g.position.set(
        deal.from[0] + (position[0] - deal.from[0]) * e,
        position[1],
        deal.from[1] + (position[2] - deal.from[1]) * e,
      )
      // the WHOLE rotation, not just y: presenting slerps a full quaternion onto this group, and writing
      // only rotation.y afterwards leaves the x and z the slerp put there, so the folder came back to the
      // table still standing on its edge and half sunk into the felt
      g.rotation.set(0, yaw + (1 - e) * turns * Math.PI * 2 + (readYaw.current ?? 0) * a, 0)
      g.visible = ia >= deal.at
    } else {
      g.position.set(...position)
      g.rotation.set(0, yaw + (readYaw.current ?? 0) * a, 0)
    }

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fdbg')) {
      // camera AND folder every frame, open or shut: telling "the folder did not come back" apart from
      // "the camera did not go back" needs both, and the presented block only runs while it is open
      const w = window as unknown as { __st?: Record<string, number[]> }
      // is the page RIGIDLY part of the folder? Not asserted: its parent chain is WALKED up to the folder's
      // own root, and its position in that root's frame is published so it can be watched for drift while
      // the folder moves, opens and takes the pointer's tilt.
      let anc: THREE.Object3D | null = parts.current.page
      let depth = 0
      while (anc && anc !== parts.current.root) {
        anc = anc.parent
        depth++
      }
      w.__st = {
        rigid: [anc === parts.current.root ? 1 : 0, depth],
        pageLocal: [parts.current.page.position.x, parts.current.page.position.y, parts.current.page.position.z],
        cam: [camera.position.x, camera.position.y, camera.position.z],
        pos: [g.position.x, g.position.y, g.position.z],
        rot: [g.rotation.x, g.rotation.y, g.rotation.z],
        scale: [g.scale.x],
        a: [a, openLin.current],
        hover: [h.amt, h.on ? 1 : 0],
        swell: [swell.current?.scale.x ?? 1, swell.current?.position.y ?? 0],
        curl: [curlAt.current],
      }
    }

    // the folder leaves the lamp's pool on the way up, so its own materials crossfade to an even front
    // light as it presents: without this it darkens by nearly 40 percent exactly as it becomes the subject
    drivePresent(a)

    // PRESENTED: rather than flying the camera down to the folder, the folder comes up to the camera. It
    // lifts off the felt, turns its spread to face the viewer and settles at the distance that frames it,
    // which reads as the folder offering itself rather than the room swinging around.
    if (a > 0.001) {
      const p = pv.current
      const cam = camera as THREE.PerspectiveCamera
      // Once closing begins, return from the last presented target. Continuing
      // to chase pointer/bob here makes the closed cover float during descent.
      if (openState.current) {
        p.mx += (pointer.x - p.mx) * ease(4.5, d)
        p.my += (pointer.y - p.my) * ease(4.5, d)

        // face it at the camera: the spread's normal is the group's +y, its up is the group's +z
        cam.getWorldDirection(p.fwd)
        p.n.copy(p.fwd).negate().normalize()
        p.up.set(0, 1, 0).addScaledVector(p.n, -p.n.y).normalize()
        p.x.crossVectors(p.n, p.up).normalize()
        p.m.makeBasis(p.x, p.n, p.up)
        p.q.setFromRotationMatrix(p.m)
        // Leaned by fldLean, then AIMED by the pointer: the edge the cursor is nearest goes away, which swings
        // the sheet's normal round toward the cursor, so it reads as the folder turning to point at it. The
        // pointer touches the rotation only and never the position: moving as well made it swim.
        //
        // The two axes are the screen's own, which is the point of building the pose from the camera's basis
        // rather than from world axes. Their SENSE is not the obvious one and was measured, not assumed:
        // this basis has to keep local +y at the camera and local +z up and stay right-handed, which leaves
        // local +x pointing screen LEFT (projected, the box's local min.x lands at ndc +0.89 and its max.x
        // at -0.89). Both pointer terms are signed for that, and the first version had both backwards.
        const gain = tn.fldTilt * (1 + 0.25 * h.amt)
        p.q.multiply(p.qa.setFromAxisAngle(AX, -tn.fldLean + p.my * gain))
        p.q.multiply(p.qb.setFromAxisAngle(AZ, tn.fldSpin + p.mx * gain))

        // what is on screen is the OPEN SPREAD, not the closed folder: the cover swings out to one side, so
        // the group's origin stops being the middle of what the viewer sees, and the leaf furniture and the
        // tab hang past it. Measure the spread in the group's own frame and centre and fit THAT, or the
        // folder sits half a leaf off to the side of the shot and overruns the edge.
        const lb = localBounds(parts.current.root, g, p.bounds)
        const lc = lb.getCenter(p.lc)
        const ls = lb.getSize(p.ls)
        // The FOLD goes on the screen's centre line, not the spread's middle. The two leaves are not equal
        // (the tab is on one of them), so centring the bounding box puts the crease off to one side, and the
        // crease is the thing the eye reads an open folder by. p.bounds.mi is already the inverse of the
        // group's world matrix from localBounds, so the hinge lands in the same frame as the bounds.
        const hinge = parts.current.pivot
        hinge.updateWorldMatrix(true, false)
        p.crease.setFromMatrixPosition(hinge.matrixWorld).applyMatrix4(p.bounds.mi)
        // and the fit has to be measured FROM the crease, or the wider leaf runs off the edge
        const armX = Math.max(p.crease.x - lb.min.x, lb.max.x - p.crease.x) * 2
        const half = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
        // fit BOTH extents: local x runs across the screen, local z up it
        const dist = Math.max(ls.z / 2 / half, armX / 2 / (half * cam.aspect)) * tn.fldFit * (1 - 0.035 * h.amt)
        p.dist = dist
        const t = clock.elapsedTime
        p.tgt.copy(cam.position).addScaledVector(p.fwd, dist)
        // a slow breath and a drift after the pointer, so a held document is not a frozen one
        // fldUp and fldSide are read as the SCREEN's up and right: p.up is screen up, and p.x is screen LEFT
        // (see above), so the side term is negated to make positive mean right.
        //
        // The only thing that moves it is its own float: a slow rise and fall that deepens and quickens while
        // it is hovered, on top of a lift. Held documents are not still, and a bob the viewer's own hand
        // brings on reads as the object noticing them.
        // THE FLOAT'S PHASE IS INTEGRATED, never sin(t * w). The hover changes the frequency, and multiplying
        // a CHANGING frequency by an absolute clock jumps the argument by t * dw: a minute into the page that
        // is tens of radians, so the float snapped every time the pointer arrived or left.
        p.phase += d * (0.9 + 0.55 * h.amt)
        // The hover shows itself as a LIFT far more than as a bigger bob. At 2.8x the swing measured 0.137 in
        // ndc, about 55 screen px, wider than a link mark: the furniture swims out from under the pointer and
        // the marks become genuinely hard to hit. The lift costs nothing to aim at.
        const bob = Math.sin(p.phase) * ls.z * tn.fldFloat * (1 + 0.7 * h.amt)
        // and it MOVES with the pointer in all three axes: across and up the screen toward it, and pushed
        // back as it goes, so the parallax is a real one and not a slide across a flat plane
        const away = (p.mx * p.mx + p.my * p.my) * tn.fldMove * 0.9
        p.tgt.addScaledVector(p.up, ls.z * (tn.fldUp + tn.fldRise * h.amt) + bob + p.my * ls.z * tn.fldMove)
        p.tgt.addScaledVector(p.x, -ls.x * (tn.fldSide + p.mx * tn.fldMove))
        p.tgt.addScaledVector(p.n, -ls.x * away)
        // put the CREASE on the camera's axis horizontally, and the spread's middle on it vertically
        // the crease's OWN depth, not the spread's: the folder is leaned, so putting the fold's x on the axis
        // at the wrong depth still leaves it off centre in projection (measured, 20 px of 1280)
        p.off.set(p.crease.x, p.crease.y, lc.z).applyQuaternion(p.q)
        p.tgt.sub(p.off)
      }
      const ls = p.ls

      // e is the master curve itself now, not a second easing stacked on top of it. Smoothing an already
      // smoothed value flattens both ends so hard that the middle has to race, which is the other half of
      // why the move read as two beats rather than one.
      const e = a
      g.position.lerp(p.tgt, e)
      g.quaternion.slerp(p.q, e)
      // and it travels on an ARC: a bulge up and across that peaks halfway and is exactly zero at both
      // ends, so the folder swings up to the reader instead of sliding along a line between two poses
      const arc = Math.sin(Math.PI * a) * ls.z
      g.position.addScaledVector(p.up, arc * 0.1)
      g.position.addScaledVector(p.x, arc * 0.05)
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fdbg')) {
        const w = window as unknown as { __fd?: number[][]; __fp?: Record<string, number[]>; __fp2?: Record<string, number[]> }
        if (!w.__fd) w.__fd = []
        if (w.__fd.length < 1200) w.__fd.push([a, e, g.position.x, g.position.y, g.position.z, g.rotation.x, g.rotation.z])
        // the spread's own screen box, so the framing can be measured instead of eyeballed. The matrix has
        // to be rebuilt first: localBounds refreshed it from the TABLE pose set earlier this frame, which
        // the present lerp has just overwritten.
        g.updateWorldMatrix(true, false)
        const lb = p.bounds.box
        const lc = p.lc
        const t = clock.elapsedTime
        let x0 = 1, y0 = 1, x1 = -1, y1 = -1
        for (let i = 0; i < 8; i++) {
          p.ndc.set(i & 1 ? lb.max.x : lb.min.x, i & 2 ? lb.max.y : lb.min.y, i & 4 ? lb.max.z : lb.min.z)
          p.ndc.applyMatrix4(g.matrixWorld).project(cam)
          x0 = Math.min(x0, p.ndc.x); x1 = Math.max(x1, p.ndc.x)
          y0 = Math.min(y0, p.ndc.y); y1 = Math.max(y1, p.ndc.y)
        }
        // the spread's four mid-plane corners, so the TILT can be read off the render: the top edge wider
        // than the bottom means the top is nearer. Sign errors here are invisible in a still.
        const pj = (x: number, y: number, z: number) => { p.ndc.set(x, y, z).applyMatrix4(g.matrixWorld).project(cam); return [p.ndc.x, p.ndc.y] }
        const my2 = (lb.min.y + lb.max.y) / 2
        const tl = pj(lb.min.x, my2, lb.max.z), tr = pj(lb.max.x, my2, lb.max.z)
        const bl = pj(lb.min.x, my2, lb.min.z), br = pj(lb.max.x, my2, lb.min.z)
        w.__fp2 = { tl, tr, bl, br, topW: [tr[0] - tl[0]], botW: [br[0] - bl[0]] }
        p.ndc.copy(lc).applyMatrix4(g.matrixWorld).project(cam)
        const midXY = [p.ndc.x, p.ndc.y]
        // where the FOLD actually lands, so the centring can be checked against the maths rather than
        // against a pixel hunt through the pass's brushwork
        p.ndc.set(p.crease.x, p.crease.y, lc.z).applyMatrix4(g.matrixWorld).project(cam)
        w.__fp = { creaseNdc: [p.ndc.x, p.ndc.y], mid: midXY, a: [a], ndc: [x0, y0, x1, y1], centre: [(x0 + x1) / 2, (y0 + y1) / 2], size: [ls.x, ls.y, ls.z], dist: [p.dist], pointer: [pointer.x, pointer.y, p.mx, p.my], hover: [h.amt] }
      }
    }
  })

  return (
    <group ref={outer} name="resume-folder-deal" userData={{ cardRenderLayer: 0 }} position={deal ? [deal.from[0], position[1], deal.from[1]] : position} rotation={[0, yaw, 0]} visible={!deal}>
      <group
        ref={swell}
        onPointerOver={(e) => {
          if (!interactive) return
          e.stopPropagation()
          claimHover('folder', true)
        }}
        onPointerOut={() => {
          claimHover('folder', false)
        }}
        onClick={(e) => {
          if (!interactive) return
          e.stopPropagation()
          onOpen?.()
        }}
      >
        <group ref={groupRef}>
          <primitive object={model} />
          {/* the links, printed on the cover's inner face: they ride it open */}
          <FolderLeaf face={built.coverFace} mount={built.pivot} active={open} onHover={leafHover} onClose={onClose} />
          {/* the page opens the resume itself */}
          <PageLink page={built.page} mount={built.root} active={open} size={built.pageSize} lift={built.pageLift} onHover={pageHover} />
        </group>
      </group>
    </group>
  )
}
