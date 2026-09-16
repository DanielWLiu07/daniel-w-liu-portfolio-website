import { REVISION } from 'three'
import type { Renderer } from 'three/webgpu'

/** r185 embeds global node IDs in unnamed buffer identifiers. Binding addresses,
 * not variable names, select the actual data. Canonicalize ONLY those generated
 * identifiers: no layout, type, array length, arithmetic or bind group changes.
 */
export function canonicalBufferNames(source: string): string {
  if (!source.includes('NodeBuffer_') || source.includes('casinoSharedBuffer_')) return source
  const names = new Map<string, string>()
  const declarations = /@binding\(\s*(\d+)\s*\)\s*@group\(\s*(\d+)\s*\)\s*var<[^>]+>\s+(NodeBuffer_\d+)\s*:/g
  for (const match of source.matchAll(declarations)) {
    names.set(match[3], `casinoSharedBuffer_g${match[2]}_b${match[1]}`)
  }
  return source.replace(/\b(NodeBuffer_\d+)(Struct)?\b/g, (whole, name: string, suffix: string | undefined) => {
    const stable = names.get(name)
    return stable ? stable + (suffix ?? '') : whole
  })
}

type Builder = {
  vertexShader: string | null
  fragmentShader: string | null
  computeShader: string | null
  build: () => unknown
  buildAsync: () => Promise<unknown>
}
type Backend = {
  isWebGPUBackend?: boolean
  createNodeBuilder: (...args: unknown[]) => Builder
}

export function shareBuilderBuffers<T extends Builder>(builder: T): T {
  const finish = () => {
    for (const stage of ['vertexShader', 'fragmentShader', 'computeShader'] as const) {
      const source = builder[stage]
      if (source) builder[stage] = canonicalBufferNames(source)
    }
  }
  const build = builder.build, buildAsync = builder.buildAsync
  builder.build = function() { const result = build.call(this); finish(); return result }
  builder.buildAsync = async function() { const result = await buildAsync.call(this); finish(); return result }
  return builder
}

const installed = new WeakSet<object>()
/** Renderer-scoped, before shader-source caching; never patches global Three or
 * GPU methods. Other Three revisions/backends retain the ordinary code path.
 */
export function installSharedBufferShaders(renderer: Renderer): void {
  const backend = renderer.backend as unknown as Backend
  if (REVISION !== '185' || !backend.isWebGPUBackend || installed.has(backend)) return
  const create = backend.createNodeBuilder
  backend.createNodeBuilder = function(...args) { return shareBuilderBuffers(create.apply(this, args)) }
  installed.add(backend)
}
