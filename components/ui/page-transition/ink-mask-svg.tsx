'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { LoadingContent } from './loading-content'
import { ANIMATION_DURATION, ANIMATION_KEYSPLINE } from './constants'

interface InkMaskSvgProps {
  svgRef: React.RefObject<SVGSVGElement | null>
  maskType: 'cover' | 'reveal'
}

export function InkMaskSvg({ svgRef, maskType }: InkMaskSvgProps) {
  const [isSafari] = useState(() => {
    if (typeof window === 'undefined') return false
    const ua = navigator.userAgent
    return /^((?!chrome|android).)*safari/i.test(ua)
  })
  const [safariOpacity, setSafariOpacity] = useState(() => maskType === 'cover' ? 0 : 1)

  // For Safari: handle fade in/out based on maskType
  useEffect(() => {
    if (!isSafari) return

    if (maskType === 'cover') {
      // Cover: fade in
      const timer = setTimeout(() => {
        setSafariOpacity(1)
      }, 50)
      return () => clearTimeout(timer)
    } else if (maskType === 'reveal') {
      // Reveal: fade out
      const timer = setTimeout(() => {
        setSafariOpacity(0)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isSafari, maskType])

  const filterId = maskType === 'cover' ? 'inkNoiseCover' : 'inkNoiseReveal'
  const maskId = maskType === 'cover' ? 'inkMaskCover' : 'inkMaskReveal'
  const baseFill = maskType === 'cover' ? 'black' : 'white'
  const animFill = maskType === 'cover' ? 'white' : 'black'

  // Safari: Simple fade in/out with paper + loading content
  if (isSafari) {
    const transitionDuration = maskType === 'cover' ? '0.9s' : '1.5s' // Faster fade in/out
    return (
      <div
        className="fixed inset-0 z-[9999] pointer-events-none"
        style={{
          opacity: safariOpacity,
          transition: `opacity ${transitionDuration} cubic-bezier(0.2, 0.8, 0.3, 1)`,
          willChange: 'opacity'
        }}
      >
        <div className="relative w-full h-full">
          <Image
            src="/landing/images/white_paper.png"
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

  // Chrome/Firefox: Full SVG mask animation
  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 w-full h-full"
      style={{ willChange: 'transform, filter', transform: 'translateZ(0)' }}
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="6" result="noise" />
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
        href="/landing/images/white_paper.png"
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
