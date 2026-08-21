'use client';

/**
 * Rings that pulse off a prop the goose could pick up.
 *
 * The size split between what can be shoved and what can be carried is a real
 * mechanic — a crate is 0.7 across against a 1.3 goose, and no amount of trying
 * will get it into a bill — but until now nothing said so. You walked at things
 * and pressed E and either it worked or it did not, which reads as the button
 * being unreliable rather than as the world having rules.
 *
 * Untitled Goose Game answers this the same way it answers the honk: white
 * hand-drawn marks, here as lines around anything you can take. This is that,
 * as rings climbing off the object and fading.
 *
 * Deliberately NOT a per-object outline. An outline needs the prop's geometry,
 * a second render pass and a stencil; rings need a position, and the position is
 * already being computed to decide what E would pick up.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** How many rings are in flight at once. */
const RINGS = 3;
/** Seconds for one ring to climb and fade. */
const PERIOD = 1.1;
/** Radius at the bottom and at the top of a ring's travel. */
const R0 = 0.13;
const R1 = 0.26;
/** How far a ring rises over its life, world units. */
const RISE = 0.22;
/** Matches the honk marks — the same hand drawing the same kind of mark. */
const COLOR = '#ffffff';

export default function GrabRing({
  hint,
}: {
  hint: React.RefObject<{ has: boolean; x: number; y: number; z: number }>;
}) {
  const group = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  /**
   * Eased presence, so the rings do not blink on and off.
   *
   * The candidate flickers at the edge of reach — one frame in, one frame out,
   * as the bill sways with the gait — and a hard cut on that is a strobe. It
   * also has to keep animating while fading out, or a ring freezes mid-climb.
   */
  const show = useRef(0);

  useFrame((state, dt) => {
    const g = group.current;
    const h = hint.current;
    if (!g || !h) return;

    const want = h.has ? 1 : 0;
    show.current += (want - show.current) * Math.min(1, 7 * dt);
    if (show.current < 0.01 && want === 0) {
      g.visible = false;
      return;
    }
    g.visible = true;
    // Only track while the target is live; on the way out the rings stay where
    // the prop was rather than sliding to wherever the goose has wandered.
    if (h.has) g.position.set(h.x, h.y, h.z);

    const t = state.clock.elapsedTime;
    for (let i = 0; i < RINGS; i++) {
      const m = rings.current[i];
      if (!m) continue;
      // Evenly staggered through one period, so they read as a sequence.
      const u = ((t / PERIOD + i / RINGS) % 1 + 1) % 1;
      const r = R0 + (R1 - R0) * u;
      m.position.y = RISE * u;
      m.scale.setScalar(r / R0);
      // In quickly, out over the rest — a ring should arrive, not materialise.
      const fade = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      (m.material as THREE.MeshBasicMaterial).opacity =
        fade * 0.75 * show.current;
    }
  });

  return (
    <group ref={group} name="grab-ring" visible={false} renderOrder={9}>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            rings.current[i] = m;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {/* Thin annulus. Flat to the ground, which reads as a ring around the
              object from the game's fixed three-quarter camera without needing
              to be billboarded. */}
          <ringGeometry args={[R0, R0 * 1.16, 32]} />
          <meshBasicMaterial
            color={COLOR}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
