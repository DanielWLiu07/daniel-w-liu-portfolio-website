'use client'

import { useState } from 'react'
import ProjectModal from '@/components/projects/ProjectModal'
import IntroVideo from '@/components/projects/IntroVideo'
import BackgroundVideos from '@/components/projects/BackgroundVideos'
import ProjectSlider from '@/components/projects/ProjectSlider'
import TransitionFlash from '@/components/projects/TransitionFlash'
import { projects } from '@/components/projects/project-data'
import { SocialLinks } from '@/components/ui/social-links'

export default function ProjectsPage() {
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [introFinished, setIntroFinished] = useState(false)
  const [flashOpacity, setFlashOpacity] = useState(0)

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
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <BackgroundVideos visible={introFinished} />

      <ProjectSlider
        isPaused={isPaused}
        onProjectClick={setExpandedProject}
        onPauseChange={setIsPaused}
        visible={introFinished}
      />

      {!introFinished && (
        <IntroVideo onEnded={handleIntroEnd} onFlashStart={handleFlashStart} />
      )}

      <TransitionFlash opacity={flashOpacity} />

      {expandedProjectData && (
        <ProjectModal project={expandedProjectData} onClose={handleCloseExpanded} />
      )}

      <SocialLinks />
    </div>
  )
}
  