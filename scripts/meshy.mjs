#!/usr/bin/env node
/**
 * Drive the Meshy text-to-3D API from the command line.
 *
 *   node scripts/meshy.mjs preview  "low poly white goose ..."   # geometry only
 *   node scripts/meshy.mjs refine   <preview-task-id>            # adds texture
 *   node scripts/meshy.mjs status   <task-id>
 *   node scripts/meshy.mjs balance
 *
 * Two-stage on purpose. Preview is untextured geometry, which is the cheap way
 * to judge SHAPE — the thing most likely to be wrong. Only refine a preview you
 * actually want, or you pay to texture a mesh you are going to throw away.
 *
 * The key is read from .env.local and never printed, never passed as an argv,
 * and never written into a downloaded file's path. argv is visible to every
 * process on the machine; a file read is not.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const RIG_API = 'https://api.meshy.ai/openapi/v1/rigging';

function apiKey() {
  const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
  const key = (env.match(/^MESHY_API_KEY=(.+)$/m)?.[1] ?? '').trim();
  if (!key) {
    console.error('No MESHY_API_KEY in .env.local. Paste it after the "=" with no quotes.');
    process.exit(1);
  }
  return key;
}

async function call(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) {
    // Surface the API's own message — its validation errors name the offending
    // field, which beats guessing at the schema.
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function poll(id) {
  let last = -1;
  for (;;) {
    const task = await call(`${API}/${id}`);
    if (task.progress !== last) {
      process.stdout.write(`\r  ${task.status.padEnd(12)} ${String(task.progress ?? 0).padStart(3)}%   `);
      last = task.progress;
    }
    if (task.status === 'SUCCEEDED') {
      process.stdout.write('\n');
      return task;
    }
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(`task ${task.status}: ${JSON.stringify(task.task_error ?? {})}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function download(task, name) {
  const url = task.model_urls?.glb;
  if (!url) throw new Error(`no glb in model_urls: ${JSON.stringify(task.model_urls ?? {})}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const out = resolve(ROOT, 'public/models', name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(`  saved ${out}  (${(bytes.length / 1e6).toFixed(2)} MB)`);
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'balance') {
  const res = await fetch('https://api.meshy.ai/openapi/v1/balance', {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  console.log(await res.text());
} else if (cmd === 'preview') {
  // Optional --out <name> so several variants can be generated and compared
  // side by side rather than overwriting each other.
  let name = 'goose-preview';
  const args = [...rest];
  const flag = args.indexOf('--out');
  if (flag !== -1) {
    name = args[flag + 1];
    args.splice(flag, 2);
  }
  const prompt = args.join(' ');
  if (!prompt) throw new Error('usage: meshy.mjs preview [--out <name>] "<prompt>"');
  console.log('submitting preview…');
  const { result: id } = await call(API, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'preview',
      prompt,
      // Quads, because this mesh is going to be RIGGED. Triangle soup from an
      // implicit-surface extraction has no edge loops to bend around, and no
      // amount of weight painting rescues a neck without loops.
      topology: 'quad',
      target_polycount: 8000,
      // A goose is bilaterally symmetric; forcing it costs nothing and stops
      // one wing coming out subtly different from the other.
      symmetry_mode: 'on',
      should_remesh: true,
    }),
  });
  console.log(`  task ${id}`);
  const task = await poll(id);
  await download(task, `${name}.glb`);
  console.log(`\nshape look right? then:  node scripts/meshy.mjs refine ${id}`);
} else if (cmd === 'refine') {
  const [id] = rest;
  if (!id) throw new Error('usage: meshy.mjs refine <preview-task-id>');
  console.log('submitting refine…');
  const { result: refineId } = await call(API, {
    method: 'POST',
    body: JSON.stringify({ mode: 'refine', preview_task_id: id }),
  });
  console.log(`  task ${refineId}`);
  const task = await poll(refineId);
  await download(task, 'goose.glb');
} else if (cmd === 'rig') {
  // Meshy's docs say rigging "only works well with standard humanoid (bipedal)
  // assets". A goose is bipedal but not humanoid, so this is an experiment, not
  // a plan — worth one attempt because the empirical answer beats the hedge,
  // but budget for doing the rig in Blender regardless.
  const [id] = rest;
  if (!id) throw new Error('usage: meshy.mjs rig <textured-task-id>');
  console.log('submitting rig…');
  const { result: rigId } = await call(RIG_API, {
    method: 'POST',
    body: JSON.stringify({ input_task_id: id, height_meters: 0.8 }),
  });
  console.log(`  task ${rigId}`);

  let last = -1;
  for (;;) {
    const task = await call(`${RIG_API}/${rigId}`);
    if (task.progress !== last) {
      process.stdout.write(`\r  ${String(task.status).padEnd(12)} ${String(task.progress ?? 0).padStart(3)}%   `);
      last = task.progress;
    }
    if (task.status === 'SUCCEEDED') {
      process.stdout.write('\n');
      const url = task.result?.rigged_character_glb_url;
      if (!url) throw new Error(`no rigged glb: ${JSON.stringify(task.result ?? {}).slice(0, 400)}`);
      await download({ model_urls: { glb: url } }, 'goose-rigged.glb');
      const anims = task.result?.basic_animations ?? {};
      for (const [k, v] of Object.entries(anims)) {
        if (typeof v === 'string' && v.startsWith('http')) {
          await download({ model_urls: { glb: v } }, `goose-${k.replace(/_glb_url$/, '')}.glb`);
        }
      }
      break;
    }
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(`rig ${task.status}: ${JSON.stringify(task.task_error ?? {})}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
} else if (cmd === 'status') {
  console.log(JSON.stringify(await call(`${API}/${rest[0]}`), null, 2).slice(0, 2000));
} else {
  console.log('usage: meshy.mjs balance | preview "<prompt>" | refine <id> | status <id>');
}
