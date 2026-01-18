import Image from 'next/image'

const GLOW_FILTER = 'brightness(1.15) drop-shadow(0 0 12px rgba(255, 255, 255, 0.5)) drop-shadow(0 0 24px rgba(255, 255, 255, 0.4)) drop-shadow(0 0 36px rgba(255, 255, 255, 0.3))'
const SHADOW_FILTER = 'brightness(0.5)'

export function ExperienceHeader() {
  return (
    <div className="experience-header relative ml-0 mt-5 flex flex-col items-center lg:ml-21 lg:mt-5 lg:block [transform:rotateZ(0deg)] lg:[transform:rotateZ(1deg)]">
      <Image
        src="/experience/images/experience_text.png"
        alt=""
        width={600}
        height={200}
        className="w-auto h-auto max-w-[80%] min-[461px]:max-w-[450px] lg:max-w-full absolute top-2 left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:-left-2"
        style={{ filter: SHADOW_FILTER }}
        aria-hidden="true"
      />
      <Image
        src="/experience/images/experience_text.png"
        alt="Experience"
        width={600}
        height={200}
        className="w-auto h-auto max-w-[80%] min-[461px]:max-w-[450px] lg:max-w-full relative z-20 mx-auto lg:mx-0"
        style={{ filter: GLOW_FILTER }}
        priority
      />
    </div>
  )
}
