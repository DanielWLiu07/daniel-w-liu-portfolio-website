interface SocialLink {
  href: string;
  label: string;
  icon: JSX.Element;
}

const links: SocialLink[] = [
  {
    href: "https://github.com/DanielWLiu07",
    label: "GitHub",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
      />
    ),
  },
  {
    href: "https://www.linkedin.com/in/danielliu2007/",
    label: "LinkedIn",
    icon: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"
        />
        <circle cx="4" cy="4" r="2" strokeWidth={2} />
      </>
    ),
  },
  {
    href: "https://docs.google.com/forms/d/e/1FAIpQLSdsaj2nXuReGTo1Fu9PaW7jsxUZPpPAiCMuf0gBvmZBYFe1nw/viewform?usp=dialog",
    label: "Email",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    ),
  },
];

interface SocialLinksProps {
  variant?: 'white' | 'black';
}

export function SocialLinks({ variant = 'white' }: SocialLinksProps) {
  const isBlack = variant === 'black';

  return (
    <div className="fixed bottom-8 right-8 z-[80] flex flex-row gap-4 pointer-events-auto">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-14 h-14 rounded-lg backdrop-blur-sm border-2 transition-all hover:scale-110 duration-200 flex items-center justify-center ${
            isBlack
              ? 'bg-black/10 border-black/30 hover:bg-black/20'
              : 'bg-white/10 border-white/30 hover:bg-white/20'
          }`}
          aria-label={link.label}
        >
          <svg
            className={`w-8 h-8 ${isBlack ? 'text-black' : 'text-white'}`}
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
}
