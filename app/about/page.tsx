"use client";
import Image from "next/image";
import localFont from 'next/font/local';

const katieRoze = localFont({
    src: '../../public/fonts/Katie Roze Watercolour Font - By Lef/KatieRoze.otf',
});

export default function About(){
    return (
        <div className="relative w-full min-h-screen">
            <div className="fixed inset-0 z-0">
                <Image src="/water_colour.png" alt="Water Colour" fill className="object-cover" priority />
            </div>
            <div className="fixed inset-0 z-0">
                <Image src="/watercolour/right_colour.png" alt="Water Colour" fill className="object-cover" priority />
            </div>

            <div className="relative z-10 min-h-screen flex justify-end">
                <div className={`pt-5 w-1/2 pl-12 flex flex-col justify-start ${katieRoze.className}`}>
                        <div className="overflow-visible -space-y-12">
                              <h1 className="text-9xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-tight py-2">Daniel W Liu</h1>
                            <p className="text-3xl bg-gradient-to-r from-blue-800 to-purple-800 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">Software Engineer & </p>
                        </div>
                      
                        <div className=" pl-6 text-black text-3xl font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
                            <p className="text-4xl max-w-lg">0 University of Waterloo - Computer Science and Finance Double Major (2025 - Present)</p>
                            <p className="text-4xl max-w-lg">0 45/45 Final IB Score (Top 0.1% Global)</p>
                            <p className="text-4xl max-w-lg">0 Fullstack and ML - Jack of All Trades</p>
                            <p className="text-4xl max-w-lg">0 I love Rock Climbing, Brawl Stars, Riot Games, and Pingpong. </p>
                        </div>

                         <h1 className="text-6xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-tight py-2">Tech Stack</h1>
                </div>
            </div>
        </div>
    )
}
