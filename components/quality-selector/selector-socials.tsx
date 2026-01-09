import { forwardRef } from 'react'
import Image from 'next/image'

const SOCIAL_LINKS = [
  { href: 'https://github.com/DanielWLiu07', label: 'GitHub', image: '/about/images/github.png' },
  { href: 'https://www.linkedin.com/in/danielliu2007/', label: 'LinkedIn', image: '/about/images/linkedln.png' },
  { href: 'https://docs.google.com/forms/d/e/1FAIpQLSdsaj2nXuReGTo1Fu9PaW7jsxUZPpPAiCMuf0gBvmZBYFe1nw/viewform?usp=dialog', label: 'Email', image: '/about/images/gmail.png' },
]

export const SelectorSocials = forwardRef<HTMLDivElement, Record<string, unknown>>(
  (props, ref) => {
    return (
      <svg
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        className="fixed inset-0 z-[80] pointer-events-none"
      >
        <foreignObject width="100%" height="100%">
          <div
            ref={ref}
            className="fixed bottom-20 md:bottom-4 right-4 flex flex-col md:flex-row gap-4 pointer-events-auto opacity-0 origin-center"
          >
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="relative w-14 h-14 transition-all hover:scale-110 duration-200 bg-white/80 rounded-lg p-2 border-2 border-gray-800"
                aria-label={link.label}
              >
                <Image src={link.image} alt={link.label} fill className="object-contain p-1" />
              </a>
            ))}
          </div>
        </foreignObject>
      </svg>
    )
  }
)

SelectorSocials.displayName = 'SelectorSocials'
