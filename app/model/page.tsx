'use client';

/**
 * Quick look at any .glb in public/models.
 *
 *   /model?src=/models/goose-preview.glb
 *
 * Auto-frames whatever it loads, so a model exported at an arbitrary scale
 * still fills the view instead of being an invisible speck or a wall.
 */

import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

const DEFAULT_SRC = '/models/goose-preview.glb';

function Model({ src }: { src: string }) {
  const { scene } = useGLTF(src);

  const { object, info } = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    // Normalise to ~2 units tall and sit it on the origin, so framing does not
    // depend on whatever scale the exporter happened to use.
    const s = 2 / Math.max(size.x, size.y, size.z || 1);
    root.position.set(-centre.x * s, -box.min.y * s - 1, -centre.z * s);
    root.scale.setScalar(s);

    // Preview meshes arrive with no material at all. Give them something matte
    // so the silhouette is readable rather than flat black.
    const mat = new THREE.MeshStandardMaterial({ color: 0xdedad0, roughness: 0.85, metalness: 0 });
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && !(m.material as THREE.Material)?.name) {
        m.material = mat;
      }
      if (m.isMesh) m.frustumCulled = false;
    });

    return {
      object: root,
      info: `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} units`,
    };
  }, [scene]);

  return (
    <>
      <primitive object={object} />
      <mesh position={[0, -1.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 48]} />
        <meshStandardMaterial color={0xe8e4d8} roughness={1} />
      </mesh>
      <group name={info} />
    </>
  );
}

/**
 * Split out because useSearchParams opts a route into client-side rendering and
 * Next refuses to prerender it without a Suspense boundary above. Keeping the
 * hook in a child lets the page itself stay statically prerenderable.
 */
function Viewer() {
  const params = useSearchParams();
  const src = params.get('src') ?? DEFAULT_SRC;

  return (
    <div className="w-full h-screen bg-[#e8e4d8] relative">
      <Canvas
        shadows
        camera={{ position: [2.4, 1.6, 3.0], fov: 40 }}
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            canvas: props.canvas as HTMLCanvasElement,
            antialias: true,
          });
          await renderer.init();
          return renderer as unknown as never;
        }}
      >
        <hemisphereLight args={[0xffffff, 0x9a9484, 1.1]} />
        <directionalLight position={[3, 5, 2]} intensity={2.2} castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} />
        <Suspense fallback={null}>
          <Model src={src} />
        </Suspense>
        <OrbitControls makeDefault target={new THREE.Vector3(0, 0, 0)} />
      </Canvas>

      <div className="absolute bottom-5 left-6 font-mono text-[11px] text-neutral-600">
        {src} · drag to orbit · scroll to zoom
      </div>
    </div>
  );
}

export default function ModelViewerPage() {
  return (
    <Suspense fallback={<div className="w-full h-screen bg-[#e8e4d8]" />}>
      <Viewer />
    </Suspense>
  );
}
