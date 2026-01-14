"use client";

import localFont from 'next/font/local';
import { TechStack } from "@/components/about/tech-stack";
import { BackgroundLayers } from "@/components/about/background-layers";
import { MobileBackground } from "@/components/about/mobile-background";
import { SocialLinksImages } from "@/components/about/social-links-images";
import { useBodyOverflow } from "@/hooks/use-body-overflow";
import Image from 'next/image';
import { useRef, useState, useEffect } from 'react';

const mochi = localFont({
  src: '../../public/fonts/MochibopBold-Demo.ttf',
});

const katieRoze = localFont({
  src: '../../public/shared/fonts/Katie Roze Watercolour Font - By Lef/KatieRoze.otf',
  display: 'swap',
});

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
        // Calculate how many viewport heights we need (minimum 200vh)
        const neededVh = Math.max(200, Math.ceil((contentHeight / viewportHeight) * 100));
        setScrollHeight(neededVh);
      } else {
        setScrollHeight(300); // Default for desktop
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    // Also update after fonts load
    setTimeout(updateHeight, 100);

    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // BackgroundLayers signals ready when videos are loaded

  return (
    <div className="relative w-full max-h-screen min-[1038px]:max-h-none overflow-y-auto overflow-x-hidden min-[1038px]:overflow-visible overscroll-y-none overscroll-x-none">
      <BackgroundLayers />
      <MobileBackground scrollHeight={scrollHeight} />

      <div
        ref={contentRef}
        className="relative z-[20] flex flex-col min-[1038px]:flex-row min-[1038px]:justify-end min-[1038px]:min-h-screen min-[1038px]:mt-0"
        style={{ marginTop: isMobile ? `calc(-${scrollHeight}vh - 4rem)` : '0' }}
      >
        <div className={`w-[95%] mx-auto min-[1038px]:mx-0 min-[1038px]:w-1/2 px-2 min-[1038px]:pl-4 pb-0 flex flex-col justify-start min-[1038px]:min-h-0 pt-8 overflow-visible ${katieRoze.className}`}>
          <div className="bg-white/60 xl:bg-transparent p-3 xl:p-0 rounded-lg xl:rounded-none">
            <div className="overflow-visible -space-y-6 min-[1038px]:-space-y-8 max-w-sm min-[1038px]:max-w-none">
              <h1 className="text-8xl lg:text-9xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-32 py-2 whitespace-nowrap">
                Daniel W Liu
              </h1>
              <p className="text-3xl bg-gradient-to-r from-blue-800 to-purple-800 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                Software Engineer & ML Developer
              </p>
            </div>

            <div className="pl-3 min-[1038px]:pl-2 text-black text-xl min-[1038px]:text-3xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] max-w-sm min-[1038px]:max-w-none mt-2">
              {INFO_ITEMS.map((info, index) => (
                <p key={index} className={`text-2xl min-[1038px]:text-3xl min-[1038px]:max-w-lg text-stroke-white-xs ${mochi.className}`}>
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
