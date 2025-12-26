"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import dynamic from "next/dynamic";
import localFont from 'next/font/local';

const Scene = dynamic(() => import("@/components/three/Scene"), { ssr: false });

const weddingDay = localFont({
    src: '../public/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
});

export default function Home() {
  const rootRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".mountain1", { y: "100%", duration: 1.2, ease: "power3.out", delay: 0.1 });
      gsap.from(".mountain2", { y: "100%", duration: 1.2, ease: "power3.out", delay: 0.2 });
      gsap.from(".mountain3", { y: "100%", duration: 1.2, ease: "power3.out", delay: 0.3 });
      gsap.from(".mountain4", { y: "100%", duration: 1.2, ease: "power3.out", delay: 0.5 });
      gsap.from(".mountain5", { y: "100%", duration: 1.2, ease: "power3.out", delay: 0.4 });
      gsap.from(".mountain6", { y: "100%", duration: 1.2, ease: "power3.out", delay: 0.2 });

      gsap.from(".tree-right", { x: "100%", duration: 1.5, ease: "power3.out", delay: 0.6 });
      gsap.from(".tree-left", { x: "-100%", duration: 1.5, ease: "power3.out", delay: 0.6 });

      gsap.to(".sun-container", {
        y: 40,
        duration: 3,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="relative w-full h-screen bg-[#cacda7] overflow-hidden">
      <div className="absolute inset-0 z-0 mountain1">
        <Image src="/landing_imgs/mountain1.png" alt="Mountain 1" fill className="object-cover" priority />
      </div>

      <div className="absolute inset-0 z-10 mountain2">
        <Image src="/landing_imgs/mountain2.png" alt="Mountain 2" fill className="object-cover" priority />
      </div>

      <div className="absolute inset-0 z-20 mountain3">
        <Image src="/landing_imgs/mountain3.png" alt="Mountain 3" fill className="object-cover" priority />
      </div>

      <div className="absolute inset-0 z-30 mountain4">
        <Image src="/landing_imgs/mountain4.png" alt="Mountain 4" fill className="object-cover" priority />
      </div>

      <div className="absolute inset-0 z-40 mountain5">
        <Image src="/landing_imgs/mountain5.png" alt="Mountain 5" fill className="object-cover" priority />
      </div>

          <div className="absolute inset-0 z-50 mountain6">
            <video src="/dragon_body_24fps.webm" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          </div>

          <div className="absolute inset-0 z-[51] dragon-head">
            <video src="/dragon_head_24fps.webm" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full overflow-visible translate-x-20 sm:translate-x-0 object-cover" />
          </div>

      <div className="sun-container absolute z-50 top-[12.5%] left-1/2 w-[200px] h-[200px] -translate-x-1/2 -translate-y-1/2">
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <defs>
            <filter id="sunFilter">
              <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="10" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="100" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <mask id="sunMask">
              <circle cx="100" cy="100" r="0" fill="white" filter="url(#sunFilter)">
                <animate attributeName="r" from="0" to="200" dur="2s" fill="freeze" />
              </circle>
            </mask>
          </defs>
          <foreignObject width="200" height="200" mask="url(#sunMask)">
            <div className="w-full h-full rounded-full overflow-hidden">
              <video className="w-full h-full object-cover" src="/sun.webm" autoPlay loop muted playsInline />
            </div>
          </foreignObject>
        </svg>
      </div>

      <div className="absolute z-[62] top-[38%] sm:top-[45%] left-1/2 sm:left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
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
        <video className="tree-right absolute top-0 right-0 h-screen w-auto object-cover object-top" src="/tree_right.webm" autoPlay loop muted playsInline />
      </div>

      <div className="fixed inset-0 z-[60] overflow-hidden pointer-events-none">
        <video className="tree-left absolute top-0 left-0 h-screen w-auto object-cover object-top" src="/tree_left.webm" autoPlay loop muted playsInline />
      </div>

      <div className="fixed inset-0 z-[70] pointer-events-none">
        <Scene />
      </div>
    </div>
  );
}
