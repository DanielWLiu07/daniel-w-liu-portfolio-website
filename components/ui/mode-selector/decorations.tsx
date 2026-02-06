import Image from 'next/image'
import { forwardRef } from 'react'

export const PaperClipTop1 = forwardRef<HTMLDivElement>(function PaperClipTop1(_, ref) {
  return (
    <div ref={ref} className="fixed right-[15%] lg:right-[30%] -top-16 lg:-top-8 w-16 h-16 z-[203] pointer-events-none opacity-0 [transform:rotate(15deg)_scale(2.5)] lg:[transform:rotate(15deg)_scale(2.5)]">
      <Image src="/quality/images/paper_clip_outline_1.webp" alt="" width={64} height={64} className="w-full h-full object-contain" />
    </div>
  )
})

export const PaperClipTop2 = forwardRef<HTMLDivElement>(function PaperClipTop2(_, ref) {
  return (
    <div ref={ref} className="fixed left-[15%] lg:left-[30%] -top-14 lg:-top-6 w-16 h-16 z-[204] pointer-events-none opacity-0 [transform:rotate(-15deg)_scale(2.5)] lg:[transform:rotate(-15deg)_scale(2.5)]">
      <Image src="/quality/images/paper_clip_outline_2.webp" alt="" width={64} height={64} className="w-full h-full object-contain" />
    </div>
  )
})

export const PaperClipTop3 = forwardRef<HTMLDivElement>(function PaperClipTop3(_, ref) {
  return (
    <div ref={ref} className="fixed left-1/2 -translate-x-1/2 -top-12 lg:-top-2 w-16 h-16 z-[205] pointer-events-none opacity-0 [transform:rotate(180deg)_scale(2.5)_scaleX(-1)] lg:[transform:rotate(180deg)_scale(2.5)_scaleX(-1)]">
      <Image src="/quality/images/paper_clip_outline_3.webp" alt="" width={64} height={64} className="w-full h-full object-contain" />
    </div>
  )
})

export const PaperClipRight1 = forwardRef<HTMLDivElement>(function PaperClipRight1(_, ref) {
  return (
    <div ref={ref} className="fixed -right-4 top-[40vh] lg:top-[50vh] w-16 h-16 z-[203] pointer-events-none opacity-0 [transform:rotate(-80deg)_scale(2)] lg:[transform:rotate(-80deg)_scale(2.0)]">
      <Image src="/quality/images/paper_clip_outline_5.webp" alt="" width={64} height={64} className="w-full h-full object-contain" />
    </div>
  )
})

export const PaperClipRight2 = forwardRef<HTMLDivElement>(function PaperClipRight2(_, ref) {
  return (
    <div ref={ref} className="fixed -right-2 top-[50vh] lg:top-[60vh] w-16 h-16 z-[203] pointer-events-none opacity-0 [transform:rotate(-80deg)_scale(2.4)] lg:[transform:rotate(-80deg)_scale(2.5)]">
      <Image src="/quality/images/paper_clip_outline_7.webp" alt="" width={64} height={64} className="w-full h-full object-contain" />
    </div>
  )
})

export const SelfiePhoto = forwardRef<HTMLDivElement>(function SelfiePhoto(_, ref) {
  return (
    <div ref={ref} className="fixed left-0 top-0 h-screen opacity-0 overflow-visible pointer-events-none z-[1] -ml-80 md:-ml-0 md:left-[-20vw] lg:left-[-5%] -mt-5 will-change-[opacity]">
      <Image src="/quality/images/selfie_outline.webp" alt="Daniel W Liu" width={500} height={1750} className="h-full w-auto object-contain -scale-x-110 scale-y-110 rotate-[20deg] brightness-[1.05] saturate-[1.15] contrast-[1.05]" />
      <div className="absolute top-[20%] left-[50%] w-20 h-20 z-[200] pointer-events-none [transform:translate(-220px,150px)_rotate(0deg)_scale(1.4)] lg:[transform:translate(-220px,150px)_rotate(0deg)_scale(1.8)]">
        <Image src="/quality/images/pin_outline_1.webp" alt="" width={80} height={80} className="w-full h-full object-contain" />
      </div>
      <div className="absolute top-[0%] left-[15%] w-20 h-20 z-[200] pointer-events-none [transform:translate(50px,0px)_rotate(45deg)_scale(1.4)] lg:[transform:translate(100px,0px)_rotate(-55deg)_scale(2.0)]">
        <Image src="/quality/images/clip_3_outline.webp" alt="" width={80} height={80} className="w-full h-full object-contain" />
      </div>
    </div>
  )
})

export const CatPhoto = forwardRef<HTMLDivElement>(function CatPhoto(_, ref) {
  return (
    <div ref={ref} className="fixed right-0 top-0 h-screen opacity-0 overflow-visible pointer-events-none z-[1] -mr-80 md:-mr-0 md:right-[-20vw] lg:right-[-5%] -mt-5 will-change-[opacity]">
      <Image src="/quality/images/cat_tongue_outline.webp" alt="Bongo" width={500} height={1750} className="h-full w-auto object-contain -scale-x-110 scale-y-110 rotate-[-20deg] brightness-[1.05] saturate-[1.15] contrast-[1.05]" />
      <div className="absolute top-[20%] right-[50%] w-20 h-20 z-[201] pointer-events-none [transform:translate(-50px,-150px)_rotate(-40deg)_scale(1.4)] lg:[transform:translate(-50px,-150px)_rotate(-40deg)_scale(1.8)]">
        <Image src="/quality/images/pin_outline_2.webp" alt="" width={80} height={80} className="w-full h-full object-contain" />
      </div>
      <div className="absolute top-[5%] right-[40%] w-20 h-20 z-[201] pointer-events-none [transform:translate(50px,50px)_rotate(60deg)_scale(1.4)] lg:[transform:translate(170px,80px)_rotate(-130deg)_scale(2.0)]">
        <Image src="/quality/images/clip_4_outline.webp" alt="" width={80} height={80} className="w-full h-full object-contain" />
      </div>
    </div>
  )
})

export const WaterlooBadge = forwardRef<HTMLDivElement>(function WaterlooBadge(_, ref) {
  return (
    <div ref={ref} className="fixed left-[0.5%] lg:left-0 bottom-15 lg:bottom-0 h-[18vh] lg:h-[30vh] opacity-0 overflow-visible z-[90] ml-2 mb-2 will-change-transform">
      <a href="https://uwaterloo.ca" target="_blank" rel="noopener noreferrer" className="block h-full w-full group cursor-pointer" aria-label="University of Waterloo">
        <div className="relative h-full w-full transition-transform duration-300 ease-out group-hover:scale-110 -rotate-[35deg]">
          <Image src="/quality/images/waterloo_outline.webp" alt="Waterloo" width={300} height={1200} className="h-full w-auto object-contain brightness-105 saturate-[1.15] contrast-105" />
          <div className="absolute top-[10%] left-[80%] w-20 h-20 z-[200] pointer-events-none [transform:translate(-20px,-30px)_rotate(85deg)_scale(0.8)] lg:[transform:translate(-20px,-30px)_rotate(85deg)_scale(1)]">
            <Image src="/quality/images/pin_outline_3.webp" alt="" width={80} height={80} className="w-full h-full object-contain" />
          </div>
        </div>
      </a>
    </div>
  )
})
