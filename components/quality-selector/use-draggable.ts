import { useEffect } from 'react'
import gsap from 'gsap'

export function useDraggable(mode: string | null, setIsDragging: (value: boolean) => void) {
  useEffect(() => {
    if (mode !== null) return

    const draggableElements = document.querySelectorAll('.draggable-graphic')

    const makeDraggable = (element: Element) => {
      const el = element as HTMLElement
      let startX = 0
      let startY = 0
      let initialX = 0
      let initialY = 0

      const onMouseDown = (e: MouseEvent) => {
        e.preventDefault()
        setIsDragging(true)
        startX = e.clientX
        startY = e.clientY
        const transform = window.getComputedStyle(el).transform
        if (transform !== 'none') {
          const matrix = new DOMMatrix(transform)
          initialX = matrix.m41
          initialY = matrix.m42
        } else {
          initialX = 0
          initialY = 0
        }
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      }

      const onMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX
        const deltaY = e.clientY - startY
        gsap.set(el, { x: initialX + deltaX, y: initialY + deltaY })
      }

      const onMouseUp = () => {
        setIsDragging(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      el.addEventListener('mousedown', onMouseDown)
      return () => {
        el.removeEventListener('mousedown', onMouseDown)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
    }

    const cleanupFunctions = Array.from(draggableElements).map(makeDraggable)

    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [mode, setIsDragging])
}
