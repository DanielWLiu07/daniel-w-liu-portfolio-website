"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import localFont from 'next/font/local';
import Image from 'next/image';
import { SocialLinks } from "@/components/ui/social-links";
import { useMobile } from "@/hooks/use-mobile";
import { useBodyOverflow } from "@/hooks/use-body-overflow";
import { usePerformanceMode } from "@/contexts/performance-mode-context";
import { ModeSelector } from "@/components/ui/mode-selector";

const weddingDay = localFont({
  src: '../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
});

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false);
  const rootRef = useRef(null);
  const compositeVideoRef = useRef<HTMLVideoElement>(null);
  const treeRightRef = useRef<HTMLVideoElement>(null);
  const treeLeftRef = useRef<HTMLVideoElement>(null);
  const loadedCalledRef = useRef(false);
  const videosReady = useRef({ composite: false, treeRight: false, treeLeft: false });
  const isMobile = useMobile();
  const { mode, isLowPerformance } = usePerformanceMode();
  useBodyOverflow('hidden');

  const handleAssetLoad = () => {
    if (loadedCalledRef.current) return;
    loadedCalledRef.current = true;
    setTimeout(() => setIsLoaded(true), 0);
  };

  const checkAllVideosReady = () => {
    if (videosReady.current.composite && videosReady.current.treeRight && videosReady.current.treeLeft) {
      handleAssetLoad();
    }
  };

  useEffect(() => {
    if (mode === null) return;

    if (isLowPerformance) {
      handleAssetLoad();
      return;
    }

    const composite = compositeVideoRef.current;
    const treeRight = treeRightRef.current;
    const treeLeft = treeLeftRef.current;

    const handleCompositeReady = () => {
      videosReady.current.composite = true;
      checkAllVideosReady();
    };

    const handleTreeRightReady = () => {
      videosReady.current.treeRight = true;
      checkAllVideosReady();
    };

    const handleTreeLeftReady = () => {
      videosReady.current.treeLeft = true;
      checkAllVideosReady();
    };

    if (composite?.readyState >= 3) videosReady.current.composite = true;
    if (treeRight?.readyState >= 3) videosReady.current.treeRight = true;
    if (treeLeft?.readyState >= 3) videosReady.current.treeLeft = true;

    composite?.addEventListener('canplay', handleCompositeReady);
    composite?.addEventListener('loadeddata', handleCompositeReady);
    treeRight?.addEventListener('canplay', handleTreeRightReady);
    treeRight?.addEventListener('loadeddata', handleTreeRightReady);
    treeLeft?.addEventListener('canplay', handleTreeLeftReady);
    treeLeft?.addEventListener('loadeddata', handleTreeLeftReady);

    checkAllVideosReady();

    const timeout = setTimeout(handleAssetLoad, 2000);

    return () => {
      composite?.removeEventListener('canplay', handleCompositeReady);
      composite?.removeEventListener('loadeddata', handleCompositeReady);
      treeRight?.removeEventListener('canplay', handleTreeRightReady);
      treeRight?.removeEventListener('loadeddata', handleTreeRightReady);
      treeLeft?.removeEventListener('canplay', handleTreeLeftReady);
      treeLeft?.removeEventListener('loadeddata', handleTreeLeftReady);
      clearTimeout(timeout);
    };
  }, [mode, isLowPerformance]);

  useEffect(() => {
    if (!isLoaded || mode === null) return;

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
      gsap.from("nav", { y: "-100%", duration: 1, ease: "power3.out", delay: 1.5 });
      gsap.from(".social-links", { y: "100%", duration: 1, ease: "power3.out", delay: 1.5 });
    }, rootRef);

    return () => ctx.revert();
  }, [isLoaded, mode]);

  return (
    <>
      <ModeSelector />

      {!isLoaded && mode !== null && (
        <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
            <p className={`text-2xl text-white ${weddingDay.className}`}>Loading...</p>
          </div>
        </div>
      )}

      <div ref={rootRef} className={`relative w-full h-screen overflow-hidden ${!isLoaded || mode === null ? 'opacity-0' : 'opacity-100'}`}>
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <Image src="/landing/images/painted_bg.png" alt="painted background" fill className="object-cover" priority />
          {!isLowPerformance && (
            <video ref={compositeVideoRef} src="/landing/videos/landing_composite.webm" autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" preload="auto" />
          )}
      </div>

      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 w-full h-full z-0">
        <defs>
          <filter id="bgFilter">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G">
              <animate
                attributeName="scale"
                values="200;490"
                dur="3s"
                begin="0.6s"
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
                begin="0.6s"
                calcMode="spline"
                keySplines="0.2 0.8 0.3 1"
                fill="freeze"
              />
              <animate
                attributeName="y"
                values="50%;3.75%"
                dur="3s"
                begin="0.6s"
                calcMode="spline"
                keySplines="0.2 0.8 0.3 1"
                fill="freeze"
              />
              <animate
                attributeName="width"
                values="0%;87%"
                dur="3s"
                begin="0.6s"
                calcMode="spline"
                keySplines="0.2 0.8 0.3 1"
                fill="freeze"
              />
              <animate
                attributeName="height"
                values="0%;92%"
                dur="3s"
                begin="0.6s"
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

      <div className="name-container absolute z-[62] top-[38%] sm:top-[45%] left-1/2 sm:left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center will-change-transform">
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

      {!isLowPerformance && (
        <>
          <div className="fixed inset-0 z-[65] overflow-hidden pointer-events-none will-change-transform">
            <video ref={treeRightRef} className="tree-right absolute top-0 right-0 h-screen w-auto object-cover object-top will-change-transform" src="/landing/videos/tree_right.webm" autoPlay loop muted playsInline preload="auto" />
          </div>

          <div className="fixed inset-0 z-[60] overflow-hidden pointer-events-none will-change-transform">
            <video ref={treeLeftRef} className="tree-left absolute top-0 left-0 h-screen w-auto object-cover object-top will-change-transform" src="/landing/videos/tree_left.webm" autoPlay loop muted playsInline preload="auto" />
          </div>
        </>
      )}

      <div className="social-links">
        <SocialLinks variant="black" />
      </div>
      </div>
    </>
  );
}
