'use client'

import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import ProjectModal from '@/components/projects/ProjectModal'

interface Project {
  id: number
  title: string
  description: string
  detailedDescription: string
  image: string
  technologies: string[]
  link?: string
  github?: string
}

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

  const projects: Project[] = [
    {
      id: 1,
      title: "Project One",
      description: "A brief description of your first project",
      detailedDescription: "A detailed description of your first project. Add details about what you built, the impact it had, the challenges you faced, and what you learned. You can add multiple paragraphs here to provide comprehensive information about your project.",
      image: "/watercolour/waterloo.png",
      technologies: ["React", "Next.js", "TypeScript"],
      link: "https://example.com",
      github: "https://github.com/yourusername/project1"
    },
    {
      id: 2,
      title: "Project Two",
      description: "A brief description of your second project",
      detailedDescription: "A detailed description of your second project. Highlight key features and technologies used. Explain the problem it solves and the value it provides to users. Include metrics or results if available.",
      image: "/watercolour/waterloo.png",
      technologies: ["Node.js", "Express", "MongoDB"],
      link: "https://example.com",
      github: "https://github.com/yourusername/project2"
    },
    {
      id: 3,
      title: "Project Three",
      description: "A brief description of your third project",
      detailedDescription: "A detailed description of your third project. Explain the problem it solves, your approach to solving it, and the technologies you chose. Discuss any interesting technical challenges you overcame.",
      image: "/watercolour/waterloo.png",
      technologies: ["Python", "Django", "PostgreSQL"],
      link: "https://example.com",
      github: "https://github.com/yourusername/project3"
    },
    {
      id: 4,
      title: "Project Four",
      description: "A brief description of your fourth project",
      detailedDescription: "A detailed description of your fourth project. Share what you learned while building it, the design decisions you made, and how you iterated on the solution. Include any feedback or results you received.",
      image: "/watercolour/waterloo.png",
      technologies: ["Vue.js", "Firebase", "TailwindCSS"],
      link: "https://example.com",
      github: "https://github.com/yourusername/project4"
    },
    {
      id: 5,
      title: "Project Five",
      description: "A brief description of your fifth project",
      detailedDescription: "A detailed description of your fifth project. Mention any awards or recognition, the team size if collaborative, your specific contributions, and the overall impact of the project.",
      image: "/watercolour/waterloo.png",
      technologies: ["React Native", "AWS", "GraphQL"],
      link: "https://example.com",
      github: "https://github.com/yourusername/project5"
    }
  ]

  const options = {
    speed: 35,
    gap: 15,
    curve: 8,
    cardWidth: 1.2,
    cardHeight: 1.6
  }

  const WHEEL_ACCEL = 0.003
  const FRICTION = 0.92
  const MAX_VELOCITY = 3.0
  const AUTO_SCROLL_VELOCITY = 0.02

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      20
    )
    camera.position.z = 2
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    rendererRef.current = renderer

    container.appendChild(renderer.domElement)

    const getWidth = (gap: number) => options.cardWidth + gap / 100

    const getPlaneWidth = (camera: THREE.PerspectiveCamera) => {
      const vFov = (camera.fov * Math.PI) / 180
      const height = 2 * Math.tan(vFov / 2) * camera.position.z
      const aspect = container.clientWidth / container.clientHeight
      const width = height * aspect
      return container.clientWidth / width
    }

    const planeSpace = getPlaneWidth(camera) * getWidth(options.gap)
    const visibleCards = Math.ceil(container.clientWidth / planeSpace)
    const totalCards = visibleCards + projects.length * 4 // Generate enough for scrolling both ways
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

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 512, 683)
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, 508, 679)

      ctx.fillStyle = '#1f2937'
      ctx.font = 'bold 48px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(project.title, 256, 341)

      const texture = new THREE.CanvasTexture(canvas)

      const geometry = new THREE.PlaneGeometry(options.cardWidth, options.cardHeight, 20, 20)

      const material = new THREE.ShaderMaterial({
        uniforms: {
          tex: { value: texture },
          curve: { value: options.curve },
          isExpanded: { value: 0.0 }
        },
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
            gl_FragColor = texture2D(tex, vertexUV);
          }
        `
      })

      const plane = new THREE.Mesh(geometry, material)
      plane.position.x = -(i - initialOffset) * getWidth(options.gap)
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
        targetTimeRef.current = timeRef.current - currentX / options.speed

        setTimeout(() => {
          setExpandedProject(projectId)
        }, 800)
      }
    }

    renderer.domElement.addEventListener('click', onCanvasClick)

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      const primaryDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY

      const impulse = -primaryDelta * WHEEL_ACCEL

      velocityRef.current = Math.max(
        -MAX_VELOCITY,
        Math.min(MAX_VELOCITY, velocityRef.current + impulse)
      )

      isManualScrollingRef.current = true
    }

    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    let previousTime = 0

    const animate = (currentTime: number) => {
      const timePassed = currentTime - previousTime

      if (!isPaused) {
        const loopWidth = getWidth(options.gap) * projects.length

        if (isManualScrollingRef.current) {
          if (Math.abs(velocityRef.current) > 0.01) {
            autoScrollDirectionRef.current = velocityRef.current > 0 ? 1 : -1
          }

          velocityRef.current *= FRICTION

          if (Math.abs(velocityRef.current) < AUTO_SCROLL_VELOCITY * 1.5) {
            velocityRef.current = AUTO_SCROLL_VELOCITY * autoScrollDirectionRef.current
            isManualScrollingRef.current = false
          }
        }
        else {
          velocityRef.current = AUTO_SCROLL_VELOCITY * autoScrollDirectionRef.current
        }

        timeRef.current += velocityRef.current * timePassed * 0.001

        if (timeRef.current * options.speed > loopWidth) {
          timeRef.current -= loopWidth / options.speed
        } else if (timeRef.current * options.speed < -loopWidth) {
          timeRef.current += loopWidth / options.speed
        }
      } else {
        const diff = targetTimeRef.current - timeRef.current
        timeRef.current += diff * 0.1
      }

      scene.position.x = timeRef.current * options.speed

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
  }, [isPaused])

  const handleCloseExpanded = () => {
    setExpandedProject(null)
    setIsPaused(false)
  }

  const expandedProjectData = projects.find(p => p.id === expandedProject)

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-x-0 top-32 bottom-0 curved-slider"
      />

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
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
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
