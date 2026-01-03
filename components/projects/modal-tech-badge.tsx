interface ModalTechBadgeProps {
  technologies: string[]
}

export function ModalTechBadge({ technologies }: ModalTechBadgeProps) {
  return (
    <div className="mb-6">
      <h3 className="text-xl font-semibold text-gray-800 mb-3">Technologies Used:</h3>
      <div className="flex flex-wrap gap-3">
        {technologies.map((tech, idx) => (
          <span
            key={idx}
            className="px-4 py-2 rounded-full text-sm font-medium bg-blue-200/40 text-blue-400/70"
          >
            {tech}
          </span>
        ))}
      </div>
    </div>
  )
}
