import { forwardRef } from 'react'
import Image from 'next/image'

interface BackgroundImageProps {
  src: string
  alt: string
  className: string
  position: string
}

export const BackgroundImage = forwardRef<HTMLDivElement, BackgroundImageProps>(
  ({ src, alt, className, position }, ref) => {
    return (
      <div
        ref={ref}
        className={`${position} h-screen opacity-0 overflow-visible pointer-events-none z-[1]`}
        style={{ willChange: 'opacity' }}
      >
        <Image
          src={src}
          alt={alt}
          width={500}
          height={1750}
          className={`h-full w-auto object-contain ${className} brightness-105 saturate-[1.15] contrast-105`}
        />
      </div>
    )
  }
)

BackgroundImage.displayName = 'BackgroundImage'
