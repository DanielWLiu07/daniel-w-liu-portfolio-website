'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { BackgroundVideo, ExperienceHeader, ExperienceList, SocialLinks, experiences } from '@/components/experience'
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { useTransitionState } from '@/components/ui/page-transition'

const ANIMATION_DELAY = 0.5

export default function ExperiencePage() {
  const mainRef = useRef<HTMLElement>(null)
  const { transitionStage } = useTransitionState()
  const animationsStartedRef = useRef(false)
  const gsapContextRef = useRef<gsap.Context | null>(null)

  useBodyOverflow('hidden')

  // Set initial hidden state
  useEffect(() => {
    gsapContextRef.current = gsap.context(() => {
      gsap.set('.experience-header', { y: -100, opacity: 0 })
      gsap.set('.experience-card', { y: 100, opacity: 0, rotationX: -15 })
      gsap.set('.experience-social-links', { y: 100, opacity: 0 })
    }, mainRef)

    return () => gsapContextRef.current?.revert()
  }, [])

  // Animate on reveal
  useEffect(() => {
    if ((transitionStage !== 'revealing' && transitionStage !== 'hidden') || animationsStartedRef.current) return
    animationsStartedRef.current = true

    gsap.context(() => {
      gsap.to('.experience-header', {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'power3.out',
        delay: ANIMATION_DELAY
      })

      gsap.to('.experience-card', {
        y: 0,
        opacity: 1,
        rotationX: 0,
        duration: 1.4,
        stagger: 0.15,
        ease: 'power2.out',
        delay: ANIMATION_DELAY
      })

      gsap.to('.experience-social-links', {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'power3.out',
        delay: ANIMATION_DELAY
      })
    }, mainRef)
  }, [transitionStage])

  return (
    <main ref={mainRef} className="flex h-screen relative overflow-hidden">
      <BackgroundVideo />

      <div className="absolute top-20 left-1/2 -translate-x-1/2 md:-left-8 md:translate-x-0 z-10 w-full md:w-auto [perspective:1000px] [transform-style:preserve-3d] overflow-visible">
        <ExperienceHeader />
        <ExperienceList experiences={experiences} />
      </div>

      <SocialLinks />
    </main>
  )
}
