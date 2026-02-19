'use client'

import { forwardRef } from 'react'
import { frederickaFont } from '@/lib/fonts/frederica'

export const HelperText = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div
      ref={ref}
      className="fixed bottom-8 left-0 right-0 z-[100] flex items-center justify-center px-4 opacity-0"
    >
      <p
        className={`text-sm md:text-base lg:text-base text-center max-w-[90%] md:max-w-2xl tracking-wider text-stroke-white-xs drop-shadow-lg text-[#2c1810] ${frederickaFont.className}`}
      >
        Don&apos;t worry, you can always change this later by returning to the landing page
      </p>
    </div>
  )
})

HelperText.displayName = 'HelperText'
