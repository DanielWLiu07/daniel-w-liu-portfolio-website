'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import ButterflyModel from './ButterflyModel';

export default function Scene() {
  return (
      <Canvas
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 5], fov: 45 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      
      <Suspense fallback={null}>
        <group>
          <ButterflyModel />
        </group>
      </Suspense>
      
      <OrbitControls
        enableZoom={true}
        zoomSpeed={1}
        minDistance={1}
        maxDistance={20}
      />
    </Canvas>    
  );
}

