'use client';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';

export default function ButterflyModel() {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF('/butterfly_compressed.glb');
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    if (actions) {
      Object.values(actions).forEach((action) => {
        action?.play();
      });
    }
  }, [actions]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={0.3} />
    </group>
  );
}

useGLTF.preload('/butterfly_compressed.glb');
