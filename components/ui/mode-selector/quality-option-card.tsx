import Image from 'next/image'
import { forwardRef } from 'react'
import { frederickaFont } from '@/lib/fonts/frederica'

interface QualityOptionCardProps {
  variant: 'high' | 'low'
  onClick: () => void
}

export const QualityOptionCard = forwardRef<HTMLDivElement, QualityOptionCardProps>(
  function QualityOptionCard({ variant, onClick }, ref) {
    const isHigh = variant === 'high'

    return (
      <div
        ref={ref}
        className={`relative group cursor-pointer opacity-0 overflow-visible ${
          isHigh
            ? '-mt-18 order-2 md:order-1 z-20 md:z-20'
            : '-mt-12 order-1 md:order-2 z-10 md:z-10'
        } will-change-[opacity]`}
        onClick={onClick}
      >
        <div
          className={`relative w-[280px] h-[280px] md:w-[360px] md:h-[360px] lg:w-[420px] lg:h-[420px] ${
            isHigh ? 'rotate-[1deg]' : '-rotate-[1deg]'
          } hover:scale-105 hover:rotate-0 transition-all duration-300 ease-out overflow-visible will-change-transform`}
        >
          <Image
            src={isHigh ? '/quality/images/sticky_quality_outline_1.webp' : '/quality/images/sticky_quality_outline_2.webp'}
            alt={isHigh ? 'Animated' : 'Instant'}
            width={420}
            height={420}
            className="overflow-visible absolute inset-0 w-full h-full object-cover brightness-[1.05] saturate-[1.2] contrast-[1.05]"
            priority
          />
          <div className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${frederickaFont.className} leading-relaxed pointer-events-none z-10`}>
            <div className="text-2xl md:text-[2.4rem] lg:text-[3.5rem] font-bold mb-3 md:mb-6 tracking-wider md:text-stroke-white text-stroke-white-sm drop-shadow-lg text-[#2c1810] whitespace-nowrap">
              {isHigh ? 'Animated' : 'Instant'}
            </div>
            <div className="text-base md:text-lg lg:text-lg text-center space-y-1 md:space-y-2 tracking-wider text-stroke-white-xs drop-shadow-lg text-[#2c1810]">
              {isHigh ? (
                <>
                  <div>Smooth Animations</div>
                  <div>Full Effects</div>
                  <div>Best Experience</div>
                </>
              ) : (
                <>
                  <div>Static Images</div>
                  <div>Reduced Effects</div>
                  <div>Optimized Performance</div>
                </>
              )}
            </div>
          </div>
          {isHigh ? (
            <>
              <div className="absolute -bottom-4 -left-4 w-20 h-20 z-[206] pointer-events-none [transform:translate(10px,40px)_rotate(35deg)_scale(1.6)] md:[transform:translate(10px,40px)_rotate(35deg)_scale(1.9)] lg:[transform:translate(10px,40px)_rotate(35deg)_scale(2.2)]">
                <Image src="/quality/images/clip_1_outline.webp" alt="" width={80} height={80} className="w-full h-full object-contain" />
              </div>
              <div className="absolute -top-10 md:-top-4 -right-8 md:-right-4 w-16 h-16 z-[206] pointer-events-none [transform:translate(-30px,60px)_rotate(-140deg)_scale(1.5)] md:[transform:translate(-30px,60px)_rotate(-140deg)_scale(1.75)] lg:[transform:translate(-30px,60px)_rotate(-140deg)_scale(2.0)]">
                <Image src="/quality/images/paper_clip_outline_4.webp" alt="" width={64} height={64} className="w-full h-full object-contain" />
              </div>
            </>
          ) : (
            <>
              <div className="absolute -bottom-4 -left-4 w-20 h-20 z-[202] pointer-events-none [transform:translate(220px,-30px)_rotate(130deg)_scale(1.3)] md:[transform:translate(280px,-35px)_rotate(130deg)_scale(1.6)] lg:[transform:translate(350px,-40px)_rotate(130deg)_scale(2.0)]">
                <Image src="/quality/images/clip_2_outline.webp" alt="" width={80} height={80} className="w-full h-full object-contain" />
              </div>
              <div className="absolute -top-4 -left-4 w-16 h-16 z-[202] pointer-events-none [transform:translate(30px,30px)_rotate(35deg)_scale(1.8)] md:[transform:translate(45px,40px)_rotate(35deg)_scale(2.1)] lg:[transform:translate(60px,50px)_rotate(35deg)_scale(2.4)]">
                <Image src="/quality/images/paper_clip_outline_6.webp" alt="" width={64} height={64} className="w-full h-full object-contain" />
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
)
