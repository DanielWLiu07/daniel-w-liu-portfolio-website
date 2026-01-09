import { forwardRef } from 'react'
import Image from 'next/image'
import localFont from 'next/font/local'

const fredrick = localFont({
  src: '../../public/fonts/FrederickatheGreat-Regular.ttf',
})

interface QualityCardProps {
  title: string
  features: ReadonlyArray<{ readonly icon: string; readonly text: string }>
  imageSrc: string
  rotation: string
  order: string
  onClick: () => void
}

export const QualityCard = forwardRef<HTMLDivElement, QualityCardProps>(
  ({ title, features, imageSrc, rotation, order, onClick }, ref) => {
    return (
      <div
        ref={ref}
        className={`relative group cursor-pointer opacity-0 overflow-visible -mt-5 ${order}`}
        style={{ willChange: 'opacity' }}
        onClick={onClick}
      >
        <Image
          src="/quality/images/pin_outline_1.png"
          alt="pin"
          width={80}
          height={80}
          className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          priority
        />
        <div
          className={`relative w-[280px] h-[280px] md:w-[420px] md:h-[420px] ${rotation} hover:scale-105 hover:rotate-0 transition-all duration-300 ease-out overflow-visible will-change-transform`}
        >
          <Image
            src={imageSrc}
            alt={title}
            width={420}
            height={420}
            className="overflow-visible absolute inset-0 w-full h-full object-cover brightness-105 saturate-[1.2] contrast-105"
            priority
          />
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-16 text-gray-800 ${fredrick.className} leading-relaxed pointer-events-none z-10`}
          >
            <div
              className="text-2xl md:text-[2.75rem] font-bold mb-3 md:mb-6 tracking-wide text-stroke-white"
              style={{ color: '#1a1410' }}
            >
              {title}
            </div>
            <div className="text-sm md:text-lg text-center font-semibold space-y-1 md:space-y-2 text-stroke-white-sm">
              {features.map((feature, index) => (
                <div key={index}>
                  {feature.icon} {feature.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
)

QualityCard.displayName = 'QualityCard'
