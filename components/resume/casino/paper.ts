/**
 * Paper, as an object: the bent solid the resume is printed on, the shadow it casts on what it lies on,
 * and the bend those share. Its own module because BOTH the folder and the furniture on its leaf build
 * paper out of it, and the QR's backing has to be the same thing as the resume's sheet rather than a
 * lookalike, or the two read as different materials on the same folder.
 */
import * as THREE from 'three'

/**
 * A soft dark patch to lie under the paper. The folder's materials are graph materials and are unlit by
 * the renderer's lights, so they cannot RECEIVE a shadow: without this the sheet has nothing under it and
 * reads as printed onto the leaf rather than resting on it. This is the single strongest depth cue the
 * page has, worth far more than its thickness in pixels.
 */
export function contactShadowTexture(): THREE.CanvasTexture {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const x = c.getContext('2d')!
  x.clearRect(0, 0, S, S)
  const m = S * 0.14
  x.filter = `blur(${Math.round(S * 0.05)}px)`
  x.fillStyle = '#3b2c1a'
  x.beginPath()
  x.roundRect(m, m, S - 2 * m, S - 2 * m, S * 0.035)
  x.fill()
  x.filter = 'none'
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

/**
 * The bend of a sheet of paper lying in a folder, in units of its rise at the free corner. Paper in a
 * folder is never flat: it springs up off the wedge away from the fold, the free corners lift most, and
 * the middle sags between them. `skew` is a per-sheet lean so no two sheets in the stack sit the same.
 */
export function paperHeight(u: number, v: number, skew: number): number {
  // clamped, and not for tidiness: u is a vertex coordinate over the sheet's own width, so float rounding
  // puts the edge ring a hair either side of 0, and Math.pow(-1e-9, 1.6) is NaN. One NaN vertex NaNs the
  // bounding box, which NaNs the fit, and the whole folder stops being drawn.
  u = Math.min(1, Math.max(0, u))
  const l = Math.pow(u, 1.6)
  // The CORNER term is deliberately small. It is the most paper-like part of the curl and also the part
  // that lifts the page's free corners furthest off the leaf, which tips their edges away from the leaf's
  // own: measured on the render, the page's edge sat within 0.26 degrees of the folder's near the fold and
  // 3.06 degrees off it at the free corner, and that corner is exactly the one that reads as not lining up
  // with the folder. Most of the rise is carried by the plain lift now, which keeps the sheet's edges
  // parallel to the leaf's while it still springs off the wedge.
  return 0.78 * l + 0.16 * l * v * v - 0.1 * Math.sin(Math.PI * u) * (1 - v * v) + skew * l * v
}


export interface Sheet {
  /** the stock: a solid slab, painted by the compositor along with everything else */
  mesh: THREE.Mesh
  /** the printed side: a bent plane riding the stock, so the ink can be kept out of the paint pass */
  face: THREE.Mesh
  /** press it flat (0) or let it relax into its full curl (1) */
  curl: (v: number) => void
}

/**
 * A sheet of paper: a slab with real thickness whose vertices are BENT, so it is a curved solid rather
 * than a flat card with a print stuck on it. The bend runs along the slab's own thickness axis, so the
 * print, the four edges and the silhouette all curve together and no UV moves.
 *
 * The curl is driven from the folder's open value rather than baked, for two reasons: paper under a shut
 * cover really is pressed flat, and a sheet that only relaxes once the cover is clear cannot poke through
 * it whatever the numbers are. Normals and the baked shade are computed once at full curl and left alone
 * while it moves, which is a slightly early shade for the second the folder is opening and invisible.
 *
 * The shade goes into the colour attribute because the print is drawn UNLIT in the overlay pass: a
 * view-dependent term would never show there, and without any shading a curved sheet reads as flat.
 */
export function paperSheet(
  size: { w: number; h: number; t: number },
  mats: THREE.Material | THREE.Material[],
  o: {
    /** the axis that measures distance from the fold */
    across: 'x' | 'y'
    /** which end of that axis the fold sits on */
    foldAt: -1 | 1
    /** which way is up off the leaf, along the thickness axis */
    up: -1 | 1
    /** how far the free corner rises at full curl, in the model's units */
    rise: number
    skew?: number
    /**
     * How far in from the sheet's edge the PRINTED face stops, as a fraction of the sheet. Above zero the
     * stock shows as a margin all round the print, and that margin goes through the painterly pass while
     * the print does not: the sheet gets a soft painted border that belongs to the folder rather than a
     * razor-sharp rectangle laid over it, which is what made the page read as pasted on at its corners.
     */
    faceInset?: number
  },
): Sheet {
  const along = o.across === 'x' ? size.w : size.h
  const wide = o.across === 'x' ? size.h : size.w
  const na = 22
  const nb = Math.max(6, Math.round((na * wide) / along))
  const geo = new THREE.BoxGeometry(size.w, size.h, size.t, o.across === 'x' ? na : nb, o.across === 'x' ? nb : na, 1)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const arr = pos.array as Float32Array
  const flat = new Float32Array(arr) // the unbent sheet, kept so every curl bends from the same shape
  const ai = o.across === 'x' ? 0 : 1
  const bi = o.across === 'x' ? 1 : 0
  const skew = o.skew ?? 0
  // The stock swells with the same driver as the curl. What the sheet may be while SHUT is fixed by the
  // cover lying on it (measured: past 0.30 of the leaf's depth, white shows through a closed folder), and
  // that ceiling puts its cut edge at about a pixel and a half on screen, which is no thickness at all.
  // Nothing is looking at it while it is shut, so it is pressed thin there and comes to full stock as it
  // opens, exactly as the curl does.
  const SWELL = 2.8
  const curl = (k: number) => {
    const sw = 1 + (SWELL - 1) * k
    for (let i = 0; i < pos.count; i++) {
      const a = flat[i * 3 + ai]
      const b = flat[i * 3 + bi]
      const u = o.foldAt < 0 ? (a + along / 2) / along : (along / 2 - a) / along
      const v = b / (wide / 2)
      arr[i * 3 + 2] = flat[i * 3 + 2] * sw + o.up * o.rise * k * paperHeight(u, v, skew)
    }
    pos.needsUpdate = true
  }
  curl(1)
  geo.computeVertexNormals()
  // The shade comes from the sheet's own HEIGHT, not from a light against its normal. A lambert term was
  // the first attempt and measured out at 0.8 percent across the whole page: a sheet this thin only ever
  // tilts about three degrees, so no aiming of the light rescues it. Height spends the whole range on the
  // whole curl, which is what the eye actually reads on a curved page: bright where it lifts into the
  // room, duller down in the trough by the fold.
  const nrm = geo.attributes.normal as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const a = flat[i * 3 + ai]
    const b = flat[i * 3 + bi]
    const u = o.foldAt < 0 ? (a + along / 2) / along : (along / 2 - a) / along
    const h = paperHeight(u, b / (wide / 2), skew)
    // which face the vertex is on: 1 the printed side, -1 the underside, 0 one of the four cut edges
    const face = nrm.getZ(i) * o.up
    // rebased so the brightest point of the printed side is exactly 1: on white stock the paper IS the
    // brightest thing the sheet has, and any headroom above 1 just clips the curl gradient flat
    const s = Math.min(1, Math.max(0.5, (0.82 + 0.18 * (face * 0.5 + 0.5)) * (1 + 0.07 * (h - 1))))
    col[i * 3] = s
    col[i * 3 + 1] = s
    col[i * 3 + 2] = s
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.computeBoundingBox()
  const mesh = new THREE.Mesh(geo, mats)
  mesh.castShadow = true

  // The printed side, as its own bent plane sitting a hair proud of the stock. The split is what lets the
  // PAPER go through the painterly pass with the rest of the folder while the INK does not: the compositor
  // reads whole objects, and run over 8pt type it turns a resume into grey mush. This way the sheet is
  // part of the painting and the print is still a print.
  const fw = o.across === 'x' ? na : nb
  const fh = o.across === 'x' ? nb : na
  // Concentric with the slab, so a face vertex's own coordinate IS its coordinate on the slab: the bend
  // below is still evaluated against the SLAB's width, and the print lies exactly on the paper it is on.
  const fk = 1 - (o.faceInset ?? 0)
  const fgeo = new THREE.PlaneGeometry(size.w * fk, size.h * fk, fw, fh)
  const fpos = fgeo.attributes.position as THREE.BufferAttribute
  const farr = fpos.array as Float32Array
  const fflat = new Float32Array(farr)
  const bendFace = (k: number) => {
    // rides the swollen stock, not the pressed one, or the print sinks into the paper as it opens
    const lift = o.up * ((size.t / 2) * (1 + (SWELL - 1) * k) + Math.max(size.t * 0.25, 0.0008))
    for (let i = 0; i < fpos.count; i++) {
      const a = fflat[i * 3 + ai]
      const b = fflat[i * 3 + bi]
      const u = o.foldAt < 0 ? (a + along / 2) / along : (along / 2 - a) / along
      farr[i * 3 + 2] = fflat[i * 3 + 2] + lift + o.up * o.rise * k * paperHeight(u, b / (wide / 2), skew)
    }
    fpos.needsUpdate = true
  }
  bendFace(1)
  fgeo.computeVertexNormals()
  // A plane faces +z, so on a sheet whose printed side is its LOW-z face the print arrives mirrored: the
  // box face this replaces carries the other winding. Flipping u is the fix, not rotating the mesh, which
  // would put the bend's fold on the wrong edge.
  if (o.up < 0) {
    const uv = fgeo.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i))
    uv.needsUpdate = true
  }
  // the same baked shade as the stock, on the printed side's branch, so the ink sits ON the curve instead
  // of floating flat over it
  const fcol = new Float32Array(fpos.count * 3)
  for (let i = 0; i < fpos.count; i++) {
    const a = fflat[i * 3 + ai]
    const b = fflat[i * 3 + bi]
    const u = o.foldAt < 0 ? (a + along / 2) / along : (along / 2 - a) / along
    const h = paperHeight(u, b / (wide / 2), skew)
    // the same curve as the stock's own printed side, so a point on the print and the point of paper
    // directly under it are shaded identically
    const sh = Math.min(1, Math.max(0.5, 1 + 0.07 * (h - 1)))
    fcol[i * 3] = sh
    fcol[i * 3 + 1] = sh
    fcol[i * 3 + 2] = sh
  }
  fgeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3))
  fgeo.computeBoundingBox()
  const face = new THREE.Mesh(fgeo, mats)
  face.renderOrder = 1

  const both = (k: number) => {
    curl(k)
    bendFace(k)
  }
  return { mesh, face, curl: both }
}

