'use client'

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { projects, sceneOptions } from '@/data/projects'
import { usePerformanceMode } from '@/contexts/performance-mode-context'
import { getPlaneWidth, createCardGeometry, createCardMaterial, extractGlowColor } from '@/lib/carousel-helpers'
import { handleWheelScroll, updateScrollVelocity } from '@/lib/carousel-animation'
import {
  DESKTOP_LAYOUT,
  MOBILE_LAYOUT,
  MD_BREAKPOINT,
  BASE_RIGHT_CARD_WIDTH,
  SCALE_LIMITS,
} from '@/lib/layout-config'
import { getFloatOffset, getEasedMovementAmount, clamp, easeOutQuart } from '@/lib/animation-utils'

export type ExpansionStage = 'none' | 'expanding' | 'expanded'

type AnimPhase = 'idle' | 'expanding' | 'expanded' | 'collapsing'

interface AnimStateData {
  phase: AnimPhase
  activePlane: THREE.Mesh | null
  projectId: number | null
  progress: number  // 0-1 for current animation
  startPos: THREE.Vector3 | null
  startQuat: THREE.Quaternion | null
  startScale: number
  frozenSceneX: number
}

interface ProjectSliderProps {
  isPaused: boolean
  onProjectClick: (projectId: number | null) => void
  onPauseChange: (paused: boolean) => void
  onExpansionStageChange?: (stage: ExpansionStage) => void
  visible: boolean
  expandedProject: number | null
  onPrevProject?: () => void
  onNextProject?: () => void
  onReady?: () => void
}

