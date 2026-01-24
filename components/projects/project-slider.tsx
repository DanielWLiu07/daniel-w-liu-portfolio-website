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

  // Image carousel refs - each image has its own 3D plane
  const imagePlanesRef = useRef<THREE.Mesh[]>([])
  const imagePlanesGroupRef = useRef<THREE.Group | null>(null)
  const carouselOffsetRef = useRef<number>(0) // Current scroll offset
  const carouselTargetOffsetRef = useRef<number>(0) // Target scroll offset
  const imagePlanesRevealedRef = useRef<boolean>(false) // Whether image planes have animated in


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

      // Set exit animation targets for image planes
      // Top cards (positive offset) fly up, bottom cards (negative offset) fly down
      imagePlanesRef.current.forEach(imgPlane => {
        const baseOffset = imgPlane.userData.baseOffset as number
        const isFirstFrame = imgPlane.userData.isFirstFrame as boolean
        if (!isFirstFrame) {
          const exitDistance = 2.0
          // Cards above center fly further up, cards below fly further down
          imgPlane.userData.exitTarget = baseOffset >= 0
            ? baseOffset + exitDistance  // Above: fly up
            : baseOffset - exitDistance  // Below: fly down
          imgPlane.userData.isExiting = true
        } else {
          // First frame also exits but to center
          imgPlane.userData.isExiting = true
          imgPlane.userData.exitTarget = 0
        }
      })

      const plane = expandedPlaneRef.current
      const dotGroup = dotGroupRef.current
      const imagePlanesGroup = imagePlanesGroupRef.current
      const dotsToClean = [...dotMeshesRef.current]
      const imagePlanesToClean = [...imagePlanesRef.current]

      if (plane) {
        setTimeout(() => {
          if (dotGroup) {
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
          }
          if (imagePlanesGroup) {
            plane.remove(imagePlanesGroup)
            imagePlanesGroup.children.forEach(child => {
              if (child instanceof THREE.Mesh) {
                child.geometry.dispose()
                if (child.material instanceof THREE.Material) {
                  child.material.dispose()
                }
              }
            })
            if (imagePlanesGroupRef.current === imagePlanesGroup) {
              imagePlanesGroupRef.current = null
            }
          }
          if (dotMeshesRef.current === dotsToClean || dotMeshesRef.current.length === 0) {
            dotMeshesRef.current = []
          }
          if (imagePlanesRef.current === imagePlanesToClean || imagePlanesRef.current.length === 0) {
            imagePlanesRef.current = []
            imagePlanesRevealedRef.current = false
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

      // Hide image planes
      imagePlanesRef.current.forEach(imgPlane => {
        const cardMaterial = imgPlane.userData.cardMaterial as THREE.ShaderMaterial
        if (cardMaterial?.uniforms?.opacity) {
          cardMaterial.uniforms.opacity.value = 0
        }
      })

      const oldPlane = expandedPlaneRef.current
      const oldDotGroup = dotGroupRef.current
      const oldImagePlanesGroup = imagePlanesGroupRef.current

      if (oldPlane) {
        if (oldDotGroup) {
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
        if (oldImagePlanesGroup) {
          oldPlane.remove(oldImagePlanesGroup)
          oldImagePlanesGroup.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              if (child.material instanceof THREE.Material) {
                child.material.dispose()
              }
            }
          })
        }
      }
      dotGroupRef.current = null
      dotMeshesRef.current = []
      imagePlanesGroupRef.current = null
      imagePlanesRef.current = []
      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0
      imagePlanesRevealedRef.current = false
      expansionStageRef.current = 'expanding'
      setExpansionStage('expanding')
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
        frameTexture,
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
      let symbol: string
      if (direction === 'left') symbol = '<'
      else if (direction === 'right') symbol = '>'
      else if (direction === 'up') symbol = '<'  // Rotated 90° via mesh rotation
      else symbol = '<'  // Rotated -90° via mesh rotation
      ctx.fillText(symbol, 64, 64)
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
      const totalSpan = (imageCount - 1) * dotSpacing

      const cardHalfWidth = sceneOptions.cardWidth / 2
      const cardHalfHeight = sceneOptions.cardHeight / 2

      // Mobile: horizontal below card, Desktop: vertical to the right of card
      const isVertical = !isMobileSize
      let startX: number, startY: number
      if (isVertical) {
        // Desktop: position to the right of the card, centered vertically
        startX = cardHalfHeight + 0.02
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
        alphaTest: 0.1
      })
      const firstArrow = new THREE.Mesh(firstArrowGeometry, firstArrowMaterial)
      if (isVertical) {
        firstArrow.position.x = startX
        firstArrow.position.y = startY + arrowOffset
      } else {
        firstArrow.position.x = startX - arrowOffset
        firstArrow.position.y = startY
      }
      firstArrow.position.z = 0.01
      if (isVertical) {
        firstArrow.rotation.z = -Math.PI / 2  // Rotate < to point down (this is the top arrow, goes to prev)
      }
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
        alphaTest: 0.1
      })
      const secondArrow = new THREE.Mesh(secondArrowGeometry, secondArrowMaterial)
      if (isVertical) {
        secondArrow.position.x = startX
        secondArrow.position.y = startY - totalSpan - arrowOffset
      } else {
        secondArrow.position.x = startX + totalSpan + arrowOffset
        secondArrow.position.y = startY
      }
      secondArrow.position.z = 0.01
      if (isVertical) {
        secondArrow.rotation.z = Math.PI / 2  // Rotate < to point up (this is the bottom arrow, goes to next)
      }
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
          side: THREE.DoubleSide
        })
        const glow = new THREE.Mesh(glowGeometry, glowMaterial)
        if (isVertical) {
          glow.position.x = startX
          glow.position.y = startY - i * dotSpacing
        } else {
          glow.position.x = startX + i * dotSpacing
          glow.position.y = startY
        }
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

    const createImagePlanes = (plane: THREE.Mesh, contentTextures: THREE.Texture[], frameTexture: THREE.Texture) => {
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

      // Store spacing and orientation in group userData
      imagePlanesGroup.userData = {
        spacing,
        isVerticalOnScreen,
        leftShiftAmount
      }

      // Reset carousel offset and reveal state
      carouselOffsetRef.current = 0
      carouselTargetOffsetRef.current = 0
      imagePlanesRevealedRef.current = false

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

        // Use same shader material as main card for identical rendering
        const cardGeometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)
        const cardMaterial = createCardMaterial(frameTexture, texture, sceneOptions.curve)
        // Set isExpanded to 1.0 to disable curve effect (flat card)
        cardMaterial.uniforms.isExpanded.value = 1.0
        cardMaterial.uniforms.opacity.value = 0 // Start hidden
        // Disable depth write for proper transparent rendering at same z-plane
        cardMaterial.depthWrite = false

        const cardPlane = new THREE.Mesh(cardGeometry, cardMaterial)
        cardPlane.position.z = 0
        imageGroup.add(cardPlane)

        // Position in LOCAL coordinates of the rotated plane
        // First frame starts in place (at 0), others start stacked off-screen
        // Local Y → screen -X when rotated, so positive Y shifts left
        // z=0 to match parent surface depth (avoids perspective size difference)
        const startOffset = isFirstFrame ? finalOffset : startingStackOffset
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

      // Hide the main plane since we're using separate image planes
      const mat = plane.material as THREE.ShaderMaterial
      if (mat.uniforms.opacity) {
        mat.uniforms.opacity.value = 0
      }
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

        // Capture EXACT current state using THREE.js clone methods
        clickedPlane.userData.animStartPos = clickedPlane.position.clone()
        clickedPlane.userData.animStartQuat = clickedPlane.quaternion.clone()
        clickedPlane.userData.animStartScale = clickedPlane.scale.x
        clickedPlane.userData.animProgress = 0
        clickedPlane.userData.animFrozenSceneX = scene.position.x

        const contentTextures = clickedPlane.userData.contentTextures as THREE.Texture[]
        const frameTexture = clickedPlane.userData.frameTexture as THREE.Texture
        if (imageCount > 0 && contentTextures && frameTexture) {
          createDots(clickedPlane, imageCount)
          createImagePlanes(clickedPlane, contentTextures, frameTexture)
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
      const scaledCardWidth = sceneOptions.cardHeight * scale

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
            const newPlaneTextures = newPlane.userData.contentTextures as THREE.Texture[]
            const newFrameTexture = newPlane.userData.frameTexture as THREE.Texture
            if (imageCount > 0 && newPlaneTextures && newFrameTexture) {
              createDots(newPlane, imageCount)
              createImagePlanes(newPlane, newPlaneTextures, newFrameTexture)
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
      } else if (!isExpanded && expansionStageRef.current === 'none') {
        // Only scroll when not expanding or expanded
        const diff = targetTimeRef.current - timeRef.current
        timeRef.current += diff * 0.1
      }

      // Freeze scene position immediately when expansion starts
      if (!isExpanded && expansionStageRef.current === 'none') {
        scene.position.x = timeRef.current * sceneOptions.speed
      }

      if (!isExpanded && expansionStageRef.current === 'none') {
        checkHover()
      }


      planes.forEach(plane => {
        // Include 'expanding' stage so mouse follow works immediately when card starts flying
        const isExpandingOrExpanded = isExpanded || expansionStageRef.current === 'expanding'
        const isExpandedPlane = plane === expandedPlane && isExpandingOrExpanded

        const mat = plane.material as THREE.ShaderMaterial

        if (isExpandedPlane) {
          const currentStage = expansionStageRef.current
          const imagePlanesRevealed = imagePlanesRevealedRef.current

          // Get stored animation state (set in click handler)
          const startPos = plane.userData.animStartPos as THREE.Vector3
          const startQuat = plane.userData.animStartQuat as THREE.Quaternion
          const startScale = plane.userData.animStartScale as number
          const frozenSceneX = plane.userData.animFrozenSceneX as number
          let progress = plane.userData.animProgress as number

          // If no start state, use current values (shouldn't happen if click handler worked)
          const safeStartPos = startPos || plane.position.clone()
          const safeStartQuat = startQuat || plane.quaternion.clone()
          const safeStartScale = startScale ?? plane.scale.x
          const safeFrozenSceneX = frozenSceneX ?? scene.position.x

          if (!startPos) {
            plane.userData.animStartPos = safeStartPos
            plane.userData.animStartQuat = safeStartQuat
            plane.userData.animStartScale = safeStartScale
            plane.userData.animFrozenSceneX = safeFrozenSceneX
          }

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

          // Update progress
          progress = Math.min(1, (progress || 0) + 0.01)
          plane.userData.animProgress = progress

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

          // Transition to expanded stage early (at 40%) so image planes can start revealing
          if (progress >= 0.4 && currentStage === 'expanding') {
            expansionStageRef.current = 'expanded'
            setExpansionStage('expanded')
          }

          if (dotGroupRef.current) {
            // Counter-rotate Z to keep dots upright (facing camera)
            dotGroupRef.current.rotation.z = -rotZ
            dotGroupRef.current.rotation.x = 0
            dotGroupRef.current.rotation.y = 0
          }

          if (imagePlanesGroupRef.current) {
            imagePlanesGroupRef.current.rotation.x = 0
            imagePlanesGroupRef.current.rotation.y = 0
            imagePlanesGroupRef.current.rotation.z = 0
          }

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

          // Image planes carousel animation - smooth filmstrip scrolling with looping
          const imagePlanes = imagePlanesRef.current
          const imagePlanesGroup = imagePlanesGroupRef.current

          if (imagePlanes && imagePlanes.length > 0 && imagePlanesGroup) {
            const groupData = imagePlanesGroup.userData
            const spacing = groupData.spacing as number
            const totalFrames = imagePlanes.length
            const totalSpan = totalFrames * spacing // Total loop length

            // Start reveal when main card animation is partially done (40%)
            const expandedPlane = expandedPlaneRef.current
            const animProgress = expandedPlane?.userData?.animProgress as number ?? 0
            const animationMostlyDone = animProgress >= 0.4
            const expansionComplete = expansionStageRef.current === 'expanded' && animationMostlyDone
            if (expansionComplete && !imagePlanesRevealedRef.current) {
              // Start revealing - set target positions
              imagePlanes.forEach((imageGroup) => {
                imageGroup.userData.targetAnimOffset = imageGroup.userData.baseOffset
              })
              imagePlanesRevealedRef.current = true
            }

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
                // Use larger threshold so cards wrap only when fully off-screen
                const wrapThreshold = totalSpan * 0.75
                while (finalOffset > wrapThreshold) {
                  finalOffset -= totalSpan
                }
                while (finalOffset < -wrapThreshold) {
                  finalOffset += totalSpan
                }
              }

              // Check if this card has finished its reveal animation
              const revealComplete = imageGroup.userData.revealComplete as boolean ?? false

              // Get per-card starting offset for entrance animation
              const startingOffset = imageGroup.userData.startingOffset as number ?? -3.0

              // Check if card is exiting (flying away)
              const isExiting = imageGroup.userData.isExiting as boolean ?? false
              const exitTarget = imageGroup.userData.exitTarget as number ?? 0

              // Animate reveal, scroll, or exit
              if (isExiting && !isFirstFrame) {
                // Exit animation: fly to exit target - use faster speed (3x) to match intro
                const currentPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
                const exitDistance = Math.abs(exitTarget - currentPos)
                const exitSpeed = getEasedMovementAmount(exitDistance) * 3
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
              } else if (!revealComplete) {
                // During reveal: animate from stacked position to final position
                const currentPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
                const distToTarget = Math.abs(finalOffset - currentPos)

                // Mark reveal complete when close enough
                if (distToTarget < 0.01) {
                  imageGroup.userData.revealComplete = true
                  if (frameIsVertical) {
                    imageGroup.position.x = finalOffset
                    imageGroup.position.y = 0
                  } else {
                    imageGroup.position.x = 0
                    imageGroup.position.y = finalOffset
                  }
                } else {
                  // Animate toward target - use 3x speed to match exit timing
                  const revealSpeed = getEasedMovementAmount(distToTarget) * 3
                  if (frameIsVertical) {
                    imageGroup.position.x += (finalOffset - imageGroup.position.x) * revealSpeed
                    imageGroup.position.y = 0
                  } else {
                    imageGroup.position.x = 0
                    imageGroup.position.y += (finalOffset - imageGroup.position.y) * revealSpeed
                  }
                }
              } else {
                // After reveal: directly follow finalOffset (already smooth from carousel interpolation)
                // No additional smoothing needed - just set position directly
                if (frameIsVertical) {
                  imageGroup.position.x = finalOffset
                  imageGroup.position.y = 0
                } else {
                  imageGroup.position.x = 0
                  imageGroup.position.y = finalOffset
                }
              }

              // Add individual bobbing animation per card
              // Gradually blend in float after reveal to avoid snap
              const floatPhaseOffset = imageGroup.userData.floatPhaseOffset as number || 0
              const cardFloatOffset = getFloatOffset(floatTime + floatPhaseOffset, 'left')

              // Blend float intensity: 0 during reveal, gradually increase after
              let floatBlend = imageGroup.userData.floatBlend as number ?? 0
              if (revealComplete && !isExiting) {
                floatBlend = Math.min(1, floatBlend + 0.02)  // Gradually increase
              } else {
                floatBlend = 0
              }
              imageGroup.userData.floatBlend = floatBlend

              if (floatBlend > 0) {
                if (frameIsVertical) {
                  imageGroup.position.x += cardFloatOffset.y * floatBlend
                  imageGroup.position.y += cardFloatOffset.x * floatBlend
                } else {
                  imageGroup.position.x += cardFloatOffset.x * floatBlend
                  imageGroup.position.y += cardFloatOffset.y * floatBlend
                }
              }
              imageGroup.position.z = 0

              // === ROTATION: Inherit from parent (main card has the tilt) ===
              if (cardPlane) {
                // Reset to identity - the parent plane already has the 0.15 tilt
                cardPlane.quaternion.identity()
              }

              // === OPACITY: Instant show/hide (no fade) ===
              const shouldShow = dotsVisible && imagePlanesRevealedRef.current && !isExiting
              const cardMaterial = imageGroup.userData.cardMaterial as THREE.ShaderMaterial

              if (cardMaterial && cardMaterial.uniforms.opacity) {
                if (isExiting) {
                  // Exiting cards fade out quickly
                  const exitFadeSpeed = 0.15
                  const currentOpacity = cardMaterial.uniforms.opacity.value
                  cardMaterial.uniforms.opacity.value = currentOpacity * (1 - exitFadeSpeed)
                } else {
                  // Instant opacity - no fade
                  cardMaterial.uniforms.opacity.value = shouldShow ? 1 : 0
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
          // Use faster exit speed (3x) to match intro timing
          const easeAmount = getEasedMovementAmount(distance) * 3

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

            // Exit animation for image planes - fly away and fade out
            const imagePlanes = imagePlanesRef.current
            if (imagePlanes && imagePlanes.length > 0) {
              const isMobileSize = container.clientWidth < MD_BREAKPOINT
              const frameIsVertical = !isMobileSize

              imagePlanes.forEach((imageGroup) => {
                const isExiting = imageGroup.userData.isExiting as boolean ?? false
                const exitTarget = imageGroup.userData.exitTarget as number ?? 0
                const cardMaterial = imageGroup.userData.cardMaterial as THREE.ShaderMaterial

                if (isExiting) {
                  // Fly to exit target - use faster speed (3x) to match intro timing
                  const currentPos = frameIsVertical ? imageGroup.position.x : imageGroup.position.y
                  const exitDistance = Math.abs(exitTarget - currentPos)
                  const exitSpeed = getEasedMovementAmount(exitDistance) * 3
                  if (frameIsVertical) {
                    imageGroup.position.x += (exitTarget - imageGroup.position.x) * exitSpeed
                  } else {
                    imageGroup.position.y += (exitTarget - imageGroup.position.y) * exitSpeed
                  }

                  // Fade out - match main card fade speed
                  if (cardMaterial && cardMaterial.uniforms.opacity) {
                    const currentOpacity = cardMaterial.uniforms.opacity.value
                    cardMaterial.uniforms.opacity.value = currentOpacity * (1 - exitSpeed)
                  }
                }
              })
            }

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
          // Reset animation state so next click starts fresh
          planes.forEach(plane => {
            plane.userData.animStartPos = undefined
            plane.userData.animStartQuat = undefined
            plane.userData.animStartScale = undefined
            plane.userData.animProgress = undefined
            plane.userData.animFrozenSceneX = undefined
          })
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
      className={`absolute inset-x-0 top-0 h-screen z-[55] overflow-visible transition-opacity [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:w-full [&>canvas]:h-full [&>canvas]:overflow-visible ${!visible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      onTouchStart={handleCarouselTouchStart}
      onTouchEnd={handleCarouselTouchEnd}
      onMouseDown={handleCarouselTouchStart}
      onMouseUp={handleCarouselTouchEnd}
    />
  )
}
