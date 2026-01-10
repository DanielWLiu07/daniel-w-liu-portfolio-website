'use client'

import { useState, useEffect, useRef } from 'react'
import gsap from 'gsap'
import ProjectModal from '@/components/projects/ProjectModal'
import IntroVideo from '@/components/projects/IntroVideo'
import BackgroundVideos from '@/components/projects/BackgroundVideos'
import ProjectSlider from '@/components/projects/ProjectSlider'
import TransitionFlash from '@/components/projects/TransitionFlash'
import { projects } from '@/components/projects/project-data'
import { SocialLinks } from '@/components/ui/social-links'
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { useTransitionState } from '@/components/ui/page-transition'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

export default function ProjectsPage() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [introFinished, setIntroFinished] = useState(false)
  const [showFlash, setShowFlash] = useState(false)
  const [canStartIntro, setCanStartIntro] = useState(false)
  const [assetsReady, setAssetsReady] = useState(false)
  const mainRef = useRef(null)
  const { transitionStage } = useTransitionState()
  const { isLowPerformance } = usePerformanceMode()

  useBodyOverflow('hidden')

  // Wait for page transition to complete before starting intro
  useEffect(() => {
    if (transitionStage === 'idle') {
      setCanStartIntro(true)
    }
  }, [transitionStage])

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Set initial state
      gsap.set('.projects-social-links', {
        y: 100,
        opacity: 0
      })
    }, mainRef)

    return () => ctx.revert()
  }, [])

  useEffect(() => {
    if (!introFinished) return

    const ctx = gsap.context(() => {
      gsap.to('.projects-social-links', {
        y: 0,
        opacity: 1,
        duration: 1.5,
        ease: 'power3.out',
        delay: 0.5
      })
    }, mainRef)

    return () => ctx.revert()
  }, [introFinished])

  const handleIntroLoaded = () => {
    setAssetsReady(true)
    setIsLoaded(true)
  }

  const handleFlashStart = () => {
    setShowFlash(true)
  }

  const handleIntroEnd = () => {
    setTimeout(() => {
      setIntroFinished(true)
      setShowFlash(false)
    }, 100)
  }

  // For low performance mode, skip directly to loaded state
  useEffect(() => {
    if (isLowPerformance && canStartIntro) {
      setAssetsReady(true)
      setIsLoaded(true)
    }
  }, [isLowPerformance, canStartIntro])

  const handleCloseExpanded = () => {
    setExpandedProject(null)
    setIsPaused(false)
  }

  const expandedProjectData = projects.find(p => p.id === expandedProject)

  return (
    <>
      {!isLoaded && <LoadingScreen />}

      <div ref={mainRef} className="relative w-full h-screen overflow-hidden bg-black">
        <BackgroundVideos visible={introFinished && isLoaded} />

        <ProjectSlider
          isPaused={isPaused}
          onProjectClick={setExpandedProject}
          onPauseChange={setIsPaused}
          visible={introFinished && isLoaded}
        />

        {!introFinished && canStartIntro && (
          <IntroVideo onEnded={handleIntroEnd} onFlashStart={handleFlashStart} onLoaded={handleIntroLoaded} />
        )}

      <TransitionFlash show={showFlash} />

      {expandedProjectData && (
        <ProjectModal project={expandedProjectData} onClose={handleCloseExpanded} />
      )}

      <SocialLinks className="projects-social-links" />
      </div>
    </>
  )
}
  