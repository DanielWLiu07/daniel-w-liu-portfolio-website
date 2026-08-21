"use client";

/**
 * The comic squiggles that come out of the bill on a honk.
 *
 * Untitled Goose Game draws its honk as 2D hand-drawn emphasis lines lifted
 * straight from comics — white, a few of them, held beside the bill and
 * SHIMMERING in place for as long as the honk lasts. They do not fly anywhere.
 *
 * That last part is the whole effect and it took two wrong versions to see it.
 * The first walked the strokes outward on a fixed curve; the second gave them
 * velocities, drag and buoyancy and let them disperse. Both are motion effects,
 * and both are wrong, because a comic emphasis line is not a thing travelling
 * through space — it is a mark on the page next to the thing making the noise.
 * It stays put relative to the goose and it wiggles. The animation lives in the
 * SHAPE of the stroke, not in where the stroke is.
 *
 * So the geometry is rewritten every frame with a travelling phase, which is
 * what makes each line ripple, and the positions barely move at all.
 */

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Strokes per honk. A comic uses two or three marks, not a spray. */
const STROKES = 3;
/** Seconds the marks are held. Tracks the mouth, which is now a 70ms bark. */
const LIFE = 0.28;
/** Half-angle of the fan beside the bill, radians. */
const SPREAD = 0.6;
/**
 * Gap between the mouth and where a mark begins.
 *
 * Measured off the reference frame, scaling by the goose itself: it stands
 * 505px there against the 1.3 world units the actor normalises it to, so a
 * pixel is 0.00257. The near ends of the three marks sit 85, 106 and 110px out
 * from the mouth — 0.22 to 0.28. Every earlier value here was a guess and every
 * one of them was far too tight, which is why the marks kept looking stuck to
 * the bill instead of thrown clear of it.
 */
const NEAR = 0.16;
/** How far they creep outward over their whole life. Deliberately tiny. */
const DRIFT = 0.05;
/**
 * When the leading edge finishes leaving the mouth, as a fraction of life.
 *
 * The mark is not faded in and out, it is DRAWN and then erased: the head runs
 * out from the mouth first, and the tail follows it out, so the stroke is eaten
 * from the back. That is what makes it read as something the goose emitted
 * rather than something that appeared next to it.
 */
const HEAD_DONE = 0.99;
/**
 * When the trailing edge starts leaving the mouth.
 *
 * Must be AFTER head_done, with a gap. These used to overlap — the tail set off
 * at 0.3 while the head was still running to 0.5 — so the mark was never once
 * whole: it was being erased before it had finished being drawn, which reads as
 * a smear passing by rather than as a line that was struck. The window between
 * the two is the beat where the stroke sits at full length.
 */
const TAIL_START = 0.58;
/** Ripples per second along a stroke. The wiggle. */
const WIGGLE_HZ = 7.2;
/**
 * White, like the game.
 *
 * This is the one place the effect fights its background: the goose is white
 * and the ground is pale, so white marks have less contrast here than they do
 * against the game's green lawn. They read because they move and because they
 * sit off the silhouette, not because of tone.
 */
const COLOR = "#ffffff";
/** Samples along a stroke. Enough for a smooth ripple, small enough to rewrite. */
const STEPS = 26;
/** Samples spent sweeping each round cap. */
const CAP = 6;
/** What is left for the straight body between the caps. */
const BODY = STEPS - CAP * 2;

/**
 * Write a wavy tapered ribbon into an existing position buffer.
 *
 * Rewritten in place every frame rather than rebuilt: this is 54 vertices per
 * stroke and three strokes, so the whole animation is 162 vertices of arithmetic
 * and no allocation. Normalised to length 1 along +X, so every number here is a
 * FRACTION of the stroke's own length and the shape survives being scaled.
 */
function writeSquiggle(
  arr: Float32Array,
  waves: number,
  amp: number,
  width: number,
  phase: number,
  /** Visible window along the stroke, 0 at the mouth and 1 at the far end. */
  tail: number,
  head: number,
) {
  const span = Math.max(1e-4, head - tail);
  for (let i = 0; i <= STEPS; i++) {
    /**
     * Even thickness with round caps, so the samples are NOT spread evenly.
     *
     * A semicircular cap is only `width` long — about a twentieth of a full
     * mark — so sharing the samples out by arc length would spend one vertex on
     * it and the round end would come back as a chamfer. Each cap gets a fixed
     * CAP samples swept through a quarter turn instead, and the straight body
     * takes what is left.
     *
     * `s` runs along the segment from -width (the outer point of the start cap)
     * to span + width (the outer point of the end cap); `w` is the half-width
     * there, constant through the body and falling off as a circle at the ends.
     */
    let s: number;
    let w: number;
    if (i < CAP) {
      const th = (i / CAP) * (Math.PI / 2);
      s = -width * Math.cos(th);
      w = width * Math.sin(th);
    } else if (i <= CAP + BODY) {
      s = span * ((i - CAP) / BODY);
      w = width;
    } else {
      const th = ((i - CAP - BODY) / CAP) * (Math.PI / 2);
      s = span + width * Math.sin(th);
      w = width * Math.cos(th);
    }
    const t = tail + s;
    const a = t * Math.PI * waves + phase;
    const y = amp * Math.sin(a);
    // Offset along the centre line's NORMAL, not straight up: a constant-Y
    // offset pinches the ribbon wherever the wave is steep.
    const dy = amp * Math.PI * waves * Math.cos(a);
    const l = Math.hypot(1, dy);
    const nx = -dy / l;
    const ny = 1 / l;
    const o = i * 6;
    arr[o] = t + nx * w;
    arr[o + 1] = y + ny * w;
    arr[o + 2] = 0;
    arr[o + 3] = t - nx * w;
    arr[o + 4] = y - ny * w;
    arr[o + 5] = 0;
  }
}

function makeGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array((STEPS + 1) * 6), 3),
  );
  const idx: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setIndex(idx);
  return g;
}

/**
 * Perpendicular gap between neighbouring marks, world units.
 *
 * Separate from `spread`, which is angular: at a narrow spread the marks fan
 * only slightly and so converge near the mouth however far out they start.
 * This slides each mark sideways along its OWN normal, so they stay parallel
 * and evenly apart no matter how tight the fan is.
 */
const SPACING = 0.1;

/** Ceiling on strokes, so changing the count never remounts the meshes. */
const MAX_STROKES = 6;

/**
 * Everything the tuner can move.
 *
 * The defaults are the measured values, not tidy round numbers — most of them
 * came off the reference frame by scaling against the goose's own height, and
 * the comments above each constant say how. Treat those as the derivation and
 * this as the live copy.
 */
export interface HonkTuning {
  strokes: number;
  life: number;
  spread: number;
  near: number;
  len: number;
  width: number;
  bow: number;
  wiggle: number;
  headDone: number;
  tailStart: number;
  spacing: number;
}

export const HONK_DEFAULTS: HonkTuning = {
  strokes: STROKES,
  life: LIFE,
  spread: SPREAD,
  near: NEAR,
  len: 0.33,
  width: 0.055,
  bow: 0.042,
  wiggle: WIGGLE_HZ,
  headDone: HEAD_DONE,
  tailStart: TAIL_START,
  spacing: SPACING,
};

/** Scratch, allocated once. */
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const fwd = new THREE.Vector3();

