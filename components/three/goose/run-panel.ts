"use client";

/**
 * The run gait, as a panel schema.
 *
 * Same controls the in-page `run-tuner` grew, restated as data so they can be
 * rendered in a window on the other monitor. That matters more here than for
 * most panels: the run is the one pose you cannot judge while a panel sits on
 * top of the goose, because what you are reading is the whole silhouette
 * moving.
 *
 * The readouts carry as much as the sliders. A coefficient means nothing on its
 * own — `stride 0.8` is either a trot or a skate depending on whether the legs
 * can reach it — so the panel shows what resulted: the drag the reach guard is
 * applying, whether a flight phase actually opened, and which joints are
 * pinned against their limits and therefore ignoring further input.
 */
import type { PanelSchema, PanelValue } from "blender-to-threejs";

import type { RunTuning } from "./goose-actor";

export const RUN_PANEL: PanelSchema = {
  id: "run",
  title: "run gait",
  width: 360,
  height: 720,
  controls: [
    { kind: "toggle", key: "hold", label: "hold the pose while standing" },
    { kind: "toggle", key: "showBones", label: "show the skeleton" },

    { kind: "section", label: "travel" },
    { kind: "slider", key: "speed", label: "speed", min: 0.2, max: 6 },
    // Speed is stride times cadence, so a run that gets its speed from cadence
    // alone is a walk played fast. Watch `drag` while raising this.
    { kind: "slider", key: "stride", label: "stride", min: 0, max: 1.6, step: 0.02 },
    // Under 0.5 the stances stop overlapping and a flight phase opens — the
    // line between a fast walk and a trot.
    { kind: "slider", key: "duty", label: "duty", min: 0, max: 0.32, step: 0.01 },
    { kind: "slider", key: "lift", label: "foot lift", min: 0, max: 5, step: 0.1 },

    { kind: "section", label: "body" },
    // Crouch is the only source of horizontal reach: sqrt(L^2 - h^2) grows fast
    // as the hips come down, and it is what pays for a long stride.
    { kind: "slider", key: "crouch", label: "crouch", min: 0, max: 0.18, step: 0.005 },
    { kind: "slider", key: "bounce", label: "bounce", min: 0, max: 0.2, step: 0.005 },
    { kind: "slider", key: "rock", label: "rock", min: 0, max: 0.3, step: 0.005 },
    // The waddle IS the weight transfer. At 0 the run reads as vibration.
    { kind: "slider", key: "roll", label: "weight", min: 0, max: 1 },
    { kind: "slider", key: "bodyPitch", label: "body", min: -1.2, max: 2.5 },

    { kind: "section", label: "head and neck" },
    { kind: "slider", key: "headTilt", label: "head", min: -3, max: 6 },
    { kind: "slider", key: "headSteady", label: "steady", min: 0, max: 1 },
    { kind: "slider", key: "neck0", label: "neck1", min: -1.6, max: 1.9 },
    { kind: "slider", key: "neck1", label: "neck2", min: -1.6, max: 1.9 },
    { kind: "slider", key: "neck2", label: "neck3", min: -1.6, max: 1.9 },
    { kind: "slider", key: "neck3", label: "neck4", min: -1.6, max: 1.9 },

    { kind: "section", label: "measured" },
    { kind: "readout", key: "beak", label: "beak", unit: "°", precision: 0 },
    { kind: "readout", key: "ahead", label: "head ahead", precision: 2 },
    { kind: "readout", key: "above", label: "head above", precision: 2 },
    { kind: "readout", key: "dutyNow", label: "duty factor", precision: 2 },
    { kind: "readout", key: "flight", label: "flight", unit: "%", precision: 0 },
    { kind: "readout", key: "strideNow", label: "stride", precision: 2 },
    { kind: "readout", key: "cadence", label: "cadence", unit: "Hz", precision: 2 },
    // Non-zero means the reach guard is hauling a planted foot back under the
    // body every frame, which is skating. 2mm is the noise floor.
    {
      kind: "readout",
      key: "drag",
      label: "foot drag",
      unit: "cm",
      precision: 1,
      warnAbove: 0.2,
    },
    // Rising past the crouch means the body climbs above standing height, where
    // the legs are already straight and the guard starts dragging.
    {
      kind: "readout",
      key: "overBounce",
      label: "bounce over",
      unit: "cm",
      precision: 1,
      warnAbove: 0.01,
    },
    { kind: "readout", key: "clamped", label: "joints pinned", precision: 0, warnAbove: 0 },

    { kind: "section", label: "" },
    { kind: "button", key: "reset", label: "reset to defaults" },
    { kind: "snippet", key: "source", label: "paste into RUN_DEFAULTS" },
  ],
};

