'use client'

/**
 * The ship's material, built from EXPORTED IR rather than transcribed by hand.
 *
 * from-video.ir.json is the output of the library's tools/export_material_nodes.py
 * run on ~/Downloads/"hatching & manga shaders.blend", object Cube.010: 72 nodes
 * across four trees, three of them node groups. buildMaterialFromIR walks it and
 * emits the graph, so the port is a function of the .blend rather than of how
 * carefully I read it.
 *
 * The hand-written from-video-material.ts is kept alongside deliberately. It is
 * the thing this replaces, it is 300 lines to this file's 40, and it shipped
 * with three omissions that the IR path cannot make: a dropped Mapping rotation,
 * an implicit colour-to-float conversion swapped for a channel pick, and an
 * unconnected texture Vector left on the wrong default. Re-exporting the JSON is
 * now the whole update procedure when he changes the shader.
 */
import * as THREE from 'three'
import { buildMaterialFromIR, compileMaterial, type IRGraph, type SketchLight } from 'blender-to-threejs'
import ir from './from-video.ir.json'

export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

export function fromVideoIRMaterial(opts: {
  lights: readonly SketchLight[]
  worldAmbient: number
  /** the PART's own bounding box: Blender's Generated is per-object */
  bounds: Bounds
}): THREE.Material {
  const { node } = buildMaterialFromIR(ir as unknown as IRGraph, {
    lights: opts.lights,
    worldAmbient: opts.worldAmbient,
    generatedBounds: opts.bounds,
    // the geometry came through a glTF, so its axes are swapped relative to
    // Blender's and Generated has to be un-swapped to match
    space: 'gltf',
  })
  const m = compileMaterial(node)
  m.side = THREE.DoubleSide
  return m
}
