'use client'

import { useRef, useLayoutEffect, useState } from 'react'

interface InkMaskSvgProps {
  maskX: string
  maskWidth: string
  startMaskAnimation: boolean
  useSimpleFade?: boolean
}

const ANIMATION_KEYSPLINE = '0.2 0.8 0.3 1'

function triggerAnimations(animRefs: React.MutableRefObject<SVGAnimateElement[]>) {
  let triggered = false
  animRefs.current.forEach((anim) => {
    if (anim && typeof anim.beginElement === 'function') {
      try {
        anim.beginElement()
        triggered = true
      } catch {}
    }
  })
  return triggered
}

export function InkMaskSvg({ maskX, maskWidth, startMaskAnimation, useSimpleFade = false }: InkMaskSvgProps) {
  const [isSafari] = useState(() => {
    if (typeof window === 'undefined') return false
    const ua = navigator.userAgent
    return /^((?!chrome|android).)*safari/i.test(ua)
  })

  // Use simple fade for Safari OR when explicitly requested (e.g., initial load)
  const shouldUseSimpleFade = isSafari || useSimpleFade
  const animRefs = useRef<SVGAnimateElement[]>([])
  const animationTriggeredRef = useRef(false)
  const [safariOverlayOpacity, setSafariOverlayOpacity] = useState(1)

  useLayoutEffect(() => {
    if (!startMaskAnimation) return

    if (shouldUseSimpleFade) {
      setSafariOverlayOpacity(0)
      return
    }

    if (animationTriggeredRef.current) return

    if (triggerAnimations(animRefs)) {
      animationTriggeredRef.current = true
      return
    }

    const delays = [0, 16, 32, 50, 100]
    const timeouts: NodeJS.Timeout[] = []

    delays.forEach((delay) => {
      const timeout = setTimeout(() => {
        if (animationTriggeredRef.current) return
        if (triggerAnimations(animRefs)) {
          animationTriggeredRef.current = true
          timeouts.forEach(t => clearTimeout(t))
        }
      }, delay)
      timeouts.push(timeout)
    })

    return () => {
      timeouts.forEach(t => clearTimeout(t))
    }
  }, [startMaskAnimation, shouldUseSimpleFade])

  useLayoutEffect(() => {
    if (!startMaskAnimation) {
      animationTriggeredRef.current = false
    }
  }, [startMaskAnimation])

  return (
    <>
      {!shouldUseSimpleFade && (
        <svg
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full z-[51]"
          style={{ willChange: 'transform, filter', transform: 'translateZ(0)' }}
        >
          <defs>
            <filter id="bgFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="5" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="200" xChannelSelector="R" yChannelSelector="G">
                <animate
                  ref={(el: SVGAnimateElement | null) => { if (el) animRefs.current[4] = el }}
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
                  ref={(el: SVGAnimateElement | null) => { if (el) animRefs.current[0] = el }}
                  attributeName="x"
                  values={`50%;${maskX}`}
                  dur="3s"
                  begin="indefinite"
                  calcMode="spline"
                  keySplines={ANIMATION_KEYSPLINE}
                  fill="freeze"
                />
                <animate
                  ref={(el: SVGAnimateElement | null) => { if (el) animRefs.current[1] = el }}
                  attributeName="y"
                  values="50%;4%"
                  dur="3s"
                  begin="indefinite"
                  calcMode="spline"
                  keySplines={ANIMATION_KEYSPLINE}
                  fill="freeze"
                />
                <animate
                  ref={(el: SVGAnimateElement | null) => { if (el) animRefs.current[2] = el }}
                  attributeName="width"
                  values={`0%;${maskWidth}`}
                  dur="3s"
                  begin="indefinite"
                  calcMode="spline"
                  keySplines={ANIMATION_KEYSPLINE}
                  fill="freeze"
                />
                <animate
                  ref={(el: SVGAnimateElement | null) => { if (el) animRefs.current[3] = el }}
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

      {shouldUseSimpleFade && (
        <>
          <svg
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute inset-0 w-full h-full z-[51]"
          >
            <defs>
              <filter id="bgFilterSafari" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="5" result="noise" seed="1" />
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
