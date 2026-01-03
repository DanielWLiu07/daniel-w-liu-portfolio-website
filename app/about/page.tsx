"use client";

import { useState } from 'react';
import localFont from 'next/font/local';
import { TechStack } from "@/components/about/tech-stack";
import { BackgroundLayers } from "@/components/about/background-layers";
import { MobileBackground } from "@/components/about/mobile-background";
import { SocialLinksImages } from "@/components/about/social-links-images";

const katieRoze = localFont({
  src: '../../public/shared/fonts/Katie Roze Watercolour Font - By Lef/KatieRoze.otf',
  display: 'swap',
});

const INFO_ITEMS = [
  "0 University of Waterloo - Computer Science and Finance Double Major (2025 - Present)",
  "0 45/45 Final IB Score (Top 0.1% Global)",
  "0 Fullstack and ML - Jack of All Trades",
  "0 Hobbies: Rock Climbing, Brawl Stars, Riot Games, Pingpong, Pokemon, Calisthenics, Game Dev.",
];

export default function About() {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <>
      {!isLoaded && (
        <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
            <p className={`text-2xl text-white ${katieRoze.className}`}>Loading...</p>
          </div>
        </div>
      )}

      <div className={`relative w-full min-h-screen ${!isLoaded ? 'opacity-0' : 'opacity-100'}`}>
        <BackgroundLayers onLoaded={() => setIsLoaded(true)} />
        <MobileBackground />

        <div className="relative z-10 flex flex-col md:flex-row md:justify-end md:min-h-screen -mt-[300vh] md:mt-0">
          <div className={`w-[85%] mx-auto md:mx-0 md:w-1/2 px-4 md:pl-4 pb-5 flex flex-col justify-start md:min-h-0 pt-8 ${katieRoze.className}`}>
            <div className="overflow-visible -space-y-6 md:-space-y-8 max-w-sm md:max-w-none">
              <h1 className="text-7xl md:text-9xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-32 py-2">
                Daniel W Liu
              </h1>
              <p className="text-3xl bg-gradient-to-r from-blue-800 to-purple-800 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                Software Engineer & ML Developer
              </p>
            </div>

            <div className="pl-3 md:pl-2 text-black text-xl md:text-3xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] max-w-sm md:max-w-none bg-white/60 xl:bg-transparent p-3 xl:p-0 rounded-lg xl:rounded-none">
              {INFO_ITEMS.map((info, index) => (
                <p key={index} className="text-2xl md:text-4xl md:max-w-lg text-stroke-white-xs">
                  {info}
                </p>
              ))}
            </div>

            <TechStack />
          </div>
        </div>

        <SocialLinksImages />
      </div>
    </>
  );
}
