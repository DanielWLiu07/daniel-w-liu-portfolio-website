'use client'

import Image from 'next/image'

const ANIMATION_KEYSPLINE = '0.2 0.8 0.3 1'

interface InkMaskSvgProps {
  svgMaskRef: React.RefObject<SVGAnimateElement | null>
  maskX: string
  maskWidth: string
}

export function InkMaskSvg({ svgMaskRef, maskX, maskWidth }: InkMaskSvgProps) {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 w-full h-full z-[51]">
      <defs>
        <filter id="bgFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="6" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
            <animate
              ref={svgMaskRef}
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
            <animate attributeName="x" values={`50%;${maskX}`} dur="3s" begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="y" values="50%;4%" dur="3s" begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="width" values={`0%;${maskWidth}`} dur="3s" begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
            <animate attributeName="height" values="0%;95%" dur="3s" begin="indefinite" calcMode="spline" keySplines={ANIMATION_KEYSPLINE} fill="freeze" />
          </rect>
        </mask>
      </defs>
      <foreignObject width="100%" height="100%" mask="url(#bgMask)">
        <div className="relative w-full h-full overflow-hidden">
          <Image src="/landing/images/white_paper.png" alt="" fill className="object-cover" priority />
        </div>
      </foreignObject>
    </svg>
  )
}
