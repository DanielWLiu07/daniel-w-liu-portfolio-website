import { forwardRef } from 'react'
import localFont from 'next/font/local'

const fredrick = localFont({
  src: '../../public/fonts/FrederickatheGreat-Regular.ttf',
})

interface SelectorTitleProps {
  subtitleRef: React.RefObject<HTMLParagraphElement | null>
}

export const SelectorTitle = forwardRef<HTMLDivElement, SelectorTitleProps>(
  ({ subtitleRef }, ref) => {
    return (
      <div ref={ref} className="text-center space-y-2 opacity-0 relative mt-4 md:mt-0">
        <h2
          className={`text-4xl md:text-7xl text-center tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg relative z-10 whitespace-nowrap ${fredrick.className}`}
          style={{ color: '#2c1810' }}
        >
          Choose Your Journey
        </h2>
        <p
          ref={subtitleRef}
          className={`text-lg md:text-xl text-center tracking-wider text-stroke-white-xs drop-shadow-lg relative z-10 opacity-0 ${fredrick.className}`}
          style={{ color: '#2c1810' }}
        >
          Every Page a New World
        </p>
      </div>
    )
  }
)

SelectorTitle.displayName = 'SelectorTitle'
