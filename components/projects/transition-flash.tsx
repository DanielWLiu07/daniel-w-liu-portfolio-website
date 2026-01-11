'use client'

interface TransitionFlashProps {
  show: boolean
}

export default function TransitionFlash({ show }: TransitionFlashProps) {
  return (
    <div
      className={`absolute inset-0 w-full h-full z-[100] bg-white pointer-events-none transition-opacity duration-500 ${show ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}
