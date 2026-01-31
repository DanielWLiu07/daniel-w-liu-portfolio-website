import Image from 'next/image'
import { socialLinksImageData } from '@/data/social-links'

export function SocialLinksImages() {
  return (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-row gap-4">
      {socialLinksImageData.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="relative w-14 h-14 transition-all hover:scale-110 duration-200"
          aria-label={link.label}
        >
          <Image
            src={link.image}
            alt={link.label}
            fill
            className="object-contain"
          />
        </a>
      ))}
    </div>
  )
}
