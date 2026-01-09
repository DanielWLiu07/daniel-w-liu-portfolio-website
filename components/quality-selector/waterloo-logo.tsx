import { forwardRef } from 'react'
import Image from 'next/image'

export const WaterlooLogo = forwardRef<HTMLDivElement, Record<string, never>>(
  (props, ref) => {
    return (
      <div
        ref={ref}
        className="fixed left-0 bottom-15 md:bottom-0 h-[25vh] md:h-[30vh] opacity-0 overflow-visible z-[90] ml-2 mb-2 will-change-transform"
      >
        <a
          href="https://uwaterloo.ca"
          target="_blank"
          rel="noopener noreferrer"
          className="block h-full w-full group cursor-pointer"
          aria-label="University of Waterloo"
        >
          <div className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-110 -rotate-[35deg]">
            <Image
              src="/quality/images/waterloo_outline.png"
              alt="Waterloo"
              width={300}
              height={1200}
              className="h-full w-auto object-contain brightness-105 saturate-[1.15] contrast-105"
            />
          </div>
        </a>
      </div>
    )
  }
)

WaterlooLogo.displayName = 'WaterlooLogo'
