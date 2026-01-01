import localFont from 'next/font/local';

const weddingDay = localFont({
  src: '../../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
});

interface NameDisplayProps {
  subtitle?: string;
  className?: string;
}

export function NameDisplay({ subtitle, className = "" }: NameDisplayProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="flex flex-wrap sm:flex-nowrap gap-x-4 items-center sm:items-center justify-center -ml-12 sm:ml-0">
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
      {subtitle && (
        <div className={`text-2xl sm:text-3xl tracking-wide text-stroke-white-sm -mt-20 sm:-mt-25 text-center font-bold whitespace-nowrap ${weddingDay.className}`}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
