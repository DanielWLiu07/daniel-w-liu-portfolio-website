'use client';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { usePerformanceMode } from '@/contexts/performance-mode-context';
import { usePathname } from 'next/navigation';
import { useTransitionState } from '@/components/ui/page-transition';

export default function Navbar(){
    const { mode, resetMode } = usePerformanceMode();
    const pathname = usePathname();
    const { transitionStage, navigateWithTransition } = useTransitionState();

    const handleHomeClick = () => {
        navigateWithTransition('/', resetMode);
    };

    const handleNavClick = (href: string) => {
        if (pathname === href) {
            window.location.reload();
        } else {
            navigateWithTransition(href);
        }
    };

    // Hide navbar during transitions and on quality selector
    const isQualitySelector = mode === null && pathname === '/';
    const isHidden = transitionStage === 'covering' || transitionStage === 'loading' || isQualitySelector;

    const baseLinkClass = "text-gray-900 hover:bg-gray-100 block select-none rounded-[4px] px-2 md:px-3 py-2 mx-0.5 text-[11px] min-[431px]:text-[13px] md:text-[15px] font-medium leading-none no-underline outline-none transition-colors duration-200 cursor-pointer";
    const activeClass = "bg-gray-100";

    const getLinkClass = (href: string) => {
        const isActive = pathname === href;
        return `${baseLinkClass} ${isActive ? activeClass : ''}`;
    };

    return (
        <nav className={`fixed top-5 left-1/2 -translate-x-1/2 md:left-5 md:translate-x-0 z-[10000] pointer-events-none transition-transform duration-700 ease-out ${isHidden ? '-translate-y-20' : 'translate-y-0'}`}>
            <NavigationMenu.Root className="relative z-[1] flex justify-start pointer-events-auto">
                <NavigationMenu.List className="center shadow-blackA4 m-0 flex list-none rounded-[6px] bg-white p-1 shadow-[0_2px_10px]">
                    <NavigationMenu.Item>
                        <button
                            className={`${getLinkClass('/')} whitespace-nowrap`}
                            onClick={handleHomeClick}
                        >
                            Daniel W Liu
                        </button>
                    </NavigationMenu.Item>

                    <NavigationMenu.Item>
                        <button className={getLinkClass('/about')} onClick={() => handleNavClick('/about')}>
                            About
                        </button>
                    </NavigationMenu.Item>

                    <NavigationMenu.Item>
                        <button className={getLinkClass('/experience')} onClick={() => handleNavClick('/experience')}>
                            Experience
                        </button>
                    </NavigationMenu.Item>

                    <NavigationMenu.Item>
                        <button className={getLinkClass('/projects')} onClick={() => handleNavClick('/projects')}>
                            Projects
                        </button>
                    </NavigationMenu.Item>

                    <NavigationMenu.Item>
                        <button className={getLinkClass('/resume')} onClick={() => handleNavClick('/resume')}>
                            Resume
                        </button>
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
