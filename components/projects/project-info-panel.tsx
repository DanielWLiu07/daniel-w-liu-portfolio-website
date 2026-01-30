'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { fastBlazeFont, mochiFont } from '@/lib/fonts'
import {
  DESKTOP_LAYOUT,
  MOBILE_LAYOUT,
  MD_BREAKPOINT,
  BASE_RIGHT_CARD_WIDTH,
  SCALE_LIMITS,
} from '@/lib/layout-config'
import { getFloatOffset, clamp } from '@/lib/animation-utils'

type ExpansionStage = 'none' | 'expanding' | 'expanded'
type PanelState = 'hidden' | 'starting' | 'flying-in' | 'visible' | 'flying-out'

interface ProjectInfoPanelProps {
  project: {
    id: number
    title: string
    detailedDescription: string
    image: string
    images: string[]
    technologies: string[]
    titleGradient: string
    link?: string
    github?: string
  }
  onClose: () => void
  onPrevProject?: () => void
  onNextProject?: () => void
  visible: boolean
  expansionStage: ExpansionStage
}

export function ProjectInfoPanel({ project, onClose, onPrevProject, onNextProject, visible }: ProjectInfoPanelProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ rotateX: 0, rotateY: 0, translateX: 0, translateY: 0, scale: 1, isMobile: false, viewportHeight: 800 })
  const currentRotationRef = useRef({ x: 0, y: 0 })
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const lastFrameTimeRef = useRef(0)
  const mouseRef = useRef({ x: 0, y: 0 })
  const smoothMouseRef = useRef({ x: 0, y: 0 })

  const [panelState, setPanelState] = useState<PanelState>(() => visible ? 'starting' : 'hidden')

  const prevVisibleRef = useRef(visible)
  const hasInitializedRef = useRef(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      return
    }

    const wasVisible = prevVisibleRef.current
    const isVisible = visible
    prevVisibleRef.current = visible

    if (isVisible && !wasVisible) {
      setPanelState('starting')
    }

    if (!isVisible && wasVisible && panelState !== 'hidden' && panelState !== 'flying-out') {
      setPanelState('flying-out')
    }
  }, [visible, panelState])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (panelState === 'starting') {
      const frameId = requestAnimationFrame(() => {
        setPanelState('flying-in')
      })
      return () => cancelAnimationFrame(frameId)
    }

    if (panelState === 'flying-in') {
      const timeout = setTimeout(() => {
        setPanelState('visible')
      }, 1200)
      return () => clearTimeout(timeout)
    }

    if (panelState === 'flying-out') {
      const timeout = setTimeout(() => {
        setPanelState('hidden')
      }, 1200)
      return () => clearTimeout(timeout)
    }
  }, [panelState])

  useEffect(() => {
    if (panelState === 'hidden') return

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0]
        mouseRef.current = {
          x: (touch.clientX / window.innerWidth) * 2 - 1,
          y: (touch.clientY / window.innerHeight) * 2 - 1
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })

    const animate = (currentTime: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = currentTime
      }
      const timePassed = currentTime - lastFrameTimeRef.current
      lastFrameTimeRef.current = currentTime

      timeRef.current += timePassed * 0.001

      smoothMouseRef.current.x += (mouseRef.current.x - smoothMouseRef.current.x) * 0.05
      smoothMouseRef.current.y += (mouseRef.current.y - smoothMouseRef.current.y) * 0.05

      const floatOffset = getFloatOffset(timeRef.current, 'right')
      const floatX = floatOffset.x
      const floatY = floatOffset.y
      const MAX_ROTATION = 8
      const ROTATION_SENSITIVITY = 10
      let cardCenterX = 0
      let cardCenterY = 0
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect()
        cardCenterX = ((rect.left + rect.right) / 2 / window.innerWidth) * 2 - 1
        cardCenterY = ((rect.top + rect.bottom) / 2 / window.innerHeight) * 2 - 1
      }

      const offsetX = smoothMouseRef.current.x - cardCenterX
      const offsetY = smoothMouseRef.current.y - cardCenterY

      const targetRotY = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, offsetX * ROTATION_SENSITIVITY))
      const targetRotX = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, -offsetY * ROTATION_SENSITIVITY))

      currentRotationRef.current.y += (targetRotY - currentRotationRef.current.y) * 0.25
      currentRotationRef.current.x += (targetRotX - currentRotationRef.current.x) * 0.25

      const isMobile = window.innerWidth < MD_BREAKPOINT

      let responsiveScale = 1
      if (isMobile) {
        const targetRightCardPixels = window.innerWidth * MOBILE_LAYOUT.RIGHT_CARD_WIDTH
        responsiveScale = clamp(
          targetRightCardPixels / BASE_RIGHT_CARD_WIDTH,
          SCALE_LIMITS.MIN,
          SCALE_LIMITS.MAX
        )
      }

      setTransform({
        rotateX: currentRotationRef.current.x,
        rotateY: currentRotationRef.current.y,
        translateX: floatX,
        translateY: floatY,
        scale: responsiveScale,
        isMobile,
        viewportHeight: window.innerHeight
      })
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [panelState])

  if (panelState === 'hidden') return null

  const isFlyingIn = panelState === 'flying-in'
  const isFlyingOut = panelState === 'flying-out'
  const isVisible = panelState === 'visible'

  // Center the entire unit (Projects header + info card) by using -50%
  // No extra offset needed since -50% centers based on total container height
  const baseTranslateY = transform.isMobile ? '0%' : '-50%'
  const translateYStyle = (isFlyingIn || isVisible) ? baseTranslateY : '-150vh'
  const opacity = (isFlyingIn || isVisible) ? 1 : 0
  const transition = (isFlyingOut || isFlyingIn)
    ? 'transform 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
    : 'none'
  const totalRotateX = transform.rotateX
  const totalRotateY = transform.rotateY

  const cardContent = (
    <div className="p-8 md:p-10 h-full flex flex-col min-h-[580px] md:min-h-[620px]">
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-20 pointer-events-auto"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <h2
        className={`text-4xl pr-8 bg-clip-text text-transparent pt-[0.2em] pb-[0.1em] -mt-[0.2em] mb-[calc(1rem-0.1em)] ${fastBlazeFont.className}`}
        style={{
          backgroundImage: project.titleGradient,
          WebkitTextStroke: '1px #1a1a1a',
          paintOrder: 'stroke fill'
        }}
      >
        {project.title}
      </h2>

      <p className={`text-gray-600 text-xl leading-relaxed mb-6 ${mochiFont.className}`}>
        {project.detailedDescription}
      </p>

      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Technologies</h3>
        <div className="flex flex-wrap gap-2">
          {project.technologies.map((tech, index) => (
            <span
              key={index}
              className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mt-auto">
        {project.link && (
          <a
            href={project.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors text-center"
          >
            View Project
          </a>
        )}
        {project.github && (
          <a
            href={project.github}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors text-center"
          >
            GitHub
          </a>
        )}
      </div>
    </div>
  )

  const vh = transform.viewportHeight
  const cardTopPx = vh * MOBILE_LAYOUT.TOP_MARGIN
  const cardHeightPx = vh * MOBILE_LAYOUT.CARD_HEIGHT_RATIO * transform.scale
  const cardBottomPx = cardTopPx + cardHeightPx
  const dotsBottomPx = cardBottomPx + (cardHeightPx * MOBILE_LAYOUT.DOTS_OFFSET_RATIO)
  const infoPanelTopPx = dotsBottomPx + MOBILE_LAYOUT.CARDS_GAP

  const topPosition = transform.isMobile ? `${infoPanelTopPx}px` : '50%'
  const positionClass = transform.isMobile ? 'absolute' : 'fixed'
  const mobileWidth = transform.isMobile ? `${85 / transform.scale}vw` : undefined

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const leftCardWidthPx = vw * DESKTOP_LAYOUT.LEFT_CARD_WIDTH
  const rightCardWidthPx = BASE_RIGHT_CARD_WIDTH
  const middleGapPx = DESKTOP_LAYOUT.MIDDLE_GAP_PX
  const totalContentWidth = leftCardWidthPx + middleGapPx + rightCardWidthPx
  const rightGapPx = Math.max(0, (vw - totalContentWidth) / 2 - 30)

  const positionStyle = transform.isMobile
    ? { left: '50%', right: 'auto' }
    : { left: 'auto', right: `${rightGapPx}px` }

  return (
    <div
      className={`${positionClass} md:w-[90%] md:max-w-md z-[60] pointer-events-none`}
      style={{
        width: mobileWidth,
        ...positionStyle,
        top: topPosition,
        transform: `translateX(${transform.isMobile ? '-50%' : '0'}) translateY(${transform.isMobile ? '0' : translateYStyle}) scale(${transform.scale})`,
        opacity,
        transition,
        perspective: '1000px',
        transformOrigin: `${transform.isMobile ? 'center' : 'right'} ${transform.isMobile ? 'top' : 'center'}`
      }}
    >
      <div
        ref={cardRef}
        className="pointer-events-none [transform-style:preserve-3d] w-full"
        style={{
          transform: `translateX(${transform.translateX}px) translateY(${transform.translateY}px) rotateX(${totalRotateX}deg) rotateY(${totalRotateY}deg)`,
          transformOrigin: 'center center',
        }}
      >
        {onPrevProject && onNextProject && (
          <div
            className="relative flex items-center justify-center w-full mb-2 pointer-events-none z-10 [transform-style:preserve-3d]"
            style={{
              // On mobile, compensate for scale so font stays proportional to card width
              // Card width = 85/scale vw, then scaled by scale = 85vw visual
              // Font = 7/scale vw, then scaled by scale = 7vw visual (constant % of card)
              fontSize: transform.isMobile ? `${10 / transform.scale}vw` : '3.75rem',
            }}
          >
            <button
              onClick={onNextProject}
              className="absolute left-0 text-white transition-transform duration-200 hover:scale-110 active:scale-95 animate-beckon-left pointer-events-auto text-[1.8em] [transform:translateZ(10px)] [text-shadow:0_0_15px_rgba(255,255,255,1),0_0_30px_rgba(255,255,255,0.8),0_0_50px_rgba(255,255,255,0.5)]"
              aria-label="Next project"
            >
              ☜
            </button>
            <span
              className="text-white tracking-widest animate-bob pointer-events-none text-[0.7em] whitespace-nowrap [text-shadow:0_0_12px_rgba(255,255,255,0.8),0_0_25px_rgba(255,255,255,0.5)] tracking-[0.12em] [transform:translateZ(5px)]"
              style={{ fontFamily: 'ArcadeClassic, monospace' }}
            >
              Projects
            </span>
            <button
              onClick={onPrevProject}
              className="absolute right-0 text-white transition-transform duration-200 hover:scale-110 active:scale-95 animate-beckon-right pointer-events-auto text-[1.8em] [transform:translateZ(10px)] [text-shadow:0_0_15px_rgba(255,255,255,1),0_0_30px_rgba(255,255,255,0.8),0_0_50px_rgba(255,255,255,0.5)]"
              aria-label="Previous project"
            >
              ☞
            </button>
          </div>
        )}

        <div
          className="relative rounded-2xl shadow-2xl overflow-hidden pointer-events-auto w-full"
          style={{
            marginTop: transform.isMobile ? '0.5rem' : '-0.5rem',
            minHeight: transform.isMobile ? '580px' : '620px'
          }}
        >
          <Image
            src="/about/images/bg.webp"
            alt=""
            fill
            className="object-cover"
            priority
          />
          <div className="relative z-10">
            {cardContent}
          </div>
        </div>
      </div>
    </div>
  )
}
