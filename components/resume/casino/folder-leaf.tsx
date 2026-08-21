'use client'

/**
 * What is laid out on the open folder's right leaf: a QR to the resume up top, a download button under it,
 * and a row of link tokens along the bottom. They are printed on the cover's inner face, so they are tucked
 * inside while the folder is shut and face the reader once it opens.
 *
 * Links come from data/social-links (SOCIAL_URLS), never from here. The marks are the site's own logo
 * images, so the tokens and the DOM icons are the same artwork.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SOCIAL_URLS } from '@/data/social-links'
import { claimPointer, releasePointer } from './cursor'
import { markMaterial } from './materials'
import { planarUV } from './playing-cards'

const INK = '#1f1b16'
/** the resume itself: viewed from the QR and the page, downloaded from the button */
export const RESUME_PDF = '/assets/resume.pdf'
export const RESUME_FILENAME = 'Daniel_W_Liu_Resume.pdf'
const QR_IMAGE = '/resume/qr-resume.png'

/** the leaf face the furniture lies on, in the folder's own units */
export interface LeafFace {
  cx: number
  cy: number
  z: number
  w: number
  h: number
}

interface Item {
  key: string
  kind: 'qr' | 'button' | 'logo'
  label: string
  /** logo artwork: an image from the site, or a path in a 24 x 24 box */
  image?: string
  path?: string
  colour?: string
  href?: string
}

// LinkedIn and Gmail are drawn as their marks rather than taken from the site's icon images: those images
// carry the brand's own tile and white envelope body, which is a background box by another name.
const LOGOS: Item[] = [
  { key: 'github', kind: 'logo', label: 'GitHub', image: '/about/images/github.webp', href: SOCIAL_URLS.github },
  {
    key: 'linkedin',
    kind: 'logo',
    label: 'LinkedIn',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z',
    colour: '#0a66c2',
    href: SOCIAL_URLS.linkedin,
  },
  {
    key: 'email',
    kind: 'logo',
    label: 'Email',
    path: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z',
    colour: '#ea4335',
    href: SOCIAL_URLS.email,
  },
  // X has no image in the site's asset set, so the mark is drawn from its own outline
  {
    key: 'x',
    kind: 'logo',
    label: 'X',
    path: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
    href: SOCIAL_URLS.x,
  },
]

/** the shape of what was drawn, as a luminance mask: the material needs the alpha as its own map */
function maskOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const x = c.getContext('2d')!
  x.drawImage(src, 0, 0)
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = '#ffffff'
  x.fillRect(0, 0, c.width, c.height)
  x.globalCompositeOperation = 'destination-over'
  x.fillStyle = '#000000'
  x.fillRect(0, 0, c.width, c.height)
  return c
}

/** a canvas that fills in once its image has loaded (the texture is refreshed in place) */
/**
 * One item's artwork on a TRANSPARENT canvas: no card stock behind it, so the mark sits straight on the
 * leaf. Fills in once its image has loaded (the texture and its mask are refreshed in place).
 */
function itemCanvas(item: Item, onReady: (() => void) | null, aspect: number): HTMLCanvasElement {
  const W = 512
  const H = Math.round(W / aspect)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!

  if (item.kind === 'button') {
    // the download mark only: a stroke down into a tray, drawn rather than set as a glyph so its weight
    // matches the lettering
    const cx = W / 2
    const cy = H * 0.44
    const r = Math.min(W, H) * 0.3
    x.strokeStyle = INK
    x.lineWidth = Math.max(4, r * 0.26)
    x.lineCap = 'round'
    x.lineJoin = 'round'
    x.beginPath()
    x.moveTo(cx, cy - r)
    x.lineTo(cx, cy + r * 0.45)
    x.stroke()
    x.beginPath()
    x.moveTo(cx - r * 0.6, cy - r * 0.12)
    x.lineTo(cx, cy + r * 0.5)
    x.lineTo(cx + r * 0.6, cy - r * 0.12)
    x.stroke()
    x.beginPath()
    x.moveTo(cx - r * 0.82, cy + r * 0.86)
    x.lineTo(cx + r * 0.82, cy + r * 0.86)
    x.stroke()
    return c
  }

  if (item.path) {
    const box = Math.min(W, H) * 0.86
    const sc = box / 24
    x.save()
    x.translate((W - box) / 2, (H - box) / 2)
    x.scale(sc, sc)
    x.fillStyle = item.colour ?? INK
    x.fill(new Path2D(item.path))
    x.restore()
    return c
  }

  if (item.image) {
    const img = new Image()
    img.onload = () => {
      const box = Math.min(W, H) * (item.kind === 'qr' ? 1 : 0.94)
      const s = Math.min(box / img.width, box / img.height)
      const dw = img.width * s
      const dh = img.height * s
      x.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
      onReady?.()
    }
    img.src = item.image
  }
  return c
}

function openResume() {
  window.open(RESUME_PDF, '_blank', 'noopener,noreferrer')
}

