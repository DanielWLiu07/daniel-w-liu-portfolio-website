'use client'

interface TransitionFlashProps {
  show: boolean
}

export default function TransitionFlash({ show }: TransitionFlashProps) {
  return (
    <div
      className="fixed inset-0 w-screen h-screen z-[9999] bg-white pointer-events-none"
      style={{
        opacity: show ? 1 : 0,
        transition: 'opacity 500ms ease-out',
        willChange: 'opacity',
        transform: 'translateZ(0)',
      }}
    />
  )
}
