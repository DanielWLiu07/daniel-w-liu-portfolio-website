'use client'

import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import Image from 'next/image'
import ProjectModal from '@/components/projects/ProjectModal'
import { projects, sceneOptions, animationConstants } from '@/components/projects/project-data'

const { WHEEL_ACCEL, FRICTION, MAX_VELOCITY, AUTO_SCROLL_VELOCITY, MIN_SCROLL_THRESHOLD } = animationConstants;

export default function ProjectsPage() {
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
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
  const autoScrollDirectionRef = useRef(1)
  const hoveredPlaneRef = useRef<THREE.Mesh | null>(null)
  const isPausedRef = useRef(false)

  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    if (!containerRef.current) return

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

    const getWidth = (gap: number) => sceneOptions.cardWidth + gap / 100

    const getPlaneWidth = (camera: THREE.PerspectiveCamera) => {
      const vFov = (camera.fov * Math.PI) / 180
      const height = 2 * Math.tan(vFov / 2) * camera.position.z
      const aspect = container.clientWidth / container.clientHeight
      const width = height * aspect
      return container.clientWidth / width
    }

    const planeSpace = getPlaneWidth(camera) * getWidth(sceneOptions.gap)
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
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 683
      const ctx = canvas.getContext('2d')!

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.fillRect(0, 0, 512, 683)
      ctx.strokeStyle = 'rgba(229, 231, 235, 0.5)'
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, 508, 679)

      ctx.fillStyle = 'rgba(31, 41, 55, 0.9)'
      ctx.font = 'bold 48px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(project.title, 256, 341)

      const texture = new THREE.CanvasTexture(canvas)
      const geometry = new THREE.PlaneGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight, 20, 20)

      const material = new THREE.ShaderMaterial({
        uniforms: {
          tex: { value: texture },
          curve: { value: sceneOptions.curve },
          isExpanded: { value: 0.0 }
        },
        transparent: true,
        vertexShader: `
          uniform float curve;
          uniform float isExpanded;
          varying vec2 vertexUV;
          void main(){
            vertexUV = uv;
            vec3 newPosition = position;
            float distanceFromCenter = abs(modelMatrix*vec4(position, 1.0)).x;
            newPosition.y *= 1.0 + (curve/100.0)*pow(distanceFromCenter,2.0)*(1.0-isExpanded);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tex;
          varying vec2 vertexUV;
          void main(){
            vec4 texColor = texture2D(tex, vertexUV);
            gl_FragColor = texColor;
          }
        `
      })

      const plane = new THREE.Mesh(geometry, material)
      plane.position.x = -(i - initialOffset) * getWidth(sceneOptions.gap)
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

        setIsPaused(true)

        const currentX = clickedPlane.position.x + scene.position.x
        targetTimeRef.current = timeRef.current - currentX / sceneOptions.speed

        setTimeout(() => {
          setExpandedProject(projectId)
        }, 800)
      }
    }

    renderer.domElement.addEventListener('click', onCanvasClick)

    const onMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(planes)

      if (intersects.length > 0) {
        const hoveredPlane = intersects[0].object as THREE.Mesh
        if (hoveredPlaneRef.current !== hoveredPlane) {
          hoveredPlaneRef.current = hoveredPlane
        }
      } else {
        hoveredPlaneRef.current = null
      }
    }

    renderer.domElement.addEventListener('mousemove', onMouseMove)

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      if (isPausedRef.current) {
        setIsPaused(false)
      }

      const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const absDelta = Math.abs(primaryDelta)

      if (absDelta < MIN_SCROLL_THRESHOLD) return

      const sensitivity = Math.pow(absDelta / 100, 0.85)
      const impulse = -Math.sign(primaryDelta) * sensitivity * WHEEL_ACCEL * 100

      velocityRef.current = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocityRef.current + impulse))

      isManualScrollingRef.current = true
    }

    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    let previousTime = 0

    const animate = (currentTime: number) => {
      const timePassed = currentTime - previousTime

      if (!isPausedRef.current) {
        const loopWidth = getWidth(sceneOptions.gap) * projects.length

        if (isManualScrollingRef.current) {
          if (Math.abs(velocityRef.current) > 0.01) {
            autoScrollDirectionRef.current = velocityRef.current > 0 ? 1 : -1
          }

          velocityRef.current *= FRICTION

          if (Math.abs(velocityRef.current) < AUTO_SCROLL_VELOCITY * 1.5) {
            velocityRef.current = AUTO_SCROLL_VELOCITY * autoScrollDirectionRef.current
            isManualScrollingRef.current = false
          }
        } else {
          velocityRef.current = AUTO_SCROLL_VELOCITY * autoScrollDirectionRef.current
        }

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
  }, [])

  const handleCloseExpanded = () => {
    setExpandedProject(null)
    velocityRef.current = 0
    isManualScrollingRef.current = false
    setIsPaused(false)
    hoveredPlaneRef.current = null
  }

  const expandedProjectData = projects.find(p => p.id === expandedProject)

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div className="absolute w-full h-full z-0">
        <Image src='/projects/images/starry.png' alt='starry background' className='object-cover' fill priority />
        <video
          src='/projects/videos/manga_bg_slowed.webm?v=4'
          className='absolute inset-0 w-full h-full object-cover'
          muted
          autoPlay
          loop
          playsInline
        />
      </div>

      <div ref={containerRef} className="absolute inset-x-0 top-32 bottom-0 curved-slider z-10" />

      <div className="absolute inset-0 w-full h-full z-20 pointer-events-none">
        <video src='/projects/videos/manga_man.webm?v=2' className='absolute inset-0 w-full h-full object-cover' muted autoPlay loop playsInline />
      </div>

      {expandedProjectData && (
        <ProjectModal project={expandedProjectData} onClose={handleCloseExpanded} />
      )}

      <style jsx>{`
        .curved-slider canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.3s ease-in-out;
        }

        .overflow-y-auto::-webkit-scrollbar {
          width: 8px;
        }

        .overflow-y-auto::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }

        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }

        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </div>
  )
}
