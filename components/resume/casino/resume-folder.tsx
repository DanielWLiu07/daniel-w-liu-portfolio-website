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
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type Ref } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { bakedSpin, contactPlane, planeAt, planeTilt, unbakeSpin } from 'blender-to-threejs'
import { claimPointer } from './cursor'
import { drivePresent } from './materials'
import FolderLeaf, { RESUME_PDF, type LeafFace } from './folder-leaf'
import { folderMaterial, sheetMaterial } from './materials'
import type { ImpactFx } from './hero-chip'

export const RESUME_PAGE = { url: '/resume/resume-page1.jpg', w: 1583, h: 2048 }
/**
 * How long the folder takes to open and to shut. The camera move is driven from the SAME numbers and the
 * same easing (see CameraRig), so the folder and the camera are one move: run them on separate clocks, or
 * put a beat in front of one of them, and the shot reads as two things happening one after the other.
 */
export const FOLDER_TIME = { open: 1.05, shut: 0.75 }
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
        const ff = new FontFace('WeddingdayFolder', "url('/fonts/WeddingdayPersonalUseRegular-1Gvo0.ttf')")
        await ff.load()
        document.fonts.add(ff)
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
  const font = "'WeddingdayFolder', 'Snell Roundhand', 'Brush Script MT', cursive"
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
function PageLink({ page, mount, active, size }: { page: THREE.Mesh; mount: THREE.Object3D | null; active: boolean; size: { w: number; h: number } }) {
  const hit = useRef<THREE.Mesh>(null)
  useLayoutEffect(() => {
    const m = hit.current
    if (!m || !mount) return
    mount.add(m)
    return () => {
      mount.remove(m)
    }
  }, [mount])
  useFrame(() => {
    const m = hit.current
    if (!m) return
    m.position.copy(page.position)
    // world up is model -z here, so this sits just above the printed face
    m.position.z -= 0.004
    m.rotation.copy(page.rotation)
  })
  return (
    <mesh
      ref={hit}
      onPointerOver={(e) => {
        if (!active) return
        e.stopPropagation()
        claimPointer('page', true)
      }}
      onPointerOut={() => claimPointer('page', false)}
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

export default function ResumeFolder({
  position = [0, 0, 0],
  length = 3.6,
  yaw = 0,
  groupRef,
  deal,
  fx,
  onOpen,
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
    const backRaw = by('folder_back')
    if (!backRaw) return null
    const spin = bakedSpin(backRaw.geometry)
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

    // paper stock: thin enough to sit in the pinch at the fold, thick enough to read as real
    const thick = (lb.max.z - lb.min.z) * 0.16
    const tex = new THREE.TextureLoader().load(RESUME_PAGE.url)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const edge = new THREE.MeshBasicMaterial({ color: '#efeadd' })
    // the page fills the modelled sheet's footprint, clipped inside the cover so no corner peeks out when
    // the folder is shut
    const inset = (cb.max.x - cb.min.x) * 0.02
    const px0 = Math.max(sb.min.x, cb.min.x + inset)
    const px1 = Math.min(sb.max.x, cb.max.x - inset)
    const py0 = Math.max(sb.min.y, cb.min.y + inset)
    const py1 = Math.min(sb.max.y, cb.max.y - inset)
    const pw = px1 - px0
    const ph = py1 - py0
    // world up is model -z here (the cover sits at lower z than the leaf), so the print goes on the box's
    // -z face, looking up out of the folder
    const printMat = sheetMaterial(tex, { printed: true })
    const page = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, thick), [edge, edge, edge, edge, edge, printMat])
    page.name = 'folder_page'
    page.castShadow = true
    // world up is model -z here, so the leaf's inner face is its low-z side
    const plane = contactPlane(back.geometry, { along: 'x', at: 'z', side: 'min' })
    const cx = (px0 + px1) / 2
    const cy = (py0 + py1) / 2
    // lie on the leaf's own plane, not flat: the leaves are a wedge, pinched at the fold
    const tilt = planeTilt(plane)
    const lift = (k: number) => planeAt(plane, cx) - thick * k
    for (let i = 0; i < 2; i++) {
      const under = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, thick), edge)
      under.position.set(cx + 0.004 * (i + 1), cy - 0.004 * (i + 1), lift(0.55 + i * 0.7))
      under.rotation.set(0, tilt, (i === 0 ? 1 : -1) * 0.006)
      under.castShadow = true
      root.add(under)
    }
    page.position.set(cx, cy, lift(1.95))
    page.rotation.y = tilt
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fdbg')) {
      const f = (v: number) => v.toFixed(4)
      console.log('FOLDER spin', f(spin), 'tilt', f(tilt))
      for (const [n, b] of [['back', lb], ['cover', cb], ['sheet', sb]] as const)
        console.log('FOLDER', n, 'x', f(b.min.x), f(b.max.x), 'y', f(b.min.y), f(b.max.y), 'z', f(b.min.z), f(b.max.z))
      console.log('FOLDER page', f(pw), 'x', f(ph), 'at', f(cx), f(cy), f(page.position.z), 'plane', f(plane.offset), f(plane.slope))
    }
    page.userData.sheet = true
    root.add(page)

    // hinge: the fold is the leaf edge away from the tab, on the face the two leaves share
    const lc = lb.getCenter(new THREE.Vector3())
    const cc = cb.getCenter(new THREE.Vector3())
    const tabX = tab ? tab.geometry.boundingBox!.getCenter(new THREE.Vector3()).x : lb.max.x
    const foldX = tabX > lc.x ? lb.min.x : lb.max.x
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
    return { root, pivot, page, pageSize: { w: pw, h: ph }, layoutX: Math.PI / 2, openAxis: 'y' as const, openSign, coverFace, frame: { up: [0, 1, 0] as const, right: [1, 0, 0] as const, normal: [0, 0, -1] as const } }
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
    const edge = new THREE.MeshBasicMaterial({ color: '#efeadd' })
    // BoxGeometry's +z face carries the print; its UVs run across x and up y, so the print is swapped and
    // flipped to keep its up along the page's long side
    const printMat = sheetMaterial(tex, { printed: true, rotate: true, flipU: true })
    const pageGeo = new THREE.BoxGeometry(pLong, pShort, sheetT)
    const page = new THREE.Mesh(pageGeo, [edge, edge, edge, edge, printMat, edge])
    page.name = 'folder_page'
    page.castShadow = true
    page.position.set(0, LEAF_H / 2, LEAF_T + 0.012 + sheetT / 2)
    page.userData.sheet = true
    root.add(page)
    // the sheets beneath, barely fanned
    for (let i = 1; i <= 2; i++) {
      const under = new THREE.Mesh(new THREE.BoxGeometry(pLong, pShort, sheetT * 0.8), edge)
      under.position.set(0.004 * i, LEAF_H / 2 - 0.004 * i, LEAF_T + 0.012 - i * sheetT * 0.75)
      under.rotation.z = (i === 1 ? 1 : -1) * 0.008
      under.castShadow = true
      root.add(under)
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
      new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    )
    label.renderOrder = 2
    label.name = 'folder_label'
    label.position.set(0, LEAF_H / 2, LEAF_T + 0.012)
    pivot.add(label)

    return { root, pivot, page, pageSize: { w: pShort, h: pLong }, layoutX: -Math.PI / 2, openAxis: 'x' as const, openSign: -1, coverFace: { cx: 0, cy: LEAF_H / 2, z: 0, w: LEAF_W, h: LEAF_H } as LeafFace, frame: { up: [1, 0, 0] as const, right: [0, 1, 0] as const, normal: [0, 0, 1] as const } }
  }, [mats])

  const built = ogBuilt ?? genBuilt
  const model = built.root
  const parts = useRef(built)
  useEffect(() => {
    parts.current = built
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
  const swell = useRef<THREE.Group>(null)
  const hover = useRef({ on: false, amt: 0 })
  const openLin = useRef(0)
  const openState = useRef(false)
  const readYaw = useRef<number | null>(null)
  // scratch for the presented pose, so the frame loop allocates nothing
  const pv = useRef({
    n: new THREE.Vector3(),
    up: new THREE.Vector3(),
    x: new THREE.Vector3(),
    tgt: new THREE.Vector3(),
    m: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
  })
  useEffect(() => {
    openState.current = open
  }, [open])

  useFrame(({ camera }, dt) => {
    const d = Math.min(dt, 0.05)
    const dur = openState.current ? FOLDER_TIME.open : FOLDER_TIME.shut
    openLin.current = Math.min(1, Math.max(0, openLin.current + (openState.current ? d / dur : -d / dur)))
    const l = openLin.current
    const a = l * l * l * (l * (l * 6 - 15) + 10)
    if (parts.current.openAxis === 'y') parts.current.pivot.rotation.y = parts.current.openSign * Math.PI * a
    else parts.current.pivot.rotation.x = parts.current.openSign * Math.PI * a

    const h = hover.current
    h.amt += ((h.on ? 1 : 0) - h.amt) * Math.min(1, d * (h.on ? 10 : 4))
    if (swell.current) {
      swell.current.scale.setScalar(1 + 0.06 * h.amt)
      swell.current.position.y = 0.05 * h.amt
    }
    claimPointer('folder', h.on)

    const page = parts.current.page
    // always drawn in the overlay pass (it is depth-tested there), so the print never pops in as the
    // cover passes half open: the paper is simply always in the folder
    page.userData.compOverlay = true
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
      g.rotation.y = yaw + (1 - e) * turns * Math.PI * 2 + (readYaw.current ?? 0) * a
      g.visible = ia >= deal.at
    } else {
      g.rotation.y = yaw + (readYaw.current ?? 0) * a
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
      const half = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
      const size = Math.max(built.pageSize.h, built.pageSize.w) * (length / 1.25)
      const dist = Math.max(size / 2 / half, (size * 1.35) / 2 / (half * cam.aspect)) * 1.35
      // where it hangs: straight out in front of the camera, a touch below the centre line
      cam.getWorldDirection(p.n)
      p.tgt.copy(cam.position).addScaledVector(p.n, dist).addScaledVector(cam.up, -size * 0.06)
      // face it at the camera: the spread's normal is the group's +y, its up is the group's +z
      p.n.negate().normalize()
      p.up.set(0, 1, 0).addScaledVector(p.n, -p.n.y).normalize()
      p.x.crossVectors(p.n, p.up).normalize()
      p.m.makeBasis(p.x, p.n, p.up)
      p.q.setFromRotationMatrix(p.m)
      // and leaned back a little, the way a document is held rather than held up flat to the face
      p.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.22))
      const e = a * a * (3 - 2 * a)
      g.position.lerp(p.tgt, e)
      g.quaternion.slerp(p.q, e)
    }
  })

  return (
    <group ref={outer} position={deal ? [deal.from[0], position[1], deal.from[1]] : position} rotation={[0, yaw, 0]} visible={!deal}>
      <group
        ref={swell}
        onPointerOver={(e) => {
          if (!interactive) return
          e.stopPropagation()
          hover.current.on = true
        }}
        onPointerOut={() => {
          hover.current.on = false
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
          <FolderLeaf face={built.coverFace} mount={built.pivot} active={open} />
          {/* the page opens the resume itself */}
          <PageLink page={built.page} mount={built.root} active={open} size={built.pageSize} />
        </group>
      </group>
    </group>
  )
}
