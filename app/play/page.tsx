"use client";

/**
 * A goose you can walk around a village green.
 */

import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";

import Environment from "@/components/three/environment";
import GooseActor from "@/components/three/goose/goose-actor";
import NodeGraphView from "@/components/three/node-graph-view";
import RunTuner from "@/components/three/run-tuner";
import WaterTuner from "@/components/three/water-tuner";
import BoneOverlay from "@/components/three/bone-overlay";
import {
  RUN_DEFAULTS,
  WATER_DEFAULTS,
  type RunTuning,
  type WaterTuning,
} from "@/components/three/goose/goose-actor";
import type { Collider } from "@/components/three/environment";
import Pushables, {
  type Body,
  type Pushable,
} from "@/components/three/pushables";
import Lyrics from "@/components/three/rickroll/lyrics";
import NotePuffs from "@/components/three/rickroll/note-puffs";
import { useRadio, type Radio } from "@/components/three/rickroll/use-radio";
import HonkLines, {
  HONK_DEFAULTS,
  type HonkTuning,
} from "@/components/three/honk-lines";
import HonkTuner from "@/components/three/honk-tuner";
import GrabRing from "@/components/three/grab-ring";
import type { GraphNode } from "blender-to-threejs";

/** Where the camera sits relative to the goose. Fixed angle, like the game. */
/**
 * Fixed orientation, high three-quarter view — the game's camera never orbits
 * with the goose, it holds one angle and tracks.
 */
const CAM_OFFSET = new THREE.Vector3(0, 3.4, 3.2);

function FollowCamera({
  subject,
}: {
  subject: React.RefObject<THREE.Vector3>;
}) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const want = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const p = subject.current;
    if (!p) return;
    // Lagged follow. Snapping the camera to the goose makes the world appear to
    // slide around a stationary bird, which is far more disorienting than the
    // slight trail you get from easing.
    want.current.copy(p).add(CAM_OFFSET);
    camera.position.lerp(want.current, Math.min(1, 3.2 * delta));
    look.current.lerp(p, Math.min(1, 4.5 * delta));
    camera.lookAt(look.current.x, look.current.y + 0.45, look.current.z);
  });
  return null;
}

