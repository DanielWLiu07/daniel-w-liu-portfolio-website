"use client";

/**
 * Any rigged bird from a .glb, wired into the same behaviour as the procedural
 * one.
 */
import { useAnimations, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  compileMaterial,
  graph,
  type Graph,
  type GraphNode,
} from "blender-to-threejs";

import { useNeckTracking } from "./use-neck-tracking";

export interface GooseGlbProps {
  src: string;
  /**
   * Neck chain by bone name, BASE FIRST and head last. Order is what makes the
   * curve distribute correctly; a reversed list bends the neck backwards.
   */
  neckBones?: string[];
  /** Clip to play. Defaults to the first one in the file. */
  clip?: string;
  trackPointer?: boolean;
  /** Replace every material outright. Prefer `shade` — this discards colour. */
  material?: THREE.Material;
  /**
   * Shade the model with the node system WITHOUT losing its colour.
   */
  shade?: (g: Graph, baseColor: GraphNode) => GraphNode;
  /**
   * Normalise the model to this height in units and stand it on y=0.
   */
  fitHeight?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

const DEFAULT_NECK = ["neck1", "neck2", "neck3", "neck4", "head"];

export default function GooseGlb({
  src,
  neckBones = DEFAULT_NECK,
  clip,
  trackPointer = true,
  material,
  shade,
  fitHeight,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: GooseGlbProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(src);

  // Clone so the same file can appear twice without the two sharing a skeleton.
  // SkeletonUtils would be needed for a deep skinned clone; for a single
  // instance the raw scene is correct and avoids that dependency.
  const root = useMemo(() => scene, [scene]);

  const { actions, names } = useAnimations(animations, groupRef);

  useEffect(() => {
    const name = clip ?? names[0];
    const action = name ? actions[name] : undefined;
    if (!action) return;
    action.reset().fadeIn(0.25).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, names, clip]);

  // Stash each mesh's ORIGINAL material before anything replaces it.
  //
  // useGLTF caches the parsed scene, so this component mutates an object other
  // mounts share. Without a stash, assigning a material destroys the only
  // reference to the model's texture — and the next read finds the replacement,
  // sees no map, and silently falls back to white. The model still renders, so
  // it reads as "the shader washed out my colours" rather than as data loss.
  const originals = useMemo(() => {
    const map = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.userData.__originalMaterial)
        m.userData.__originalMaterial = m.material;
      map.set(m, m.userData.__originalMaterial);
    });
    return map;
  }, [root]);

  /** The model's own base colour, read from the ORIGINAL material. */
  const baseColorMap = useMemo(() => {
    for (const mat of originals.values()) {
      const m = (Array.isArray(mat) ? mat[0] : mat) as
        THREE.MeshStandardMaterial | undefined;
      if (m?.map) return m.map;
    }
    return null;
  }, [originals]);

  const hasVertexColor = useMemo(() => {
    let found = false;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry?.getAttribute("color")) found = true;
    });
    return found;
  }, [root]);

  const shaded = useMemo(() => {
    if (!shade) return null;
    const g = graph();
    const base = baseColorMap
      ? g.texture(baseColorMap)
      : hasVertexColor
        ? g.vertexColor()
        : g.rgb(1, 1, 1);
    return compileMaterial(shade(g, base));
  }, [shade, baseColorMap, hasVertexColor]);

  useEffect(() => {
    const next = material ?? shaded;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // Falling back to the stashed original is what makes "no shading" a real
      // mode rather than a one-way door.
      m.material = next ?? (m.userData.__originalMaterial as THREE.Material);
    });
  }, [root, material, shaded, originals]);

  useEffect(() => {
    if (!fitHeight) return;
    // Measure at identity, or a second run compounds the previous scaling.
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (size.y <= 0) return;
    const k = fitHeight / size.y;
    root.scale.setScalar(k);
    const centre = box.getCenter(new THREE.Vector3());
    root.position.set(-centre.x * k, -box.min.y * k, -centre.z * k);
  }, [root, fitHeight]);

  // A skinned mesh deforms outside the bounds computed from its rest pose, and
  // three culls against those bounds — a craned neck can pop the whole model
  // out of view. Cheaper to skip culling than to rebuild bounds every frame.
  useEffect(() => {
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
    });
  }, [root]);

  const chain = useMemo(() => {
    const found = neckBones
      .map((n) => root.getObjectByName(n))
      .filter((o): o is THREE.Object3D => Boolean(o));
    if (found.length !== neckBones.length) {
      // Loud, because the failure is otherwise silent: the model renders fine
      // and simply never looks at you, which reads as "tracking is broken"
      // rather than "these bone names do not exist".
      const missing = neckBones.filter((n) => !root.getObjectByName(n));
      console.warn(
        `[goose-glb] neck bones not found in ${src}: ${missing.join(", ")}. ` +
          "Pointer tracking is disabled for those. Check the names against RIG-CONTRACT.md.",
      );
    }
    return found;
  }, [root, neckBones, src]);

  useNeckTracking({ bones: chain, root: groupRef, enabled: trackPointer });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={root} />
    </group>
  );
}
