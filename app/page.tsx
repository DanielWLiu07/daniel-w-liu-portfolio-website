"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import localFont from 'next/font/local';
import Image from 'next/image';
import { SocialLinks } from "@/components/ui/social-links";

const weddingDay = localFont({
  src: '../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
});

export default function Home() {
  const rootRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const timeline = gsap.timeline();

      timeline.from(".name-container", {
        y: "-100vh",
        scale: 1.8,
        duration: 0.6,
        ease: "power2.in",
      });

      timeline.to(".name-container", {
        scale: 0.92,
        duration: 0.1,
        ease: "power2.out",
      }, "-=0.05");

      timeline.to(".name-container", {
        scale: 1,
        duration: 0.4,
        ease: "elastic.out(1.2, 0.4)",
      });

      gsap.from(".tree-right", { x: "100%", duration: 1.5, ease: "power3.out", delay: 1.5 });
      gsap.from(".tree-left", { x: "-100%", duration: 1.5, ease: "power3.out", delay: 1.5 });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="relative w-full h-screen overflow-hidden">
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <Image src="/landing/images/painted_bg.png" alt="painted background" fill className="object-cover" priority />
        <video src="/landing/videos/landing_composite.webm" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
      </div>

      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 w-full h-full z-0">
        <defs>
          <filter id="bgFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="8" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
              <animate
                attributeName="scale"
                values="200;490"
                dur="3s"
                begin="0.5s"
                calcMode="spline"
                keySplines="0.2 0.8 0.3 1"
                fill="freeze"
              />
            </feDisplacementMap>
          </filter>
          <mask id="bgMask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect x="50%" y="50%" width="0%" height="0%" fill="black" filter="url(#bgFilter)">
              <animate
                attributeName="x"
                values="50%;6.75%"
                dur="3s"
                begin="0.5s"
                calcMode="spline"
                keySplines="0.2 0.8 0.3 1"
                fill="freeze"
              />
              <animate
                attributeName="y"
                values="50%;3.75%"
                dur="3s"
                begin="0.5s"
                calcMode="spline"
                keySplines="0.2 0.8 0.3 1"
                fill="freeze"
              />
              <animate
                attributeName="width"
                values="0%;87%"
                dur="3s"
                begin="0.5s"
                calcMode="spline"
                keySplines="0.2 0.8 0.3 1"
                fill="freeze"
              />
              <animate
                attributeName="height"
                values="0%;92%"
                dur="3s"
                begin="0.5s"
                calcMode="spline"
                keySplines="0.2 0.8 0.3 1"
                fill="freeze"
              />
            </rect>
          </mask>
        </defs>
        <foreignObject width="100%" height="100%" mask="url(#bgMask)">
          <div className="relative w-full h-full overflow-hidden">
            <Image src="/landing/images/white_paper.png" alt="white paper background" fill className="object-cover" priority />
          </div>
        </foreignObject>
      </svg>

      <div className="name-container absolute z-[62] top-[38%] sm:top-[45%] left-1/2 sm:left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
        <div className="flex flex-wrap sm:flex-nowrap gap-x-4 items-center sm:items-center justify-center -ml-12 sm:ml-0">
          <div className="flex gap-4 items-center justify-center">
            <div className={`text-8xl sm:text-9xl tracking-tighter text-stroke-white ${weddingDay.className}`}>
              Daniel
            </div>
            <div className={`text-[11rem] sm:text-[12rem] tracking-tighter text-stroke-white mt-50 sm:mt-15 -mr-5 ${weddingDay.className}`}>
              W
            </div>
          </div>
          <div className={`text-8xl sm:text-9xl tracking-tighter text-stroke-white -mt-60 sm:mt-0 ${weddingDay.className}`}>
            Liu
          </div>
        </div>
        <div className={`text-2xl sm:text-3xl tracking-wide text-stroke-white-sm -mt-20 sm:-mt-25 text-center font-bold whitespace-nowrap ${weddingDay.className}`}>
          Waterloo CS and Finance Double Major
        </div>
      </div>

      <div className="fixed inset-0 z-[65] overflow-hidden pointer-events-none">
        <video className="tree-right absolute top-0 right-0 h-screen w-auto object-cover object-top" src="/landing/videos/tree_right.webm" autoPlay loop muted playsInline />
      </div>

      <div className="fixed inset-0 z-[60] overflow-hidden pointer-events-none">
        <video className="tree-left absolute top-0 left-0 h-screen w-auto object-cover object-top" src="/landing/videos/tree_left.webm" autoPlay loop muted playsInline />
      </div>

      <SocialLinks variant="black" />
    </div>
  );
}
