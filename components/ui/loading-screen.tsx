import Image from 'next/image'
import { frederickaFont } from '@/lib/fonts/frederica'

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <Image
        src="/landing/images/white_paper.webp"
        alt="loading background"
        fill
        className="object-cover"
        priority
      />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <Image
          src="/images/cat_spin.webp"
          alt="Loading"
          width={256}
          height={256}
          className="animate-spin"
        />
        <p
          className={`text-5xl md:text-7xl text-center tracking-wider text-stroke-white ${frederickaFont.className}`}
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