export default function ProjectSlider({ isPaused, onProjectClick, onPauseChange, onExpansionStageChange, visible, expandedProject, onPrevProject, onNextProject, onReady }: ProjectSliderProps) {
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
  const lastInputTimeRef = useRef(0)
  const hoveredPlaneRef = useRef<THREE.Mesh | null>(null)
  const isPausedRef = useRef(false)
  const initializedRef = useRef(false)
  const [containerReady, setContainerReady] = useState(false)
  const [allVideosLoaded, setAllVideosLoaded] = useState(false)
  const onReadyCalledRef = useRef(false)

  const animStateRef = useRef<AnimStateData>({
    phase: 'idle',
    activePlane: null,
    projectId: null,
    progress: 0,
    startPos: null,
    startQuat: null,
    startScale: 1,
    frozenSceneX: 0
  })

  const expandedPlaneRef = useRef<THREE.Mesh | null>(null)
  const expandedProjectRef = useRef<number | null>(null)
  const originalPositionRef = useRef<THREE.Vector3 | null>(null)
  const originalScaleRef = useRef<number>(1)

  const expansionStageRef = useRef<ExpansionStage>('none')
  const [expansionStage, setExpansionStage] = useState<ExpansionStage>('none')

  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const carouselTouchStartRef = useRef<{ x: number; y: number } | null>(null)

  const dotMeshesRef = useRef<THREE.Mesh[]>([])
  const dotGroupRef = useRef<THREE.Group | null>(null)
  const hoveredDotIndexRef = useRef<number | null>(null)
  const arrowMeshesRef = useRef<{ left: THREE.Mesh | null; right: THREE.Mesh | null }>({ left: null, right: null })
  const hoveredArrowRef = useRef<'left' | 'right' | null>(null)

  const returningPlanesRef = useRef<THREE.Mesh[]>([])
  const imagePlanesRef = useRef<THREE.Object3D[]>([])
  const imagePlanesGroupRef = useRef<THREE.Group | null>(null)
  const carouselOffsetRef = useRef<number>(0) // Current scroll offset
  const carouselTargetOffsetRef = useRef<number>(0) // Target scroll offset
  const imagePlanesRevealedRef = useRef<boolean>(false) // Whether image planes have animated in
  const imagePlanesExitedRef = useRef<boolean>(false) // Whether image planes have finished exiting
  const crossfadeProgressRef = useRef<number>(0) // 0 = thumbnail visible, 1 = selection images visible

  const onProjectClickRef = useRef(onProjectClick)
  const onPauseChangeRef = useRef(onPauseChange)
  const onExpansionStageChangeRef = useRef(onExpansionStageChange)
  const onPrevProjectRef = useRef(onPrevProject)
  const onNextProjectRef = useRef(onNextProject)
  const onReadyRef = useRef(onReady)

  const { isLowPerformance } = usePerformanceMode()

  useEffect(() => {
    onProjectClickRef.current = onProjectClick
    onPauseChangeRef.current = onPauseChange
    onExpansionStageChangeRef.current = onExpansionStageChange
    onPrevProjectRef.current = onPrevProject
    onNextProjectRef.current = onNextProject
    onReadyRef.current = onReady
  }, [onProjectClick, onPauseChange, onExpansionStageChange, onPrevProject, onNextProject, onReady])

  // Signal ready when all videos are loaded
  useEffect(() => {
    if (allVideosLoaded && !onReadyCalledRef.current) {
      onReadyCalledRef.current = true
      onReadyRef.current?.()
    }
  }, [allVideosLoaded])

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    onExpansionStageChangeRef.current?.(expansionStage)
  }, [expansionStage])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (expandedProjectRef.current === null) return

      const container = containerRef.current
      if (!container) return

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          container.dispatchEvent(new CustomEvent('arrowClick', { detail: { direction: 'prev' } }))
          break
        case 'ArrowDown':
          e.preventDefault()
          container.dispatchEvent(new CustomEvent('arrowClick', { detail: { direction: 'next' } }))
          break
        case 'ArrowLeft':
          e.preventDefault()
          onPrevProjectRef.current?.()
          break
        case 'ArrowRight':
          e.preventDefault()
          onNextProjectRef.current?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const prevExpandedProjectRef = useRef<number | null>(null)
  const flickerTimeRef = useRef(0)
  const swapFadeRef = useRef(1) // 0→1 fade-in progress for new content after swap
  const outgoingContainerRef = useRef<THREE.Group | null>(null)

  const cleanupPlaneAttachments = (plane: THREE.Mesh) => {
    if (dotGroupRef.current) {
      // Detach pooled children without disposing
      while (dotGroupRef.current.children.length > 0) {
        dotGroupRef.current.remove(dotGroupRef.current.children[0])
      }
      plane.remove(dotGroupRef.current)
      dotGroupRef.current = null
      arrowMeshesRef.current = { left: null, right: null }
    }
    if (imagePlanesGroupRef.current) {
      // Detach pooled children without disposing
      while (imagePlanesGroupRef.current.children.length > 0) {
        imagePlanesGroupRef.current.remove(imagePlanesGroupRef.current.children[0])
      }
      plane.remove(imagePlanesGroupRef.current)
      imagePlanesGroupRef.current = null
    }
    dotMeshesRef.current = []
    imagePlanesRef.current = []
    imagePlanesRevealedRef.current = false
    crossfadeProgressRef.current = 0
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const prevProject = prevExpandedProjectRef.current
    prevExpandedProjectRef.current = expandedProject
    expandedProjectRef.current = expandedProject

    const anim = animStateRef.current

    if (expandedProject === null && (anim.phase === 'expanded' || anim.phase === 'expanding') && anim.activePlane) {
      anim.phase = 'collapsing'
      anim.progress = 0
      anim.startPos = anim.activePlane.position.clone()
      anim.startQuat = anim.activePlane.quaternion.clone()
      anim.startScale = anim.activePlane.scale.x

      hoveredPlaneRef.current = null
      onPauseChangeRef.current(false)

      expansionStageRef.current = 'none'
      setExpansionStage('none')
      imagePlanesExitedRef.current = false

      imagePlanesRef.current.forEach(imgPlane => {
        const baseOffset = imgPlane.userData.baseOffset as number
        const isFirstFrame = imgPlane.userData.isFirstFrame as boolean
        const exitDistance = 2.0
        imgPlane.userData.isExiting = true
        imgPlane.userData.exitTarget = isFirstFrame ? 0 : (baseOffset >= 0 ? baseOffset + exitDistance : baseOffset - exitDistance)
      })
    }
    else if (expandedProject !== null && prevProject !== null && expandedProject !== prevProject && anim.phase === 'expanded') {
      flickerTimeRef.current = 0
      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0
      crossfadeProgressRef.current = 1
      imagePlanesRevealedRef.current = true
    }

    setCurrentImageIndex(0)
  }, [expandedProject])
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateDotColors = (activeIndex: number) => {
    dotMeshesRef.current.forEach((dot, index) => {
      const glowMesh = dot.userData.glowMesh as THREE.Mesh | undefined

      if (index === activeIndex) {
        dot.userData.targetOpacity = 1
        if (glowMesh) glowMesh.userData.targetOpacity = 0.4
      } else {
        dot.userData.targetOpacity = 0.4
        if (glowMesh) glowMesh.userData.targetOpacity = 0
      }
    })
  }

  const changeImage = (newIndex: number) => {
    const plane = expandedPlaneRef.current
    if (!plane) return

    const imagePlanes = imagePlanesRef.current
    if (!imagePlanes || imagePlanes.length === 0) return
    if (newIndex < 0 || newIndex >= imagePlanes.length) return
    if (newIndex === currentImageIndex) return

    const spacing = imagePlanesGroupRef.current?.userData.spacing as number || 1.2
    carouselTargetOffsetRef.current = newIndex * spacing

    plane.userData.currentImageIndex = newIndex
    setCurrentImageIndex(newIndex)
    updateDotColors(newIndex)
  }

  const goToNextImage = () => {
    const imagePlanes = imagePlanesRef.current
    if (!imagePlanes || imagePlanes.length === 0) return
    const newIndex = Math.min(currentImageIndex + 1, imagePlanes.length - 1)
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
      allProjects.push(projects[(projects.length - 1 - (i % projects.length))])
    }

    const planes: THREE.Mesh[] = []
    planesRef.current = planes

    // Create a texture cache - load each unique project's assets only ONCE
    const textureLoader = new THREE.TextureLoader()
    const projectAssetsCache = new Map<number, {
      frameTexture: THREE.Texture
      thumbnailVideo: HTMLVideoElement | null
      thumbnailTexture: THREE.Texture | THREE.VideoTexture
      contentTextures: THREE.Texture[]
      videoAspectRatio: number
    }>()

    // Track total UNIQUE assets to load: videos + frame textures + flash bg
    const totalAssetsToLoad = projects.length * 2 + 1 // 1 video + 1 frame per project + 1 flash bg
    let assetsLoadedCount = 0

    const checkAllAssetsLoaded = () => {
      assetsLoadedCount++
      if (assetsLoadedCount >= totalAssetsToLoad) {
        setAllVideosLoaded(true)
      }
    }

    // Preload flash background image
    const flashBgImg = new Image()
    flashBgImg.onload = checkAllAssetsLoaded
    flashBgImg.onerror = checkAllAssetsLoaded // Count even on error to not block forever
    flashBgImg.src = '/projects/images/flash_bg.webp'

    // Detect mobile devices for static thumbnails (videos are heavy on phones)
    const isMobileDevice = container.clientWidth < MD_BREAKPOINT

    // Pre-load all unique project assets once
    projects.forEach((project) => {
      // Load frame texture with callback
      const frameTexture = textureLoader.load(
        project.frame,
        () => checkAllAssetsLoaded(), // onLoad
        undefined, // onProgress
        () => checkAllAssetsLoaded() // onError - still count it to not block forever
      )

      // Load content textures (don't block on these, they're for expanded view)
      // Pre-upload to GPU as each loads so first expand doesn't stall
      const contentTextures = project.images.map(imgPath =>
        textureLoader.load(imgPath, (tex) => {
          if (rendererRef.current) rendererRef.current.initTexture(tex)
        })
      )

      // Use static thumbnails on mobile devices or low performance mode
      if (isLowPerformance || isMobileDevice) {
        const thumbnailTexture = textureLoader.load(
          project.thumbnailImage,
          (texture) => {
            if (texture.image && texture.image.width && texture.image.height) {
              assets.videoAspectRatio = texture.image.width / texture.image.height
            }
            checkAllAssetsLoaded()
          },
          undefined,
          () => checkAllAssetsLoaded()
        )
        thumbnailTexture.minFilter = THREE.LinearFilter
        thumbnailTexture.magFilter = THREE.LinearFilter

        const assets = {
          frameTexture,
          thumbnailVideo: null,
          thumbnailTexture: thumbnailTexture as THREE.Texture | THREE.VideoTexture,
          contentTextures,
          videoAspectRatio: 1.0
        }

        projectAssetsCache.set(project.id, assets)
      } else {
        // High performance mode: use video thumbnails
        const video = document.createElement('video')
        video.src = project.thumbnail
        video.loop = true
        video.muted = true
        video.playsInline = true
        video.autoplay = true
        video.crossOrigin = 'anonymous'
        video.preload = 'auto'

        let videoMarkedReady = false

        const handleVideoReady = () => {
          if (videoMarkedReady) return
          videoMarkedReady = true
          checkAllAssetsLoaded()
        }

        // Use canplaythrough - most reliable signal that video can play smoothly
        video.addEventListener('canplaythrough', handleVideoReady)

        // Also listen for loadeddata as backup (fires when first frame is available)
        video.addEventListener('loadeddata', () => {
          // Small delay to ensure frame is actually rendered
          setTimeout(handleVideoReady, 100)
        })

        // Handle video errors - don't block loading if video fails
        video.addEventListener('error', handleVideoReady)

        // Fallback: if video already has data when we attach listeners
        if (video.readyState >= 3) {
          handleVideoReady()
        }

        // Final fallback timeout per video (15s)
        setTimeout(handleVideoReady, 15000)

        video.play().catch(() => {})

        const thumbnailTexture = new THREE.VideoTexture(video)
        thumbnailTexture.minFilter = THREE.LinearFilter
        thumbnailTexture.magFilter = THREE.LinearFilter

        const assets = {
          frameTexture,
          thumbnailVideo: video,
          thumbnailTexture,
          contentTextures,
          videoAspectRatio: 1.0
        }

        video.addEventListener('loadedmetadata', () => {
          if (video.videoWidth && video.videoHeight) {
            assets.videoAspectRatio = video.videoWidth / video.videoHeight
          }
        })

        projectAssetsCache.set(project.id, assets)
      }
    })

    // Now create planes, reusing cached assets
    allProjects.forEach((project, i) => {
      const assets = projectAssetsCache.get(project.id)!
      const { frameTexture, thumbnailVideo, thumbnailTexture, contentTextures } = assets

      const geometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)
      const cardAspectRatio = sceneOptions.cardWidth / sceneOptions.cardHeight
      const frameAspectRatio = 389 / 596 // Frame image aspect ratio
      const glowColor = extractGlowColor(project.titleGradient)
      const material = createCardMaterial(frameTexture, thumbnailTexture, sceneOptions.curve, 1.0, cardAspectRatio, false, frameAspectRatio, undefined, undefined, glowColor)

      // Update aspect ratio from cached value or listen for updates
      if (assets.videoAspectRatio !== 1.0) {
        material.uniforms.contentAspectRatio.value = assets.videoAspectRatio
      }
      if (thumbnailVideo) {
        thumbnailVideo.addEventListener('loadedmetadata', () => {
          if (thumbnailVideo.videoWidth && thumbnailVideo.videoHeight) {
            material.uniforms.contentAspectRatio.value = thumbnailVideo.videoWidth / thumbnailVideo.videoHeight
          }
        })
      } else {
        // For static images, check if already loaded or wait for load
        const img = thumbnailTexture.image as HTMLImageElement | undefined
        if (img && img.width && img.height) {
          material.uniforms.contentAspectRatio.value = img.width / img.height
        } else {
          // Image not yet loaded, poll for it
          const checkImageLoaded = () => {
            const loadedImg = thumbnailTexture.image as HTMLImageElement | undefined
            if (loadedImg && loadedImg.width && loadedImg.height) {
              material.uniforms.contentAspectRatio.value = loadedImg.width / loadedImg.height
            } else {
              requestAnimationFrame(checkImageLoaded)
            }
          }
          requestAnimationFrame(checkImageLoaded)
        }
      }

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
        frameTexture,
        thumbnailVideo,
        thumbnailTexture,
        contentTextures,
        currentImageIndex: 0
      }

      scene.add(plane)
      planes.push(plane)
    })

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const lastMousePosition = new THREE.Vector2(-999, -999)

    const createArrowTexture = async (direction: 'left' | 'right' | 'up' | 'down') => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')!

      ctx.clearRect(0, 0, 128, 128)
      ctx.fillStyle = 'white'
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 14
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const cx = 64
      const cy = 64
      const size = 30

      ctx.beginPath()
      if (direction === 'left') {
        ctx.moveTo(cx + size * 0.5, cy - size)
        ctx.lineTo(cx - size * 0.5, cy)
        ctx.lineTo(cx + size * 0.5, cy + size)
      } else if (direction === 'right') {
        ctx.moveTo(cx - size * 0.5, cy - size)
        ctx.lineTo(cx + size * 0.5, cy)
        ctx.lineTo(cx - size * 0.5, cy + size)
      } else if (direction === 'up') {
        ctx.moveTo(cx - size, cy + size * 0.5)
        ctx.lineTo(cx, cy - size * 0.5)
        ctx.lineTo(cx + size, cy + size * 0.5)
      } else {
        ctx.moveTo(cx - size, cy - size * 0.5)
        ctx.lineTo(cx, cy + size * 0.5)
        ctx.lineTo(cx + size, cy - size * 0.5)
      }
      ctx.stroke()

      const texture = new THREE.CanvasTexture(canvas)
      texture.needsUpdate = true
      return texture
    }

    const createDots = (plane: THREE.Mesh, imageCount: number) => {
      hoveredDotIndexRef.current = null
      hoveredArrowRef.current = null
      if (dotGroupRef.current) {
        // Detach pooled children before removing group
        while (dotGroupRef.current.children.length > 0) {
          dotGroupRef.current.remove(dotGroupRef.current.children[0])
        }
        plane.remove(dotGroupRef.current)
      }

      const dotGroup = new THREE.Group()
      dotGroup.renderOrder = 10
      dotGroupRef.current = dotGroup
      const dots: THREE.Mesh[] = []

      const isMobileSize = container.clientWidth < MD_BREAKPOINT
      const dotSpacing = isMobileSize ? 0.16 : 0.10
      const totalSpan = (imageCount - 1) * dotSpacing

      const cardHalfWidth = sceneOptions.cardWidth / 2
      const cardHalfHeight = sceneOptions.cardHeight / 2

      const isVertical = !isMobileSize
      let startX: number, startY: number
      if (isVertical) {
        startX = cardHalfHeight + 0.12
        startY = totalSpan / 2
      } else {
        startX = -totalSpan / 2
        startY = -cardHalfWidth - 0.14
      }

      const arrowOffset = isMobileSize ? 0.22 : 0.14

      // Reuse pooled arrows
      const firstArrow = arrowPool[0].mesh
      const firstArrowMaterial = arrowPool[0].material
      firstArrowMaterial.opacity = 0
      if (isVertical) {
        firstArrow.position.set(startX, startY + arrowOffset, 0.01)
      } else {
        firstArrow.position.set(startX - arrowOffset, startY, 0.01)
      }
      firstArrow.userData.isArrow = true
      firstArrow.userData.direction = 'left'
      firstArrow.userData.targetOpacity = 0.5
      firstArrow.userData.targetScale = 1
      firstArrow.scale.set(1, 1, 1)
      dotGroup.add(firstArrow)
      arrowMeshesRef.current.left = firstArrow

      const secondArrow = arrowPool[1].mesh
      const secondArrowMaterial = arrowPool[1].material
      secondArrowMaterial.opacity = 0
      if (isVertical) {
        secondArrow.position.set(startX, startY - totalSpan - arrowOffset, 0.01)
      } else {
        secondArrow.position.set(startX + totalSpan + arrowOffset, startY, 0.01)
      }
      secondArrow.userData.isArrow = true
      secondArrow.userData.direction = 'right'
      secondArrow.userData.targetOpacity = 0.5
      secondArrow.userData.targetScale = 1
      secondArrow.scale.set(1, 1, 1)
      dotGroup.add(secondArrow)
      arrowMeshesRef.current.right = secondArrow

      // Apply pre-created arrow textures
      const firstArrowDir = isVertical ? 'up' : 'left'
      const secondArrowDir = isVertical ? 'down' : 'right'
      if (arrowTextures[firstArrowDir]) {
        firstArrowMaterial.map = arrowTextures[firstArrowDir]
        firstArrowMaterial.needsUpdate = true
      } else {
        createArrowTexture(firstArrowDir).then(tex => {
          arrowTextures[firstArrowDir] = tex
          firstArrowMaterial.map = tex
          firstArrowMaterial.needsUpdate = true
        })
      }
      if (arrowTextures[secondArrowDir]) {
        secondArrowMaterial.map = arrowTextures[secondArrowDir]
        secondArrowMaterial.needsUpdate = true
      } else {
        createArrowTexture(secondArrowDir).then(tex => {
          arrowTextures[secondArrowDir] = tex
          secondArrowMaterial.map = tex
          secondArrowMaterial.needsUpdate = true
        })
      }

      for (let i = 0; i < imageCount && i < dotPool.length; i++) {
        const { glow, dot } = dotPool[i]
        const glowMat = glow.material as THREE.MeshBasicMaterial
        const dotMat = dot.material as THREE.MeshBasicMaterial

        glowMat.opacity = 0
        dotMat.opacity = 0

        if (isVertical) {
          glow.position.set(startX, startY - i * dotSpacing, 0.01)
          dot.position.set(startX, startY - i * dotSpacing, 0.01)
        } else {
          glow.position.set(startX + i * dotSpacing, startY, 0.01)
          dot.position.set(startX + i * dotSpacing, startY, 0.01)
        }

        glow.userData.targetOpacity = i === 0 ? 0.4 : 0
        dot.userData.dotIndex = i
        dot.userData.glowMesh = glow
        dot.userData.targetOpacity = i === 0 ? 1 : 0.4
        dot.userData.targetScale = 1
        dot.userData.isAnimating = i === 0
        dot.userData.animProgress = 0
        dot.scale.set(1, 1, 1)

        dotGroup.add(glow)
        dotGroup.add(dot)
        dots.push(dot)
      }

      dotMeshesRef.current = dots
      plane.add(dotGroup)
    }

    const createImagePlanes = (plane: THREE.Mesh, contentTextures: THREE.Texture[], frameTexture: THREE.Texture, skipRevealAnimation = false) => {
      if (imagePlanesGroupRef.current) {
        // Detach pooled children before removing group
        while (imagePlanesGroupRef.current.children.length > 0) {
          imagePlanesGroupRef.current.remove(imagePlanesGroupRef.current.children[0])
        }
        plane.remove(imagePlanesGroupRef.current)
      }

      const imagePlanesGroup = new THREE.Group()
      imagePlanesGroupRef.current = imagePlanesGroup
      const imagePlanes: THREE.Object3D[] = []

      const isMobileSize = container.clientWidth < MD_BREAKPOINT
      const isVerticalOnScreen = !isMobileSize

      const scaledCardWidth = sceneOptions.cardWidth
      const scaledCardHeight = sceneOptions.cardHeight

      const spacing = isMobileSize
        ? scaledCardHeight + 0.5
        : scaledCardWidth + 0.05
      const leftShiftAmount = 0

      const cardAspectRatio = sceneOptions.cardWidth / sceneOptions.cardHeight

      imagePlanesGroup.userData = {
        spacing,
        isVerticalOnScreen,
        leftShiftAmount,
        introProgress: skipRevealAnimation ? 1 : 0
      }

      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0
      imagePlanesRevealedRef.current = skipRevealAnimation

      contentTextures.forEach((texture, i) => {
        if (i >= imagePlanePool.length) return

        const isFirstFrame = i === 0
        const totalImages = contentTextures.length
        const halfCount = Math.floor(totalImages / 2)

        let finalOffset: number
        if (i === 0) {
          finalOffset = 0
        } else if (i <= halfCount) {
          finalOffset = -spacing * i
        } else {
          finalOffset = spacing * (totalImages - i)
        }

        const entryDistance = 2.0
        const startingStackOffset = finalOffset >= 0
          ? finalOffset + entryDistance
          : finalOffset - entryDistance

        let contentAspectRatio = 1.0
        const img = texture.image as HTMLImageElement | undefined
        if (img && img.width && img.height) {
          contentAspectRatio = img.width / img.height
        }

        // Reuse pooled objects instead of creating new ones
        const pooled = imagePlanePool[i]
        const imageGroup = pooled.group
        const cardMaterial = pooled.material
        const cardPlane = pooled.mesh

        // Update material uniforms
        cardMaterial.uniforms.frameTex.value = frameTexture
        cardMaterial.uniforms.contentTex.value = texture
        cardMaterial.uniforms.contentAspectRatio.value = contentAspectRatio
        cardMaterial.uniforms.cardAspectRatio.value = cardAspectRatio
        cardMaterial.uniforms.isExpanded.value = 1.0
        cardMaterial.uniforms.opacity.value = skipRevealAnimation ? 1 : 0
        cardMaterial.uniforms.rotateContent.value = 1.0
        cardMaterial.depthWrite = false

        texture.onUpdate = () => {
          const loadedImg = texture.image as HTMLImageElement | undefined
          if (loadedImg && loadedImg.width && loadedImg.height) {
            cardMaterial.uniforms.contentAspectRatio.value = loadedImg.width / loadedImg.height
          }
        }

        const startOffset = skipRevealAnimation ? finalOffset : (isFirstFrame ? finalOffset : startingStackOffset)
        if (isVerticalOnScreen) {
          imageGroup.position.set(startOffset, leftShiftAmount, 0)
        } else {
          imageGroup.position.set(0, startOffset, 0)
        }
        imageGroup.position.z = 0
        imageGroup.rotation.set(0, 0, 0)
        imageGroup.scale.set(1, 1, 1)

        imageGroup.userData = {
          imageIndex: i,
          baseOffset: finalOffset,
          startingOffset: startingStackOffset,
          currentAnimOffset: startOffset,
          targetAnimOffset: finalOffset,
          isVerticalOnScreen,
          isFirstFrame,
          leftShift: leftShiftAmount,
          currentRotY: 0,
          floatPhaseOffset: i * 0.7,
          cardPlane,
          cardMaterial
        }

        imagePlanesGroup.add(imageGroup)
        imagePlanes.push(imageGroup)
      })

      imagePlanesRef.current = imagePlanes
      plane.add(imagePlanesGroup)

      if (skipRevealAnimation) {
        const mat = plane.material as THREE.ShaderMaterial
        if (mat.uniforms.opacity) {
          mat.uniforms.opacity.value = 0
        }
      }
    }

    const onCanvasClick = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const anim = animStateRef.current

      if (anim.activePlane && (anim.phase === 'expanded' || anim.phase === 'expanding')) {
        anim.activePlane.updateMatrixWorld(true)

        const arrows = [arrowMeshesRef.current.left, arrowMeshesRef.current.right].filter(Boolean) as THREE.Mesh[]
        if (arrows.length > 0) {
          const arrowIntersects = raycaster.intersectObjects(arrows)
          if (arrowIntersects.length > 0) {
            const clickedArrow = arrowIntersects[0].object as THREE.Mesh
            const direction = clickedArrow.userData.direction as 'left' | 'right'
            container.dispatchEvent(new CustomEvent('arrowClick', {
              detail: { direction: direction === 'left' ? 'prev' : 'next' }
            }))
            return
          }
        }

        if (dotMeshesRef.current.length > 0) {
          const dotIntersects = raycaster.intersectObjects(dotMeshesRef.current)
          if (dotIntersects.length > 0) {
            const clickedDot = dotIntersects[0].object as THREE.Mesh
            container.dispatchEvent(new CustomEvent('dotClick', {
              detail: { index: clickedDot.userData.dotIndex as number }
            }))
            return
          }
        }
      }

      // Block all clicks while collapsing — wait for it to finish
      if (anim.phase === 'collapsing') {
        return
      }

      const intersects = raycaster.intersectObjects(planes)

      if (intersects.length === 0) {
        return
      }

      const clickedPlane = intersects[0].object as THREE.Mesh

      if (anim.phase !== 'idle' && anim.phase !== 'expanded' && anim.phase !== 'expanding') return

      const projectId = clickedPlane.userData.projectId

      // Don't allow clicking background cards while a card is expanded
      if ((anim.phase === 'expanded' || anim.phase === 'expanding') && anim.activePlane && anim.activePlane !== clickedPlane) {
        return
      }

      // Same card re-clicked during expanded/expanding
      if ((anim.phase === 'expanded' || anim.phase === 'expanding') && anim.activePlane === clickedPlane) {
        imagePlanesRef.current.forEach(ip => {
          ip.userData.isExiting = false
        })
        imagePlanesExitedRef.current = false
        onPauseChangeRef.current(true)
        onProjectClickRef.current(projectId)
        return
      }

      // Different card — cleanup old active plane
      if ((anim.phase === 'expanded' || anim.phase === 'expanding') && anim.activePlane) {
        cleanupPlaneAttachments(anim.activePlane)
        returningPlanesRef.current = returningPlanesRef.current.filter(p => p !== anim.activePlane)
        returningPlanesRef.current.push(anim.activePlane)
      }

      returningPlanesRef.current = returningPlanesRef.current.filter(p => p !== clickedPlane)

      dotMeshesRef.current = []
      imagePlanesRef.current = []
      arrowMeshesRef.current = { left: null, right: null }
      imagePlanesRevealedRef.current = false
      imagePlanesExitedRef.current = false
      crossfadeProgressRef.current = 0
      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0
      const projectData = projects.find(p => p.id === projectId)
      const imageCount = projectData?.images?.length || 0

      const clickedMat = clickedPlane.material as THREE.ShaderMaterial
      if (clickedMat.uniforms.opacity) clickedMat.uniforms.opacity.value = 1
      if (clickedMat.uniforms.isExpanded) clickedMat.uniforms.isExpanded.value = 0

      anim.phase = 'expanding'
      anim.activePlane = clickedPlane
      anim.projectId = projectId
      anim.progress = 0
      anim.startPos = clickedPlane.position.clone()
      anim.startQuat = clickedPlane.quaternion.clone()
      anim.startScale = clickedPlane.scale.x
      anim.frozenSceneX = scene.position.x

      expandedPlaneRef.current = clickedPlane
      expansionStageRef.current = 'expanding'
      setExpansionStage('expanding')

      isManualScrollingRef.current = false
      velocityRef.current = 0
      targetTimeRef.current = timeRef.current

      const worldPos = new THREE.Vector3()
      clickedPlane.getWorldPosition(worldPos)
      originalPositionRef.current = worldPos.clone()
      originalScaleRef.current = clickedPlane.scale.x
      clickedPlane.userData.originalWorldX = worldPos.x
      clickedPlane.userData.scenePositionAtClick = scene.position.x

      // Defer parent state updates so they don't block the first animation frame
      requestAnimationFrame(() => {
        onPauseChangeRef.current(true)
        onProjectClickRef.current(projectId)
      })

      const contentTextures = clickedPlane.userData.contentTextures as THREE.Texture[]
      const frameTexture = clickedPlane.userData.frameTexture as THREE.Texture
      if (imageCount > 0 && contentTextures && frameTexture) {
        createDots(clickedPlane, imageCount)
        createImagePlanes(clickedPlane, contentTextures, frameTexture)
      }

      if (clickedMat.uniforms.opacity) clickedMat.uniforms.opacity.value = 1
    }

    const handleDotClick = (event: Event) => {
      const customEvent = event as CustomEvent<{ index: number }>
      const plane = expandedPlaneRef.current
      if (!plane) return

      const imagePlanes = imagePlanesRef.current
      const imagePlanesGroup = imagePlanesGroupRef.current
      if (!imagePlanes || imagePlanes.length === 0 || !imagePlanesGroup) return

      const newIndex = customEvent.detail.index
      const currentIndex = plane.userData.currentImageIndex as number || 0
      if (newIndex < 0 || newIndex >= imagePlanes.length) return
      if (newIndex === currentIndex) return

      const spacing = imagePlanesGroup.userData.spacing as number || 1.2
      const totalImages = imagePlanes.length
      const totalSpan = totalImages * spacing

      const currentOffset = carouselTargetOffsetRef.current
      const targetOffset = newIndex * spacing

      const directDiff = targetOffset - currentOffset
      const wrapForwardDiff = directDiff + totalSpan
      const wrapBackwardDiff = directDiff - totalSpan

      let bestDiff = directDiff
      if (Math.abs(wrapForwardDiff) < Math.abs(bestDiff)) bestDiff = wrapForwardDiff
      if (Math.abs(wrapBackwardDiff) < Math.abs(bestDiff)) bestDiff = wrapBackwardDiff

      carouselTargetOffsetRef.current = currentOffset + bestDiff

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
      const imagePlanes = imagePlanesRef.current
      const imagePlanesGroup = imagePlanesGroupRef.current
      if (!imagePlanes || imagePlanes.length === 0 || !imagePlanesGroup) return
      const currentIndex = plane.userData.currentImageIndex as number || 0
      const totalImages = imagePlanes.length
      const spacing = imagePlanesGroup.userData.spacing as number || 1.4

      if (customEvent.detail.direction === 'prev') {
        const newIndex = (currentIndex - 1 + totalImages) % totalImages
        carouselTargetOffsetRef.current -= spacing

        plane.userData.currentImageIndex = newIndex
        setCurrentImageIndex(newIndex)
        updateDotColors(newIndex)
      } else {
        const newIndex = (currentIndex + 1) % totalImages
        carouselTargetOffsetRef.current += spacing

        plane.userData.currentImageIndex = newIndex
        setCurrentImageIndex(newIndex)
        updateDotColors(newIndex)
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
      if (animStateRef.current.phase !== 'idle') {
        hoveredPlaneRef.current = null
        renderer.domElement.style.cursor = 'default'
        return
      }

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
      handleWheelScroll(event, velocityRef, isManualScrollingRef, lastInputTimeRef)
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
        isManualScrollingRef.current = true
        lastInputTimeRef.current = performance.now()
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
          velocityRef.current = deltaX * 0.005
          isManualScrollingRef.current = true
          lastInputTimeRef.current = performance.now()

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
        const targetLeftCardPixels = container.clientWidth * DESKTOP_LAYOUT.LEFT_CARD_WIDTH
        const scale = targetLeftCardPixels / baseCardPixels
        return clamp(scale, SCALE_LIMITS.MIN, SCALE_LIMITS.MAX)
      }
    }

    const _expandTargetResult = new THREE.Vector3()
    const getExpandedTargetPosition = () => {
      const targetZ = 0.8
      const distFromCamera = camera.position.z - targetZ
      const vFov = (camera.fov * Math.PI) / 180
      const visibleHeight = 2 * Math.tan(vFov / 2) * distFromCamera
      const visibleWidth = visibleHeight * (container.clientWidth / container.clientHeight)
      const pixelsPerUnit = container.clientWidth / visibleWidth

      const scale = getUnifiedScale()

      if (isMobile()) {
        const targetX = 0
        const scaledCardHeight = sceneOptions.cardWidth * scale
        const viewportTop = visibleHeight / 2
        const cardTopY = viewportTop - (visibleHeight * MOBILE_LAYOUT.TOP_MARGIN)
        const targetY = cardTopY - (scaledCardHeight / 2)
        return _expandTargetResult.set(targetX, targetY, targetZ)
      } else {
        const vw = container.clientWidth
        const leftCardWidthPx = vw * DESKTOP_LAYOUT.LEFT_CARD_WIDTH
        const rightCardWidthPx = BASE_RIGHT_CARD_WIDTH
        const middleGapPx = DESKTOP_LAYOUT.MIDDLE_GAP_PX
        const totalContentWidth = leftCardWidthPx + middleGapPx + rightCardWidthPx
        const margin = (vw - totalContentWidth) / 2
        const leftCardCenterPx = margin + leftCardWidthPx / 2
        const targetX = (leftCardCenterPx - vw / 2) / pixelsPerUnit
        const targetY = 0
        return _expandTargetResult.set(targetX, targetY, targetZ)
      }
    }

    // === Pre-create reusable object pool (avoids first-click lag) ===
    const POOL_SIZE = 5
    const poolCardAR = sceneOptions.cardWidth / sceneOptions.cardHeight
    const sharedImageGeometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)

    // Grab a placeholder texture from the first project
    const firstProjectAssets = projectAssetsCache.values().next().value
    const placeholderTex = firstProjectAssets?.frameTexture ?? new THREE.Texture()

    const imagePlanePool: { group: THREE.Group; mesh: THREE.Mesh; material: THREE.ShaderMaterial }[] = []
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = createCardMaterial(
        placeholderTex, placeholderTex, sceneOptions.curve,
        1.0, poolCardAR, true, 389 / 596, 0.75, 1.15
      )
      material.uniforms.isExpanded.value = 1.0
      material.uniforms.opacity.value = 0
      material.depthWrite = false
      const mesh = new THREE.Mesh(sharedImageGeometry, material)
      mesh.position.z = 0
      const group = new THREE.Group()
      group.add(mesh)
      imagePlanePool.push({ group, mesh, material })
    }

    // Pre-create dot + glow pool
    const dotPool: { dot: THREE.Mesh; glow: THREE.Mesh }[] = []
    const poolDotRadius = 0.03
    const poolGlowRadius = 0.05
    const sharedDotGeometry = new THREE.CircleGeometry(poolDotRadius, 16)
    const sharedGlowGeometry = new THREE.CircleGeometry(poolGlowRadius, 24)
    for (let i = 0; i < POOL_SIZE; i++) {
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, depthTest: false,
      })
      const glow = new THREE.Mesh(sharedGlowGeometry, glowMat)
      glow.renderOrder = 10
      glow.userData.isGlow = true

      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, depthTest: false,
      })
      const dot = new THREE.Mesh(sharedDotGeometry, dotMat)
      dot.renderOrder = 11
      dotPool.push({ dot, glow })
    }

    // Pre-create arrow pool (2 arrows)
    const sharedArrowGeometry = new THREE.PlaneGeometry(0.18, 0.18)
    const arrowPool: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }[] = []
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, depthTest: false, alphaTest: 0.1,
      })
      const mesh = new THREE.Mesh(sharedArrowGeometry, mat)
      mesh.renderOrder = 12
      arrowPool.push({ mesh, material: mat })
    }

    // Pre-create arrow textures
    const arrowTextures: Record<string, THREE.Texture> = {}
    ;(['left', 'right', 'up', 'down'] as const).forEach(dir => {
      createArrowTexture(dir).then(tex => { arrowTextures[dir] = tex })
    })

    // Force GPU pre-compilation
    const warmupGroup = new THREE.Group()
    imagePlanePool.forEach(p => warmupGroup.add(p.group))
    dotPool.forEach(p => { warmupGroup.add(p.dot); warmupGroup.add(p.glow) })
    arrowPool.forEach(p => warmupGroup.add(p.mesh))
    scene.add(warmupGroup)
    renderer.compile(scene, camera)
    scene.remove(warmupGroup)
    imagePlanePool.forEach(p => warmupGroup.remove(p.group))
    dotPool.forEach(p => { warmupGroup.remove(p.dot); warmupGroup.remove(p.glow) })
    arrowPool.forEach(p => warmupGroup.remove(p.mesh))

    // Pre-allocated reusable objects for the animation loop (avoids GC pressure)
    const _tempTargetPos = new THREE.Vector3()
    const _tempZQuat = new THREE.Quaternion()
    const _tempTiltQuat = new THREE.Quaternion()
    const _tempTargetQuat = new THREE.Quaternion()
    const _tempEuler = new THREE.Euler()
    const _tempAxisZ = new THREE.Vector3(0, 0, 1)
    const _tempAxisX = new THREE.Vector3(1, 0, 0)

    const animate = (currentTime: number) => {
      const timePassed = currentTime - previousTime
      const anim = animStateRef.current  // SINGLE SOURCE OF TRUTH
      let expandedPlane = expandedPlaneRef.current
      const isExpanded = expandedProjectRef.current !== null

      if (isExpanded && expandedProjectRef.current !== null && anim.phase === 'expanded') {
        const currentPlaneProjectId = expandedPlane?.userData.projectId
        const needsSwap = currentPlaneProjectId !== expandedProjectRef.current

        if (needsSwap) {
          // --- Crossfade: save old content, swap instantly, fade both ---

          // 1) Reparent old content into a scene-level container so it stays visible
          if (expandedPlane && (imagePlanesGroupRef.current || dotGroupRef.current)) {
            const container = new THREE.Group()
            expandedPlane.updateWorldMatrix(true, false)

            // Match old plane's world transform so local coords stay correct
            const wp = new THREE.Vector3()
            const wq = new THREE.Quaternion()
            const ws = new THREE.Vector3()
            expandedPlane.getWorldPosition(wp)
            expandedPlane.getWorldQuaternion(wq)
            expandedPlane.getWorldScale(ws)

            container.position.set(wp.x - scene.position.x, wp.y, wp.z)
            container.quaternion.copy(wq)
            container.scale.copy(ws)
            scene.add(container)

            if (imagePlanesGroupRef.current) {
              expandedPlane.remove(imagePlanesGroupRef.current)
              container.add(imagePlanesGroupRef.current)
              imagePlanesGroupRef.current = null
            }
            if (dotGroupRef.current) {
              expandedPlane.remove(dotGroupRef.current)
              container.add(dotGroupRef.current)
              dotGroupRef.current = null
            }

            // Clean up any previous outgoing container (don't dispose - objects are pooled)
            if (outgoingContainerRef.current) {
              scene.remove(outgoingContainerRef.current)
            }
            outgoingContainerRef.current = container
          }

          // 2) Clear refs before cleanup so cleanupPlaneAttachments skips disposal
          imagePlanesRef.current = []
          dotMeshesRef.current = []
          arrowMeshesRef.current = { left: null, right: null }

          // 3) Perform the swap
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
            returningPlanesRef.current = returningPlanesRef.current.filter(p => p !== newPlane)

            if (expandedPlane) {
              cleanupPlaneAttachments(expandedPlane)
              crossfadeProgressRef.current = 1
              imagePlanesRevealedRef.current = true
            }

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
            anim.activePlane = newPlane
            anim.projectId = newPlane.userData.projectId

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
            if (newMat.uniforms.opacity) newMat.uniforms.opacity.value = 0

            const projectData = projects.find(p => p.id === expandedProjectRef.current)
            const imageCount = projectData?.images?.length || 0
            const newPlaneTextures = newPlane.userData.contentTextures as THREE.Texture[]
            const newFrameTexture = newPlane.userData.frameTexture as THREE.Texture
            if (imageCount > 0 && newPlaneTextures && newFrameTexture) {
              createDots(newPlane, imageCount)
              createImagePlanes(newPlane, newPlaneTextures, newFrameTexture, true)
            }

            expansionStageRef.current = 'expanded'
            setExpansionStage('expanded')
            anim.phase = 'expanded'
          }

          // 4) Start crossfade from 0
          swapFadeRef.current = 0
        } else if (swapFadeRef.current < 1) {
          // Crossfade in progress — advance
          swapFadeRef.current = Math.min(1, swapFadeRef.current + 0.08)
        }

        // 5) Fade outgoing container content
        if (outgoingContainerRef.current) {
          const outOpacity = 1 - swapFadeRef.current
          outgoingContainerRef.current.traverse(child => {
            if (child instanceof THREE.Mesh) {
              const mat = child.material as THREE.ShaderMaterial | THREE.MeshBasicMaterial
              if ('uniforms' in mat && mat.uniforms?.opacity) {
                mat.uniforms.opacity.value = outOpacity
              } else if ('opacity' in mat) {
                mat.opacity = outOpacity
              }
            }
          })

          // Cleanup outgoing when crossfade is done
          if (swapFadeRef.current >= 1) {
            scene.remove(outgoingContainerRef.current)
            outgoingContainerRef.current = null
          }
        }
      }

      floatTime += timePassed * 0.001
      smoothMousePosition.x += (mousePosition.x - smoothMousePosition.x) * 0.05
      smoothMousePosition.y += (mousePosition.y - smoothMousePosition.y) * 0.05

      const shouldScroll = anim.phase === 'idle' || anim.phase === 'collapsing'

      if (!isPausedRef.current && shouldScroll) {
        const loopWidth = cardWidth * projects.length

        updateScrollVelocity(isManualScrollingRef, velocityRef, autoScrollDirectionRef, lastInputTimeRef)

        timeRef.current += velocityRef.current * timePassed * 0.001

        if (timeRef.current * sceneOptions.speed > loopWidth) {
          timeRef.current -= loopWidth / sceneOptions.speed
        } else if (timeRef.current * sceneOptions.speed < -loopWidth) {
          timeRef.current += loopWidth / sceneOptions.speed
        }
      } else if (anim.phase === 'idle') {
        const diff = targetTimeRef.current - timeRef.current
        timeRef.current += diff * 0.1
      }

      if (shouldScroll) {
        scene.position.x = timeRef.current * sceneOptions.speed
      }

      if (shouldScroll) {
        checkHover()
      }

      if (anim.phase === 'collapsing' && anim.activePlane && !imagePlanesExitedRef.current) {
        const currentRotZ = anim.activePlane.rotation.z
        const rotationProgress = Math.min(1, Math.abs(currentRotZ) / (Math.PI / 2))
        crossfadeProgressRef.current = rotationProgress

        const imagePlanes = imagePlanesRef.current
        if (imagePlanes && imagePlanes.length > 0) {
          const isMobileSize = container.clientWidth < MD_BREAKPOINT
          const frameIsVertical = !isMobileSize
          let allExited = true

          imagePlanes.forEach((imageGroup) => {
            const isExiting = imageGroup.userData.isExiting as boolean ?? false
            const exitTarget = imageGroup.userData.exitTarget as number ?? 0
            const cardMaterial = imageGroup.userData.cardMaterial as THREE.ShaderMaterial

            if (isExiting) {
              const exitSpeed = getEasedMovementAmount()

              if (frameIsVertical) {
                imageGroup.position.x += (exitTarget - imageGroup.position.x) * exitSpeed
              } else {
                imageGroup.position.y += (exitTarget - imageGroup.position.y) * exitSpeed
              }

              if (cardMaterial && cardMaterial.uniforms.opacity) {
                cardMaterial.uniforms.opacity.value = crossfadeProgressRef.current
                if (cardMaterial.uniforms.rotateContent) {
                  cardMaterial.uniforms.rotateContent.value = crossfadeProgressRef.current
                }
                if (crossfadeProgressRef.current > 0.05) {
                  allExited = false
                }
              }
            }
          })

          dotMeshesRef.current.forEach(dot => {
            const dotMat = dot.material as THREE.MeshBasicMaterial
            dotMat.opacity *= 0.7
            const glowMesh = dot.userData.glowMesh as THREE.Mesh
            if (glowMesh) {
              const glowMat = glowMesh.material as THREE.MeshBasicMaterial
              glowMat.opacity *= 0.7
            }
          })

          const arrows = [arrowMeshesRef.current.left, arrowMeshesRef.current.right]
          arrows.forEach(arrow => {
            if (!arrow) return
            const arrowMat = arrow.material as THREE.MeshBasicMaterial
            arrowMat.opacity *= 0.7
          })

          if (allExited) {
            imagePlanesExitedRef.current = true
          }
        } else {
          imagePlanesExitedRef.current = true
        }
      }

      const easeAmount = getEasedMovementAmount()
      returningPlanesRef.current = returningPlanesRef.current.filter(rPlane => {
        const rMat = rPlane.material as THREE.ShaderMaterial
        const targetX = rPlane.userData.initialX
        const targetY = rPlane.userData.initialY ?? -0.35

        rPlane.position.x += (targetX - rPlane.position.x) * easeAmount
        rPlane.position.y += (targetY - rPlane.position.y) * easeAmount
        rPlane.position.z += (0 - rPlane.position.z) * easeAmount

        rPlane.rotation.x += (0 - rPlane.rotation.x) * easeAmount
        rPlane.rotation.y += (0 - rPlane.rotation.y) * easeAmount
        rPlane.rotation.z += (0 - rPlane.rotation.z) * easeAmount

        rPlane.scale.x += (1 - rPlane.scale.x) * easeAmount
        rPlane.scale.y += (1 - rPlane.scale.y) * easeAmount
        rPlane.scale.z += (1 - rPlane.scale.z) * easeAmount

        if (rMat.uniforms.isExpanded) {
          rMat.uniforms.isExpanded.value += (0 - rMat.uniforms.isExpanded.value) * easeAmount
        }
        if (rMat.uniforms.opacity) {
          rMat.uniforms.opacity.value += (0.75 - rMat.uniforms.opacity.value) * 0.15
        }
        if (rMat.uniforms.glow) {
          rMat.uniforms.glow.value += (0 - rMat.uniforms.glow.value) * 0.15
        }

        const posDiff = Math.abs(targetX - rPlane.position.x) + Math.abs(targetY - rPlane.position.y) + Math.abs(rPlane.position.z)
        const rotDiff = Math.abs(rPlane.rotation.x) + Math.abs(rPlane.rotation.y) + Math.abs(rPlane.rotation.z)
        const scaleDiff = Math.abs(1 - rPlane.scale.x)

        if (posDiff < 0.01 && rotDiff < 0.01 && scaleDiff < 0.01) {
          rPlane.position.set(targetX, targetY, 0)
          rPlane.rotation.set(0, 0, 0)
          rPlane.scale.set(1, 1, 1)
          if (rMat.uniforms.isExpanded) rMat.uniforms.isExpanded.value = 0
          return false
        }

        return true
      })

      planes.forEach(plane => {
        if (returningPlanesRef.current.includes(plane)) return

        const isActivePlane = plane === anim.activePlane
        const isExpandingOrExpanded = anim.phase === 'expanding' || anim.phase === 'expanded'
        const mat = plane.material as THREE.ShaderMaterial

        if (isActivePlane && isExpandingOrExpanded) {
          const currentStage = expansionStageRef.current
          const imagePlanesRevealed = imagePlanesRevealedRef.current

          let startPos = anim.startPos
          let startQuat = anim.startQuat
          let startScale = anim.startScale
          let frozenSceneX = anim.frozenSceneX
          let progress = anim.progress

          if (!startPos || !startQuat) {
            startPos = plane.position.clone()
            startQuat = plane.quaternion.clone()
            startScale = plane.scale.x
            frozenSceneX = scene.position.x
            progress = 0
            anim.startPos = startPos
            anim.startQuat = startQuat
            anim.startScale = startScale
            anim.frozenSceneX = frozenSceneX
            anim.progress = progress
          }

          if (!imagePlanesRevealed && mat.uniforms.opacity) {
            mat.uniforms.opacity.value = 1
          }

          const safeStartPos = startPos
          const safeStartQuat = startQuat
          const safeStartScale = startScale
          const safeFrozenSceneX = frozenSceneX

          const target = getExpandedTargetPosition()
          const floatOffset = getFloatOffset(floatTime, 'left')
          _tempTargetPos.set(
            target.x - safeFrozenSceneX,
            target.y + floatOffset.y,
            target.z + floatOffset.x
          )
          _tempZQuat.setFromAxisAngle(_tempAxisZ, Math.PI / 2)
          const tiltAmount = isMobile() ? 0 : 0.15
          _tempTiltQuat.setFromAxisAngle(_tempAxisX, tiltAmount)
          _tempTargetQuat.multiplyQuaternions(_tempZQuat, _tempTiltQuat)
          const targetScale = getUnifiedScale()

          progress = Math.min(1, (progress || 0) + 0.018)

          anim.progress = progress

          const t = easeOutQuart(progress)

          plane.position.lerpVectors(safeStartPos, _tempTargetPos, t)
          plane.quaternion.slerpQuaternions(safeStartQuat, _tempTargetQuat, t)
          const newScale = safeStartScale + (targetScale - safeStartScale) * t
          plane.scale.set(newScale, newScale, newScale)

          _tempEuler.setFromQuaternion(plane.quaternion)
          const rotZ = _tempEuler.z

          if (progress >= 0.2 && currentStage === 'expanding') {
            anim.phase = 'expanded'
            expansionStageRef.current = 'expanded'
            setExpansionStage('expanded')
          }

          if (dotGroupRef.current) {
            dotGroupRef.current.rotation.z = -rotZ
            dotGroupRef.current.rotation.x = 0
            dotGroupRef.current.rotation.y = 0
          }

          if (mat.uniforms.isExpanded) {
            const expandDiff = 1.0 - mat.uniforms.isExpanded.value
            const expandSpeed = 0.08
            if (Math.abs(expandDiff) > 0.001) {
              mat.uniforms.isExpanded.value += Math.sign(expandDiff) * Math.min(expandSpeed, Math.abs(expandDiff))
            }
          }

          if (mat.uniforms.opacity) {
            mat.uniforms.opacity.value = imagePlanesRevealed ? 0 : 1
            mat.depthWrite = !imagePlanesRevealed
          }

          if (mat.uniforms.glow) {
            mat.uniforms.glow.value += (0 - mat.uniforms.glow.value) * 0.15
          }

          const dotsVisible = anim.phase === 'expanded'
          dotMeshesRef.current.forEach((dot, index) => {
            const dotMat = dot.material as THREE.MeshBasicMaterial
            const targetOpacity = dotsVisible ? (dot.userData.targetOpacity as number) * swapFadeRef.current : 0
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
              const glowTarget = dotsVisible ? (glowMesh.userData.targetOpacity as number) * swapFadeRef.current : 0
              glowMat.opacity += (glowTarget - glowMat.opacity) * 0.15
            }
          })

          const imagePlanes = imagePlanesRef.current
          const imagePlanesGroup = imagePlanesGroupRef.current

          if (imagePlanes && imagePlanes.length > 0 && imagePlanesGroup) {
            const groupData = imagePlanesGroup.userData
            const spacing = groupData.spacing as number
            const totalFrames = imagePlanes.length
            const totalSpan = totalFrames * spacing // Total loop length

            const isExitingGlobal = anim.phase === 'collapsing'
            const isExpandingOrExpanded = anim.phase === 'expanding' || anim.phase === 'expanded'

            let rotationProgress = 0
            if (anim.activePlane) {
              const currentRotZ = anim.activePlane.rotation.z
              rotationProgress = Math.min(1, Math.abs(currentRotZ) / (Math.PI / 2))
            }

            if (isExpandingOrExpanded && !isExitingGlobal) {
              // Rate-limit crossfade increase to prevent thumbnail vanishing when
              // re-expanding a card that's already at high rotation (e.g. same card
              // clicked right after closing). Without this, crossfade jumps from 0 to
              // ~1 in one frame, hiding the thumbnail before image planes are positioned.
              const maxCrossfadeStep = 0.10
              if (rotationProgress > crossfadeProgressRef.current) {
                crossfadeProgressRef.current = Math.min(
                  crossfadeProgressRef.current + maxCrossfadeStep,
                  rotationProgress
                )
              } else {
                crossfadeProgressRef.current = rotationProgress
              }
              if (!imagePlanesRevealedRef.current && rotationProgress > 0.1) {
                imagePlanes.forEach((imageGroup) => {
                  imageGroup.userData.targetAnimOffset = imageGroup.userData.baseOffset
                })
                imagePlanesRevealedRef.current = true
              }
            } else if (isExitingGlobal) {
              crossfadeProgressRef.current = rotationProgress
            }

            if (anim.activePlane) {
              const mainMat = anim.activePlane.material as THREE.ShaderMaterial
              if (mainMat?.uniforms?.opacity) {
                // During expanding phase, keep thumbnail at least partially visible
                // so the card never vanishes when re-expanding from high rotation.
                // Floor fades to 0 as progress approaches 0.2 (phase transition point).
                const expandingFloor = anim.phase === 'expanding'
                  ? 0.4 * Math.max(0, 1 - (anim.progress || 0) / 0.2)
                  : 0
                mainMat.uniforms.opacity.value = Math.max(
                  1 - crossfadeProgressRef.current,
                  expandingFloor
                )
              }
            }

            imagePlanes.forEach((imageGroup) => {
              const cardMaterial = imageGroup.userData.cardMaterial as THREE.ShaderMaterial
              if (cardMaterial?.uniforms?.rotateContent) {
                cardMaterial.uniforms.rotateContent.value = crossfadeProgressRef.current
              }
            })

            const offsetDiff = carouselTargetOffsetRef.current - carouselOffsetRef.current
            carouselOffsetRef.current += offsetDiff * 0.08 // Slow smooth scrolling

            imagePlanes.forEach((imageGroup) => {
              const isFirstFrame = imageGroup.userData.isFirstFrame as boolean
              const cardPlane = imageGroup.userData.cardPlane as THREE.Mesh
              const frameIsVertical = imageGroup.userData.isVerticalOnScreen as boolean

              const baseOffset = imageGroup.userData.baseOffset as number // Set during creation: -index * spacing

              let finalOffset = baseOffset + carouselOffsetRef.current

              if (imagePlanesRevealedRef.current) {
                const halfSpan = totalSpan / 2
                while (finalOffset > halfSpan) {
                  finalOffset -= totalSpan
                }
                while (finalOffset < -halfSpan) {
                  finalOffset += totalSpan
                }
              }

              const startingOffset = imageGroup.userData.startingOffset as number ?? -3.0

              const isExiting = imageGroup.userData.isExiting as boolean ?? false
              const exitTarget = imageGroup.userData.exitTarget as number ?? 0

              const introProgress = imagePlanesGroupRef.current?.userData.introProgress as number ?? 0

              if (isExiting && !isFirstFrame) {
                const exitSpeed = getEasedMovementAmount()
                if (frameIsVertical) {
                  imageGroup.position.x += (exitTarget - imageGroup.position.x) * exitSpeed
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y += (exitTarget - imageGroup.position.y) * exitSpeed
                }
              } else if (!imagePlanesRevealedRef.current) {
                if (frameIsVertical) {
                  imageGroup.position.x = isFirstFrame ? 0 : startingOffset
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y = isFirstFrame ? 0 : startingOffset
                }
              } else if (introProgress < 1) {
                const currentPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
                const targetPos = finalOffset

                const introSpeed = 0.15
                const newPos = currentPos + (targetPos - currentPos) * introSpeed

                if (frameIsVertical) {
                  imageGroup.position.x = newPos
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y = newPos
                }

                if (imageGroup.userData.imageIndex === 1) {
                  const distRemaining = Math.abs(targetPos - newPos)
                  const totalDist = Math.abs(startingOffset - baseOffset)
                  if (distRemaining < 0.01 || totalDist < 0.01) {
                    imagePlanesGroupRef.current!.userData.introProgress = 1
                  } else {
                    const traveled = totalDist - distRemaining
                    imagePlanesGroupRef.current!.userData.introProgress = Math.min(0.99, traveled / totalDist)
                  }
                }
              } else {
                if (frameIsVertical) {
                  imageGroup.position.x = finalOffset
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y = finalOffset
                }
              }

              const actualPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
              const distFromCenter = Math.abs(actualPos)

              if (!isExiting) {
                // Individual bobbing for each image
                const floatPhase = imageGroup.userData.floatPhaseOffset as number
                const bobY = Math.sin(floatTime * 1.5 + floatPhase) * 0.03
                const bobZ = Math.cos(floatTime * 1.2 + floatPhase) * 0.02

                imageGroup.position.z = distFromCenter * 0.2 + bobZ

                if (cardPlane) {
                  const forwardBackTilt = smoothMousePosition.x * 0.08

                  // Tilt in vertical mode (desktop), no tilt in horizontal mode (mobile)
                  const tiltY = frameIsVertical ? -actualPos * 0.25 : 0
                  cardPlane.rotation.x = forwardBackTilt
                  cardPlane.rotation.y = tiltY + bobY * 0.5
                  cardPlane.rotation.z = 0
                  imageGroup.rotation.set(0, 0, 0)
                }
              }

              const shouldShow = (dotsVisible || anim.phase === 'expanding') && imagePlanesRevealedRef.current && !isExiting
              const cardMaterial = imageGroup.userData.cardMaterial as THREE.ShaderMaterial

              if (cardMaterial && cardMaterial.uniforms.opacity) {
                const actualPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
                const distFromCenter = Math.abs(actualPos)

                if (isExiting) {
                  cardMaterial.uniforms.opacity.value = crossfadeProgressRef.current
                } else if (shouldShow) {
                  const visibleRange = spacing * 1.5
                  const positionVisible = distFromCenter <= visibleRange

                  if (introProgress < 1) {
                    cardMaterial.uniforms.opacity.value = crossfadeProgressRef.current * swapFadeRef.current
                  } else {
                    cardMaterial.uniforms.opacity.value = positionVisible ? crossfadeProgressRef.current * swapFadeRef.current : 0
                  }
                } else {
                  cardMaterial.uniforms.opacity.value = 0
                }
              }
            })
          }

          const arrows = [arrowMeshesRef.current.left, arrowMeshesRef.current.right]
          arrows.forEach(arrow => {
            if (!arrow) return
            const arrowMat = arrow.material as THREE.MeshBasicMaterial
            const direction = arrow.userData.direction as 'left' | 'right'
            const isHovered = hoveredArrowRef.current === direction
            const targetOpacity = dotsVisible ? (isHovered ? 1 : 0.5) * swapFadeRef.current : 0
            arrowMat.opacity += (targetOpacity - arrowMat.opacity) * 0.15

            const targetScale = isHovered ? 1.3 : 1.0
            const currentScale = arrow.scale.x
            const newScale = currentScale + (targetScale - currentScale) * 0.2
            arrow.scale.set(newScale, newScale, 1)
          })

        } else if (isExpandingOrExpanded && anim.activePlane) {
          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            const targetOpacity = 0.15
            mat.uniforms.opacity.value = currentOpacity + (targetOpacity - currentOpacity) * 0.08
          }
          if (mat.uniforms.glow) {
            mat.uniforms.glow.value += (0 - mat.uniforms.glow.value) * 0.15
          }
        } else if (isActivePlane && anim.phase === 'collapsing') {
          const targetX = plane.userData.initialX
          const targetY = plane.userData.initialY ?? -0.35
          const targetZ = 0
          const dx = targetX - plane.position.x
          const dy = targetY - plane.position.y
          const dz = targetZ - plane.position.z
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
          const easeAmount = getEasedMovementAmount()

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
            const expandSpeed = 0.018
            if (Math.abs(expandDiff) > 0.001) {
              mat.uniforms.isExpanded.value += Math.sign(expandDiff) * Math.min(expandSpeed, Math.abs(expandDiff))
            }
          }

          if (mat.uniforms.opacity) {
            mat.uniforms.opacity.value = 1 - crossfadeProgressRef.current
          }

          if (mat.uniforms.glow) {
            mat.uniforms.glow.value += (0 - mat.uniforms.glow.value) * 0.15
          }
        } else {
          const isHovered = plane === hoveredPlaneRef.current
          const targetScale = isHovered ? 1.04 : 1
          const currentScale = plane.scale.x
          const scaleDiff = targetScale - currentScale
          const newScale = currentScale + scaleDiff * 0.15
          plane.scale.set(newScale, newScale, newScale)

          plane.rotation.x += (0 - plane.rotation.x) * 0.1
          plane.rotation.y += (0 - plane.rotation.y) * 0.1

          // Faded by default, full opacity on hover
          if (mat.uniforms.opacity) {
            const targetOpacity = isHovered ? 1.0 : 0.75
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (targetOpacity - currentOpacity) * 0.15
          }

          // Colored edge glow effect on hover
          if (mat.uniforms.glow) {
            const targetGlow = isHovered ? 1.0 : 0.0
            const currentGlow = mat.uniforms.glow.value
            mat.uniforms.glow.value = currentGlow + (targetGlow - currentGlow) * 0.15
          }
        }
      })

      if (anim.phase === 'collapsing' && anim.activePlane) {
        const plane = anim.activePlane
        const scaleDiff = Math.abs(1 - plane.scale.x)
        const targetX = plane.userData.initialX
        const targetY = plane.userData.initialY ?? -0.35
        const posDiff = Math.abs(plane.position.x - targetX) + Math.abs(plane.position.y - targetY) + Math.abs(plane.position.z)
        const rotDiff = Math.abs(plane.rotation.x) + Math.abs(plane.rotation.y) + Math.abs(plane.rotation.z)
        const isComplete = scaleDiff < 0.01 && posDiff < 0.01 && rotDiff < 0.01

        if (isComplete) {
          cleanupPlaneAttachments(plane)

          // Clean up any outgoing crossfade content (don't dispose - objects are pooled)
          if (outgoingContainerRef.current) {
            scene.remove(outgoingContainerRef.current)
            outgoingContainerRef.current = null
            swapFadeRef.current = 1
          }

          anim.phase = 'idle'
          anim.activePlane = null
          anim.projectId = null
          anim.progress = 0
          anim.startPos = null
          anim.startQuat = null
          anim.startScale = 1
          anim.frozenSceneX = 0

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
      // Dispose plane geometries and materials
      planes.forEach(plane => {
        plane.geometry.dispose()
        if (plane.material instanceof THREE.Material) {
          plane.material.dispose()
        }
      })

      // Dispose cached assets only once (not per-plane)
      projectAssetsCache.forEach(assets => {
        const { thumbnailVideo, thumbnailTexture, frameTexture, contentTextures } = assets
        if (thumbnailVideo) {
          thumbnailVideo.pause()
          thumbnailVideo.src = ''
          thumbnailVideo.load()
        }
        thumbnailTexture?.dispose()
        frameTexture?.dispose()
        contentTextures?.forEach(tex => tex?.dispose())
      })
      projectAssetsCache.clear()
      // Dispose pooled objects
      sharedImageGeometry.dispose()
      imagePlanePool.forEach(p => {
        p.material.dispose()
      })
      sharedDotGeometry.dispose()
      sharedGlowGeometry.dispose()
      dotPool.forEach(p => {
        (p.dot.material as THREE.Material).dispose()
        ;(p.glow.material as THREE.Material).dispose()
      })
      sharedArrowGeometry.dispose()
      arrowPool.forEach(p => {
        p.material.dispose()
      })
      Object.values(arrowTextures).forEach(tex => tex.dispose())
      if (outgoingContainerRef.current) {
        scene.remove(outgoingContainerRef.current)
        outgoingContainerRef.current = null
      }
      renderer.dispose()
    }
  }, [containerReady, isLowPerformance])

  return (
    <div
      ref={containerRef}
      className={`absolute inset-x-0 top-0 h-screen z-[55] overflow-visible transition-opacity [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:overflow-visible ${!visible ? 'opacity-0 pointer-events-none [&>canvas]:pointer-events-none' : 'opacity-100 pointer-events-auto [&>canvas]:pointer-events-auto'}`}
      onTouchStart={handleCarouselTouchStart}
      onTouchEnd={handleCarouselTouchEnd}
      onMouseDown={handleCarouselTouchStart}
      onMouseUp={handleCarouselTouchEnd}
    />
  )
}
