'use client'

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { projects, sceneOptions } from '@/data/projects'
import { getPlaneWidth, createCardGeometry, createCardMaterial } from '@/lib/carousel-helpers'
import { handleWheelScroll, updateScrollVelocity } from '@/lib/carousel-animation'

export type ExpansionStage = 'none' | 'expanding' | 'expanded'

interface ProjectSliderProps {
  isPaused: boolean
  onProjectClick: (projectId: number | null) => void
  onPauseChange: (paused: boolean) => void
  onExpansionStageChange?: (stage: ExpansionStage) => void
  visible: boolean
  expandedProject: number | null
}

export default function ProjectSlider({ isPaused, onProjectClick, onPauseChange, onExpansionStageChange, visible, expandedProject }: ProjectSliderProps) {
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

  const expansionStageRef = useRef<ExpansionStage>('none')
  const [expansionStage, setExpansionStage] = useState<ExpansionStage>('none')

  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const carouselTouchStartRef = useRef<{ x: number; y: number } | null>(null)

  const dotMeshesRef = useRef<THREE.Mesh[]>([])
  const dotGroupRef = useRef<THREE.Group | null>(null)
  const hoveredDotIndexRef = useRef<number | null>(null)

  const backdropMeshRef = useRef<THREE.Mesh | null>(null)

  const onProjectClickRef = useRef(onProjectClick)
  const onPauseChangeRef = useRef(onPauseChange)
  const onExpansionStageChangeRef = useRef(onExpansionStageChange)

  useEffect(() => {
    onProjectClickRef.current = onProjectClick
  }, [onProjectClick])

  useEffect(() => {
    onPauseChangeRef.current = onPauseChange
  }, [onPauseChange])

  useEffect(() => {
    onExpansionStageChangeRef.current = onExpansionStageChange
  }, [onExpansionStageChange])

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    onExpansionStageChangeRef.current?.(expansionStage)
  }, [expansionStage])

  const prevExpandedProjectRef = useRef<number | null>(null)
  const flickerTimeRef = useRef(0)
  const isFlickeringRef = useRef(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const prevProject = prevExpandedProjectRef.current
    prevExpandedProjectRef.current = expandedProject
    expandedProjectRef.current = expandedProject

    if (expandedProject === null && expandedPlaneRef.current) {
      animatingRef.current = true
      expansionStageRef.current = 'none'
      setExpansionStage('none')

      dotMeshesRef.current.forEach(dot => {
        dot.userData.targetOpacity = 0
        const glowMesh = dot.userData.glowMesh as THREE.Mesh
        if (glowMesh) {
          glowMesh.userData.targetOpacity = 0
        }
      })

      const plane = expandedPlaneRef.current
      const dotGroup = dotGroupRef.current
      const dotsToClean = [...dotMeshesRef.current]
      if (dotGroup && plane) {
        setTimeout(() => {
          plane.remove(dotGroup)
          dotGroup.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              if (child.material instanceof THREE.Material) {
                child.material.dispose()
              }
            }
          })
          if (dotGroupRef.current === dotGroup) {
            dotGroupRef.current = null
          }
          if (dotMeshesRef.current === dotsToClean || dotMeshesRef.current.length === 0) {
            dotMeshesRef.current = []
          }
        }, 600)
      }
    } else if (expandedProject !== null && prevProject !== null && expandedProject !== prevProject) {
      isFlickeringRef.current = true
      flickerTimeRef.current = 0

      dotMeshesRef.current.forEach(dot => {
        const dotMat = dot.material as THREE.MeshBasicMaterial
        dotMat.opacity = 0
        const glowMesh = dot.userData.glowMesh as THREE.Mesh
        if (glowMesh) {
          const glowMat = glowMesh.material as THREE.MeshBasicMaterial
          glowMat.opacity = 0
        }
      })

      const oldPlane = expandedPlaneRef.current
      const oldDotGroup = dotGroupRef.current
      if (oldDotGroup && oldPlane) {
        oldPlane.remove(oldDotGroup)
        oldDotGroup.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
        })
      }
      dotGroupRef.current = null
      dotMeshesRef.current = []
      expansionStageRef.current = 'expanding'
      setExpansionStage('expanding')
    }

    setCurrentImageIndex(0)
  }, [expandedProject])
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateDotColors = (activeIndex: number) => {
    dotMeshesRef.current.forEach((dot, index) => {
      const mat = dot.material as THREE.MeshBasicMaterial
      const glowMesh = dot.userData.glowMesh as THREE.Mesh | undefined
      const glowMat = glowMesh?.material as THREE.MeshBasicMaterial | undefined

      if (index === activeIndex) {
        mat.opacity = 1
        if (glowMat) glowMat.opacity = 0.4
      } else {
        mat.opacity = 0.4
        if (glowMat) glowMat.opacity = 0
      }
    })
  }

  const changeImage = (newIndex: number) => {
    const plane = expandedPlaneRef.current
    if (!plane) return

    const contentTextures = plane.userData.contentTextures as THREE.Texture[]
    if (!contentTextures || newIndex < 0 || newIndex >= contentTextures.length) return

    const mat = plane.material as THREE.ShaderMaterial
    if (mat.uniforms.contentTex) {
      mat.uniforms.contentTex.value = contentTextures[newIndex]
    }
    plane.userData.currentImageIndex = newIndex
    setCurrentImageIndex(newIndex)
    updateDotColors(newIndex)
  }

  const goToNextImage = () => {
    const plane = expandedPlaneRef.current
    if (!plane) return
    const contentTextures = plane.userData.contentTextures as THREE.Texture[]
    if (!contentTextures) return
    const newIndex = Math.min(currentImageIndex + 1, contentTextures.length - 1)
    changeImage(newIndex)
  }

  const goToPrevImage = () => {
    const newIndex = Math.max(currentImageIndex - 1, 0)
    changeImage(newIndex)
  }

  const handleCarouselTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (!expandedProject) return
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    carouselTouchStartRef.current = { x: clientX, y: clientY }
  }

  const handleCarouselTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (!expandedProject || !carouselTouchStartRef.current) return

    const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX
    const deltaX = clientX - carouselTouchStartRef.current.x
    const threshold = 50

    if (deltaX < -threshold) {
      goToNextImage()
    } else if (deltaX > threshold) {
      goToPrevImage()
    }

    carouselTouchStartRef.current = null
  }

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

    const backdropGeometry = new THREE.PlaneGeometry(20, 20)
    const backdropMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    })
    const backdropMesh = new THREE.Mesh(backdropGeometry, backdropMaterial)
    backdropMesh.position.z = 0.5
    scene.add(backdropMesh)
    backdropMeshRef.current = backdropMesh

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
      const frameTexture = textureLoader.load(project.image)
      const contentTextures = project.images.map(imgPath => textureLoader.load(imgPath))
      const initialContentTexture = contentTextures[0] || frameTexture

      const geometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)
      const material = createCardMaterial(frameTexture, initialContentTexture, sceneOptions.curve)

      const plane = new THREE.Mesh(geometry, material)
      plane.position.x = -(i - initialOffset) * cardWidth
      plane.position.y = -0.35

      plane.userData = {
        projectId: project.id,
        projectIndex: i % projects.length,
        initialX: plane.position.x,
        initialY: -0.35,
        index: i,
        originalWorldX: 0,
        contentTextures,
        currentImageIndex: 0
      }
      scene.add(plane)
      planes.push(plane)
    })

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const lastMousePosition = new THREE.Vector2(-999, -999)

    const createDots = (plane: THREE.Mesh, imageCount: number) => {
      hoveredDotIndexRef.current = null
      if (dotGroupRef.current) {
        scene.remove(dotGroupRef.current)
        dotGroupRef.current.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
        })
      }

      const dotGroup = new THREE.Group()
      dotGroupRef.current = dotGroup
      const dots: THREE.Mesh[] = []

      const dotRadius = 0.02
      const glowRadius = 0.035
      const dotSpacing = 0.07
      const totalWidth = (imageCount - 1) * dotSpacing
      const startX = -totalWidth / 2

      const cardHalfHeight = sceneOptions.cardHeight / 2
      const dotY = -cardHalfHeight - 0.06

      for (let i = 0; i < imageCount; i++) {
        const glowGeometry = new THREE.CircleGeometry(glowRadius, 24)
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide
        })
        const glow = new THREE.Mesh(glowGeometry, glowMaterial)
        glow.position.x = startX + i * dotSpacing
        glow.position.y = dotY
        glow.position.z = 0.005
        glow.userData.isGlow = true
        glow.userData.targetOpacity = i === 0 ? 0.4 : 0
        dotGroup.add(glow)

        const geometry = new THREE.CircleGeometry(dotRadius, 16)
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide
        })
        const dot = new THREE.Mesh(geometry, material)
        dot.position.x = startX + i * dotSpacing
        dot.position.y = dotY
        dot.position.z = 0.01
        dot.userData.dotIndex = i
        dot.userData.glowMesh = glow
        dot.userData.targetOpacity = i === 0 ? 1 : 0.4
        dot.userData.targetScale = 1
        dot.userData.isAnimating = i === 0
        dot.userData.animProgress = 0

        dotGroup.add(dot)
        dots.push(dot)
      }

      dotMeshesRef.current = dots
      plane.add(dotGroup)
    }

    const onCanvasClick = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)

      if (expandedProjectRef.current !== null) {
        if (dotMeshesRef.current.length > 0) {
          const plane = expandedPlaneRef.current
          if (plane) {
            plane.updateMatrixWorld(true)
          }
          const dotIntersects = raycaster.intersectObjects(dotMeshesRef.current)
          if (dotIntersects.length > 0) {
            const clickedDot = dotIntersects[0].object as THREE.Mesh
            const dotIndex = clickedDot.userData.dotIndex as number
            const changeEvent = new CustomEvent('dotClick', { detail: { index: dotIndex } })
            container.dispatchEvent(changeEvent)
            return
          }
        }

        return
      }

      const intersects = raycaster.intersectObjects(planes)

      if (intersects.length > 0) {
        const clickedPlane = intersects[0].object as THREE.Mesh
        const projectId = clickedPlane.userData.projectId
        const projectData = projects.find(p => p.id === projectId)
        const imageCount = projectData?.images?.length || 0

        expandedPlaneRef.current = clickedPlane
        const worldPos = new THREE.Vector3()
        clickedPlane.getWorldPosition(worldPos)
        originalPositionRef.current = worldPos.clone()
        originalScaleRef.current = clickedPlane.scale.x

        clickedPlane.userData.originalWorldX = worldPos.x
        clickedPlane.userData.scenePositionAtClick = scene.position.x

        if (imageCount > 0) {
          createDots(clickedPlane, imageCount)
        }

        isManualScrollingRef.current = false
        velocityRef.current = 0
        targetTimeRef.current = timeRef.current

        expansionStageRef.current = 'expanding'
        setExpansionStage('expanding')

        onPauseChangeRef.current(true)
        onProjectClickRef.current(projectId)
        animatingRef.current = true
      }
    }

    const handleDotClick = (event: Event) => {
      const customEvent = event as CustomEvent<{ index: number }>
      const plane = expandedPlaneRef.current
      if (!plane) return

      const contentTextures = plane.userData.contentTextures as THREE.Texture[]
      if (!contentTextures) return

      const newIndex = customEvent.detail.index
      if (newIndex < 0 || newIndex >= contentTextures.length) return

      const mat = plane.material as THREE.ShaderMaterial
      if (mat.uniforms.contentTex) {
        mat.uniforms.contentTex.value = contentTextures[newIndex]
      }
      plane.userData.currentImageIndex = newIndex
      setCurrentImageIndex(newIndex)

      dotMeshesRef.current.forEach((dot, index) => {
        const glowMesh = dot.userData.glowMesh as THREE.Mesh

        if (index === newIndex) {
          dot.userData.targetOpacity = 1
          dot.userData.isAnimating = true
          dot.userData.animProgress = 0
          if (glowMesh) {
            glowMesh.userData.targetOpacity = 0.4
          }
        } else {
          dot.userData.targetOpacity = 0.4
          dot.userData.isAnimating = false
          if (glowMesh) {
            glowMesh.userData.targetOpacity = 0
          }
        }
      })
    }

    container.addEventListener('dotClick', handleDotClick)

    renderer.domElement.addEventListener('click', onCanvasClick)

    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      lastMousePosition.copy(mouse)

      if (expandedProjectRef.current !== null && dotMeshesRef.current.length > 0) {
        const plane = expandedPlaneRef.current
        if (plane) {
          plane.updateMatrixWorld(true)
        }
        raycaster.setFromCamera(mouse, camera)
        const dotIntersects = raycaster.intersectObjects(dotMeshesRef.current)
        if (dotIntersects.length > 0) {
          const hoveredDot = dotIntersects[0].object as THREE.Mesh
          hoveredDotIndexRef.current = hoveredDot.userData.dotIndex as number
          renderer.domElement.style.cursor = 'pointer'
        } else {
          hoveredDotIndexRef.current = null
          renderer.domElement.style.cursor = 'default'
        }
        return
      }
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
        renderer.domElement.style.cursor = 'pointer'
      } else {
        hoveredPlaneRef.current = null
        renderer.domElement.style.cursor = 'default'
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

    const onMouseMoveGlobal = (event: MouseEvent) => {
      mousePosition.x = (event.clientX / container.clientWidth) * 2 - 1
      mousePosition.y = -(event.clientY / container.clientHeight) * 2 + 1
    }
    window.addEventListener('mousemove', onMouseMoveGlobal)

    const getExpandedTargetPosition = () => {
      const aspect = container.clientWidth / container.clientHeight
      const targetX = -aspect * 0.32
      const targetY = 0
      const targetZ = 0.8
      return new THREE.Vector3(targetX, targetY, targetZ)
    }

    const animate = (currentTime: number) => {
      const timePassed = currentTime - previousTime
      let expandedPlane = expandedPlaneRef.current
      const isExpanded = expandedProjectRef.current !== null

      if (isExpanded && expandedProjectRef.current !== null) {
        const currentPlaneProjectId = expandedPlane?.userData.projectId
        if (currentPlaneProjectId !== expandedProjectRef.current) {
          let bestPlane: THREE.Mesh | null = null
          let bestDistance = Infinity
          planes.forEach(p => {
            if (p.userData.projectId === expandedProjectRef.current) {
              const worldPos = new THREE.Vector3()
              p.getWorldPosition(worldPos)
              const dist = Math.abs(worldPos.x)
              if (dist < bestDistance) {
                bestDistance = dist
                bestPlane = p
              }
            }
          })

          if (bestPlane) {
            const newPlane: THREE.Mesh = bestPlane

            if (expandedPlane) {
              const oldMat = expandedPlane.material as THREE.ShaderMaterial
              if (oldMat.uniforms.isExpanded) oldMat.uniforms.isExpanded.value = 0
              if (oldMat.uniforms.opacity) oldMat.uniforms.opacity.value = 0.2
              expandedPlane.scale.set(1, 1, 1)
              expandedPlane.rotation.set(0, 0, 0)
              expandedPlane.position.x = expandedPlane.userData.initialX
              expandedPlane.position.y = expandedPlane.userData.initialY ?? -0.35
              expandedPlane.position.z = 0
            }

            expandedPlaneRef.current = newPlane
            expandedPlane = newPlane

            const leftTarget = getExpandedTargetPosition()
            newPlane.position.x = leftTarget.x - scene.position.x
            newPlane.position.y = leftTarget.y
            newPlane.position.z = leftTarget.z
            newPlane.scale.set(0.95, 0.95, 0.95)

            const newMat = newPlane.material as THREE.ShaderMaterial
            if (newMat.uniforms.isExpanded) newMat.uniforms.isExpanded.value = 1.0
            if (newMat.uniforms.opacity) newMat.uniforms.opacity.value = 1.0

            const projectData = projects.find(p => p.id === expandedProjectRef.current)
            const imageCount = projectData?.images?.length || 0
            if (imageCount > 0) {
              createDots(newPlane, imageCount)
            }

            expansionStageRef.current = 'expanded'
            setExpansionStage('expanded')

            animatingRef.current = true
          }
        }
      }

      floatTime += timePassed * 0.001
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

      if (backdropMeshRef.current) {
        const backdropMat = backdropMeshRef.current.material as THREE.MeshBasicMaterial
        const targetOpacity = isExpanded ? 0.4 : 0
        backdropMat.opacity += (targetOpacity - backdropMat.opacity) * 0.1
      }

      planes.forEach(plane => {
        const isExpandedPlane = plane === expandedPlane && isExpanded

        const mat = plane.material as THREE.ShaderMaterial

        if (isExpandedPlane) {
          const currentStage = expansionStageRef.current
          const target = getExpandedTargetPosition()
          const floatOffsetY = Math.sin(floatTime * 1.5) * 0.03
          const floatOffsetX = Math.sin(floatTime * 1.2) * 0.01
          const targetLocalX = target.x - scene.position.x + floatOffsetX
          const targetLocalY = target.y + floatOffsetY
          const targetLocalZ = target.z
          const lerpFactor = 0.08

          const dx = targetLocalX - plane.position.x
          const dy = targetLocalY - plane.position.y
          const dz = targetLocalZ - plane.position.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

          if (distance > 0.01) {
            plane.position.x += dx * lerpFactor
            plane.position.y += dy * lerpFactor
            plane.position.z += dz * lerpFactor
          } else {
            plane.position.x = targetLocalX
            plane.position.y = targetLocalY
            plane.position.z = targetLocalZ

            if (currentStage === 'expanding') {
              expansionStageRef.current = 'expanded'
              setExpansionStage('expanded')
            }
          }

          const targetScale = 0.95
          const scaleLerp = 0.12
          const newScale = plane.scale.x + (targetScale - plane.scale.x) * scaleLerp
          plane.scale.set(newScale, newScale, newScale)

          const MAX_ROTATION = 0.15
          const ROTATION_SENSITIVITY = 0.12
          const cardWorldPos = new THREE.Vector3()
          plane.getWorldPosition(cardWorldPos)
          const cardScreenPos = cardWorldPos.clone().project(camera)
          const offsetX = smoothMousePosition.x - cardScreenPos.x
          const offsetY = smoothMousePosition.y - cardScreenPos.y
          let targetRotY = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, offsetX * ROTATION_SENSITIVITY))
          let targetRotX = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, -offsetY * ROTATION_SENSITIVITY))

          if (isFlickeringRef.current) {
            flickerTimeRef.current += timePassed * 0.001
            const flickerProgress = flickerTimeRef.current / 0.2

            if (flickerProgress < 1) {
              const flickerIntensity = Math.sin(flickerProgress * Math.PI)
              const flickerWave = Math.sin(flickerProgress * Math.PI * 1.5)
              targetRotY += flickerWave * 0.262 * flickerIntensity
              targetRotX += Math.cos(flickerProgress * Math.PI * 1.5) * 0.14 * flickerIntensity
            } else {
              isFlickeringRef.current = false
            }
          }

          plane.rotation.y += (targetRotY - plane.rotation.y) * 0.15
          plane.rotation.x += (targetRotX - plane.rotation.x) * 0.15

          if (mat.uniforms.isExpanded) {
            const expandDiff = 1.0 - mat.uniforms.isExpanded.value
            const expandSpeed = 0.08
            if (Math.abs(expandDiff) > 0.001) {
              mat.uniforms.isExpanded.value += Math.sign(expandDiff) * Math.min(expandSpeed, Math.abs(expandDiff))
            }
          }

          if (mat.uniforms.opacity) {
            mat.uniforms.opacity.value = 1
          }

          const dotsVisible = currentStage === 'expanded'
          dotMeshesRef.current.forEach((dot, index) => {
            const dotMat = dot.material as THREE.MeshBasicMaterial
            const targetOpacity = dotsVisible ? (dot.userData.targetOpacity as number) : 0
            dotMat.opacity += (targetOpacity - dotMat.opacity) * 0.15

            const isSelected = dot.userData.targetOpacity === 1
            const baseScale = isSelected ? 1.1 : 1.0
            const isHovered = hoveredDotIndexRef.current === index
            const hoverScale = isHovered ? 1.2 : 1.0

            if (dot.userData.isAnimating) {
              dot.userData.animProgress += 0.04
              const progress = Math.min(dot.userData.animProgress as number, 1)
              const pulseProgress = progress < 0.5 ? progress * 2 : 2 - progress * 2
              const eased = 1 - Math.pow(1 - pulseProgress, 2)
              const pulseScale = 1 + (0.3 * eased)
              dot.scale.set(baseScale * hoverScale * pulseScale, baseScale * hoverScale * pulseScale, 1)
              if (progress >= 1) {
                dot.userData.isAnimating = false
              }
            } else {
              const targetScale = baseScale * hoverScale
              const currentScale = dot.scale.x
              const newScale = currentScale + (targetScale - currentScale) * 0.2
              dot.scale.set(newScale, newScale, 1)
            }

            const glowMesh = dot.userData.glowMesh as THREE.Mesh
            if (glowMesh) {
              const glowMat = glowMesh.material as THREE.MeshBasicMaterial
              const glowTarget = dotsVisible ? (glowMesh.userData.targetOpacity as number) : 0
              glowMat.opacity += (glowTarget - glowMat.opacity) * 0.15
            }
          })
        } else if (isExpanded && expandedPlane) {
          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (0.2 - currentOpacity) * 0.15
          }
        } else if (!isExpanded && animatingRef.current && expandedPlane) {
          const targetX = plane.userData.initialX
          const targetY = plane.userData.initialY ?? -0.35
          const targetZ = 0
          const dx = targetX - plane.position.x
          const dy = targetY - plane.position.y
          const dz = targetZ - plane.position.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          const BASE_SPEED = 0.008
          const DISTANCE_FACTOR = 0.018
          const moveSpeed = BASE_SPEED + distance * DISTANCE_FACTOR

          if (distance > 0.01) {
            const moveAmount = Math.min(moveSpeed, distance)
            plane.position.x += (dx / distance) * moveAmount
            plane.position.y += (dy / distance) * moveAmount
            plane.position.z += (dz / distance) * moveAmount
          } else {
            plane.position.x = targetX
            plane.position.y = targetY
            plane.position.z = targetZ
          }

          plane.rotation.x += (0 - plane.rotation.x) * 0.1
          plane.rotation.y += (0 - plane.rotation.y) * 0.1

          const targetScale = 1
          const scaleDiff = targetScale - plane.scale.x
          const scaleSpeed = 0.02
          if (Math.abs(scaleDiff) > 0.001) {
            const scaleChange = Math.sign(scaleDiff) * Math.min(scaleSpeed, Math.abs(scaleDiff))
            const newScale = plane.scale.x + scaleChange
            plane.scale.set(newScale, newScale, newScale)
          }

          if (mat.uniforms.isExpanded) {
            const expandDiff = 0.0 - mat.uniforms.isExpanded.value
            const expandSpeed = 0.04
            if (Math.abs(expandDiff) > 0.001) {
              mat.uniforms.isExpanded.value += Math.sign(expandDiff) * Math.min(expandSpeed, Math.abs(expandDiff))
            }
          }

          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (1 - currentOpacity) * 0.15
          }

          if (plane === expandedPlane) {
            dotMeshesRef.current.forEach(dot => {
              const dotMat = dot.material as THREE.MeshBasicMaterial
              dotMat.opacity += (0 - dotMat.opacity) * 0.15

              const glowMesh = dot.userData.glowMesh as THREE.Mesh
              if (glowMesh) {
                const glowMat = glowMesh.material as THREE.MeshBasicMaterial
                glowMat.opacity += (0 - glowMat.opacity) * 0.15
              }
            })
          }
        } else {
          const targetScale = plane === hoveredPlaneRef.current ? 1.04 : 1
          const currentScale = plane.scale.x
          const scaleDiff = targetScale - currentScale
          const newScale = currentScale + scaleDiff * 0.15
          plane.scale.set(newScale, newScale, newScale)

          plane.rotation.x += (0 - plane.rotation.x) * 0.1
          plane.rotation.y += (0 - plane.rotation.y) * 0.1

          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (1 - currentOpacity) * 0.1
          }
        }
      })

      if (animatingRef.current && !isExpanded && expansionStageRef.current === 'none') {
        const allSettled = planes.every(plane => {
          const scaleDiff = Math.abs(1 - plane.scale.x)
          const targetY = plane.userData.initialY ?? -0.35
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
      container.removeEventListener('dotClick', handleDotClick)
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
      if (dotGroupRef.current) {
        dotGroupRef.current.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
        })
      }
      if (backdropMeshRef.current) {
        backdropMeshRef.current.geometry.dispose()
        if (backdropMeshRef.current.material instanceof THREE.Material) {
          backdropMeshRef.current.material.dispose()
        }
      }
      renderer.dispose()
    }
  }, [containerReady])

  return (
    <>
      <div
        ref={containerRef}
        className={`absolute inset-0 curved-slider z-[38] overflow-visible transition-opacity ${!visible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        onTouchStart={handleCarouselTouchStart}
        onTouchEnd={handleCarouselTouchEnd}
        onMouseDown={handleCarouselTouchStart}
        onMouseUp={handleCarouselTouchEnd}
      />

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
