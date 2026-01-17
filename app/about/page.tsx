"use client"

import { TechStack } from "@/components/about/tech-stack"
import { BackgroundLayers } from "@/components/about/background-layers"
import { MobileBackground } from "@/components/about/mobile-background"
import { SocialLinksImages } from "@/components/about/social-links-images"
import { useBodyOverflow } from "@/hooks/use-body-overflow"
import Image from 'next/image'
import { useRef, useState, useEffect } from 'react'
import { mochiFont, katieRozeFont } from '@/lib/fonts'

const INFO_ITEMS = [
  "- University of Waterloo - Computer Science and Finance Double Major (2025 - Present)",
  "-  45/45 Final IB Score (Top 0.1% Global)",
  "- Fullstack and ML - Jack of All Trades",
  "- Hobbies: Rock Climbing, Brawl Stars, Riot Games, Pingpong, Pokemon, Calisthenics, Game Dev.",
];

export default function About() {
  useBodyOverflow('auto');

  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollHeight, setScrollHeight] = useState(300);
  const [isMobile, setIsMobile] = useState(false);

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
    <div className="relative w-full max-h-screen min-[1038px]:max-h-screen xl:max-h-none overflow-y-auto overflow-x-hidden min-[1038px]:overflow-hidden xl:overflow-visible overscroll-y-none overscroll-x-none">
      <BackgroundLayers />
      <MobileBackground scrollHeight={scrollHeight} />

      <div
        ref={contentRef}
        className="relative z-[20] flex flex-col min-[1038px]:flex-row min-[1038px]:justify-end min-[1038px]:min-h-screen min-[1038px]:mt-0"
        style={{ marginTop: isMobile ? `calc(-${scrollHeight}vh - 4rem)` : '0' }}
      >
        <div className={`w-[95%] mx-auto min-[1038px]:mx-0 min-[1038px]:w-1/2 px-2 min-[1038px]:pl-4 pb-0 flex flex-col justify-start min-[1038px]:min-h-0 pt-8 overflow-visible ${katieRozeFont.className}`}>
          <div className="bg-white/60 xl:bg-transparent p-3 xl:p-0 rounded-lg xl:rounded-none overflow-visible">
            <div className="overflow-visible -space-y-6 min-[1038px]:-space-y-8 w-full">
              <h1 className="font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-32 py-2 whitespace-nowrap">
                <span className="text-7xl min-[460px]:text-9xl min-[1038px]:text-8xl xl:text-9xl">Daniel</span>
                <span className="text-7xl min-[460px]:text-9xl min-[1038px]:text-8xl xl:text-9xl"> W </span>
                <span className="text-7xl min-[460px]:text-9xl min-[1038px]:text-8xl xl:text-9xl">Liu</span>
              </h1>
              <p className="text-3xl bg-gradient-to-r from-blue-800 to-purple-800 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                Software Engineer & ML Developer
              </p>
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
              src="/about/images/cat3.png"
              alt="Cat"
              width={650}
              height={150}
              className="w-[600px] min-w-[600px] max-w-[600px] flex-shrink-0 min-[1038px]:w-auto min-[1038px]:min-w-[650px] min-[1038px]:max-w-none mb-0"
            />
          </div>
        </div>
      </div>

      <SocialLinksImages />
    </div>
  );
}
