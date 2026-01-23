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

    // Touch support for 3D card rotation - mirrors mouse behavior
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

      // Varied floating animation - different pattern from left card
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

      // Perfect percentage layout using shared config
      const isMobile = window.innerWidth < MD_BREAKPOINT
      const rightCardPercent = isMobile ? MOBILE_LAYOUT.RIGHT_CARD_WIDTH : DESKTOP_LAYOUT.RIGHT_CARD
      const targetRightCardPixels = window.innerWidth * rightCardPercent

      // Scale needed to fit right card to target percentage
      const responsiveScale = clamp(
        targetRightCardPixels / BASE_RIGHT_CARD_WIDTH,
        SCALE_LIMITS.MIN,
        SCALE_LIMITS.MAX
      )

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

  // Mobile: position in lower portion, Desktop: centered vertically
  const baseTranslateY = transform.isMobile ? '0%' : '-50%'
  const translateYStyle = (isFlyingIn || isVisible) ? baseTranslateY : '-150vh'
  const opacity = (isFlyingIn || isVisible) ? 1 : 0
  const transition = (isFlyingOut || isFlyingIn)
    ? 'transform 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
    : 'none'
  const totalRotateX = transform.rotateX
  const totalRotateY = transform.rotateY

  const cardContent = (
    <div className="p-10 h-full flex flex-col" style={{ minHeight: '620px' }}>
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
        className={`text-4xl mb-4 pr-8 ${fastBlazeFont.className}`}
        style={{
          background: 'linear-gradient(135deg, #ff6b6b, #feca57, #48dbfb, #ff9ff3, #54a0ff)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextStroke: '1.5px #1a1a1a',
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
              className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
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

  // Mobile: centered horizontally, positioned closer to left card; Desktop: at 60vw
  const leftPosition = transform.isMobile ? '50%' : `${DESKTOP_LAYOUT.RIGHT_CARD_LEFT * 100}vw`

  // Calculate info panel position using layout constants
  // See MOBILE_LAYOUT in layout-config.ts for visual diagram
  const vh = transform.viewportHeight
  const cardTopPx = vh * MOBILE_LAYOUT.TOP_MARGIN
  const cardHeightPx = vh * MOBILE_LAYOUT.CARD_HEIGHT_RATIO * transform.scale
  const cardBottomPx = cardTopPx + cardHeightPx
  const dotsBottomPx = cardBottomPx + (cardHeightPx * MOBILE_LAYOUT.DOTS_OFFSET_RATIO)
  const infoPanelTopPx = dotsBottomPx + MOBILE_LAYOUT.CARDS_GAP
  const topPosition = transform.isMobile ? `${infoPanelTopPx}px` : '50%'
  const originX = transform.isMobile ? 'center' : 'left'
  const originY = transform.isMobile ? 'top' : 'center' // top origin keeps gap consistent when scaling
  const positionClass = transform.isMobile ? 'absolute' : 'fixed'
  // On mobile, compensate for scale so final visual width is 85vw
  const mobileWidth = transform.isMobile ? `${85 / transform.scale}vw` : undefined

  return (
    <div
      className={`${positionClass} md:w-[90%] md:max-w-md z-50 pointer-events-auto`}
      style={{
        width: mobileWidth,
        left: leftPosition,
        top: topPosition,
        transform: `translateX(${transform.isMobile ? '-50%' : '0'}) translateY(${transform.isMobile ? '0' : translateYStyle}) scale(${transform.scale})`,
        opacity,
        transition,
        perspective: '1000px',
        transformOrigin: `${originX} ${originY}`
      }}
    >
      <div
        ref={cardRef}
        style={{
          transform: `translateX(${transform.translateX}px) translateY(${transform.translateY}px) rotateX(${totalRotateX}deg) rotateY(${totalRotateY}deg)`,
          transformOrigin: 'center center',
          transformStyle: 'preserve-3d',
        }}
      >
        {transform.isMobile && onPrevProject && onNextProject && (
          <div
            className="flex items-center justify-center gap-1 mb-0"
            style={{
              transformStyle: 'preserve-3d',
              fontSize: `${Math.max(2.5, transform.scale * 3)}rem`,
            }}
          >
            <button
              onClick={onPrevProject}
              className="text-white transition-transform duration-200 hover:scale-110 active:scale-95 animate-beckon-left"
              style={{
                fontSize: '1.8em',
                transform: 'translateZ(10px)',
                textShadow: '0 0 15px rgba(255,255,255,1), 0 0 30px rgba(255,255,255,0.8), 0 0 50px rgba(255,255,255,0.5)',
              }}
              aria-label="Previous project"
            >
              ☜
            </button>
            <span
              className="text-white tracking-widest px-2"
              style={{
                fontSize: '0.75em',
                fontFamily: 'ArcadeClassic, monospace',
                textShadow: '0 0 12px rgba(255,255,255,0.8), 0 0 25px rgba(255,255,255,0.5)',
                letterSpacing: '0.12em',
                transform: 'translateZ(5px)',
              }}
            >
              Projects
            </span>
            <button
              onClick={onNextProject}
              className="text-white transition-transform duration-200 hover:scale-110 active:scale-95 animate-beckon-right"
              style={{
                fontSize: '1.8em',
                transform: 'translateZ(10px)',
                textShadow: '0 0 15px rgba(255,255,255,1), 0 0 30px rgba(255,255,255,0.8), 0 0 50px rgba(255,255,255,0.5)',
              }}
              aria-label="Next project"
            >
              ☞
            </button>
          </div>
        )}

        <div
          className="relative rounded-2xl shadow-2xl overflow-hidden -mt-8"
          style={{ minHeight: '620px' }}
        >
          <Image
            src="/about/images/bg.png"
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
