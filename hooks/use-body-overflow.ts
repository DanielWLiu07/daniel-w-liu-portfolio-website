import { useEffect } from 'react'

interface UseBodyOverflowOptions {
  mobileBreakpoint?: number
  allowScrollWhen?: boolean
}

export function useBodyOverflow(overflow: 'hidden' | 'auto' = 'hidden', options?: UseBodyOverflowOptions) {
  const { mobileBreakpoint, allowScrollWhen = false } = options || {}

  useEffect(() => {
    const updateOverflow = () => {
      const isMobile = mobileBreakpoint && window.innerWidth < mobileBreakpoint

      // Only allow scroll on mobile AND when allowScrollWhen is true
      if (isMobile && allowScrollWhen) {
        document.body.style.overflow = ''
        document.body.style.overscrollBehavior = 'none'
      } else {
        document.body.style.overflow = 'hidden'
        document.body.style.overscrollBehavior = 'none'
      }
    }

    updateOverflow()

    if (mobileBreakpoint) {
      window.addEventListener('resize', updateOverflow)
      return () => {
        window.removeEventListener('resize', updateOverflow)
        document.body.style.overflow = ''
        document.body.style.overscrollBehavior = ''
      }
    }

    return () => {
      document.body.style.overflow = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [overflow, mobileBreakpoint, allowScrollWhen])
}
