'use client'

import { ModalTechBadge } from './modal-tech-badge'
import { ModalActionLinks } from './modal-action-links'

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
  return (
    <div
      className={`fixed right-0 top-0 bottom-0 w-full md:w-1/2 lg:w-[45%] bg-black/90 backdrop-blur-md z-40
        transform transition-transform duration-500 ease-out
        ${visible ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="h-full flex flex-col p-8 md:p-12 overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mt-16 md:mt-8">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            {project.title}
          </h2>

          <p className="text-gray-300 text-lg leading-relaxed mb-8">
            {project.detailedDescription}
          </p>

          <div className="mb-8">
            <h3 className="text-sm uppercase tracking-wider text-gray-500 mb-3">Technologies</h3>
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-white/10 text-white text-sm rounded-full"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            {project.link && (
              <a
                href={project.link}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                View Project
              </a>
            )}
            {project.github && (
              <a
                href={project.github}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition-colors"
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
