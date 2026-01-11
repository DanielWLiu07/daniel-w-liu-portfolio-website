import Image from 'next/image'

const GLOW_FILTER = 'brightness(1.15) drop-shadow(0 0 12px rgba(255, 255, 255, 0.5)) drop-shadow(0 0 24px rgba(255, 255, 255, 0.4)) drop-shadow(0 0 36px rgba(255, 255, 255, 0.3))'
const SHADOW_FILTER = 'brightness(0.5)'

export function ExperienceHeader() {
  return (
    <div className="experience-header relative ml-0 mt-5 flex flex-col items-center md:ml-21 md:mt-5 md:block [transform:rotateZ(0deg)] md:[transform:rotateZ(1deg)]">
      <Image
        src="/experience/images/experience_text.png"
        alt=""
        width={600}
        height={200}
        className="w-auto h-auto max-w-[450px] md:max-w-full absolute top-2 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:-left-2"
        style={{ filter: SHADOW_FILTER }}
        aria-hidden="true"
      />
      <Image
        src="/experience/images/experience_text.png"
        alt="Experience"
        width={600}
        height={200}
        className="w-auto h-auto max-w-[450px] md:max-w-full relative z-20 mx-auto md:mx-0"
        style={{ filter: GLOW_FILTER }}
        priority
      />
    </div>
  )
}
