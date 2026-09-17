import { REVISION } from 'three'
import type { Renderer } from 'three/webgpu'

type Stage = 'fragment' | 'vertex' | 'compute'
type BuildStage = 'setup' | 'analyze' | 'generate'
type FlowNode = { isNode?: boolean; build: (builder: ShaderBuilder) => unknown }
export type ShaderBuilder = {
  context: { position?: FlowNode }
  flowNodes: Record<Stage, FlowNode[]>
  prebuild: () => void
  setBuildStage: (stage: BuildStage | null) => void
  setShaderStage: (stage: Stage | null) => void
  flowNodeFromShaderStage: (stage: Stage, node: FlowNode) => unknown
  flowNode: (node: FlowNode) => unknown
  buildCode: () => void
  buildUpdateNodes: () => void
  buildAsync: () => Promise<unknown>
}

/** Share the slice across materials so many tiny graphs cannot starve the UI. */
export function createShaderBuildBudget(now = () => performance.now(), yieldTask = yieldToMain) {
  let started = now()
  return async () => {
    if (now() - started < 4) return
    await yieldTask()
    started = now()
  }
}
function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield: () => Promise<void> } }).scheduler
  return scheduler?.yield ? scheduler.yield() : new Promise(resolve => requestAnimationFrame(() => resolve()))
}

/** r185's exact build order, with time-budgeted yields at its existing stage
 * boundaries. No node, shader code, binding, or GPU pipeline work is skipped.
 * Keep in sync with NodeBuilder.buildAsync when reviewing a Three upgrade.
 */
export async function buildWithBudget(builder: ShaderBuilder, checkpoint: () => Promise<void>) {
  builder.prebuild()
  for (const stage of ['setup', 'analyze', 'generate'] as const) {
    builder.setBuildStage(stage)
    if (builder.context.position?.isNode) builder.flowNodeFromShaderStage('vertex', builder.context.position)
    for (const shader of ['fragment', 'vertex', 'compute'] as const) {
      builder.setShaderStage(shader)
      for (const node of builder.flowNodes[shader]) {
        if (stage === 'generate') builder.flowNode(node)
        else node.build(builder)
      }
      await checkpoint()
    }
  }
  builder.setBuildStage(null)
  builder.setShaderStage(null)
  builder.buildCode()
  builder.buildUpdateNodes()
  await checkpoint()
  return builder
}

const installed = new WeakSet<object>()
/** Install before the shader-name adapter, so its post-build hook still runs. */
export function installBudgetedShaderBuild(renderer: Renderer) {
  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean; createNodeBuilder: (...args: unknown[]) => ShaderBuilder }
  if (REVISION !== '185' || !backend.isWebGPUBackend || installed.has(backend)) return
  const create = backend.createNodeBuilder
  const checkpoint = createShaderBuildBudget()
  backend.createNodeBuilder = function(...args) {
    const builder = create.apply(this, args)
    builder.buildAsync = function() { return buildWithBudget(this, checkpoint) }
    return builder
  }
  installed.add(backend)
}
