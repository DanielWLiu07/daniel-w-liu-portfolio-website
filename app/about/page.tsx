"use client"

import { TechStack } from "@/components/about/tech-stack"
import { BackgroundLayers } from "@/components/about/background-layers"
import { MobileBackground } from "@/components/about/mobile-background"
import { SocialLinksImages } from "@/components/about/social-links-images"
import { useBodyOverflow } from "@/hooks/use-body-overflow"
import { useTransitionState } from "@/components/ui/page-transition"
import { usePerformanceMode } from "@/contexts/performance-mode-context"
import { triggerSvgAnimations } from "@/lib/svg-utils"
import Image from 'next/image'
import { useRef, useState, useEffect } from 'react'
import { mochiFont } from '@/lib/fonts/mochi'

const INFO_ITEMS = [
  "- University of Waterloo - Computer Science and Finance Double Major (2025 - Present)",
  "-  45/45 Final IB Score (Top 0.1% Global)",
  "- Fullstack and ML - Jack of All Trades",
  "- Hobbies: Rock Climbing, Brawl Stars, Riot Games, Pingpong, Pokemon, Calisthenics, Game Dev, Badminton.",
];

export default function About() {
  useBodyOverflow('auto');

  const contentRef = useRef<HTMLDivElement>(null);
  const contentCoverSvgRef = useRef<SVGSVGElement>(null);
  const contentCoverTriggeredRef = useRef(false);
  const [scrollHeight, setScrollHeight] = useState(300);
  const [isMobile, setIsMobile] = useState(false);
  const [safariContentVisible, setSafariContentVisible] = useState(false);

  const { transitionStage } = useTransitionState();
  const { isLowPerformance } = usePerformanceMode();

  const [isSafari] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  });

  // Reset on navigation
  useEffect(() => {
    if (transitionStage === 'loading') {
      contentCoverTriggeredRef.current = false;
      setSafariContentVisible(false);
    }
  }, [transitionStage]);

  // Trigger content reveal animation (slightly delayed after backgrounds)
  useEffect(() => {
    if (isLowPerformance) return;
    if (transitionStage !== 'revealing' && transitionStage !== 'hidden') return;
    if (contentCoverTriggeredRef.current) return;
    contentCoverTriggeredRef.current = true;

    if (isSafari) {
      setTimeout(() => setSafariContentVisible(true), 500);
      return;
    }

    setTimeout(() => {
      triggerSvgAnimations(contentCoverSvgRef.current);
    }, 300);
  }, [transitionStage, isSafari, isLowPerformance]);

  useEffect(() => {
    const updateHeight = () => {
      const mobile = window.innerWidth < 1038;
      setIsMobile(mobile);

      if (contentRef.current && mobile) {
        const contentHeight = contentRef.current.scrollHeight;
        const viewportHeight = window.innerHeight;
        const neededVh = Math.max(200, Math.ceil((contentHeight / viewportHeight) * 100));
        setScrollHeight(neededVh);
      } else {
        setScrollHeight(300);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    setTimeout(updateHeight, 100);

    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-y-auto overflow-x-hidden overscroll-none" style={{ WebkitOverflowScrolling: 'touch' }}>
      <BackgroundLayers />
      <MobileBackground scrollHeight={scrollHeight} />

      <div
        ref={contentRef}
        className="relative z-[20] flex flex-col min-[1038px]:flex-row min-[1038px]:justify-end min-[1038px]:min-h-screen min-[1038px]:mt-0"
        style={{ marginTop: isMobile ? `calc(-${scrollHeight}vh - 4rem)` : '0' }}
      >
        <div className={`w-[95%] mx-auto min-[1038px]:mx-0 min-[1038px]:w-1/2 px-2 min-[1038px]:pl-4 pb-0 flex flex-col justify-start min-[1038px]:min-h-0 pt-8 overflow-visible `}>
          <div className="bg-white/60 xl:bg-transparent p-3 xl:p-0 rounded-lg xl:rounded-none overflow-visible">
            <div className="overflow-visible -space-y-2 min-[1038px]:-space-y-4 w-full">
              <Image
                src="/about/images/katie_daniel_w_liu_v2.webp"
                alt="Daniel W Liu"
                width={1946}
                height={459}
                className="w-[280px] min-[460px]:w-[420px] min-[1038px]:w-[360px] xl:w-[420px] h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
                priority
              />
              <Image
                src="/about/images/katie_subtitle_v2.webp"
                alt="Software Engineer & ML Developer"
                width={3297}
                height={377}
                className="w-[320px] min-[460px]:w-[450px] min-[1038px]:w-[400px] xl:w-[450px] h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
                priority
              />
            </div>

            <div className="pl-3 min-[1038px]:pl-2 text-gray-800 text-xl min-[1038px]:text-3xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] w-full mt-2">
              {INFO_ITEMS.map((info, index) => (
                <p key={index} className={`text-2xl min-[1038px]:text-3xl min-[1038px]:max-w-lg text-stroke-white-xs ${mochiFont.className}`}>
                  {info}
                </p>
              ))}
            </div>

            <TechStack />
          </div>

          <div className="flex flex-col mt-5 mb-0 items-center min-[1038px]:items-start -ml-0 min-[1038px]:-ml-50 overflow-visible">
            <Image
              src="/about/images/cat3.webp"
              alt="Cat"
              width={650}
              height={150}
              className="w-[600px] min-w-[600px] max-w-[600px] flex-shrink-0 min-[1038px]:w-auto min-[1038px]:min-w-[650px] min-[1038px]:max-w-none mb-0"
            />
          </div>
        </div>
      </div>

      <SocialLinksImages />

      {/* Content cover - dissolves with watercolor effect to reveal text */}
      {!isLowPerformance && !isSafari && (
        <svg
          ref={contentCoverSvgRef}
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          className="hidden min-[1038px]:block fixed inset-0 z-[25] pointer-events-none"
        >
          <defs>
            <filter id="contentRevealFilter">
              <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="3" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="200" xChannelSelector="R" yChannelSelector="G">
                <animate attributeName="scale" values="200;490" dur="2.5s" begin="indefinite" calcMode="linear" fill="freeze" />
              </feDisplacementMap>
            </filter>
            <mask id="contentCoverMask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <circle cx="30%" cy="50%" r="0%" fill="black" filter="url(#contentRevealFilter)">
                <animate attributeName="r" values="0%;120%" dur="2.5s" begin="indefinite" calcMode="linear" fill="freeze" />
              </circle>
            </mask>
          </defs>
          <foreignObject width="100%" height="100%" mask="url(#contentCoverMask)" style={{ pointerEvents: 'none' }}>
            <div className="relative w-full h-full pointer-events-none">
              <Image src="/about/images/bg.webp" alt="" fill className="object-cover" />
            </div>
          </foreignObject>
        </svg>
      )}

      {/* Safari fallback - opacity fade */}
      {!isLowPerformance && isSafari && (
        <div
          className={`hidden min-[1038px]:block fixed inset-0 z-[25] pointer-events-none transition-opacity duration-[2s] ease-out ${
            safariContentVisible ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Image src="/about/images/bg.webp" alt="" fill className="object-cover" />
        </div>
      )}
    </div>
  );
}
