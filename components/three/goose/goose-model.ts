/**
 * A low-poly goose, generated rather than authored — mesh, skeleton and skin
 * weights, all built from one profile table.
 */
import * as THREE from "three";

type RGB = [number, number, number];

const WHITE: RGB = [0.94, 0.935, 0.91];
const ORANGE: RGB = [0.95, 0.52, 0.1];
const DARK: RGB = [0.06, 0.055, 0.06];

/** How many sides each cross-section ring has. Low enough to read as faceted. */
const RING_SEGMENTS = 10;

interface Station {
  /** Centre of the cross-section, in the YZ plane (the chain never leaves x=0). */
  z: number;
  y: number;
  /** Base radius before the width/height scales below. */
  r: number;
  /** Lateral scale — >1 widens, used to flatten the beak out sideways. */
  w?: number;
  /** Vertical scale — <1 squashes, also for the beak. */
  h?: number;
  /** Naming this station as a bone anchor puts a joint here. */
  bone?: string;
  color?: RGB;
}

/**
 * The goose, tail tip to beak tip. Every station is a ring; every `bone` is a
 * joint. Edit these numbers to change the animal — nothing else encodes shape.
 */
const CHAIN: Station[] = [
  // Tail cocks upward — without the lift the rear just tapers and the
  // silhouette loses the kick that separates a goose from a blob.
  { z: -0.56, y: 0.52, r: 0.04, bone: "tail" },
  { z: -0.48, y: 0.482, r: 0.115 },
  { z: -0.37, y: 0.45, r: 0.19, w: 0.95, bone: "hips" },
  { z: -0.21, y: 0.434, r: 0.252, w: 0.95 },
  // Plumpest point. Depth is tuned against LENGTH, not in isolation — at much
  // over 0.7 of the body length the torso stops being egg-shaped and turns into
  // a ball, which reads as a duckling no matter how good the head is.
  { z: -0.04, y: 0.43, r: 0.275, w: 0.95, bone: "spine" },
  { z: 0.115, y: 0.448, r: 0.258, w: 0.95 },
  { z: 0.235, y: 0.492, r: 0.198, w: 0.96, bone: "chest" },
  // Neck. Thick at the base and barely tapering — a neck that narrows toward
  // the head reads as a swan. The gentle back-then-forward lean is the S-curve.
  // Length matters as much as width: too short and the head sits straight on
  // the shoulders with no neck to speak of.
  { z: 0.285, y: 0.565, r: 0.145, bone: "neck1" },
  { z: 0.298, y: 0.65, r: 0.128 },
  { z: 0.298, y: 0.735, r: 0.12, bone: "neck2" },
  { z: 0.294, y: 0.818, r: 0.116 },
  { z: 0.296, y: 0.898, r: 0.117, bone: "neck3" },
  { z: 0.308, y: 0.968, r: 0.124 },
  { z: 0.328, y: 1.026, r: 0.135, bone: "neck4" },
  // Head: a distinctly rounder, wider mass than the neck it sits on. When the
  // head is only slightly wider than the neck the whole animal reads as a tube.
  { z: 0.354, y: 1.07, r: 0.148 },
  { z: 0.394, y: 1.096, r: 0.156, w: 1.02, bone: "head" },
  { z: 0.444, y: 1.092, r: 0.148 },
  { z: 0.49, y: 1.074, r: 0.122, h: 0.92 },
  // Beak: short, broad and blunt. Length is a touch under one head-radius —
  // stretch it much past that and it stops being a goose bill and becomes a
  // duck's. Width and flatness come from the w/h scales, not new geometry.
  {
    z: 0.518,
    y: 1.052,
    r: 0.094,
    w: 1.2,
    h: 0.72,
    bone: "beak",
    color: ORANGE,
  },
  { z: 0.568, y: 1.046, r: 0.082, w: 1.42, h: 0.6, color: ORANGE },
  { z: 0.616, y: 1.042, r: 0.069, w: 1.38, h: 0.52, color: ORANGE },
  // Blunt tip, not a needle. Held near-level: a bill that noses downward more
  // than a few degrees reads as a duck dabbling rather than a goose looking at
  // you. No pale "nail" colour here — vertex colours interpolate across the
  // whole segment, so it smeared into a wash instead of reading as a tip.
  { z: 0.648, y: 1.04, r: 0.038, w: 1.2, h: 0.46, color: ORANGE },
];

