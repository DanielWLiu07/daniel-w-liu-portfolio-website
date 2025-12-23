'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

const TRANSPARENCY_THRESHOLD = 0.3;

export function StrokeModel() {
  const gltf = useGLTF('/stroke.glb');
  
  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    
    clonedScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        
        const newMaterials = materials.map((mat: THREE.Material) => {
          const originalMat = mat as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
          const textureToUse = originalMat.emissiveMap || originalMat.map;
          
          if (textureToUse) {
            textureToUse.colorSpace = THREE.SRGBColorSpace;
          }
          
          return new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            uniforms: {
              mainTexture: { value: textureToUse },
            },
            vertexShader: `
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: `
              uniform sampler2D mainTexture;
              varying vec2 vUv;
              
              void main() {
                vec4 color = texture2D(mainTexture, vUv);
                float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                float alpha = smoothstep(0.0, ${TRANSPARENCY_THRESHOLD.toFixed(1)}, brightness);
                gl_FragColor = vec4(color.rgb, alpha);
              }
            `,
          });
        });
        
        mesh.material = Array.isArray(mesh.material) ? newMaterials : newMaterials[0];
      }
    });
    
    return clonedScene;
  }, [gltf]);
  
  return <primitive object={scene} />;
}

useGLTF.preload('/stroke.glb');
