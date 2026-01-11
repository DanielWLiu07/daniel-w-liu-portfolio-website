'use client'

import Image from 'next/image'
import { forwardRef } from 'react'

const SOCIAL_LINKS = [
  { href: "https://github.com/DanielWLiu07", label: "GitHub", image: "/about/images/github.png" },
  { href: "https://www.linkedin.com/in/danielliu2007/", label: "LinkedIn", image: "/about/images/linkedln.png" },
  { href: "https://docs.google.com/forms/d/e/1FAIpQLSdsaj2nXuReGTo1Fu9PaW7jsxUZPpPAiCMuf0gBvmZBYFe1nw/viewform?usp=dialog", label: "Email", image: "/about/images/gmail.png" },
]

export const SocialLinks = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="fixed bottom-20 md:bottom-4 right-4 z-[300] flex flex-col md:flex-row gap-4 opacity-0">
      {SOCIAL_LINKS.map((link) => (
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
