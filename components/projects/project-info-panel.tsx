'use client'

import { useEffect, useRef, useState } from 'react'

interface ProjectInfoPanelProps {
  project: {
    id: number
    title: string
    detailedDescription: string
    image: string
    technologies: string[]
    link?: string
    github?: string
  }
  onClose: () => void
  visible: boolean
}

export function ProjectInfoPanel({ project, onClose, visible }: ProjectInfoPanelProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ rotateX: 0, rotateY: 0, translateY: 0 })
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)
  const mouseRef = useRef({ x: 0, y: 0 })
  const smoothMouseRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!visible) return

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1
      }
    }

    window.addEventListener('mousemove', handleMouseMove)

    const animate = () => {
      timeRef.current += 0.016

      // Smooth mouse following
      smoothMouseRef.current.x += (mouseRef.current.x - smoothMouseRef.current.x) * 0.05
      smoothMouseRef.current.y += (mouseRef.current.y - smoothMouseRef.current.y) * 0.05

      // Floating animation
      const floatY = Math.sin(timeRef.current * 1.5) * 8

      // Mouse-based rotation (pointing towards mouse)
      const rotateY = smoothMouseRef.current.x * 8
      const rotateX = -smoothMouseRef.current.y * 5

      setTransform({ rotateX, rotateY, translateY: floatY })
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [visible])

  return (
    <div
      className={`fixed right-[15%] top-1/2 w-[90%] max-w-sm z-40
        transition-all duration-500 ease-out
        ${visible ? 'translate-x-0 opacity-100' : 'translate-x-[150%] opacity-0'}`}
      style={{
        transform: `translateY(-50%)`,
        perspective: '1000px'
      }}
    >
      <div
        ref={cardRef}
        className="bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          transform: `translateY(${transform.translateY}px) rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg)`,
          transformStyle: 'preserve-3d',
          minHeight: '500px'
        }}
      >
        <div className="p-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 className="text-3xl font-bold text-gray-800 mb-4 pr-8">
            {project.title}
          </h2>

          <p className="text-gray-600 text-base leading-relaxed mb-6">
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

          <div className="flex gap-3">
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
      </div>
    </div>
  )
}