/** Flatten the tuning into the panel's flat key space. */
export function runValues(
  t: RunTuning,
  showBones: boolean,
): Record<string, PanelValue> {
  return {
    hold: t.hold,
    showBones,
    speed: t.speed,
    stride: t.stride,
    duty: t.duty,
    lift: t.lift,
    crouch: t.crouch,
    bounce: t.bounce,
    rock: t.rock,
    roll: t.roll,
    bodyPitch: t.bodyPitch,
    headTilt: t.headTilt,
    headSteady: t.headSteady,
    neck0: t.neck[0] ?? 0,
    neck1: t.neck[1] ?? 0,
    neck2: t.neck[2] ?? 0,
    neck3: t.neck[3] ?? 0,
  };
}

/**
 * Apply one panel edit back onto the tuning.
 *
 * Returns null for keys the caller owns rather than the tuning — `showBones` is
 * page state, not gait state — so the caller can route them without this
 * needing to know what they are.
 */
export function applyRunValue(
  t: RunTuning,
  key: string,
  value: PanelValue,
): RunTuning | null {
  if (key === "hold") return { ...t, hold: Boolean(value) };
  if (key.startsWith("neck")) {
    const i = Number(key.slice(4));
    if (!Number.isInteger(i) || i < 0 || i > 3) return null;
    const neck = t.neck.slice();
    neck[i] = Number(value);
    return { ...t, neck };
  }
  const numeric = [
    "speed",
    "stride",
    "duty",
    "lift",
    "crouch",
    "bounce",
    "rock",
    "roll",
    "bodyPitch",
    "headTilt",
    "headSteady",
  ] as const;
  for (const k of numeric) {
    if (key === k) return { ...t, [k]: Number(value) };
  }
  return null;
}

/** The tuned values printed as source, ready to paste over RUN_DEFAULTS. */
export function runSnippet(t: RunTuning): string {
  return [
    `speed: ${t.speed.toFixed(2)}, headTilt: ${t.headTilt.toFixed(2)}, bodyPitch: ${t.bodyPitch.toFixed(2)},`,
    `bounce: ${t.bounce.toFixed(3)}, rock: ${t.rock.toFixed(3)},`,
    `stride: ${t.stride.toFixed(2)}, crouch: ${t.crouch.toFixed(3)}, duty: ${t.duty.toFixed(2)},`,
    `roll: ${t.roll.toFixed(2)}, lift: ${t.lift.toFixed(1)}, headSteady: ${t.headSteady.toFixed(2)},`,
    `neck: [${t.neck.map((n) => n.toFixed(2)).join(", ")}],`,
  ].join("\n");
}

/**
 * The derived numbers the panel shows.
 *
 * Kept here rather than in the panel so the arithmetic lives next to the gait
 * it describes — the relationship between duty and flight, and between stride
 * and cadence, is gait knowledge, not presentation.
 */
export function runReadouts(
  t: RunTuning,
  live: { beak: number; ahead: number; above: number; drag: number; clamped: number },
): Record<string, number> {
  const dutyNow = 0.6 - t.duty;
  const strideNow = 0.44 * (1 + t.stride);
  return {
    beak: live.beak,
    ahead: live.ahead,
    above: live.above,
    drag: live.drag * 100,
    clamped: live.clamped,
    dutyNow,
    // Below a 0.5 duty the two stances separate and the gap between them is
    // time with neither foot down.
    flight: dutyNow < 0.5 ? (1 - 2 * dutyNow) * 100 : 0,
    strideNow,
    cadence: strideNow > 0 ? t.speed / strideNow : 0,
    overBounce: Math.max(0, (t.bounce / 2 - t.crouch) * 100),
  };
}
