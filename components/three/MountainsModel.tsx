'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

export function MountainsModel() {
  const gltf = useGLTF('/landing_models/mountains.glb');
  
  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = box.getCenter(new THREE.Vector3());
    
    clonedScene.position.set(-center.x, -center.y, -center.z);
    clonedScene.rotation.set(0, 0, 0);
    clonedScene.scale.set(1, 1, 1);
    
    return clonedScene;
  }, [gltf]);
  
  return <primitive object={scene} />;
}

useGLTF.preload('/landing_models/mountains.glb');
