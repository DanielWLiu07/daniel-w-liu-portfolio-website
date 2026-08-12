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
import {
  RUN_DEFAULTS,
  type RunTuning,
} from "@/components/three/goose/goose-actor";
import type { Collider } from "@/components/three/environment";
import Pushables, { type Pushable } from "@/components/three/pushables";
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
  { position: [0.4, 0.1, 3.1], size: 0.1, rotation: 0.6, color: [0.28, 0.4, 0.72] },
  { position: [-3.4, 0.085, -3.6], size: 0.085, color: [0.2, 0.2, 0.22] },
];

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
  onGraph,
  tuning,
  onPose,
  onGrab,
}: {
  onGrab: (holding: boolean) => void;
  onGraph: (g: GraphNode) => void;
  tuning: RunTuning;
  onPose: (p: {
    beak: number;
    ahead: number;
    above: number;
    clamped: string[];
  }) => void;
}) {
  const [target, setTarget] = useState<THREE.Vector3 | null>(null);
  const [honk, setHonk] = useState(false);
  const pos = useRef(new THREE.Vector3());
  // Shared between the crates (which write it) and the goose (which is blocked
  // by it), so pushing and colliding always agree about where a crate is.
  const crateColliders = useRef<Collider[]>([]);
  // Shared bill position and what it is holding, so the crates can follow it.
  const beakPos = useRef(new THREE.Vector3());
  const grabbed = useRef<number | null>(null);
  const beakYaw = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyH") return;
      e.preventDefault();
      setHonk(true);
      window.setTimeout(() => setHonk(false), 260);
    };
    window.addEventListener("keydown", down, { passive: false });
    return () => window.removeEventListener("keydown", down);
  }, []);

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
      />

      <Suspense fallback={null}>
        <GooseActor
          target={target}
          honk={honk}
          onArrive={() => setTarget(null)}
          onMove={onMove}
          onGraph={onGraph}
          tuning={tuning}
          onBeakAngle={(beak, ahead, above, clamped) =>
            onPose({ beak, ahead, above, clamped })
          }
          crates={crateColliders}
          beak={beakPos}
          beakYaw={beakYaw}
          grabbed={grabbed}
          onGrab={onGrab}
        />
      </Suspense>

      <FollowCamera subject={pos} />
      <RenderProbe />
    </>
  );
}

export default function PlayPage() {
  // The graph the goose's material was compiled from, handed back by the actor.
  const [graph, setGraph] = useState<GraphNode | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [holding, setHolding] = useState(false);
  // Run head tilt, live-adjustable. The readout is the beak's ACTUAL angle
  // rather than the coefficient, because the coefficient is meaningless on its
  // own — the head inherits the whole neck before this term is applied, so the
  // same number means different things walking and running.
  const [tuning, setTuning] = useState<RunTuning>(RUN_DEFAULTS);
  const [pose, setPose] = useState<{
    beak: number;
    ahead: number;
    above: number;
    clamped: string[];
  }>({ beak: 0, ahead: 0, above: 0, clamped: [] });

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
          onGraph={setGraph}
          tuning={tuning}
          onPose={setPose}
          onGrab={setHolding}
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
          <b>space</b> — jump
        </div>
        <div>
          <b>H</b> — honk
        </div>
        <div>
          <b>E</b> — {holding ? 'drop it' : 'grab with your bill'}
        </div>
        <div className="text-neutral-500 mt-1">walk into the crates</div>
        <RunTuner
          value={tuning}
          onChange={setTuning}
          beakAngle={pose.beak}
          headAhead={pose.ahead}
          headAbove={pose.above}
          clamped={pose.clamped}
          onReset={() => setTuning(RUN_DEFAULTS)}
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

      <div className="absolute bottom-5 left-6 font-mono text-[11px] text-neutral-700">
        lawn + path shaded through the node system · model by stickbone (CC-BY)
      </div>
    </div>
  );
}
