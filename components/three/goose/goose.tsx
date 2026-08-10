"use client";

/**
 * The goose, wired up: generated mesh + rig, two clips, and a neck that follows
 * the pointer.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { compileMaterial, graph } from "blender-to-threejs";

import { idleClip, waddleClip } from "./goose-animations";
import { createGoose } from "./goose-model";

/** How much of the total look angle each bone takes, base of neck to head. */
const NECK_SHARE = [0.12, 0.16, 0.2, 0.24, 0.28];

const MAX_YAW = 1.15;
const MAX_PITCH = 0.6;
/** Seconds-ish for the head to close most of the gap to a new target. */
const TRACK_RESPONSE = 6;

/**
 * Vertex colour modulated by a normal-derived shade.
 */
function gooseMaterial() {
  const g = graph();
  // A shallow range. The wide one looked like a studio product shot; this reads
  // as soft outdoor light, which is what a white bird actually looks like — most
  // of its shading is bounce, not a hard key.
  const shade = g.mapRange(g.separate(g.normal(), "y"), {
    from: [-1, 1],
    to: [0.74, 1.02],
    clamp: true,
  });
  return compileMaterial(g.multiplyColor(1, g.vertexColor(), shade));
}

export interface GooseProps {
  /** Swap the idle for the waddle. */
  walking?: boolean;
  /** Let the neck follow the pointer. */
  trackPointer?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

export default function Goose({
  walking = false,
  trackPointer = true,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: GooseProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const goose = useMemo(() => {
    const g = createGoose(gooseMaterial());
    // A skinned mesh can deform well outside the bounds computed from its rest
    // pose, and three culls against those bounds — so a craned neck can pop the
    // whole goose out of view. Cheaper to skip culling than to rebuild bounds.
    //
    // Set here rather than in an effect: doing it afterwards means mutating a
    // value that has already been handed to other hooks, and there is a window
    // where the mesh exists with culling still on.
    g.mesh.frustumCulled = false;
    return g;
  }, []);

  const { mixer, actions } = useMemo(() => {
    const m = new THREE.AnimationMixer(goose.mesh);
    return {
      mixer: m,
      actions: {
        idle: m.clipAction(idleClip()),
        waddle: m.clipAction(waddleClip()),
      },
    };
  }, [goose]);

  useEffect(() => {
    const next = walking ? actions.waddle : actions.idle;
    const prev = walking ? actions.idle : actions.waddle;
    next.reset().play();
    if (prev.isRunning()) prev.crossFadeTo(next, 0.35, false);
    return () => {
      next.fadeOut(0.2);
    };
  }, [walking, actions]);

  useEffect(
    () => () => {
      mixer.stopAllAction();
    },
    [mixer],
  );

  const look = useRef({ yaw: 0, pitch: 0 });
  const target = useMemo(() => new THREE.Vector3(), []);
  const local = useMemo(() => new THREE.Vector3(), []);
  const headWorld = useMemo(() => new THREE.Vector3(), []);
  const extra = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useFrame((state, delta) => {
    // Clamp delta so a backgrounded tab doesn't resume with one enormous step.
    mixer.update(Math.min(delta, 0.05));

    if (!groupRef.current) return;

    let wantYaw = 0;
    let wantPitch = 0;

    if (trackPointer) {
      // Unproject the pointer to a world point, then express the direction from
      // the head to it in the goose's own space, so the tracking stays correct
      // if the goose or the camera is moved.
      target.set(state.pointer.x, state.pointer.y, 0.5).unproject(camera);
      goose.neckChain[goose.neckChain.length - 1].getWorldPosition(headWorld);
      // Convert both POINTS into the goose's frame and subtract there.
      // Running worldToLocal on the difference instead treats a direction as a
      // point and folds the group's translation into it, which craned the neck
      // toward the origin rather than toward the pointer.
      groupRef.current.worldToLocal(target);
      groupRef.current.worldToLocal(headWorld);
      local.copy(target).sub(headWorld).normalize();

      wantYaw = THREE.MathUtils.clamp(
        Math.atan2(local.x, local.z),
        -MAX_YAW,
        MAX_YAW,
      );
      wantPitch = THREE.MathUtils.clamp(
        Math.asin(local.y),
        -MAX_PITCH,
        MAX_PITCH,
      );
    }

    // Exponential smoothing, framerate-independent.
    const k = 1 - Math.exp(-TRACK_RESPONSE * delta);
    look.current.yaw += (wantYaw - look.current.yaw) * k;
    look.current.pitch += (wantPitch - look.current.pitch) * k;

    // Applied AFTER mixer.update, composed onto whatever the clip wrote, so the
    // idle sway and the tracking add up instead of one overwriting the other.
    goose.neckChain.forEach((bone, i) => {
      const share = NECK_SHARE[i] ?? 0;
      euler.set(look.current.pitch * share, look.current.yaw * share, 0, "XYZ");
      bone.quaternion.multiply(extra.setFromEuler(euler));
    });
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={goose.mesh} />
    </group>
  );
}
