import { BillboardCard } from './BillboardCard'

interface Experience {
  title: string
  company: string
  period: string
  description: string
  logo?: string
}

interface ExperienceListProps {
  experiences: Experience[]
}

const SCROLL_MASK = 'linear-gradient(to bottom, transparent 0px, transparent 40px, black 100px, black 100%)'

export function ExperienceList({ experiences }: ExperienceListProps) {
  return (
    <div className="md:-ml-29.5 -mt-15 md:-mt-16 w-full" style={{ overflow: 'visible' }}>
      <div
        className="overflow-y-auto overflow-x-visible max-h-[calc(100vh-100px)] px-4 md:px-32 relative hide-scrollbar w-full"
        style={{
          maskImage: SCROLL_MASK,
          WebkitMaskImage: SCROLL_MASK,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:gap-8 max-w-3xl md:max-w-none pb-20 pt-24 overflow-visible mx-auto md:pl-24 md:-ml-8 md:mx-0">
          {experiences.map((exp, index) => (
            <BillboardCard key={index} experience={exp} />
          ))}
        </div>
      </div>
    </div>
  )
}
