import Image from 'next/image'
import { TechBadge } from "./tech-badge"
import { techCategories } from "@/data/tech-stack"
import { mochiFont } from '@/lib/fonts/mochi'

export function TechStack() {
  return (
    <div className="overflow-visible -space-y-6 w-full mt-2">
      <Image
        src="/about/images/katie_tech_stack.webp"
        alt="Tech Stack"
        width={1000}
        height={312}
        className="w-[200px] min-[1038px]:w-[220px] xl:w-[250px] h-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] py-2"
      />

      <div className="pl-3 min-[1038px]:pl-2 text-gray-800 text-xl min-[1038px]:text-3xl drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] w-full">
        {techCategories.map((category) => (
          <div key={category.title} className="mb-4">
            <p className={`text-2xl min-[1038px]:text-3xl min-[1038px]:max-w-lg text-stroke-white-xs ${mochiFont.className}`}>- {category.title}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {category.badges.map((badge) => (
                <TechBadge key={badge.alt} {...badge} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
