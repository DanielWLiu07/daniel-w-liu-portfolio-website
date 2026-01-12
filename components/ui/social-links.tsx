import { memo } from 'react'
import { socialLinksData } from '@/data/social-links'

interface SocialLinksProps {
  variant?: 'white' | 'black'
  className?: string
}

export const SocialLinks = memo(function SocialLinks({ variant = 'white', className = '' }: SocialLinksProps) {
  const isBlack = variant === 'black'

  return (
    <div className={`fixed bottom-4 right-4 z-[80] flex flex-row gap-4 pointer-events-auto ${className}`}>
      {socialLinksData.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-14 h-14 rounded-xl backdrop-blur-sm border-2 transition-all hover:scale-110 duration-300 flex items-center justify-center shadow-lg hover:shadow-xl ${
            isBlack
              ? 'bg-white/20 hover:bg-white/30 border-black/40 hover:border-black/60'
              : 'bg-black/20 hover:bg-black/30 border-white/40 hover:border-white/60'
          }`}
          aria-label={link.label}
        >
          <svg
            className={`${link.label === 'LinkedIn' ? 'w-10 h-10' : 'w-14 h-14'} drop-shadow-md ${isBlack ? 'text-black' : 'text-white'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            {link.icon}
          </svg>
        </a>
      ))}
    </div>
  );
})
