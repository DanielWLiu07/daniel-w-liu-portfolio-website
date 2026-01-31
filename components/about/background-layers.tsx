'use client'

import { useState, memo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'
import { triggerSvgAnimations } from '@/lib/svg-utils'
import { AlphaVideo } from '@/components/ui/alpha-video'

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
      className="hidden min-[1038px]:block fixed inset-0 z-0 pointer-events-none about-svg-mask"
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
      <foreignObject width="100%" height="100%" mask="url(#waterColourMask)" style={{ pointerEvents: 'none' }}>
        <div className="relative w-full h-full pointer-events-none">
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover object-bottom"
            preload="auto"
          >
            <source src="/about/videos/water_colour.webm" type="video/webm" />
          </video>
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
      className="hidden min-[1038px]:block fixed inset-0 z-[5] pointer-events-none about-svg-mask"
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
      <foreignObject width="100%" height="100%" mask="url(#aboutBgMask)" style={{ pointerEvents: 'none' }}>
        <div className="relative w-full h-full pointer-events-none">
          <Image src="/about/images/right_graphics.webp" alt="" fill className="object-cover object-right-top" priority />
        </div>
      </foreignObject>
    </svg>
  )
}

function SafariWaterColourMask({
  waterColourRef,
  safariAnimating
}: {
  waterColourRef: React.RefObject<HTMLVideoElement | null>
  safariAnimating: boolean
}) {
  return (
    <div className={`hidden min-[1038px]:block fixed inset-0 z-0 pointer-events-none about-safari-fallback about-safari-reveal ${safariAnimating ? 'animating' : ''}`}>
      <video
        ref={waterColourRef}
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover object-bottom"
        preload="auto"
      >
        <source src="/about/videos/water_colour.webm" type="video/webm" />
      </video>
    </div>
  )
}

function SafariRightGraphicsMask({
  safariAnimating
}: {
  safariAnimating: boolean
}) {
  return (
    <div className={`hidden min-[1038px]:block fixed inset-0 z-[5] pointer-events-none about-safari-fallback about-safari-reveal ${safariAnimating ? 'animating' : ''}`}>
      <Image src="/about/images/right_graphics.webp" alt="" fill className="object-cover object-right-top" priority />
    </div>
  )
}

