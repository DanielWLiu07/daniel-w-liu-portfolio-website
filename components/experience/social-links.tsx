import { memo } from 'react'
import { socialLinksData } from '@/components/ui/social-links-data'

export const SocialLinks = memo(function SocialLinks() {
  return (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-row gap-4 pointer-events-auto">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="social-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="50%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#facc15" />
          </linearGradient>
        </defs>
      </svg>
      {socialLinksData.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="w-14 h-14 rounded-xl backdrop-blur-sm bg-white/20 hover:bg-white/30 border-2 border-purple-400/60 hover:border-pink-400/80 transition-all hover:scale-110 duration-300 flex items-center justify-center shadow-lg hover:shadow-xl"
          aria-label={link.label}
        >
          <svg
            className={`${link.label === 'LinkedIn' ? 'w-10 h-10' : 'w-14 h-14'} drop-shadow-md`}
            fill="none"
            stroke="url(#social-gradient)"
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
