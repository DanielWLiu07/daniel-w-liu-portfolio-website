'use client';

import Scene from '@/components/three/Scene';

export default function Home() {
  return (
    <div className="relative w-full h-screen bg-white">
      <div className="absolute w-full h-full z-10">
        <div className="flex justify-center items-center">
         <video
  className="h-[110px] w-auto"
  src="/name_videos/first_name.webm"
  autoPlay
  muted
  playsInline
/>
<video
  className="w-auto"
  src="/name_videos/middle_name.webm"
  autoPlay
  muted
  playsInline
/>
<video
  className="h-[200px] w-auto"
  src="/name_videos/last_name.webm"
  autoPlay
  muted
  playsInline
/>
        </div>
        

      </div>
      <div className="z-0 absolute w-full h-full">
            <Scene />
      </div>
    </div>
  );
}
