'use client'

/**
 * ?edit: the library's SetEditor over the named set pieces (transform gizmo, keys
 * 1..9 / Tab select, w e r modes, c copies the layout JSON). Paste that JSON into
 * SET_LAYOUT in casino-scene.tsx to bake it; applyLayout puts it back at load.
 */
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SetEditor as Editor } from 'blender-to-threejs'

export interface SetPiece {
  name: string
  object: THREE.Object3D | null
  modes?: ('translate' | 'rotate' | 'scale')[]
  lockTranslate?: ('x' | 'y' | 'z')[]
}

export default function SetEditor({ pieces }: { pieces: SetPiece[] }) {
  const { camera, gl, scene } = useThree()
  useEffect(() => {
    const ed = new Editor(camera, gl.domElement, scene)
    for (const p of pieces) if (p.object) ed.add(p.name, p.object, { modes: p.modes, lockTranslate: p.lockTranslate })
    const first = pieces.find((p) => p.object)
    if (first) ed.select(first.name)
    console.log('[set-editor] pieces:', ed.names().join(', '), '| keys: 1..9/Tab select, w/e/r mode, x/y/z axes, Shift snap, c copy JSON, Esc')
    return () => ed.dispose()
  }, [camera, gl, scene, pieces])
  return null
}