/** Soft shadow under the goose. Flat colour reads as a sticker without one. */
function GooseShadow({ subject }: { subject: React.RefObject<THREE.Vector3> }) {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const S = 96;
    const data = new Uint8Array(S * S * 4);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const dx = (i / (S - 1)) * 2 - 1;
        const dy = (j / (S - 1)) * 2 - 1;
        const a = Math.pow(1 - Math.min(1, Math.hypot(dx, dy)), 2.2);
        const k = (j * S + i) * 4;
        data[k] = 40;
        data[k + 1] = 52;
        data[k + 2] = 30;
        data[k + 3] = Math.round(a * 130);
      }
    }
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }, []);

  useFrame(() => {
    const p = subject.current;
    if (ref.current && p) ref.current.position.set(p.x, 0.012, p.z);
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[1.1, 1.1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/** A ring that pulses where you clicked, so the command is visible. */
function MoveMarker({ at }: { at: THREE.Vector3 | null }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, delta) => {
    if (!ref.current || !at) return;
    t.current += delta;
    const s = 0.45 + Math.sin(t.current * 5) * 0.06;
    ref.current.scale.set(s, s, s);
  });
  if (!at) return null;
  return (
    <mesh
      ref={ref}
      position={[at.x, 0.02, at.z]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[0.5, 0.72, 28]} />
      <meshBasicMaterial
        color="#2f2c28"
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Scattered where the goose will run into them on the way to anywhere. */
/**
 * Crates to shove, and small props to steal.
 *
 * The size split is the mechanic: anything under GRAB_MAX is small enough to
 * carry in the bill, and everything above it can only be pushed. A crate held
 * up at head height is 0.7 across against a 1.3 goose — it fills the camera
 * and hides the bird entirely, which is the whole subject.
 */
const CRATES: Pushable[] = [
  { position: [2.4, 0.35, -2.2], size: 0.35, rotation: 0.4 },
  { position: [3.3, 0.35, -3.1], size: 0.35, rotation: -0.2 },
  { position: [-4.5, 0.35, 2.6], size: 0.35, rotation: -0.6 },
  {
    position: [-1.6, 0.28, 4.2],
    size: 0.28,
    rotation: 0.15,
    color: [0.8, 0.72, 0.42],
  },
  {
    position: [5.2, 0.3, 1.4],
    size: 0.3,
    rotation: -0.9,
    color: [0.74, 0.4, 0.34],
  },
  // Steal-ables. Small enough to carry in the bill.
  { position: [1.1, 0.09, 1.4], size: 0.09, color: [0.86, 0.28, 0.24] },
  { position: [-2.2, 0.08, -1.1], size: 0.08, color: [0.95, 0.84, 0.32] },
  {
    position: [0.4, 0.1, 3.1],
    size: 0.1,
    rotation: 0.6,
    color: [0.28, 0.4, 0.72],
  },
  { position: [-3.4, 0.085, -3.6], size: 0.085, color: [0.2, 0.2, 0.22] },
  // Steal-able like the rest of them, and it plays something.
  { position: [-1.5, 0.14, -2.6], size: 0.14, rotation: 0.5, kind: "radio" },
];

/** Which of the props above is the radio. */
const RADIO = CRATES.findIndex((c) => c.kind === "radio");
/** How close the bill has to be for a honk to reach the switch. */
const RADIO_REACH = 1.15;
/** Distances over which the radio fades from full volume to silence. */
const HEARD_NEAR = 1.2;
const HEARD_FAR = 11;

/**
 * Everything the radio needs to know each frame, and everything that needs to
 * know about the radio.
 *
 * One component so it is one `useFrame`: the speaker's world position, the
 * distance fade, the stereo placement, the cone's loudness and how hard the
 * goose is nodding are all the same three numbers read off the same body.
 */
function RadioDriver({
  radio,
  bodies,
  goose,
  speaker: speakerRef,
  level: levelRef,
  on: onRef,
  grooveAmount: grooveAmountRef,
  grooveBeat: grooveBeatRef,
}: {
  radio: Radio;
  bodies: React.RefObject<Body[]>;
  goose: React.RefObject<THREE.Vector3>;
  speaker: React.RefObject<THREE.Vector3>;
  level: React.RefObject<number>;
  on: React.RefObject<boolean>;
  grooveAmount: React.RefObject<number>;
  grooveBeat: React.RefObject<number>;
}) {
  const { camera } = useThree();
  const ndc = useMemo(() => new THREE.Vector3(), []);
  // Audio params are a scheduled timeline, not a variable. Writing one every
  // frame piles up automation events for changes nobody can hear.
  const last = useRef({ vol: -1, pan: -2 });

  useFrame(() => {
    const b = bodies.current?.[RADIO];
    if (!b) return;
    const playing = radio.playing();
    speakerRef.current.set(b.pos.x, b.pos.y + b.size * 1.1, b.pos.z);
    onRef.current = playing;
    levelRef.current = radio.level();

    const g = goose.current;
    const d = Math.hypot(b.pos.x - g.x, b.pos.z - g.z);
    const near = THREE.MathUtils.clamp(
      1 - (d - HEARD_NEAR) / (HEARD_FAR - HEARD_NEAR),
      0,
      1,
    );
    // Squared, because linear falloff reads as the radio staying loud right up
    // until it snaps off.
    const vol = near * near;
    if (Math.abs(vol - last.current.vol) > 0.01) {
      radio.setVolume(vol);
      last.current.vol = vol;
    }

    ndc.copy(speakerRef.current).project(camera);
    const pan = THREE.MathUtils.clamp(ndc.x, -1, 1) * 0.7;
    if (Math.abs(pan - last.current.pan) > 0.02) {
      radio.setPan(pan);
      last.current.pan = pan;
    }

    grooveAmountRef.current = playing ? near : 0;
    grooveBeatRef.current = radio.beat();
  });
  return null;
}

function RenderProbe() {
  const { gl, scene } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__gl = gl;
    (window as unknown as Record<string, unknown>).__scene = scene;
  }, [gl, scene]);
  return null;
}

function Scene({
  radio,
  onGraph,
  tuning,
  honk: honkTuning,
  water,
  onWater,
  onPose,
  onGrab,
  showBones,
}: {
  radio: Radio;
  onGrab: (holding: boolean) => void;
  showBones: boolean;
  onGraph: (g: GraphNode) => void;
  tuning: RunTuning;
  honk: HonkTuning;
  water: WaterTuning;
  onWater: (v: { waterline: number; swim: number }) => void;
  onPose: (p: {
    beak: number;
    ahead: number;
    above: number;
    clamped: string[];
    drag: number;
  }) => void;
}) {
  const [target, setTarget] = useState<THREE.Vector3 | null>(null);
  const [honk, setHonk] = useState(false);
  const pos = useRef(new THREE.Vector3());
  const boneMap = useRef<Record<string, THREE.Object3D | undefined> | null>(
    null,
  );
  // Shared between the crates (which write it) and the goose (which is blocked
  // by it), so pushing and colliding always agree about where a crate is.
  const crateColliders = useRef<Collider[]>([]);
  // Shared bill position and what it is holding, so the crates can follow it.
  const beakPos = useRef(new THREE.Vector3());
  const grabbed = useRef<number | null>(null);
  const beakYaw = useRef(0);
  const beakDir = useRef(new THREE.Vector3(0, 0, 1));
  const beakMouth = useRef(new THREE.Vector3());
  // What E would pick up right now, or has:false when nothing is in reach.
  const grabHint = useRef({ has: false, x: 0, y: 0, z: 0 });
  // Live prop bodies, so the radio can be followed while it is being carried.
  const bodies = useRef<Body[]>([]);
  const speaker = useRef(new THREE.Vector3());
  const radioLevel = useRef(0);
  const radioOn = useRef(false);
  // One ref per number rather than one ref holding an object: writing
  // `ref.current = x` on a prop is fine, mutating a field of the object it
  // holds is not.
  const grooveAmount = useRef(0);
  const grooveBeat = useRef(-1);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyH") return;
      e.preventDefault();
      /**
       * A keypress is a user gesture, which is the only place an AudioContext
       * may be created. Doing it here rather than lazily in the frame loop is
       * the difference between the radio working and it silently staying
       * suspended forever.
       */
      radio.unlock();
      // Honk AT the radio to work the switch. The goose has one verb and this
      // is it; there is no separate "use" button to discover.
      const b = bodies.current?.[RADIO];
      if (b) {
        const d = Math.hypot(b.pos.x - pos.current.x, b.pos.z - pos.current.z);
        if (d < RADIO_REACH) radio.toggle();
      }
      setHonk(true);
      // How long the mouth is held OPEN. The game's honk is a bark, not a
      // note: 260ms read as sustaining it, 130ms still read as holding it.
      window.setTimeout(() => setHonk(false), 70);
    };
    window.addEventListener("keydown", down, { passive: false });
    return () => window.removeEventListener("keydown", down);
  }, [radio]);

  const onGroundClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setTarget(new THREE.Vector3(e.point.x, 0, e.point.z));
  }, []);

  const heading = useRef(0);
  const onMove = useCallback((p: THREE.Vector3, h: number) => {
    pos.current.copy(p);
    heading.current = h;
  }, []);

  // Dev-only handle so the controls can be TESTED by reading state rather than
  // by squinting at screenshots — which is how the last four bugs were found.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__play = {
      pos: pos.current,
      getHeading: () => heading.current,
      getTarget: () => target,
    };
  }, [target]);

  return (
    <>
      <Environment />
      {/* Invisible catcher so a click anywhere on the ground plane registers,
          including past the edge of the lawn mesh. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        onClick={onGroundClick}
      >
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <MoveMarker at={target} />
      <GooseShadow subject={pos} />
      <Pushables
        items={CRATES}
        goose={pos}
        colliders={crateColliders}
        grabbed={grabbed}
        beak={beakPos}
        beakYaw={beakYaw}
        bodies={bodies}
        radioLevel={radioLevel}
        radioOn={radioOn}
      />

      <Suspense fallback={null}>
        <GooseActor
          target={target}
          honk={honk}
          onArrive={() => setTarget(null)}
          onMove={onMove}
          onGraph={onGraph}
          onBones={(b) => {
            boneMap.current = b;
          }}
          tuning={tuning}
          water={water}
          onWater={onWater}
          onBeakAngle={(beak, ahead, above, clamped, drag) =>
            onPose({ beak, ahead, above, clamped, drag })
          }
          crates={crateColliders}
          beak={beakPos}
          beakYaw={beakYaw}
          beakDir={beakDir}
          beakMouth={beakMouth}
          grabHint={grabHint}
          grabbed={grabbed}
          onGrab={onGrab}
        />
      </Suspense>

      {/* Outside the Suspense boundary: the strokes are procedural geometry and
          have nothing to wait for, and the bill refs they read are written by
          the actor above whether or not its model has landed yet. */}
      <HonkLines
        mouth={beakMouth}
        dir={beakDir}
        honk={honk}
        tuning={honkTuning}
      />

      <GrabRing hint={grabHint} />

      <RadioDriver
        radio={radio}
        bodies={bodies}
        goose={pos}
        speaker={speaker}
        level={radioLevel}
        on={radioOn}
        grooveAmount={grooveAmount}
        grooveBeat={grooveBeat}
      />
      <NotePuffs from={speaker} beat={radio.beat} active={radioOn} />

      <BoneOverlay bones={boneMap} show={showBones} />
      <FollowCamera subject={pos} />
      <RenderProbe />
    </>
  );
}

