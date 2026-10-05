'use client'

import { useCallback, useEffect, useRef } from 'react'
import { SocialLinks } from '@/components/ui/social-links'
import { useTransitionState } from '@/components/ui/page-transition'

// The visual portfolio PDF, one image per page (public/portfolio/pages, rendered
// from public/portfolio/DanielWLiu_Portfolio.pdf): images load fast, lazily and
// at the right size on any screen, where an embedded PDF is slow and awkward on
// phones. NN.webp is 1800px wide, NN-900.webp 900px.
const PAGE_COUNT = 14
const PAGE_WIDTH = 1800
const PAGE_HEIGHT = 2548
const PDF = '/portfolio/DanielWLiu_Portfolio.pdf'
const pages = Array.from({ length: PAGE_COUNT }, (_, i) => String(i + 1).padStart(2, '0'))

export default function PortfolioPage() {
  const { signalReady } = useTransitionState()
  const readyRef = useRef(false)

  // Uncover the page once the cover image is in (or after 4 s regardless).
  const ready = useCallback(() => {
    if (readyRef.current) return
    readyRef.current = true
    signalReady()
  }, [signalReady])
  useEffect(() => {
    const timer = setTimeout(ready, 4000)
    return () => clearTimeout(timer)
  }, [ready])

  return (
    <main className="min-h-screen w-full bg-[#e8e6d6] text-[#1d1d1b]">
      <header className="mx-auto flex max-w-[900px] flex-col items-center gap-4 px-4 pt-28 pb-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Visual Portfolio</h1>
          <p className="mt-1 text-sm opacity-70">Made in Blender. No AI generated graphics.</p>
        </div>
        <a
          href={PDF}
          download
          className="rounded-full border border-[#1d1d1b] px-5 py-2 text-sm font-medium transition-colors hover:bg-[#1d1d1b] hover:text-[#e8e6d6]"
        >
          Download PDF
        </a>
      </header>

      <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-4 pb-24">
        {pages.map((n, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized static pages with their own srcset
          <img
            key={n}
            src={`/portfolio/pages/${n}-900.webp`}
            srcSet={`/portfolio/pages/${n}-900.webp 900w, /portfolio/pages/${n}.webp ${PAGE_WIDTH}w`}
            sizes="(max-width: 932px) calc(100vw - 32px), 900px"
            width={PAGE_WIDTH}
            height={PAGE_HEIGHT}
            alt={`Portfolio page ${i + 1} of ${PAGE_COUNT}`}
            loading={i < 2 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : 'auto'}
            decoding="async"
            onLoad={i === 0 ? ready : undefined}
            onError={i === 0 ? ready : undefined}
            className="h-auto w-full rounded-sm shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
          />
        ))}
      </div>

      <SocialLinks variant="black" />
    </main>
  )
}
