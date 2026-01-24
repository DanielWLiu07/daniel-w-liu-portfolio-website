import * as THREE from 'three'

export type ExpansionStage = 'none' | 'expanding' | 'expanded'

export interface SliderRefs {
  container: HTMLDivElement
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  dotGroup: THREE.Group | null
  dotMeshes: THREE.Mesh[]
  arrowMeshes: { left: THREE.Mesh | null; right: THREE.Mesh | null }
  imagePlanesGroup: THREE.Group | null
  imagePlanes: THREE.Mesh[]
}

export interface DotConfig {
  dotRadius: number
  glowRadius: number
  dotSpacing: number
  arrowSize: number
  arrowOffset: number
  isVertical: boolean
}

export interface ImagePlaneConfig {
  spacing: number
  isVerticalOnScreen: boolean
  leftShiftAmount: number
}
