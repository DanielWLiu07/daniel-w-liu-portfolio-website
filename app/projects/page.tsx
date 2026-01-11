'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
import { usePerformanceMode } from '@/contexts/performance-mode-context'

const SOCIAL_LINKS_SELECTOR = '.projects-social-links'

export default function ProjectsPage() {
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [introFinished, setIntroFinished] = useState(false)
  const [showFlash, setShowFlash] = useState(false)

  const mainRef = useRef<HTMLDivElement>(null)
  const gsapContextRef = useRef<gsap.Context | null>(null)
  const readyCalledRef = useRef(false)

  const { transitionStage, signalReady } = useTransitionState()
  const { isLowPerformance } = usePerformanceMode()

  // For low quality, show content immediately; otherwise wait for loading to finish
  const showContent = isLowPerformance || transitionStage !== 'loading'

  useBodyOverflow('hidden')

  // Low quality mode: skip intro
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    setIntroFinished(true)
  }, [isLowPerformance, signalReady])

  // Reset ready state and signal when entering loading (new navigation to this page)
  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      if (isLowPerformance) {
        signalReady()
        setIntroFinished(true)
      }
    }
  }, [transitionStage, isLowPerformance, signalReady])

  // Initialize social links animation state (skip for low quality)
  useEffect(() => {
    if (isLowPerformance) return
    gsapContextRef.current = gsap.context(() => {
      gsap.set(SOCIAL_LINKS_SELECTOR, { y: 100, opacity: 0 })
    }, mainRef)

    return () => gsapContextRef.current?.revert()
  }, [isLowPerformance])

  // Animate social links after intro (skip for low quality)
  useEffect(() => {
    if (!introFinished || isLowPerformance) return
    gsap.context(() => {
      gsap.to(SOCIAL_LINKS_SELECTOR, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.1 })
    }, mainRef)
  }, [introFinished, isLowPerformance])

  const handleFlashStart = useCallback(() => setShowFlash(true), [])

  const handleIntroEnd = useCallback(() => {
    setTimeout(() => {
      setIntroFinished(true)
      setShowFlash(false)
    }, 100)
  }, [])

  const handleCloseModal = useCallback(() => {
    setExpandedProject(null)
    setIsPaused(false)
  }, [])

  const expandedProjectData = projects.find(p => p.id === expandedProject)

  return (
    <div ref={mainRef} className="relative w-full h-screen overflow-hidden bg-black">
      <BackgroundVideos visible={introFinished} />

      {!introFinished && !isLowPerformance && (
        <IntroVideo onEnded={handleIntroEnd} onFlashStart={handleFlashStart} />
      )}

      {showContent && (
        <ProjectSlider
          isPaused={isPaused}
          onProjectClick={setExpandedProject}
          onPauseChange={setIsPaused}
          visible={introFinished}
        />
      )}

      <TransitionFlash show={showFlash} />

      {expandedProjectData && (
        <ProjectModal project={expandedProjectData} onClose={handleCloseModal} />
      )}

      <SocialLinks className="projects-social-links" />
    </div>
  )
}
