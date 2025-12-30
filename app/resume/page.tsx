"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import localFont from "next/font/local";
import gsap from "gsap";
import * as Dialog from "@radix-ui/react-dialog";

const weddingDay = localFont({
  src: "../../public/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf",
});

const VIDEO_ASPECT_RATIO = 16 / 9;
const VIDEO_SRC = "/resume_loading_anim_24fps.webm";
const BUTTON_IMAGE_PATH = "/resume_img/button_img";

interface InteractiveButton {
  id: string;
  imageName: string;
  shape: "rounded-full" | "square";
  left: string;
  top: string;
  width: string;
  height: string;
  rotation: number;
  action: () => void;
}

const INTERACTIVE_BUTTONS: InteractiveButton[] = [
  {
    id: "folder",
    imageName: "folder_selected.png",
    shape: "square",
    left: "50.29%",
    top: "44.91%",
    width: "40.57%",
    height: "66.49%",
    rotation: -12.5306,
    action: () => window.open("/Daniel_W_Liu_Resume_Dec_2025.pdf", "_blank"),
  },
  {
    id: "github",
    imageName: "github_selected.png",
    shape: "rounded-full",
    left: "79.66%",
    top: "57.45%",
    width: "12.00%",
    height: "21.52%",
    rotation: 0,
    action: () => window.open("https://github.com/DanielWLiu07", "_blank"),
  },
  {
    id: "linkedin",
    imageName: "linkedln_selected.png",
    shape: "square",
    left: "90.31%",
    top: "74.5%",
    width: "12.83%",
    height: "19.85%",
    rotation: 0,
    action: () => window.open("https://www.linkedin.com/in/danielliu2007/", "_blank"),
  },
  {
    id: "email",
    imageName: "email_selected.png",
    shape: "rounded-full",
    left: "74.43%",
    top: "82.14%",
    width: "9.75%",
    height: "17.29%",
    rotation: 0,
    action: () =>
      window.open(
        "https://docs.google.com/forms/d/e/1FAIpQLSdsaj2nXuReGTo1Fu9PaW7jsxUZPpPAiCMuf0gBvmZBYFe1nw/viewform?usp=dialog",
        "_blank"
      ),
  },
  {
    id: "waterloo",
    imageName: "waterloo_selected.png",
    shape: "rounded-full",
    left: "86.07%",
    top: "23.76%",
    width: "23.44%",
    height: "41.63%",
    rotation: 0,
    action: () => window.open("https://uwaterloo.ca", "_blank"),
  },
  {
    id: "selfie",
    imageName: "selfie_selected.png",
    shape: "square",
    left: "13.95%",
    top: "30.27%",
    width: "22.91%",
    height: "41.49%",
    rotation: -8,
    action: () => {},
  },
  {
    id: "cat",
    imageName: "cat_selected.png",
    shape: "square",
    left: "14.49%",
    top: "73.67%",
    width: "16.51%",
    height: "28.49%",
    rotation: 3.84,
    action: () => {},
  },
];

export default function Resume() {
  const [videoEnded, setVideoEnded] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [showScrollText, setShowScrollText] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollTextRef = useRef<HTMLDivElement>(null);

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

    return () => {
      window.removeEventListener("resize", centerViewport);
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
      setShowImageModal("/resume_img/photo_img/self.JPG");
    } else if (button.id === "cat") {
      setShowImageModal("/resume_img/photo_img/cat.jpg");
    } else {
      button.action();
    }
  };

  const contentWrapperStyle = {
    width: `max(100vw, calc(100vh * ${VIDEO_ASPECT_RATIO}))`,
    height: `max(100vh, calc(100vw / ${VIDEO_ASPECT_RATIO}))`,
  };

  const hoveredButtonData = INTERACTIVE_BUTTONS.find(
    (button) => button.id === hoveredButton
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-screen overflow-auto bg-black"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="relative inline-block" style={contentWrapperStyle}>
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          autoPlay
          muted
          playsInline
          onEnded={handleVideoEnd}
          className="w-full h-full block object-cover object-center"
        />

        {hoveredButtonData && videoEnded && (
          <Image
            src={`${BUTTON_IMAGE_PATH}/${hoveredButtonData.imageName}`}
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
  );
}
