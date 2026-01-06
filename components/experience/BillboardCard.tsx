import { CardCorners } from './CardCorners'

interface Experience {
  title: string
  company: string
  period: string
  description: string
}

interface BillboardCardProps {
  experience: Experience
}

const CARD_GLOW = 'brightness(1.05) drop-shadow(0 0 15px rgba(255, 255, 255, 0.6)) drop-shadow(0 0 30px rgba(255, 255, 255, 0.5)) drop-shadow(0 0 45px rgba(255, 255, 255, 0.4))'

export function BillboardCard({ experience }: BillboardCardProps) {
  return (
    <div className="relative group w-full max-w-2xl md:max-w-[740px] overflow-visible mx-auto md:mx-0 [transform:rotateZ(0deg)] md:[transform:rotateZ(1deg)]">
      <div className="absolute top-2 -left-2 w-full h-full bg-gradient-to-br from-gray-900 to-black rounded-lg border-3 border-gray-800 transition-transform group-hover:-translate-x-1 group-hover:-translate-y-1 opacity-50" />

      <div
        className="relative bg-gradient-to-br from-white to-gray-50 rounded-lg border-3 border-gray-300 p-3 md:p-4 shadow-2xl transition-all group-hover:shadow-3xl min-h-[100px] md:min-h-[140px] z-10 group-hover:-translate-x-1 group-hover:-translate-y-1 opacity-90 md:opacity-85 hover:opacity-100"
        style={{ filter: CARD_GLOW }}
      >
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-14 md:h-14 flex-shrink-0" />

          <div className="flex-1">
            <div className="flex items-baseline gap-2 md:gap-3 mb-1 md:mb-2">
              <h3 className="text-base md:text-xl font-bold text-gray-900">
                {experience.title}
              </h3>
              <p className="text-xs md:text-sm text-gray-600">
                {experience.period}
              </p>
            </div>
            <p className="text-sm md:text-lg font-semibold text-gray-700 mb-1">
              {experience.company}
            </p>
            <p className="text-gray-700 text-xs md:text-sm leading-relaxed">
              {experience.description}
            </p>
          </div>
        </div>

        <CardCorners />
      </div>
    </div>
  )
}
