'use client'

import { useEffect, useRef, useState } from 'react'
import { fastBlazeFont, mochiFont } from '@/lib/fonts'

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
  visible: boolean
  expansionStage: ExpansionStage
}

export function ProjectInfoPanel({ project, onClose, visible }: ProjectInfoPanelProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ rotateX: 0, rotateY: 0, translateY: 0 })
  const currentRotationRef = useRef({ x: 0, y: 0 })
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const lastFrameTimeRef = useRef(0)
  const mouseRef = useRef({ x: 0, y: 0 })
  const smoothMouseRef = useRef({ x: 0, y: 0 })

  const flickerTimeRef = useRef(0)
  const isFlickeringRef = useRef(false)

  const [panelState, setPanelState] = useState<PanelState>(() => visible ? 'starting' : 'hidden')

  const prevVisibleRef = useRef(visible)
  const prevProjectIdRef = useRef(project.id)
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
    const prevProjectId = prevProjectIdRef.current
    prevProjectIdRef.current = project.id

    if (project.id !== prevProjectId && visible && panelState === 'visible') {
      isFlickeringRef.current = true
      flickerTimeRef.current = 0
    }
  }, [project.id, visible, panelState])

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

    window.addEventListener('mousemove', handleMouseMove)

    const animate = (currentTime: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = currentTime
      }
      const timePassed = currentTime - lastFrameTimeRef.current
      lastFrameTimeRef.current = currentTime

      timeRef.current += timePassed * 0.001

      smoothMouseRef.current.x += (mouseRef.current.x - smoothMouseRef.current.x) * 0.05
      smoothMouseRef.current.y += (mouseRef.current.y - smoothMouseRef.current.y) * 0.05

      const floatY = Math.sin(timeRef.current * 1.5) * 8
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

      let targetRotY = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, offsetX * ROTATION_SENSITIVITY))
      let targetRotX = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, -offsetY * ROTATION_SENSITIVITY))

      if (isFlickeringRef.current) {
        flickerTimeRef.current += timePassed * 0.001
        const flickerProgress = flickerTimeRef.current / 0.2

        if (flickerProgress < 1) {
          const flickerIntensity = Math.sin(flickerProgress * Math.PI)
          const flickerWave = Math.sin(flickerProgress * Math.PI * 1.5)
          targetRotY += flickerWave * -22.5 * flickerIntensity
          targetRotX += Math.cos(flickerProgress * Math.PI * 1.5) * 12 * flickerIntensity
        } else {
          isFlickeringRef.current = false
        }
      }

      currentRotationRef.current.y += (targetRotY - currentRotationRef.current.y) * 0.25
      currentRotationRef.current.x += (targetRotX - currentRotationRef.current.x) * 0.25

      setTransform({
        rotateX: currentRotationRef.current.x,
        rotateY: currentRotationRef.current.y,
        translateY: floatY
      })
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [panelState])

  if (panelState === 'hidden') return null

  const isFlyingIn = panelState === 'flying-in'
  const isFlyingOut = panelState === 'flying-out'
  const isVisible = panelState === 'visible'

  const translateY = (isFlyingIn || isVisible) ? '-50%' : '-150vh'
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

  return (
    <div
      className="fixed right-[15%] top-1/2 w-[90%] max-w-md z-50 pointer-events-auto"
      style={{
        transform: `translateY(${translateY})`,
        opacity,
        transition,
        perspective: '1000px'
      }}
    >
      <div
        ref={cardRef}
        className="relative rounded-2xl shadow-2xl overflow-hidden"
        style={{
          transform: `translateY(${transform.translateY}px) rotateX(${totalRotateX}deg) rotateY(${totalRotateY}deg)`,
          transformOrigin: 'center center',
          transformStyle: 'preserve-3d',
          minHeight: '620px'
        }}
      >
        <img
          src="/about/images/bg.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="relative z-10">
          {cardContent}
        </div>
      </div>
    </div>
  )
}