/** Chain bones in the order they appear along the loft. */
const CHAIN_BONES = CHAIN.flatMap((s, i) =>
  s.bone ? [{ name: s.bone, station: i }] : [],
);

/** Half the stance width. Wider than a duck's — it's what makes it waddle. */
const LEG_X = 0.125;
/**
 * How far back the legs sit. A goose carries its legs well behind the midpoint
 * of the body, which is exactly why it walks with that upright, tipping gait;
 * put them under the chest and the whole animal reads as a duck.
 */
const LEG_Z = -0.08;

/** Accumulates every piece into one set of buffers, so the goose is one draw. */
class MeshBuilder {
  readonly position: number[] = [];
  readonly color: number[] = [];
  readonly skinIndex: number[] = [];
  readonly skinWeight: number[] = [];
  readonly index: number[] = [];

  get vertexCount(): number {
    return this.position.length / 3;
  }

  vertex(
    p: THREE.Vector3,
    c: RGB,
    bones: [number, number],
    weights: [number, number],
  ): number {
    const i = this.vertexCount;
    this.position.push(p.x, p.y, p.z);
    this.color.push(c[0], c[1], c[2]);
    this.skinIndex.push(bones[0], bones[1], 0, 0);
    this.skinWeight.push(weights[0], weights[1], 0, 0);
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.index.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.index.push(a, b, c, a, c, d);
  }
}

/**
 * Blend between the two bone anchors bracketing a station, by arc length along
 * the chain. Linear blend skinning with two influences is all a tube needs, and
 * it keeps the neck bending as a smooth curve rather than a set of hinges.
 */
function chainWeights(
  station: number,
  arc: number[],
  boneIndex: Record<string, number>,
): { bones: [number, number]; weights: [number, number] } {
  const first = CHAIN_BONES[0];
  const last = CHAIN_BONES[CHAIN_BONES.length - 1];
  if (station <= first.station) {
    const b = boneIndex[first.name];
    return { bones: [b, b], weights: [1, 0] };
  }
  if (station >= last.station) {
    const b = boneIndex[last.name];
    return { bones: [b, b], weights: [1, 0] };
  }
  for (let k = 0; k < CHAIN_BONES.length - 1; k++) {
    const a = CHAIN_BONES[k];
    const b = CHAIN_BONES[k + 1];
    if (station >= a.station && station <= b.station) {
      const span = arc[b.station] - arc[a.station];
      const t = span > 0 ? (arc[station] - arc[a.station]) / span : 0;
      return {
        bones: [boneIndex[a.name], boneIndex[b.name]],
        weights: [1 - t, t],
      };
    }
  }
  const b = boneIndex[last.name];
  return { bones: [b, b], weights: [1, 0] };
}

/**
 * Frame for a cross-section. The chain lies in the YZ plane, so the lateral
 * axis is always world X — which sidesteps the usual sweep problem where a
 * up-vector-derived frame degenerates as the curve turns vertical. The goose's
 * neck IS vertical, so a naive frame would flip exactly there.
 */
function ringFrame(i: number): { centre: THREE.Vector3; up: THREE.Vector3 } {
  const prev = CHAIN[Math.max(0, i - 1)];
  const next = CHAIN[Math.min(CHAIN.length - 1, i + 1)];
  const tangent = new THREE.Vector3(
    0,
    next.y - prev.y,
    next.z - prev.z,
  ).normalize();
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
  return { centre: new THREE.Vector3(0, CHAIN[i].y, CHAIN[i].z), up };
}

