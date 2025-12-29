
import localFont from 'next/font/local';

const weddingDay = localFont({
  src: '../../public/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
});

export default function ExperiencePage() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center p-24 bg-[#cacda7]"
      style={{
        backgroundImage: 'url(/canvas.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* <h1 className="text-4xl font-bold mb-8">Experience</h1> */}
      <div className="flex flex-wrap sm:flex-nowrap gap-x-4 items-center sm:items-center justify-center -ml-12 sm:ml-0 mb-4">
        <div className="flex gap-4 items-center justify-center">
          <div className={`text-8xl sm:text-9xl tracking-tighter text-stroke-white ${weddingDay.className}`}> 
            Daniel
          </div>
          <div className={`text-[11rem] sm:text-[12rem] tracking-tighter text-stroke-white mt-50 sm:mt-15 -mr-5 ${weddingDay.className}`}> 
            W
          </div>
        </div>
        <div className={`text-8xl sm:text-9xl tracking-tighter text-stroke-white -mt-60 sm:mt-0 ${weddingDay.className}`}> 
          Liu
        </div>
      </div>
      <div className={`text-2xl sm:text-3xl tracking-wide text-stroke-white-sm -mt-35 sm:-mt-27.5 text-center font-bold whitespace-nowrap ${weddingDay.className}`}> 
        Waterloo CS and Finance Double Major
      </div>
    </main>
  );
}
