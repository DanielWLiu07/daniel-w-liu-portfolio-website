'use client'

import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'

/** Move along the camera rays: projected letter size, position and motion stay the same. */
export function titleDepthTransform(camera:Vector3, scale=1.8) {
  return {scale,position:camera.clone().multiplyScalar(1-scale)}
}

export default function TitleDepth({children, depthScale=1.8}:{children:ReactNode; depthScale?:number}) {
  const group=useRef<Group>(null)
  useFrame(({camera})=>{
    const root=group.current
    if(!root)return
    const eye=camera.getWorldPosition(new Vector3())
    root.parent?.worldToLocal(eye)
    const transform=titleDepthTransform(eye,depthScale)
    root.position.copy(transform.position);root.scale.setScalar(transform.scale)
    root.updateWorldMatrix(true,true)
  },.25) // Camera and letter motion have run; compositor renders at priority 1.
  return <group ref={group} name="TitleDepth">{children}</group>
}
