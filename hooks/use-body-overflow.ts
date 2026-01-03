import { useEffect } from 'react'

export function useBodyOverflow(overflow: 'hidden' | 'auto' = 'hidden') {
  useEffect(() => {
    document.body.style.overflow = overflow

    return () => {
      document.body.style.overflow = ''
    }
  }, [overflow])
}
