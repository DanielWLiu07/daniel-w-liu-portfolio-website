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

const SOCIAL_LINKS_SELECTOR = '.projects-social-links'

export default function ProjectsPage() {
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [introFinished, setIntroFinished] = useState(false)
  const [introVideoEnded, setIntroVideoEnded] = useState(false)
  const [flashTrigger, setFlashTrigger] = useState(false)
  const [displayProjectData, setDisplayProjectData] = useState<typeof projects[0] | null>(null)

  const mainRef = useRef<HTMLDivElement>(null)
  const gsapContextRef = useRef<gsap.Context | null>(null)
  const readyCalledRef = useRef(false)

  const { transitionStage, signalReady } = useTransitionState()
  const { isLowPerformance } = usePerformanceMode()

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

      <button
        onClick={goToPrevProject}
        className={`fixed left-8 top-1/2 z-50
          text-[120px] leading-none text-white/60 font-black
          flex items-center justify-center
          [text-shadow:_3px_3px_0_rgba(0,0,0,0.6),_-2px_-2px_0_rgba(255,255,255,0.4),_0_0_10px_rgba(255,255,255,0.3)]
          [-webkit-text-stroke:4px_rgba(255,255,255,0.5)]
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
        className={`fixed right-8 top-1/2 z-50
          text-[120px] leading-none text-white/60 font-black
          flex items-center justify-center
          [text-shadow:_3px_3px_0_rgba(0,0,0,0.6),_-2px_-2px_0_rgba(255,255,255,0.4),_0_0_10px_rgba(255,255,255,0.3)]
          [-webkit-text-stroke:4px_rgba(255,255,255,0.5)]
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
  )
}
