import Image from "next/image";

interface TechBadgeProps {
  src: string;
  alt: string;
}

export function TechBadge({ src, alt }: TechBadgeProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={0}
      height={0}
      className="h-6 md:h-auto w-auto"
      unoptimized
    />
  );
}
