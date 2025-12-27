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
                <div className={`pt-5 w-1/2 pl-12 flex flex-col justify-start gap-6 ${katieRoze.className}`}>
                    <div className="-space-y-12 overflow-visible">
                        <h1 className="text-9xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-tight py-2">Daniel W Liu</h1>
                        <p className="text-3xl bg-gradient-to-r from-blue-800 to-purple-800 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">Software Engineer & Developer</p>

                        <div className="text-black text-3xl font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] space-y-4 mt-12">
                            <p className="text-4xl">0 University of Waterloo - Computer Science (2023 - Present)</p>

                            <div className="space-y-2 mt-6">
                                <p>0 React, Next.js, TypeScript</p>
                                <p>0 Node.js, Python, GSAP</p>
                            </div>

                            <div className="space-y-2 mt-6">
                                <p>0 Built interactive portfolio with custom animations</p>
                                <p>0 Contributed to open-source projects</p>
                                <p>0 Hackathon participant and winner</p>
                            </div>

                            <div className="space-y-2 mt-6">
                                <p>0 Game Development</p>
                                <p>0 Digital Art & Animation</p>
                                <p>0 Reading Tech Blogs</p>
                                <p>0 Running & Fitness</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
