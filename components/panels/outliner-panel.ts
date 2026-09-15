"use client";

/**
 * Blender's Outliner, pointed at whatever scene the page is rendering.
 *
 * Generic — it takes a `THREE.Scene` and nothing else — so any 3D page here can
 * register it without knowing what a goose is. That is the difference between
 * this and the run panel: one is a view of the engine, the other is a view of
 * one scene's meaning.
 */
import type { Object3D } from "three";

import {
  findById,
  outline,
  type PanelSchema,
  type TreeNode,
} from "blender-to-threejs";

export const OUTLINER_PANEL: PanelSchema = {
  id: "outliner",
  title: "outliner",
  width: 380,
  height: 640,
  controls: [
    { kind: "tree", key: "scene", label: "scene" },
    { kind: "section", label: "" },
    { kind: "readout", key: "objects", label: "objects", precision: 0 },
    { kind: "readout", key: "tris", label: "triangles", precision: 0 },
    { kind: "readout", key: "hidden", label: "hidden", precision: 0 },
    { kind: "button", key: "refresh", label: "rescan the scene" },
    { kind: "button", key: "showAll", label: "show everything" },
  ],
};

/**
 * Editor helpers should not appear as scene content.
 *
 * The transform gizmo, the compositor's overlay objects and three's own helpers
 * are all children of the scene root and would otherwise sit at the top of the
 * outliner, above the things you are actually looking for.
 */
function isHelper(o: Object3D): boolean {
  if (o.userData?.compOverlay) return true;
  return /Helper$|^TransformControls/.test(o.type) || o.name.startsWith("__");
}

export function outlinerTrees(
  scene: Object3D | null,
): Record<string, readonly TreeNode[]> {
  if (!scene) return { scene: [] };
  return {
    scene: outline(scene, {
      // Bones collapsed: this rig is twenty of them against five meshes, and
      // expanding by default buries everything worth seeing.
      collapse: ["Bone"],
      hide: isHelper,
    }),
  };
}

/** Totals for the readouts. Walks once rather than once per number. */
export function outlinerCounts(scene: Object3D | null): Record<string, number> {
  if (!scene) return { objects: 0, tris: 0, hidden: 0 };
  let objects = 0;
  let tris = 0;
  let hidden = 0;
  scene.traverse((o) => {
    if (isHelper(o)) return;
    objects++;
    if (!o.visible) hidden++;
    const g = (
      o as {
        geometry?: {
          index?: { count: number };
          attributes?: { position?: { count: number } };
        };
      }
    ).geometry;
    if (g) {
      tris += g.index
        ? g.index.count / 3
        : (g.attributes?.position?.count ?? 0) / 3;
    }
  });
  return { objects, tris: Math.round(tris), hidden };
}

/**
 * Apply a click from the panel.
 *
 * `visible` present means the eye icon was used. A plain click logs the object
 * — which sounds thin, but `window.__sel` in the scene window's console is how
 * you get from "that row" to poking at the actual object, and it is what
 * Blender's outliner selection is FOR.
 */
export function outlinerSelect(
  scene: Object3D | null,
  node: string,
  visible?: boolean,
): void {
  if (!scene) return;
  const target = findById(scene, node);
  if (!target) return;
  if (visible === undefined) {
    (window as unknown as Record<string, unknown>).__sel = target;
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[outliner] ${target.name || target.type} — also at window.__sel`,
        target,
      );
    }
    return;
  }
  target.visible = visible;
}

/** Un-hide everything, for when a hidden object has been lost. */
export function outlinerShowAll(scene: Object3D | null): void {
  scene?.traverse((o) => {
    if (!isHelper(o)) o.visible = true;
  });
}
