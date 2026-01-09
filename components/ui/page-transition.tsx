'use client'

// Page transition component with SVG mask animations
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import localFont from 'next/font/local'
import { useMobile } from '@/hooks/use-mobile'

const weddingDay = localFont({
  src: '../../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
})

type TransitionStage = 'idle' | 'fade-out' | 'loading' | 'fade-in'

const TransitionContext = createContext<{ transitionStage: TransitionStage }>({ transitionStage: 'idle' })

export function useTransitionState() {
  return useContext(TransitionContext)
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [transitionStage, setTransitionStage] = useState<TransitionStage>('idle')
  const prevPathname = useRef(pathname)
  const svgMaskOutRef = useRef<SVGAnimateElement>(null)
  const svgMaskInRef = useRef<SVGAnimateElement>(null)
  const isMobile = useMobile(768)

  // Responsive mask dimensions
  const maskWidth = isMobile ? "95%" : "87%"
  const maskX = isMobile ? "2.5%" : "6.5%"

  // Handle when pathname actually changes (after navigation completes)
  useEffect(() => {
    if (pathname !== prevPathname.current && transitionStage === 'loading') {
      // New page has loaded, start fade-in
      setTransitionStage('fade-in')

      // Trigger fade-in animation
      setTimeout(() => {
        svgMaskInRef.current?.beginElement()
        const inAnimations = document.querySelectorAll('#transitionMaskIn animate')
        inAnimations.forEach((anim) => {
          (anim as SVGAnimateElement).beginElement()
        })
      }, 50)

      // End transition after fade-in completes
      setTimeout(() => {
        setTransitionStage('idle')
        prevPathname.current = pathname
      }, 1550) // 1.5s fade-in animation
    }
  }, [pathname, transitionStage])

  // Global navigation interceptor
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Skip if already transitioning
      if (transitionStage !== 'idle') {
        e.preventDefault()
        return
      }

      const target = e.target as HTMLElement
      const link = target.closest('a')

      if (!link) return

      const href = link.getAttribute('href')

      // Only intercept internal links
      if (!href || href.startsWith('http') || href.startsWith('#') || href === pathname) {
        return
      }

      // Skip transition for projects page
      if (href === '/projects') {
        return
      }

      // Prevent default navigation
      e.preventDefault()

      // Start fade-out transition
      setTransitionStage('fade-out')

      // Trigger fade-out animation
      setTimeout(() => {
        svgMaskOutRef.current?.beginElement()
        const outAnimations = document.querySelectorAll('#transitionMaskOut animate')
        outAnimations.forEach((anim) => {
          (anim as SVGAnimateElement).beginElement()
        })
      }, 0)

      // After fade-out completes, navigate
      setTimeout(() => {
        setTransitionStage('loading')
        router.push(href)
      }, 1500) // 1.5s fade-out animation
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [pathname, router, transitionStage])

  return (
    <TransitionContext.Provider value={{ transitionStage }}>
      {children}

      {/* Fade-Out Transition (reveal paper bg) */}
      {(transitionStage === 'fade-out' || transitionStage === 'loading') && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          {/* SVG Mask Animation - Fade Out (hide current page content, reveal paper) */}
          <svg
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute inset-0 w-full h-full"
          >
            <defs>
              <filter id="transitionFilterOut" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.01"
                  numOctaves="6"
                  result="noise"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="noise"
                  scale="200"
                  xChannelSelector="R"
                  yChannelSelector="G"
                >
                  <animate
                    ref={svgMaskOutRef}
                    attributeName="scale"
                    values="200;490"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                </feDisplacementMap>
              </filter>
              <mask id="transitionMaskOut">
                <rect x="0" y="0" width="100%" height="100%" fill="black" />
                <rect
                  x="50%"
                  y="50%"
                  width="0%"
                  height="0%"
                  fill="white"
                  filter="url(#transitionFilterOut)"
                >
                  <animate
                    attributeName="x"
                    values="50%;-25%"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                  <animate
                    attributeName="y"
                    values="50%;-25%"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                  <animate
                    attributeName="width"
                    values="0%;150%"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                  <animate
                    attributeName="height"
                    values="0%;150%"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                </rect>
              </mask>
            </defs>
            <foreignObject width="100%" height="100%" mask="url(#transitionMaskOut)">
              <div className="relative w-full h-full overflow-hidden">
                <Image
                  src="/landing/images/white_paper.png"
                  alt="transition background"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </foreignObject>
          </svg>

          {/* Loading text - only show during loading stage */}
          {transitionStage === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="w-16 h-16 border-4 border-gray-800 border-t-transparent rounded-full animate-spin" />
                <p className={`text-2xl text-gray-800 ${weddingDay.className}`}>
                  Loading...
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fade-In Transition (hide paper bg, reveal new page) */}
      {transitionStage === 'fade-in' && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          {/* SVG Mask Animation - Fade In (hide paper, reveal new page content) */}
          <svg
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute inset-0 w-full h-full"
          >
            <defs>
              <filter id="transitionFilterIn" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.01"
                  numOctaves="6"
                  result="noise"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="noise"
                  scale="490"
                  xChannelSelector="R"
                  yChannelSelector="G"
                >
                  <animate
                    ref={svgMaskInRef}
                    attributeName="scale"
                    values="490;200"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                </feDisplacementMap>
              </filter>
              <mask id="transitionMaskIn">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect
                  x="50%"
                  y="50%"
                  width="0%"
                  height="0%"
                  fill="black"
                  filter="url(#transitionFilterIn)"
                >
                  <animate
                    attributeName="x"
                    values="50%;-25%"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                  <animate
                    attributeName="y"
                    values="50%;-25%"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                  <animate
                    attributeName="width"
                    values="0%;150%"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                  <animate
                    attributeName="height"
                    values="0%;150%"
                    dur="1.5s"
                    begin="indefinite"
                    calcMode="spline"
                    keySplines="0.2 0.8 0.3 1"
                    fill="freeze"
                  />
                </rect>
              </mask>
            </defs>
            <foreignObject width="100%" height="100%" mask="url(#transitionMaskIn)">
              <div className="relative w-full h-full overflow-hidden">
                <Image
                  src="/landing/images/white_paper.png"
                  alt="transition background"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </foreignObject>
          </svg>
        </div>
      )}
    </TransitionContext.Provider>
  )
}