export default function HonkLines({
  mouth,
  dir,
  honk,
  tuning = HONK_DEFAULTS,
}: {
  /** World position of the mouth. Not the prop-carry point, which sits high. */
  mouth: React.RefObject<THREE.Vector3>;
  /** Head-to-bill direction, normalised. Carries pitch as well as yaw. */
  dir: React.RefObject<THREE.Vector3>;
  honk: boolean;
  tuning?: HonkTuning;
}) {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  /** Seconds, or -1 for "no honk yet". */
  const start = useRef(-1);
  /**
   * Fan orientation, resolved ONCE when the honk starts and held for its life.
   *
   * Flattening the bill onto the screen is ill-conditioned near the degenerate
   * directions: with the goose nearly facing the camera, the projected vector is
   * a couple of rounding errors long and its angle swings wildly frame to frame,
   * so the fan spun while the marks were on screen. Resolving it once samples
   * that instability a single time instead of sixty times a second, and over a
   * 200ms burst the goose cannot turn far enough for a fixed fan to look wrong.
   */
  const aimAngle = useRef(0);
  /** Foreshortening at spawn, 1 in profile down to 0 straight down the bill. */
  const persp = useRef(1);
  const wasHonking = useRef(false);
  const { camera } = useThree();

  /**
   * Buffers only, MAX_STROKES of them, allocated once.
   *
   * The per-stroke shape used to live in here, which meant every slider drag
   * rebuilt the array and remounted the meshes. Only the vertex buffers are
   * fixed now; length, width, fan position and the rest are read off the tuning
   * each frame, and strokes above the current count are simply hidden.
   */
  const geos = useMemo(
    () => Array.from({ length: MAX_STROKES }, () => makeGeo()),
    [],
  );

  useFrame(() => {
    // Rising edge only: `honk` is held true for the length of the honk, and
    // restarting on every frame of it would freeze the marks at birth.
    const began = honk && !wasHonking.current;
    if (began) start.current = performance.now() / 1000;
    wasHonking.current = honk;

    const g = group.current;
    if (!g) return;
    if (start.current < 0) {
      g.visible = false;
      return;
    }
    const age = performance.now() / 1000 - start.current;
    if (age > tuning.life) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const u = age / tuning.life;

    // Pinned to the mouth: the marks belong to the goose, not to the world, so
    // they travel with it exactly and never trail behind.
    g.position.copy(mouth.current);
    // Face the camera. A comic line that foreshortens stops reading as ink and
    // starts reading as bent world geometry.
    g.quaternion.copy(camera.quaternion);
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    // The real bill axis, pitch included, so the marks leave along the beak
    // rather than along the goose's compass heading.
    fwd.copy(dir.current);
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1);

    /**
     * The bill's heading flattened onto the screen.
     *
     * `aim` is how much of the bill's direction survives the projection: 1 in
     * profile, 0 when the goose honks straight at or away from the camera, where
     * there is no screen direction to point at and the atan2 below would be
     * reading two numbers that are both rounding error. So the spread OPENS as
     * the direction collapses — a honk aimed at the camera has no "that way",
     * and the comic answer to that is a ring rather than an arrow.
     */
    if (began) {
      const ax = fwd.dot(camRight);
      const ay = fwd.dot(camUp);
      const aim = Math.min(1, Math.hypot(ax, ay));
      aimAngle.current = aim < 1e-4 ? 0 : Math.atan2(ay, ax);
      /**
       * Foreshortening, and the whole reason this is a camera problem.
       *
       * The camera is a fixed three-quarter view looking down about 47 degrees
       * (CAM_OFFSET 0, 3.4, 3.2), which changes what "facing away" means on
       * screen: a horizontal bill pointing away from the viewer still projects
       * to a vector 0.73 long, pointing UP the screen. It is not degenerate at
       * all. The old rule read that 0.73 as "nearly head-on" and opened the fan
       * from 0.585 to 1.27 radians, so the marks ballooned into a wide spray
       * over the goose's back every time it walked away — which is the weirdness,
       * and it was a bug, not a limitation of drawing 2D marks in a 3D scene.
       *
       * The fan angle is now left alone and the foreshortening is spent where it
       * belongs: on how far the marks sit from the mouth. Pointing across the
       * view they stand right off; pointing along it they draw in, the way a
       * fan of lines genuinely would when you look down the middle of it. They
       * are never scaled to nothing, because a comic mark you cannot see is not
       * a comic mark.
       */
      persp.current = 0.45 + 0.55 * aim;
    }
    const spread = tuning.spread;
    g.rotateZ(aimAngle.current);

    // The draw-and-erase does the appearing and disappearing, so opacity only
    // has to take the hard edge off the very end.
    const o = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    const head = Math.min(1, u / tuning.headDone);
    // Guarded: dragging tailStart above headDone is legal but dividing by the
    // gap is not, and a slider should never be able to produce a NaN vertex.
    const tailSpan = Math.max(1e-3, 1 - tuning.tailStart);
    const tail = Math.max(0, (u - tuning.tailStart) / tailSpan);

    const n = Math.max(1, Math.min(MAX_STROKES, Math.round(tuning.strokes)));
    for (let i = 0; i < MAX_STROKES; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      if (i >= n) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      /**
       * Where this mark sits in the fan, -0.5 to 0.5 — at the CENTRE of one of
       * n equal slices, not at the ends of n-1 of them.
       *
       * This is what makes the head-on case work. When the bill points at the
       * camera there is no screen direction to fan along, so the spread opens
       * out to a full turn; with marks at the ends of the arc that puts the
       * first and last at -PI and +PI, which is the same direction, so three
       * marks came out as two stacked on each other and one opposite. Slice
       * centres divide a full turn evenly instead — 120 degrees apart for
       * three — and behave identically for a narrow fan.
       */
      const f = (i + 0.5) / n - 0.5;
      const away = Math.abs(f);
      const s = {
        geo: geos[i],
        // Middle mark longest and closest; the outer pair shorter and standing
        // further off. Both shaped as fractions of the tuned values so a slider
        // moves the whole fan rather than just its centre.
        len: tuning.len * (1 - away * 0.29),
        waves: 0.9 + (i % 2) * 0.3,
        amp: tuning.bow,
        width: tuning.width,
        phase: i * 1.7,
        out: tuning.near + away * 0.05,
      };
      const angle = f * spread * 2;
      const d = (s.out + DRIFT * u) * persp.current;
      // Out along the fan, then sideways along this mark's own normal. The
      // second part is what keeps them apart when the fan is narrow: with only
      // the radial term, three marks at a tight spread all pile onto the same
      // line as they approach the mouth.
      const off = f * 2 * tuning.spacing;
      m.position.set(
        Math.cos(angle) * d - Math.sin(angle) * off,
        Math.sin(angle) * d + Math.cos(angle) * off,
        0,
      );
      m.rotation.z = angle;
      // Uniform: every feature of the geometry is a fraction of its length, so
      // scaling the axes differently would not stretch a stroke, it would
      // redraw it as a different and much worse shape.
      m.scale.setScalar(s.len);
      (m.material as THREE.MeshBasicMaterial).opacity = o;

      // THE WIGGLE. The phase travels along the stroke, so the ripple runs
      // through the mark while the mark itself stays where it is.
      const attr = s.geo.getAttribute("position") as THREE.BufferAttribute;
      writeSquiggle(
        attr.array as Float32Array,
        s.waves,
        // Swells in and settles, so it is liveliest at the peak of the honk.
        s.amp * (0.65 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.2))),
        s.width,
        s.phase + age * Math.PI * 2 * tuning.wiggle,
        tail,
        head,
      );
      attr.needsUpdate = true;
    }
  });

  return (
    // Named so a probe can find exactly these and not some other group in the
    // scene — which is what happened the first time this was tested.
    <group ref={group} name="honk-lines" visible={false} renderOrder={10}>
      {geos.map((geo, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geo}
        >
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
