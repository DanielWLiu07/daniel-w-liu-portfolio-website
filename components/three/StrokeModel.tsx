'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

export function StrokeModel() {
  const gltf = useGLTF('/stroke.glb');
  
  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    
    clonedScene.position.set(0, 0, 0);
    clonedScene.rotation.set(0, 0, 0);
    clonedScene.scale.set(1, 1, 1);
    
    clonedScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const originalMat = mesh.material as THREE.MeshStandardMaterial;
        const internalTexture = originalMat.map || originalMat.emissiveMap;
        
        if (internalTexture) {
          internalTexture.colorSpace = THREE.SRGBColorSpace;
        }
        
        mesh.material = new THREE.MeshBasicMaterial({
          map: internalTexture,
          transparent: true,
          side: THREE.DoubleSide,
        });
      }
    });
    
    return clonedScene;
  }, [gltf]);
  
  return <primitive object={scene} />;
}

useGLTF.preload('/stroke.glb');

