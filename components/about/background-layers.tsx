'use client'

import { useState, memo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'
import { triggerSvgAnimations } from '@/lib/svg-utils'

const FALLBACK_TIMEOUT = 1500

function WaterColourMaskSvg({
  svgRef,
  videoRef
}: {
  svgRef: React.RefObject<SVGSVGElement | null>
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className="hidden md:block fixed inset-0 z-0"
    >
      <defs>
        <filter id="waterColourFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" values="200;490" dur="2s" begin="indefinite" calcMode="linear" fill="freeze" />
          </feDisplacementMap>
        </filter>
        <mask id="waterColourMask">
          <rect x="0" y="0" width="100%" height="100%" fill="black" />
          <circle cx="50%" cy="60%" r="0%" fill="white" filter="url(#waterColourFilter)">
            <animate attributeName="r" values="0%;120%" dur="2s" begin="indefinite" calcMode="linear" fill="freeze" />
          </circle>
        </mask>
      </defs>
      <foreignObject width="100%" height="100%" mask="url(#waterColourMask)">
        <div className="relative w-full h-full">
          <video
            ref={videoRef}
            src="/about/videos/water_colour.webm"
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover object-bottom"
            preload="auto"
          />
        </div>
      </foreignObject>
    </svg>
  )
}

function RightGraphicsMaskSvg({
  svgRef
}: {
  svgRef: React.RefObject<SVGSVGElement | null>
}) {
  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      className="hidden md:block fixed inset-0 z-[5]"
    >
      <defs>
        <filter id="aboutBgFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" values="200;490" dur="2.5s" begin="indefinite" calcMode="linear" fill="freeze" />
          </feDisplacementMap>
        </filter>
        <mask id="aboutBgMask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <circle cx="80%" cy="40%" r="100%" fill="black" filter="url(#aboutBgFilter)">
            <animate attributeName="r" values="100%;0%" dur="2.5s" begin="indefinite" calcMode="linear" fill="freeze" />
          </circle>
        </mask>
      </defs>
      <foreignObject width="100%" height="100%" mask="url(#aboutBgMask)">
        <div className="relative w-full h-full">
          <Image src="/about/images/right_graphics.png" alt="" fill className="object-cover object-right-top" priority />
        </div>
      </foreignObject>
    </svg>
  )
}

function SparkleVideo({
  sparkleRef,
  sparkleDone,
  onSparkleEnd
}: {
  sparkleRef: React.RefObject<HTMLVideoElement | null>
  sparkleDone: boolean
  onSparkleEnd: () => void
}) {
  return (
    <div className="hidden md:block fixed inset-0 z-10">
      {!sparkleDone ? (
        <video
          ref={sparkleRef}
          src="/about/videos/sparkle_being.webm"
          muted
          playsInline
          onEnded={onSparkleEnd}
          className="absolute inset-0 w-full h-full object-cover"
          preload="auto"
        />
      ) : (
        <video
          src="/about/videos/sparkle_loop.webm?v=2"
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          preload="auto"
        />
      )}
    </div>
  )
}

function LowPerformanceBackgrounds() {
  return (
    <>
      <div className="hidden md:block fixed inset-0 z-[3]">
        <Image
          src="/animation_frames/watercolour_sequences/colour_vid/render_compositing_080.png"
          alt=""
          fill
          className="object-cover"
        />
      </div>
      <div className="hidden md:block fixed inset-0 z-0">
        <Image
          src="/animation_frames/watercolour_sequences/portrait_vid/render_compositing_080.png"
          alt=""
          fill
          className="object-cover object-bottom"
        />
      </div>
      <div className="hidden md:block fixed inset-0 z-[5]">
        <Image src="/about/images/right_graphics.png" alt="" fill className="object-cover object-right-top" />
      </div>
      <div className="hidden md:block fixed inset-0 z-10">
        <Image
          src="/animation_frames/watercolour_sequences/sparkle_loop_vid/render_compositing_250.png"
          alt=""
          fill
          className="object-cover"
        />
      </div>
    </>
  )
}

export const BackgroundLayers = memo(function BackgroundLayers() {
  const [sparkleDone, setSparkleDone] = useState(false)
  const { isLowPerformance } = usePerformanceMode()
  const { signalReady, transitionStage } = useTransitionState()

  const rightColourRef = useRef<HTMLVideoElement>(null)
  const waterColourRef = useRef<HTMLVideoElement>(null)
  const sparkleRef = useRef<HTMLVideoElement>(null)
  const waterColourSvgRef = useRef<SVGSVGElement>(null)
  const aboutBgSvgRef = useRef<SVGSVGElement>(null)
  const readyCalledRef = useRef(false)
  const animationsStartedRef = useRef(false)

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [signalReady])

  // Start animations when reveal begins
  useEffect(() => {
    if (isLowPerformance || transitionStage !== 'revealing' || animationsStartedRef.current) return
    animationsStartedRef.current = true

    rightColourRef.current?.play()
    waterColourRef.current?.play()
    sparkleRef.current?.play()
    triggerSvgAnimations(waterColourSvgRef.current)
    triggerSvgAnimations(aboutBgSvgRef.current)
  }, [isLowPerformance, transitionStage])

  // Low performance mode: signal ready immediately
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [isLowPerformance, signalReady])

  // Normal mode: signal ready when main video loads
  useEffect(() => {
    if (isLowPerformance) return

    const waterColour = waterColourRef.current
    const rightColour = rightColourRef.current

    if ((waterColour?.readyState ?? 0) >= 3 || (rightColour?.readyState ?? 0) >= 3) {
      handleLoaded()
      return
    }

    const onReady = () => handleLoaded()

    waterColour?.addEventListener('canplay', onReady)
    waterColour?.addEventListener('loadeddata', onReady)
    rightColour?.addEventListener('canplay', onReady)
    rightColour?.addEventListener('loadeddata', onReady)

    const timeout = setTimeout(handleLoaded, FALLBACK_TIMEOUT)

    return () => {
      waterColour?.removeEventListener('canplay', onReady)
      waterColour?.removeEventListener('loadeddata', onReady)
      rightColour?.removeEventListener('canplay', onReady)
      rightColour?.removeEventListener('loadeddata', onReady)
      clearTimeout(timeout)
    }
  }, [isLowPerformance, handleLoaded])

  return (
    <>
      <div className="hidden md:block fixed inset-0 z-0">
        <Image src="/about/images/bg.png" alt="" fill className="object-cover" priority />
      </div>

      {isLowPerformance ? (
        <LowPerformanceBackgrounds />
      ) : (
        <>
          <WaterColourMaskSvg svgRef={waterColourSvgRef} videoRef={waterColourRef} />

          <div className="hidden md:block fixed inset-0 z-[3]">
            <video
              ref={rightColourRef}
              src="/about/videos/right_colour.webm"
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              preload="auto"
            />
          </div>

          <RightGraphicsMaskSvg svgRef={aboutBgSvgRef} />
          <SparkleVideo sparkleRef={sparkleRef} sparkleDone={sparkleDone} onSparkleEnd={() => setSparkleDone(true)} />
        </>
      )}
    </>
  )
})
