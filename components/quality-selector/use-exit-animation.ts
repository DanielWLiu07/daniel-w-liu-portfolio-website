import gsap from 'gsap'

interface ExitAnimationRefs {
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

export function createExitAnimation(
  selectedMode: 'high' | 'low',
  refs: ExitAnimationRefs,
  onComplete: () => void
) {
  const exitTl = gsap.timeline({ onComplete })
  const isMobile = window.innerWidth < 768

  if (selectedMode === 'high') {
    exitTl
      .to(refs.highQualityRef.current, { x: 0, rotation: 0, scale: 1.15, duration: 0.6, ease: 'power2.out' })
      .to(refs.lowQualityRef.current, { x: isMobile ? 0 : 400, rotation: 90, opacity: 0, duration: 0.6, ease: 'power2.in' }, '-=0.6')
      .to(refs.catRef.current, { x: isMobile ? 0 : 500, rotation: 120, opacity: 0, duration: 0.7, ease: 'power2.in' }, '-=0.6')
      .to(refs.selfieRef.current, { x: isMobile ? 0 : -500, rotation: -120, opacity: 0, duration: 0.7, ease: 'power2.in' }, '-=0.7')
      .to(refs.waterlooRef.current, { x: -300, y: 300, rotation: -90, opacity: 0, duration: 0.7, ease: 'power2.in' }, '-=0.7')
      .to(refs.highQualityRef.current, { scale: 1.8, opacity: 0, duration: 0.5, ease: 'power2.in' })
  } else {
    exitTl
      .to(refs.lowQualityRef.current, { x: 0, rotation: 0, scale: 1.15, duration: 0.6, ease: 'power2.out' })
      .to(refs.highQualityRef.current, { x: isMobile ? 0 : -400, rotation: -90, opacity: 0, duration: 0.6, ease: 'power2.in' }, '-=0.6')
      .to(refs.selfieRef.current, { x: isMobile ? 0 : -500, rotation: -120, opacity: 0, duration: 0.7, ease: 'power2.in' }, '-=0.6')
      .to(refs.waterlooRef.current, { x: -300, y: 300, rotation: -90, opacity: 0, duration: 0.7, ease: 'power2.in' }, '-=0.7')
      .to(refs.catRef.current, { x: isMobile ? 0 : 500, rotation: 120, opacity: 0, duration: 0.7, ease: 'power2.in' }, '-=0.7')
      .to(refs.lowQualityRef.current, { scale: 1.8, opacity: 0, duration: 0.5, ease: 'power2.in' })
  }

  exitTl
    .to([refs.titleRef.current, refs.subtitleRef.current], { y: -30, opacity: 0, duration: 0.4, ease: 'power2.in' }, '-=0.5')
    .to(refs.socialsRef.current, { x: 100, y: 50, rotation: 25, opacity: 0, duration: 0.5, ease: 'power2.in' }, '-=0.5')
    .to(refs.helperTextRef.current, { y: 30, opacity: 0, duration: 0.4, ease: 'power2.in' }, '-=0.4')
}
