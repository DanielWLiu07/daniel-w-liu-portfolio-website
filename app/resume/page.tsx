'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import localFont from 'next/font/local'
import gsap from 'gsap'
import * as Dialog from '@radix-ui/react-dialog'
import { createInteractiveButtons, VIDEO_CONFIG, PHOTO_IMAGES, InteractiveButton } from '@/components/resume/resume-buttons'
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { useTransitionState } from '@/components/ui/page-transition'

const weddingDay = localFont({
  src: '../../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
})

const FALLBACK_TIMEOUT = 1500
const SCROLL_TEXT_BREAKPOINT = 1440

function ImageModal({
  imageSrc,
  onClose
}: {
  imageSrc: string | null
  onClose: () => void
}) {
  return (
    <Dialog.Root open={!!imageSrc} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/80 data-[state=open]:animate-fadeIn" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] max-w-[90vw] max-h-[90vh] bg-white rounded-lg p-6 focus:outline-none data-[state=open]:animate-scaleIn border-4 border-gray-800">
          <Dialog.Title className="sr-only">Photo</Dialog.Title>
          <div className="relative flex items-center justify-center">
            <Dialog.Close className="absolute top-2 right-2 text-white text-2xl font-bold hover:text-gray-200 transition-colors focus:outline-none px-2 py-1 z-10">
              ✕
            </Dialog.Close>
            {imageSrc && (
              <Image
                src={imageSrc}
                alt=""
                width={1200}
                height={1200}
                className="max-w-full max-h-[80vh] w-auto h-auto object-contain"
                priority
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Resume() {
  const [videoEnded, setVideoEnded] = useState(false)
  const [hoveredButton, setHoveredButton] = useState<string | null>(null)
  const [showImageModal, setShowImageModal] = useState<string | null>(null)
  const [showScrollText, setShowScrollText] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrollTextRef = useRef<HTMLDivElement>(null)
  const readyCalledRef = useRef(false)
  const videoStartedRef = useRef(false)

  const { isLowPerformance } = usePerformanceMode()
  const { signalReady, transitionStage } = useTransitionState()

  const INTERACTIVE_BUTTONS = createInteractiveButtons()

  useBodyOverflow('hidden')

  const handleLoaded = useCallback(() => {
    if (readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
  }, [signalReady])

  // Start video on reveal
  useEffect(() => {
    if (isLowPerformance || transitionStage !== 'revealing' || videoStartedRef.current) return
    videoStartedRef.current = true
    videoRef.current?.play()
  }, [isLowPerformance, transitionStage])

  // Low performance: skip video
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    setVideoEnded(true)
  }, [isLowPerformance, signalReady])

  // Wait for video ready
  useEffect(() => {
    if (isLowPerformance) return

    const video = videoRef.current
    if (!video) return

    if (video.readyState >= 3) {
      handleLoaded()
      return
    }

    const onReady = () => handleLoaded()
    video.addEventListener('canplay', onReady)
    video.addEventListener('loadeddata', onReady)

    const timeout = setTimeout(handleLoaded, FALLBACK_TIMEOUT)

    return () => {
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('loadeddata', onReady)
      clearTimeout(timeout)
    }
  }, [isLowPerformance, handleLoaded])

  // Center viewport and prevent bottom scroll
  useEffect(() => {
    const container = containerRef.current
    const video = videoRef.current

    const centerViewport = () => {
      if (!container || !video) return
      const contentWrapper = video.parentElement
      if (!contentWrapper) return

      container.scrollLeft = (contentWrapper.offsetWidth - container.clientWidth) / 2
      container.scrollTop = (contentWrapper.offsetHeight - container.clientHeight) / 2
    }

    const preventBottomScroll = () => {
      if (!container || !video) return
      const contentWrapper = video.parentElement
      if (!contentWrapper) return

      const maxAllowed = (contentWrapper.offsetHeight - container.clientHeight) * 0.9
      if (container.scrollTop > maxAllowed) {
        container.scrollTop = maxAllowed
      }
    }

    video?.addEventListener('loadedmetadata', centerViewport)
    container?.addEventListener('scroll', preventBottomScroll)
    window.addEventListener('resize', centerViewport)

    centerViewport()
    const timeout = setTimeout(centerViewport, 100)

    return () => {
      video?.removeEventListener('loadedmetadata', centerViewport)
      container?.removeEventListener('scroll', preventBottomScroll)
      window.removeEventListener('resize', centerViewport)
      clearTimeout(timeout)
    }
  }, [])

  // Show scroll text on smaller screens
  useEffect(() => {
    const check = () => setShowScrollText(window.innerWidth <= SCROLL_TEXT_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Animate scroll text
  useEffect(() => {
    if (!videoEnded || !showScrollText || !scrollTextRef.current) return
    gsap.fromTo(scrollTextRef.current, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' })
  }, [videoEnded, showScrollText])

  const handleButtonClick = (button: InteractiveButton) => {
    if (button.id === 'selfie') {
      setShowImageModal(PHOTO_IMAGES.selfie)
    } else if (button.id === 'cat') {
      setShowImageModal(PHOTO_IMAGES.cat)
    } else {
      button.action()
    }
  }

  const hoveredButtonData = INTERACTIVE_BUTTONS.find((b) => b.id === hoveredButton)

  return (
    <div
      ref={containerRef}
      className="w-full h-screen overflow-auto bg-black [&]:[-webkit-overflow-scrolling:touch]"
    >
      <div
        className="relative inline-block"
        style={{
          width: `max(100vw, calc(100vh * ${VIDEO_CONFIG.ASPECT_RATIO}))`,
          height: `max(100vh, calc(100vw / ${VIDEO_CONFIG.ASPECT_RATIO}))`,
        }}
      >
        {isLowPerformance ? (
          <Image
            src="/animation_frames/resume/loading_anim/sliding_img0028.png"
            alt=""
            width={1920}
            height={1080}
            className="w-full h-full block object-cover object-center"
          />
        ) : (
          <video
            ref={videoRef}
            src={VIDEO_CONFIG.SRC}
            muted
            playsInline
            preload="auto"
            onEnded={() => setVideoEnded(true)}
            className="w-full h-full block object-cover object-center"
          />
        )}

        {hoveredButtonData && videoEnded && (
          <Image
            src={`${VIDEO_CONFIG.BUTTON_IMAGE_PATH}/${hoveredButtonData.imageName}`}
            alt=""
            width={1920}
            height={1080}
            className="absolute top-0 left-0 w-full h-full object-cover object-center pointer-events-none z-10"
          />
        )}

        {videoEnded && INTERACTIVE_BUTTONS.map((button) => (
          <div
            key={button.id}
            className={`absolute z-[101] cursor-pointer ${button.shape === 'rounded-full' ? 'rounded-full' : ''}`}
            style={{
              left: button.left,
              top: button.top,
              width: button.width,
              height: button.height,
              transform: `translate(-50%, -50%) rotate(${button.rotation}deg)`,
            }}
            onMouseEnter={() => setHoveredButton(button.id)}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={() => handleButtonClick(button)}
          />
        ))}
      </div>

      {videoEnded && showScrollText && (
        <div ref={scrollTextRef} className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[102] pointer-events-none">
          <p className={`text-4xl font-bold text-stroke-white-sm ${weddingDay.className}`}>
            Scroll Around
          </p>
        </div>
      )}

      <ImageModal imageSrc={showImageModal} onClose={() => setShowImageModal(null)} />
    </div>
  )
}
