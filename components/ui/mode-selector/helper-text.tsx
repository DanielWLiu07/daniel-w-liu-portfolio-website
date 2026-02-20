'use client'

import { forwardRef } from 'react'
import { frederickaFont } from '@/lib/fonts/frederica'

export const HelperText = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div
      ref={ref}
      className="flex items-center justify-center opacity-0"
    >
      <p
        className={`text-sm md:text-base lg:text-base text-center max-w-[90%] md:max-w-md lg:max-w-2xl tracking-wider text-stroke-white-xs drop-shadow-lg font-bold text-[#2c1810] ${frederickaFont.className}`}
      >
        Don&apos;t worry, you can always change this later by returning to the landing page
      </p>
    </div>
  )
})

HelperText.displayName = 'HelperText'
