'use client'

interface TransitionFlashProps {
  opacity: number
}

export default function TransitionFlash({ opacity }: TransitionFlashProps) {
  return (
    <div
      className="absolute inset-0 w-full h-full z-[100] bg-white pointer-events-none transition-opacity duration-[400ms] ease-in-out"
      style={{ opacity }}
    />
  )
}