function buildChain(
  mb: MeshBuilder,
  arc: number[],
  boneIndex: Record<string, number>,
): void {
  const right = new THREE.Vector3(1, 0, 0);
  const rings: number[][] = [];

  for (let i = 0; i < CHAIN.length; i++) {
    const s = CHAIN[i];
    const { centre, up } = ringFrame(i);
    const { bones, weights } = chainWeights(i, arc, boneIndex);
    const ring: number[] = [];
    for (let j = 0; j < RING_SEGMENTS; j++) {
      const theta = (j / RING_SEGMENTS) * Math.PI * 2;
      const p = centre
        .clone()
        .addScaledVector(right, Math.cos(theta) * s.r * (s.w ?? 1))
        .addScaledVector(up, Math.sin(theta) * s.r * (s.h ?? 1));
      ring.push(mb.vertex(p, s.color ?? WHITE, bones, weights));
    }
    rings.push(ring);
  }

  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < RING_SEGMENTS; j++) {
      const k = (j + 1) % RING_SEGMENTS;
      mb.quad(rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]);
    }
  }

  // Fan-cap both ends so the goose is closed.
  for (const [i, flip] of [
    [0, true],
    [CHAIN.length - 1, false],
  ] as const) {
    const s = CHAIN[i];
    const { centre } = ringFrame(i);
    const { bones, weights } = chainWeights(i, arc, boneIndex);
    const hub = mb.vertex(centre, s.color ?? WHITE, bones, weights);
    for (let j = 0; j < RING_SEGMENTS; j++) {
      const k = (j + 1) % RING_SEGMENTS;
      if (flip) mb.tri(hub, rings[i][k], rings[i][j]);
      else mb.tri(hub, rings[i][j], rings[i][k]);
    }
  }
}

/** A tapered tube between explicit points — legs. Rigid-weighted per section. */
function buildTube(
  mb: MeshBuilder,
  points: THREE.Vector3[],
  radii: number[],
  bones: number[],
  color: RGB,
  segments = 6,
): void {
  const rings: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(prev).normalize();
    // Legs are near-vertical, so pick a reference that is never parallel.
    const ref =
      Math.abs(tangent.z) < 0.9
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(tangent, ref).normalize();
    const v = new THREE.Vector3().crossVectors(tangent, u).normalize();
    const ring: number[] = [];
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const p = points[i]
        .clone()
        .addScaledVector(u, Math.cos(theta) * radii[i])
        .addScaledVector(v, Math.sin(theta) * radii[i]);
      ring.push(mb.vertex(p, color, [bones[i], bones[i]], [1, 0]));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments;
      mb.quad(rings[i][j], rings[i + 1][j], rings[i + 1][k], rings[i][k]);
    }
  }
}

/** Flat webbed foot — an outline with a little thickness, three toes. */
function buildFoot(mb: MeshBuilder, side: number, bone: number): void {
  const x = LEG_X * side;
  const yTop = 0.034;
  const yBot = 0.006;
  // Broad paddle with shallow notches. Deep notches read as three separate
  // spindly toes; a goose foot is mostly web.
  const outline: [number, number][] = [
    [x, LEG_Z - 0.032],
    [x - 0.07 * side, LEG_Z + 0.03],
    [x - 0.076 * side, LEG_Z + 0.104],
    [x - 0.032 * side, LEG_Z + 0.09],
    [x, LEG_Z + 0.132],
    [x + 0.032 * side, LEG_Z + 0.09],
    [x + 0.076 * side, LEG_Z + 0.104],
    [x + 0.07 * side, LEG_Z + 0.03],
  ];
  const top: number[] = [];
  const bottom: number[] = [];
  for (const [px, pz] of outline) {
    top.push(
      mb.vertex(new THREE.Vector3(px, yTop, pz), ORANGE, [bone, bone], [1, 0]),
    );
    bottom.push(
      mb.vertex(new THREE.Vector3(px, yBot, pz), ORANGE, [bone, bone], [1, 0]),
    );
  }
  // The fan hub has to sit INSIDE the outline. Anchored to LEG_Z rather than a
  // fixed z, because a hub that drifts onto the outline's edge makes the fan
  // triangles fold back over each other — which renders as a crumpled foot,
  // not as anything that looks like a bug in the geometry.
  const hubZ = LEG_Z + 0.035;
  const hubTop = mb.vertex(
    new THREE.Vector3(x, yTop, hubZ),
    ORANGE,
    [bone, bone],
    [1, 0],
  );
  const hubBot = mb.vertex(
    new THREE.Vector3(x, yBot, hubZ),
    ORANGE,
    [bone, bone],
    [1, 0],
  );
  const n = outline.length;
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    mb.tri(hubTop, top[j], top[k]);
    mb.tri(hubBot, bottom[k], bottom[j]);
    mb.quad(top[k], bottom[k], bottom[j], top[j]);
  }
}

/**
 * Half-width of the body at a point on the flank.
 */
