'use client'

import { useState, memo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useMobile } from '@/hooks/use-mobile'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

interface BackgroundLayersProps {
  onLoaded?: () => void
}

export const BackgroundLayers = memo(function BackgroundLayers({ onLoaded }: BackgroundLayersProps) {
  const [sparkleDone, setSparkleDone] = useState(false)
  const isMobile = useMobile()
  const { isLowPerformance } = usePerformanceMode()
  const rightColourRef = useRef<HTMLVideoElement>(null)
  const waterColourRef = useRef<HTMLVideoElement>(null)
  const sparkleRef = useRef<HTMLVideoElement>(null)
  const loadedCalledRef = useRef(false)
  const videosReady = useRef({ rightColour: false, waterColour: false, sparkle: false })

  const handleLoaded = useCallback(() => {
    if (loadedCalledRef.current) return
    loadedCalledRef.current = true
    onLoaded?.()
  }, [onLoaded])

  const checkAllVideosReady = useCallback(() => {
    if (videosReady.current.rightColour && videosReady.current.waterColour && videosReady.current.sparkle) {
      handleLoaded()
    }
  }, [handleLoaded])

  useEffect(() => {
    if (isLowPerformance) {
      handleLoaded()
      return
    }

    const rightColour = rightColourRef.current
    const waterColour = waterColourRef.current
    const sparkle = sparkleRef.current

    const handleRightColourReady = () => {
      videosReady.current.rightColour = true
      checkAllVideosReady()
    }

    const handleWaterColourReady = () => {
      videosReady.current.waterColour = true
      checkAllVideosReady()
    }

    const handleSparkleReady = () => {
      videosReady.current.sparkle = true
      checkAllVideosReady()
    }

    if (rightColour?.readyState >= 3) videosReady.current.rightColour = true
    if (waterColour?.readyState >= 3) videosReady.current.waterColour = true
    if (sparkle?.readyState >= 3) videosReady.current.sparkle = true

    rightColour?.addEventListener('canplay', handleRightColourReady)
    rightColour?.addEventListener('loadeddata', handleRightColourReady)
    waterColour?.addEventListener('canplay', handleWaterColourReady)
    waterColour?.addEventListener('loadeddata', handleWaterColourReady)
    sparkle?.addEventListener('canplay', handleSparkleReady)
    sparkle?.addEventListener('loadeddata', handleSparkleReady)

    checkAllVideosReady()

    const timeout = setTimeout(handleLoaded, 2000)

    return () => {
      rightColour?.removeEventListener('canplay', handleRightColourReady)
      rightColour?.removeEventListener('loadeddata', handleRightColourReady)
      waterColour?.removeEventListener('canplay', handleWaterColourReady)
      waterColour?.removeEventListener('loadeddata', handleWaterColourReady)
      sparkle?.removeEventListener('canplay', handleSparkleReady)
      sparkle?.removeEventListener('loadeddata', handleSparkleReady)
      clearTimeout(timeout)
    }
  }, [checkAllVideosReady, handleLoaded, isLowPerformance])

  return (
    <>
      <div className="hidden md:block fixed inset-0 z-0">
        <Image src="/about/images/bg.png" alt="Background" fill className="object-cover" priority />
      </div>

      {!isLowPerformance && (
        <>
          <div className="hidden md:block fixed inset-0 z-[3]">
            <video ref={rightColourRef} src="/about/videos/right_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" preload="auto" />
          </div>

          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="hidden md:block fixed inset-0 z-0">
            <defs>
              <filter id="waterColourFilter">
                <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
                  <animate
                    attributeName="scale"
                    values="200;490"
                    dur="2s"
                    begin="0s"
                    calcMode="linear"
                    fill="freeze"
                  />
                </feDisplacementMap>
              </filter>
              <mask id="waterColourMask">
                <rect x="0" y="0" width="100%" height="100%" fill="black" />
                <circle cx="50%" cy="60%" r="0%" fill="white" filter="url(#waterColourFilter)">
                  <animate
                    attributeName="r"
                    values="0%;120%"
                    dur="2s"
                    begin="0s"
                    calcMode="linear"
                    fill="freeze"
                  />
                </circle>
              </mask>
            </defs>
            <foreignObject width="100%" height="100%" mask="url(#waterColourMask)">
              <div className="relative w-full h-full">
                <video ref={waterColourRef} src="/about/videos/water_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-bottom" preload="auto" />
              </div>
            </foreignObject>
          </svg>
        </>
      )}

      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="hidden md:block fixed inset-0 z-[5]">
        <defs>
          <filter id="aboutBgFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
              <animate
                attributeName="scale"
                values="200;490"
                dur="2.5s"
                begin="0s"
                calcMode="linear"
                fill="freeze"
              />
            </feDisplacementMap>
          </filter>
          <mask id="aboutBgMask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <circle cx="80%" cy="40%" r="100%" fill="black" filter="url(#aboutBgFilter)">
              <animate
                attributeName="r"
                values="100%;0%"
                dur="2.5s"
                begin="0s"
                calcMode="linear"
                fill="freeze"
              />
            </circle>
          </mask>
          <filter id="socialFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
              <animate
                attributeName="scale"
                values="200;490"
                dur="2.5s"
                begin="0.5s"
                calcMode="linear"
                fill="freeze"
              />
            </feDisplacementMap>
          </filter>
          <mask id="socialMask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <circle cx="80%" cy="40%" r="100%" fill="black" filter="url(#socialFilter)">
              <animate
                attributeName="r"
                values="100%;0%"
                dur="2.5s"
                begin="0.5s"
                calcMode="linear"
                fill="freeze"
              />
            </circle>
          </mask>
        </defs>
        <foreignObject width="100%" height="100%" mask="url(#aboutBgMask)">
          <div className="relative w-full h-full">
            <Image src="/about/images/right_graphics.png" alt="Water Colour Graphics" fill className="object-cover object-right-top" priority />
          </div>
        </foreignObject>
      </svg>

      {!isLowPerformance && (
        <div className="hidden md:block fixed inset-0 z-10">
          {!sparkleDone ? (
            <video ref={sparkleRef} src="/about/videos/sparkle_being.webm" autoPlay muted playsInline onEnded={() => setSparkleDone(true)} className="absolute inset-0 w-full h-full object-cover" preload="auto" />
          ) : (
            <video src="/about/videos/sparkle_loop.webm?v=2" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" preload="auto" />
          )}
        </div>
      )}
    </>
  )
})
