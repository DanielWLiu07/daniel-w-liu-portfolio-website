import * as THREE from 'three'
import { MD_BREAKPOINT } from '@/lib/layout-config'
import type { DotConfig } from './types'

export function getDotConfig(containerWidth: number): DotConfig {
  const isMobile = containerWidth < MD_BREAKPOINT
  return {
    dotRadius: isMobile ? 0.055 : 0.03,
    glowRadius: isMobile ? 0.085 : 0.05,
    dotSpacing: isMobile ? 0.16 : 0.10,
    arrowSize: isMobile ? 0.28 : 0.18,
    arrowOffset: isMobile ? 0.22 : 0.14,
    isVertical: !isMobile,
  }
}

export async function createArrowTexture(
  direction: 'left' | 'right' | 'up' | 'down'
): Promise<THREE.CanvasTexture> {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  try {
    const font = new FontFace('MochiBold', 'url(/fonts/MochibopBold-Demo.ttf)')
    await font.load()
    document.fonts.add(font)
  } catch {
    // Font load failed, use fallback
  }

  ctx.clearRect(0, 0, 128, 128)
  ctx.fillStyle = 'white'
  ctx.font = '80px MochiBold, Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let symbol: string
  if (direction === 'left') symbol = '<'
  else if (direction === 'right') symbol = '>'
  else symbol = '<' // up/down use rotation

  ctx.fillText(symbol, 64, 64)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export function createArrowMesh(
  size: number,
  position: THREE.Vector3,
  rotationZ: number,
  direction: 'left' | 'right'
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(size, size)
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    alphaTest: 0.1,
  })

  const arrow = new THREE.Mesh(geometry, material)
  arrow.position.copy(position)
  arrow.position.z = 0.01
  arrow.rotation.z = rotationZ
  arrow.userData.isArrow = true
  arrow.userData.direction = direction
  arrow.userData.targetOpacity = 0.5
  arrow.userData.targetScale = 1

  return arrow
}

export function createDotMesh(
  radius: number,
  position: THREE.Vector3,
  index: number
): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 24)
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  })

  const dot = new THREE.Mesh(geometry, material)
  dot.position.copy(position)
  dot.userData.isDot = true
  dot.userData.dotIndex = index
  dot.userData.targetOpacity = 0.6

  return dot
}

export function createGlowMesh(
  radius: number,
  position: THREE.Vector3
): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 24)
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  })

  const glow = new THREE.Mesh(geometry, material)
  glow.position.copy(position)
  glow.position.z = -0.001

  return glow
}
