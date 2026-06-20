'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { BackgroundVideo, ExperienceHeader, ExperienceList, SocialLinks, experiences } from '@/components/experience'
import { useBodyOverflow } from '@/hooks/use-body-overflow'
import { useTransitionState } from '@/components/ui/page-transition'
import { usePerformanceMode } from '@/contexts/performance-mode-context'

const ANIMATION_DELAY = 1.2

export default function ExperiencePage() {
  const mainRef = useRef<HTMLElement>(null)
  const { transitionStage } = useTransitionState()
  const { isLowPerformance } = usePerformanceMode()
  const animationsStartedRef = useRef(false)
  const gsapContextRef = useRef<gsap.Context | null>(null)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)

  useBodyOverflow('hidden')

  const setInitialStates = () => {
    if (!mainRef.current) return
    gsap.set('.experience-header', {
      y: -80,
      opacity: 0,
      force3D: true,
      willChange: 'transform, opacity'
    })
    gsap.set('.experience-card', {
      y: 100,
      opacity: 0,
      force3D: true,
      willChange: 'transform, opacity'
    })
    gsap.set('.experience-social-links', {
      y: 60,
      opacity: 0,
      force3D: true,
      willChange: 'transform, opacity'
    })
  }

  useLayoutEffect(() => {
    if (isLowPerformance) return
    if (!mainRef.current) return
    gsapContextRef.current = gsap.context(() => {
      setInitialStates()
    }, mainRef)

    return () => {
      timelineRef.current?.kill()
      gsapContextRef.current?.revert()
    }
  }, [isLowPerformance])

  // Reset animations when navigating away
  useEffect(() => {
    if (isLowPerformance) return
    if (transitionStage === 'loading') {
      animationsStartedRef.current = false
      timelineRef.current?.kill()
      timelineRef.current = null
      setInitialStates()
    }
  }, [transitionStage, isLowPerformance])

  useEffect(() => {
    if (isLowPerformance) return
    // Skip if not in revealing or hidden state (matches pattern from other pages)
    if (transitionStage !== 'revealing' && transitionStage !== 'hidden') return
    // Skip if animations already started
    if (animationsStartedRef.current) return

    animationsStartedRef.current = true

    gsap.context(() => {
      const tl = gsap.timeline({ delay: ANIMATION_DELAY })
      timelineRef.current = tl

      tl.to('.experience-header', {
        y: 0,
        duration: 2.5,
        ease: 'elastic.out(0.7, 0.7)'
      })
      tl.to('.experience-header', {
        opacity: 1,
        duration: 2.2,
        ease: 'power1.out',
        clearProps: 'willChange'
      }, 0)

      tl.to('.experience-card', {
        y: 0,
        duration: 2.2,
        stagger: 0.18,
        ease: 'elastic.out(0.7, 0.7)'
      }, 0)
      tl.to('.experience-card', {
        opacity: 1,
        duration: 2,
        stagger: 0.18,
        ease: 'power1.out',
        clearProps: 'willChange'
      }, 0)

      tl.to('.experience-social-links', {
        y: 0,
        opacity: 1,
        duration: 1.8,
        ease: 'elastic.out(0.7, 0.7)',
        clearProps: 'willChange'
      }, '-=1.2')
    }, mainRef)
  }, [transitionStage, isLowPerformance])

  return (
    <main ref={mainRef} className="flex h-screen relative overflow-hidden">
      <BackgroundVideo />

      <div className="absolute top-20 left-1/2 -translate-x-1/2 lg:-left-8 lg:translate-x-0 z-10 w-full lg:w-auto [perspective:1000px] [transform-style:preserve-3d] overflow-visible">
        <ExperienceHeader />
        <ExperienceList experiences={experiences} />
      </div>

      <SocialLinks />
    </main>
  )
}
