'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import gsap from 'gsap'
import { ProjectInfoPanel } from '@/components/projects/project-info-panel'
import IntroVideo from '@/components/projects/intro-video'
import BackgroundVideos from '@/components/projects/background-videos'
import ProjectSlider from '@/components/projects/project-slider'
import TransitionFlash from '@/components/projects/transition-flash'
import { projects } from '@/data/projects'
import { SocialLinks } from '@/components/ui/social-links'
import { mochiFont } from '@/lib/fonts'
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { useTransitionState } from '@/components/ui/page-transition'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { MD_BREAKPOINT, MOBILE_LAYOUT, BASE_RIGHT_CARD_WIDTH, SCALE_LIMITS } from '@/lib/layout-config'
import { clamp } from '@/lib/animation-utils'

const SOCIAL_LINKS_SELECTOR = '.projects-social-links'

export default function ProjectsPage() {
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [introFinished, setIntroFinished] = useState(false)
  const [introVideoEnded, setIntroVideoEnded] = useState(false)
  const [flashTrigger, setFlashTrigger] = useState(false)
  const [displayProjectData, setDisplayProjectData] = useState<typeof projects[0] | null>(null)
  const [mobileContainerHeight, setMobileContainerHeight] = useState<string | undefined>(undefined)
  const [isMobileExpanded, setIsMobileExpanded] = useState(false)

  const mainRef = useRef<HTMLDivElement>(null)
  const gsapContextRef = useRef<gsap.Context | null>(null)
  const readyCalledRef = useRef(false)

  const { transitionStage, signalReady } = useTransitionState()
  const { isLowPerformance } = usePerformanceMode()

  useBodyOverflow('hidden', {
    mobileBreakpoint: MD_BREAKPOINT,
    allowScrollWhen: expandedProject !== null
  })

  // Calculate required container height for mobile based on info panel position
  useEffect(() => {
    const calculateHeight = () => {
      const isMobile = window.innerWidth < MD_BREAKPOINT

      if (expandedProject === null || !isMobile) {
        setIsMobileExpanded(false)
        setMobileContainerHeight(undefined)
        return
      }

      setIsMobileExpanded(true)

      const vh = window.innerHeight
      const vw = window.innerWidth

      // Calculate scale (same formula as info panel)
      const targetRightCardPixels = vw * MOBILE_LAYOUT.RIGHT_CARD_WIDTH
      const scale = clamp(targetRightCardPixels / BASE_RIGHT_CARD_WIDTH, SCALE_LIMITS.MIN, SCALE_LIMITS.MAX)

      // Calculate info panel position (same formula as info panel)
      const leftCardCenterPx = vh * 0.38
      const leftCardHeightPx = vh * 0.30 * scale
      const leftCardBottomPx = leftCardCenterPx + leftCardHeightPx / 2
      const dotsOffsetPx = leftCardHeightPx * 0.25
      const dotsBottomPx = leftCardBottomPx + dotsOffsetPx
      const fixedGapPx = 80
      const infoPanelTopPx = dotsBottomPx + fixedGapPx

      // Info panel base height is 620px, but it's scaled
      const infoPanelBaseHeightPx = 620
      const infoPanelScaledHeightPx = infoPanelBaseHeightPx * scale
      const bottomMarginPx = 40
      const totalHeightPx = infoPanelTopPx + infoPanelScaledHeightPx + bottomMarginPx

      setMobileContainerHeight(`${totalHeightPx}px`)
    }

    calculateHeight()
    window.addEventListener('resize', calculateHeight)
    return () => window.removeEventListener('resize', calculateHeight)
  }, [expandedProject])

  // Prevent overscroll/elastic scrolling - only at actual boundaries
  useEffect(() => {
    if (expandedProject === null) return
    if (typeof window === 'undefined') return

    let startY = 0

    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY
      const deltaY = currentY - startY
      const scrollTop = window.scrollY
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight

      // Only prevent when actually at boundary AND trying to go past it
      // deltaY > 0 means finger moved down = trying to pull page down = overscroll at top
      // deltaY < 0 means finger moved up = trying to pull page up = overscroll at bottom
      const atTop = scrollTop <= 0
      const atBottom = scrollTop >= maxScroll - 1
      const pullingDown = deltaY > 0
      const pullingUp = deltaY < 0

      if ((atTop && pullingDown) || (atBottom && pullingUp)) {
        e.preventDefault()
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
    }
  }, [expandedProject])

  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    setIntroFinished(true)
    setIntroVideoEnded(true)
  }, [isLowPerformance, signalReady])

  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      setIntroFinished(false)
      setIntroVideoEnded(false)
      setFlashTrigger(false)
      if (!isLowPerformance && mainRef.current) {
        gsap.set(SOCIAL_LINKS_SELECTOR, { y: 100, opacity: 0 })
      }
      if (isLowPerformance) {
        signalReady()
        setIntroFinished(true)
        setIntroVideoEnded(true)
      }
    }
  }, [transitionStage, isLowPerformance, signalReady])

  useLayoutEffect(() => {
    if (isLowPerformance || !mainRef.current) return
    gsapContextRef.current = gsap.context(() => {
      gsap.set(SOCIAL_LINKS_SELECTOR, { y: 100, opacity: 0 })
    }, mainRef)

    return () => gsapContextRef.current?.revert()
  }, [isLowPerformance])

  useEffect(() => {
    if (!introFinished || isLowPerformance) return
    gsap.context(() => {
      gsap.to(SOCIAL_LINKS_SELECTOR, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.1 })
    }, mainRef)
  }, [introFinished, isLowPerformance])

  const handleFlashStart = useCallback(() => {
    setFlashTrigger(true)
  }, [])

  const handleIntroEnd = useCallback(() => {
    setIntroVideoEnded(true)
    setIntroFinished(true)
  }, [])

  const handleClosePanel = useCallback(() => {
    // Smooth scroll to top before closing
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Small delay to let scroll start, then close
    setTimeout(() => {
      setExpandedProject(null)
      setIsPaused(false)
    }, 100)
  }, [])

  const goToNextProject = useCallback(() => {
    if (expandedProject === null) return
    const currentIndex = projects.findIndex(p => p.id === expandedProject)
    const nextIndex = (currentIndex - 1 + projects.length) % projects.length
    setExpandedProject(projects[nextIndex].id)
  }, [expandedProject])

  const goToPrevProject = useCallback(() => {
    if (expandedProject === null) return
    const currentIndex = projects.findIndex(p => p.id === expandedProject)
    const prevIndex = (currentIndex + 1) % projects.length
    setExpandedProject(projects[prevIndex].id)
  }, [expandedProject])

  useEffect(() => {
    const projectData = projects.find(p => p.id === expandedProject)
    if (projectData) {
      setDisplayProjectData(projectData)
    }
  }, [expandedProject])

  return (
    <>
      {/* Dark backdrop for expanded state - behind THREE.js scene */}
      <div
        className={`fixed inset-0 bg-black/50 z-[37] pointer-events-none transition-opacity duration-500 ${
          expandedProject !== null ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transform: 'scale(5)', transformOrigin: '50% 50%' }}
      />
      <div
        ref={mainRef}
        className={`relative w-full bg-black ${expandedProject !== null ? 'overflow-y-auto md:overflow-hidden md:min-h-0 md:h-screen' : 'overflow-hidden h-screen'}`}
        style={{ minHeight: isMobileExpanded ? mobileContainerHeight : undefined }}
      >
        <BackgroundVideos visible={introFinished} isExpanded={expandedProject !== null} />

      {!introVideoEnded && !isLowPerformance && (
        <IntroVideo onEnded={handleIntroEnd} onFlashStart={handleFlashStart} />
      )}

      <ProjectSlider
        isPaused={isPaused}
        onProjectClick={setExpandedProject}
        onPauseChange={setIsPaused}
        visible={introFinished}
        expandedProject={expandedProject}
      />


      <TransitionFlash trigger={flashTrigger} onComplete={() => setFlashTrigger(false)} />

      {displayProjectData && (
        <ProjectInfoPanel
          project={displayProjectData}
          onClose={handleClosePanel}
          visible={expandedProject !== null}
          expansionStage="expanded"
        />
      )}

      {/* Navigation buttons - visible on both mobile and desktop */}
      <button
        onClick={goToPrevProject}
        className={`flex fixed left-2 md:left-8 top-1/2 z-50
          text-[60px] md:text-[120px] leading-none text-white/60 font-black
          items-center justify-center
          [text-shadow:_3px_3px_0_rgba(0,0,0,0.6),_-2px_-2px_0_rgba(255,255,255,0.4),_0_0_10px_rgba(255,255,255,0.3)]
          [-webkit-text-stroke:2px_rgba(255,255,255,0.5)] md:[-webkit-text-stroke:4px_rgba(255,255,255,0.5)]
          hover:text-white hover:[-webkit-text-stroke:4px_rgba(255,255,255,0.8)] hover:scale-110 hover:drop-shadow-[0_0_30px_rgba(255,255,255,1)]
          active:scale-95 active:text-white/80
          transition-all duration-200 ease-out
          ${expandedProject !== null ? 'animate-slide-in-left' : 'animate-slide-out-left pointer-events-none'}`}
        aria-label="Previous project"
      >
        ☜
      </button>
      <button
        onClick={goToNextProject}
        className={`flex fixed right-2 md:right-8 top-1/2 z-50
          text-[60px] md:text-[120px] leading-none text-white/60 font-black
          items-center justify-center
          [text-shadow:_3px_3px_0_rgba(0,0,0,0.6),_-2px_-2px_0_rgba(255,255,255,0.4),_0_0_10px_rgba(255,255,255,0.3)]
          [-webkit-text-stroke:2px_rgba(255,255,255,0.5)] md:[-webkit-text-stroke:4px_rgba(255,255,255,0.5)]
          hover:text-white hover:[-webkit-text-stroke:4px_rgba(255,255,255,0.8)] hover:scale-110 hover:drop-shadow-[0_0_30px_rgba(255,255,255,1)]
          active:scale-95 active:text-white/80
          transition-all duration-200 ease-out
          ${expandedProject !== null ? 'animate-slide-in-right' : 'animate-slide-out-right pointer-events-none'}`}
        aria-label="Next project"
      >
        ☞
      </button>

      <style jsx>{`
        @keyframes slide-in-left {
          0% {
            transform: translateY(-50%) translateX(-100px);
            opacity: 0;
          }
          100% {
            transform: translateY(-50%) translateX(0);
            opacity: 1;
          }
        }
        @keyframes slide-out-left {
          0% {
            transform: translateY(-50%) translateX(0);
            opacity: 1;
          }
          100% {
            transform: translateY(-50%) translateX(-100px);
            opacity: 0;
          }
        }
        @keyframes slide-in-right {
          0% {
            transform: translateY(-50%) translateX(100px);
            opacity: 0;
          }
          100% {
            transform: translateY(-50%) translateX(0);
            opacity: 1;
          }
        }
        @keyframes slide-out-right {
          0% {
            transform: translateY(-50%) translateX(0);
            opacity: 1;
          }
          100% {
            transform: translateY(-50%) translateX(100px);
            opacity: 0;
          }
        }
        @keyframes beckon-left {
          0%, 100% {
            transform: translateY(-50%) translateX(0);
          }
          50% {
            transform: translateY(-50%) translateX(-12px);
          }
        }
        @keyframes beckon-right {
          0%, 100% {
            transform: translateY(-50%) translateX(0);
          }
          50% {
            transform: translateY(-50%) translateX(12px);
          }
        }
        .animate-slide-in-left {
          animation: slide-in-left 0.4s ease-out forwards, beckon-left 2s ease-in-out 0.4s infinite;
        }
        .animate-slide-out-left {
          animation: slide-out-left 0.3s ease-in forwards;
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.4s ease-out forwards, beckon-right 2s ease-in-out 0.4s infinite;
        }
        .animate-slide-out-right {
          animation: slide-out-right 0.3s ease-in forwards;
        }
      `}</style>

      <SocialLinks className="projects-social-links" />
      </div>
    </>
  )
}
