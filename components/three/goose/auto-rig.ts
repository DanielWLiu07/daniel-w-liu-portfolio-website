/**
 * Rig an unrigged mesh in the browser.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Position in bounding-box space: x/z are −1..1 across, y is 0..1 bottom-up. */
export interface BoneSpec {
  name: string;
  parent: string | null;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Derived from an actual slice-profile of the mesh rather than invented — the
 * body's widest point, the neck's narrow section and the head all came out of
 * measuring where the vertices are. See documentation/MESHY-AND-RIGGING.md.
 */
export const GOOSE_LAYOUT: BoneSpec[] = [
  { name: "root", parent: null, nx: 0, ny: 0.0, nz: 0.0 },
  { name: "hips", parent: "root", nx: 0, ny: 0.38, nz: -0.24 },
  { name: "tail", parent: "hips", nx: 0, ny: 0.44, nz: -0.62 },
  { name: "spine", parent: "hips", nx: 0, ny: 0.44, nz: -0.06 },
  { name: "chest", parent: "spine", nx: 0, ny: 0.52, nz: 0.12 },
  { name: "neck1", parent: "chest", nx: 0, ny: 0.6, nz: 0.2 },
  { name: "neck2", parent: "neck1", nx: 0, ny: 0.68, nz: 0.24 },
  { name: "neck3", parent: "neck2", nx: 0, ny: 0.75, nz: 0.27 },
  { name: "neck4", parent: "neck3", nx: 0, ny: 0.82, nz: 0.29 },
  { name: "head", parent: "neck4", nx: 0, ny: 0.9, nz: 0.26 },
  { name: "beak", parent: "head", nx: 0, ny: 0.86, nz: 0.55 },
  // Three bones per wing: shoulder, mid, tip. One bone can only swivel the
  // whole wing rigidly — folding needs joints along its length, the same reason
  // the neck gets four.
  { name: "wing.L", parent: "chest", nx: 0.26, ny: 0.5, nz: -0.06 },
  { name: "wing2.L", parent: "wing.L", nx: 0.56, ny: 0.5, nz: -0.1 },
  { name: "wing3.L", parent: "wing2.L", nx: 0.88, ny: 0.49, nz: -0.16 },
  { name: "wing.R", parent: "chest", nx: -0.26, ny: 0.5, nz: -0.06 },
  { name: "wing2.R", parent: "wing.R", nx: -0.56, ny: 0.5, nz: -0.1 },
  { name: "wing3.R", parent: "wing2.R", nx: -0.88, ny: 0.49, nz: -0.16 },
  { name: "thigh.L", parent: "hips", nx: 0.28, ny: 0.28, nz: -0.04 },
  { name: "shin.L", parent: "thigh.L", nx: 0.28, ny: 0.14, nz: 0.0 },
  { name: "foot.L", parent: "shin.L", nx: 0.28, ny: 0.02, nz: 0.1 },
  { name: "thigh.R", parent: "hips", nx: -0.28, ny: 0.28, nz: -0.04 },
  { name: "shin.R", parent: "thigh.R", nx: -0.28, ny: 0.14, nz: 0.0 },
  { name: "foot.R", parent: "shin.R", nx: -0.28, ny: 0.02, nz: 0.1 },
];

/**
 * The Untitled Goose Game silhouette has NO defined wings — they are absorbed
 * into the body, which is why the game's goose reads as one smooth mass. Wing
 * bones on a mesh like that have nothing of their own to move and just drag the
 * flank around, so this layout omits them entirely.
 */
export const GOOSE_LAYOUT_NO_WINGS: BoneSpec[] = GOOSE_LAYOUT.filter(
  (b) => !b.name.startsWith("wing"),
);

export interface Rig {
  bones: THREE.Bone[];
  byName: Record<string, THREE.Bone>;
  root: THREE.Bone;
  /** Rest-pose world position of each bone, for drawing and for re-binding. */
  restWorld: Map<string, THREE.Vector3>;
}

/** Place bones in the mesh's own space from a normalised layout. */
export function buildSkeleton(
  box: THREE.Box3,
  layout: BoneSpec[] = GOOSE_LAYOUT,
): Rig {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const toWorld = (s: BoneSpec) =>
    new THREE.Vector3(
      centre.x + (s.nx * size.x) / 2,
      box.min.y + s.ny * size.y,
      centre.z + (s.nz * size.z) / 2,
    );

  const bones: THREE.Bone[] = [];
  const byName: Record<string, THREE.Bone> = {};
  const restWorld = new Map<string, THREE.Vector3>();

  for (const spec of layout) {
    const bone = new THREE.Bone();
    bone.name = spec.name;
    const world = toWorld(spec);
    restWorld.set(spec.name, world.clone());
    // Rest rotations stay identity — the pointer-tracking and handle-dragging
    // maths both assume bone-local X is pitch and Y is yaw.
    if (spec.parent) {
      byName[spec.parent].add(bone);
      bone.position.copy(world).sub(restWorld.get(spec.parent)!);
    } else {
      bone.position.copy(world);
    }
    byName[spec.name] = bone;
    bones.push(bone);
  }

  return { bones, byName, root: bones[0], restWorld };
}

/** Squared distance from a point to a segment, plus where along it that lands. */
function distanceToSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
): number {
  const ab = b.clone().sub(a);
  const lenSq = ab.lengthSq();
  if (lenSq < 1e-12) return p.distanceTo(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / lenSq, 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

export interface SkinOptions {
  /** How sharply influence falls off with distance. Higher = stiffer. */
  falloff?: number;
  /** Influences kept per vertex. glTF and three both cap at 4. */
  maxInfluences?: number;
}

/**
 * Compute skinIndex/skinWeight for every vertex and write them onto the
 * geometry.
 */
export function computeSkinWeights(
  geometry: THREE.BufferGeometry,
  rig: Rig,
  { falloff = 3.2, maxInfluences = 4 }: SkinOptions = {},
): void {
  const pos = geometry.getAttribute("position");
  const count = pos.count;

  // Each bone deforms the segment from ITSELF to its parent. A bone weighted by
  // distance to its origin alone influences a sphere at the joint and nothing
  // in between, which makes a neck fold rather than bend.
  const segments = rig.bones
    .map((bone, i) => {
      const a = rig.restWorld.get(bone.name)!;
      const parent = bone.parent as THREE.Bone | null;
      const b =
        parent && rig.restWorld.get(parent.name)
          ? rig.restWorld.get(parent.name)!
          : a;
      return { index: i, name: bone.name, a, b };
    })
    .filter((s) => s.name !== "root");

  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const v = new THREE.Vector3();
  const scored: { index: number; w: number }[] = [];

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i);
    scored.length = 0;
    for (const s of segments) {
      const d = distanceToSegment(v, s.a, s.b);
      scored.push({ index: s.index, w: 1 / Math.pow(d + 1e-4, falloff) });
    }
    scored.sort((p, q) => q.w - p.w);

    let total = 0;
    const n = Math.min(maxInfluences, scored.length);
    for (let k = 0; k < n; k++) total += scored[k].w;
    for (let k = 0; k < n; k++) {
      skinIndex[i * 4 + k] = scored[k].index;
      // Normalised so the four weights sum to 1. Unnormalised weights make the
      // mesh grow or shrink as it deforms rather than just bending.
      skinWeight[i * 4 + k] = total > 0 ? scored[k].w / total : 0;
    }
  }

  geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
}

