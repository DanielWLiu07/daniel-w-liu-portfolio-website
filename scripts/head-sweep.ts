/**
 * How much gait motion actually reaches the head, measured rather than assumed.
 *
 * Two passes. The first sums the POSE TARGETS: applyWalk's rotations are
 * world-oriented (see PoseDriver.rotate), so the angle a bone is asked for in
 * world terms is the sum down its parent chain, and every angle here is well
 * under 0.3 rad where that sum is accurate enough to compare before to after.
 *
 * The second pass is the one that matters. Bones do not snap to their targets —
 * commit() eases each one through a second-order spring, and spine and chest
 * have different stiffness from the hips they are cancelling. Different gain
 * and different phase lag at stride rate means the cancellation cannot be
 * perfect no matter how exact the arithmetic. This runs the real integrator to
 * find out what is actually left.
 */
import { applyWalk } from "../components/three/goose/goose-walk";
import { GOOSE_DAMPING, GOOSE_SOFTNESS } from "../components/three/goose/use-pose-driver";

const CHAIN = ["hips", "spine", "chest", "neck1", "neck2", "neck3", "neck4", "head"];

function stub() {
  const acc: Record<string, [number, number, number]> = {};
  return {
    rot: acc,
    driver: {
      reset() {},
      commit() {},
      rotate(name: string, pitch: number, yaw: number, roll = 0) {
        const a = (acc[name] ??= [0, 0, 0]);
        a[0] += pitch;
        a[1] += yaw;
        a[2] += roll;
      },
      translate() {},
      has: () => true,
      targetDeviation: () => 0,
      restDeviation: () => 0,
      debugAim: () => null,
      aimWorld() {},
      setFlop() {},
      flopAmount: () => 1,
    },
  };
}

/**
 * Steps a second = ground speed over stride length, and it is NOT one number.
 *
 * Walking: 0.95 / 0.5 = 1.9 Hz. Running: 1.85 / 0.75 = 2.47 Hz, because the
 * run lengthens the stride as well as raising the cadence. The stabiliser's
 * compensation is a function of drive frequency, so a pair solved at 1.9 does
 * not automatically hold at 2.47 — which is exactly what this measures.
 */
const WALK_HZ = 0.95 / 0.5;
const RUN_HZ = 1.85 / (0.5 * 1.5);
const DT = 1 / 60;

/**
 * One bone's spring, per axis, integrated the way commit() does it: velocity
 * gets k*error*h, then decays by exp(-c*h), with c = 2*zeta*sqrt(k).
 */
class Axis {
  value = 0;
  private v = 0;
  constructor(
    private readonly k: number,
    private readonly zeta: number,
  ) {}
  step(target: number, dt: number) {
    const c = 2 * this.zeta * Math.sqrt(this.k);
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.v += (target - this.value) * this.k * h;
      this.v *= Math.exp(-c * h);
      this.value += this.v * h;
    }
    return this.value;
  }
}

function run(opts: {
  headSteady: number;
  swim: number;
  paddling: number;
  /** false = read the targets, true = read where the springs actually got to. */
  springs: boolean;
  seconds?: number;
  /** Steps a second. Walking and running are different frequencies. */
  hz?: number;
  /** 0 = walking, 1 = the run posture. */
  runAmount?: number;
}) {
  const springs: Record<string, Axis[]> = {};
  for (const b of CHAIN) {
    const k = GOOSE_SOFTNESS[b] ?? 200;
    const z = GOOSE_DAMPING[b] ?? 0.8;
    springs[b] = [new Axis(k, z), new Axis(k, z), new Axis(k, z)];
  }

  const seconds = opts.seconds ?? 14;
  const frames = Math.round(seconds / DT);
  // Discard the first EIGHT seconds. Two was not enough: the run applies a huge
  // static tilt (runHeadTilt is 2.0 rad) to the softest, least damped spring on
  // the bird, k=45 and zeta=0.32. That transient rings for seconds, and it was
  // being measured as running head wobble — a probe artifact reported as a
  // finding. Anything measuring a settling spring has to outwait it.
  const settle = Math.round(8 / DT);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];

  for (let f = 0; f < frames; f++) {
    const t = f * DT;
    const s = stub();
    applyWalk(s.driver as never, {
      phase: t * (opts.hz ?? WALK_HZ),
      stepHz: opts.hz ?? WALK_HZ,
      strokeHz: 5.4 / (Math.PI * 2),
      gait: 1,
      time: 0, // freeze idle, breath and the swim rock — gait only
      turn: 0,
      lag: 0,
      sway: 0,
      run: opts.runAmount ?? 0,
      swim: opts.swim,
      // STROKE_RATE from goose-actor: 5.4 rad/s, so 0.86 Hz — well under half
      // the stride rate, and nothing like it.
      stroke: t * 5.4,
      paddling: opts.paddling,
      headSteady: opts.headSteady,
    });

    const head = [0, 0, 0];
    for (const b of CHAIN) {
      const target = s.rot[b] ?? [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        head[a] += opts.springs ? springs[b][a].step(target[a], DT) : target[a];
      }
    }
    if (f < settle) continue;
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], head[a]);
      hi[a] = Math.max(hi[a], head[a]);
    }
  }
  return lo.map((v, a) => ((hi[a] - v) * 180) / Math.PI);
}

const fmt = (v: number[]) =>
  `pitch ${v[0].toFixed(2)}°  yaw ${v[1].toFixed(2)}°  roll ${v[2].toFixed(2)}°`;
const drop = (b: number[], a: number[]) =>
  b.map((x, i) => (x < 1e-6 ? "n/a" : `${((1 - a[i] / x) * 100).toFixed(0)}%`)).join("  ");

for (const springs of [false, true]) {
  console.log(
    springs
      ? "\n=== where the bones ACTUALLY get to (springs integrated) ==="
      : "=== what the pose ASKS for (targets only) ===",
  );
  for (const [label, o] of [
    ["walking ", { swim: 0, paddling: 0, hz: WALK_HZ, runAmount: 0 }],
    ["running ", { swim: 0, paddling: 0, hz: RUN_HZ, runAmount: 1 }],
    ["swimming", { swim: 1, paddling: 1, hz: WALK_HZ, runAmount: 0 }],
  ] as const) {
    const before = run({ ...o, headSteady: 0, springs });
    const after = run({ ...o, headSteady: 1, springs });
    console.log(`  ${label}  steady 0 : ${fmt(before)}`);
    console.log(`  ${label}  steady 1 : ${fmt(after)}`);
    console.log(`  ${label}  reduction: ${drop(before, after)}`);
  }
}

// The waddle itself must survive — this is the number that must NOT fall.
{
  const s = stub();
  applyWalk(s.driver as never, {
    phase: 0.25,
    gait: 1,
    time: 0,
    turn: 0,
    lag: 0,
    sway: 0,
    headSteady: 1,
  });
  const hips = s.rot["hips"] ?? [0, 0, 0];
  console.log(`\nhips roll at peak, steady 1: ${((hips[2] * 180) / Math.PI).toFixed(2)}°`);
}