function bodySurfaceX(z: number, y: number): number {
  const BODY_END = 6;
  for (let i = 0; i < BODY_END; i++) {
    const a = CHAIN[i];
    const b = CHAIN[i + 1];
    if (z < a.z || z > b.z) continue;
    const t = (z - a.z) / (b.z - a.z);
    const r = a.r + (b.r - a.r) * t;
    const cy = a.y + (b.y - a.y) * t;
    const rw = r * (a.w ?? 1);
    const rh = r * (a.h ?? 1);
    // Body stations run near-horizontal, so the ring's "up" is close enough to
    // world Y to treat the cross-section as an axis-aligned ellipse.
    const k = 1 - ((y - cy) / rh) ** 2;
    return k > 0 ? rw * Math.sqrt(k) : 0;
  }
  return 0;
}

/** A lens-shaped wing folded against the flank. */
function buildWing(mb: MeshBuilder, side: number, bone: number): void {
  const outline: [number, number][] = [
    [0.15, 0.575],
    [0.04, 0.625],
    [-0.105, 0.612],
    [-0.25, 0.552],
    [-0.32, 0.488],
    [-0.21, 0.452],
    [-0.055, 0.448],
    [0.098, 0.482],
  ];
  // Just proud of the flank. Pushed out much further it stops reading as a
  // folded wing and becomes a plate bolted to the side of the bird.
  const rim = outline.map(([z, y]) =>
    mb.vertex(
      new THREE.Vector3((bodySurfaceX(z, y) + 0.005) * side, y, z),
      WHITE,
      [bone, bone],
      [1, 0],
    ),
  );
  const hubZ = -0.06;
  const hubY = 0.535;
  const flank = bodySurfaceX(hubZ, hubY);
  const outer = mb.vertex(
    new THREE.Vector3((flank + 0.022) * side, hubY, hubZ),
    WHITE,
    [bone, bone],
    [1, 0],
  );
  const inner = mb.vertex(
    new THREE.Vector3((flank - 0.012) * side, hubY, hubZ),
    WHITE,
    [bone, bone],
    [1, 0],
  );
  const n = outline.length;
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    // The outline runs clockwise on screen as seen from +X, so the outer fan
    // takes the reversed order to face outward — and mirrors for the far side.
    if (side > 0) {
      mb.tri(outer, rim[k], rim[j]);
      mb.tri(inner, rim[j], rim[k]);
    } else {
      mb.tri(outer, rim[j], rim[k]);
      mb.tri(inner, rim[k], rim[j]);
    }
  }
}

function buildEye(mb: MeshBuilder, side: number, bone: number): void {
  // Sits proud of the skull by ~0.02. Set flush and the sphere is swallowed by
  // the head, leaving a dark speck that reads as a blemish rather than an eye.
  // Small and set high — a big eye turns a goose into a cartoon duckling.
  const centre = new THREE.Vector3(0.144 * side, 1.128, 0.437);
  const radius = 0.026;
  const rows = 5;
  const cols = 8;
  const grid: number[][] = [];
  for (let a = 0; a <= rows; a++) {
    const phi = (a / rows) * Math.PI;
    const row: number[] = [];
    for (let b = 0; b < cols; b++) {
      const theta = (b / cols) * Math.PI * 2;
      const p = new THREE.Vector3(
        centre.x + radius * Math.sin(phi) * Math.cos(theta),
        centre.y + radius * Math.cos(phi),
        centre.z + radius * Math.sin(phi) * Math.sin(theta),
      );
      row.push(mb.vertex(p, DARK, [bone, bone], [1, 0]));
    }
    grid.push(row);
  }
  for (let a = 0; a < rows; a++) {
    for (let b = 0; b < cols; b++) {
      const c = (b + 1) % cols;
      // Wound so the faces point out. The other order builds the sphere
      // inside-out, and backface culling then shows its far interior — which
      // reads as a thin dark ring rather than an obviously missing eye.
      mb.quad(grid[a][b], grid[a][c], grid[a + 1][c], grid[a + 1][b]);
    }
  }
}

export interface Goose {
  mesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  root: THREE.Bone;
  /** Neck chain, base to head — the look-at solver walks this in order. */
  neckChain: THREE.Bone[];
}

/**
 * Build the goose. The caller supplies the material so the shading path stays
 * the app's business, not the model's.
 */
