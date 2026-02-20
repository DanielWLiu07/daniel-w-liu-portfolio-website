'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { LoadingContent } from './loading-content'
import { ANIMATION_DURATION, ANIMATION_KEYSPLINE } from './constants'

interface InkMaskSvgProps {
  svgRef: React.RefObject<SVGSVGElement | null>
  maskType: 'cover' | 'reveal'
  onReady?: () => void
  triggerAnimation?: boolean
}

function triggerAnimations(svg: SVGSVGElement | null) {
  if (!svg) return false
  const animations = svg.querySelectorAll('animate')
  if (animations.length === 0) return false

  let triggered = false
  animations.forEach((anim) => {
    try {
      (anim as SVGAnimateElement).beginElement()
      triggered = true
    } catch {}
  })
  return triggered
}

export function InkMaskSvg({ svgRef, maskType, onReady, triggerAnimation }: InkMaskSvgProps) {
  const [isSafari] = useState(() => {
    if (typeof window === 'undefined') return false
    const ua = navigator.userAgent
    return /^((?!chrome|android).)*safari/i.test(ua)
  })

  const internalSvgRef = useRef<SVGSVGElement>(null)
  const animationTriggeredRef = useRef(false)
  const onReadyCalledRef = useRef(false)

  const [cssOpacity, setCssOpacity] = useState(() => maskType === 'cover' ? 0 : 1)

  const signalReady = () => {
    if (onReadyCalledRef.current) return
    onReadyCalledRef.current = true
    onReady?.()
  }

  useLayoutEffect(() => {
    if (isSafari) {
      signalReady()
      return
    }

    const checkSvgReady = () => {
      const svg = svgRef?.current || internalSvgRef.current
      if (!svg) return false
      const animations = svg.querySelectorAll('animate')
      return animations.length > 0
    }

    if (checkSvgReady()) {
      signalReady()
      return
    }

    const delays = [0, 16, 32, 50, 100, 150, 200, 300]
    const timeouts: NodeJS.Timeout[] = []

    delays.forEach((delay) => {
      const timeout = setTimeout(() => {
        if (onReadyCalledRef.current) return
        if (checkSvgReady()) {
          signalReady()
          timeouts.forEach(t => clearTimeout(t))
        }
      }, delay)
      timeouts.push(timeout)
    })

    const fallbackTimeout = setTimeout(() => {
      if (!onReadyCalledRef.current) {
        signalReady()
      }
    }, 350)

    return () => {
      timeouts.forEach(t => clearTimeout(t))
      clearTimeout(fallbackTimeout)
    }
  }, [isSafari, svgRef])

  useLayoutEffect(() => {
    if (!triggerAnimation || isSafari || animationTriggeredRef.current) return

    const svg = svgRef?.current || internalSvgRef.current

    if (triggerAnimations(svg)) {
      animationTriggeredRef.current = true
      return
    }

    const delays = [0, 16, 32, 50, 100, 150, 200, 300]
    const timeouts: NodeJS.Timeout[] = []

    delays.forEach((delay) => {
      const timeout = setTimeout(() => {
        if (animationTriggeredRef.current) return
        const svg = svgRef?.current || internalSvgRef.current
        if (triggerAnimations(svg)) {
          animationTriggeredRef.current = true
          timeouts.forEach(t => clearTimeout(t))
        }
      }, delay)
      timeouts.push(timeout)
    })

    return () => {
      timeouts.forEach(t => clearTimeout(t))
    }
  }, [triggerAnimation, isSafari, svgRef])

  useEffect(() => {
    if (!isSafari || !triggerAnimation) return
    if (maskType === 'cover') {
      const timer = setTimeout(() => setCssOpacity(1), 50)
      return () => clearTimeout(timer)
    } else if (maskType === 'reveal') {
      const timer = setTimeout(() => setCssOpacity(0), 50)
      return () => clearTimeout(timer)
    }
  }, [maskType, isSafari, triggerAnimation])

  const filterId = maskType === 'cover' ? 'inkNoiseCover' : 'inkNoiseReveal'
  const maskId = maskType === 'cover' ? 'inkMaskCover' : 'inkMaskReveal'
  const baseFill = maskType === 'cover' ? 'black' : 'white'
  const animFill = maskType === 'cover' ? 'white' : 'black'

  const transitionDuration = maskType === 'cover' ? '0.9s' : '1.5s'

  if (isSafari) {
    return (
      <div
        className="fixed inset-0 z-[10002] pointer-events-none"
        style={{
          opacity: cssOpacity,
          transition: `opacity ${transitionDuration} cubic-bezier(0.2, 0.8, 0.3, 1)`,
          willChange: 'opacity'
        }}
      >
        <div className="relative w-full h-full">
          <Image
            src="/landing/images/white_paper.webp"
            alt=""
            fill
            className="object-cover"
            priority
          />
          <LoadingContent />
        </div>
      </div>
    )
  }

  return (
    <svg
        ref={(el) => {
          if (svgRef && 'current' in svgRef) {
            (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = el
          }
          (internalSvgRef as React.MutableRefObject<SVGSVGElement | null>).current = el
        }}
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full"
        style={{ willChange: 'transform, filter', transform: 'translateZ(0)', zIndex: 2 }}
      >
        <defs>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="200" xChannelSelector="R" yChannelSelector="G">
              <animate
                attributeName="scale"
                values="200;490"
                dur={ANIMATION_DURATION}
                begin="indefinite"
                calcMode="spline"
                keySplines={ANIMATION_KEYSPLINE}
                fill="freeze"
              />
            </feDisplacementMap>
          </filter>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill={baseFill} />
            <rect x="50%" y="50%" width="0%" height="0%" fill={animFill} filter={`url(#${filterId})`}>
              <animate attributeName="x" values="50%;-25%" dur={ANIMATION_DURATION} begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
              <animate attributeName="y" values="50%;-25%" dur={ANIMATION_DURATION} begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
              <animate attributeName="width" values="0%;150%" dur={ANIMATION_DURATION} begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
              <animate attributeName="height" values="0%;150%" dur={ANIMATION_DURATION} begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            </rect>
          </mask>
        </defs>
        <image
          href="/landing/images/white_paper.webp"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid slice"
          mask={`url(#${maskId})`}
        />
        <foreignObject x="0" y="0" width="100%" height="100%" mask={`url(#${maskId})`}>
          <div
            style={{
              width: '100%',
              height: '100%',
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <LoadingContent />
          </div>
        </foreignObject>
    </svg>
  )
}
