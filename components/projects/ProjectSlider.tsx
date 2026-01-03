'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { projects, sceneOptions } from './project-data'
import { getPlaneWidth, createCardGeometry, createCardMaterial } from './carousel-helpers'
import { handleWheelScroll, updateScrollVelocity } from './carousel-animation'

interface ProjectSliderProps {
  isPaused: boolean
  onProjectClick: (projectId: number) => void
  onPauseChange: (paused: boolean) => void
  visible: boolean
}

export default function ProjectSlider({ isPaused, onProjectClick, onPauseChange, visible }: ProjectSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const planesRef = useRef<THREE.Mesh[]>([])
  const timeRef = useRef(0)
  const targetTimeRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const velocityRef = useRef(0)
  const isManualScrollingRef = useRef(false)
  const autoScrollDirectionRef = useRef(-1)
  const hoveredPlaneRef = useRef<THREE.Mesh | null>(null)
  const isPausedRef = useRef(false)

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const container = containerRef.current
    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 20)
    camera.position.z = 2
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    rendererRef.current = renderer

    container.appendChild(renderer.domElement)

    const cardWidth = sceneOptions.cardWidth + sceneOptions.gap / 100
    const planeSpace = getPlaneWidth(camera, container.clientWidth, container.clientHeight, sceneOptions.cardWidth, sceneOptions.gap) * cardWidth
    const visibleCards = Math.ceil(container.clientWidth / planeSpace)
    const totalCards = visibleCards + projects.length * 4
    const initialOffset = Math.ceil(totalCards / 2)

    const allProjects = []
    for (let i = 0; i < totalCards; i++) {
      allProjects.push(projects[i % projects.length])
    }

    const planes: THREE.Mesh[] = []
    planesRef.current = planes

    allProjects.forEach((project, i) => {
      const textureLoader = new THREE.TextureLoader()
      const texture = textureLoader.load(project.image)

      const geometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)
      const material = createCardMaterial(texture, sceneOptions.curve)

      const plane = new THREE.Mesh(geometry, material)
      plane.position.x = -(i - initialOffset) * cardWidth

      plane.userData = {
        projectId: project.id,
        projectIndex: i % projects.length,
        initialX: plane.position.x,
        index: i
      }
      scene.add(plane)
      planes.push(plane)
    })

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const lastMousePosition = new THREE.Vector2(-999, -999)

    const onCanvasClick = (event: MouseEvent) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(planes)

      if (intersects.length > 0) {
        const clickedPlane = intersects[0].object as THREE.Mesh
        const projectId = clickedPlane.userData.projectId

        isManualScrollingRef.current = false
        velocityRef.current = 0
        targetTimeRef.current = timeRef.current

        onPauseChange(true)

        setTimeout(() => {
          onProjectClick(projectId)
        }, 800)
      }
    }

    renderer.domElement.addEventListener('click', onCanvasClick)

    const onMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      lastMousePosition.copy(mouse)
    }

    const checkHover = () => {
      raycaster.setFromCamera(lastMousePosition, camera)
      const intersects = raycaster.intersectObjects(planes)

      if (intersects.length > 0) {
        const hoveredPlane = intersects[0].object as THREE.Mesh
        if (hoveredPlaneRef.current !== hoveredPlane) {
          hoveredPlaneRef.current = hoveredPlane
        }
        if (!isPausedRef.current) {
          velocityRef.current = 0
          isManualScrollingRef.current = false
          targetTimeRef.current = timeRef.current
          onPauseChange(true)
        }
      } else {
        hoveredPlaneRef.current = null
        if (isPausedRef.current) {
          onPauseChange(false)
        }
      }
    }

    renderer.domElement.addEventListener('mousemove', onMouseMove)

    const onWheel = (event: WheelEvent) => {
      if (isPausedRef.current) {
        onPauseChange(false)
      }

      hoveredPlaneRef.current = null
      handleWheelScroll(event, velocityRef, isManualScrollingRef)
    }

    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    let previousTime = 0

    const animate = (currentTime: number) => {
      const timePassed = currentTime - previousTime

      if (!isPausedRef.current) {
        const loopWidth = cardWidth * projects.length

        updateScrollVelocity(isManualScrollingRef, velocityRef, autoScrollDirectionRef)

        timeRef.current += velocityRef.current * timePassed * 0.001

        if (timeRef.current * sceneOptions.speed > loopWidth) {
          timeRef.current -= loopWidth / sceneOptions.speed
        } else if (timeRef.current * sceneOptions.speed < -loopWidth) {
          timeRef.current += loopWidth / sceneOptions.speed
        }
      } else {
        const diff = targetTimeRef.current - timeRef.current
        timeRef.current += diff * 0.1
      }

      scene.position.x = timeRef.current * sceneOptions.speed

      checkHover()

      planes.forEach(plane => {
        const targetScale = plane === hoveredPlaneRef.current ? 1.15 : 1
        const currentScale = plane.scale.x
        const scaleDiff = targetScale - currentScale
        const newScale = currentScale + scaleDiff * 0.15
        plane.scale.set(newScale, newScale, newScale)
      })

      renderer.render(scene, camera)

      previousTime = currentTime
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return

      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight

      cameraRef.current.aspect = width / height
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('click', onCanvasClick)
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('wheel', onWheel)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (rendererRef.current && containerRef.current) {
        const rendererElement = rendererRef.current.domElement
        if (containerRef.current.contains(rendererElement)) {
          containerRef.current.removeChild(rendererElement)
        }
      }
      planesRef.current.forEach(plane => {
        plane.geometry.dispose()
        if (plane.material instanceof THREE.Material) {
          plane.material.dispose()
        }
      })
    }
  }, [onProjectClick, onPauseChange])

  return (
    <>
      <div ref={containerRef} className={`absolute inset-x-0 top-32 bottom-0 curved-slider z-10 transition-opacity ${!visible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} />
      <style jsx>{`
        .curved-slider canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
      `}</style>
    </>
  )
}
