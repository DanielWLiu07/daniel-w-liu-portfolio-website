'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import localFont from 'next/font/local'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { QualityCard } from './quality-card'
import { BackgroundImage } from './background-image'
import { WaterlooLogo } from './waterloo-logo'
import { SelectorTitle } from './selector-title'
import { SelectorSocials } from './selector-socials'
import { DraggableDecorations } from './draggable-decorations'
import { useEntranceAnimation } from './use-entrance-animation'
import { useDraggable } from './use-draggable'
import { createExitAnimation } from './use-exit-animation'
import { QUALITY_OPTIONS, BACKGROUND_IMAGES } from './constants'

const fredrick = localFont({
  src: '../../public/fonts/FrederickatheGreat-Regular.ttf',
})

export function ModeSelector() {
  const { mode, setMode } = usePerformanceMode()
  const [isExiting, setIsExiting] = useState(false)
  const [selected, setSelected] = useState<'high' | 'low' | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const highQualityRef = useRef<HTMLDivElement>(null)
  const lowQualityRef = useRef<HTMLDivElement>(null)
  const helperTextRef = useRef<HTMLParagraphElement>(null)
  const selfieRef = useRef<HTMLDivElement>(null)
  const catRef = useRef<HTMLDivElement>(null)
  const waterlooRef = useRef<HTMLDivElement>(null)
  const socialsRef = useRef<HTMLDivElement>(null)

  useEntranceAnimation(
    {
      titleRef,
      subtitleRef,
      highQualityRef,
      lowQualityRef,
      helperTextRef,
      selfieRef,
      catRef,
      waterlooRef,
      socialsRef,
    },
    mode
  )

  useDraggable(mode, setIsDragging)

  const handleModeSelect = (selectedMode: 'high' | 'low') => {
    if (isDragging) return
    setSelected(selectedMode)
    setIsExiting(true)

    createExitAnimation(
      selectedMode,
      {
        titleRef,
        subtitleRef,
        highQualityRef,
        lowQualityRef,
        helperTextRef,
        selfieRef,
        catRef,
        waterlooRef,
        socialsRef,
      },
      () => {
        setTimeout(() => setMode(selectedMode), 300)
      }
    )
  }

  if (mode !== null) return null

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 md:p-8 overflow-visible">
      <div className="absolute inset-0 z-0">
        <Image
          src="/landing/images/white_paper.png"
          alt="paper background"
          fill
          className="object-cover"
          priority
        />
      </div>

      <BackgroundImage ref={selfieRef} {...BACKGROUND_IMAGES.selfie} />
      <WaterlooLogo ref={waterlooRef} />
      <BackgroundImage ref={catRef} {...BACKGROUND_IMAGES.cat} />
      <DraggableDecorations />

      <div className="relative flex flex-col items-center justify-center gap-8 md:gap-16 w-full max-w-6xl mx-auto z-10">
        <SelectorTitle ref={titleRef} subtitleRef={subtitleRef} />

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start justify-center px-4 md:px-8 overflow-visible">
          <QualityCard
            ref={highQualityRef}
            {...QUALITY_OPTIONS.high}
            rotation="-rotate-[5deg]"
            order="order-2 md:order-1"
            onClick={() => handleModeSelect('high')}
          />
          <QualityCard
            ref={lowQualityRef}
            {...QUALITY_OPTIONS.low}
            rotation="rotate-[4deg]"
            order="order-1 md:order-2"
            onClick={() => handleModeSelect('low')}
          />
        </div>
      </div>

      <div
        ref={helperTextRef}
        className="fixed bottom-8 left-0 right-0 z-[100] flex items-center justify-center px-4 opacity-0"
      >
        <p
          className={`text-xs md:text-base text-center max-w-[90%] md:max-w-2xl font-bold text-stroke-white-sm ${fredrick.className}`}
          style={{ color: '#2c1810' }}
        >
          Don&apos;t worry, you can always change this later by returning to the landing page
        </p>
      </div>

      <SelectorSocials ref={socialsRef} />
    </div>
  )
}
