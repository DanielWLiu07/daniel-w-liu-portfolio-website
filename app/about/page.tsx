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
            <div className="fixed inset-0 z-0">
                <Image src="/watercolour/waterloo.png" alt="Water Colour" fill className="object-contain object-right-top" priority />
            </div>

            <div className="relative z-10 min-h-screen flex justify-end">
                <div className={`w-1/2 pl-10 pb-5 flex flex-col justify-start ${katieRoze.className}`}>
                        <div className="overflow-visible -space-y-12">
                              <h1 className="text-9xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-tight py-2">Daniel W Liu</h1>
                            <p className="text-3xl bg-gradient-to-r from-blue-800 to-purple-800 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">Software Engineer & ML Developer</p>
                        </div>
                      
                        <div className=" pl-6 text-black text-3xl font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
                            <div className="flex items-center gap-3">
                                <p className="text-4xl max-w-md">0 University of Waterloo - Computer Science and Finance Double Major (2025 - Present)</p>
                            </div>
                            <p className="text-4xl max-w-lg">0 45/45 Final IB Score (Top 0.1% Global)</p>
                            <p className="text-4xl max-w-lg">0 Fullstack and ML - Jack of All Trades</p>
                            <p className="text-4xl max-w-lg">0 Hobbies: Rock Climbing, Brawl Stars, Riot Games, Pingpong, Pokemon, Calisthenics, Game Dev. </p>
                        </div>


                        <div className="overflow-visible -space-y-6">
                            <h1 className="text-6xl font-black bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700 bg-clip-text text-transparent drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] leading-tight py-2">Tech Stack</h1>

                        <div className=" pl-6 text-black text-3xl font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] flex flex-col gap-y-4">
                            <div>
                                <p className="text-4xl mb-2">0 Languages</p>
                                <div className="flex flex-wrap gap-2">
                                    <Image src="/badges/python.svg" alt="Python" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/javascript.svg" alt="JavaScript" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/typescript.svg" alt="TypeScript" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/java.svg" alt="Java" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/csharp.svg" alt="C#" width={0} height={0} className="w-auto h-auto" unoptimized />
                                </div>
                            </div>

                            <div>
                                <p className="text-4xl mb-2">0 Fullstack</p>
                                <div className="flex flex-wrap gap-2">
                                    <Image src="/badges/html5.svg" alt="HTML5" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/css3.svg" alt="CSS3" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/react.svg" alt="React" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/nextjs.svg" alt="Next.js" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/nodejs.svg" alt="Node.js" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/expressjs.svg" alt="Express.js" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/tailwindcss.svg" alt="TailwindCSS" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/radixui.svg" alt="RadixUI" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/bootstrap.svg" alt="Bootstrap" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/mongodb.svg" alt="MongoDB" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/postgresql.svg" alt="PostgreSQL" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/firebase.svg" alt="Firebase" width={0} height={0} className="w-auto h-auto" unoptimized />
                                </div>
                            </div>

                            <div>
                                <p className="text-4xl mb-2">0 3D</p>
                                <div className="flex flex-wrap gap-2">
                                    <Image src="/badges/threejs.svg" alt="Three.js" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/blender.svg" alt="Blender" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/unity.svg" alt="Unity" width={0} height={0} className="w-auto h-auto" unoptimized />
                                </div>
                            </div>

                            <div>
                                <p className="text-4xl mb-2">0 Data + ML</p>
                                <div className="flex flex-wrap gap-2">
                                    <Image src="/badges/numpy.svg" alt="NumPy" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/pandas.svg" alt="Pandas" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/matplotlib.svg" alt="Matplotlib" width={0} height={0} className="w-auto h-auto" unoptimized />
                                </div>
                            </div>

                            <div>
                                <p className="text-4xl mb-2">0 Cloud/DevOps</p>
                                <div className="flex flex-wrap gap-2">
                                    <Image src="/badges/aws.svg" alt="AWS" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/vercel.svg" alt="Vercel" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/git.svg" alt="Git" width={0} height={0} className="w-auto h-auto" unoptimized />
                                    <Image src="/badges/github.svg" alt="GitHub" width={0} height={0} className="w-auto h-auto" unoptimized />
                                </div>
                            </div>
                        </div>
                        </div>
                         
                </div>
            </div>
        </div>
    )
}
