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

      const targetRightCardPixels = vw * MOBILE_LAYOUT.RIGHT_CARD_WIDTH
      const scale = clamp(targetRightCardPixels / BASE_RIGHT_CARD_WIDTH, SCALE_LIMITS.MIN, SCALE_LIMITS.MAX)

      const cardTopPx = vh * MOBILE_LAYOUT.TOP_MARGIN
      const cardHeightPx = vh * MOBILE_LAYOUT.CARD_HEIGHT_RATIO * scale
      const cardBottomPx = cardTopPx + cardHeightPx
      const dotsBottomPx = cardBottomPx + (cardHeightPx * MOBILE_LAYOUT.DOTS_OFFSET_RATIO)
      const infoPanelTopPx = dotsBottomPx + MOBILE_LAYOUT.CARDS_GAP

      const projectsHeaderHeightPx = 80
      const infoPanelBaseHeightPx = 680
      const infoPanelScaledHeightPx = infoPanelBaseHeightPx * scale
      const bottomMarginPx = 150
      const totalHeightPx = infoPanelTopPx + projectsHeaderHeightPx + infoPanelScaledHeightPx + bottomMarginPx

      setMobileContainerHeight(`${totalHeightPx}px`)
    }

    calculateHeight()
    window.addEventListener('resize', calculateHeight)
    return () => window.removeEventListener('resize', calculateHeight)
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Close immediately - no delay so new card clicks work right away
    setExpandedProject(null)
    setIsPaused(false)
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
      <div
        className={`fixed inset-0 bg-black/50 z-[37] pointer-events-none transition-opacity duration-500 ${
          expandedProject !== null ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transform: 'scale(5)', transformOrigin: '50% 50%' }}
      />
      <div
        ref={mainRef}
        className={`relative w-full bg-black ${expandedProject !== null ? 'overflow-visible md:overflow-hidden md:min-h-0 md:h-screen' : 'overflow-hidden h-screen'}`}
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
        onPrevProject={goToPrevProject}
        onNextProject={goToNextProject}
      />


      <TransitionFlash trigger={flashTrigger} onComplete={() => setFlashTrigger(false)} />

      {displayProjectData && (
        <ProjectInfoPanel
          project={displayProjectData}
          onClose={handleClosePanel}
          onPrevProject={goToPrevProject}
          onNextProject={goToNextProject}
          visible={expandedProject !== null}
          expansionStage="expanded"
        />
      )}

      <SocialLinks className="projects-social-links" />
      </div>
    </>
  )
}
