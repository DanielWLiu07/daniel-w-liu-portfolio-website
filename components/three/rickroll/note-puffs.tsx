"use client";

/**
 * Notes drifting off the speaker, one per beat.
 *
 * Same white hand-drawn language as the honk marks and the grab rings — this
 * world says everything in white marks — and driven off the audio clock rather
 * than off elapsed time, so they land ON the beat instead of near it.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const POOL = 14;
/** Seconds a note takes to rise and fade. */
const LIFE = 1.5;
const RISE = 0.55;
/** Sideways drift, so a stream of them does not read as a column. */
const SWAY = 0.13;
const SIZE = 0.16;

/** Two glyphs, drawn once into one texture as a 2x1 atlas. */
function glyphTexture() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S * 2;
  c.height = S;
  const x = c.getContext("2d");
  if (x) {
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = `${S * 0.8}px ui-sans-serif, system-ui, sans-serif`;
    // Outlined, not plain white. The lawn is pale and a white glyph on it is
    // barely there; the same dark edge the lyrics get is what makes these read
    // over grass, path and water alike.
    x.strokeStyle = "rgba(28,30,24,0.85)";
    x.lineWidth = S * 0.09;
    x.lineJoin = "round";
    x.fillStyle = "#fff";
    for (const [glyph, cx] of [
      ["♪", S * 0.5],
      ["♫", S * 1.5],
    ] as const) {
      x.strokeText(glyph, cx, S * 0.54);
      x.fillText(glyph, cx, S * 0.54);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

export default function NotePuffs({
  from,
  beat,
  active,
}: {
  /** Where the speaker is, world space. Read every frame. */
  from: React.RefObject<THREE.Vector3>;
  /** Song position in beats, or negative when silent. */
  beat: () => number;
  active: React.RefObject<boolean>;
}) {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const items = useRef<(THREE.Mesh | null)[]>([]);
  /**
   * One texture per note, cut to half the atlas.
   *
   * They cannot share: each note shows a different glyph, which is an offset on
   * the texture, not on the material. Cloning in the JSX instead would mint a
   * fresh texture on every React render and never free the last one.
   */
  const texes = useMemo(() => {
    const base = glyphTexture();
    return Array.from({ length: POOL }, () => {
      const t = base.clone();
      t.repeat.x = 0.5;
      t.needsUpdate = true;
      return t;
    });
  }, []);

  const state = useRef(
    Array.from({ length: POOL }, () => ({
      t: -1,
      x: 0,
      y: 0,
      z: 0,
      sway: 0,
      spin: 0,
      half: false,
    })),
  );
  const lastBeat = useRef(-1);
  const next = useRef(0);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;

    // Spawn on each new beat, but only while something is playing.
    const b = beat();
    if (active.current && b >= 0) {
      const whole = Math.floor(b);
      if (whole !== lastBeat.current) {
        lastBeat.current = whole;
        const s = state.current[next.current];
        next.current = (next.current + 1) % POOL;
        const p = from.current;
        s.t = 0;
        s.x = p.x + (Math.random() - 0.5) * 0.06;
        s.y = p.y;
        s.z = p.z + (Math.random() - 0.5) * 0.06;
        s.sway = (Math.random() - 0.5) * 2;
        s.spin = (Math.random() - 0.5) * 0.7;
        // Offbeats get the double note, so the stream has some variety.
        s.half = whole % 2 === 1;
      }
    } else {
      lastBeat.current = -1;
    }

    for (let i = 0; i < POOL; i++) {
      const s = state.current[i];
      const m = items.current[i];
      if (!m) continue;
      if (s.t < 0) {
        m.visible = false;
        continue;
      }
      s.t += dt;
      const u = s.t / LIFE;
      if (u >= 1) {
        s.t = -1;
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(
        s.x + Math.sin(u * Math.PI * 1.6) * SWAY * s.sway,
        s.y + RISE * u,
        s.z,
      );
      // Billboard, then roll a little so they are not all upright.
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(Math.sin(u * 3 + i) * 0.22 + s.spin);
      const grow = u < 0.16 ? u / 0.16 : 1;
      m.scale.setScalar(SIZE * (0.7 + 0.3 * grow));
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = grow * (1 - u * u) * 0.9;
      // Pick a glyph by shifting the atlas.
      if (mat.map) mat.map.offset.x = s.half ? 0.5 : 0;
    }
  });

  return (
    <group ref={group} renderOrder={10}>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(m) => {
            items.current[i] = m;
          }}
        >
          <planeGeometry args={[1, 1]} />
          {/* Each needs its own material: they show different glyphs and fade
              independently, and both live on the material. */}
          <meshBasicMaterial
            map={texes[i]}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
