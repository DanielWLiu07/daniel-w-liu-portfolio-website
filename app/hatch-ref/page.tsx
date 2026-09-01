'use client'

/**
 * /hatch-ref: his Blender scene with the ship as its only object, so the port
 * can be checked against a render instead of against an opinion.
 *
 * Query flags:
 *   ?hatch         wear "3. Cross hatching shader" (his shader BALL material)
 *                  instead of the ship's own `from video`, which is the shader
 *                  the projects background video was rendered with and the
 *                  default here
 *   ?layer=little|patch|under   one factor of the from-video product on its
 *                  own. The three groups are multiplied, so a product that is
 *                  too dark says nothing about which factor is
 *   ?tone          the lighting pass alone (Diffuse -> Shader to RGB), no ink
 *   ?shade         the shade scalar alone: albedo 1, world 0, so the frame is
 *                  sum(E * N.L) / pi and nothing else
 *   ?const=<0..1>  a flat linear grey filling the frame, to check the output
 *                  transfer function rather than assume it
 *   ?bg=<colour>   what to paint behind the transparent film (default white,
 *                  which is what his film_transparent render composites over)
 *   ?noline        drop his Grease Pencil Line Art pass (on by default, because
 *                  his scene renders it and without it the copy matches a render
 *                  that does not look like his scene)
 *   ?lw=<px>       Line Art stroke width in pixels. The default is CALIBRATED,
 *                  not chosen: his modifier says thickness 25 in Grease Pencil
 *                  units, which is not pixels, so the width was swept against
 *                  the Blender render at 1094x1001 and 1.3 is where the copy's
 *                  ink coverage (16.49 percent) meets Blender's (16.38). Wider
 *                  reads heavier than his; 2.2 was 21.4 percent.
 *   ?crease=<deg>  Line Art crease threshold, Blender's is 140. LOWER means
 *                  fewer edges qualify, which is the cheapest way to buy back
 *                  frame time if the stroke count is hurting
 *   ?nudge=<u>     how far the strokes are pulled toward the eye, to stop a
 *                  contour z-fighting with the surface it outlines
 */
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const HisScene = dynamic(() => import('@/components/projects/manga/his-scene'), { ssr: false })

export default function HatchRefPage() {
  // read on the client only: a `typeof window` branch in render is a hydration
  // mismatch by construction, the same way /projects and /resume gate
  const [q, setQ] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search))
  }, [])
  if (!q) return null
  const mode = q.has('const') ? 'const' : q.has('shade') ? 'shade' : q.has('tone') ? 'tone' : 'ink'
  return (
    <HisScene
      mode={mode}
      shader={q.has('hatch') ? 'hatch' : 'video'}
      layer={(q.get('layer') as 'all' | 'little' | 'patch' | 'under') ?? 'all'}
      constant={Number(q.get('const') ?? 0.5)}
      background={q.get('bg') ?? undefined}
      lineArt={!q.has('noline') && mode !== 'const'}
      lineWidth={Number(q.get('lw') ?? 1.3)}
      nudge={Number(q.get('nudge') ?? 0.004)}
      crease={((Number(q.get('crease') ?? 140)) * Math.PI) / 180}
    />
  )
}
