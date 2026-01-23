'use client'

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { projects, sceneOptions } from '@/data/projects'
import { getPlaneWidth, createCardGeometry, createCardMaterial } from '@/lib/carousel-helpers'
import { handleWheelScroll, updateScrollVelocity } from '@/lib/carousel-animation'
import {
  DESKTOP_LAYOUT,
  MOBILE_LAYOUT,
  MD_BREAKPOINT,
  SCALE_LIMITS,
} from '@/lib/layout-config'
import { getFloatOffset, getEasedMovementAmount, clamp } from '@/lib/animation-utils'

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
  const arrowMeshesRef = useRef<{ left: THREE.Mesh | null; right: THREE.Mesh | null }>({ left: null, right: null })
  const hoveredArrowRef = useRef<'left' | 'right' | null>(null)


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

      if (arrowMeshesRef.current.left) {
        arrowMeshesRef.current.left.userData.targetOpacity = 0
      }
      if (arrowMeshesRef.current.right) {
        arrowMeshesRef.current.right.userData.targetOpacity = 0
      }

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
            arrowMeshesRef.current = { left: null, right: null }
          }
          if (dotMeshesRef.current === dotsToClean || dotMeshesRef.current.length === 0) {
            dotMeshesRef.current = []
          }
        }, 600)
      }
    } else if (expandedProject !== null && prevProject !== null && expandedProject !== prevProject) {
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

    const createArrowTexture = async (direction: 'left' | 'right') => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')!

      try {
        const font = new FontFace('MochiBold', 'url(/fonts/MochibopBold-Demo.ttf)')
        await font.load()
        document.fonts.add(font)
      } catch {}

      ctx.clearRect(0, 0, 128, 128)
      ctx.fillStyle = 'white'
      ctx.font = '80px MochiBold, Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(direction === 'left' ? '<' : '>', 64, 64)
      const texture = new THREE.CanvasTexture(canvas)
      texture.needsUpdate = true
      return texture
    }

    const createDots = (plane: THREE.Mesh, imageCount: number) => {
      hoveredDotIndexRef.current = null
      hoveredArrowRef.current = null
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

      const isMobileSize = container.clientWidth < MD_BREAKPOINT
      const dotRadius = isMobileSize ? 0.055 : 0.03
      const glowRadius = isMobileSize ? 0.085 : 0.05
      const dotSpacing = isMobileSize ? 0.16 : 0.10
      const totalWidth = (imageCount - 1) * dotSpacing
      const startX = -totalWidth / 2

      const cardHalfWidth = sceneOptions.cardWidth / 2
      const dotY = -cardHalfWidth - (isMobileSize ? 0.14 : 0.08)

      const arrowSize = isMobileSize ? 0.28 : 0.18

      const leftArrowGeometry = new THREE.PlaneGeometry(arrowSize, arrowSize)
      const leftArrowMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        alphaTest: 0.1
      })
      const arrowOffset = isMobileSize ? 0.22 : 0.16
      const leftArrow = new THREE.Mesh(leftArrowGeometry, leftArrowMaterial)
      leftArrow.position.x = startX - arrowOffset
      leftArrow.position.y = dotY
      leftArrow.position.z = 0.01
      leftArrow.userData.isArrow = true
      leftArrow.userData.direction = 'left'
      leftArrow.userData.targetOpacity = 0.5
      leftArrow.userData.targetScale = 1
      dotGroup.add(leftArrow)
      arrowMeshesRef.current.left = leftArrow

      const rightArrowGeometry = new THREE.PlaneGeometry(arrowSize, arrowSize)
      const rightArrowMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        alphaTest: 0.1
      })
      const rightArrow = new THREE.Mesh(rightArrowGeometry, rightArrowMaterial)
      rightArrow.position.x = startX + totalWidth + arrowOffset
      rightArrow.position.y = dotY
      rightArrow.position.z = 0.01
      rightArrow.userData.isArrow = true
      rightArrow.userData.direction = 'right'
      rightArrow.userData.targetOpacity = 0.5
      rightArrow.userData.targetScale = 1
      dotGroup.add(rightArrow)
      arrowMeshesRef.current.right = rightArrow

      createArrowTexture('left').then(texture => {
        leftArrowMaterial.map = texture
        leftArrowMaterial.needsUpdate = true
      })
      createArrowTexture('right').then(texture => {
        rightArrowMaterial.map = texture
        rightArrowMaterial.needsUpdate = true
      })

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
        const plane = expandedPlaneRef.current
        if (plane) {
          plane.updateMatrixWorld(true)
        }

        const arrows = [arrowMeshesRef.current.left, arrowMeshesRef.current.right].filter(Boolean) as THREE.Mesh[]
        if (arrows.length > 0) {
          const arrowIntersects = raycaster.intersectObjects(arrows)
          if (arrowIntersects.length > 0) {
            const clickedArrow = arrowIntersects[0].object as THREE.Mesh
            const direction = clickedArrow.userData.direction as 'left' | 'right'
            if (direction === 'left') {
              const changeEvent = new CustomEvent('arrowClick', { detail: { direction: 'prev' } })
              container.dispatchEvent(changeEvent)
            } else {
              const changeEvent = new CustomEvent('arrowClick', { detail: { direction: 'next' } })
              container.dispatchEvent(changeEvent)
            }
            return
          }
        }

        if (dotMeshesRef.current.length > 0) {
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

    const handleArrowClick = (event: Event) => {
      const customEvent = event as CustomEvent<{ direction: 'prev' | 'next' }>
      const plane = expandedPlaneRef.current
      if (!plane) return
      const contentTextures = plane.userData.contentTextures as THREE.Texture[]
      if (!contentTextures || contentTextures.length === 0) return
      const currentIndex = plane.userData.currentImageIndex as number || 0
      const totalImages = contentTextures.length

      if (customEvent.detail.direction === 'prev') {
        const newIndex = (currentIndex - 1 + totalImages) % totalImages
        const changeEvent = new CustomEvent('dotClick', { detail: { index: newIndex } })
        container.dispatchEvent(changeEvent)
      } else {
        const newIndex = (currentIndex + 1) % totalImages
        const changeEvent = new CustomEvent('dotClick', { detail: { index: newIndex } })
        container.dispatchEvent(changeEvent)
      }
    }

    container.addEventListener('arrowClick', handleArrowClick)
    container.addEventListener('dotClick', handleDotClick)

    renderer.domElement.addEventListener('click', onCanvasClick)

    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      lastMousePosition.copy(mouse)

      if (expandedProjectRef.current !== null) {
        const plane = expandedPlaneRef.current
        if (plane) {
          plane.updateMatrixWorld(true)
        }
        raycaster.setFromCamera(mouse, camera)

        const arrows = [arrowMeshesRef.current.left, arrowMeshesRef.current.right].filter(Boolean) as THREE.Mesh[]
        if (arrows.length > 0) {
          const arrowIntersects = raycaster.intersectObjects(arrows)
          if (arrowIntersects.length > 0) {
            const hoveredArrow = arrowIntersects[0].object as THREE.Mesh
            hoveredArrowRef.current = hoveredArrow.userData.direction as 'left' | 'right'
            hoveredDotIndexRef.current = null
            renderer.domElement.style.cursor = 'pointer'
            return
          }
        }

        if (dotMeshesRef.current.length > 0) {
          const dotIntersects = raycaster.intersectObjects(dotMeshesRef.current)
          if (dotIntersects.length > 0) {
            const hoveredDot = dotIntersects[0].object as THREE.Mesh
            hoveredDotIndexRef.current = hoveredDot.userData.dotIndex as number
            hoveredArrowRef.current = null
            renderer.domElement.style.cursor = 'pointer'
            return
          }
        }

        hoveredDotIndexRef.current = null
        hoveredArrowRef.current = null
        renderer.domElement.style.cursor = 'default'
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

    const onTouchMoveGlobal = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0]
        mousePosition.x = (touch.clientX / container.clientWidth) * 2 - 1
        mousePosition.y = -(touch.clientY / container.clientHeight) * 2 + 1
      }
    }
    window.addEventListener('touchmove', onTouchMoveGlobal, { passive: true })

    const isMobile = () => container.clientWidth < MD_BREAKPOINT

    const getUnifiedScale = () => {
      const targetZ = 0.8
      const distFromCamera = camera.position.z - targetZ
      const vFov = (camera.fov * Math.PI) / 180
      const visibleHeight = 2 * Math.tan(vFov / 2) * distFromCamera
      const visibleWidth = visibleHeight * (container.clientWidth / container.clientHeight)
      const pixelsPerUnit = container.clientWidth / visibleWidth
      const baseCardPixels = sceneOptions.cardHeight * pixelsPerUnit

      if (isMobile()) {
        const targetLeftCardPixels = container.clientWidth * MOBILE_LAYOUT.CARD_WIDTH
        const scale = targetLeftCardPixels / baseCardPixels
        return clamp(scale, SCALE_LIMITS.MIN, SCALE_LIMITS.MAX)
      } else {
        const targetLeftCardPixels = container.clientWidth * DESKTOP_LAYOUT.LEFT_CARD
        const scale = targetLeftCardPixels / baseCardPixels
        return clamp(scale, SCALE_LIMITS.MIN, SCALE_LIMITS.MAX)
      }
    }

    const getExpandedTargetPosition = () => {
      const targetZ = 0.8
      const distFromCamera = camera.position.z - targetZ
      const vFov = (camera.fov * Math.PI) / 180
      const visibleHeight = 2 * Math.tan(vFov / 2) * distFromCamera
      const visibleWidth = visibleHeight * (container.clientWidth / container.clientHeight)

      const scale = getUnifiedScale()
      const scaledCardWidth = sceneOptions.cardHeight * scale

      if (isMobile()) {
        const targetX = 0
        const scaledCardHeight = sceneOptions.cardWidth * scale
        const viewportTop = visibleHeight / 2
        const cardTopY = viewportTop - (visibleHeight * MOBILE_LAYOUT.TOP_MARGIN)
        const targetY = cardTopY - (scaledCardHeight / 2)
        return new THREE.Vector3(targetX, targetY, targetZ)
      } else {
        const rightEdgePercent = DESKTOP_LAYOUT.LEFT_MARGIN + DESKTOP_LAYOUT.LEFT_CARD
        const rightEdgeX = -visibleWidth / 2 + visibleWidth * rightEdgePercent
        const targetX = rightEdgeX - scaledCardWidth / 2
        const targetY = 0
        return new THREE.Vector3(targetX, targetY, targetZ)
      }
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

            let preservedRotX = 0
            let preservedRotY = 0
            if (expandedPlane) {
              preservedRotX = expandedPlane.rotation.x
              preservedRotY = expandedPlane.rotation.y
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
            newPlane.rotation.x = preservedRotX
            newPlane.rotation.y = preservedRotY
            newPlane.rotation.z = Math.PI / 2

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


      planes.forEach(plane => {
        const isExpandedPlane = plane === expandedPlane && isExpanded

        const mat = plane.material as THREE.ShaderMaterial

        if (isExpandedPlane) {
          const currentStage = expansionStageRef.current
          const target = getExpandedTargetPosition()
          const targetLocalX = target.x - scene.position.x
          const floatOffset = getFloatOffset(floatTime, 'left')
          const targetLocalY = target.y + floatOffset.y
          const targetLocalZ = target.z + floatOffset.x

          const dx = targetLocalX - plane.position.x
          const dy = targetLocalY - plane.position.y
          const dz = targetLocalZ - plane.position.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          const easeAmount = getEasedMovementAmount(distance)

          if (distance > 0.01) {
            plane.position.x += dx * easeAmount
            plane.position.y += dy * easeAmount
            plane.position.z += dz * easeAmount
          } else {
            plane.position.x = targetLocalX
            plane.position.y = targetLocalY
            plane.position.z = targetLocalZ

            if (currentStage === 'expanding') {
              expansionStageRef.current = 'expanded'
              setExpansionStage('expanded')
            }
          }

          const targetScale = getUnifiedScale()
          const newScale = plane.scale.x + (targetScale - plane.scale.x) * easeAmount
          plane.scale.set(newScale, newScale, newScale)

          const MAX_ROTATION = 0.35
          const ROTATION_SENSITIVITY = 0.4
          const cardWorldPos = new THREE.Vector3()
          plane.getWorldPosition(cardWorldPos)
          cardWorldPos.project(camera)
          const offsetX = smoothMousePosition.x - cardWorldPos.x
          const offsetY = smoothMousePosition.y - cardWorldPos.y
          const targetRotY = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, offsetX * ROTATION_SENSITIVITY))
          const targetRotX = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, -offsetY * ROTATION_SENSITIVITY))
          plane.rotation.y += (targetRotY - plane.rotation.y) * 0.15
          plane.rotation.x += (targetRotX - plane.rotation.x) * 0.15
          const targetRotZ = Math.PI / 2
          plane.rotation.z += (targetRotZ - plane.rotation.z) * easeAmount

          if (dotGroupRef.current) {
            dotGroupRef.current.rotation.z = -plane.rotation.z
          }

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

          const dotsVisible = isExpanded
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

          const arrows = [arrowMeshesRef.current.left, arrowMeshesRef.current.right]
          arrows.forEach(arrow => {
            if (!arrow) return
            const arrowMat = arrow.material as THREE.MeshBasicMaterial
            const direction = arrow.userData.direction as 'left' | 'right'
            const isHovered = hoveredArrowRef.current === direction
            const targetOpacity = dotsVisible ? (isHovered ? 1 : 0.5) : 0
            arrowMat.opacity += (targetOpacity - arrowMat.opacity) * 0.15

            const targetScale = isHovered ? 1.3 : 1.0
            const currentScale = arrow.scale.x
            const newScale = currentScale + (targetScale - currentScale) * 0.2
            arrow.scale.set(newScale, newScale, 1)
          })

        } else if (isExpanded && expandedPlane) {
          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            const targetOpacity = 0.15
            mat.uniforms.opacity.value = currentOpacity + (targetOpacity - currentOpacity) * 0.08
          }
        } else if (!isExpanded && animatingRef.current && expandedPlane) {
          const targetX = plane.userData.initialX
          const targetY = plane.userData.initialY ?? -0.35
          const targetZ = 0
          const dx = targetX - plane.position.x
          const dy = targetY - plane.position.y
          const dz = targetZ - plane.position.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          const easeAmount = getEasedMovementAmount(distance)

          if (distance > 0.01) {
            plane.position.x += dx * easeAmount
            plane.position.y += dy * easeAmount
            plane.position.z += dz * easeAmount
          } else {
            plane.position.x = targetX
            plane.position.y = targetY
            plane.position.z = targetZ
          }

          plane.rotation.x += (0 - plane.rotation.x) * easeAmount
          plane.rotation.y += (0 - plane.rotation.y) * easeAmount
          plane.rotation.z += (0 - plane.rotation.z) * easeAmount

          if (Math.abs(plane.rotation.x) < 0.01 && Math.abs(plane.rotation.y) < 0.01 && Math.abs(plane.rotation.z) < 0.01) {
            plane.rotation.x = 0
            plane.rotation.y = 0
            plane.rotation.z = 0
          }

          const targetScale = 1
          plane.scale.x += (targetScale - plane.scale.x) * easeAmount
          plane.scale.y += (targetScale - plane.scale.y) * easeAmount
          plane.scale.z += (targetScale - plane.scale.z) * easeAmount

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

            const arrows = [arrowMeshesRef.current.left, arrowMeshesRef.current.right]
            arrows.forEach(arrow => {
              if (!arrow) return
              const arrowMat = arrow.material as THREE.MeshBasicMaterial
              arrowMat.opacity += (0 - arrowMat.opacity) * 0.15
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
          const rotDiff = Math.abs(plane.rotation.x) + Math.abs(plane.rotation.y) + Math.abs(plane.rotation.z)
          return scaleDiff < 0.01 && posDiff < 0.01 && rotDiff < 0.01
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
      window.removeEventListener('touchmove', onTouchMoveGlobal)
      container.removeEventListener('arrowClick', handleArrowClick)
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
      renderer.dispose()
    }
  }, [containerReady])

  return (
    <div
      ref={containerRef}
      className={`absolute inset-x-0 top-0 h-screen z-[38] overflow-visible transition-opacity [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:overflow-visible ${!visible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      onTouchStart={handleCarouselTouchStart}
      onTouchEnd={handleCarouselTouchEnd}
      onMouseDown={handleCarouselTouchStart}
      onMouseUp={handleCarouselTouchEnd}
    />
  )
}
