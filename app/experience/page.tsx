'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { BackgroundVideo, ExperienceHeader, ExperienceList, SocialLinks, experiences } from '@/components/experience'

export default function ExperiencePage() {
  const mainRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Header animation - slide down and fade in
      gsap.from('.experience-header', {
        y: -100,
        opacity: 0,
        duration: 3.2,
        ease: 'elastic.out(1, 0.5)',
        delay: 0.5
      })

      // Cards animation - stagger from bottom with slight rotation
      gsap.from('.experience-card', {
        y: 100,
        opacity: 0,
        rotationX: -15,
        duration: 3,
        stagger: 0.15,
        ease: 'elastic.out(1, 0.6)',
        delay: 0.8
      })

      // Social links animation - slide up from bottom
      gsap.from('.experience-social-links', {
        y: 100,
        opacity: 0,
        duration: 2.7,
        ease: 'elastic.out(1, 0.6)',
        delay: 0.5
      })
    }, mainRef)

    return () => ctx.revert()
  }, [])

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
