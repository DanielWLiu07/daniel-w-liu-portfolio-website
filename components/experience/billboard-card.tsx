import Image from 'next/image'
import { CardCorners } from './card-corners'

interface Experience {
  title: string
  company: string
  period: string
  description: string
  logo?: string
  logoScale?: number
  comingSoon?: boolean
}

interface BillboardCardProps {
  experience: Experience
}

const CARD_GLOW = 'brightness(1.05) drop-shadow(0 0 15px rgba(255, 255, 255, 0.6)) drop-shadow(0 0 30px rgba(255, 255, 255, 0.5)) drop-shadow(0 0 45px rgba(255, 255, 255, 0.4))'
const CARD_GLOW_DIMMED = 'brightness(0.95) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(255, 255, 255, 0.25))'

export function BillboardCard({ experience }: BillboardCardProps) {
  const isComingSoon = experience.comingSoon

  return (
    <div className={`experience-card relative group w-full max-w-2xl lg:max-w-[740px] overflow-visible mx-auto lg:mx-0 [transform:rotateZ(0deg)] lg:[transform:rotateZ(1deg)] ${isComingSoon ? 'opacity-60' : ''}`}>
      <div className="absolute top-2 -left-2 w-full h-full bg-gradient-to-br from-gray-900 to-black rounded-lg border-3 border-gray-800 transition-all duration-500 ease-out group-hover:-translate-x-1 group-hover:-translate-y-1 opacity-30 group-hover:opacity-70" />

      <div
        className="relative rounded-lg border-3 border-gray-300 p-3 lg:p-4 shadow-2xl transition-all duration-500 ease-out group-hover:shadow-3xl min-h-[100px] lg:min-h-[140px] z-10 group-hover:-translate-x-1 group-hover:-translate-y-1 opacity-80 group-hover:opacity-100 group-hover:brightness-110 flex items-center"
        style={{
          filter: isComingSoon ? CARD_GLOW_DIMMED : CARD_GLOW,
          background: `linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.85)), url('/experience/images/card_img.png') center/cover repeat`,
          backgroundColor: '#fff',
          boxShadow: '0 4px 32px 0 rgba(60,40,20,0.10)',
        }}
      >
        <div className="flex items-center gap-3 lg:gap-4 w-full">
          <div className="w-14 h-14 lg:w-20 lg:h-20 flex-shrink-0 relative">
            {experience.logo && (
              <Image
                src={experience.logo}
                alt={`${experience.company} logo`}
                fill
                className="object-contain"
                style={experience.logoScale ? { transform: `scale(${experience.logoScale})` } : undefined}
              />
            )}
            {isComingSoon && (
              <div className="w-full h-full flex items-center justify-center text-2xl lg:text-3xl text-gray-400">
                ?
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-baseline gap-2 lg:gap-3 mb-1 lg:mb-2">
              <h3 className={`text-base lg:text-xl font-bold ${isComingSoon ? 'text-gray-500' : 'text-gray-900'}`}>
                {experience.title}
              </h3>
              <p className={`text-xs lg:text-sm ${isComingSoon ? 'text-gray-400' : 'text-gray-600'}`}>
                {experience.period}
              </p>
            </div>
            <p className={`text-sm lg:text-lg font-semibold mb-1 ${isComingSoon ? 'text-gray-500' : 'text-gray-700'}`}>
              {experience.company}
            </p>
            <p className={`text-[10px] lg:text-xs leading-relaxed ${isComingSoon ? 'text-gray-400 italic' : 'text-gray-700'}`}>
              {experience.description}
            </p>
          </div>
        </div>

        <CardCorners />
      </div>
    </div>
  )
}
