"use client";

/**
 * Pointer tracking for a neck, as a hook so it works on any rig — the
 * procedural goose or a model loaded from disk.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

/** Share of the total look angle per bone, base of neck to head. Sums to 1. */
export const DEFAULT_NECK_SHARE = [0.12, 0.16, 0.2, 0.24, 0.28];

export interface NeckTrackingOptions {
  /** Neck chain in order, base first, head last. */
  bones: THREE.Bone[] | THREE.Object3D[];
  /** The transform the goose lives under, used to express the target locally. */
  root: RefObject<THREE.Object3D | null>;
  enabled?: boolean;
  maxYaw?: number;
  maxPitch?: number;
  /** Roughly how fast the head closes the gap to a new target. */
  response?: number;
  share?: number[];
  /**
   * Runs before the tracking is applied — use it to advance an animation mixer.
   * The order matters: the clip writes each bone's quaternion outright, so
   * tracking has to compose on top of it or one silently overwrites the other.
   */
  beforeApply?: (delta: number) => void;
}

export function useNeckTracking({
  bones,
  root,
  enabled = true,
  maxYaw = 1.15,
  maxPitch = 0.6,
  response = 6,
  share = DEFAULT_NECK_SHARE,
  beforeApply,
}: NeckTrackingOptions): void {
  const { camera } = useThree();
  const look = useRef({ yaw: 0, pitch: 0 });

  /**
   * Each bone's rest rotation, captured once.
   */
  const rest = useRef(new Map<string, THREE.Quaternion>());
  /**
   * World-space axes expressed in each bone's LOCAL frame, captured at rest.
   */
  const axes = useRef(
    new Map<string, { up: THREE.Vector3; right: THREE.Vector3 }>(),
  );
  const knownBones = bones.map((b) => b.uuid).join(",");
  useMemo(() => {
    const nextRest = new Map<string, THREE.Quaternion>();
    const nextAxes = new Map<
      string,
      { up: THREE.Vector3; right: THREE.Vector3 }
    >();
    const inv = new THREE.Quaternion();
    for (const b of bones) {
      nextRest.set(
        b.uuid,
        rest.current.get(b.uuid)?.clone() ?? b.quaternion.clone(),
      );
      b.getWorldQuaternion(inv);
      inv.invert();
      nextAxes.set(b.uuid, {
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(inv).normalize(),
        right: new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize(),
      });
    }
    rest.current = nextRest;
    axes.current = nextAxes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownBones]);

  const scratch = useMemo(
    () => ({
      target: new THREE.Vector3(),
      head: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      extra: new THREE.Quaternion(),
      spin: new THREE.Quaternion(),
    }),
    [],
  );

  useFrame((state, delta) => {
    // Clamp so a backgrounded tab does not resume with one enormous step.
    const dt = Math.min(delta, 0.05);
    if (beforeApply) {
      // A mixer writes absolute quaternions, so it supplies the base itself.
      beforeApply(dt);
    } else {
      // Nothing else is driving these bones. Restore the rest pose so this
      // frame's rotation replaces the last one instead of adding to it.
      for (const b of bones) {
        const r = rest.current.get(b.uuid);
        if (r) b.quaternion.copy(r);
      }
    }

    const parent = root.current;
    if (!parent || bones.length === 0) return;

    let wantYaw = 0;
    let wantPitch = 0;

    if (enabled) {
      const { target, head, dir } = scratch;
      target.set(state.pointer.x, state.pointer.y, 0.5).unproject(camera);
      bones[bones.length - 1].getWorldPosition(head);
      // Convert both POINTS into the rig's frame and subtract THERE. Running
      // worldToLocal on the difference treats a direction as a point and folds
      // in the group's translation, which aims the head at the origin instead.
      parent.worldToLocal(target);
      parent.worldToLocal(head);
      dir.copy(target).sub(head).normalize();

      wantYaw = THREE.MathUtils.clamp(
        Math.atan2(dir.x, dir.z),
        -maxYaw,
        maxYaw,
      );
      wantPitch = THREE.MathUtils.clamp(Math.asin(dir.y), -maxPitch, maxPitch);
    }

    // Exponential smoothing, framerate-independent.
    const k = 1 - Math.exp(-response * dt);
    look.current.yaw += (wantYaw - look.current.yaw) * k;
    look.current.pitch += (wantPitch - look.current.pitch) * k;

    const { extra, spin } = scratch;
    bones.forEach((bone, i) => {
      const w = share[i] ?? 1 / bones.length;
      const ax = axes.current.get(bone.uuid);
      if (!ax) return;
      // Yaw about the bone-local image of WORLD up, pitch about world right.
      extra.setFromAxisAngle(ax.up, look.current.yaw * w);
      spin.setFromAxisAngle(ax.right, look.current.pitch * w);
      bone.quaternion.multiply(extra.multiply(spin));
    });
  });
}
