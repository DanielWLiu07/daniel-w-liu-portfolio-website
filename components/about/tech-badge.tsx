import Image from "next/image"
import type { TechBadge as TechBadgeType } from "@/data/tech-stack"

export function TechBadge({ src, alt }: TechBadgeType) {
  return (
    <Image
      src={src}
      alt={alt}
      width={0}
      height={0}
      className="h-6 md:h-auto w-auto"
      unoptimized
    />
  )
}
