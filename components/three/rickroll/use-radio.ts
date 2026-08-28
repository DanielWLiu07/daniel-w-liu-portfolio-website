"use client";

/**
 * The radio's noise, synthesised.
 *
 * Four voices and three drums over a Web Audio graph, driven by the note data
 * in `song.ts`. Nothing is sampled and nothing is fetched, so the radio works
 * offline, adds no bytes to the bundle worth counting, and — the part that
 * actually matters here — the game knows exactly where it is in the song. A
 * decoded mp3 would give a waveform and nothing else; this gives a beat number
 * every frame, which is what the lyrics, the speaker cone, the note puffs and
 * the goose's head all hang off.
 */
import { useEffect, useMemo } from "react";

import {
  BEATS_PER_BAR,
  CHORDS,
  MELODY,
  TEMPO,
  TOTAL_BEATS,
  hz,
} from "./song";

/** Seconds of audio scheduled ahead of the clock. */
const LOOKAHEAD = 0.18;
/** How often the scheduler wakes, in ms. Well under LOOKAHEAD. */
const TICK = 30;

type Kind = "lead" | "bass" | "stab" | "kick" | "snare" | "hat";

interface Event {
  at: number;
  kind: Kind;
  /** Pitches, for the tuned voices. */
  midi?: number | number[];
  len?: number;
}

/**
 * The whole arrangement, laid out once as one sorted list.
 *
 * A cursor into a single array is the entire scheduler: everything before
 * `now + LOOKAHEAD` gets fired and the cursor moves on. Separate per-voice
 * cursors would each need their own loop-around and their own off-by-one.
 */
function arrange(): Event[] {
  const ev: Event[] = [];

  for (const n of MELODY) {
    if (n.midi === null) continue;
    ev.push({ at: n.at, kind: "lead", midi: n.midi, len: n.len });
  }

  for (let bar = 0; bar < CHORDS.length; bar++) {
    const t = bar * BEATS_PER_BAR;
    const ch = CHORDS[bar];

    // Driving eighths with an octave lift, which is most of what makes this
    // sound like 1987 rather than like a music box.
    for (const [off, oct, len] of [
      [0, 0, 0.45],
      [0.5, 0, 0.35],
      [1.5, 12, 0.35],
      [2, 0, 0.45],
      [2.5, 0, 0.35],
      [3.5, 12, 0.35],
    ]) {
      ev.push({ at: t + off, kind: "bass", midi: ch.root + oct, len });
    }

    // Chord stabs on the offbeats.
    ev.push({ at: t + 1.5, kind: "stab", midi: ch.notes, len: 0.3 });
    ev.push({ at: t + 3.5, kind: "stab", midi: ch.notes, len: 0.3 });

    ev.push({ at: t, kind: "kick" });
    ev.push({ at: t + 2, kind: "kick" });
    if (bar % 2 === 1) ev.push({ at: t + 2.75, kind: "kick" });
    ev.push({ at: t + 1, kind: "snare" });
    ev.push({ at: t + 3, kind: "snare" });
    // A fill going into every eighth bar, the way the record does.
    if (bar % 8 === 7) {
      ev.push({ at: t + 3.25, kind: "snare" });
      ev.push({ at: t + 3.5, kind: "snare" });
      ev.push({ at: t + 3.75, kind: "snare" });
    }
    for (let h = 0; h < BEATS_PER_BAR * 2; h++) {
      ev.push({ at: t + h * 0.5, kind: "hat" });
    }
  }

  ev.sort((a, b) => a.at - b.at);
  return ev;
}

export interface Radio {
  /** Must be called from a real user gesture before anything will sound. */
  unlock(): void;
  toggle(): boolean;
  stop(): void;
  playing(): boolean;
  /** Position in the song, in beats. -1 when silent. */
  beat(): number;
  /** Rough loudness right now, 0..1, for driving the speaker cone. */
  level(): number;
  /** Distance attenuation, 0..1, written every frame by the scene. */
  setVolume(v: number): void;
  /** -1..1, so the radio is audibly off to one side. */
  setPan(p: number): void;
  dispose(): void;
}

