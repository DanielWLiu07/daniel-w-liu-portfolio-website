'use client';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { usePerformanceMode } from '@/contexts/performance-mode-context';
import { usePathname, useRouter } from 'next/navigation';

export default function Navbar(){
    const { mode, setMode } = usePerformanceMode();
    const pathname = usePathname();
    const router = useRouter();

    // Only hide navbar on landing page when mode is null
    if (mode === null && pathname === '/') return null;

    const handleHomeClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setMode(null);
        router.push('/');
    };

    return (
        <nav className="fixed top-5 left-1/2 -translate-x-1/2 md:left-5 md:translate-x-0 z-[150] pointer-events-none">
            <NavigationMenu.Root className="relative z-[1] flex justify-start pointer-events-auto">
                <NavigationMenu.List className="center shadow-blackA4 m-0 flex list-none rounded-[6px] bg-white p-1 shadow-[0_2px_10px]">
                    <NavigationMenu.Item>
                        <NavigationMenu.Link
                            className="text-gray-900 hover:bg-gray-100 focus:shadow-violet7 block select-none rounded-[4px] px-2 md:px-3 py-2 text-[13px] md:text-[15px] font-medium leading-none no-underline outline-none focus:shadow-[0_0_0_2px] transition-colors duration-200 whitespace-nowrap cursor-pointer"
                            href="/"
                            onClick={handleHomeClick}
                        >
                            Daniel W Liu
                        </NavigationMenu.Link>
                    </NavigationMenu.Item>

                     <NavigationMenu.Item>
                        <NavigationMenu.Link 
                            className="text-gray-900 hover:bg-gray-100 focus:shadow-violet7 block select-none rounded-[4px] px-2 md:px-3 py-2 text-[13px] md:text-[15px] font-medium leading-none no-underline outline-none focus:shadow-[0_0_0_2px] transition-colors duration-200" 
                            href="/about"
                        >
                            About
                        </NavigationMenu.Link>
                    </NavigationMenu.Item>


                    <NavigationMenu.Item>
                        <NavigationMenu.Link 
                            className="text-gray-900 hover:bg-gray-100 focus:shadow-violet7 block select-none rounded-[4px] px-2 md:px-3 py-2 text-[13px] md:text-[15px] font-medium leading-none no-underline outline-none focus:shadow-[0_0_0_2px] transition-colors duration-200" 
                            href="/experience"
                        >
                            Experience
                        </NavigationMenu.Link>
                    </NavigationMenu.Item>

                    
                    <NavigationMenu.Item>
                        <NavigationMenu.Link 
                            className="text-gray-900 hover:bg-gray-100 focus:shadow-violet7 block select-none rounded-[4px] px-2 md:px-3 py-2 text-[13px] md:text-[15px] font-medium leading-none no-underline outline-none focus:shadow-[0_0_0_2px] transition-colors duration-200" 
                            href="/projects"
                        >
                            Projects
                        </NavigationMenu.Link>
                    </NavigationMenu.Item>
                
                    
                    <NavigationMenu.Item>
                        <NavigationMenu.Link
                            className="text-gray-900 hover:bg-gray-100 focus:shadow-violet7 block select-none rounded-[4px] px-2 md:px-3 py-2 text-[13px] md:text-[15px] font-medium leading-none no-underline outline-none focus:shadow-[0_0_0_2px] transition-colors duration-200"
                            href="/resume"
                        >
                            Resume
                        </NavigationMenu.Link>
                    </NavigationMenu.Item>

                    <NavigationMenu.Indicator className="data-[state=visible]:animate-fadeIn data-[state=hidden]:animate-fadeOut top-full z-[1] flex h-[10px] items-end justify-center overflow-hidden transition-[width,transform_250ms_ease]">
                        <div className="relative top-[70%] h-[10px] w-[10px] rotate-[45deg] rounded-tl-[2px] bg-white" />
                    </NavigationMenu.Indicator>
                </NavigationMenu.List>

                <div className="perspective-[2000px] absolute top-full left-0 flex w-full justify-center">
                    <NavigationMenu.Viewport className="data-[state=open]:animate-scaleIn data-[state=closed]:animate-scaleOut relative mt-[10px] h-[var(--radix-navigation-menu-viewport-height)] w-full origin-[top_center] overflow-hidden rounded-[6px] bg-white transition-[width,_height] duration-300 sm:w-[var(--radix-navigation-menu-viewport-width)] shadow-[0_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0_10px_20px_-15px_rgba(22,_23,_24,_0.2)]" />
                </div>
            </NavigationMenu.Root>
        </nav>
    )
}
