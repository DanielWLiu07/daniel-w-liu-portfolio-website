'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BaketeModel } from './BaketeModel';
import { StrokeModel } from './StrokeModel';

export default function Scene() {
  return (
    <div className="relative w-full h-full">
      <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ 
        background: "url('/paper_bg.png')", 
        backgroundSize: 'cover', 
        backgroundPosition: 'center' 
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="red" />
      </mesh>
      
      <group>
        <BaketeModel />
        <StrokeModel />
      </group>
      
      <OrbitControls
        enableZoom={true}
        zoomSpeed={1}
        minDistance={1}
        maxDistance={20}
      />
    </Canvas>
      <div className="absolute top-[50%] left-[50%]" >
        <div className="flex">

        </div>

      </div>
    </div>
    
  );
}

