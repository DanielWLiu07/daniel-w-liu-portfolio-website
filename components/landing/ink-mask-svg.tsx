'use client'

import { useRef, useEffect, useState } from 'react'

interface InkMaskSvgProps {
  maskX: string
  maskWidth: string
  startMaskAnimation: boolean
}

const ANIMATION_KEYSPLINE = '0.2 0.8 0.3 1'

export function InkMaskSvg({ maskX, maskWidth, startMaskAnimation }: InkMaskSvgProps) {
  const [isSafari] = useState(() => {
    if (typeof window === 'undefined') return false
    const ua = navigator.userAgent
    return /^((?!chrome|android).)*safari/i.test(ua)
  })
  const animRefs = useRef<SVGAnimateElement[]>([])
  const [safariOverlayOpacity, setSafariOverlayOpacity] = useState(1)

  // Trigger animations when startMaskAnimation becomes true
  useEffect(() => {
    if (!startMaskAnimation) return

    if (isSafari) {
      // Safari: just fade out the overlay
      setTimeout(() => {
        setSafariOverlayOpacity(0)
      }, 50)
    } else {
      // Chrome/Firefox: animate the mask
      setTimeout(() => {
        animRefs.current.forEach((anim) => {
          if (anim && typeof anim.beginElement === 'function') {
            try {
              anim.beginElement()
            } catch (e) {
              // Silently fail if animation doesn't work
            }
          }
        })
      }, 50)
    }
  }, [startMaskAnimation, isSafari])

  return (
    <>
      {/* Chrome/Firefox: Animated mask reveal */}
      {!isSafari && (
        <svg
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full z-[51]"
          style={{ willChange: 'transform, filter', transform: 'translateZ(0)' }}
        >
          <defs>
            <filter id="bgFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="6" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="200" xChannelSelector="R" yChannelSelector="G">
                <animate
                  ref={(el) => { if (el) animRefs.current[4] = el }}
                  attributeName="scale"
                  values="200;490"
                  dur="3s"
                  begin="indefinite"
                  calcMode="spline"
                  keySplines={ANIMATION_KEYSPLINE}
                  fill="freeze"
                />
              </feDisplacementMap>
            </filter>
            <mask id="bgMask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect x="50%" y="50%" width="0%" height="0%" fill="black" filter="url(#bgFilter)">
                <animate
                  ref={(el) => { if (el) animRefs.current[0] = el }}
                  attributeName="x"
                  values={`50%;${maskX}`}
                  dur="3s"
                  begin="indefinite"
                  calcMode="spline"
                  keySplines={ANIMATION_KEYSPLINE}
                  fill="freeze"
                />
                <animate
                  ref={(el) => { if (el) animRefs.current[1] = el }}
                  attributeName="y"
                  values="50%;4%"
                  dur="3s"
                  begin="indefinite"
                  calcMode="spline"
                  keySplines={ANIMATION_KEYSPLINE}
                  fill="freeze"
                />
                <animate
                  ref={(el) => { if (el) animRefs.current[2] = el }}
                  attributeName="width"
                  values={`0%;${maskWidth}`}
                  dur="3s"
                  begin="indefinite"
                  calcMode="spline"
                  keySplines={ANIMATION_KEYSPLINE}
                  fill="freeze"
                />
                <animate
                  ref={(el) => { if (el) animRefs.current[3] = el }}
                  attributeName="height"
                  values="0%;95%"
                  dur="3s"
                  begin="indefinite"
                  calcMode="spline"
                  keySplines={ANIMATION_KEYSPLINE}
                  fill="freeze"
                />
              </rect>
            </mask>
          </defs>
          <image
            href="/landing/images/white_paper.png"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            mask="url(#bgMask)"
          />
        </svg>
      )}

      {/* Safari: Static mask at max size (stays visible) + top paper layer that fades out */}
      {isSafari && (
        <>
          {/* SVG mask - stays visible, reveals content */}
          <svg
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute inset-0 w-full h-full z-[51]"
          >
            <defs>
              <filter id="bgFilterSafari" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="6" result="noise" seed="1" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="200" xChannelSelector="R" yChannelSelector="G" />
              </filter>
              <mask id="bgMaskSafari">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect x={maskX} y="4%" width={maskWidth} height="95%" fill="black" filter="url(#bgFilterSafari)" />
              </mask>
            </defs>
            <image
              href="/landing/images/white_paper.png"
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid slice"
              mask="url(#bgMaskSafari)"
            />
          </svg>

          {/* Top paper layer - fades out */}
          <div
            className="absolute inset-0 w-full h-full z-[52] pointer-events-none"
            style={{
              opacity: safariOverlayOpacity,
              transition: 'opacity 3s cubic-bezier(0.2, 0.8, 0.3, 1)',
              willChange: 'opacity'
            }}
          >
            <img
              src="/landing/images/white_paper.png"
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        </>
      )}
    </>
  )
}
