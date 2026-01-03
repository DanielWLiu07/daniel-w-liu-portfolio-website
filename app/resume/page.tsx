"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import localFont from "next/font/local";
import gsap from "gsap";
import * as Dialog from "@radix-ui/react-dialog";
import { createInteractiveButtons, VIDEO_CONFIG, PHOTO_IMAGES, InteractiveButton } from "@/components/resume/resume-buttons";
import { useMobile } from "@/hooks/use-mobile";
import { useBodyOverflow } from "@/hooks/use-body-overflow";

const weddingDay = localFont({
  src: "../../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf",
});

export default function Resume() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [showScrollText, setShowScrollText] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollTextRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobile();

  useBodyOverflow('hidden');

  const INTERACTIVE_BUTTONS = createInteractiveButtons();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      setIsLoaded(true);
    };

    if (video.readyState >= 3) {
      setIsLoaded(true);
    }

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadeddata', handleCanPlay);

    const timeout = setTimeout(() => {
      setIsLoaded(true);
    }, 1000);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadeddata', handleCanPlay);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const centerViewport = () => {
      if (!containerRef.current || !videoRef.current) return;

      const container = containerRef.current;
      const contentWrapper = videoRef.current.parentElement;
      if (!contentWrapper) return;

      const horizontalScroll = (contentWrapper.offsetWidth - container.clientWidth) / 2;
      const verticalScroll = (contentWrapper.offsetHeight - container.clientHeight) / 2;

      container.scrollLeft = horizontalScroll;
      container.scrollTop = verticalScroll;
    };

    const preventBottomScroll = () => {
      if (!containerRef.current || !videoRef.current) return;

      const container = containerRef.current;
      const contentWrapper = videoRef.current.parentElement;
      if (!contentWrapper) return;

      const maxScrollableHeight = contentWrapper.offsetHeight - container.clientHeight;
      const maxAllowedScroll = maxScrollableHeight * 0.9;

      if (container.scrollTop > maxAllowedScroll) {
        container.scrollTop = maxAllowedScroll;
      }
    };

    const video = videoRef.current;
    if (video) {
      video.addEventListener("loadedmetadata", centerViewport);
    }

    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", preventBottomScroll);
    }

    window.addEventListener("resize", centerViewport);

    centerViewport();
    const timeoutId = setTimeout(centerViewport, 100);

    return () => {
      window.removeEventListener("resize", centerViewport);
      clearTimeout(timeoutId);
      if (video) {
        video.removeEventListener("loadedmetadata", centerViewport);
      }
      if (container) {
        container.removeEventListener("scroll", preventBottomScroll);
      }
    };
  }, []);

  useEffect(() => {
    const checkScreenWidth = () => {
      setShowScrollText(window.innerWidth <= 1440);
    };

    checkScreenWidth();
    window.addEventListener("resize", checkScreenWidth);

    return () => {
      window.removeEventListener("resize", checkScreenWidth);
    };
  }, []);

  useEffect(() => {
    if (videoEnded && showScrollText && scrollTextRef.current) {
      gsap.fromTo(
        scrollTextRef.current,
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }
      );
    }
  }, [videoEnded, showScrollText]);

  const handleVideoEnd = () => setVideoEnded(true);
  const handleButtonHover = (buttonId: string) => setHoveredButton(buttonId);
  const handleButtonLeave = () => setHoveredButton(null);

  const handleButtonClick = (button: InteractiveButton) => {
    if (button.id === "selfie") {
      setShowImageModal(PHOTO_IMAGES.selfie);
    } else if (button.id === "cat") {
      setShowImageModal(PHOTO_IMAGES.cat);
    } else {
      button.action();
    }
  };

  const contentWrapperStyle = {
    width: `max(100vw, calc(100vh * ${VIDEO_CONFIG.ASPECT_RATIO}))`,
    height: `max(100vh, calc(100vw / ${VIDEO_CONFIG.ASPECT_RATIO}))`,
  };

  const hoveredButtonData = INTERACTIVE_BUTTONS.find(
    (button) => button.id === hoveredButton
  );

  return (
    <>
      {!isLoaded && (
        <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
            <p className={`text-2xl text-white ${weddingDay.className}`}>Loading...</p>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className={`w-full h-screen overflow-auto bg-black ${!isLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="relative inline-block" style={contentWrapperStyle}>
          <video
            ref={videoRef}
            src={VIDEO_CONFIG.SRC}
            autoPlay
            muted
            playsInline
            preload={isMobile ? "none" : "auto"}
            onEnded={handleVideoEnd}
            className="w-full h-full block object-cover object-center"
          />

        {hoveredButtonData && videoEnded && (
          <Image
            src={`${VIDEO_CONFIG.BUTTON_IMAGE_PATH}/${hoveredButtonData.imageName}`}
            alt={hoveredButtonData.id}
            width={1920}
            height={1080}
            className="absolute top-0 left-0 w-full h-full object-cover object-center pointer-events-none"
          />
        )}

        {videoEnded &&
          INTERACTIVE_BUTTONS.map((button) => {
            const buttonStyle = {
              left: button.left,
              top: button.top,
              width: button.width,
              height: button.height,
              transform: `translate(-50%, -50%) rotate(${button.rotation}deg)`,
            };

            return (
              <div
                key={button.id}
                className={`absolute z-[101] cursor-pointer ${
                  button.shape === "rounded-full" ? "rounded-full" : ""
                }`}
                style={buttonStyle}
                onMouseEnter={() => handleButtonHover(button.id)}
                onMouseLeave={handleButtonLeave}
                onClick={() => handleButtonClick(button)}
              />
            );
          })}
      </div>

      {videoEnded && showScrollText && (
        <div
          ref={scrollTextRef}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[102] pointer-events-none"
        >
          <p className={`text-4xl font-bold text-stroke-white-sm ${weddingDay.className}`}>
            Scroll Around
          </p>
        </div>
      )}

      <Dialog.Root open={!!showImageModal} onOpenChange={(open: boolean) => !open && setShowImageModal(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/80 data-[state=open]:animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] max-w-[90vw] max-h-[90vh] bg-white rounded-lg p-6 focus:outline-none data-[state=open]:animate-scaleIn border-4 border-gray-800">
            <Dialog.Title className="sr-only">Photo</Dialog.Title>
            <div className="relative flex items-center justify-center">
              <Dialog.Close className="absolute top-2 right-2 text-white text-2xl font-bold hover:text-gray-200 transition-colors duration-200 focus:outline-none px-2 py-1 z-10">
                ✕
              </Dialog.Close>
              {showImageModal && (
                <Image
                  src={showImageModal}
                  alt="Photo"
                  width={1200}
                  height={1200}
                  className="max-w-full max-h-[80vh] w-auto h-auto object-contain"
                  priority
                />
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      </div>
    </>
  );
}