export default function PlayPage() {
  const radio = useRadio();
  // The graph the goose's material was compiled from, handed back by the actor.
  const [graph, setGraph] = useState<GraphNode | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [holding, setHolding] = useState(false);
  const [showBones, setShowBones] = useState(false);
  // Run head tilt, live-adjustable. The readout is the beak's ACTUAL angle
  // rather than the coefficient, because the coefficient is meaningless on its
  // own — the head inherits the whole neck before this term is applied, so the
  // same number means different things walking and running.
  const [tuning, setTuning] = useState<RunTuning>(RUN_DEFAULTS);
  const [honkTuning, setHonkTuning] = useState<HonkTuning>(HONK_DEFAULTS);
  const [water, setWater] = useState<WaterTuning>(WATER_DEFAULTS);
  const [wet, setWet] = useState({ waterline: 0, swim: 0 });
  const [pose, setPose] = useState<{
    beak: number;
    ahead: number;
    above: number;
    clamped: string[];
    drag: number;
  }>({ beak: 0, ahead: 0, above: 0, clamped: [], drag: 0 });

  return (
    <div className="w-full h-screen bg-[#cfe3ef] relative select-none">
      <Canvas
        camera={{ position: [0, 5, 8], fov: 42 }}
        /**
         * Cap the device pixel ratio.
         */
        dpr={[1, 1.5]}
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            canvas: props.canvas as HTMLCanvasElement,
            antialias: true,
          });
          await renderer.init();
          return renderer as unknown as never;
        }}
      >
        <Scene
          radio={radio}
          onGraph={setGraph}
          tuning={tuning}
          honk={honkTuning}
          water={water}
          onWater={setWet}
          onPose={setPose}
          onGrab={setHolding}
          showBones={showBones}
        />
      </Canvas>

      <div className="absolute top-24 left-6 font-mono text-[11px] text-neutral-700 bg-white/70 rounded px-3 py-2 leading-relaxed">
        <div>
          <b>WASD</b> — walk
        </div>
        <div>
          <b>click</b> the grass — go there
        </div>
        <div>
          <b>shift</b> — run
        </div>
        <div>
          <b>C</b> — sneak, walking or still
        </div>
        <div>
          <b>space</b> — jump
        </div>
        <div>
          <b>H</b> — honk
        </div>
        <div>
          <b>E</b> — {holding ? "drop it" : "grab what the rings mark"}
        </div>
        <div className="text-neutral-500 mt-1">
          walk into the crates &middot; only small things fit in a bill
          &middot; honk at the radio
        </div>
        <RunTuner
          value={tuning}
          onChange={setTuning}
          beakAngle={pose.beak}
          headAhead={pose.ahead}
          headAbove={pose.above}
          clamped={pose.clamped}
          drag={pose.drag}
          showBones={showBones}
          onShowBones={setShowBones}
          onReset={() => setTuning(RUN_DEFAULTS)}
        />
        <HonkTuner
          value={honkTuning}
          onChange={setHonkTuning}
          onReset={() => setHonkTuning(HONK_DEFAULTS)}
        />
        <WaterTuner
          value={water}
          onChange={setWater}
          waterline={wet.waterline}
          swim={wet.swim}
          onReset={() => setWater(WATER_DEFAULTS)}
        />
        <button
          type="button"
          onClick={() => setShowGraph((v) => !v)}
          className="mt-2 underline underline-offset-2 hover:text-neutral-900"
        >
          {showGraph ? "hide" : "show"} shader graph
        </button>
      </div>

      {showGraph && graph && (
        <div className="absolute top-24 right-6 max-h-[70vh] w-[min(44vw,700px)] overflow-auto rounded-lg bg-[#1d1d1d] p-2 shadow-xl">
          <div className="font-mono text-[10px] text-neutral-400 px-2 pb-2">
            the graph compiled onto the goose&rsquo;s body material — not a
            diagram of it
          </div>
          <NodeGraphView root={graph} />
        </div>
      )}

      <Lyrics beat={radio.beat} />

      <div className="absolute bottom-5 left-6 font-mono text-[11px] text-neutral-700">
        lawn + path shaded through the node system · model by stickbone (CC-BY)
      </div>
    </div>
  );
}