function build(): Radio {
  const spb = 60 / TEMPO;
  const events = arrange();

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let panner: StereoPannerNode | null = null;
  let analyser: AnalyserNode | null = null;
  let noise: AudioBuffer | null = null;
  // Explicitly over an ArrayBuffer, not ArrayBufferLike: getByteTimeDomainData
  // will not take a view that might be backed by a SharedArrayBuffer.
  let scope: Uint8Array<ArrayBuffer> | null = null;

  let timer: number | null = null;
  let origin = 0;
  let cursor = 0;
  let on = false;
  let volume = 1;

  function ensure() {
    if (ctx) return ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    master = ctx.createGain();
    master.gain.value = 0;
    panner = ctx.createStereoPanner();
    const comp = ctx.createDynamicsCompressor();
    // Six voices can land on the same sixteenth. Without this the loud bars
    // clip and the quiet ones sound thin.
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    scope = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    master.connect(panner);
    panner.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);

    const n = ctx.sampleRate;
    noise = ctx.createBuffer(1, n, n);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function burst(t: number, dur: number, hp: number, gain: number) {
    if (!ctx || !noise || !master) return;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  function tuned(
    t: number,
    f: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    cutoff: [number, number, number],
    detune = 0,
  ) {
    if (!ctx || !master) return;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 4;
    filt.frequency.setValueAtTime(cutoff[0], t);
    filt.frequency.linearRampToValueAtTime(cutoff[1], t + 0.03);
    filt.frequency.exponentialRampToValueAtTime(
      cutoff[2],
      t + Math.max(0.08, dur),
    );
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.setTargetAtTime(peak * 0.6, t + 0.012, 0.1);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.9, 0.035);
    filt.connect(g);
    g.connect(master);

    const oscs = detune ? [0, detune] : [0];
    for (const dt of oscs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = dt;
      o.connect(filt);
      o.start(t);
      o.stop(t + dur + 0.25);
    }
  }

  function fire(e: Event, t: number) {
    if (!ctx || !master) return;
    const len = (e.len ?? 0.25) * spb;
    switch (e.kind) {
      case "lead":
        tuned(t, hz(e.midi as number), len, "sawtooth", 0.2, [500, 3400, 900], 9);
        break;
      case "bass":
        tuned(t, hz(e.midi as number), len, "square", 0.26, [180, 900, 220]);
        break;
      case "stab":
        for (const m of e.midi as number[]) {
          tuned(t, hz(m), len, "sawtooth", 0.055, [700, 2600, 800], 7);
        }
        break;
      case "kick": {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 0.28);
        break;
      }
      case "snare": {
        burst(t, 0.16, 1400, 0.34);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = 190;
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 0.12);
        break;
      }
      case "hat":
        burst(t, 0.032, 7500, 0.075);
        break;
    }
  }

  function pump() {
    if (!ctx || !on) return;
    const until = ctx.currentTime + LOOKAHEAD;
    // Guard the loop rather than trusting the cursor: a tab that was
    // backgrounded comes back with minutes of song to skip, and this walks
    // through it rather than firing all of it at once.
    for (let guard = 0; guard < 2048; guard++) {
      if (cursor >= events.length) {
        origin += TOTAL_BEATS * spb;
        cursor = 0;
      }
      const e = events[cursor];
      const t = origin + e.at * spb;
      if (t > until) break;
      // Only sound it if it has not already gone by.
      if (t >= ctx.currentTime - 0.05) fire(e, t);
      cursor++;
    }
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === "suspended") void c.resume();
    },
    playing: () => on,
    toggle() {
      const c = ensure();
      if (!c) return false;
      if (c.state === "suspended") void c.resume();
      if (on) {
        this.stop();
        return false;
      }
      on = true;
      cursor = 0;
      // A beat of lead-in, so the first downbeat is not clipped by the
      // scheduler starting mid-lookahead.
      origin = c.currentTime + 0.12;
      if (master) {
        master.gain.cancelScheduledValues(c.currentTime);
        master.gain.setValueAtTime(0.0001, c.currentTime);
        master.gain.linearRampToValueAtTime(volume, c.currentTime + 0.05);
      }
      // The switch clunking on. Sells it as a physical radio rather than as
      // music that simply began.
      burst(c.currentTime, 0.05, 900, 0.5);
      pump();
      timer = window.setInterval(pump, TICK);
      return true;
    },
    stop() {
      on = false;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      if (ctx && master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0.0001, t + 0.07);
      }
    },
    beat() {
      if (!ctx || !on) return -1;
      return (ctx.currentTime - origin) / spb;
    },
    level() {
      if (!analyser || !scope || !on) return 0;
      analyser.getByteTimeDomainData(scope);
      let sum = 0;
      for (let i = 0; i < scope.length; i++) {
        const v = (scope[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / scope.length) * 3.2);
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (on && ctx && master) {
        master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
      }
    },
    setPan(p) {
      if (panner && ctx) {
        panner.pan.setTargetAtTime(
          Math.max(-1, Math.min(1, p)),
          ctx.currentTime,
          0.05,
        );
      }
    },
    dispose() {
      this.stop();
      void ctx?.close();
      ctx = null;
    },
  };
}

export function useRadio(): Radio {
  const radio = useMemo(() => build(), []);
  useEffect(() => () => radio.dispose(), [radio]);
  return radio;
}
