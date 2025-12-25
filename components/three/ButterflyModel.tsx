'use client';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

interface ButterflyModelProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  delay?: number;
}

export default function ButterflyModel({ position = [0.2, -0.075, 5], rotation = [0, -Math.PI / 2, 0], delay = 0 }: ButterflyModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF('/butterfly_compressed.glb');
  
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  
  const mergedAnimation = useMemo(() => {
    if (animations.length === 0) return null;
    
    const allTracks: THREE.KeyframeTrack[] = [];
    let maxDuration = 0;
    
    animations.forEach((clip) => {
      allTracks.push(...clip.tracks);
      maxDuration = Math.max(maxDuration, clip.duration);
    });
    
    return new THREE.AnimationClip('merged', maxDuration, allTracks);
  }, [animations]);

  const { actions } = useAnimations(mergedAnimation ? [mergedAnimation] : [], groupRef);

  useEffect(() => {
    if (actions && mergedAnimation) {
      const action = actions[mergedAnimation.name];
      if (action) {
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.time = delay;
        action.play();
      }
    }
  }, [actions, mergedAnimation, delay]);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.y = -0.025;
      const tl = gsap.timeline({ repeat: -1, delay });
      tl.to(groupRef.current.position, {
        y: 0.025,
        duration: 3,
        ease: "sine.inOut",
      })
      .to(groupRef.current.position, {
        y: 0,
        duration: 3,
        ease: "sine.inOut",
      })
      .to(groupRef.current.position, {
        y: 0.03,
        duration: 3,
        ease: "sine.inOut",
      })
      .to(groupRef.current.position, {
        y: -0.025,
        duration: 3,
        ease: "sine.inOut",
      })
      .to(groupRef.current.position, {
        y: 0.0375,
        duration: 3,
        ease: "sine.inOut",
      })
      .to(groupRef.current.position, {
        y: -0.025,
        duration: 3,
        ease: "sine.inOut",
      });
    }
  }, [delay]);

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} scale={0.3} position={position} rotation={rotation} />
    </group>
  );
}

useGLTF.preload('/butterfly_compressed.glb');
