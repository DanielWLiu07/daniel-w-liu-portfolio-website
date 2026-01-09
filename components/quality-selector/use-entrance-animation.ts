import { useEffect } from 'react'
import gsap from 'gsap'

interface AnimationRefs {
  titleRef: React.RefObject<HTMLDivElement>
  subtitleRef: React.RefObject<HTMLParagraphElement>
  highQualityRef: React.RefObject<HTMLDivElement>
  lowQualityRef: React.RefObject<HTMLDivElement>
  helperTextRef: React.RefObject<HTMLParagraphElement>
  selfieRef: React.RefObject<HTMLDivElement>
  catRef: React.RefObject<HTMLDivElement>
  waterlooRef: React.RefObject<HTMLDivElement>
  socialsRef: React.RefObject<HTMLDivElement>
}

export function useEntranceAnimation(refs: AnimationRefs, mode: string | null) {
  useEffect(() => {
    if (mode !== null) return

    const ctx = gsap.context(() => {
      gsap.set(refs.titleRef.current, { y: -30, opacity: 0 })
      gsap.set(refs.subtitleRef.current, { y: -20, opacity: 0 })
      gsap.set(refs.highQualityRef.current, { x: -50, y: 50, rotation: -25, opacity: 0 })
      gsap.set(refs.lowQualityRef.current, { x: 50, y: 50, rotation: 25, opacity: 0 })
      gsap.set(refs.selfieRef.current, { x: -150, y: 100, rotation: -45, opacity: 0 })
      gsap.set(refs.catRef.current, { x: 150, y: 100, rotation: 45, opacity: 0 })
      gsap.set(refs.waterlooRef.current, { x: -300, y: 300, rotation: -70, opacity: 0 })
      gsap.set(refs.helperTextRef.current, { y: 20, opacity: 0 })
      gsap.set(refs.socialsRef.current, { x: 100, y: 50, rotation: 25, opacity: 0 })

      const tl = gsap.timeline({ defaults: { ease: 'back.out(1.2)' } })

      tl.to(refs.titleRef.current, { y: 0, opacity: 1, duration: 0.8 })
        .to(refs.subtitleRef.current, { y: 0, opacity: 1, duration: 0.6 }, '-=0.4')
        .to(refs.selfieRef.current, { x: 0, y: 0, rotation: -18, opacity: 1, duration: 0.8 }, '-=0.3')
        .to(refs.waterlooRef.current, { x: 0, y: 0, rotation: -10, opacity: 1, duration: 0.8 }, '-=0.75')
        .to(refs.highQualityRef.current, { x: 0, y: 0, rotation: -5, opacity: 1, duration: 0.8 }, '-=0.7')
        .to(refs.lowQualityRef.current, { x: 0, y: 0, rotation: 4, opacity: 1, duration: 0.8 }, '-=0.7')
        .to(refs.catRef.current, { x: 0, y: 0, rotation: 18, opacity: 1, duration: 0.8 }, '-=0.7')
        .to(refs.helperTextRef.current, { y: 0, opacity: 0.8, duration: 0.6 }, '-=0.4')
        .to(refs.socialsRef.current, { x: 0, y: 0, rotation: 0, opacity: 1, duration: 0.8 }, '-=0.6')
    })

    return () => ctx.revert()
  }, [mode, refs])
}
