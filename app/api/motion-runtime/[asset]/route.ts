import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'
const files = new Set(['vision_bundle.js', 'vision_wasm_internal.js', 'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'])

/** Serve the pinned, installed runtime; camera frames never reach this route. */
export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params
  if (!files.has(asset)) return new Response('Not found', { status: 404 })
  const root = join(process.cwd(), 'node_modules', '@mediapipe', 'tasks-vision')
  const data = await readFile(join(root, asset === 'vision_bundle.js' ? asset : `wasm/${asset}`))
  return new Response(new Uint8Array(data), { headers: {
    'Content-Type': asset.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
    'Cache-Control': 'public, max-age=3600',
  } })
}
