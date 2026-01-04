import { useEffect } from 'react'

export function useBodyOverflow(overflow: 'hidden' | 'auto' = 'hidden') {
  useEffect(() => {
    document.body.style.overflow = overflow
    document.body.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.overflow = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [overflow])
}
