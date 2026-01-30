'use client'

import Image from 'next/image'

interface TreeOverlaysProps {
  isLowPerformance: boolean
  treeRightRef: React.RefObject<HTMLVideoElement | null>
  treeLeftRef: React.RefObject<HTMLVideoElement | null>
}

export function TreeOverlays({ isLowPerformance, treeRightRef, treeLeftRef }: TreeOverlaysProps) {
  const baseClasses = 'fixed inset-0 overflow-hidden pointer-events-none will-change-transform'

  if (isLowPerformance) {
    return (
      <>
        <div className={`${baseClasses} z-[65]`}>
          <Image
            src="/animation_frames/landing/tree_right0200.webp"
            alt=""
            width={1920}
            height={1080}
            className="tree-right absolute top-0 right-0 h-screen w-auto object-cover object-top will-change-transform"
          />
        </div>
        <div className={`${baseClasses} z-[60]`}>
          <Image
            src="/animation_frames/landing/tree_left0200.webp"
            alt=""
            width={1920}
            height={1080}
            className="tree-left absolute top-0 left-0 h-screen w-auto object-cover object-top will-change-transform"
          />
        </div>
      </>
    )
  }

  return (
    <>
      <div className={`${baseClasses} z-[65]`}>
        <video
          ref={treeRightRef}
          className="tree-right absolute top-0 right-0 h-screen w-auto object-cover object-top will-change-transform"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        >
          <source src="/landing/videos/tree_right.webm" type="video/webm" />
        </video>
      </div>
      <div className={`${baseClasses} z-[60]`}>
        <video
          ref={treeLeftRef}
          className="tree-left absolute top-0 left-0 h-screen w-auto object-cover object-top will-change-transform"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        >
          <source src="/landing/videos/tree_left.webm" type="video/webm" />
        </video>
      </div>
    </>
  )
}
