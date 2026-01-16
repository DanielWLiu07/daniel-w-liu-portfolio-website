'use client'

import Image from 'next/image'
import { forwardRef } from 'react'
import { socialLinksImageData } from '@/data/social-links'

export const SocialLinks = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="fixed bottom-20 md:bottom-4 right-4 z-[300] flex flex-col md:flex-row gap-4 opacity-0">
      {socialLinksImageData.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          className="relative w-14 h-14 bg-white/80 rounded-lg p-2 border-2 border-gray-800 hover:scale-110 transition-transform duration-200 will-change-transform"
        >
          <Image
            src={link.image}
            alt={link.label}
            fill
            className="object-contain p-1"
          />
        </a>
      ))}
    </div>
  )
})

SocialLinks.displayName = 'SocialLinks'
