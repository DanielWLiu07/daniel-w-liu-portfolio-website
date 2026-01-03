'use client'

import { useState } from 'react'
import ProjectModal from '@/components/projects/ProjectModal'
import IntroVideo from '@/components/projects/IntroVideo'
import BackgroundVideos from '@/components/projects/BackgroundVideos'
import ProjectSlider from '@/components/projects/ProjectSlider'
import TransitionFlash from '@/components/projects/TransitionFlash'
import { projects } from '@/components/projects/project-data'
import { SocialLinks } from '@/components/ui/social-links'
import { useBodyOverflow } from '@/hooks/use-body-overflow'

export default function ProjectsPage() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [introFinished, setIntroFinished] = useState(false)
  const [flashOpacity, setFlashOpacity] = useState(0)

  useBodyOverflow('hidden')

  const handleIntroLoaded = () => {
    setIsLoaded(true)
  }

  const handleFlashStart = () => {
    if (flashOpacity === 0) {
      setFlashOpacity(1)
    }
  }

  const handleIntroEnd = () => {
    setIntroFinished(true)
    setTimeout(() => {
      setFlashOpacity(0)
    }, 200)
  }

  const handleCloseExpanded = () => {
    setExpandedProject(null)
    setIsPaused(false)
  }

  const expandedProjectData = projects.find(p => p.id === expandedProject)

  return (
    <>
      {!isLoaded && (
        <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
            <p className="text-2xl text-white">Loading...</p>
          </div>
        </div>
      )}

      <div className={`relative w-full h-screen overflow-hidden bg-black ${!isLoaded ? 'opacity-0' : 'opacity-100'}`}>
        <BackgroundVideos visible={introFinished} />

        <ProjectSlider
          isPaused={isPaused}
          onProjectClick={setExpandedProject}
          onPauseChange={setIsPaused}
          visible={introFinished}
        />

        {!introFinished && (
          <IntroVideo onEnded={handleIntroEnd} onFlashStart={handleFlashStart} onLoaded={handleIntroLoaded} />
        )}

      <TransitionFlash opacity={flashOpacity} />

      {expandedProjectData && (
        <ProjectModal project={expandedProjectData} onClose={handleCloseExpanded} />
      )}

      <SocialLinks />
      </div>
    </>
  )
}
  