import Image from 'next/image'

interface SocialLink {
  href: string
  label: string
  image: string
}

const SOCIAL_LINKS: SocialLink[] = [
  { href: "https://github.com/DanielWLiu07", label: "GitHub", image: "/about/images/github.png" },
  { href: "https://www.linkedin.com/in/danielliu2007/", label: "LinkedIn", image: "/about/images/linkedln.png" },
  { href: "https://docs.google.com/forms/d/e/1FAIpQLSdsaj2nXuReGTo1Fu9PaW7jsxUZPpPAiCMuf0gBvmZBYFe1nw/viewform?usp=dialog", label: "Email", image: "/about/images/gmail.png" },
]

export function SocialLinksImages() {
  return (
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="fixed inset-0 z-[80] pointer-events-none">
      <foreignObject width="100%" height="100%" mask="url(#socialMask)">
        <div className="fixed bottom-4 right-4 flex flex-row gap-4 pointer-events-auto">
          {SOCIAL_LINKS.map((link) => (
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
      </foreignObject>
    </svg>
  )
}
