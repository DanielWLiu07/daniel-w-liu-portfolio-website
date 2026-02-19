'use client'

import { weddingDayFont } from '@/lib/fonts/wedding-day'

interface NameDisplayProps {
  showImmediately: boolean
}

export function NameDisplay({ showImmediately }: NameDisplayProps) {
  return (
    <div className={`name-container absolute z-[62] top-[38%] sm:top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center will-change-transform ${showImmediately ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex flex-wrap sm:flex-nowrap gap-x-4 items-center justify-center -ml-12 sm:ml-0 max-[431px]:max-w-[280px]">
        <div className="flex gap-4 items-center justify-center">
          <div className={`text-7xl max-[431px]:text-6xl sm:text-9xl tracking-tighter text-stroke-white ${weddingDayFont.className}`}>
            Daniel
          </div>
          <div className={`text-[10rem] max-[431px]:text-[9rem] sm:text-[12rem] tracking-tighter text-stroke-white mt-50 max-[431px]:mt-35 sm:mt-15 -mr-5 ${weddingDayFont.className}`}>
            W
          </div>
        </div>
        <div className={`text-7xl max-[431px]:text-6xl sm:text-9xl tracking-tighter text-stroke-white -mt-60 max-[431px]:-mt-50 sm:mt-0 max-[431px]:-ml-8 ${weddingDayFont.className}`}>
          Liu
        </div>
      </div>
      <div className={`text-xl max-[431px]:text-lg sm:text-3xl tracking-wide text-stroke-white-sm -mt-20 sm:-mt-25 text-center font-bold whitespace-nowrap ${weddingDayFont.className}`}>
        Waterloo CS and Finance Double Major
      </div>
    </div>
  )
}
