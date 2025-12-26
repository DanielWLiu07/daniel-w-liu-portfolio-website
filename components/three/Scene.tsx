'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import ButterflyModel from './ButterflyModel';

function ResponsiveButterflies() {
  const { viewport } = useThree();
  const widthFactor = Math.min(viewport.width / 10, 1);
  // Move butterflies further down on small screens
  const yOffset = viewport.width < 6.4 ? -0.08 : 0;
  
  return (
    <group>
      <ButterflyModel position={[0.2 * widthFactor, -0.1 + yOffset, 5]} rotation={[0, -Math.PI / 2, 0]} delay={0} />
      <ButterflyModel position={[1 * widthFactor, -0.3 + yOffset, 4]} rotation={[0, Math.PI / 3, -Math.PI/6]} delay={1.5} />
    </group>
  );
}

export default function Scene() {
  return (
      <Canvas
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 5], fov: 45 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      
      <Suspense fallback={null}>
        <ResponsiveButterflies />
      </Suspense>
      
      <OrbitControls
        target={[0, 0, 4.5]}
        enableZoom={false}
        enablePan={false}
        minDistance={1}
        maxDistance={20}
        enableRotate={false}
      />
    </Canvas>    
  );
}


