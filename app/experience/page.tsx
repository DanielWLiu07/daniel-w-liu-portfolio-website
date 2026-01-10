'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { BackgroundVideo, ExperienceHeader, ExperienceList, SocialLinks, experiences } from '@/components/experience'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

export default function ExperiencePage() {
  const mainRef = useRef(null)
  const { isLowPerformance } = usePerformanceMode()

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Use shorter delays on low quality mode (no intro video to wait for)
      const headerDelay = isLowPerformance ? 0.1 : 2.0
      const cardsDelay = isLowPerformance ? 0.2 : 2.3
      const socialDelay = isLowPerformance ? 0.1 : 2.0

      // Header animation - slide down and fade in
      gsap.from('.experience-header', {
        y: -100,
        opacity: 0,
        duration: 3.2,
        ease: 'elastic.out(1, 0.5)',
        delay: headerDelay
      })

      // Cards animation - stagger from bottom with slight rotation
      gsap.from('.experience-card', {
        y: 100,
        opacity: 0,
        rotationX: -15,
        duration: 3,
        stagger: 0.15,
        ease: 'elastic.out(1, 0.6)',
        delay: cardsDelay
      })

      // Social links animation - slide up from bottom
      gsap.from('.experience-social-links', {
        y: 100,
        opacity: 0,
        duration: 2.7,
        ease: 'elastic.out(1, 0.6)',
        delay: socialDelay
      })
    }, mainRef)

    return () => ctx.revert()
  }, [isLowPerformance])

  return (
    <main ref={mainRef} className="flex min-h-screen relative overflow-hidden">

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
