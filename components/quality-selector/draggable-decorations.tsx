'use client'

import Image from 'next/image'

const DECORATIONS = [
  { src: '/quality/images/pin_outline_2.png', alt: 'pin', className: 'top-[15%] left-[8%] w-12 md:w-16 rotate-12' },
  { src: '/quality/images/pin_outline_3.png', alt: 'pin', className: 'top-[25%] right-[10%] w-10 md:w-14 -rotate-6' },
  { src: '/quality/images/paper_clip_outline_1.png', alt: 'clip', className: 'top-[40%] left-[5%] w-14 md:w-20 rotate-45' },
  { src: '/quality/images/paper_clip_outline_2.png', alt: 'clip', className: 'bottom-[30%] right-[8%] w-12 md:w-18 -rotate-12' },
  { src: '/quality/images/paper_clip_outline_3.png', alt: 'clip', className: 'bottom-[20%] left-[12%] w-10 md:w-16 rotate-90' },
  { src: '/quality/images/stationary_outline.png', alt: 'stationery', className: 'top-[60%] right-[5%] w-16 md:w-24 rotate-6' },
]

export function DraggableDecorations() {
  return (
    <>
      {DECORATIONS.map((decoration, index) => (
        <div
          key={index}
          className={`draggable-graphic fixed ${decoration.className} z-[50] cursor-grab active:cursor-grabbing select-none`}
        >
          <Image
            src={decoration.src}
            alt={decoration.alt}
            width={100}
            height={100}
            className="w-full h-auto pointer-events-none brightness-105 saturate-[1.15] contrast-105"
            draggable={false}
          />
        </div>
      ))}
    </>
  )
}
