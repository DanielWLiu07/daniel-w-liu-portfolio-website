#!/usr/bin/env node
// Resumable character generation. Credentials and signed download URLs never
// enter public assets or command arguments; state stores only task IDs/status.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = resolve(root, 'blender-bridge/casino-dealer-v1')
mkdirSync(work, { recursive: true })
const statePath = resolve(work, 'meshy-state.json')
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
const key = (readFileSync(resolve(root, '.env.local'), 'utf8').match(/^MESHY_API_KEY=(.+)$/m)?.[1] ?? '').trim()
if (!key) throw new Error('MESHY_API_KEY is missing from .env.local')
const base = 'https://api.meshy.ai/openapi/v1/'
async function call(path, body) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new Error(`Meshy HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`)
  return res.json()
}
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
const [command] = process.argv.slice(2)
if (command === 'generate') {
  if (state.generation) throw new Error('Generation already submitted; use status/download instead of spending twice.')
  const image = readFileSync(resolve(work, 'dealer-reference.png'))
  const body = {
    image_url: `data:image/png;base64,${image.toString('base64')}`,
    model_type: 'smart-topology', ai_model: 'meshy-t2', target_polycount: 15000,
    should_texture: true, enable_pbr: false, pose_mode: 'a-pose', target_formats: ['glb'],
  }
  const task = await call('image-to-3d', body)
  state.generation = task.result
  state.settings = { ...body, image_url: 'dealer-reference.png' }
  state.submittedAt = new Date().toISOString()
  save()
  console.log(JSON.stringify({ task: state.generation, settings: state.settings }))
} else if (command === 'rig') {
  if (state.rig) throw new Error('Rig already submitted; use status/download instead of spending twice.')
  const result = await call('rigging', { input_task_id: state.generation, height_meters: 1.8 })
  state.rig = result.result
  save()
  console.log(JSON.stringify({ rig: state.rig }))
} else if (command === 'status' || command === 'download') {
  for (const [kind, api] of [['generation', 'image-to-3d'], ['rig', 'rigging']]) {
    if (!state[kind]) continue
    const task = await call(`${api}/${state[kind]}`)
    state[`${kind}Status`] = task.status
    save()
    console.log(JSON.stringify({ kind, id: state[kind], status: task.status, progress: task.progress, error: task.task_error }))
    if (command === 'download' && task.status === 'SUCCEEDED') {
      const url = kind === 'rig' ? task.result?.rigged_character_glb_url : task.model_urls?.glb
      if (!url) throw new Error(`No GLB output for ${kind}`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Asset download HTTP ${res.status}`)
      const out = resolve(work, kind === 'rig' ? 'meshy-rigged.glb' : 'meshy-source.glb')
      writeFileSync(out, Buffer.from(await res.arrayBuffer()))
      console.log(`Saved ${out}`)
      if (kind === 'generation' && task.thumbnail_url) {
        const thumb = await fetch(task.thumbnail_url)
        if (thumb.ok) writeFileSync(resolve(work, 'meshy-preview.png'), Buffer.from(await thumb.arrayBuffer()))
      }
    }
  }
} else throw new Error('Usage: node scripts/meshy-dealer.mjs generate|status|download|rig')
