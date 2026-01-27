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

  const imagePlanesRef = useRef<THREE.Mesh[]>([])
  const imagePlanesGroupRef = useRef<THREE.Group | null>(null)
  const carouselOffsetRef = useRef<number>(0) // Current scroll offset
  const carouselTargetOffsetRef = useRef<number>(0) // Target scroll offset
  const imagePlanesRevealedRef = useRef<boolean>(false) // Whether image planes have animated in
  const imagePlanesExitedRef = useRef<boolean>(false) // Whether image planes have finished exiting
  const crossfadeProgressRef = useRef<number>(0) // 0 = thumbnail visible, 1 = selection images visible


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

  const onPrevProjectRef = useRef(onPrevProject)
  const onNextProjectRef = useRef(onNextProject)
  const onReadyRef = useRef(onReady)

  useEffect(() => {
    onPrevProjectRef.current = onPrevProject
  }, [onPrevProject])

  useEffect(() => {
    onNextProjectRef.current = onNextProject
  }, [onNextProject])

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

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

  const cleanupPlaneAttachments = (plane: THREE.Mesh) => {
    if (dotGroupRef.current) {
      plane.remove(dotGroupRef.current)
      dotGroupRef.current.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) child.material.dispose()
        }
      })
      dotGroupRef.current = null
      arrowMeshesRef.current = { left: null, right: null }
    }
    if (imagePlanesGroupRef.current) {
      plane.remove(imagePlanesGroupRef.current)
      imagePlanesGroupRef.current.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) child.material.dispose()
        }
      })
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

    if (expandedProject === null && anim.phase === 'expanded' && anim.activePlane) {
      anim.phase = 'collapsing'
      anim.progress = 0
      anim.startPos = anim.activePlane.position.clone()
      anim.startQuat = anim.activePlane.quaternion.clone()
      anim.startScale = anim.activePlane.scale.x

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
      thumbnailVideo: HTMLVideoElement
      thumbnailTexture: THREE.VideoTexture
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
    flashBgImg.src = '/projects/images/flash_bg.png'

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
      const contentTextures = project.images.map(imgPath => textureLoader.load(imgPath))

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
    })

    // Now create planes, reusing cached assets
    allProjects.forEach((project, i) => {
      const assets = projectAssetsCache.get(project.id)!
      const { frameTexture, thumbnailVideo, thumbnailTexture, contentTextures } = assets

      const geometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)
      const cardAspectRatio = sceneOptions.cardWidth / sceneOptions.cardHeight
      const frameAspectRatio = 389 / 596 // Frame image aspect ratio
      const material = createCardMaterial(frameTexture, thumbnailTexture, sceneOptions.curve, 1.0, cardAspectRatio, false, frameAspectRatio)

      // Update aspect ratio from cached value or listen for updates
      if (assets.videoAspectRatio !== 1.0) {
        material.uniforms.contentAspectRatio.value = assets.videoAspectRatio
      }
      thumbnailVideo.addEventListener('loadedmetadata', () => {
        if (thumbnailVideo.videoWidth && thumbnailVideo.videoHeight) {
          material.uniforms.contentAspectRatio.value = thumbnailVideo.videoWidth / thumbnailVideo.videoHeight
        }
      })

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
      dotGroup.renderOrder = 10 // Render on top of cards
      dotGroupRef.current = dotGroup
      const dots: THREE.Mesh[] = []

      const isMobileSize = container.clientWidth < MD_BREAKPOINT
      const dotRadius = isMobileSize ? 0.055 : 0.03
      const glowRadius = isMobileSize ? 0.085 : 0.05
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

      const arrowSize = isMobileSize ? 0.28 : 0.18
      const arrowOffset = isMobileSize ? 0.22 : 0.14

      const firstArrowGeometry = new THREE.PlaneGeometry(arrowSize, arrowSize)
      const firstArrowMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        alphaTest: 0.1
      })
      const firstArrow = new THREE.Mesh(firstArrowGeometry, firstArrowMaterial)
      firstArrow.renderOrder = 12
      if (isVertical) {
        firstArrow.position.x = startX
        firstArrow.position.y = startY + arrowOffset
      } else {
        firstArrow.position.x = startX - arrowOffset
        firstArrow.position.y = startY
      }
      firstArrow.position.z = 0.01
      firstArrow.userData.isArrow = true
      firstArrow.userData.direction = 'left' // 'left' means previous
      firstArrow.userData.targetOpacity = 0.5
      firstArrow.userData.targetScale = 1
      dotGroup.add(firstArrow)
      arrowMeshesRef.current.left = firstArrow

      const secondArrowGeometry = new THREE.PlaneGeometry(arrowSize, arrowSize)
      const secondArrowMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        alphaTest: 0.1
      })
      const secondArrow = new THREE.Mesh(secondArrowGeometry, secondArrowMaterial)
      secondArrow.renderOrder = 12
      if (isVertical) {
        secondArrow.position.x = startX
        secondArrow.position.y = startY - totalSpan - arrowOffset
      } else {
        secondArrow.position.x = startX + totalSpan + arrowOffset
        secondArrow.position.y = startY
      }
      secondArrow.position.z = 0.01
      secondArrow.userData.isArrow = true
      secondArrow.userData.direction = 'right' // 'right' means next
      secondArrow.userData.targetOpacity = 0.5
      secondArrow.userData.targetScale = 1
      dotGroup.add(secondArrow)
      arrowMeshesRef.current.right = secondArrow

      const firstArrowDir = isVertical ? 'up' : 'left'
      const secondArrowDir = isVertical ? 'down' : 'right'
      createArrowTexture(firstArrowDir).then(texture => {
        firstArrowMaterial.map = texture
        firstArrowMaterial.needsUpdate = true
      })
      createArrowTexture(secondArrowDir).then(texture => {
        secondArrowMaterial.map = texture
        secondArrowMaterial.needsUpdate = true
      })

      for (let i = 0; i < imageCount; i++) {
        const glowGeometry = new THREE.CircleGeometry(glowRadius, 24)
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        })
        const glow = new THREE.Mesh(glowGeometry, glowMaterial)
        glow.renderOrder = 10
        if (isVertical) {
          glow.position.x = startX
          glow.position.y = startY - i * dotSpacing
        } else {
          glow.position.x = startX + i * dotSpacing
          glow.position.y = startY
        }
        glow.position.z = 0.01
        glow.userData.isGlow = true
        glow.userData.targetOpacity = i === 0 ? 0.4 : 0
        dotGroup.add(glow)

        const geometry = new THREE.CircleGeometry(dotRadius, 16)
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        })
        const dot = new THREE.Mesh(geometry, material)
        dot.renderOrder = 11
        if (isVertical) {
          dot.position.x = startX
          dot.position.y = startY - i * dotSpacing
        } else {
          dot.position.x = startX + i * dotSpacing
          dot.position.y = startY
        }
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

    const createImagePlanes = (plane: THREE.Mesh, contentTextures: THREE.Texture[], frameTexture: THREE.Texture, skipRevealAnimation = false) => {
      if (imagePlanesGroupRef.current) {
        plane.remove(imagePlanesGroupRef.current)
        imagePlanesGroupRef.current.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
        })
      }

      const imagePlanesGroup = new THREE.Group()
      imagePlanesGroupRef.current = imagePlanesGroup
      const imagePlanes: THREE.Mesh[] = []

      const isMobileSize = container.clientWidth < MD_BREAKPOINT
      const isVerticalOnScreen = !isMobileSize

      const imageScale = 1.0
      const scaledCardWidth = sceneOptions.cardWidth * imageScale
      const scaledCardHeight = sceneOptions.cardHeight * imageScale

      const spacing = isMobileSize
        ? scaledCardHeight + 0.5
        : scaledCardWidth + 0.05
      const leftShiftAmount = 0

      const cardAspectRatio = sceneOptions.cardWidth / sceneOptions.cardHeight

      imagePlanesGroup.userData = {
        spacing,
        isVerticalOnScreen,
        leftShiftAmount,
        introProgress: skipRevealAnimation ? 1 : 0  // Skip intro animation if switching projects
      }

      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0
      imagePlanesRevealedRef.current = skipRevealAnimation

      contentTextures.forEach((texture, i) => {
        const imageGroup = new THREE.Group()

        const isFirstFrame = i === 0

        const totalImages = contentTextures.length
        const halfCount = Math.floor(totalImages / 2)

        let finalOffset: number
        if (i === 0) {
          finalOffset = 0
        } else if (i <= halfCount) {
          finalOffset = -spacing * i  // Below center
        } else {
          finalOffset = spacing * (totalImages - i)  // Above center (wrapped)
        }

        const entryDistance = 2.0
        const startingStackOffset = finalOffset >= 0
          ? finalOffset + entryDistance  // At or above center: come from above
          : finalOffset - entryDistance  // Below center: come from below

        let contentAspectRatio = 1.0
        const img = texture.image as HTMLImageElement | undefined
        if (img && img.width && img.height) {
          contentAspectRatio = img.width / img.height
        }

        const cardGeometry = createCardGeometry(scaledCardWidth, scaledCardHeight)
        const frameAspectRatio = 389 / 596 // Frame image aspect ratio
        const imageScale = 0.75 // Scale down the whole unit
        const frameScale = 1.15 // Frame is 15% larger than image
        const cardMaterial = createCardMaterial(frameTexture, texture, sceneOptions.curve, contentAspectRatio, cardAspectRatio, true, frameAspectRatio, imageScale, frameScale)
        cardMaterial.uniforms.isExpanded.value = 1.0
        cardMaterial.uniforms.opacity.value = skipRevealAnimation ? 1 : 0
        cardMaterial.depthWrite = false

        texture.onUpdate = () => {
          const loadedImg = texture.image as HTMLImageElement | undefined
          if (loadedImg && loadedImg.width && loadedImg.height) {
            const ar = loadedImg.width / loadedImg.height
            cardMaterial.uniforms.contentAspectRatio.value = ar
          }
        }

        const cardPlane = new THREE.Mesh(cardGeometry, cardMaterial)
        cardPlane.position.z = 0
        imageGroup.add(cardPlane)

        const startOffset = skipRevealAnimation ? finalOffset : (isFirstFrame ? finalOffset : startingStackOffset)
        if (isVerticalOnScreen) {
          imageGroup.position.set(startOffset, leftShiftAmount, 0)
        } else {
          imageGroup.position.set(0, startOffset, 0)
        }

        imageGroup.userData = {
          imageIndex: i,
          baseOffset: finalOffset, // Final position offset
          startingOffset: startingStackOffset, // Where this card starts for reveal animation
          currentAnimOffset: startOffset, // Current animated offset (first frame at 0, others stacked)
          targetAnimOffset: finalOffset, // Target position (same as start for first frame)
          isVerticalOnScreen,
          isFirstFrame,
          leftShift: leftShiftAmount,
          currentRotY: 0,
          floatPhaseOffset: i * 0.7,
          cardPlane, // Single plane with shader material
          cardMaterial // Reference to shader material for opacity control
        }

        imagePlanesGroup.add(imageGroup)
        imagePlanes.push(imageGroup as unknown as THREE.Mesh)
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

      const intersects = raycaster.intersectObjects(planes)
      if (intersects.length === 0) return

      const clickedPlane = intersects[0].object as THREE.Mesh

      if (anim.phase !== 'idle') {
        return
      }


      dotMeshesRef.current = []
      imagePlanesRef.current = []
      arrowMeshesRef.current = { left: null, right: null }
      imagePlanesRevealedRef.current = false
      imagePlanesExitedRef.current = false
      crossfadeProgressRef.current = 0
      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0

      const projectId = clickedPlane.userData.projectId
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

      onPauseChangeRef.current(true)
      onProjectClickRef.current(projectId)

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
        const targetLeftCardPixels = container.clientWidth * DESKTOP_LAYOUT.LEFT_CARD_WIDTH
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
      const pixelsPerUnit = container.clientWidth / visibleWidth

      const scale = getUnifiedScale()

      if (isMobile()) {
        const targetX = 0
        const scaledCardHeight = sceneOptions.cardWidth * scale
        const viewportTop = visibleHeight / 2
        const cardTopY = viewportTop - (visibleHeight * MOBILE_LAYOUT.TOP_MARGIN)
        const targetY = cardTopY - (scaledCardHeight / 2)
        return new THREE.Vector3(targetX, targetY, targetZ)
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
        return new THREE.Vector3(targetX, targetY, targetZ)
      }
    }

    const animate = (currentTime: number) => {
      const timePassed = currentTime - previousTime
      const anim = animStateRef.current  // SINGLE SOURCE OF TRUTH
      let expandedPlane = expandedPlaneRef.current
      const isExpanded = expandedProjectRef.current !== null

      if (isExpanded && expandedProjectRef.current !== null && anim.phase === 'expanded') {
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
              cleanupPlaneAttachments(expandedPlane)
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
            if (newMat.uniforms.opacity) newMat.uniforms.opacity.value = 1.0

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
        }
      }

      floatTime += timePassed * 0.001
      smoothMousePosition.x += (mousePosition.x - smoothMousePosition.x) * 0.05
      smoothMousePosition.y += (mousePosition.y - smoothMousePosition.y) * 0.05

      if (!isPausedRef.current && anim.phase === 'idle') {
        const loopWidth = cardWidth * projects.length

        updateScrollVelocity(isManualScrollingRef, velocityRef, autoScrollDirectionRef)

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

      if (anim.phase === 'idle') {
        scene.position.x = timeRef.current * sceneOptions.speed
      }

      if (anim.phase === 'idle') {
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


      planes.forEach(plane => {
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
          const targetPos = new THREE.Vector3(
            target.x - safeFrozenSceneX,
            target.y + floatOffset.y,
            target.z + floatOffset.x
          )
          const zQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
          const tiltAmount = isMobile() ? 0 : 0.15
          const tiltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tiltAmount)
          const targetQuat = new THREE.Quaternion().multiplyQuaternions(zQuat, tiltQuat)
          const targetScale = getUnifiedScale()

          progress = Math.min(1, (progress || 0) + 0.02)
          anim.progress = progress

          const t = easeOutQuart(progress)

          plane.position.lerpVectors(safeStartPos, targetPos, t)
          plane.quaternion.slerpQuaternions(safeStartQuat, targetQuat, t)
          const newScale = safeStartScale + (targetScale - safeStartScale) * t
          plane.scale.set(newScale, newScale, newScale)

          const currentEuler = new THREE.Euler().setFromQuaternion(plane.quaternion)
          const rotZ = currentEuler.z

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

          const dotsVisible = anim.phase === 'expanded'
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
              crossfadeProgressRef.current = rotationProgress
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
                mainMat.uniforms.opacity.value = 1 - crossfadeProgressRef.current
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

              const shouldShow = dotsVisible && imagePlanesRevealedRef.current && !isExiting
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
                    cardMaterial.uniforms.opacity.value = crossfadeProgressRef.current
                  } else {
                    cardMaterial.uniforms.opacity.value = positionVisible ? crossfadeProgressRef.current : 0
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
            const targetOpacity = dotsVisible ? (isHovered ? 1 : 0.5) : 0
            arrowMat.opacity += (targetOpacity - arrowMat.opacity) * 0.15

            const targetScale = isHovered ? 1.3 : 1.0
            const currentScale = arrow.scale.x
            const newScale = currentScale + (targetScale - currentScale) * 0.2
            arrow.scale.set(newScale, newScale, 1)
          })

        } else if (isExpandingOrExpanded && anim.activePlane && !plane.userData.isCurrentlyExpanding) {
          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            const targetOpacity = 0.15
            mat.uniforms.opacity.value = currentOpacity + (targetOpacity - currentOpacity) * 0.08
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
            const expandSpeed = 0.04
            if (Math.abs(expandDiff) > 0.001) {
              mat.uniforms.isExpanded.value += Math.sign(expandDiff) * Math.min(expandSpeed, Math.abs(expandDiff))
            }
          }

          if (mat.uniforms.opacity) {
            mat.uniforms.opacity.value = 1 - crossfadeProgressRef.current
          }
        } else if (anim.phase === 'collapsing') {
          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (1 - currentOpacity) * 0.1
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

          // Glow effect on hover
          if (mat.uniforms.glow) {
            const targetGlow = isHovered ? 0.1 : 0.0
            const currentGlow = mat.uniforms.glow.value
            mat.uniforms.glow.value = currentGlow + (targetGlow - currentGlow) * 0.15
          }
        }
      })

      if (anim.phase === 'collapsing' && anim.activePlane) {
        const plane = anim.activePlane
        const scaleDiff = Math.abs(1 - plane.scale.x)
        const targetY = plane.userData.initialY ?? -0.35
        const posDiff = Math.abs(plane.position.y - targetY) + Math.abs(plane.position.z)
        const rotDiff = Math.abs(plane.rotation.x) + Math.abs(plane.rotation.y) + Math.abs(plane.rotation.z)
        const isComplete = scaleDiff < 0.01 && posDiff < 0.01 && rotDiff < 0.01

        if (isComplete) {
          cleanupPlaneAttachments(plane)

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
      className={`absolute inset-x-0 top-0 h-screen z-[55] overflow-visible transition-opacity [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:overflow-visible ${!visible ? 'opacity-0 pointer-events-none [&>canvas]:pointer-events-none' : 'opacity-100 pointer-events-auto [&>canvas]:pointer-events-auto'}`}
      onTouchStart={handleCarouselTouchStart}
      onTouchEnd={handleCarouselTouchEnd}
      onMouseDown={handleCarouselTouchStart}
      onMouseUp={handleCarouselTouchEnd}
    />
  )
}
