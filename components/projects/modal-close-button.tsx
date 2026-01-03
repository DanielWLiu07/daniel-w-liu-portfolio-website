interface ModalCloseButtonProps {
  onClick: () => void
}

export function ModalCloseButton({ onClick }: ModalCloseButtonProps) {
  return (
    <button
      onClick={onClick}
      className="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-3 z-10 shadow-lg transition-all hover:scale-110"
    >
      <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )
}
