"use client";

/**
 * Draggable bone handles — grab a joint and the limb follows.
 */
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { Rig } from "./auto-rig";

export interface BoneHandlesProps {
  rig: Rig;
  /** Bones the user may pose. Others are drawn dimmed and are not grabbable. */
  posable?: string[];
  /** Radius of a handle, in world units. */
  size?: number;
  onDragChange?: (dragging: boolean) => void;
}

const DEFAULT_POSABLE = [
  "hips",
  "spine",
  "chest",
  "neck1",
  "neck2",
  "neck3",
  "neck4",
  "head",
  "beak",
  "tail",
  "wing.L",
  "wing2.L",
  "wing3.L",
  "wing.R",
  "wing2.R",
  "wing3.R",
  "thigh.L",
  "shin.L",
  "foot.L",
  "thigh.R",
  "shin.R",
  "foot.R",
];

export default function BoneHandles({
  rig,
  posable = DEFAULT_POSABLE,
  size = 0.03,
  onDragChange,
}: BoneHandlesProps) {
  const { camera } = useThree();
  const [active, setActive] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const groupRef = useRef<THREE.Group>(null);
  const handleRefs = useRef<Record<string, THREE.Mesh | null>>({});
  const boneRefs = useRef<Record<string, THREE.Mesh | null>>({});

  const scratch = useMemo(
    () => ({
      plane: new THREE.Plane(),
      normal: new THREE.Vector3(),
      hit: new THREE.Vector3(),
      pivot: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      inv: new THREE.Quaternion(),
      parentQ: new THREE.Quaternion(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      mid: new THREE.Vector3(),
      dir: new THREE.Vector3(),
    }),
    [],
  );

  const beginDrag = useCallback(
    (name: string) => (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      (e.target as Element)?.setPointerCapture?.(e.pointerId);
      setActive(name);
      onDragChange?.(true);
    },
    [onDragChange],
  );

  const endDrag = useCallback(() => {
    setActive(null);
    onDragChange?.(false);
  }, [onDragChange]);

  const onMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!active) return;
      const bone = rig.byName[active];
      const parent = bone?.parent as THREE.Bone | undefined;
      if (!bone || !parent || !(parent as THREE.Bone).isBone) return;
      e.stopPropagation();

      const { plane, normal, hit, pivot, from, to, q, inv, parentQ } = scratch;

      // Plane through the JOINT BEING ROTATED (the parent), facing the camera.
      parent.getWorldPosition(pivot);
      camera.getWorldDirection(normal);
      plane.setFromNormalAndCoplanarPoint(normal, pivot);
      if (!e.ray.intersectPlane(plane, hit)) return;

      bone.getWorldPosition(from);
      from.sub(pivot);
      to.copy(hit).sub(pivot);
      if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
      from.normalize();
      to.normalize();

      // World-space rotation that carries the bone onto the pointer, then
      // expressed in the parent's frame — a bone's quaternion is local, so
      // applying a world rotation directly makes it drift as the rig turns.
      q.setFromUnitVectors(from, to);
      parent.getWorldQuaternion(parentQ);
      inv.copy(parentQ).invert();
      parent.quaternion.premultiply(inv.multiply(q).multiply(parentQ));
    },
    [active, camera, rig, scratch],
  );

  // Handles and bone shafts follow the skeleton every frame. Cheap, and it
  // means the widget is correct while an animation is also driving the rig.
  useFrame(() => {
    const { a, b, mid, dir } = scratch;
    for (const bone of rig.bones) {
      const handle = handleRefs.current[bone.name];
      if (handle) {
        bone.getWorldPosition(a);
        handle.position.copy(a);
      }
      const shaft = boneRefs.current[bone.name];
      const parent = bone.parent as THREE.Bone | undefined;
      if (shaft && parent && (parent as THREE.Bone).isBone) {
        bone.getWorldPosition(a);
        parent.getWorldPosition(b);
        mid.copy(a).add(b).multiplyScalar(0.5);
        shaft.position.copy(mid);
        dir.copy(a).sub(b);
        const len = dir.length();
        shaft.scale.set(1, Math.max(len, 1e-4), 1);
        if (len > 1e-6)
          shaft.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir.normalize(),
          );
      }
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {/* Shafts, drawn first so handles sit on top of them. */}
      {rig.bones.map((bone) => {
        const parent = bone.parent as THREE.Bone | undefined;
        if (!parent || !(parent as THREE.Bone).isBone) return null;
        return (
          <mesh
            key={`shaft-${bone.name}`}
            ref={(m) => {
              boneRefs.current[bone.name] = m;
            }}
            raycast={() => null}
            renderOrder={998}
          >
            <cylinderGeometry args={[size * 0.22, size * 0.22, 1, 6]} />
            <meshBasicMaterial
              color="#6d6a63"
              depthTest={false}
              transparent
              opacity={0.55}
            />
          </mesh>
        );
      })}

      {rig.bones.map((bone) => {
        const canPose =
          posable.includes(bone.name) &&
          Boolean(bone.parent as THREE.Bone)?.valueOf();
        const isActive = active === bone.name;
        const isHover = hover === bone.name;
        return (
          <mesh
            key={`handle-${bone.name}`}
            ref={(m) => {
              handleRefs.current[bone.name] = m;
            }}
            renderOrder={999}
            onPointerDown={canPose ? beginDrag(bone.name) : undefined}
            onPointerOver={(e) => {
              if (!canPose) return;
              e.stopPropagation();
              setHover(bone.name);
            }}
            onPointerOut={() => setHover(null)}
          >
            <sphereGeometry
              args={[isActive || isHover ? size * 1.35 : size, 16, 12]}
            />
            <meshBasicMaterial
              color={
                isActive
                  ? "#e8603c"
                  : isHover
                    ? "#f0a24a"
                    : canPose
                      ? "#2f2c28"
                      : "#a8a49c"
              }
              // Drawn through the mesh so a handle inside the body is still
              // grabbable — otherwise every joint that matters is unreachable.
              depthTest={false}
              transparent
              opacity={canPose ? 0.95 : 0.5}
            />
          </mesh>
        );
      })}
    </group>
  );
}
