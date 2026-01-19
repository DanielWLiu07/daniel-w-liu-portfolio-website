'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { projects, sceneOptions } from '@/data/projects'
import { getPlaneWidth, createCardGeometry, createCardMaterial } from '@/lib/carousel-helpers'
import { handleWheelScroll, updateScrollVelocity } from '@/lib/carousel-animation'

interface ProjectSliderProps {
  isPaused: boolean
  onProjectClick: (projectId: number) => void
  onPauseChange: (paused: boolean) => void
  visible: boolean
  expandedProject: number | null
}

export default function ProjectSlider({ isPaused, onProjectClick, onPauseChange, visible, expandedProject }: ProjectSliderProps) {
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
  const initializedRef = useRef(false)
  const [containerReady, setContainerReady] = useState(false)

  const expandedPlaneRef = useRef<THREE.Mesh | null>(null)
  const expandedProjectRef = useRef<number | null>(null)
  const originalPositionRef = useRef<THREE.Vector3 | null>(null)
  const originalScaleRef = useRef<number>(1)
  const animatingRef = useRef(false)

  const onProjectClickRef = useRef(onProjectClick)
  const onPauseChangeRef = useRef(onPauseChange)

  useEffect(() => {
    onProjectClickRef.current = onProjectClick
  }, [onProjectClick])

  useEffect(() => {
    onPauseChangeRef.current = onPauseChange
  }, [onPauseChange])

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  // Handle expanded project changes
  useEffect(() => {
    expandedProjectRef.current = expandedProject

    if (expandedProject === null && expandedPlaneRef.current) {
      // Animate back to original position
      animatingRef.current = true
    }
  }, [expandedProject])

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return

    const container = containerRef.current

    const checkDimensions = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        setContainerReady(true)
      }
    }

    checkDimensions()

    const resizeObserver = new ResizeObserver(checkDimensions)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    if (!containerRef.current || !containerReady || initializedRef.current) {
      return
    }

    const container = containerRef.current
    initializedRef.current = true

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
      plane.position.y = -0.8 // Offset down so carousel appears lower on screen

      plane.userData = {
        projectId: project.id,
        projectIndex: i % projects.length,
        initialX: plane.position.x,
        initialY: -0.8,
        index: i,
        originalWorldX: 0
      }
      scene.add(plane)
      planes.push(plane)
    })

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const lastMousePosition = new THREE.Vector2(-999, -999)

    const onCanvasClick = (event: MouseEvent) => {
      if (expandedProjectRef.current !== null) return

      const rect = container.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(planes)

      if (intersects.length > 0) {
        const clickedPlane = intersects[0].object as THREE.Mesh
        const projectId = clickedPlane.userData.projectId

        // Store the clicked plane and its original world position
        expandedPlaneRef.current = clickedPlane
        const worldPos = new THREE.Vector3()
        clickedPlane.getWorldPosition(worldPos)
        originalPositionRef.current = worldPos.clone()
        originalScaleRef.current = clickedPlane.scale.x

        // Store the scene position at time of click for restoration
        clickedPlane.userData.originalWorldX = worldPos.x
        clickedPlane.userData.scenePositionAtClick = scene.position.x

        isManualScrollingRef.current = false
        velocityRef.current = 0
        targetTimeRef.current = timeRef.current

        onPauseChangeRef.current(true)
        onProjectClickRef.current(projectId)
        animatingRef.current = true
      }
    }

    renderer.domElement.addEventListener('click', onCanvasClick)

    const onMouseMove = (event: MouseEvent) => {
      if (expandedProjectRef.current !== null) return

      const rect = container.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      lastMousePosition.copy(mouse)
    }

    const checkHover = () => {
      if (expandedProjectRef.current !== null) return

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
          onPauseChangeRef.current(true)
        }
      } else {
        hoveredPlaneRef.current = null
        if (isPausedRef.current && expandedProjectRef.current === null) {
          onPauseChangeRef.current(false)
        }
      }
    }

    renderer.domElement.addEventListener('mousemove', onMouseMove)

    const onWheel = (event: WheelEvent) => {
      if (expandedProjectRef.current !== null) return

      if (isPausedRef.current) {
        onPauseChangeRef.current(false)
      }

      hoveredPlaneRef.current = null
      handleWheelScroll(event, velocityRef, isManualScrollingRef)
    }

    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    let touchStartX = 0
    let touchStartY = 0
    let isTouchScrolling = false

    const onTouchStart = (event: TouchEvent) => {
      if (expandedProjectRef.current !== null) return

      if (event.touches.length === 1) {
        touchStartX = event.touches[0].clientX
        touchStartY = event.touches[0].clientY
        isTouchScrolling = false

        if (isPausedRef.current) {
          onPauseChangeRef.current(false)
        }
        hoveredPlaneRef.current = null
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      if (expandedProjectRef.current !== null) return

      if (event.touches.length === 1) {
        const touchX = event.touches[0].clientX
        const touchY = event.touches[0].clientY
        const deltaX = touchX - touchStartX
        const deltaY = touchStartY - touchY

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          event.preventDefault()
          isTouchScrolling = true
          velocityRef.current = deltaX * 0.015
          isManualScrollingRef.current = true

          touchStartX = touchX
        }
      }
    }

    const onTouchEnd = () => {
      if (isTouchScrolling) {
        isManualScrollingRef.current = true
      }
    }

    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true })
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false })
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: true })

    let previousTime = 0
    let floatTime = 0
    const mousePosition = { x: 0, y: 0 }
    const smoothMousePosition = { x: 0, y: 0 }

    // Track mouse for expanded card effect
    const onMouseMoveGlobal = (event: MouseEvent) => {
      mousePosition.x = (event.clientX / container.clientWidth) * 2 - 1
      mousePosition.y = -(event.clientY / container.clientHeight) * 2 + 1
    }
    window.addEventListener('mousemove', onMouseMoveGlobal)

    // Calculate target position for expanded card (left of center, mirroring info panel)
    const getExpandedTargetPosition = () => {
      const aspect = container.clientWidth / container.clientHeight
      // Position card on the left, closer to center
      const targetX = -aspect * 0.32
      const targetY = 0.05
      const targetZ = 0.8 // Bring forward more
      return new THREE.Vector3(targetX, targetY, targetZ)
    }

    const animate = (currentTime: number) => {
      const timePassed = currentTime - previousTime
      const expandedPlane = expandedPlaneRef.current
      const isExpanded = expandedProjectRef.current !== null

      // Update float time for hovering animation
      floatTime += timePassed * 0.001

      // Smooth mouse position
      smoothMousePosition.x += (mousePosition.x - smoothMousePosition.x) * 0.05
      smoothMousePosition.y += (mousePosition.y - smoothMousePosition.y) * 0.05

      if (!isPausedRef.current && !isExpanded) {
        const loopWidth = cardWidth * projects.length

        updateScrollVelocity(isManualScrollingRef, velocityRef, autoScrollDirectionRef)

        timeRef.current += velocityRef.current * timePassed * 0.001

        if (timeRef.current * sceneOptions.speed > loopWidth) {
          timeRef.current -= loopWidth / sceneOptions.speed
        } else if (timeRef.current * sceneOptions.speed < -loopWidth) {
          timeRef.current += loopWidth / sceneOptions.speed
        }
      } else if (!isExpanded) {
        const diff = targetTimeRef.current - timeRef.current
        timeRef.current += diff * 0.1
      }

      if (!isExpanded) {
        scene.position.x = timeRef.current * sceneOptions.speed
      }

      if (!isExpanded) {
        checkHover()
      }

      // Animate planes
      planes.forEach(plane => {
        const isExpandedPlane = plane === expandedPlane && isExpanded

        const mat = plane.material as THREE.ShaderMaterial

        if (isExpandedPlane) {
          // Animate to expanded position (left side)
          const target = getExpandedTargetPosition()

          // Add floating animation
          const floatOffsetY = Math.sin(floatTime * 1.5) * 0.03
          const floatOffsetX = Math.sin(floatTime * 1.2) * 0.01

          // Get current local position and animate towards target (accounting for scene offset)
          const targetLocalX = target.x - scene.position.x + floatOffsetX
          const targetLocalY = target.y + floatOffsetY
          const targetLocalZ = target.z

          plane.position.x += (targetLocalX - plane.position.x) * 0.08
          plane.position.y += (targetLocalY - plane.position.y) * 0.08
          plane.position.z += (targetLocalZ - plane.position.z) * 0.08

          // Scale up
          const targetScale = 1.4
          const scaleDiff = targetScale - plane.scale.x
          const newScale = plane.scale.x + scaleDiff * 0.08
          plane.scale.set(newScale, newScale, newScale)

          // React to mouse position with subtle rotation
          const targetRotationY = smoothMousePosition.x * 0.15
          const targetRotationX = -smoothMousePosition.y * 0.1
          plane.rotation.y += (targetRotationY - plane.rotation.y) * 0.08
          plane.rotation.x += (targetRotationX - plane.rotation.x) * 0.08

          // Flatten the curve using isExpanded uniform
          if (mat.uniforms.isExpanded) {
            mat.uniforms.isExpanded.value += (1.0 - mat.uniforms.isExpanded.value) * 0.08
          }

          // Keep full opacity
          if (mat.uniforms.opacity) {
            mat.uniforms.opacity.value = 1
          }
        } else if (isExpanded && expandedPlane) {
          // Fade out other cards
          const targetScale = 0.8
          const currentScale = plane.scale.x
          const scaleDiff = targetScale - currentScale
          const newScale = currentScale + scaleDiff * 0.1
          plane.scale.set(newScale, newScale, newScale)

          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (0.2 - currentOpacity) * 0.1
          }
        } else if (!isExpanded && animatingRef.current && expandedPlane) {
          // Animate back to original position
          const targetY = plane.userData.initialY ?? -0.8
          plane.position.x += (plane.userData.initialX - plane.position.x) * 0.08
          plane.position.y += (targetY - plane.position.y) * 0.08
          plane.position.z += (0 - plane.position.z) * 0.08

          // Reset rotation
          plane.rotation.x += (0 - plane.rotation.x) * 0.08
          plane.rotation.y += (0 - plane.rotation.y) * 0.08

          const targetScale = 1
          const scaleDiff = targetScale - plane.scale.x
          const newScale = plane.scale.x + scaleDiff * 0.08
          plane.scale.set(newScale, newScale, newScale)

          // Restore curve
          if (mat.uniforms.isExpanded) {
            mat.uniforms.isExpanded.value += (0.0 - mat.uniforms.isExpanded.value) * 0.08
          }

          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (1 - currentOpacity) * 0.1
          }
        } else {
          // Normal hover behavior
          const targetScale = plane === hoveredPlaneRef.current ? 1.15 : 1
          const currentScale = plane.scale.x
          const scaleDiff = targetScale - currentScale
          const newScale = currentScale + scaleDiff * 0.15
          plane.scale.set(newScale, newScale, newScale)

          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (1 - currentOpacity) * 0.1
          }
        }
      })

      // Check if animation is complete
      if (animatingRef.current && !isExpanded) {
        const allSettled = planes.every(plane => {
          const scaleDiff = Math.abs(1 - plane.scale.x)
          const targetY = plane.userData.initialY ?? -0.8
          const posDiff = Math.abs(plane.position.y - targetY) + Math.abs(plane.position.z)
          return scaleDiff < 0.01 && posDiff < 0.01
        })

        if (allSettled) {
          animatingRef.current = false
          expandedPlaneRef.current = null
          originalPositionRef.current = null
        }
      }

      renderer.render(scene, camera)

      previousTime = currentTime
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    const resizeObserver = new ResizeObserver(() => {
      if (!cameraRef.current || !rendererRef.current) return

      const width = container.clientWidth
      const height = container.clientHeight
      if (width === 0 || height === 0) return

      cameraRef.current.aspect = width / height
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(width, height)
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('mousemove', onMouseMoveGlobal)
      renderer.domElement.removeEventListener('click', onCanvasClick)
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('wheel', onWheel)
      renderer.domElement.removeEventListener('touchstart', onTouchStart)
      renderer.domElement.removeEventListener('touchmove', onTouchMove)
      renderer.domElement.removeEventListener('touchend', onTouchEnd)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      planes.forEach(plane => {
        plane.geometry.dispose()
        if (plane.material instanceof THREE.Material) {
          plane.material.dispose()
        }
      })
      renderer.dispose()
    }
  }, [containerReady])

  return (
    <>
      <div ref={containerRef} className={`absolute inset-0 curved-slider z-[38] overflow-visible transition-opacity ${!visible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} />
      <style jsx>{`
        .curved-slider {
          overflow: visible !important;
        }
        .curved-slider canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }
      `}</style>
    </>
  )
}
