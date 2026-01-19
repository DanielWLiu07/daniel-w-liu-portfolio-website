'use client'

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
      className={`fixed right-8 top-1/2 -translate-y-1/2 w-[90%] max-w-md z-40
        transform transition-all duration-500 ease-out
        ${visible ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}
    >
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
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