function downloadResume() {
  const a = document.createElement('a')
  a.href = RESUME_PDF
  a.download = RESUME_FILENAME
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function FolderLeaf({ face, mount, active }: { face: LeafFace; mount: THREE.Object3D | null; active: boolean }) {
  // ?noleaf renders the leaf bare: capture with and without, diff, and whatever the furniture does to what
  // is behind it shows up as itself
  const off = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('noleaf')
  const group = useRef<THREE.Group>(null)
  const hover = useRef<number>(-1)
  const swell = useRef<number[]>([])

  // the reading camera frames the PAGE, so only the inboard part of this leaf is on screen: everything
  // sits between the crease and about two thirds of the way out
  const across = face.cx * 0.62
  const qrSide = Math.min(face.w * 0.44, face.h * 0.34)
  const btnW = qrSide * 1.25
  const btnH = qrSide * 0.27
  const logoSide = btnW / (LOGOS.length + (LOGOS.length - 1) * 0.2)
  const gap = logoSide * 0.2

  const items = useMemo<(Item & { w: number; h: number; x: number; y: number })[]>(() => {
    const row = LOGOS.length * logoSide + (LOGOS.length - 1) * gap
    return [
      { key: 'qr', kind: 'qr', label: 'Scan for resume', image: QR_IMAGE, w: qrSide, h: qrSide, x: across, y: face.cy + qrSide * 0.5 },
      { key: 'download', kind: 'button', label: 'Download', w: btnH * 1.25, h: btnH * 1.25, x: across, y: face.cy - qrSide * 0.24 },
      ...LOGOS.map((l, k) => ({
        ...l,
        w: logoSide,
        h: logoSide,
        x: across - row / 2 + logoSide / 2 + k * (logoSide + gap),
        y: face.cy - qrSide * 0.62,
      })),
    ]
  }, [across, face.cy, qrSide, btnH, logoSide, gap])

  const built = useMemo(
    () =>
      items.map((it) => {
        const tex = new THREE.CanvasTexture(document.createElement('canvas'))
        const mask = new THREE.CanvasTexture(document.createElement('canvas'))
        const refresh = () => {
          mask.image = maskOf(tex.image as HTMLCanvasElement)
          tex.needsUpdate = true
          mask.needsUpdate = true
        }
        tex.image = itemCanvas(it, refresh, it.w / it.h)
        mask.image = maskOf(tex.image as HTMLCanvasElement)
        for (const t of [tex, mask]) {
          t.colorSpace = THREE.SRGBColorSpace
          t.anisotropy = 8
          t.needsUpdate = true
        }
        const geo = planarUV(new THREE.PlaneGeometry(it.w, it.h))
        // the QR has to SCAN, and the painterly pass (chromatic edges, bleed, paper grain) destroys it:
        // verified with a barcode detector on the rendered pixels, not just on the source image. So it is
        // drawn plainly in the overlay pass, exactly like the resume page, which is the same problem.
        const mat =
          it.kind === 'qr'
            ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
            : markMaterial(tex, mask, `leaf:${it.key}`)
        return { it, tex, mask, geo, mat }
      }),
    [items],
  )
  useEffect(
    () => () => {
      for (const b of built) {
        b.tex.dispose()
        b.mask.dispose()
        b.geo.dispose()
      }
      releasePointer('leaf')
    },
    [built],
  )

  // the furniture is printed on the cover, so it belongs to the cover and swings with it
  useLayoutEffect(() => {
    const g = group.current
    if (!g || !mount) return
    mount.add(g)
    return () => {
      mount.remove(g)
    }
  }, [mount])

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05)
    const g = group.current
    if (!g) return
    for (let i = 0; i < built.length; i++) {
      const want = active && hover.current === i ? 1 : 0
      const cur = swell.current[i] ?? 0
      const s = cur + (want - cur) * Math.min(1, d * (want ? 12 : 5))
      swell.current[i] = s
      const o = g.children[i]
      if (!o) continue
      o.scale.setScalar(1 + 0.1 * s)
      o.position.z = face.z + qrSide * 0.012 + s * qrSide * 0.05
    }
  })

  const onPick = (it: Item) => {
    if (!active) return
    if (it.kind === 'button') downloadResume()
    else if (it.kind === 'qr') openResume()
    else if (it.href) window.open(it.href, '_blank', 'noopener,noreferrer')
    // a mark with no URL yet (X) is inert rather than sending anyone somewhere wrong
  }

  if (off) return null
  return (
    <group ref={group}>
      {built.map(({ it, geo, mat }, i) => (
        <mesh
          key={it.key}
          geometry={geo}
          material={mat}
          position={[it.x, it.y, face.z + qrSide * 0.012]}
          rotation={[0, 0, (i % 2 === 0 ? 1 : -1) * 0.012]}
          // A mark is printed ON the leaf, so the LEAF is the surface: the position pass renders through one
          // override material that cannot see alphaTest, so a mark would stamp its whole QUAD into the
          // position buffer. Even a hair's offset there is a discontinuity, and the pass's grain and edge
          // terms amplify it into a visible rectangle around every mark. compNoPosition keeps it out (the
          // QR is an overlay, which is excluded already).
          userData={it.kind === 'qr' ? { compOverlay: true } : { compNoPosition: true }}
          onPointerOver={(e) => {
            if (!active) return
            e.stopPropagation()
            hover.current = i
            claimPointer('leaf', true)
          }}
          onPointerOut={() => {
            if (hover.current === i) hover.current = -1
            claimPointer('leaf', false)
          }}
          onClick={(e) => {
            if (!active) return
            e.stopPropagation()
            onPick(it)
          }}
        />
      ))}
    </group>
  )
}