function SparkleVideo({
  sparkleRef,
  loopRef,
  showLoop,
  onSparkleEnd
}: {
  sparkleRef: React.RefObject<HTMLVideoElement | null>
  loopRef: React.RefObject<HTMLVideoElement | null>
  showLoop: boolean
  onSparkleEnd: () => void
}) {
  return (
    <div className="hidden min-[1038px]:block fixed inset-0 z-10 pointer-events-none">
      <AlphaVideo
        ref={sparkleRef}
        src="/about/videos/sparkle_being"
        query="?v=3"
        fallbackImage="/animation_frames/watercolour_sequences/sparkle_being_vid/render_compositing_047.webp"
        muted
        playsInline
        onEnded={onSparkleEnd}
        className={`absolute inset-0 w-full h-full object-cover object-bottom ${showLoop ? 'hidden' : ''}`}
        preload="auto"
      />
      <AlphaVideo
        ref={loopRef}
        src="/about/videos/sparkle_loop"
        query="?v=3"
        fallbackImage="/animation_frames/watercolour_sequences/sparkle_loop_vid/render_compositing_250.webp"
        loop
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover object-bottom ${showLoop ? '' : 'hidden'}`}
        preload="auto"
      />
    </div>
  )
}

function LowPerformanceBackgrounds() {
  return (
    <>
      <div className="hidden min-[1038px]:block fixed inset-0 z-[3] pointer-events-none">
        <Image
          src="/animation_frames/watercolour_sequences/colour_vid/render_compositing_080.webp"
          alt=""
          fill
          className="object-cover"
        />
      </div>
      <div className="hidden min-[1038px]:block fixed inset-0 z-0 pointer-events-none">
        <Image
          src="/animation_frames/watercolour_sequences/portrait_vid/render_compositing_080.webp"
          alt=""
          fill
          className="object-cover object-bottom"
        />
      </div>
      <div className="hidden min-[1038px]:block fixed inset-0 z-[5] pointer-events-none">
        <Image src="/about/images/right_graphics.webp" alt="" fill className="object-cover object-right-top" />
      </div>
      <div className="hidden min-[1038px]:block fixed inset-0 z-10 pointer-events-none">
        <Image
          src="/animation_frames/watercolour_sequences/sparkle_loop_vid/render_compositing_250.webp"
          alt=""
          fill
          className="object-cover object-bottom"
        />
      </div>
    </>
  )
}

export const BackgroundLayers = memo(function BackgroundLayers() {
  const [showSparkleLoop, setShowSparkleLoop] = useState(false)
  const [safariAnimating, setSafariAnimating] = useState(false)
  const { isLowPerformance } = usePerformanceMode()
  const { signalReady, transitionStage } = useTransitionState()

  const rightColourRef = useRef<HTMLVideoElement>(null)
  const waterColourRef = useRef<HTMLVideoElement>(null)
  const waterColourSafariRef = useRef<HTMLVideoElement>(null)
  const sparkleRef = useRef<HTMLVideoElement>(null)
  const sparkleLoopRef = useRef<HTMLVideoElement>(null)
  const waterColourSvgRef = useRef<SVGSVGElement>(null)
  const aboutBgSvgRef = useRef<SVGSVGElement>(null)
  const readyCalledRef = useRef(false)
  const animationsStartedRef = useRef(false)

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [signalReady])

  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      animationsStartedRef.current = false
      setSafariAnimating(false)
      setShowSparkleLoop(false)
    }
  }, [transitionStage])

  useEffect(() => {
    if (isLowPerformance || (transitionStage !== 'revealing' && transitionStage !== 'hidden') || animationsStartedRef.current) return
    animationsStartedRef.current = true

    rightColourRef.current?.play()
    waterColourRef.current?.play()
    waterColourSafariRef.current?.play()
    sparkleRef.current?.play()

    triggerSvgAnimations(waterColourSvgRef.current)
    triggerSvgAnimations(aboutBgSvgRef.current)

    setSafariAnimating(true)
  }, [isLowPerformance, transitionStage])

  const handleSparkleIntroEnded = useCallback(() => {
    setShowSparkleLoop(true)
    sparkleLoopRef.current?.play()
  }, [])

  // Low performance mode: signal ready immediately (no videos to wait for)
  // Include transitionStage in deps so this re-runs after navigation resets readyCalledRef
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [isLowPerformance, transitionStage, signalReady])

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
      <div className="hidden min-[1038px]:block fixed inset-0 z-0 pointer-events-none">
        <Image src="/about/images/bg.webp" alt="" fill className="object-cover" priority />
      </div>

      {isLowPerformance ? (
        <LowPerformanceBackgrounds />
      ) : (
        <>
          <WaterColourMaskSvg svgRef={waterColourSvgRef} videoRef={waterColourRef} />
          <SafariWaterColourMask waterColourRef={waterColourSafariRef} safariAnimating={safariAnimating} />

          <div className="hidden min-[1038px]:block fixed inset-0 z-[3] pointer-events-none">
            <AlphaVideo
              ref={rightColourRef}
              src="/about/videos/right_colour"
              query="?v=3"
              fallbackImage="/animation_frames/watercolour_sequences/colour_vid/render_compositing_080.webp"
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              preload="auto"
            />
          </div>

          <RightGraphicsMaskSvg svgRef={aboutBgSvgRef} />
          <SafariRightGraphicsMask safariAnimating={safariAnimating} />
          <SparkleVideo sparkleRef={sparkleRef} loopRef={sparkleLoopRef} showLoop={showSparkleLoop} onSparkleEnd={handleSparkleIntroEnded} />
        </>
      )}
    </>
  )
})
