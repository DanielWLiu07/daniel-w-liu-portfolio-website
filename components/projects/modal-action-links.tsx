interface ModalActionLinksProps {
  link?: string
  github?: string
}

export function ModalActionLinks({ link, github }: ModalActionLinksProps) {
  if (!link && !github) return null

  return (
    <div className="flex gap-4 mt-8">
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-blue-500 text-white text-center py-4 rounded-lg hover:bg-blue-600 transition-colors text-lg font-medium"
        >
          View Live Project
        </a>
      )}
      {github && (
        <a
          href={github}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-gray-800 text-white text-center py-4 rounded-lg hover:bg-gray-900 transition-colors text-lg font-medium"
        >
          View on GitHub
        </a>
      )}
    </div>
  )
}
