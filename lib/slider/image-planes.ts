import * as THREE from 'three'
import { MD_BREAKPOINT } from '@/lib/layout-config'
import { sceneOptions } from '@/data/projects'
import { createCardGeometry, createCardMaterial } from '@/lib/carousel-helpers'
import type { ImagePlaneConfig } from './types'

export function getImagePlaneConfig(containerWidth: number): ImagePlaneConfig {
  const isMobile = containerWidth < MD_BREAKPOINT
  return {
    spacing: isMobile
      ? sceneOptions.cardWidth + 0.55
      : sceneOptions.cardWidth + 0.12,
    isVerticalOnScreen: !isMobile,
    leftShiftAmount: 0,
  }
}

export function calculateImageOffsets(
  totalImages: number,
  spacing: number
): { finalOffset: number; startingOffset: number }[] {
  const halfCount = Math.floor(totalImages / 2)
  const entryDistance = 2.0

  return Array.from({ length: totalImages }, (_, i) => {
    let finalOffset: number
    if (i === 0) {
      finalOffset = 0
    } else if (i <= halfCount) {
      finalOffset = -spacing * i
    } else {
      finalOffset = spacing * (totalImages - i)
    }

    const startingOffset = finalOffset >= 0
      ? finalOffset + entryDistance
      : finalOffset - entryDistance

    return { finalOffset, startingOffset }
  })
}

export function createImagePlane(
  texture: THREE.Texture,
  frameTexture: THREE.Texture,
  config: {
    index: number
    finalOffset: number
    startingOffset: number
    isFirstFrame: boolean
    isVerticalOnScreen: boolean
    leftShiftAmount: number
  }
): THREE.Group {
  const imageGroup = new THREE.Group()

  const cardGeometry = createCardGeometry(sceneOptions.cardWidth, sceneOptions.cardHeight)
  const cardMaterial = createCardMaterial(frameTexture, texture, sceneOptions.curve)
  cardMaterial.uniforms.isExpanded.value = 1.0
  cardMaterial.uniforms.opacity.value = 0
  cardMaterial.depthWrite = false

  const cardPlane = new THREE.Mesh(cardGeometry, cardMaterial)
  cardPlane.position.z = 0
  imageGroup.add(cardPlane)

  const startOffset = config.isFirstFrame ? config.finalOffset : config.startingOffset
  if (config.isVerticalOnScreen) {
    imageGroup.position.set(startOffset, config.leftShiftAmount, 0)
  } else {
    imageGroup.position.set(0, startOffset, 0)
  }

  imageGroup.userData = {
    imageIndex: config.index,
    baseOffset: config.finalOffset,
    startingOffset: config.startingOffset,
    currentAnimOffset: startOffset,
    targetAnimOffset: config.finalOffset,
    isVerticalOnScreen: config.isVerticalOnScreen,
    isFirstFrame: config.isFirstFrame,
    leftShift: config.leftShiftAmount,
    currentRotY: 0,
    floatPhaseOffset: config.index * 0.7,
    cardPlane,
    cardMaterial,
  }

  return imageGroup
}

export function cleanupImagePlanesGroup(
  group: THREE.Group | null,
  parent: THREE.Object3D
): void {
  if (!group) return

  parent.remove(group)
  group.children.forEach(child => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) {
        child.material.dispose()
      }
    }
  })
}
