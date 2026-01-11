'use client'

import Image from 'next/image'
import { LoadingContent } from './loading-content'
import { ANIMATION_DURATION, ANIMATION_KEYSPLINE } from './constants'

interface InkMaskSvgProps {
  svgRef: React.RefObject<SVGSVGElement | null>
  maskType: 'cover' | 'reveal'
}

export function InkMaskSvg({ svgRef, maskType }: InkMaskSvgProps) {
  const filterId = maskType === 'cover' ? 'inkNoiseCover' : 'inkNoiseReveal'
  const maskId = maskType === 'cover' ? 'inkMaskCover' : 'inkMaskReveal'
  const baseFill = maskType === 'cover' ? 'black' : 'white'
  const animFill = maskType === 'cover' ? 'white' : 'black'

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 w-full h-full"
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
      <foreignObject width="100%" height="100%" mask={`url(#${maskId})`}>
        <div className="relative w-full h-full overflow-hidden">
          <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
          <LoadingContent />
        </div>
      </foreignObject>
    </svg>
  )
}
