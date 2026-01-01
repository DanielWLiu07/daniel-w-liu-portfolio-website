"use client";

import Image from "next/image";
import localFont from 'next/font/local';
import { useState } from 'react';
import { TechStack } from "@/components/about/tech-stack";

const katieRoze = localFont({
  src: '../../public/shared/fonts/Katie Roze Watercolour Font - By Lef/KatieRoze.otf',
});

const socialLinks = [
  { href: "https://github.com/DanielWLiu07", label: "GitHub", image: "/about/images/github.png" },
  { href: "https://www.linkedin.com/in/danielliu2007/", label: "LinkedIn", image: "/about/images/linkedln.png" },
  { href: "https://docs.google.com/forms/d/e/1FAIpQLSdsaj2nXuReGTo1Fu9PaW7jsxUZPpPAiCMuf0gBvmZBYFe1nw/viewform?usp=dialog", label: "Email", image: "/about/images/gmail.png" },
];

const personalInfo = [
  "0 University of Waterloo - Computer Science and Finance Double Major (2025 - Present)",
  "0 45/45 Final IB Score (Top 0.1% Global)",
  "0 Fullstack and ML - Jack of All Trades",
  "0 Hobbies: Rock Climbing, Brawl Stars, Riot Games, Pingpong, Pokemon, Calisthenics, Game Dev.",
];

export default function About() {
  const [sparkleDone, setSparkleDone] = useState(false);

  return (
    <div className="relative w-full min-h-screen">
      <div className="hidden md:block fixed inset-0 z-0">
        <video src="/about/videos/water_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-bottom" />
      </div>

      <div className="hidden md:block fixed inset-0 z-10">
        {!sparkleDone ? (
          <video src="/about/videos/sparkle_being.webm" autoPlay muted playsInline onEnded={() => setSparkleDone(true)} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <video src="/about/videos/sparkle_loop.webm?v=2" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
        )}
      </div>

      <div className="hidden md:block fixed inset-0 z-0">
        <video src="/about/videos/right_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" />
      </div>

      <div className="hidden md:block fixed inset-0 z-0">
        <Image src="/about/images/right_graphics.png" alt="Water Colour Graphics" fill className="object-cover object-right-top" priority />
      </div>

      <section className="md:hidden relative h-screen">
        <video src="/about/videos/water_colour.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-0" />
        {!sparkleDone ? (
          <video src="/about/videos/sparkle_being.webm" autoPlay muted playsInline onEnded={() => setSparkleDone(true)} className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-10" />
        ) : (
          <video src="/about/videos/sparkle_loop.webm?v=2" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover object-[10%_100%] z-10" />
        )}
      </section>

      <section className="md:hidden relative h-[300vh]">
        <div className="sticky top-0 h-screen">
          <video src="/about/videos/right_colour_phone.webm" autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover object-right" />
          <Image src="/about/images/right_graphics.png" alt="Water Colour Graphics" fill className="object-cover object-right-top" priority />
        </div>
      </section>

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

          <div className="pl-3 md:pl-2 text-black text-xl md:text-3xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] max-w-sm md:max-w-none bg-white/40 xl:bg-transparent p-3 xl:p-0 rounded-lg xl:rounded-none backdrop-blur-sm xl:backdrop-blur-none">
            {personalInfo.map((info, index) => (
              <p key={index} className="text-2xl md:text-4xl md:max-w-lg text-stroke-white-xs">
                {info}
              </p>
            ))}
          </div>

          <TechStack />
        </div>
      </div>

      <div className="fixed bottom-4 right-3 z-[80] flex flex-row gap-2.5 pointer-events-auto">
        {socialLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="relative w-10 h-10 transition-all hover:scale-110 duration-200"
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
    </div>
  );
}
