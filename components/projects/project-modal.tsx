import { ModalCloseButton } from './modal-close-button'
import { ModalTechBadge } from './modal-tech-badge'
import { ModalActionLinks } from './modal-action-links'
import { MODAL_ANIMATIONS } from '@/lib/project-modal-styles'

interface ProjectModalProps {
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
}

export default function ProjectModal({ project, onClose }: ProjectModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden animate-slideIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-full flex flex-col md:flex-row">
          <ModalCloseButton onClick={onClose} />

          {/* Left side - Image */}
          <div className="md:w-1/2 h-64 md:h-auto bg-gray-100 flex-shrink-0">
            <img
              src={project.image}
              alt={project.title}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Right side - Content */}
          <div className="md:w-1/2 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 md:p-10">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
                {project.title}
              </h2>

              <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-6">
                {project.detailedDescription}
              </p>

              <ModalTechBadge technologies={project.technologies} />
              <ModalActionLinks link={project.link} github={project.github} />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{MODAL_ANIMATIONS}</style>
    </div>
  )
}
