'use client'

interface TransitionFlashProps {
  show: boolean
  fading: boolean
}

export default function TransitionFlash({ show, fading }: TransitionFlashProps) {
  if (!show && !fading) return null

  return (
    <div
      className="fixed inset-0 w-screen h-screen z-[9999] bg-white pointer-events-none"
      style={{
        opacity: fading ? 0 : 1,
        transition: fading ? 'opacity 800ms ease-in-out' : 'none',
      }}
    />
  )
}
