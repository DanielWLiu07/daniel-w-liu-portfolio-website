"use client";
import Image from "next/image";
import { useState } from "react";

export default function Resume() {
  const [isHovering, setIsHovering] = useState(false);

  const handleClick = () => {
    window.open("/Daniel_W_Liu_Resume_Dec_2025.pdf", "_blank");
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <video
        src="/resume_loading_anim_24fps.webm"
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover object-top"
      />

      {isHovering && (
        <div className="absolute inset-0 scale-[0.99] transition-transform duration-200">
          <Image
            src="/resume_img/button_img/folder_selected.png"
            alt="Folder"
            fill
            className="object-cover object-top"
          />
        </div>
      )}

      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-1/2 cursor-pointer"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={handleClick}
      />
    </div>
  );
}
