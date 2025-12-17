'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

export function BaketeModel() {
  const gltf = useGLTF('/bakete11st.glb');
  
  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    
    clonedScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        
        const newMaterials = materials.map((mat: THREE.Material) => {
          if ((mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) && mat.emissiveMap) {
            mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
            return new THREE.MeshBasicMaterial({
              map: mat.emissiveMap,
            });
          }
          return mat;
        });
        
        mesh.material = Array.isArray(mesh.material) ? newMaterials : newMaterials[0];
      }
    });
    
    return clonedScene;
  }, [gltf]);
  
  return <primitive object={scene} />;
}

useGLTF.preload('/bakete11st.glb');
