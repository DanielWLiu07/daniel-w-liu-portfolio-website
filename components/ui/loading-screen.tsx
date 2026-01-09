import Image from 'next/image'
import localFont from 'next/font/local'

const fredrick = localFont({
  src: '../../public/fonts/FrederickatheGreat-Regular.ttf',
})

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <Image
        src="/landing/images/white_paper.png"
        alt="loading background"
        fill
        className="object-cover"
        priority
      />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <Image
          src="/images/cat_spin.png"
          alt="Loading"
          width={128}
          height={128}
          className="animate-spin"
        />
        <p
          className={`text-5xl md:text-7xl text-center tracking-wider text-stroke-white ${fredrick.className}`}
          style={{ color: '#2c1810' }}
        >
          Loading
          <span className="loading-dot-1">.</span>
          <span className="loading-dot-2">.</span>
          <span className="loading-dot-3">.</span>
        </p>
      </div>
    </div>
  )
}
