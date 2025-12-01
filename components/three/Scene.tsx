'use client';

import {useFrame} from "@react-three/fiber";
import {OrbitControls} from '@react-three/drei';
import {useRef} from "react";
import * as THREE from "three";

export function Scene() {
    const cubeRef = useRef<THREE.Mesh>(null);
    useFrame((state, delta) => { if (!cubeRef.current) return; cubeRef.current.rotation.y += delta * 0.4; cubeRef.current.rotation.x += delta * 0.2; });

    return ( <> 
     <OrbitControls /> 

     <ambientLight intensity={0.5} /> 
     <directionalLight position={[3, 5, 2]} intensity={1.2} /> 
     
     <mesh ref={cubeRef}> 
        <boxGeometry args={[1, 1, 1]} /> 
        <meshStandardMaterial color={"white"} /> 
     </mesh> 
     </> 
     );
}
