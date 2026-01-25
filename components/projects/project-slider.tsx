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
  // Starting values for interpolation
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
}

export default function ProjectSlider({ isPaused, onProjectClick, onPauseChange, onExpansionStageChange, visible, expandedProject, onPrevProject, onNextProject }: ProjectSliderProps) {
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

  // SINGLE SOURCE OF TRUTH for animation state
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

  // Keep these for compatibility but they derive from animStateRef
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

  // Image carousel refs - each image has its own 3D plane
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

  useEffect(() => {
    onPrevProjectRef.current = onPrevProject
  }, [onPrevProject])

  useEffect(() => {
    onNextProjectRef.current = onNextProject
  }, [onNextProject])

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    onExpansionStageChangeRef.current?.(expansionStage)
  }, [expansionStage])

  // Keyboard navigation: up/down = carousel, left/right = project switch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when a project is expanded
      if (expandedProjectRef.current === null) return

      const container = containerRef.current
      if (!container) return

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          // Up = previous image (like up angle bracket)
          container.dispatchEvent(new CustomEvent('arrowClick', { detail: { direction: 'prev' } }))
          break
        case 'ArrowDown':
          e.preventDefault()
          // Down = next image (like down angle bracket)
          container.dispatchEvent(new CustomEvent('arrowClick', { detail: { direction: 'next' } }))
          break
        case 'ArrowLeft':
          e.preventDefault()
          // Left = previous project (like left hand)
          onPrevProjectRef.current?.()
          break
        case 'ArrowRight':
          e.preventDefault()
          // Right = next project (like right hand)
          onNextProjectRef.current?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const prevExpandedProjectRef = useRef<number | null>(null)
  const flickerTimeRef = useRef(0)

  // Helper to clean up dots and image planes from a plane
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

    // CLOSE: Only handle when expandedProject becomes null AND we're in expanded phase
    // Click handler handles everything else - we don't interfere
    if (expandedProject === null && anim.phase === 'expanded' && anim.activePlane) {
      // Start collapse animation
      anim.phase = 'collapsing'
      anim.progress = 0
      anim.startPos = anim.activePlane.position.clone()
      anim.startQuat = anim.activePlane.quaternion.clone()
      anim.startScale = anim.activePlane.scale.x

      expansionStageRef.current = 'none'
      setExpansionStage('none')
      imagePlanesExitedRef.current = false

      // Set exit targets for image planes
      imagePlanesRef.current.forEach(imgPlane => {
        const baseOffset = imgPlane.userData.baseOffset as number
        const isFirstFrame = imgPlane.userData.isFirstFrame as boolean
        const exitDistance = 2.0
        imgPlane.userData.isExiting = true
        imgPlane.userData.exitTarget = isFirstFrame ? 0 : (baseOffset >= 0 ? baseOffset + exitDistance : baseOffset - exitDistance)
      })
    }
    // PROJECT SWITCH via navigation arrows (when already expanded)
    // Don't change phase here - let the animation loop handle the transition
    // The animation loop checks if currentPlaneProjectId !== expandedProjectRef.current
    else if (expandedProject !== null && prevProject !== null && expandedProject !== prevProject && anim.phase === 'expanded') {
      flickerTimeRef.current = 0
      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0
      // Keep crossfade at 1 (selection images visible) when switching projects
      crossfadeProgressRef.current = 1
      imagePlanesRevealedRef.current = true
      // Phase stays 'expanded' - animation loop will detect the project ID mismatch and handle the switch
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

    // Update target offset for smooth carousel scroll
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

    allProjects.forEach((project, i) => {
      const textureLoader = new THREE.TextureLoader()
      const frameTexture = textureLoader.load(project.image)
      const contentTextures = project.images.map(imgPath => textureLoader.load(imgPath))

      // Create video element for thumbnail (WebM for best performance)
      // Ping-pong loop: plays forward, then reverse, seamlessly
      const video = document.createElement('video')
      video.src = project.thumbnail
      video.loop = false // We handle looping manually for ping-pong
      video.muted = true
      video.playsInline = true
      video.autoplay = true
      video.crossOrigin = 'anonymous'

      let playingForward = true
      let reverseAnimationId: number | null = null

      const playReverse = () => {
        if (video.currentTime <= 0) {
          // Reached start, play forward again
          playingForward = true
          video.play().catch(() => {})
          return
        }
        // Step backward ~60fps
        video.currentTime = Math.max(0, video.currentTime - 1/30)
        reverseAnimationId = requestAnimationFrame(playReverse)
      }

      video.addEventListener('ended', () => {
        if (playingForward) {
          // Video finished forward, now play reverse
          playingForward = false
          video.pause()
          playReverse()
        }
      })

      video.play().catch(() => {
        // Autoplay may be blocked, will play on user interaction
      })

      // Store reverse animation ID for cleanup
      video.dataset.reverseAnimId = ''
      const origPause = video.pause.bind(video)
      video.pause = () => {
        if (reverseAnimationId) {
          cancelAnimationFrame(reverseAnimationId)
          reverseAnimationId = null
        }
        origPause()
      }

      // Use video texture for thumbnail in main carousel
      const thumbnailTexture = new THREE.VideoTexture(video)
      thumbnailTexture.minFilter = THREE.LinearFilter
      thumbnailTexture.magFilter = THREE.LinearFilter

      const geometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)
      const cardAspectRatio = sceneOptions.cardWidth / sceneOptions.cardHeight
      const material = createCardMaterial(frameTexture, thumbnailTexture, sceneOptions.curve, 1.0, cardAspectRatio, false)

      // Update aspect ratio when video metadata loads
      video.addEventListener('loadedmetadata', () => {
        if (video.videoWidth && video.videoHeight) {
          material.uniforms.contentAspectRatio.value = video.videoWidth / video.videoHeight
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
        thumbnailVideo: video,
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

      // Mobile: horizontal below card, Desktop: vertical to the right of card
      const isVertical = !isMobileSize
      let startX: number, startY: number
      if (isVertical) {
        // Desktop: position to the right of the card, centered vertically
        startX = cardHalfHeight + 0.12
        startY = totalSpan / 2
      } else {
        // Mobile: position below the card, centered horizontally
        startX = -totalSpan / 2
        startY = -cardHalfWidth - 0.14
      }

      const arrowSize = isMobileSize ? 0.28 : 0.18
      const arrowOffset = isMobileSize ? 0.22 : 0.14

      // First arrow (left on mobile, up on desktop)
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

      // Second arrow (right on mobile, down on desktop)
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

      // Create arrow textures based on orientation
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
      // Clean up existing image planes
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
      // Desktop: stack vertically on screen, Mobile: stack horizontally on screen
      // Since main plane rotates 90deg (Z), local coords are transformed:
      // - Local X → screen Y (vertical)
      // - Local Y → screen -X (horizontal)
      const isVerticalOnScreen = !isMobileSize

      // Spacing between frames - larger gap on mobile
      const spacing = isMobileSize
        ? sceneOptions.cardWidth + 0.55
        : sceneOptions.cardWidth + 0.12
      // No left shift - frames align with main card position
      const leftShiftAmount = 0

      // Card aspect ratio (width / height)
      const cardAspectRatio = sceneOptions.cardWidth / sceneOptions.cardHeight

      // Store spacing and orientation in group userData
      imagePlanesGroup.userData = {
        spacing,
        isVerticalOnScreen,
        leftShiftAmount,
        introProgress: skipRevealAnimation ? 1 : 0  // Skip intro animation if switching projects
      }

      // Reset carousel offset and reveal state
      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0
      // If skipping reveal animation, mark as already revealed
      imagePlanesRevealedRef.current = skipRevealAnimation

      contentTextures.forEach((texture, i) => {
        // Create a group for each image
        const imageGroup = new THREE.Group()

        const isFirstFrame = i === 0

        // Centered filmstrip: cards distributed above AND below selected card
        const totalImages = contentTextures.length
        const halfCount = Math.floor(totalImages / 2)

        // Index 0 at center, first half below, second half above (wrapped)
        let finalOffset: number
        if (i === 0) {
          finalOffset = 0
        } else if (i <= halfCount) {
          finalOffset = -spacing * i  // Below center
        } else {
          finalOffset = spacing * (totalImages - i)  // Above center (wrapped)
        }

        const entryDistance = 2.0
        // Simple: above center → come from above, below center → come from below
        const startingStackOffset = finalOffset >= 0
          ? finalOffset + entryDistance  // At or above center: come from above
          : finalOffset - entryDistance  // Below center: come from below

        // Calculate content aspect ratio from texture if available
        let contentAspectRatio = 1.0
        const img = texture.image as HTMLImageElement | undefined
        if (img && img.width && img.height) {
          contentAspectRatio = img.width / img.height
        }

        // Use same shader material as main card for identical rendering
        // Rotate content 90 degrees clockwise to match the rotated frame
        const cardGeometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)
        // When skipping animation (switching projects), start with rotateContent=1 (frame hidden, image rotated)
        // Otherwise start at 0 and animate to 1
        const cardMaterial = createCardMaterial(frameTexture, texture, sceneOptions.curve, contentAspectRatio, cardAspectRatio, skipRevealAnimation)
        // Set isExpanded to 1.0 to disable curve effect (flat card)
        cardMaterial.uniforms.isExpanded.value = 1.0
        // Start visible if skipping animation, otherwise hidden
        cardMaterial.uniforms.opacity.value = skipRevealAnimation ? 1 : 0
        // Disable depth write for proper transparent rendering at same z-plane
        cardMaterial.depthWrite = false

        // Update aspect ratio when texture loads (in case it wasn't loaded yet)
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

        // Position in LOCAL coordinates of the rotated plane
        // If skipping reveal animation, start at final position
        // Otherwise: first frame starts in place, others start stacked off-screen
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
          // Rotation tracking for horizontal mouse-follow
          currentRotY: 0,
          // Floating animation phase offset (staggered by index)
          floatPhaseOffset: i * 0.7,
          cardPlane, // Single plane with shader material
          cardMaterial // Reference to shader material for opacity control
        }

        imagePlanesGroup.add(imageGroup)
        imagePlanes.push(imageGroup as unknown as THREE.Mesh)
      })

      imagePlanesRef.current = imagePlanes
      plane.add(imagePlanesGroup)

      // Don't hide the main plane immediately - let it crossfade with image planes
      // The animation loop will handle the crossfade
      // If skipping reveal animation (switching projects), hide main plane immediately
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

      // Check if clicking on arrows/dots first (when expanded/expanding)
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

      // Check if clicking on a card
      const intersects = raycaster.intersectObjects(planes)
      if (intersects.length === 0) return

      const clickedPlane = intersects[0].object as THREE.Mesh

      // BLOCK ALL CLICKS during expanding, collapsing, or when already expanded
      // Only allow clicks when idle (carousel mode)
      if (anim.phase !== 'idle') {
        return
      }

      // === SIMPLIFIED CLICK HANDLING ===
      // At this point we're idle - starting a new expansion

      // Reset all refs for new card
      dotMeshesRef.current = []
      imagePlanesRef.current = []
      arrowMeshesRef.current = { left: null, right: null }
      imagePlanesRevealedRef.current = false
      imagePlanesExitedRef.current = false
      crossfadeProgressRef.current = 0
      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0

      // Step 3: Set up new expansion
      const projectId = clickedPlane.userData.projectId
      const projectData = projects.find(p => p.id === projectId)
      const imageCount = projectData?.images?.length || 0

      // Ensure clicked card is visible
      const clickedMat = clickedPlane.material as THREE.ShaderMaterial
      if (clickedMat.uniforms.opacity) clickedMat.uniforms.opacity.value = 1
      if (clickedMat.uniforms.isExpanded) clickedMat.uniforms.isExpanded.value = 0

      // Step 4: Set animation state (SINGLE SOURCE OF TRUTH)
      anim.phase = 'expanding'
      anim.activePlane = clickedPlane
      anim.projectId = projectId
      anim.progress = 0
      anim.startPos = clickedPlane.position.clone()
      anim.startQuat = clickedPlane.quaternion.clone()
      anim.startScale = clickedPlane.scale.x
      anim.frozenSceneX = scene.position.x

      // Sync compatibility refs
      expandedPlaneRef.current = clickedPlane
      expansionStageRef.current = 'expanding'
      setExpansionStage('expanding')

      // Stop carousel scroll
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

      // Create dots and image planes
      const contentTextures = clickedPlane.userData.contentTextures as THREE.Texture[]
      const frameTexture = clickedPlane.userData.frameTexture as THREE.Texture
      if (imageCount > 0 && contentTextures && frameTexture) {
        createDots(clickedPlane, imageCount)
        createImagePlanes(clickedPlane, contentTextures, frameTexture)
      }

      // Re-ensure card is visible after createImagePlanes (which sets opacity to 0)
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

      // Update carousel target offset for smooth scroll
      // For dot clicks, take the shortest path
      const spacing = imagePlanesGroup.userData.spacing as number || 1.2
      const totalImages = imagePlanes.length
      const totalSpan = totalImages * spacing

      // Calculate current logical position
      const currentOffset = carouselTargetOffsetRef.current
      const targetOffset = newIndex * spacing

      // Find shortest path (direct or wrapped)
      const directDiff = targetOffset - currentOffset
      const wrapForwardDiff = directDiff + totalSpan
      const wrapBackwardDiff = directDiff - totalSpan

      // Choose the smallest absolute difference
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
        // Always scroll UP (subtract spacing) - continuous direction
        carouselTargetOffsetRef.current -= spacing

        plane.userData.currentImageIndex = newIndex
        setCurrentImageIndex(newIndex)
        updateDotColors(newIndex)
      } else {
        const newIndex = (currentIndex + 1) % totalImages
        // Always scroll DOWN (add spacing) - continuous direction
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

      // Project switch code - ONLY runs when already expanded (for navigation arrows)
      // Skip during 'expanding' state to avoid interfering with new card animation
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

            // Clean up old plane's attachments first
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

            // Update both refs to the new plane
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
              // Skip reveal animation when switching between projects (not first open from grid)
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
        // Only scroll when idle (not expanding, expanded, or exiting)
        const diff = targetTimeRef.current - timeRef.current
        timeRef.current += diff * 0.1
      }

      // Freeze scene position when not idle
      if (anim.phase === 'idle') {
        scene.position.x = timeRef.current * sceneOptions.speed
      }

      if (anim.phase === 'idle') {
        checkHover()
      }

      // EXIT ANIMATION: Animate image planes and update crossfade based on rotation
      // This runs OUTSIDE the planes.forEach loop
      // IMPORTANT: Only run exit animation when state is 'collapsing'
      if (anim.phase === 'collapsing' && anim.activePlane && !imagePlanesExitedRef.current) {
        // Calculate rotation progress for crossfade (same as in expansion)
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

              // Use crossfade progress for opacity (tied to rotation)
              if (cardMaterial && cardMaterial.uniforms.opacity) {
                cardMaterial.uniforms.opacity.value = crossfadeProgressRef.current
                // Also update rotateContent for frame fade
                if (cardMaterial.uniforms.rotateContent) {
                  cardMaterial.uniforms.rotateContent.value = crossfadeProgressRef.current
                }
                if (crossfadeProgressRef.current > 0.05) {
                  allExited = false
                }
              }
            }
          })

          // Fade out dots and arrows quickly
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
          // No image planes, skip directly to main card animation
          imagePlanesExitedRef.current = true
        }
      }


      planes.forEach(plane => {
        // SIMPLIFIED: Only check if this is the active plane
        const isActivePlane = plane === anim.activePlane
        const isExpandingOrExpanded = anim.phase === 'expanding' || anim.phase === 'expanded'
        const mat = plane.material as THREE.ShaderMaterial

        // EXPANSION ANIMATION: Animate the active plane
        if (isActivePlane && isExpandingOrExpanded) {
          const currentStage = expansionStageRef.current
          const imagePlanesRevealed = imagePlanesRevealedRef.current

          // Get animation state (should be set by click handler)
          let startPos = anim.startPos
          let startQuat = anim.startQuat
          let startScale = anim.startScale
          let frozenSceneX = anim.frozenSceneX
          let progress = anim.progress

          // Safety fallback: initialize if missing
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

          // ALWAYS ensure active plane is visible (before image planes revealed)
          if (!imagePlanesRevealed && mat.uniforms.opacity) {
            mat.uniforms.opacity.value = 1
          }

          const safeStartPos = startPos
          const safeStartQuat = startQuat
          const safeStartScale = startScale
          const safeFrozenSceneX = frozenSceneX

          // Calculate target state
          const target = getExpandedTargetPosition()
          const floatOffset = getFloatOffset(floatTime, 'left')
          const targetPos = new THREE.Vector3(
            target.x - safeFrozenSceneX,
            target.y + floatOffset.y,
            target.z + floatOffset.x
          )
          // Target: portrait (Z=PI/2), with slight right tilt on desktop only
          const zQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
          const tiltAmount = isMobile() ? 0 : 0.15
          const tiltQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tiltAmount)
          const targetQuat = new THREE.Quaternion().multiplyQuaternions(zQuat, tiltQuat)
          const targetScale = getUnifiedScale()

          // Update progress in animStateRef (slower intro animation)
          progress = Math.min(1, (progress || 0) + 0.02)
          anim.progress = progress

          // Apply easing
          const t = easeOutQuart(progress)

          // Interpolate using THREE.js built-in methods
          plane.position.lerpVectors(safeStartPos, targetPos, t)
          plane.quaternion.slerpQuaternions(safeStartQuat, targetQuat, t)
          const newScale = safeStartScale + (targetScale - safeStartScale) * t
          plane.scale.set(newScale, newScale, newScale)

          // Get current Z rotation for dot counter-rotation
          const currentEuler = new THREE.Euler().setFromQuaternion(plane.quaternion)
          const rotZ = currentEuler.z

          // Transition to expanded stage early (at 20%) so image planes can start revealing
          if (progress >= 0.2 && currentStage === 'expanding') {
            anim.phase = 'expanded'
            expansionStageRef.current = 'expanded'
            setExpansionStage('expanded')
          }

          if (dotGroupRef.current) {
            // Counter-rotate Z to keep dots upright (facing camera)
            dotGroupRef.current.rotation.z = -rotZ
            dotGroupRef.current.rotation.x = 0
            dotGroupRef.current.rotation.y = 0
          }

          // Image planes rotate with the parent frame - no rotation reset needed

          if (mat.uniforms.isExpanded) {
            const expandDiff = 1.0 - mat.uniforms.isExpanded.value
            const expandSpeed = 0.08
            if (Math.abs(expandDiff) > 0.001) {
              mat.uniforms.isExpanded.value += Math.sign(expandDiff) * Math.min(expandSpeed, Math.abs(expandDiff))
            }
          }

          // Show main plane while expanding, INSTANT hide when image planes appear
          if (mat.uniforms.opacity) {
            // Instant switch - no crossfade
            mat.uniforms.opacity.value = imagePlanesRevealed ? 0 : 1
            mat.depthWrite = !imagePlanesRevealed
          }

          // Show dots when expanded OR when expanding (handles frames before expandedProjectRef updates)
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

          // Image planes carousel animation - smooth filmstrip scrolling with looping
          const imagePlanes = imagePlanesRef.current
          const imagePlanesGroup = imagePlanesGroupRef.current

          if (imagePlanes && imagePlanes.length > 0 && imagePlanesGroup) {
            const groupData = imagePlanesGroup.userData
            const spacing = groupData.spacing as number
            const totalFrames = imagePlanes.length
            const totalSpan = totalFrames * spacing // Total loop length

            // Crossfade is tied directly to rotation progress
            // As the card rotates from 0 to 90 degrees, crossfade goes from 0 to 1
            const isExitingGlobal = anim.phase === 'collapsing'
            const isExpandingOrExpanded = anim.phase === 'expanding' || anim.phase === 'expanded'

            // Calculate rotation progress from the active plane's Z rotation
            // 0 rotation = 0 progress, PI/2 rotation = 1 progress
            let rotationProgress = 0
            if (anim.activePlane) {
              const currentRotZ = anim.activePlane.rotation.z
              rotationProgress = Math.min(1, Math.abs(currentRotZ) / (Math.PI / 2))
            }

            // Use rotation progress for crossfade during expansion
            // Use animated crossfade during collapse (reverse)
            if (isExpandingOrExpanded && !isExitingGlobal) {
              crossfadeProgressRef.current = rotationProgress
              if (!imagePlanesRevealedRef.current && rotationProgress > 0.1) {
                imagePlanes.forEach((imageGroup) => {
                  imageGroup.userData.targetAnimOffset = imageGroup.userData.baseOffset
                })
                imagePlanesRevealedRef.current = true
              }
            } else if (isExitingGlobal) {
              // During exit, animate crossfade back based on rotation
              crossfadeProgressRef.current = rotationProgress
            }

            // Apply crossfade to main card (thumbnail fades out)
            if (anim.activePlane) {
              const mainMat = anim.activePlane.material as THREE.ShaderMaterial
              if (mainMat?.uniforms?.opacity) {
                mainMat.uniforms.opacity.value = 1 - crossfadeProgressRef.current
              }
            }

            // Apply crossfade to all image planes (selection images fade in)
            // Also sync rotateContent for frame fade
            imagePlanes.forEach((imageGroup) => {
              const cardMaterial = imageGroup.userData.cardMaterial as THREE.ShaderMaterial
              if (cardMaterial?.uniforms?.rotateContent) {
                cardMaterial.uniforms.rotateContent.value = crossfadeProgressRef.current
              }
            })

            // Smoothly interpolate carousel offset (slow and smooth)
            const offsetDiff = carouselTargetOffsetRef.current - carouselOffsetRef.current
            carouselOffsetRef.current += offsetDiff * 0.08 // Slow smooth scrolling

            // Frames stacked on screen - vertical on desktop, horizontal on mobile
            // Parent plane is rotated 90° on Z, so local X = screen Y (vertical)
            imagePlanes.forEach((imageGroup) => {
              const isFirstFrame = imageGroup.userData.isFirstFrame as boolean
              const cardPlane = imageGroup.userData.cardPlane as THREE.Mesh
              const frameIsVertical = imageGroup.userData.isVerticalOnScreen as boolean

              // Base position for this frame (index 0 at center, others offset)
              const baseOffset = imageGroup.userData.baseOffset as number // Set during creation: -index * spacing

              // Apply carousel scroll offset
              let finalOffset = baseOffset + carouselOffsetRef.current

              // Wrap around for infinite seamless scrolling
              if (imagePlanesRevealedRef.current) {
                // Use halfSpan for mathematically correct even distribution
                const halfSpan = totalSpan / 2
                while (finalOffset > halfSpan) {
                  finalOffset -= totalSpan
                }
                while (finalOffset < -halfSpan) {
                  finalOffset += totalSpan
                }
              }

              // Get per-card starting offset for entrance animation
              const startingOffset = imageGroup.userData.startingOffset as number ?? -3.0

              // Check if card is exiting (flying away)
              const isExiting = imageGroup.userData.isExiting as boolean ?? false
              const exitTarget = imageGroup.userData.exitTarget as number ?? 0

              // Track intro animation progress (shared across all cards)
              const introProgress = imagePlanesGroupRef.current?.userData.introProgress as number ?? 0

              // Animate reveal, scroll, or exit
              if (isExiting && !isFirstFrame) {
                // Exit animation: fly to exit target
                const exitSpeed = getEasedMovementAmount()
                if (frameIsVertical) {
                  imageGroup.position.x += (exitTarget - imageGroup.position.x) * exitSpeed
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y += (exitTarget - imageGroup.position.y) * exitSpeed
                }
              } else if (!imagePlanesRevealedRef.current) {
                // Before reveal: first frame in place, others at their starting positions
                if (frameIsVertical) {
                  imageGroup.position.x = isFirstFrame ? 0 : startingOffset
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y = isFirstFrame ? 0 : startingOffset
                }
              } else if (introProgress < 1) {
                // During intro: animate ALL cards from starting position to final position
                // Use shared progress so all cards move at same pace
                const currentPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
                const targetPos = finalOffset

                // Interpolate toward target
                const introSpeed = 0.15
                const newPos = currentPos + (targetPos - currentPos) * introSpeed

                if (frameIsVertical) {
                  imageGroup.position.x = newPos
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y = newPos
                }

                // Update shared intro progress using card index 1 (which actually moves)
                // Card 0 is already at its final position so can't track progress
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
                // After intro complete: ALL cards follow finalOffset directly
                if (frameIsVertical) {
                  imageGroup.position.x = finalOffset
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y = finalOffset
                }
              }

              // No per-card float animation - all cards move in perfect sync
              // Cards further from center come closer to viewer for circular effect
              const actualPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
              const distFromCenter = Math.abs(actualPos)

              // Skip position and rotation updates during exit to prevent unwanted movement
              if (!isExiting) {
                // Cards further from center come closer to viewer for circular effect
                imageGroup.position.z = distFromCenter * 0.2

                // === ROTATION: Curved carousel effect ===
                if (cardPlane) {
                  const forwardBackTilt = smoothMousePosition.x * 0.08

                  // Top cards (positive position) tilt downward, bottom cards tilt upward
                  const tiltY = -actualPos * 0.25
                  cardPlane.rotation.x = forwardBackTilt
                  cardPlane.rotation.y = tiltY
                  cardPlane.rotation.z = 0
                  imageGroup.rotation.set(0, 0, 0)
                }
              }

              // === OPACITY: Based on actual position, hide edges for seamless wrap ===
              const shouldShow = dotsVisible && imagePlanesRevealedRef.current && !isExiting
              const cardMaterial = imageGroup.userData.cardMaterial as THREE.ShaderMaterial

              if (cardMaterial && cardMaterial.uniforms.opacity) {
                const actualPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
                const distFromCenter = Math.abs(actualPos)

                if (isExiting) {
                  // Exiting: use crossfade progress (animated globally above)
                  cardMaterial.uniforms.opacity.value = crossfadeProgressRef.current
                } else if (shouldShow) {
                  // Visibility based on crossfade progress and position (for carousel wrap)
                  const visibleRange = spacing * 1.5
                  const positionVisible = distFromCenter <= visibleRange

                  // Base opacity from crossfade, multiplied by position visibility after intro
                  if (introProgress < 1) {
                    // During intro: fade in with crossfade
                    cardMaterial.uniforms.opacity.value = crossfadeProgressRef.current
                  } else {
                    // After intro: crossfade * position visibility
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
          // Other cards fade to 0.15 when a card is expanded/expanding
          // CRITICAL: Never fade the card with isCurrentlyExpanding marker
          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            const targetOpacity = 0.15
            mat.uniforms.opacity.value = currentOpacity + (targetOpacity - currentOpacity) * 0.08
          }
        } else if (isActivePlane && anim.phase === 'collapsing') {
          // EXIT: Main card rotates back while image planes fade (simultaneous)
          // Main card stays fully visible - no fade
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

          // Main card fades in as rotation returns to 0 (handled by crossfade logic)
          // Opacity = 1 - crossfadeProgress, which goes from 0 to 1 as rotation goes PI/2 to 0
          if (mat.uniforms.opacity) {
            mat.uniforms.opacity.value = 1 - crossfadeProgressRef.current
          }
        } else if (anim.phase === 'collapsing') {
          // Other cards: fade back to full opacity during exit animation
          if (mat.uniforms.opacity) {
            const currentOpacity = mat.uniforms.opacity.value
            mat.uniforms.opacity.value = currentOpacity + (1 - currentOpacity) * 0.1
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

      // Check if collapse animation is complete
      if (anim.phase === 'collapsing' && anim.activePlane) {
        const plane = anim.activePlane
        const scaleDiff = Math.abs(1 - plane.scale.x)
        const targetY = plane.userData.initialY ?? -0.35
        const posDiff = Math.abs(plane.position.y - targetY) + Math.abs(plane.position.z)
        const rotDiff = Math.abs(plane.rotation.x) + Math.abs(plane.rotation.y) + Math.abs(plane.rotation.z)
        const isComplete = scaleDiff < 0.01 && posDiff < 0.01 && rotDiff < 0.01

        if (isComplete) {
          // Clean up dots and image planes
          cleanupPlaneAttachments(plane)

          // Transition to idle state
          anim.phase = 'idle'
          anim.activePlane = null
          anim.projectId = null
          anim.progress = 0
          anim.startPos = null
          anim.startQuat = null
          anim.startScale = 1
          anim.frozenSceneX = 0

          // Sync compatibility refs
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
        // Clean up video elements
        const video = plane.userData.thumbnailVideo as HTMLVideoElement | undefined
        if (video) {
          video.pause()
          video.src = ''
          video.load()
        }
        const thumbnailTex = plane.userData.thumbnailTexture as THREE.VideoTexture | undefined
        if (thumbnailTex) {
          thumbnailTex.dispose()
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
      className={`absolute inset-x-0 top-0 h-screen z-[55] overflow-visible transition-opacity [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:overflow-visible ${!visible ? 'opacity-0 pointer-events-none [&>canvas]:pointer-events-none' : 'opacity-100 pointer-events-auto [&>canvas]:pointer-events-auto'}`}
      onTouchStart={handleCarouselTouchStart}
      onTouchEnd={handleCarouselTouchEnd}
      onMouseDown={handleCarouselTouchStart}
      onMouseUp={handleCarouselTouchEnd}
    />
  )
}
