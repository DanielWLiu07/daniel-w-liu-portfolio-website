'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import gsap from 'gsap'

interface ElementState {
  id: string
  src: string
  x: number
  y: number
  rotation: number
  scale: number
  zIndex: number
}

const INITIAL_ELEMENTS: ElementState[] = [
  { id: 'pin_1', src: '/quality/images/pin_outline_1.webp', x: 100, y: 100, rotation: 0, scale: 1, zIndex: 10 },
  { id: 'pin_2', src: '/quality/images/pin_outline_2.webp', x: 200, y: 100, rotation: 0, scale: 1, zIndex: 10 },
  { id: 'pin_3', src: '/quality/images/pin_outline_3.webp', x: 300, y: 100, rotation: 0, scale: 1, zIndex: 10 },
  { id: 'paper_clip_1', src: '/quality/images/paper_clip_outline_1.webp', x: 100, y: 250, rotation: 0, scale: 1, zIndex: 10 },
  { id: 'paper_clip_2', src: '/quality/images/paper_clip_outline_2.webp', x: 200, y: 250, rotation: 0, scale: 1, zIndex: 10 },
  { id: 'paper_clip_3', src: '/quality/images/paper_clip_outline_3.webp', x: 300, y: 250, rotation: 0, scale: 1, zIndex: 10 },
  { id: 'clip_1', src: '/quality/images/clip_1_outline.webp', x: 100, y: 400, rotation: 0, scale: 1, zIndex: 10 },
  { id: 'stationary', src: '/quality/images/stationary_outline.webp', x: 300, y: 400, rotation: 0, scale: 1, zIndex: 10 },
]

export default function PositionEditor() {
  const [elements, setElements] = useState<ElementState[]>(INITIAL_ELEMENTS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const elementStartPos = useRef({ x: 0, y: 0 })

  const selectedElement = elements.find(el => el.id === selectedId)

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    setSelectedId(id)
    setIsDragging(true)
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    const element = elements.find(el => el.id === id)
    if (element) {
      elementStartPos.current = { x: element.x, y: element.y }
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !selectedId) return

    const deltaX = e.clientX - dragStartPos.current.x
    const deltaY = e.clientY - dragStartPos.current.y

    setElements(prev => prev.map(el =>
      el.id === selectedId
        ? { ...el, x: elementStartPos.current.x + deltaX, y: elementStartPos.current.y + deltaY }
        : el
    ))
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, selectedId])

  const updateSelected = (updates: Partial<ElementState>) => {
    if (!selectedId) return
    setElements(prev => prev.map(el =>
      el.id === selectedId ? { ...el, ...updates } : el
    ))
  }

  const rotateSelected = (delta: number) => {
    if (!selectedElement) return
    updateSelected({ rotation: selectedElement.rotation + delta })
  }

  const scaleSelected = (delta: number) => {
    if (!selectedElement) return
    const newScale = Math.max(0.1, Math.min(5, selectedElement.scale + delta))
    updateSelected({ scale: newScale })
  }

  const exportPositions = () => {
    const output = elements.map(el => ({
      id: el.id,
      src: el.src,
      x: Math.round(el.x),
      y: Math.round(el.y),
      rotation: Math.round(el.rotation),
      scale: Math.round(el.scale * 100) / 100,
      zIndex: el.zIndex
    }))
    console.log('Element Positions:', JSON.stringify(output, null, 2))
    alert('Positions logged to console! Check your browser console (F12)')
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setElements(prev => prev.filter(el => el.id !== selectedId))
    setSelectedId(null)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return

      switch(e.key) {
        case 'ArrowLeft':
          rotateSelected(-5)
          e.preventDefault()
          break
        case 'ArrowRight':
          rotateSelected(5)
          e.preventDefault()
          break
        case 'ArrowUp':
          scaleSelected(0.1)
          e.preventDefault()
          break
        case 'ArrowDown':
          scaleSelected(-0.1)
          e.preventDefault()
          break
        case 'Delete':
        case 'Backspace':
          deleteSelected()
          e.preventDefault()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, selectedElement])

  return (
    <div className="fixed inset-0 bg-white overflow-hidden">
      {/* Canvas */}
      <div className="absolute inset-0">
        <Image
          src="/landing/images/white_paper.webp"
          alt="background"
          fill
          className="object-cover"
        />
      </div>

      {/* Elements */}
      {elements.map((element) => (
        <div
          key={element.id}
          className={`absolute cursor-move ${selectedId === element.id ? 'ring-4 ring-blue-500' : ''}`}
          style={{
            left: element.x,
            top: element.y,
            transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
            transformOrigin: 'center',
            zIndex: selectedId === element.id ? 1000 : element.zIndex,
          }}
          onMouseDown={(e) => handleMouseDown(e, element.id)}
        >
          <Image
            src={element.src}
            alt={element.id}
            width={100}
            height={100}
            className="pointer-events-none select-none"
            draggable={false}
          />
        </div>
      ))}

      {/* Controls Panel */}
      <div className="fixed top-4 left-4 bg-white/95 p-4 rounded-lg shadow-lg space-y-4 z-[2000]">
        <h2 className="font-bold text-lg">Position Editor</h2>

        {selectedElement && (
          <div className="space-y-2 text-sm">
            <div className="font-semibold">Selected: {selectedElement.id}</div>
            <div>X: {Math.round(selectedElement.x)}px</div>
            <div>Y: {Math.round(selectedElement.y)}px</div>
            <div>Rotation: {Math.round(selectedElement.rotation)}°</div>
            <div>Scale: {selectedElement.scale.toFixed(2)}</div>

            <div className="pt-2 space-y-1">
              <button
                onClick={() => rotateSelected(-15)}
                className="w-full px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Rotate Left (←)
              </button>
              <button
                onClick={() => rotateSelected(15)}
                className="w-full px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Rotate Right (→)
              </button>
              <button
                onClick={() => scaleSelected(0.1)}
                className="w-full px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Scale Up (↑)
              </button>
              <button
                onClick={() => scaleSelected(-0.1)}
                className="w-full px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Scale Down (↓)
              </button>
              <button
                onClick={deleteSelected}
                className="w-full px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete (Del)
              </button>
            </div>
          </div>
        )}

        <div className="pt-2 border-t">
          <button
            onClick={exportPositions}
            className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 font-semibold"
          >
            Export Positions
          </button>
        </div>

        <div className="text-xs text-gray-600 space-y-1">
          <div>Click to select</div>
          <div>Drag to move</div>
          <div>← → to rotate</div>
          <div>↑ ↓ to scale</div>
          <div>Del to delete</div>
        </div>
      </div>
    </div>
  )
}