export interface RiggedResult {
  mesh: THREE.SkinnedMesh;
  rig: Rig;
  skeleton: THREE.Skeleton;
}

/**
 * Turn the first Mesh found under `source` into a bound SkinnedMesh.
 */
export function rigMesh(
  source: THREE.Object3D,
  layout: BoneSpec[] = GOOSE_LAYOUT,
): RiggedResult {
  // A glTF mesh with several materials arrives as SEVERAL THREE.Mesh objects,
  // one per primitive. Rigging only the first silently drops the rest — on the
  // goose that meant binding the body and losing the beak, feet and eyes, which
  // looks like a shading bug rather than like most of the model being absent.
  const parts: THREE.Mesh[] = [];
  source.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) parts.push(m);
  });
  if (parts.length === 0)
    throw new Error("[auto-rig] no mesh found in the source object");

  const src = parts[0];
  // Merge with groups so each primitive keeps its own material slot.
  const cleaned = parts.map((m) => {
    const g2 = m.geometry.clone();
    g2.applyMatrix4(m.matrixWorld);
    // mergeGeometries requires identical attribute sets across inputs.
    for (const name of Object.keys(g2.attributes)) {
      if (!["position", "normal", "uv"].includes(name))
        g2.deleteAttribute(name);
    }
    if (!g2.getAttribute("uv")) {
      g2.setAttribute(
        "uv",
        new THREE.BufferAttribute(
          new Float32Array(g2.getAttribute("position").count * 2),
          2,
        ),
      );
    }
    return g2;
  });
  const merged =
    parts.length === 1 ? cleaned[0] : mergeGeometries(cleaned, true);
  if (!merged) throw new Error("[auto-rig] could not merge mesh primitives");
  const materials =
    parts.length === 1
      ? (src.material as THREE.Material)
      : parts.map((m) => m.material as THREE.Material);

  const geometry = merged;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!.clone();

  const rig = buildSkeleton(box, layout);
  computeSkinWeights(geometry, rig);

  const mesh = new THREE.SkinnedMesh(geometry, materials as THREE.Material);
  mesh.add(rig.root);
  // Skeleton derives each inverse bind matrix from bone.matrixWorld, so the
  // hierarchy has to be resolved BEFORE it is constructed. Skip this and the
  // model binds against identity and renders inside out.
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.bones);
  mesh.bind(skeleton);
  // A deforming mesh leaves the bounds computed from its rest pose, and three
  // culls against those — a raised wing can pop the whole goose out of view.
  mesh.frustumCulled = false;

  return { mesh, rig, skeleton };
}
