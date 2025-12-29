"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

const VIDEO_ASPECT_RATIO = 16 / 9;
const VIDEO_SRC = "/resume_loading_anim_24fps.webm";
const BUTTON_IMAGE_PATH = "/resume_img/button_img";

interface InteractiveButton {
  id: string;
  imageName: string;
  position: string;
  highlightColor: string;
  action: () => void;
}

const INTERACTIVE_BUTTONS: InteractiveButton[] = [
  {
    id: "folder",
    imageName: "folder_selected.png",
    position: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-1/2",
    highlightColor: "bg-red-500/30",
    action: () => window.open("/Daniel_W_Liu_Resume_Dec_2025.pdf", "_blank"),
  },
  {
    id: "github",
    imageName: "github_selected.png",
    position: "top-1/2 left-[68%] -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full",
    highlightColor: "bg-blue-500/30",
    action: () => window.open("https://github.com/yourusername", "_blank"),
  },
  {
    id: "linkedin",
    imageName: "linkedln_selected.png",
    position: "top-[65%] left-[68%] -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full",
    highlightColor: "bg-green-500/30",
    action: () => window.open("https://linkedin.com/in/yourusername", "_blank"),
  },
  {
    id: "email",
    imageName: "email_selected.png",
    position: "top-[75%] left-[55%] -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full",
    highlightColor: "bg-yellow-500/30",
    action: () => (window.location.href = "mailto:your.email@example.com"),
  },
  {
    id: "waterloo",
    imageName: "waterloo_selected.png",
    position: "top-[75%] left-[40%] -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full",
    highlightColor: "bg-purple-500/30",
    action: () => window.open("https://uwaterloo.ca", "_blank"),
  },
  {
    id: "selfie",
    imageName: "selfie_selected.png",
    position: "top-1/2 left-[32%] -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full",
    highlightColor: "bg-orange-500/30",
    action: () => window.open("/about", "_self"),
  },
  {
    id: "cat",
    imageName: "cat_selected.png",
    position: "top-[65%] left-[32%] -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full",
    highlightColor: "bg-pink-500/30",
    action: () => {},
  },
];

export default function Resume() {
  const [videoEnded, setVideoEnded] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

    const video = videoRef.current;

    if (video) {
      video.addEventListener("loadedmetadata", centerViewport);
    }

    window.addEventListener("resize", centerViewport);

    return () => {
      window.removeEventListener("resize", centerViewport);
      if (video) {
        video.removeEventListener("loadedmetadata", centerViewport);
      }
    };
  }, []);

  const handleVideoEnd = () => setVideoEnded(true);
  const handleButtonHover = (buttonId: string) => setHoveredButton(buttonId);
  const handleButtonLeave = () => setHoveredButton(null);

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
      className="w-full h-screen overflow-auto"
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
          INTERACTIVE_BUTTONS.map((button) => (
            <div
              key={button.id}
              className={`absolute cursor-pointer ${button.position} ${button.highlightColor}`}
              onMouseEnter={() => handleButtonHover(button.id)}
              onMouseLeave={handleButtonLeave}
              onClick={button.action}
            />
          ))}
      </div>
    </div>
  );
}