export function createGoose(material: THREE.Material): Goose {
  // --- skeleton, in rest pose --------------------------------------------
  const bones: THREE.Bone[] = [];
  const byName: Record<string, THREE.Bone> = {};
  const boneIndex: Record<string, number> = {};
  const worldPos: Record<string, THREE.Vector3> = {};

  const addBone = (
    name: string,
    world: THREE.Vector3,
    parent?: string,
  ): THREE.Bone => {
    const bone = new THREE.Bone();
    bone.name = name;
    const origin = parent ? worldPos[parent] : new THREE.Vector3();
    bone.position.copy(world.clone().sub(origin));
    if (parent) byName[parent].add(bone);
    byName[name] = bone;
    worldPos[name] = world.clone();
    boneIndex[name] = bones.length;
    bones.push(bone);
    return bone;
  };

  const stationPos = (name: string): THREE.Vector3 => {
    const entry = CHAIN_BONES.find((b) => b.name === name)!;
    const s = CHAIN[entry.station];
    return new THREE.Vector3(0, s.y, s.z);
  };

  const root = addBone("root", new THREE.Vector3(0, 0, 0));
  addBone("hips", stationPos("hips"), "root");
  addBone("tail", stationPos("tail"), "hips");
  addBone("spine", stationPos("spine"), "hips");
  addBone("chest", stationPos("chest"), "spine");
  addBone("neck1", stationPos("neck1"), "chest");
  addBone("neck2", stationPos("neck2"), "neck1");
  addBone("neck3", stationPos("neck3"), "neck2");
  addBone("neck4", stationPos("neck4"), "neck3");
  addBone("head", stationPos("head"), "neck4");
  addBone("beak", stationPos("beak"), "head");
  addBone("wing.L", new THREE.Vector3(0.19, 0.52, 0.05), "chest");
  addBone("wing.R", new THREE.Vector3(-0.19, 0.52, 0.05), "chest");

  for (const [suffix, side] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    addBone(
      `thigh.${suffix}`,
      new THREE.Vector3(LEG_X * side, 0.34, LEG_Z + 0.015),
      "hips",
    );
    addBone(
      `shin.${suffix}`,
      new THREE.Vector3(LEG_X * side, 0.175, LEG_Z),
      `thigh.${suffix}`,
    );
    addBone(
      `foot.${suffix}`,
      new THREE.Vector3(LEG_X * side, 0.03, LEG_Z),
      `shin.${suffix}`,
    );
  }

  // --- geometry ------------------------------------------------------------
  const arc: number[] = [0];
  for (let i = 1; i < CHAIN.length; i++) {
    const a = CHAIN[i - 1];
    const b = CHAIN[i];
    arc.push(arc[i - 1] + Math.hypot(b.y - a.y, b.z - a.z));
  }

  const mb = new MeshBuilder();
  buildChain(mb, arc, boneIndex);

  for (const [suffix, side] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    const thigh = boneIndex[`thigh.${suffix}`];
    const shin = boneIndex[`shin.${suffix}`];
    const foot = boneIndex[`foot.${suffix}`];
    buildTube(
      mb,
      [
        new THREE.Vector3(LEG_X * side, 0.36, LEG_Z + 0.02),
        new THREE.Vector3(LEG_X * side, 0.265, LEG_Z + 0.01),
        new THREE.Vector3(LEG_X * side, 0.17, LEG_Z),
        new THREE.Vector3(LEG_X * side, 0.095, LEG_Z),
        new THREE.Vector3(LEG_X * side, 0.03, LEG_Z),
      ],
      [0.058, 0.053, 0.048, 0.043, 0.039],
      [thigh, thigh, shin, shin, foot],
      ORANGE,
    );
    buildFoot(mb, side, foot);
    buildWing(mb, side, boneIndex[`wing.${suffix}`]);
  }

  buildEye(mb, 1, boneIndex.head);
  buildEye(mb, -1, boneIndex.head);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(mb.position, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(mb.color, 3));
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(mb.skinIndex, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(mb.skinWeight, 4),
  );
  geometry.setIndex(mb.index);
  geometry.computeVertexNormals();

  // --- bind ----------------------------------------------------------------
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(root);
  // Skeleton reads each bone's matrixWorld to derive its inverse bind matrix,
  // so the hierarchy has to be resolved BEFORE the skeleton is constructed.
  // Skip this and the goose binds against identity and renders inside out.
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);

  return {
    mesh,
    skeleton,
    root,
    neckChain: ["neck1", "neck2", "neck3", "neck4", "head"].map(
      (n) => byName[n],
    ),
  };
}

export const GOOSE_HEIGHT = 1.15;
