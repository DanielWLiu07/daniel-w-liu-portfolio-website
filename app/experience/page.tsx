'use client'

import { BackgroundVideo, ExperienceHeader, ExperienceList, SocialLinks, experiences } from '@/components/experience'

export default function ExperiencePage() {
  return (
    <main className="flex min-h-screen relative overflow-hidden">

      <BackgroundVideo />

      <div
        className="absolute top-20 left-1/2 -translate-x-1/2 md:-left-8 md:translate-x-0 z-10 w-full md:w-auto"
        style={{
          perspective: '1000px',
          transformStyle: 'preserve-3d',
          overflow: 'visible'
        }}
      >
        <ExperienceHeader />
        <ExperienceList experiences={experiences} />
      </div>

      <SocialLinks />
    </main>
  )
}
