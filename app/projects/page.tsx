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
  const [showFlash, setShowFlash] = useState(false)

  const mainRef = useRef<HTMLDivElement>(null)
  const gsapContextRef = useRef<gsap.Context | null>(null)
  const readyCalledRef = useRef(false)

  const { transitionStage, signalReady } = useTransitionState()
  const { isLowPerformance } = usePerformanceMode()

  const showContent = isLowPerformance || transitionStage !== 'loading'

  useBodyOverflow('hidden')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isLowPerformance || readyCalledRef.current) return
    readyCalledRef.current = true
    signalReady()
    setIntroFinished(true)
  }, [isLowPerformance, signalReady])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (transitionStage === 'loading') {
      readyCalledRef.current = false
      setIntroFinished(false)
      setShowFlash(false)
      if (!isLowPerformance && mainRef.current) {
        gsap.set(SOCIAL_LINKS_SELECTOR, { y: 100, opacity: 0 })
      }
      if (isLowPerformance) {
        signalReady()
        setIntroFinished(true)
      }
    }
  }, [transitionStage, isLowPerformance, signalReady])
  /* eslint-enable react-hooks/set-state-in-effect */

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

  const handleFlashStart = useCallback(() => setShowFlash(true), [])

  const handleIntroEnd = useCallback(() => {
    setTimeout(() => {
      setIntroFinished(true)
      setShowFlash(false)
    }, 100)
  }, [])

  const handleClosePanel = useCallback(() => {
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
          expandedProject={expandedProject}
        />
      )}

      <TransitionFlash show={showFlash} />

      {/* Info panel slides in from the right */}
      {expandedProjectData && (
        <ProjectInfoPanel
          project={expandedProjectData}
          onClose={handleClosePanel}
          visible={expandedProject !== null}
        />
      )}

      {/* Backdrop when expanded */}
      {expandedProject !== null && (
        <div
          className="fixed inset-0 bg-black/40 z-30 transition-opacity duration-300"
          onClick={handleClosePanel}
        />
      )}

      <SocialLinks className="projects-social-links" />
    </div>
  )
}
