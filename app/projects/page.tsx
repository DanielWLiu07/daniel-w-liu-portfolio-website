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
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { useTransitionState } from '@/components/ui/page-transition'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

const SOCIAL_LINKS_SELECTOR = '.projects-social-links'

export default function ProjectsPage() {
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [introFinished, setIntroFinished] = useState(false)
  const [introVideoEnded, setIntroVideoEnded] = useState(false)
  const [showFlash, setShowFlash] = useState(false)
  const [displayProjectData, setDisplayProjectData] = useState<typeof projects[0] | null>(null)

  const mainRef = useRef<HTMLDivElement>(null)
  const gsapContextRef = useRef<gsap.Context | null>(null)
  const readyCalledRef = useRef(false)

  const { transitionStage, signalReady } = useTransitionState()
  const { isLowPerformance } = usePerformanceMode()

  const showContent = isLowPerformance || transitionStage !== 'loading'

  useBodyOverflow('hidden')

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
      setShowFlash(false)
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
    setShowFlash(true)
    setIntroFinished(true)
  }, [])

  const handleIntroEnd = useCallback(() => {
    setIntroVideoEnded(true)
    setTimeout(() => {
      setShowFlash(false)
    }, 150)
  }, [])

  const handleClosePanel = useCallback(() => {
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
    <div ref={mainRef} className="relative w-full h-screen overflow-visible bg-black">
      <BackgroundVideos visible={introFinished} isExpanded={expandedProject !== null} />

      {!introVideoEnded && !isLowPerformance && (
        <IntroVideo onEnded={handleIntroEnd} onFlashStart={handleFlashStart} />
      )}

      {showContent && (
        <ProjectSlider
          isPaused={isPaused}
          onProjectClick={setExpandedProject}
          onPauseChange={setIsPaused}
          visible={introFinished}
          expandedProject={expandedProject}
        />
      )}

      <TransitionFlash show={showFlash} />

      {displayProjectData && (
        <ProjectInfoPanel
          project={displayProjectData}
          onClose={handleClosePanel}
          visible={expandedProject !== null}
          expansionStage="expanded"
        />
      )}

      <button
        onClick={goToPrevProject}
        className={`fixed left-6 top-1/2 -translate-y-1/2 z-50 w-12 h-12 flex items-center justify-center
          rounded-full bg-white/10 backdrop-blur-sm border border-white/20
          hover:bg-white/20 hover:scale-110 transition-all duration-300
          ${expandedProject !== null ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-label="Previous project"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        onClick={goToNextProject}
        className={`fixed right-6 top-1/2 -translate-y-1/2 z-50 w-12 h-12 flex items-center justify-center
          rounded-full bg-white/10 backdrop-blur-sm border border-white/20
          hover:bg-white/20 hover:scale-110 transition-all duration-300
          ${expandedProject !== null ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-label="Next project"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <SocialLinks className="projects-social-links" />
    </div>
  )
}
